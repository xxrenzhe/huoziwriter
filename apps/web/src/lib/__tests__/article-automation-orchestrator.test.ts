import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resumeArticleAutomationRun } from "../article-automation-orchestrator";
import { closeDatabase, getDatabase } from "../db";
import { createPersona } from "../personas";
import { createArticleAutomationRun, getArticleAutomationRunById } from "../article-automation-runs";
import { getArticleStrategyCard } from "../repositories";
import { createSeries } from "../series";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-automation-orchestrator-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const previousGeminiApiKey = process.env.GEMINI_API_KEY;
  const previousSearchEndpoint = process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT;

  process.env.DATABASE_PATH = tempDbPath;
  delete process.env.DATABASE_URL;
  process.env.OPENAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.GEMINI_API_KEY = "";
  delete process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousDatabasePath;
    if (previousDatabaseUrl == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousOpenAiApiKey == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    if (previousAnthropicApiKey == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicApiKey;
    if (previousGeminiApiKey == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiApiKey;
    if (previousSearchEndpoint == null) delete process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT;
    else process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT = previousSearchEndpoint;
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
    ["automation-orchestrator", null, "test-hash", "Automation Orchestrator", "admin", "ultra", false, true, now, now],
  );
  return Number(result.lastInsertRowid);
}

async function createDefaultSeries(userId: number) {
  const persona = await createPersona({
    userId,
    name: "自动化编排测试作者",
    identityTags: ["AI 产品经理"],
    writingStyleTags: ["案例拆解"],
    summary: "用于 plan22 orchestrator 测试的人设",
    domainKeywords: ["AI", "公众号"],
    argumentPreferences: ["先判断后论证"],
    toneConstraints: ["克制"],
    audienceHints: ["内容创作者"],
    sourceMode: "manual",
    isDefault: true,
  });
  return await createSeries({
    userId,
    name: "自动化编排测试系列",
    personaId: persona.id,
    thesis: "把自动化生产线跑成真实可验的闭环。",
    targetAudience: "持续写公众号的内容团队",
  });
}

test("resumeArticleAutomationRun completes strategyOnly runs and skips later stages", async () => {
  await withTempDatabase("strategy-only", async () => {
    const userId = await createTestUser();
    const series = await createDefaultSeries(userId);
    const created = await createArticleAutomationRun({
      userId,
      inputMode: "brief",
      inputText: "AI 自动文章生产线为什么要把搜索、核查和发布编排成一条流水线",
      targetSeriesId: series.id,
      automationLevel: "strategyOnly",
    });

    const result = await resumeArticleAutomationRun({
      runId: created.run.id,
      userId,
    });

    assert.equal(result.run.status, "completed");
    assert.ok(result.run.articleId);
    const detail = await getArticleAutomationRunById(created.run.id, userId);
    assert.equal(detail?.stages.find((item) => item.stageCode === "topicAnalysis")?.status, "completed");
    assert.equal(detail?.stages.find((item) => item.stageCode === "outlinePlanning")?.status, "completed");
    assert.equal(detail?.stages.find((item) => item.stageCode === "titleOptimization")?.status, "completed");
    assert.equal(detail?.stages.find((item) => item.stageCode === "openingOptimization")?.status, "completed");
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "titleOptimization")?.qualityJson)?.reusedFromOutlinePlanning, true);
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "openingOptimization")?.qualityJson)?.reusedFromOutlinePlanning, true);
    assert.equal(detail?.stages.find((item) => item.stageCode === "deepWrite")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "publishGuard")?.status, "skipped");
  });
});

