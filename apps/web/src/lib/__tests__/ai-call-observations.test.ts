import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getAiCallObservationsDashboard, recordAiCallObservation } from "../ai-call-observations";
import { closeDatabase } from "../db";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-ai-call-observations-${name}-`));
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

test("ai call observations dashboard aggregates by scene and model", async () => {
  await withTempDatabase("dashboard", async () => {
    await recordAiCallObservation({
      sceneCode: "outlinePlan",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1200,
      outputTokens: 320,
      cacheCreationTokens: 400,
      cacheReadTokens: 800,
      latencyMs: 920,
      status: "retried",
    });
    await recordAiCallObservation({
      sceneCode: "outlinePlan",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 900,
      outputTokens: 260,
      cacheCreationTokens: 0,
      cacheReadTokens: 600,
      latencyMs: 640,
      status: "success",
    });
    await recordAiCallObservation({
      sceneCode: "factCheck",
      model: "gpt-5.4-mini",
      provider: "openai",
      callMode: "shadow",
      inputTokens: 500,
      outputTokens: 120,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      latencyMs: 410,
      status: "failed",
      errorClass: "429",
    });

    const dashboard = await getAiCallObservationsDashboard(10);
    const outlinePlan = dashboard.byScene.find((item) => item.label === "outlinePlan");
    const factCheck = dashboard.byScene.find((item) => item.label === "factCheck");
    const anthropicModel = dashboard.byModel.find((item) => item.label === "claude-sonnet-4-6");
    const openaiShadow = dashboard.byModel.find((item) => item.label === "gpt-5.4-mini" && item.callMode === "shadow");

    assert.equal(dashboard.summary.callCount, 3);
    assert.equal(dashboard.summary.failedCount, 1);
    assert.equal(dashboard.summary.retriedCount, 1);
    assert.equal(dashboard.recentCalls.length, 3);

    assert.equal(outlinePlan?.callCount, 2);
    assert.equal(outlinePlan?.retriedCount, 1);
    assert.equal(outlinePlan?.failedCount, 0);
    assert.equal(outlinePlan?.cacheHitRate != null && outlinePlan.cacheHitRate > 0, true);

    assert.equal(factCheck?.callCount, 1);
    assert.equal(factCheck?.failedCount, 1);
    assert.equal(factCheck?.failureRate, 1);

    assert.equal(anthropicModel?.provider, "anthropic");
    assert.equal(anthropicModel?.callCount, 2);
    assert.equal(openaiShadow?.provider, "openai");
    assert.equal(openaiShadow?.callCount, 1);
    assert.equal(dashboard.recentCalls[0]?.callMode, "shadow");
    assert.equal(dashboard.recentCalls[0]?.sceneCode, "factCheck");
    assert.equal(dashboard.recentCalls[0]?.errorClass, "429");
  });
});
