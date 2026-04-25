import fs from "node:fs";
import path from "node:path";

import { getCredentialHealthMatrix } from "../apps/web/src/lib/ai-credentials-health";
import { getDatabase } from "../apps/web/src/lib/db";
import { searchResearchSources } from "../apps/web/src/lib/research-source-search";
import type { ArticleAutomationInputMode, ArticleAutomationLevel } from "../apps/web/src/lib/article-automation-runs";
import type { getVisibleTopicRecommendationsForUser } from "../apps/web/src/lib/topic-recommendations";

export type ScenarioCode = "brief" | "url" | "recommendedTopic";

export type PrerequisiteCheck = {
  code: string;
  status: "passed" | "failed" | "skipped";
  detail: string;
  blocking?: boolean;
};

export type SearchCheck = {
  query: string;
  status: "passed" | "failed" | "skipped";
  resultCount: number;
  distinctDomainCount: number;
  recentResultCount: number;
  searchUrl: string | null;
  error: string | null;
  blocking?: boolean;
};

export type ScenarioReport = {
  scenarioCode: ScenarioCode;
  inputMode: ArticleAutomationInputMode;
  automationLevel: ArticleAutomationLevel;
  inputText: string;
  sourceUrl: string | null;
  status: string;
  blockedReason: string | null;
  runId: number | null;
  articleId: number | null;
  articleTitle: string | null;
  finalWechatMediaId: string | null;
  searchSummary: {
    queryCount: number;
    sourceCount: number;
    distinctDomainCount: number;
    searchUrl: string | null;
    searchError: string | null;
  };
  factCheckSummary: {
    overallRisk: string | null;
    verifiedClaimCount: number;
    needsEvidenceCount: number;
    highRiskClaimCount: number;
  };
  titleSummary: {
    recommendedTitle: string | null;
    optionCount: number;
    forbiddenHitCount: number;
  };
  openingSummary: {
    recommendedOpening: string | null;
    optionCount: number;
  };
  coverImageSummary: {
    prompt: string | null;
    altText: string | null;
  };
  layoutSummary: {
    templateId: string | null;
    htmlLength: number;
    htmlSyncedToArticle: boolean;
  };
  aiUsageSummary: {
    callCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalLatencyMs: number;
  };
  stageStatuses: Array<{
    stageCode: string;
    status: string;
    promptId: string;
    promptVersion: string;
    sceneCode: string;
    provider: string | null;
    model: string | null;
    startedAt: string | null;
    completedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
  error: string | null;
};

export type AcceptanceReport = {
  generatedAt: string;
  reportPathJson: string;
  reportPathMarkdown: string;
  user: {
    username: string;
    userId: number | null;
  };
  prerequisites: {
    checks: PrerequisiteCheck[];
    search: SearchCheck;
    credentialMatrix: Awaited<ReturnType<typeof getCredentialHealthMatrix>>;
    wechatConnectionCount: number;
    topicRecommendationCount: number;
  };
  scenarios: ScenarioReport[];
  status: "passed" | "failed";
};

export type TopicRecommendation = Awaited<ReturnType<typeof getVisibleTopicRecommendationsForUser>>[number];

export const DEFAULT_BRIEF_INPUT = "AI 自动生成文章为什么不能只拼 Prompt，而要做成真正的全自动生产线";
export const DEFAULT_URL = "https://openai.com/index/introducing-deep-research/";
export const ARTIFACT_DIR = path.resolve(process.cwd(), "artifacts/plan22");

export function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

export function readOption(name: string) {
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      return String(process.argv[index + 1]);
    }
  }
  return "";
}

export function readFlag(name: string) {
  return process.argv.includes(name);
}

export function getTimestampTag() {
  return new Date().toISOString().replaceAll(":", "").replaceAll(".", "-");
}

export function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeString(item)).filter(Boolean) : [];
}

