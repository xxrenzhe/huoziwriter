import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import { createFragment, updateFragmentReferenceFusion } from "../repositories";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-fragment-meta-${name}-`));
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

test("createFragment stores source localization metadata in fragment_sources raw payload", async () => {
  await withTempDatabase("source-meta", async () => {
    const db = getDatabase();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "source-meta@example.com", "test-hash", "admin", new Date().toISOString(), new Date().toISOString()],
    );
    const fragment = await createFragment({
      userId: 1,
      sourceType: "url",
      title: "如何建立不受地域限制的职业收入系统",
      rawContent: "How to build a location-independent career...",
      distilledContent: "这篇材料强调，远程工作和自由职业的价值，不只是多赚一份钱，而是获得收入与地点的双重选择权。",
      sourceUrl: "https://example.com/remote-income",
      sourceMeta: {
        localization: {
          sourceLanguage: "en",
          localizationStatus: "localized",
          originalTitle: "How to build a location-independent career",
        },
      },
    });
    const row = await db.queryOne<{ raw_payload_json: string }>(
      "SELECT raw_payload_json FROM fragment_sources WHERE fragment_id = ?",
      [fragment?.id],
    );
    assert.ok(row?.raw_payload_json);
    const payload = JSON.parse(row!.raw_payload_json) as Record<string, unknown>;
    assert.equal((payload.sourceMeta as Record<string, unknown>)?.localization ? true : false, true);
    assert.equal(
      (((payload.sourceMeta as Record<string, unknown>).localization as Record<string, unknown>).originalTitle),
      "How to build a location-independent career",
    );
  });
});

test("updateFragmentReferenceFusion persists material-level reference mode", async () => {
  await withTempDatabase("reference-fusion", async () => {
    const db = getDatabase();
    await db.exec(
      "INSERT INTO users (id, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "reference-fusion@example.com", "test-hash", "admin", new Date().toISOString(), new Date().toISOString()],
    );
    const fragment = await createFragment({
      userId: 1,
      sourceType: "url",
      title: "一篇增长案例拆解",
      rawContent: "原文按问题、动作、结果推进。",
      distilledContent: "这条素材适合提炼结构张力，但正文不能复刻原文路径。",
      sourceUrl: "https://example.com/growth-case",
    });

    await updateFragmentReferenceFusion({
      userId: 1,
      fragmentId: Number(fragment?.id),
      mode: "structure",
    });

    const row = await db.queryOne<{ raw_payload_json: string }>(
      "SELECT raw_payload_json FROM fragment_sources WHERE fragment_id = ? ORDER BY id DESC LIMIT 1",
      [fragment?.id],
    );
    assert.ok(row?.raw_payload_json);
    const payload = JSON.parse(row!.raw_payload_json) as Record<string, unknown>;
    const sourceMeta = payload.sourceMeta as Record<string, unknown>;
    const referenceFusion = sourceMeta.referenceFusion as Record<string, unknown>;
    assert.equal(sourceMeta.referenceFusionMode, "structure");
    assert.equal(referenceFusion.mode, "structure");
    assert.deepEqual(referenceFusion.sourceUrls, ["https://example.com/growth-case"]);
    assert.ok(Array.isArray(referenceFusion.avoidanceList));
  });
});
