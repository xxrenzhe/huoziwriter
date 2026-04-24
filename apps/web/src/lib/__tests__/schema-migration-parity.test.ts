import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import {
  dropColumnIfNeeded,
  dropTableIfNeeded,
  ensureColumn,
  execAll,
  hasColumn,
  hasTable,
  renameColumnIfNeeded,
  renameTableIfNeeded,
  replaceTextInColumn,
} from "../schema-bootstrap-db-utils";
import { applyLegacySchemaCompat } from "../schema-bootstrap-legacy";
import { ensureExtendedProductSchema } from "../schema-bootstrap";

const sqliteBaselineMigrationPath = path.resolve(process.cwd(), "apps/web/src/lib/migrations/000_init_schema.sqlite.sql");

async function withDatabasePath<T>(databasePath: string, run: () => Promise<T>) {
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_PATH = databasePath;
  delete process.env.DATABASE_URL;
  await closeDatabase();

  try {
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    if (previousDatabaseUrl == null) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

type SchemaSnapshot = Array<{
  table: string;
  columns: Array<{ name: string; type: string; notnull: number; defaultValue: string | null; pk: number }>;
  indexes: Array<{ name: string; unique: number; columns: string[] }>;
  foreignKeys: Array<{ table: string; from: string; to: string; onUpdate: string; onDelete: string }>;
}>;

function splitSqlStatements(sql: string) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && statement !== "BEGIN" && statement !== "BEGIN TRANSACTION" && statement !== "COMMIT");
}

async function captureSchemaSnapshot(): Promise<SchemaSnapshot> {
  const db = getDatabase();
  const tables = await db.query<{ name: string }>(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%'
       AND name <> 'schema_migrations'
     ORDER BY name ASC`,
  );

  const snapshot: SchemaSnapshot = [];
  for (const table of tables) {
    const tableName = String(table.name || "").trim();
    const columns = await db.query<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>(`PRAGMA table_info(${tableName})`);
    const indexRows = await db.query<{
      name: string;
      unique: number;
      origin: string;
    }>(`PRAGMA index_list(${tableName})`);
    const indexes = [];
    for (const indexRow of indexRows) {
      const indexName = String(indexRow.name || "").trim();
      if (!indexName || indexName.startsWith("sqlite_autoindex_")) {
        continue;
      }
      const indexColumns = await db.query<{ name: string }>(`PRAGMA index_info(${indexName})`);
      indexes.push({
        name: indexName,
        unique: Number(indexRow.unique || 0),
        columns: indexColumns.map((item) => String(item.name || "").trim()),
      });
    }
    const foreignKeyRows = await db.query<{
      table: string;
      from: string;
      to: string;
      on_update: string;
      on_delete: string;
    }>(`PRAGMA foreign_key_list(${tableName})`);

    snapshot.push({
      table: tableName,
      columns: columns.map((column) => ({
        name: String(column.name || "").trim(),
        type: String(column.type || "").trim(),
        notnull: Number(column.notnull || 0),
        defaultValue: column.dflt_value == null ? null : String(column.dflt_value),
        pk: Number(column.pk || 0),
      })),
      indexes: indexes.sort((left, right) => left.name.localeCompare(right.name)),
      foreignKeys: foreignKeyRows.map((item) => ({
        table: String(item.table || "").trim(),
        from: String(item.from || "").trim(),
        to: String(item.to || "").trim(),
        onUpdate: String(item.on_update || "").trim(),
        onDelete: String(item.on_delete || "").trim(),
      })),
    });
  }

  return snapshot;
}

async function bootstrapLegacyOnlySchema() {
  const baselineSql = fs.readFileSync(sqliteBaselineMigrationPath, "utf8");
  await execAll(splitSqlStatements(baselineSql));
  await applyLegacySchemaCompat({
    execAll,
    ensureColumn,
    renameColumnIfNeeded,
    renameTableIfNeeded,
    dropTableIfNeeded,
    dropColumnIfNeeded,
    hasTable,
    hasColumn,
    replaceTextInColumn,
  });
}

test("migration bootstrap matches legacy bootstrap schema on an empty sqlite database", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-schema-parity-"));
  const legacyDbPath = path.join(tempDir, "legacy.db");
  const migratedDbPath = path.join(tempDir, "migrated.db");

  try {
    const legacySnapshot = await withDatabasePath(legacyDbPath, async () => {
      await bootstrapLegacyOnlySchema();
      return await captureSchemaSnapshot();
    });

    const migratedSnapshot = await withDatabasePath(migratedDbPath, async () => {
      await ensureExtendedProductSchema();
      return await captureSchemaSnapshot();
    });

    assert.deepEqual(migratedSnapshot, legacySnapshot);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