test("resumeArticleAutomationRun completes draftPreview runs end-to-end", async () => {
  await withTempDatabase("draft-preview", async () => {
    const userId = await createTestUser();
    const series = await createDefaultSeries(userId);
    const created = await createArticleAutomationRun({
      userId,
      inputMode: "brief",
      inputText: "为什么内容团队需要一个能自动研究、自动核查、自动润色的 AI 写作代理",
      targetSeriesId: series.id,
      automationLevel: "draftPreview",
    });

    const result = await resumeArticleAutomationRun({
      runId: created.run.id,
      userId,
    });

    assert.equal(result.run.status, "completed");
    assert.ok(result.run.articleId);
    const detail = await getArticleAutomationRunById(created.run.id, userId);
    assert.equal(detail?.stages.find((item) => item.stageCode === "articleWrite")?.status, "completed");
    assert.equal(detail?.stages.find((item) => item.stageCode === "titleOptimization")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "openingOptimization")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "deepWrite")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "languageGuardAudit")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "coverImageBrief")?.status, "skipped");
    assert.equal(detail?.stages.find((item) => item.stageCode === "publishGuard")?.status, "completed");
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "audienceAnalysis")?.qualityJson)?.fastLocalStrategy, true);
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "outlinePlanning")?.qualityJson)?.outlineOptionRefreshSkipped, true);
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "articleWrite")?.qualityJson)?.applyAuditSkipped, true);
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "factCheck")?.qualityJson)?.fastLocalReview, true);
    assert.equal(getRecord(detail?.stages.find((item) => item.stageCode === "prosePolish")?.qualityJson)?.fastLocalReview, true);
    assert.equal(typeof detail?.article?.markdown_content, "string");
    assert.ok((detail?.article?.markdown_content || "").length > 0);
    const strategyCard = await getArticleStrategyCard(detail?.run.articleId ?? 0, userId);
    assert.ok(strategyCard);
    assert.ok(String(strategyCard?.targetReader || "").trim().length > 0);
    assert.ok(String(strategyCard?.coreAssertion || "").trim().length > 0);
    assert.ok(String(strategyCard?.publishWindow || "").trim().length > 0);
    assert.ok(String(strategyCard?.endingAction || "").trim().length > 0);
    assert.ok(String(strategyCard?.firstHandObservation || "").trim().length > 0);
    const layoutHtml = String(getRecord(detail?.stages.find((item) => item.stageCode === "layoutApply")?.outputJson)?.html || "");
    assert.ok(layoutHtml.length > 0);
    assert.equal(layoutHtml, detail?.article?.html_content);
  });
});

test("resumeArticleAutomationRun continues past researchBrief when coverage is limited but not blocked", async () => {
  await withTempDatabase("draft-preview-research-gate", async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ results: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    const previousSearchEndpoint = process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT;
    process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT = `http://127.0.0.1:${port}/search`;

    try {
      const userId = await createTestUser();
      const series = await createDefaultSeries(userId);
      const created = await createArticleAutomationRun({
        userId,
        inputMode: "brief",
        inputText: "为什么 AI 内容工作流必须把研究充分性前置到正文生成之前",
        targetSeriesId: series.id,
        automationLevel: "draftPreview",
      });

      const result = await resumeArticleAutomationRun({
        runId: created.run.id,
        userId,
      });

      assert.equal(result.run.status, "completed");
      assert.equal(result.run.currentStageCode, "publishGuard");
      assert.equal(result.run.blockedReason, null);
      const detail = await getArticleAutomationRunById(created.run.id, userId);
      assert.equal(detail?.stages.find((item) => item.stageCode === "researchBrief")?.status, "completed");
      assert.equal(detail?.stages.find((item) => item.stageCode === "audienceAnalysis")?.status, "completed");
      assert.equal(detail?.stages.find((item) => item.stageCode === "articleWrite")?.status, "completed");
      assert.equal(detail?.stages.find((item) => item.stageCode === "languageGuardAudit")?.status, "skipped");
      assert.equal(detail?.stages.find((item) => item.stageCode === "publishGuard")?.status, "completed");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      if (previousSearchEndpoint == null) delete process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT;
      else process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT = previousSearchEndpoint;
    }
  });
});

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
