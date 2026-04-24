import fs from "node:fs";
import path from "node:path";
import { closeDatabase, getDatabase } from "./db";

type DatabaseType = "sqlite" | "postgres";

const MIGRATION_DIR_CANDIDATES: Record<DatabaseType, string[]> = {
  sqlite: [
    path.join("apps", "web", "src", "lib", "migrations"),
    "migrations",
  ],
  postgres: [
    path.join("apps", "web", "src", "lib", "pg_migrations"),
    "pg_migrations",
  ],
};

const BASELINE_TABLES = [
  "users",
  "plans",
  "articles",
  "ai_model_routes",
  "prompt_versions",
];

function findRepoRoot(startDir: string) {
  let current = path.resolve(startDir);
  while (true) {
    if (Object.values(MIGRATION_DIR_CANDIDATES).flat().some((dir) => fs.existsSync(path.join(current, dir)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function resolveRepoRoot() {
  return findRepoRoot(process.cwd()) ?? process.cwd();
}

function getDatabaseType(): DatabaseType {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

function getMigrationDir(type: DatabaseType) {
  const repoRoot = resolveRepoRoot();
  for (const relativeDir of MIGRATION_DIR_CANDIDATES[type]) {
    const resolvedDir = path.resolve(repoRoot, relativeDir);
    if (fs.existsSync(resolvedDir)) {
      return resolvedDir;
    }
  }
  throw new Error(`Migration directory not found for ${type}`);
}

function splitSqlStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && statement !== "BEGIN" && statement !== "BEGIN TRANSACTION" && statement !== "COMMIT");
}

async function hasTable(type: DatabaseType, tableName: string) {
  const db = getDatabase();
  if (type === "postgres") {
    const row = await db.queryOne<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ?
      ) AS exists`,
      [tableName],
    );
    return Boolean(row?.exists);
  }

  const row = await db.queryOne<{ table_exists: number }>(
    "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS table_exists",
    [tableName],
  );
  return Boolean(row?.table_exists);
}

async function ensureSchemaMigrationsTable(type: DatabaseType) {
  const db = getDatabase();
  if (type === "postgres") {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    return;
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function backfillLegacyMigrationHistory(type: DatabaseType) {
  if (!(await hasTable(type, "migration_history"))) {
    return;
  }
  const db = getDatabase();
  const rows = await db.query<{ version: string }>(
    "SELECT migration_name AS version FROM migration_history ORDER BY applied_at ASC, id ASC",
  );
  for (const row of rows) {
    const version = String(row.version || "").trim();
    if (!version) continue;
    await db.exec(
      type === "postgres"
        ? "INSERT INTO schema_migrations (version) VALUES (?) ON CONFLICT (version) DO NOTHING"
        : "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
      [version],
    );
  }
}

async function isMigrationApplied(version: string) {
  const db = getDatabase();
  const row = await db.queryOne<{ version: string }>(
    "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1",
    [version],
  );
  return Boolean(row);
}

async function markMigrationApplied(type: DatabaseType, version: string) {
  const db = getDatabase();
  await db.exec(
    type === "postgres"
      ? "INSERT INTO schema_migrations (version) VALUES (?) ON CONFLICT (version) DO NOTHING"
      : "INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)",
    [version],
  );
}

async function countExistingBaselineTables(type: DatabaseType) {
  let count = 0;

  for (const tableName of BASELINE_TABLES) {
    if (await hasTable(type, tableName)) {
      count += 1;
    }
  }

  return count;
}

function listMigrationFiles(type: DatabaseType) {
  return fs
    .readdirSync(getMigrationDir(type))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

export async function runPendingMigrations() {
  const type = getDatabaseType();
  const db = getDatabase();
  const files = listMigrationFiles(type);
  const executed: string[] = [];
  const adoptedExisting: string[] = [];

  await ensureSchemaMigrationsTable(type);
  await backfillLegacyMigrationHistory(type);

  const baselineTableCount = await countExistingBaselineTables(type);

  for (const fileName of files) {
    if (await isMigrationApplied(fileName)) {
      continue;
    }

    const isBaseline = fileName.startsWith("000_");
    if (isBaseline && baselineTableCount >= 3) {
      await markMigrationApplied(type, fileName);
      adoptedExisting.push(fileName);
      continue;
    }

    const sql = fs.readFileSync(path.join(getMigrationDir(type), fileName), "utf8");
    const statements = splitSqlStatements(sql);

    await db.transaction(async () => {
      for (const statement of statements) {
        await db.exec(statement);
      }
      await markMigrationApplied(type, fileName);
      executed.push(fileName);
    }).catch((error) => {
      throw new Error(`Failed to apply migration ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  return {
    type,
    files,
    executed,
    adoptedExisting,
  };
}

export async function closeDbFlowDatabase() {
  await closeDatabase();
}
