import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

const sqliteMigrationDir = path.resolve(process.cwd(), "apps/web/src/lib/migrations");

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-db-migrations-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
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
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("runPendingMigrations records applied versions in schema_migrations", async () => {
  await withTempDatabase("schema-table", async () => {
    const firstRun = await runPendingMigrations();
    const db = getDatabase();
    const rows = await db.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    );

    assert.ok(firstRun.executed.length > 0);
    assert.deepEqual(rows.map((row) => row.version), firstRun.files);

    const secondRun = await runPendingMigrations();
    const afterSecondRun = await db.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM schema_migrations",
    );

    assert.deepEqual(secondRun.executed, []);
    assert.equal(afterSecondRun[0]?.count, firstRun.files.length);
  });
});

test("runPendingMigrations records empty sqlite migrations in schema_migrations", async () => {
  const fileName = `999_test_noop_${Date.now().toString(36)}.sqlite.sql`;
  const migrationPath = path.join(sqliteMigrationDir, fileName);
  fs.writeFileSync(migrationPath, "-- noop migration\n");

  try {
    await withTempDatabase("noop-migration", async () => {
      const firstRun = await runPendingMigrations();
      assert.equal(firstRun.executed.includes(fileName), true);

      const db = getDatabase();
      const row = await db.queryOne<{ version: string }>(
        "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1",
        [fileName],
      );
      assert.equal(row?.version, fileName);

      const secondRun = await runPendingMigrations();
      assert.deepEqual(secondRun.executed, []);
    });
  } finally {
    fs.rmSync(migrationPath, { force: true });
  }
});
