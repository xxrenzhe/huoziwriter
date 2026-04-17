#!/usr/bin/env tsx
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, getDatabase } from "../apps/web/src/lib/db";
import type { DatabaseType } from "@huoziwriter/db";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const BASELINE_TABLES = [
  "users",
  "plans",
  "articles",
  "ai_model_routes",
  "prompt_versions",
];

function getDatabaseType(): DatabaseType {
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

function getMigrationDir(type: DatabaseType) {
  return path.resolve(repoRoot, type === "postgres" ? "pg_migrations" : "migrations");
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

async function ensureMigrationHistoryTable(type: DatabaseType) {
  const db = getDatabase();
  if (type === "postgres") {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id BIGSERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    return;
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS migration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function isMigrationApplied(migrationName: string) {
  const db = getDatabase();
  const row = await db.queryOne<{ id: number }>(
    "SELECT id FROM migration_history WHERE migration_name = ? LIMIT 1",
    [migrationName],
  );
  return Boolean(row);
}

async function markMigrationApplied(migrationName: string) {
  const db = getDatabase();
  await db.exec("INSERT INTO migration_history (migration_name) VALUES (?)", [migrationName]);
}

async function countExistingBaselineTables(type: DatabaseType) {
  const db = getDatabase();
  let count = 0;

  for (const tableName of BASELINE_TABLES) {
    const row =
      type === "postgres"
        ? await db.queryOne<{ exists: boolean }>(
            `SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = current_schema()
                AND table_name = ?
            ) AS exists`,
            [tableName],
          )
        : await db.queryOne<{ exists: number }>(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS table_exists",
            [tableName],
          );

    if ((type === "postgres" ? row?.exists : (row as { table_exists?: number } | undefined)?.table_exists)) {
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
  const migrationDir = getMigrationDir(type);
  const files = listMigrationFiles(type);
  const executed: string[] = [];
  const adoptedExisting: string[] = [];

  await ensureMigrationHistoryTable(type);

  const baselineTableCount = await countExistingBaselineTables(type);

  for (const fileName of files) {
    if (await isMigrationApplied(fileName)) {
      continue;
    }

    const isBaseline = fileName.startsWith("000_");
    if (isBaseline && baselineTableCount >= 3) {
      await markMigrationApplied(fileName);
      adoptedExisting.push(fileName);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationDir, fileName), "utf8");
    const statements = splitSqlStatements(sql);

    await db.transaction(async () => {
      for (const statement of statements) {
        await db.exec(statement);
      }
      await markMigrationApplied(fileName);
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
