import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import {
  cancelArticleAutomationRun,
  createArticleAutomationRun,
  getArticleAutomationRunById,
  getArticleAutomationRunsByUser,
  resetArticleAutomationRunFromStage,
  updateArticleAutomationRun,
  updateArticleAutomationStageRun,
} from "../article-automation-runs";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "../plan22-prompt-catalog";
import { createSeries } from "../series";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-automation-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
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
    if (previousDatabaseUrl == null) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function createTestUser() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO users (
      username, email, password_hash, display_name, role, plan_code, must_change_password, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["automation-user", null, "test-hash", "Automation User", "admin", "ultra", false, true, now, now],
  );
  return Number(result.lastInsertRowid);
}

async function createDefaultSeries(userId: number) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const personaResult = await db.exec(
    `INSERT INTO personas (
      user_id, name, identity_tags_json, writing_style_tags_json, summary,
      domain_keywords_json, argument_preferences_json, tone_constraints_json,
      audience_hints_json, source_mode, is_default, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      "自动化测试作者",
      JSON.stringify(["深度写作"]),
      JSON.stringify(["克制", "清晰"]),
      "用于自动化运行测试的真实人设记录",
      JSON.stringify(["AI", "公众号"]),
      JSON.stringify(["先判断后论证"]),
      JSON.stringify(["不夸张"]),
      JSON.stringify(["内容创作者"]),
      "manual",
      true,
      now,
      now,
    ],
  );
  return await createSeries({
    userId,
    name: "自动化测试系列",
    personaId: Number(personaResult.lastInsertRowid),
    thesis: "用真实证据写清楚 AI 自动化生产线",
    targetAudience: "持续写公众号的内容创作者",
  });
}

test("createArticleAutomationRun creates article and queued plan22 stage runs", async () => {
  await withTempDatabase("create-run", async () => {
    const userId = await createTestUser();
    const series = await createDefaultSeries(userId);
    const result = await createArticleAutomationRun({
      userId,
      inputMode: "brief",
      inputText: "AI 写公众号全流程如何自动化",
      targetSeriesId: series.id,
      automationLevel: "draftPreview",
    });

    assert.equal(result.run.userId, userId);
    assert.equal(result.run.inputMode, "brief");
    assert.equal(result.run.status, "queued");
    assert.deepEqual(result.run.generationSettings, {
      preferredCreativeLensCode: null,
      referenceFusionMode: null,
    });
    assert.equal(result.run.currentStageCode, "topicAnalysis");
    assert.ok(result.run.articleId);
    assert.equal(result.stages.length, PLAN22_STAGE_PROMPT_DEFINITIONS.length);
    assert.deepEqual(
      result.stages.map((stage) => stage.stageCode),
      PLAN22_STAGE_PROMPT_DEFINITIONS.map((definition) => definition.stageCode),
    );
    assert.equal(result.stages[0]?.promptId, "topic_analysis");
    assert.equal(result.stages[0]?.sceneCode, "topicAnalysis");
    assert.deepEqual(result.stages[0]?.inputJson, {
      requiredOutputFields: ["theme", "coreAssertion", "whyNow", "readerBenefit", "risk"],
      generationSettings: {
        preferredCreativeLensCode: null,
        referenceFusionMode: null,
      },
    });

    const fetched = await getArticleAutomationRunById(result.run.id, userId);
    assert.equal(fetched?.article?.id, result.run.articleId);
    assert.equal(fetched?.stages.length, PLAN22_STAGE_PROMPT_DEFINITIONS.length);

    const runs = await getArticleAutomationRunsByUser(userId);
    assert.equal(runs[0]?.id, result.run.id);
  });
});

test("createArticleAutomationRun persists generation settings", async () => {
  await withTempDatabase("generation-settings", async () => {
    const userId = await createTestUser();
    const series = await createDefaultSeries(userId);
    const result = await createArticleAutomationRun({
      userId,
      inputMode: "url",
      inputText: "https://example.com/report",
      sourceUrl: "https://example.com/report",
      targetSeriesId: series.id,
      automationLevel: "draftPreview",
      generationSettings: {
        preferredCreativeLensCode: "field_observation",
        referenceFusionMode: "structure",
      },
    });

    assert.equal(result.run.generationSettings.preferredCreativeLensCode, "field_observation");
    assert.equal(result.run.generationSettings.referenceFusionMode, "structure");
    assert.deepEqual((result.stages[0]?.inputJson as Record<string, unknown>).generationSettings, {
      preferredCreativeLensCode: "field_observation",
      referenceFusionMode: "structure",
    });

    const fetched = await getArticleAutomationRunById(result.run.id, userId);
    assert.equal(fetched?.run.generationSettings.preferredCreativeLensCode, "field_observation");
    assert.equal(fetched?.run.generationSettings.referenceFusionMode, "structure");
  });
});

test("cancelArticleAutomationRun marks queued runs as cancelled", async () => {
  await withTempDatabase("cancel-run", async () => {
    const userId = await createTestUser();
    const result = await createArticleAutomationRun({
      userId,
      inputMode: "url",
      inputText: "https://example.com/report",
      sourceUrl: "https://example.com/report",
      automationLevel: "strategyOnly",
    });

    assert.equal(result.run.articleId, null);
    const cancelled = await cancelArticleAutomationRun(result.run.id, userId);
    assert.equal(cancelled?.run.status, "cancelled");
    assert.equal(cancelled?.run.blockedReason, null);
  });
});

test("resetArticleAutomationRunFromStage clears selected and downstream stages", async () => {
  await withTempDatabase("reset-stage", async () => {
    const userId = await createTestUser();
    const series = await createDefaultSeries(userId);
    const created = await createArticleAutomationRun({
      userId,
      inputMode: "brief",
      inputText: "自动化写作链路如何支持阶段重跑",
      targetSeriesId: series.id,
      automationLevel: "draftPreview",
    });

    await updateArticleAutomationRun({
      runId: created.run.id,
      userId,
      status: "blocked",
      currentStageCode: "factCheck",
      blockedReason: "事实核查发现高风险断言",
      finalWechatMediaId: "media-id-1",
    });
    await updateArticleAutomationStageRun({
      runId: created.run.id,
      userId,
      stageCode: "outlinePlanning",
      status: "completed",
      provider: "openai",
      model: "gpt-5.4",
      outputJson: { sections: [{ heading: "A" }] },
      qualityJson: { score: 92 },
      searchTraceJson: { used: 2 },
      startedAt: "2026-04-25T10:00:00.000Z",
      completedAt: "2026-04-25T10:01:00.000Z",
    });
    await updateArticleAutomationStageRun({
      runId: created.run.id,
      userId,
      stageCode: "factCheck",
      status: "blocked",
      provider: "anthropic",
      model: "claude",
      outputJson: { highRiskClaims: ["断言 A"] },
      qualityJson: { overallRisk: "high" },
      searchTraceJson: { sources: 3 },
      errorCode: "needs_evidence",
      errorMessage: "缺少官方来源",
      startedAt: "2026-04-25T10:02:00.000Z",
      completedAt: "2026-04-25T10:03:00.000Z",
    });
    await updateArticleAutomationStageRun({
      runId: created.run.id,
      userId,
      stageCode: "publishGuard",
      status: "completed",
      outputJson: { canPublish: true },
      qualityJson: { blockers: 0 },
      startedAt: "2026-04-25T10:04:00.000Z",
      completedAt: "2026-04-25T10:05:00.000Z",
    });

    const reset = await resetArticleAutomationRunFromStage({
      runId: created.run.id,
      userId,
      stageCode: "factCheck",
    });

    assert.equal(reset?.run.status, "queued");
    assert.equal(reset?.run.currentStageCode, "factCheck");
    assert.equal(reset?.run.blockedReason, null);
    assert.equal(reset?.run.finalWechatMediaId, null);

    const outlineStage = reset?.stages.find((stage) => stage.stageCode === "outlinePlanning");
    assert.equal(outlineStage?.status, "completed");
    assert.equal((outlineStage?.outputJson as { sections?: unknown[] }).sections?.length, 1);

    const factCheckStage = reset?.stages.find((stage) => stage.stageCode === "factCheck");
    assert.equal(factCheckStage?.status, "queued");
    assert.equal(factCheckStage?.provider, null);
    assert.equal(factCheckStage?.model, null);
    assert.deepEqual(factCheckStage?.outputJson, {});
    assert.deepEqual(factCheckStage?.qualityJson, {});
    assert.deepEqual(factCheckStage?.searchTraceJson, {});
    assert.equal(factCheckStage?.errorCode, null);
    assert.equal(factCheckStage?.errorMessage, null);
    assert.equal(factCheckStage?.startedAt, null);
    assert.equal(factCheckStage?.completedAt, null);

    const publishGuardStage = reset?.stages.find((stage) => stage.stageCode === "publishGuard");
    assert.equal(publishGuardStage?.status, "queued");
    assert.deepEqual(publishGuardStage?.inputJson, {
      requiredOutputFields: ["canPublish", "blockers", "warnings", "repairActions"],
    });
    assert.deepEqual(publishGuardStage?.outputJson, {});
  });
});
