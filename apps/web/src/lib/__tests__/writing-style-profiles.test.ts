import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import {
  appendWritingStyleProfileUsageEvent,
  createPendingWritingStyleProfileStreamUsage,
  resolvePendingWritingStyleProfileStreamUsage,
} from "../writing-style-profiles";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-writing-style-profiles-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  await closeDatabase();

  try {
    await runPendingMigrations();
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

async function listUsageAuditRows() {
  const db = getDatabase();
  return db.query<{
    action: string;
    target_id: string | null;
    payload_json: string | Record<string, unknown> | null;
  }>(
    `SELECT action, target_id, payload_json
     FROM audit_logs
     WHERE target_type = ?
     ORDER BY id ASC`,
    ["writing_style_profile"],
  );
}

async function seedUserForTest(userId: number) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO users (
      id, username, email, password_hash, display_name, role, plan_code, must_change_password, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      `style_test_user_${userId}`,
      null,
      null,
      null,
      "user",
      "ultra",
      0,
      1,
      now,
      now,
    ],
  );
}

function parsePayload(value: string | Record<string, unknown> | null) {
  if (!value) {
    return null;
  }
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

test("resolvePendingWritingStyleProfileStreamUsage returns matching pending profile snapshot", async () => {
  await withTempDatabase("resolve-matching", async () => {
    await seedUserForTest(7);
    await createPendingWritingStyleProfileStreamUsage({
      userId: 7,
      profileId: 301,
      articleId: 901,
      usageToken: "stream-token-a",
      profileName: "状态驱动文风",
      sampleCount: 3,
    });

    const resolved = await resolvePendingWritingStyleProfileStreamUsage({
      userId: 7,
      articleId: 901,
      usageToken: "  stream-token-a  ",
    });

    assert.deepEqual(resolved && {
      profileId: resolved.profileId,
      articleId: resolved.articleId,
      usageSource: resolved.usageSource,
      profileName: resolved.profileName,
      sampleCount: resolved.sampleCount,
      usageToken: resolved.usageToken,
    }, {
      profileId: 301,
      articleId: 901,
      usageSource: "article.generate.stream",
      profileName: "状态驱动文风",
      sampleCount: 3,
      usageToken: "stream-token-a",
    });
  });
});

test("resolvePendingWritingStyleProfileStreamUsage requires article match and ignores mismatched rows", async () => {
  await withTempDatabase("article-match", async () => {
    await seedUserForTest(8);
    await createPendingWritingStyleProfileStreamUsage({
      userId: 8,
      profileId: 401,
      articleId: 910,
      usageToken: "stream-token-b",
      profileName: "旧文章文风",
      sampleCount: 2,
    });
    await createPendingWritingStyleProfileStreamUsage({
      userId: 8,
      profileId: 402,
      articleId: 911,
      usageToken: "stream-token-c",
      profileName: "目标文章文风",
      sampleCount: 4,
    });

    const mismatched = await resolvePendingWritingStyleProfileStreamUsage({
      userId: 8,
      articleId: 911,
      usageToken: "stream-token-b",
    });
    assert.equal(mismatched, null);

    const matched = await resolvePendingWritingStyleProfileStreamUsage({
      userId: 8,
      articleId: 911,
      usageToken: "stream-token-c",
    });
    assert.equal(matched?.profileId, 402);
    assert.equal(matched?.articleId, 911);
    assert.equal(matched?.profileName, "目标文章文风");
    assert.equal(matched?.sampleCount, 4);
  });
});

test("resolvePendingWritingStyleProfileStreamUsage returns null after token has been consumed", async () => {
  await withTempDatabase("consumed-token", async () => {
    await seedUserForTest(9);
    await createPendingWritingStyleProfileStreamUsage({
      userId: 9,
      profileId: 501,
      articleId: 920,
      usageToken: "stream-token-d",
      profileName: "消费前文风",
      sampleCount: 5,
    });

    await appendWritingStyleProfileUsageEvent({
      userId: 9,
      profileId: 501,
      articleId: 920,
      usageSource: "article.generate.stream",
      profileName: "消费前文风",
      sampleCount: 5,
      usageToken: "stream-token-d",
    });

    const resolved = await resolvePendingWritingStyleProfileStreamUsage({
      userId: 9,
      articleId: 920,
      usageToken: "stream-token-d",
    });
    assert.equal(resolved, null);

    const rows = await listUsageAuditRows();
    assert.equal(rows.length, 2);
    const usedRow = rows.find((row) => row.action === "writing_style_profile_used_in_authoring");
    const usedPayload = parsePayload(usedRow?.payload_json ?? null);
    assert.equal(usedRow?.target_id, "501");
    assert.equal(usedPayload?.usageToken, "stream-token-d");
    assert.equal(usedPayload?.usageSource, "article.generate.stream");
  });
});
