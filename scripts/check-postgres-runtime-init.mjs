import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
const postgres = requireFromWeb("postgres");
const defaultAdminConfig = { role: "admin", planCode: "ultra" };

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
       WHERE username = $1
       LIMIT 1`,
      ["huozi"],
    );
    if (!user || user.role !== defaultAdminConfig.role || user.plan_code !== defaultAdminConfig.planCode) {
      throw new Error("postgres admin bootstrap verification failed");
    }

    const [migration] = await client.unsafe(
      `SELECT version
       FROM ${escapedIdentifier(schema)}.schema_migrations
       ORDER BY applied_at ASC, version ASC
       LIMIT 1`,
    );
    if (!migration?.version) {
      throw new Error("postgres schema migrations verification failed");
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
