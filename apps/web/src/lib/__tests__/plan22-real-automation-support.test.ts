import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMarkdownReport,
  classifyProviderFailure,
  getScenarioAcceptanceIssues,
  sanitizeDiagnosticText,
  type AcceptanceReport,
  type ScenarioReport,
} from "../../../../../scripts/plan22-real-automation-support";

test("sanitizeDiagnosticText redacts base64 data URLs", () => {
  const redacted = sanitizeDiagnosticText("ok data:image/png;base64,abcdefghijklmnopqrstuvwxyz0123456789 done");

  assert.equal(redacted, "ok data:image/png;base64,<omitted length=36> done");
  assert.doesNotMatch(redacted, /abcdefghijklmnopqrstuvwxyz/);
});

test("classifyProviderFailure returns quota-specific user guidance", () => {
  const failure = classifyProviderFailure("429 今日订阅额度已用光，请明天再试");

  assert.equal(failure.failureKind, "provider_quota_exhausted");
  assert.match(failure.userMessage, /额度已用尽/);
  assert.match(failure.operatorAction, /OPENAI_API_KEY/);
});

test("classifyProviderFailure treats insufficient balance as quota exhaustion", () => {
  const failure = classifyProviderFailure("Insufficient account balance");

  assert.equal(failure.failureKind, "provider_quota_exhausted");
  assert.match(failure.userMessage, /额度已用尽/);
});

test("buildMarkdownReport includes readable provider blocking details", () => {
  const report: AcceptanceReport = {
    generatedAt: "2026-04-26T00:00:00.000Z",
    reportPathJson: "artifacts/plan22/report.json",
    reportPathMarkdown: "artifacts/plan22/report.md",
    user: { username: "huozi", userId: 1 },
    prerequisites: {
      checks: [
        {
          code: "provider:openai",
          status: "failed",
          detail: "429 今日订阅额度已用光，请明天再试",
          blocking: true,
          failureKind: "provider_quota_exhausted",
          userMessage: "AI 服务账号额度已用尽，当前无法完成真实模型验收；请更换可用账号或等待额度恢复后重跑。",
          operatorAction: "检查 OPENAI_API_KEY / OPENAI_BASE_URL 对应账号额度，恢复后运行 pnpm plan22:real-automation-run。",
        },
      ],
      search: {
        query: "AI 写作",
        status: "passed",
        resultCount: 10,
        distinctDomainCount: 5,
        recentResultCount: 2,
        searchUrl: "http://localhost:8080/search?q=AI",
        error: null,
        blocking: false,
      },
      credentialMatrix: {
        generatedAt: "2026-04-26T00:00:00.000Z",
        ttlSeconds: 60,
        providers: [],
      },
      wechatConnectionCount: 0,
      topicRecommendationCount: 0,
    },
    scenarios: [],
    status: "failed",
  };

  const markdown = buildMarkdownReport(report);

  assert.match(markdown, /failureKind=provider_quota_exhausted/);
  assert.match(markdown, /AI 服务账号额度已用尽/);
  assert.match(markdown, /operatorAction=检查 OPENAI_API_KEY/);
});

function buildScenario(overrides: Partial<ScenarioReport> = {}): ScenarioReport {
  return {
    scenarioCode: "brief",
    inputMode: "brief",
    automationLevel: "draftPreview",
    inputText: "AI 写作",
    sourceUrl: null,
    status: "completed",
    blockedReason: null,
    runId: 1,
    articleId: 2,
    articleTitle: "AI 写作",
    finalWechatMediaId: null,
    searchSummary: {
      queryCount: 3,
      sourceCount: 12,
      distinctDomainCount: 4,
      searchUrl: "http://localhost:8080/search?q=AI",
      searchError: null,
    },
    factCheckSummary: {
      overallRisk: "low",
      verifiedClaimCount: 3,
      needsEvidenceCount: 0,
      highRiskClaimCount: 0,
    },
    titleSummary: {
      recommendedTitle: "AI 写作",
      optionCount: 6,
      forbiddenHitCount: 0,
    },
    openingSummary: {
      recommendedOpening: "开头",
      optionCount: 3,
    },
    coverImageSummary: {
      prompt: "cover",
      altText: "cover",
    },
    layoutSummary: {
      templateId: "default-auto",
      htmlLength: 100,
      htmlSyncedToArticle: true,
    },
    publishGuardSummary: {
      canPublish: true,
      blockerCount: 0,
      warningCount: 0,
      blockers: [],
    },
    aiUsageSummary: {
      callCount: 3,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalLatencyMs: 1000,
    },
    stageStatuses: [],
    error: null,
    ...overrides,
  };
}

test("getScenarioAcceptanceIssues blocks high risk and content publish blockers", () => {
  const issues = getScenarioAcceptanceIssues({
    requiresWechatDraft: false,
    scenario: buildScenario({
      factCheckSummary: {
        overallRisk: "high",
        verifiedClaimCount: 1,
        needsEvidenceCount: 2,
        highRiskClaimCount: 1,
      },
      publishGuardSummary: {
        canPublish: false,
        blockerCount: 2,
        warningCount: 0,
        blockers: ["当前最弱层是 L1 硬规则", "尚未选择微信公众号连接"],
      },
    }),
  });

  assert.equal(issues.length, 2);
  assert.match(issues[0] ?? "", /事实核查仍有高风险/);
  assert.match(issues[1] ?? "", /发布守门仍有内容阻塞/);
});

test("getScenarioAcceptanceIssues ignores wechat-only blockers for draftPreview", () => {
  const issues = getScenarioAcceptanceIssues({
    requiresWechatDraft: false,
    scenario: buildScenario({
      publishGuardSummary: {
        canPublish: false,
        blockerCount: 1,
        warningCount: 0,
        blockers: ["尚未选择微信公众号连接"],
      },
    }),
  });

  assert.deepEqual(issues, []);
});
