import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  getAiCallObservationsDashboard,
  getPromptCacheAcceptanceReport,
  rebuildAiCallObservationRollups,
  recordAiCallObservation,
} from "../ai-call-observations";
import { closeDatabase, getDatabase } from "../db";
import { ensureExtendedProductSchema } from "../schema-bootstrap";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-ai-call-observations-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  await closeDatabase();

  try {
    await runPendingMigrations();
    await ensureExtendedProductSchema();
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
      articleId: 101,
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
      articleId: 101,
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
    assert.equal(dashboard.recentCalls[1]?.articleId, 101);
  });
});

test("prompt cache acceptance report summarizes repeated deepWrite by article", async () => {
  await withTempDatabase("prompt-cache-acceptance", async () => {
    await recordAiCallObservation({
      sceneCode: "outlinePlan",
      articleId: 2001,
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1200,
      outputTokens: 300,
      cacheCreationTokens: 600,
      cacheReadTokens: 0,
      latencyMs: 800,
      status: "success",
    });
    await recordAiCallObservation({
      sceneCode: "deepWrite",
      articleId: 2001,
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1400,
      outputTokens: 700,
      cacheCreationTokens: 1200,
      cacheReadTokens: 1200,
      latencyMs: 920,
      status: "success",
    });
    await recordAiCallObservation({
      sceneCode: "deepWrite",
      articleId: 2001,
      model: "claude-sonnet-4-6",
      provider: "anthropic",
      inputTokens: 1400,
      outputTokens: 760,
      cacheCreationTokens: 0,
      cacheReadTokens: 8400,
      latencyMs: 640,
      status: "success",
    });

    const report = await getPromptCacheAcceptanceReport(5);

    assert.equal(report.deepWriteRepeat.status, "passed");
    assert.equal(report.deepWriteRepeat.repeatedArticleCount, 1);
    assert.equal(report.deepWriteRepeat.passedArticleCount, 1);
    assert.equal(report.deepWriteRepeat.bestArticleId, 2001);
    assert.equal(report.deepWriteRepeat.bestCacheReadTokens, 8400);
    assert.equal(report.articleCoverage.articleCount, 1);
    assert.equal(report.articleCoverage.items[0]?.secondDeepWriteCacheReadTokens, 8400);
  });
});

test("ai call observations dashboard keeps aggregate panels without rescanning base table", async () => {
  await withTempDatabase("dashboard-rollups", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();

    await db.transaction(async () => {
      for (let index = 0; index < 12; index += 1) {
        await db.exec(
          `INSERT INTO ai_call_observations (
            scene_code, model, provider, call_mode,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            latency_ms, status, error_class, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            index % 2 === 0 ? "outlinePlan" : "factCheck",
            index % 3 === 0 ? "claude-sonnet-4-6" : "gpt-5.4-mini",
            index % 3 === 0 ? "anthropic" : "openai",
            index % 4 === 0 ? "shadow" : "primary",
            1000 + index,
            200 + index,
            80,
            400,
            500 + index,
            index % 5 === 0 ? "failed" : "success",
            index % 5 === 0 ? "429" : null,
            now,
          ],
        );
      }
    });

    await rebuildAiCallObservationRollups();
    await db.exec("DELETE FROM ai_call_observations");

    const dashboard = await getAiCallObservationsDashboard(10);
    assert.equal(dashboard.summary.callCount, 12);
    assert.equal(dashboard.byScene.length >= 2, true);
    assert.equal(dashboard.byModel.length >= 2, true);
    assert.equal(dashboard.recentCalls.length, 0);
  });
});

test("ai call observations dashboard query stays under one second on large datasets", async () => {
  await withTempDatabase("dashboard-performance", async () => {
    const db = getDatabase();
    const now = new Date().toISOString();

    await db.transaction(async () => {
      for (let index = 0; index < 25000; index += 1) {
        await db.exec(
          `INSERT INTO ai_call_observations (
            scene_code, model, provider, call_mode,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            latency_ms, status, error_class, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            `scene-${index % 24}`,
            `model-${index % 9}`,
            index % 2 === 0 ? "anthropic" : "openai",
            index % 7 === 0 ? "shadow" : index % 5 === 0 ? "fallback" : "primary",
            1200 + (index % 200),
            300 + (index % 80),
            index % 4 === 0 ? 600 : 0,
            index % 3 === 0 ? 900 : 0,
            350 + (index % 500),
            index % 19 === 0 ? "failed" : index % 11 === 0 ? "retried" : "success",
            index % 19 === 0 ? "5xx" : null,
            now,
          ],
        );
      }
    });

    await rebuildAiCallObservationRollups();

    const startedAt = performance.now();
    const dashboard = await getAiCallObservationsDashboard(24);
    const elapsedMs = performance.now() - startedAt;

    assert.equal(dashboard.summary.callCount, 25000);
    assert.equal(dashboard.byScene.length, 24);
    assert.equal(dashboard.byModel.length > 0, true);
    assert.equal(elapsedMs < 1000, true);
  });
});
