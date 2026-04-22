import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { ensureExtendedProductSchema } from "../schema-bootstrap";

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

async function hasUsersTable() {
  const row = await getDatabase().queryOne<{ table_exists: number }>(
    "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS table_exists",
    ["users"],
  );
  return Boolean(row?.table_exists);
}

test("ensureExtendedProductSchema re-runs for a different database path", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-schema-bootstrap-cache-"));
  const firstDbPath = path.join(tempDir, "first.db");
  const secondDbPath = path.join(tempDir, "second.db");

  try {
    await withDatabasePath(firstDbPath, async () => {
      await ensureExtendedProductSchema();
      assert.equal(await hasUsersTable(), true);
    });

    await withDatabasePath(secondDbPath, async () => {
      await ensureExtendedProductSchema();
      assert.equal(await hasUsersTable(), true);
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
