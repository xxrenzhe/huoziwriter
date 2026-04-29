import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { createTopicBacklog, createTopicBacklogItem, updateTopicBacklogItem } from "../topic-backlogs";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-topic-backlog-hotspot-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

test("topic backlog items persist chinese hotspot source metadata", async () => {
  await withTempDatabase("persist", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "hotspot-meta@example.com", "test-hash", "admin", now, now],
    );
    const backlog = await createTopicBacklog({
      userId: 1,
      name: "热点选题",
    });
    const item = await createTopicBacklogItem({
      userId: 1,
      backlogId: backlog.id,
      sourceType: "hotspot",
      theme: "AI 搜索投放突然升温",
      sourceMeta: {
        provider: "baidu",
        providerLabel: "百度热点",
        rank: 3,
        capturedAt: "2026-04-29T08:00:00.000Z",
      },
    });

    assert.equal(item.sourceType, "hotspot");
    assert.equal(item.sourceMeta?.provider, "baidu");
    assert.equal(item.sourceMeta?.rank, 3);

    const updated = await updateTopicBacklogItem({
      userId: 1,
      backlogId: backlog.id,
      itemId: item.id,
      sourceMeta: {
        provider: "zhihu",
        providerLabel: "知乎热榜",
        rank: 5,
      },
    });
    assert.equal(updated.sourceMeta?.provider, "zhihu");
    assert.equal(updated.sourceMeta?.rank, 5);
  });
});
