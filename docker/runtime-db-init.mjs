import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageCache = new Map();
const BASELINE_TABLES = [
  "users",
  "plans",
  "documents",
  "ai_model_routes",
  "prompt_versions",
];

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

function getMigrationDir(mode) {
  return path.resolve(repoRoot, mode === "postgres" ? "pg_migrations" : "migrations");
}

function listMigrationFiles(mode) {
  return fs
    .readdirSync(getMigrationDir(mode))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
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

  async transaction(fn) {
    this.db.exec("BEGIN");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Ignore rollback failures when SQLite has already aborted the transaction.
      }
      throw error;
    }
  }

  async close() {
    this.db.close();
  }
}

class PostgresRuntime {
  constructor(client) {
    const postgres = getPackage("postgres");
    this.client = client ?? postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      ...(process.env.DATABASE_SCHEMA ? { options: `-c search_path=${process.env.DATABASE_SCHEMA}` } : {}),
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

  async transaction(fn) {
    return this.client.begin(async (tx) => fn(new PostgresRuntime(tx)));
  }

  async close() {
    await this.client.end();
  }
}

async function runMigration(tx, migrationFile) {
  const sql = fs.readFileSync(migrationFile, "utf8");
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await tx.exec(statement);
  }
}

async function ensureMigrationHistory(runtime, mode) {
  if (mode === "postgres") {
    await runtime.exec(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id BIGSERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    return;
  }

  await runtime.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function isMigrationApplied(runtime, mode, migrationName) {
  const row =
    mode === "postgres"
      ? await runtime.get("SELECT id FROM migration_history WHERE migration_name = $1 LIMIT 1", [migrationName])
      : await runtime.get("SELECT id FROM migration_history WHERE migration_name = ? LIMIT 1", [migrationName]);
  return Boolean(row);
}

async function markMigrationApplied(runtime, mode, migrationName) {
  if (mode === "postgres") {
    await runtime.run("INSERT INTO migration_history (migration_name) VALUES ($1)", [migrationName]);
    return;
  }

  await runtime.run("INSERT INTO migration_history (migration_name) VALUES (?)", [migrationName]);
}

async function countExistingBaselineTables(runtime, mode) {
  let count = 0;

  for (const tableName of BASELINE_TABLES) {
    const row =
      mode === "postgres"
        ? await runtime.get(
            `SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = current_schema()
                AND table_name = $1
            ) AS exists`,
            [tableName],
          )
        : await runtime.get(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS table_exists",
            [tableName],
          );

    if (mode === "postgres" ? row?.exists : row?.table_exists) {
      count += 1;
    }
  }

  return count;
}

async function runPendingMigrations(runtime, mode) {
  const migrationDir = getMigrationDir(mode);
  const migrationFiles = listMigrationFiles(mode);
  const executed = [];
  const adoptedExisting = [];

  await ensureMigrationHistory(runtime, mode);
  const baselineTableCount = await countExistingBaselineTables(runtime, mode);

  for (const fileName of migrationFiles) {
    if (await isMigrationApplied(runtime, mode, fileName)) {
      continue;
    }

    if (fileName.startsWith("000_") && baselineTableCount >= 3) {
      await markMigrationApplied(runtime, mode, fileName);
      adoptedExisting.push(fileName);
      continue;
    }

    await runtime.transaction(async (tx) => {
      await runMigration(tx, path.join(migrationDir, fileName));
      await markMigrationApplied(tx, mode, fileName);
    });
    executed.push(fileName);
  }

  return { executed, adoptedExisting };
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
  const password = process.env.DEFAULT_OPS_PASSWORD || "REDACTED_ADMIN_PASSWORD";
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
        ["huozi", "ops@huoziwriter.local", passwordHash, "Huozi Ops", null, "ops", "ultra", false, true],
      );
      userId = inserted?.id;
    } else {
      const inserted = await runtime.run(
        `INSERT INTO users (
          username, email, password_hash, display_name, referral_code, role, plan_code, must_change_password, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ["huozi", "ops@huoziwriter.local", passwordHash, "Huozi Ops", null, "ops", "ultra", 0, 1, new Date().toISOString(), new Date().toISOString()],
      );
      userId = Number(inserted.lastInsertRowid);
    }
    console.log("runtime-db-init: created default ops user huozi");
  } else {
    if (mode === "postgres") {
      await runtime.run(
        `UPDATE users
         SET role = $1, plan_code = $2, must_change_password = $3, is_active = $4, updated_at = NOW()
         WHERE id = $5`,
        ["ops", "ultra", false, true, userId],
      );
    } else {
      await runtime.run(
        `UPDATE users
         SET role = ?, plan_code = ?, must_change_password = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
        ["ops", "ultra", 0, 1, new Date().toISOString(), userId],
      );
    }
    console.log("runtime-db-init: default ops user already exists");
  }

  const referralCode = buildReferralCode(Number(userId), "huozi");
  if (mode === "postgres") {
    await runtime.run("UPDATE users SET referral_code = $1, updated_at = NOW() WHERE id = $2", [referralCode, userId]);
    const activeSubscription = await runtime.get(
      "SELECT id FROM subscriptions WHERE user_id = $1 AND plan_code = $2 AND status = $3 ORDER BY id DESC LIMIT 1",
      [userId, "ultra", "active"],
    );
    if (!activeSubscription) {
      await runtime.run(
        `INSERT INTO subscriptions (user_id, plan_code, status, start_at, source, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW())`,
        [userId, "ultra", "active", "manual"],
      );
    }
    return;
  }

  await runtime.run("UPDATE users SET referral_code = ?, updated_at = ? WHERE id = ?", [referralCode, new Date().toISOString(), userId]);
  const activeSubscription = await runtime.get(
    "SELECT id FROM subscriptions WHERE user_id = ? AND plan_code = ? AND status = ? ORDER BY id DESC LIMIT 1",
    [userId, "ultra", "active"],
  );
  if (!activeSubscription) {
    await runtime.run(
      `INSERT INTO subscriptions (user_id, plan_code, status, start_at, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, "ultra", "active", new Date().toISOString(), "manual", new Date().toISOString(), new Date().toISOString()],
    );
  }
}

async function main() {
  const mode = detectDatabaseMode();
  const runtime = mode === "postgres" ? new PostgresRuntime() : new SQLiteRuntime();

  try {
    const migrationResult = await runPendingMigrations(runtime, mode);
    if (migrationResult.adoptedExisting.length > 0) {
      console.log(`runtime-db-init: adopted existing baseline schema for ${migrationResult.adoptedExisting.join(", ")}`);
    }
    if (migrationResult.executed.length > 0) {
      console.log(`runtime-db-init: applied migrations ${migrationResult.executed.join(", ")}`);
    }
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
