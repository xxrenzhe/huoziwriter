import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageCache = new Map();

function loadPackage(name) {
  const candidates = [
    repoRoot,
    path.resolve(repoRoot, "apps/web"),
    process.cwd(),
    path.resolve(process.cwd(), "apps/web"),
    "/app",
    "/app/apps/web",
  ];

  for (const base of candidates) {
    try {
      const packagePath = require.resolve(name, { paths: [base] });
      return require(packagePath);
    } catch {
      continue;
    }
  }

  throw new Error(`Cannot resolve runtime package: ${name}`);
}

function getPackage(name) {
  if (!packageCache.has(name)) {
    packageCache.set(name, loadPackage(name));
  }
  return packageCache.get(name);
}

function splitSqlStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && statement !== "BEGIN" && statement !== "BEGIN TRANSACTION" && statement !== "COMMIT");
}

function detectDatabaseMode() {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

function resolveSqlitePath() {
  return path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/huoziwriter.db");
}

function buildReferralCode(userId, username) {
  const slug = username
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "USER";
  return `HZ-${slug}-${userId}`;
}

class SQLiteRuntime {
  constructor() {
    const BetterSqlite3 = getPackage("better-sqlite3");
    const dbPath = resolveSqlitePath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
  }

  async run(sql, params = []) {
    return this.db.prepare(sql).run(...params);
  }

  async get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  async close() {
    this.db.close();
  }
}

class PostgresRuntime {
  constructor() {
    const postgres = getPackage("postgres");
    this.client = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
    });
  }

  async run(sql, params = []) {
    return this.client.unsafe(sql, params);
  }

  async get(sql, params = []) {
    const rows = await this.client.unsafe(sql, params);
    return rows[0];
  }

  async exec(sql) {
    await this.client.unsafe(sql);
  }

  async close() {
    await this.client.end();
  }
}

async function runMigration(runtime, migrationFile) {
  const sql = fs.readFileSync(migrationFile, "utf8");
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await runtime.exec(statement);
  }
}

async function normalizeBootstrapData(runtime, mode) {
  if (mode === "postgres") {
    await runtime.run("DELETE FROM ai_model_routes WHERE scene_code = $1", ["coverImage"]);
    await runtime.run(
      `UPDATE ai_model_routes
       SET primary_model = $1, fallback_model = $2, description = $3, updated_at = NOW()
       WHERE scene_code = $4 AND (primary_model = $5 OR fallback_model = $6)`,
      ["gemini-3.0-flash-lite", "gemini-3.0-flash", "碎片提纯与原子事实抽取", "fragmentDistill", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
    );
    return;
  }

  await runtime.run("DELETE FROM ai_model_routes WHERE scene_code = ?", ["coverImage"]);
  await runtime.run(
    `UPDATE ai_model_routes
     SET primary_model = ?, fallback_model = ?, description = ?, updated_at = ?
     WHERE scene_code = ? AND (primary_model = ? OR fallback_model = ?)`,
    ["gemini-3.0-flash-lite", "gemini-3.0-flash", "碎片提纯与原子事实抽取", new Date().toISOString(), "fragmentDistill", "gemini-2.5-flash-lite", "gemini-2.5-flash"],
  );
}

async function ensureDefaultAdmin(runtime, mode) {
  const bcrypt = getPackage("bcryptjs");
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "REDACTED_ADMIN_PASSWORD";
  const passwordHash = await bcrypt.hash(password, 10);

  const existing =
    mode === "postgres"
      ? await runtime.get("SELECT id FROM users WHERE username = $1", ["huozi"])
      : await runtime.get("SELECT id FROM users WHERE username = ?", ["huozi"]);

  let userId = existing?.id;

  if (!userId) {
    if (mode === "postgres") {
      const inserted = await runtime.get(
        `INSERT INTO users (
          username, email, password_hash, display_name, referral_code, role, plan_code, must_change_password, is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        RETURNING id`,
        ["huozi", "admin@huoziwriter.local", passwordHash, "Huozi Admin", null, "admin", "team", false, true],
      );
      userId = inserted?.id;
    } else {
      const inserted = await runtime.run(
        `INSERT INTO users (
          username, email, password_hash, display_name, referral_code, role, plan_code, must_change_password, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["huozi", "admin@huoziwriter.local", passwordHash, "Huozi Admin", null, "admin", "team", 0, 1, new Date().toISOString(), new Date().toISOString()],
      );
      userId = Number(inserted.lastInsertRowid);
    }
    console.log("runtime-db-init: created default admin huozi");
  } else {
    if (mode === "postgres") {
      await runtime.run(
        `UPDATE users
         SET role = $1, plan_code = $2, must_change_password = $3, is_active = $4, updated_at = NOW()
         WHERE id = $5`,
        ["admin", "team", false, true, userId],
      );
    } else {
      await runtime.run(
        `UPDATE users
         SET role = ?, plan_code = ?, must_change_password = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
        ["admin", "team", 0, 1, new Date().toISOString(), userId],
      );
    }
    console.log("runtime-db-init: default admin already exists");
  }

  const referralCode = buildReferralCode(Number(userId), "huozi");
  if (mode === "postgres") {
    await runtime.run("UPDATE users SET referral_code = $1, updated_at = NOW() WHERE id = $2", [referralCode, userId]);
    const activeSubscription = await runtime.get(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND plan_code = $2 AND status = $3 ORDER BY id DESC LIMIT 1",
      [userId, "team", "active"],
    );
    if (!activeSubscription) {
      await runtime.run(
        `INSERT INTO subscriptions (user_id, plan_code, status, start_at, source, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW())`,
        [userId, "team", "active", "manual"],
      );
    }
    return;
  }

  await runtime.run("UPDATE users SET referral_code = ?, updated_at = ? WHERE id = ?", [referralCode, new Date().toISOString(), userId]);
  const activeSubscription = await runtime.get(
    "SELECT id FROM subscriptions WHERE user_id = ? AND plan_code = ? AND status = ? ORDER BY id DESC LIMIT 1",
    [userId, "team", "active"],
  );
  if (!activeSubscription) {
    await runtime.run(
      `INSERT INTO subscriptions (user_id, plan_code, status, start_at, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, "team", "active", new Date().toISOString(), "manual", new Date().toISOString(), new Date().toISOString()],
    );
  }
}

async function main() {
  const mode = detectDatabaseMode();
  const runtime = mode === "postgres" ? new PostgresRuntime() : new SQLiteRuntime();
  const migrationFile = mode === "postgres"
    ? path.resolve(repoRoot, "pg_migrations/000_init_schema.postgresql.sql")
    : path.resolve(repoRoot, "migrations/000_init_schema.sqlite.sql");

  try {
    await runMigration(runtime, migrationFile);
    await normalizeBootstrapData(runtime, mode);
    await ensureDefaultAdmin(runtime, mode);
    console.log(`runtime-db-init: completed for ${mode}`);
  } finally {
    await runtime.close();
  }
}

main().catch((error) => {
  console.error("runtime-db-init: failed", error);
  process.exit(1);
});