export function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isRecent(value: string | null, recencyDays: number) {
  if (!value) {
    return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return timestamp >= Date.now() - recencyDays * 24 * 60 * 60 * 1000;
}

export function buildEnvChecks() {
  const databaseReady = Boolean(normalizeString(process.env.DATABASE_URL) || normalizeString(process.env.DATABASE_PATH));
  const imageProvider = normalizeString(process.env.COVER_IMAGE_PROVIDER);
  const imageBaseUrl = normalizeString(process.env.COVER_IMAGE_BASE_URL);
  const imageModel = normalizeString(process.env.COVER_IMAGE_MODEL);
  const imageApiKey = normalizeString(process.env.COVER_IMAGE_API_KEY);
  const imageEnabled = normalizeString(process.env.COVER_IMAGE_ENABLED).toLowerCase() === "true";

  return [
    {
      code: "database",
      status: databaseReady ? "passed" : "failed",
      detail: databaseReady ? "已检测到 DATABASE_URL 或 DATABASE_PATH" : "缺少 DATABASE_URL / DATABASE_PATH",
    },
    {
      code: "aiRoutes",
      status: normalizeString(process.env.AI_MODEL_ROUTES_JSON) ? "passed" : "failed",
      detail: normalizeString(process.env.AI_MODEL_ROUTES_JSON) ? "已检测到 AI_MODEL_ROUTES_JSON" : "缺少 AI_MODEL_ROUTES_JSON",
    },
    {
      code: "searchEndpoint",
      status: normalizeString(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT) ? "passed" : "failed",
      detail: normalizeString(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT)
        ? `搜索端点：${normalizeString(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT)}`
        : "缺少 RESEARCH_SOURCE_SEARCH_ENDPOINT",
    },
    {
      code: "imaBaseUrl",
      status: normalizeString(process.env.IMA_OPENAPI_BASE_URL) ? "passed" : "failed",
      detail: normalizeString(process.env.IMA_OPENAPI_BASE_URL)
        ? `IMA_BASE_URL：${normalizeString(process.env.IMA_OPENAPI_BASE_URL)}`
        : "缺少 IMA_OPENAPI_BASE_URL",
    },
    {
      code: "coverImage",
      status: imageProvider && imageBaseUrl && imageModel && imageEnabled && (imageApiKey || imageProvider === "openai") ? "passed" : "failed",
      detail:
        imageProvider && imageBaseUrl && imageModel && imageEnabled && (imageApiKey || imageProvider === "openai")
          ? `生图引擎：${imageProvider}/${imageModel}`
          : "缺少 COVER_IMAGE_PROVIDER / COVER_IMAGE_BASE_URL / COVER_IMAGE_MODEL / COVER_IMAGE_ENABLED / COVER_IMAGE_API_KEY",
    },
    {
      code: "wechatTimeout",
      status: normalizeString(process.env.WECHAT_DEFAULT_TIMEOUT_MS) ? "passed" : "failed",
      detail: normalizeString(process.env.WECHAT_DEFAULT_TIMEOUT_MS)
        ? `WECHAT_DEFAULT_TIMEOUT_MS=${normalizeString(process.env.WECHAT_DEFAULT_TIMEOUT_MS)}`
        : "缺少 WECHAT_DEFAULT_TIMEOUT_MS",
    },
  ] satisfies PrerequisiteCheck[];
}

export async function runSearchCheck(query: string): Promise<SearchCheck> {
  const result = await searchResearchSources({
    query,
    limit: 12,
    strictJson: true,
  });
  const domains = new Set(
    result.results
      .map((item) => getDomain(item.url))
      .filter((item): item is string => Boolean(item)),
  );
  const recentResultCount = result.results.filter((item) => isRecent(item.publishedDate, 30)).length;
  const passed = !result.error && result.results.length >= 8 && domains.size >= 3 && recentResultCount >= 1;
  return {
    query,
    status: passed ? "passed" : "failed",
    resultCount: result.results.length,
    distinctDomainCount: domains.size,
    recentResultCount,
    searchUrl: result.searchUrl,
    error: result.error,
  };
}

export async function summarizeAiUsage(articleId: number | null) {
  if (!articleId) {
    return {
      callCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalLatencyMs: 0,
    };
  }
  const db = getDatabase();
  const row = await db.queryOne<{
    call_count: number | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
    total_cache_read_tokens: number | null;
    total_latency_ms: number | null;
  }>(
    `SELECT
       COUNT(*) AS call_count,
       COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
       COALESCE(SUM(cache_read_tokens), 0) AS total_cache_read_tokens,
       COALESCE(SUM(latency_ms), 0) AS total_latency_ms
     FROM ai_call_observations
     WHERE article_id = ?`,
    [articleId],
  );
  return {
    callCount: Number(row?.call_count ?? 0),
    totalInputTokens: Number(row?.total_input_tokens ?? 0),
    totalOutputTokens: Number(row?.total_output_tokens ?? 0),
    totalCacheReadTokens: Number(row?.total_cache_read_tokens ?? 0),
    totalLatencyMs: Number(row?.total_latency_ms ?? 0),
  };
}

export function buildRecommendedTopicInput(recommendation: TopicRecommendation) {
  const title = recommendation.title;
  const reason = recommendation.recommendationReason || recommendation.summary || "今日推荐选题";
  return `${title}\n推荐理由：${reason}`;
}

export function buildScenarioInputs(input: {
  briefInput: string;
  urlInput: string;
  urlSource: string;
  recommendation: TopicRecommendation | null;
  wechatConnectionId: number;
  levelOverride: string;
  modeOverride: string;
}) {
  const levelOverride = normalizeString(input.levelOverride) as ArticleAutomationLevel;
  const modeOverride = normalizeString(input.modeOverride);
  const scenarios = new Map<ScenarioCode, {
    inputMode: ArticleAutomationInputMode;
    inputText: string;
    sourceUrl: string | null;
    automationLevel: ArticleAutomationLevel;
    targetWechatConnectionId: number | null;
  }>([
    ["brief", { inputMode: "brief", inputText: input.briefInput, sourceUrl: null, automationLevel: levelOverride || "draftPreview", targetWechatConnectionId: levelOverride === "wechatDraft" ? input.wechatConnectionId : null }],
    ["url", { inputMode: "url", inputText: input.urlInput, sourceUrl: input.urlSource, automationLevel: levelOverride || "draftPreview", targetWechatConnectionId: levelOverride === "wechatDraft" ? input.wechatConnectionId : null }],
    ["recommendedTopic", { inputMode: "recommendedTopic", inputText: input.recommendation ? buildRecommendedTopicInput(input.recommendation) : "", sourceUrl: input.recommendation?.sourceUrl || null, automationLevel: levelOverride || "draftPreview", targetWechatConnectionId: levelOverride === "wechatDraft" ? input.wechatConnectionId : null }],
  ]);

  if (modeOverride === "brief" || modeOverride === "url" || modeOverride === "recommendedTopic") {
    return [[modeOverride as ScenarioCode, scenarios.get(modeOverride as ScenarioCode)!]] as const;
  }
  return Array.from(scenarios.entries());
}

export function buildMarkdownReport(report: AcceptanceReport) {
  const formatMode = (blocking?: boolean) => blocking === false ? "advisory" : "required";
  const lines = [
    "# Plan22 真实自动化验收报告",
    "",
    `- 生成时间：${report.generatedAt}`,
    `- 用户：${report.user.username}`,
    `- 状态：${report.status}`,
    `- 微信连接数：${report.prerequisites.wechatConnectionCount}`,
    `- 推荐选题数：${report.prerequisites.topicRecommendationCount}`,
    "",
    "## 前置检查",
    "",
    ...report.prerequisites.checks.map((item) => `- ${item.code}: ${item.status} (${formatMode(item.blocking)}) · ${item.detail}`),
    `- search: ${report.prerequisites.search.status} (${formatMode(report.prerequisites.search.blocking)}) · results=${report.prerequisites.search.resultCount}, domains=${report.prerequisites.search.distinctDomainCount}, recent=${report.prerequisites.search.recentResultCount}`,
    "",
    "## 场景结果",
    "",
  ];

  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.scenarioCode}`);
    lines.push(`- status: ${scenario.status}`);
    lines.push(`- runId: ${scenario.runId ?? "null"}`);
    lines.push(`- articleId: ${scenario.articleId ?? "null"}`);
    lines.push(`- articleTitle: ${scenario.articleTitle ?? "null"}`);
    lines.push(`- finalWechatMediaId: ${scenario.finalWechatMediaId ?? "null"}`);
    lines.push(`- blockedReason: ${scenario.blockedReason ?? "null"}`);
    lines.push(`- search: queries=${scenario.searchSummary.queryCount}, sources=${scenario.searchSummary.sourceCount}, domains=${scenario.searchSummary.distinctDomainCount}, error=${scenario.searchSummary.searchError ?? "null"}`);
    lines.push(`- factCheck: risk=${scenario.factCheckSummary.overallRisk ?? "null"}, needsEvidence=${scenario.factCheckSummary.needsEvidenceCount}, highRisk=${scenario.factCheckSummary.highRiskClaimCount}`);
    lines.push(`- title: ${scenario.titleSummary.recommendedTitle ?? "null"} (${scenario.titleSummary.optionCount} options)`);
    lines.push(`- opening: ${scenario.openingSummary.recommendedOpening ?? "null"} (${scenario.openingSummary.optionCount} options)`);
    lines.push(`- layout: template=${scenario.layoutSummary.templateId ?? "null"}, htmlLength=${scenario.layoutSummary.htmlLength}, synced=${scenario.layoutSummary.htmlSyncedToArticle ? "yes" : "no"}`);
    lines.push(`- aiUsage: calls=${scenario.aiUsageSummary.callCount}, input=${scenario.aiUsageSummary.totalInputTokens}, output=${scenario.aiUsageSummary.totalOutputTokens}, cacheRead=${scenario.aiUsageSummary.totalCacheReadTokens}, latencyMs=${scenario.aiUsageSummary.totalLatencyMs}`);
    if (scenario.error) {
      lines.push(`- error: ${scenario.error}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
