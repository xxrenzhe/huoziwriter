import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const postgres = requireFromWeb("postgres");

function escapedIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    process.stdout.write("postgres runtime init smoke: skipped (no DATABASE_URL)\n");
    return;
  }

  const schema = `verify_${Date.now().toString(36)}`;
  const adminPassword = "Smoke#PgHuozi42";
  const client = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
  });

  try {
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS ${escapedIdentifier(schema)}`);
    execFileSync(
      "pnpm",
      ["db:init"],
      {
        env: {
          ...process.env,
          DATABASE_SCHEMA: schema,
          DEFAULT_ADMIN_PASSWORD: adminPassword,
        },
        stdio: "pipe",
      },
    );

    const [user] = await client.unsafe(
      `SELECT username, role, plan_code
       FROM ${escapedIdentifier(schema)}.users
       WHERE username = 'huozi'
       LIMIT 1`,
    );
    if (!user || user.role !== "admin" || user.plan_code !== "ultra") {
      throw new Error("postgres admin bootstrap verification failed");
    }

    const [migration] = await client.unsafe(
      `SELECT migration_name
       FROM ${escapedIdentifier(schema)}.migration_history
       ORDER BY id ASC
       LIMIT 1`,
    );
    if (!migration?.migration_name) {
      throw new Error("postgres migration history verification failed");
    }

    process.stdout.write("postgres runtime init smoke: ok\n");
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS ${escapedIdentifier(schema)} CASCADE`);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
