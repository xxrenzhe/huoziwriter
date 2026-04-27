import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { buildGatewaySystemSegments } from "./ai-gateway-system-segments";
import { applyArticleStageArtifact } from "./article-stage-apply";
import {
  ensureCoverImagePreparedForPublish,
  ensureEvidencePackagePreparedForPublish,
  ensureStrategyCardPreparedForWriting,
  runFactRiskRepairWithRetries,
  runLanguageGuardAuditWithRetries,
  runPublishAutoRepair,
} from "./article-automation-publish-repair";
import { ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT } from "./article-prompt-quality-brief";
import { generateArticleStageArtifact, getArticleStageArtifact, updateArticleStageArtifactPayload } from "./article-stage-artifacts";
import { generateArticleVisualAsset } from "./article-image-generator";
import { insertArticleVisualAssetsIntoMarkdown } from "./article-image-inserter";
import { getResearchBriefGenerationGate } from "./article-research";
import { attachFragmentToArticleNode, getArticleNodes } from "./article-outline";
import { planArticleVisualBriefs } from "./article-visual-planner";
import { listArticleVisualBriefs, replaceArticleVisualBriefs } from "./article-visual-repository";
import {
  bindArticleToAutomationRun,
  completeArticleAutomationStageRun,
  failArticleAutomationStageRun,
  getArticleAutomationRunById,
  skipArticleAutomationStageRun,
  startArticleAutomationStageRun,
  updateArticleAutomationRun,
  type ArticleAutomationRunStatus,
  type ArticleAutomationStageRun,
} from "./article-automation-runs";
import {
  formatOptimizationGateIssues,
  getArticleViralReadinessGateIssues,
  getOpeningOptimizationGateIssues,
  getTitleOptimizationGateIssues,
} from "./article-automation-optimization-gates";
import { findUserById, getEffectivePlanCodeForUser } from "./auth";
import { getDatabase } from "./db";
import { collectLanguageGuardHits, getLanguageGuardRules } from "./language-guard";
import { loadPromptWithMeta, type PromptLoadContext } from "./prompt-loader";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "./plan22-prompt-catalog";
import { evaluatePublishGuard } from "./publish-guard";
import { createArticle, createFragment, getLatestArticleCoverImage, getArticleById } from "./repositories";
import { saveArticleDraft } from "./article-draft";
import { fetchWebpageArticle } from "./webpage-reader";
import { publishArticleToWechat, WechatPublishError } from "./wechat-publish";

type AutomationRunDetail = NonNullable<Awaited<ReturnType<typeof getArticleAutomationRunById>>>;

type AutomationPromptMeta = {
  promptId: string;
  version: string;
  ref: string;
  content: string;
  resolutionMode: string;
  resolutionReason: string;
};

type AutomationPromptContext = PromptLoadContext & {
  role: "admin" | "user";
  planCode: string;
};

type StageExecutionResult = {
  outputJson: Record<string, unknown>;
  qualityJson?: Record<string, unknown>;
  searchTraceJson?: Record<string, unknown>;
  provider?: string | null;
  model?: string | null;
};

class AutomationStageBlockedError extends Error {
  code: string;

  constructor(message: string, code = "automation_stage_blocked") {
    super(message);
    this.name = "AutomationStageBlockedError";
    this.code = code;
  }
}

const STRATEGY_ONLY_STAGE_CODES = new Set([
  "topicAnalysis",
  "researchBrief",
  "audienceAnalysis",
  "outlinePlanning",
  "titleOptimization",
  "openingOptimization",
]);

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

const AUTOMATION_SCENE_REQUEST_TIMEOUT_MS = readPositiveIntegerEnv("ARTICLE_AUTOMATION_SCENE_REQUEST_TIMEOUT_MS", 120_000);
const ARTICLE_IMAGE_BATCH_CONCURRENCY = readPositiveIntegerEnv("ARTICLE_IMAGE_BATCH_CONCURRENCY", 2);
const TITLE_OPTIMIZATION_MAX_ATTEMPTS = readPositiveIntegerEnv("ARTICLE_AUTOMATION_TITLE_OPTIMIZATION_MAX_ATTEMPTS", 2);
const OPENING_OPTIMIZATION_MAX_ATTEMPTS = readPositiveIntegerEnv("ARTICLE_AUTOMATION_OPENING_OPTIMIZATION_MAX_ATTEMPTS", 2);

type AutomationSourceGrounding = {
  loaded: boolean;
  url: string;
  sourceTitle: string;
  sourceExcerpt: string;
  rawTextLength: number;
  error?: string;
};

const automationSourceGroundingCache = new Map<string, Promise<AutomationSourceGrounding>>();

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

const DRAFT_PREVIEW_FAST_SKIPPED_STAGE_CODES = new Set([
  "deepWrite",
  "languageGuardAudit",
  "coverImageBrief",
  "inlineImageGenerate",
]);

function isFastDraftPreview(detail: AutomationRunDetail) {
  return detail.run.automationLevel === "draftPreview" && readBooleanEnv("ARTICLE_AUTOMATION_FAST_DRAFT_PREVIEW", true);
}

function shouldUseFastLocalReview(detail: AutomationRunDetail) {
  return isFastDraftPreview(detail) && readBooleanEnv("ARTICLE_AUTOMATION_FAST_LOCAL_REVIEW", true);
}

function shouldUseFastLocalStrategy(detail: AutomationRunDetail) {
  return isFastDraftPreview(detail) && readBooleanEnv("ARTICLE_AUTOMATION_FAST_LOCAL_STRATEGY", true);
}

function shouldSkipDraftApplyAudit(detail: AutomationRunDetail) {
  return isFastDraftPreview(detail) && readBooleanEnv("ARTICLE_AUTOMATION_SKIP_APPLY_AUDIT", true);
}

function truncateGroundingText(value: string, limit: number) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

async function loadAutomationSourceGrounding(detail: AutomationRunDetail) {
  const sourceUrl = String(detail.run.sourceUrl || "").trim();
  if (detail.run.inputMode !== "url" || !sourceUrl) {
    return null;
  }
  if (!automationSourceGroundingCache.has(sourceUrl)) {
    automationSourceGroundingCache.set(sourceUrl, (async () => {
      try {
        const article = await fetchWebpageArticle(sourceUrl);
        return {
          loaded: true,
          url: article.url || sourceUrl,
          sourceTitle: article.sourceTitle || "",
          sourceExcerpt: truncateGroundingText(article.rawText, 8_000),
          rawTextLength: String(article.rawText || "").trim().length,
        } satisfies AutomationSourceGrounding;
      } catch (error) {
        return {
          loaded: false,
          url: sourceUrl,
          sourceTitle: "",
          sourceExcerpt: "",
          rawTextLength: 0,
          error: error instanceof Error ? error.message : "来源正文抓取失败",
        } satisfies AutomationSourceGrounding;
      }
    })());
  }
  return automationSourceGroundingCache.get(sourceUrl)!;
}

function buildGroundedTopicSeed(detail: AutomationRunDetail, grounding: AutomationSourceGrounding | null) {
  if (grounding?.loaded) {
    return grounding.sourceTitle || grounding.sourceExcerpt.slice(0, 80) || grounding.url;
  }
  if (detail.run.inputMode === "url" && detail.run.sourceUrl) {
    return detail.run.sourceUrl;
  }
  return detail.run.inputText;
}

function sourceGroundingAudit(grounding: AutomationSourceGrounding | null, sourceFragmentId?: number | null) {
  return grounding
    ? {
        loaded: grounding.loaded,
        url: grounding.url,
        sourceTitle: grounding.sourceTitle,
        rawTextLength: grounding.rawTextLength,
        sourceFragmentId: sourceFragmentId ?? null,
        error: grounding.error || null,
      }
    : null;
}

async function ensureAutomationSourceFragment(detail: AutomationRunDetail, grounding: AutomationSourceGrounding | null) {
  if (!detail.run.articleId || !grounding?.loaded || !grounding.sourceExcerpt) {
    return null;
  }
  const db = getDatabase();
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM fragments
     WHERE user_id = ? AND source_type = ? AND source_url IN (?, ?)
     ORDER BY id DESC
     LIMIT 1`,
    [detail.run.userId, "url", grounding.url, detail.run.sourceUrl || grounding.url],
  );
  const created = existing ?? await createFragment({
    userId: detail.run.userId,
    sourceType: "url",
    title: grounding.sourceTitle || "链接起稿原文",
    rawContent: grounding.sourceExcerpt,
    distilledContent: [
      grounding.sourceTitle ? `来源标题：${grounding.sourceTitle}` : null,
      `来源正文摘录：${truncateGroundingText(grounding.sourceExcerpt, 2_400)}`,
    ].filter(Boolean).join("\n"),
    sourceUrl: grounding.url,
    sourceMeta: {
      automationRunId: detail.run.id,
      source: "article_automation_url_grounding",
      rawTextLength: grounding.rawTextLength,
    },
  });
  const fragmentId = Number(created?.id || 0);
  if (!fragmentId) {
    return null;
  }
  const firstNode = (await getArticleNodes(detail.run.articleId))[0];
  if (firstNode) {
    await attachFragmentToArticleNode({
      articleId: detail.run.articleId,
      nodeId: firstNode.id,
      fragmentId,
      usageMode: "rewrite",
    });
  }
  return fragmentId;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getNullableNumber(value: unknown) {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function hasUsableTitleOptions(payload: Record<string, unknown>) {
  return getRecordArray(payload.titleOptions).some((item) => getString(item.title) || getString(item.text));
}

function hasUsableOpeningOptions(payload: Record<string, unknown>) {
  return getRecordArray(payload.openingOptions).some((item) => getString(item.opening) || getString(item.text));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

function normalizeResearchSourceUrl(value: unknown) {
  const raw = getString(value);
  if (!raw) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return raw;
  }
}

function dedupeResearchSources(sources: Array<{ label: string; sourceType: string; detail: string; sourceUrl: string | null }>) {
  const seen = new Set<string>();
  const normalized: typeof sources = [];
  for (const source of sources) {
    const key = [
      source.sourceUrl || "",
      source.label.toLowerCase(),
      source.detail.toLowerCase(),
      source.sourceType.toLowerCase(),
    ].join("::");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(source);
  }
  return normalized;
}

function getStageProviderMeta(
  payload: Record<string, unknown>,
  runtimeMetaKey: "titleOptimizer" | "openingOptimizer",
  fallbackProvider?: string | null,
  fallbackModel?: string | null,
) {
  const runtimeMeta = getRecord(payload.runtimeMeta);
  const stageMeta = getRecord(runtimeMeta?.[runtimeMetaKey]);
  const provider = getString(stageMeta?.provider) || fallbackProvider || null;
  const model = getString(stageMeta?.model) || fallbackModel || null;
  return { provider, model };
}

function normalizeTopicAnalysisOutput(value: unknown, inputText: string) {
  const record = getRecord(value) ?? {};
  const theme = getString(record.theme) || inputText.slice(0, 48) || "待明确主题";
  const risk = getString(record.risk) || "素材充分度与时间敏感性仍需继续核查。";
  const repairActions = getStringArray(record.repairActions, 5);
  return {
    theme,
    coreAssertion: getString(record.coreAssertion) || `围绕「${theme}」形成一个更可执行、可验证的公众号判断。`,
    whyNow: getString(record.whyNow) || "需要通过研究阶段确认当下窗口、变化变量和读者关心点。",
    readerBenefit: getString(record.readerBenefit) || `帮助读者更快判断「${theme}」是否值得关注、如何理解以及下一步该做什么。`,
    risk,
    decision: getString(record.decision) || (repairActions.length > 0 ? "revise" : "go"),
    repairActions: repairActions.length > 0 ? repairActions : ["进入研究阶段补足事实与时间线，再决定写作角度。"],
  };
}

function buildTopicAnalysisFallback(detail: AutomationRunDetail, grounding: AutomationSourceGrounding | null = null) {
  const trimmed = buildGroundedTopicSeed(detail, grounding).trim();
  if (detail.run.inputMode === "url" && grounding && !grounding.loaded) {
    return {
      theme: trimmed.slice(0, 48) || "来源链接待核验",
      coreAssertion: "链接起稿必须先读取来源正文；当前抓取失败，不能把执行流程描述当成文章主题。",
      whyNow: "需要先恢复来源正文抓取，再基于原文观点、数据和案例判断写作窗口。",
      readerBenefit: "避免生成偏离原文的公众号文章，确保后续标题、大纲和正文都锚定真实来源。",
      risk: `来源正文抓取失败：${grounding.error || "未知错误"}`,
      decision: "hold",
      repairActions: ["修复或重试来源链接正文抓取。", "抓取成功前不要使用用户流程描述生成正文主题。"],
    };
  }
  const short = trimmed.length < 8;
  return {
    theme: trimmed.slice(0, 48) || "待明确主题",
    coreAssertion: short ? "输入主题过短，先补充更具体的判断对象和切口。" : `这篇文章要把「${trimmed.slice(0, 32)}」压成一个能被读者立即理解的核心判断。`,
    whyNow: short ? "当前 why now 不足，先补充时间窗口、事件触发点或趋势变化。" : "需要在研究阶段验证这件事为什么现在值得写、与过去相比什么变了。",
    readerBenefit: short ? "先明确读者到底能获得什么判断或行动建议。" : "让读者在更短时间内看懂这件事的判断框架、风险边界和可执行动作。",
    risk: short ? "选题输入过空。" : "还没有完成事实补证、时间脉络和横向比较。",
    decision: short ? "revise" : "go",
    repairActions: short
      ? ["补充一个更具体的主题句或观点句。", "说明目标读者是谁。"]
      : ["自动进入研究阶段补证，再判断结构和表达。"],
  };
}

function mapResearchBriefOutput(payload: Record<string, unknown>) {
  const externalResearch = getRecord(payload.externalResearch);
  const timelineCards = getRecordArray(payload.timelineCards);
  const comparisonCards = getRecordArray(payload.comparisonCards);
  const intersectionInsights = getRecordArray(payload.intersectionInsights);
  const cardSources = [
    ...timelineCards.flatMap((item) => getRecordArray(item.sources)),
    ...comparisonCards.flatMap((item) => getRecordArray(item.sources)),
    ...intersectionInsights.flatMap((item) => getRecordArray(item.sources)),
  ].map((item) => ({
    label: getString(item.label),
    sourceType: getString(item.sourceType),
    detail: getString(item.detail),
    sourceUrl: normalizeResearchSourceUrl(item.sourceUrl),
  }));
  const attachedSources = getRecordArray(externalResearch?.attached).map((item) => ({
    label: getString(item.title) || getString(item.label) || "已附着研究信源",
    sourceType: getString(item.sourceType) || "url",
    detail: getString(item.detail) || getString(item.excerpt) || "真实搜索/知识库补源附着到研究简报",
    sourceUrl: normalizeResearchSourceUrl(item.sourceUrl),
  }));
  const discoveredSources = [
    ...getStringArray(externalResearch?.discoveredUrls, 24),
    ...getStringArray(externalResearch?.curatedSourceUrls, 24),
    ...getRecordArray(externalResearch?.searches).flatMap((item) => getStringArray(item.topUrls, 4)),
  ].map((sourceUrl) => ({
    label: (() => {
      try {
        return new URL(sourceUrl).hostname.replace(/^www\./, "");
      } catch {
        return sourceUrl;
      }
    })(),
    sourceType: "search",
    detail: "真实搜索发现的候选信源",
    sourceUrl: normalizeResearchSourceUrl(sourceUrl),
  }));
  const sources = dedupeResearchSources([...cardSources, ...attachedSources, ...discoveredSources])
    .filter((item) => item.label || item.detail || item.sourceUrl);
  return {
    queries: [
      ...(getString(externalResearch?.query) ? [{ query: getString(externalResearch?.query), purpose: "自动补源" }] : []),
      ...getStringArray(payload.mustCoverAngles, 6).map((item) => ({ query: item, purpose: "研究必查维度" })),
    ],
    sources,
    timeline: timelineCards.map((item) => ({
      phase: getString(item.phase),
      title: getString(item.title),
      summary: getString(item.summary),
      signals: getStringArray(item.signals, 4),
    })),
    contradictions: getStringArray(payload.forbiddenConclusions, 6).concat(getStringArray(payload.hypothesesToVerify, 6)).slice(0, 8),
    evidenceGaps: [
      ...getStringArray(getRecord(payload.sourceCoverage)?.missingCategories, 6),
      ...getStringArray(payload.materialGapHints, 6),
    ].slice(0, 8),
    researchObject: getString(payload.researchObject),
    coreQuestion: getString(payload.coreQuestion),
    mustCoverAngles: getStringArray(payload.mustCoverAngles, 6),
    sourceCoverage: getRecord(payload.sourceCoverage) ?? {},
    timelineCards,
    comparisonCards,
    intersectionInsights,
    researchSummary: getString(payload.summary),
  };
}

function mapAudienceAnalysisOutput(payload: Record<string, unknown>) {
  const segments = getRecordArray(payload.readerSegments);
  return {
    targetReader: getString(payload.coreReaderLabel) || getString(segments[0]?.label),
    painPoints: segments.map((item) => getString(item.painPoint)).filter(Boolean).slice(0, 4),
    knowledgeLevel: getStringArray(payload.backgroundAwarenessOptions, 3)[0] || "需要在正文里按不同认知层级照顾解释密度。",
    toneAdvice: getStringArray(payload.languageGuidance, 5),
    readerSegments: segments.map((item) => ({
      label: getString(item.label),
      painPoint: getString(item.painPoint),
      motivation: getString(item.motivation),
      preferredTone: getString(item.preferredTone),
    })),
    contentWarnings: getStringArray(payload.contentWarnings, 5),
    recommendedCallToAction: getString(payload.recommendedCallToAction),
  };
}

function mapOutlinePlanningOutput(payload: Record<string, unknown>) {
  const sections = getRecordArray(payload.outlineSections);
  return {
    sections: sections.map((item) => ({
      heading: getString(item.heading),
      goal: getString(item.goal),
      keyPoints: getStringArray(item.keyPoints, 4),
      evidenceHints: getStringArray(item.evidenceHints, 4),
      researchFocus: getString(item.researchFocus),
      researchAnchor: getString(item.researchAnchor),
    })),
    claimMap: {
      centralThesis: getString(payload.centralThesis),
      viewpointIntegration: getRecordArray(payload.viewpointIntegration).map((item) => ({
        viewpoint: getString(item.viewpoint),
        action: getString(item.action),
        note: getString(item.note),
      })),
    },
    evidenceMap: sections.map((item) => ({
      heading: getString(item.heading),
      materialRefs: Array.isArray(item.materialRefs) ? item.materialRefs : [],
      evidenceHints: getStringArray(item.evidenceHints, 4),
    })),
    endingAction: getString(payload.endingStrategy),
    workingTitle: getString(payload.workingTitle),
    openingHook: getString(payload.openingHook),
  };
}

function mapTitleOptimizationOutput(payload: Record<string, unknown>) {
  const titleOptions = getRecordArray(payload.titleOptions).map((item) => ({
    title: getString(item.title) || getString(item.text),
    angle: getString(item.angle),
    rationale: getString(item.rationale) || getString(item.recommendReason),
    openRateScore: getNullableNumber(item.openRateScore),
    elementsHit: {
      specific: getBoolean(getRecord(item.elementsHit)?.specific),
      curiosityGap: getBoolean(getRecord(item.elementsHit)?.curiosityGap),
      readerView: getBoolean(getRecord(item.elementsHit)?.readerView),
    },
    forbiddenHits: getStringArray(item.forbiddenHits, 4),
    isRecommended: Boolean(item.isRecommended),
  }));
  const safeOptions = titleOptions.filter((item) => !hasUnsupportedSpecificClaim(item.title));
  const recommended =
    titleOptions.find((item) => item.isRecommended && !hasUnsupportedSpecificClaim(item.title))
    ?? safeOptions[0]
    ?? titleOptions.find((item) => item.isRecommended)
    ?? titleOptions[0]
    ?? null;
  const recommendedElementsHitCount = recommended
    ? ["specific", "curiosityGap", "readerView"].filter((key) => recommended.elementsHit[key as keyof typeof recommended.elementsHit]).length
    : 0;
  return {
    titleOptions,
    recommendedTitle: recommended?.title ?? getString(payload.workingTitle),
    recommendedTitleOpenRateScore: recommended?.openRateScore ?? null,
    recommendedTitleElementsHitCount: recommendedElementsHitCount,
    recommendedTitleForbiddenHitCount: recommended?.forbiddenHits.length ?? 0,
    forbiddenHits: titleOptions.flatMap((item) => item.forbiddenHits).slice(0, 6),
  };
}

function mapOpeningOptimizationOutput(payload: Record<string, unknown>) {
  const openingOptions = getRecordArray(payload.openingOptions).map((item) => ({
    opening: getString(item.text) || getString(item.opening),
    patternCode: getString(item.patternCode),
    patternLabel: getString(item.patternLabel),
    hookScore: getNullableNumber(item.hookScore),
    qualityCeiling: getString(item.qualityCeiling),
    diagnose: getRecord(item.diagnose) ?? {},
    forbiddenHits: getStringArray(item.forbiddenHits, 4),
    isRecommended: Boolean(item.isRecommended),
  }));
  const safeOptions = openingOptions.filter((item) => !hasUnsupportedSpecificClaim(item.opening));
  const recommended =
    openingOptions.find((item) => item.isRecommended && !hasUnsupportedSpecificClaim(item.opening))
    ?? safeOptions[0]
    ?? openingOptions.find((item) => item.isRecommended)
    ?? openingOptions[0]
    ?? null;
  const recommendedDiagnose = getRecord(recommended?.diagnose) ?? {};
  const recommendedDangerCount = Object.values(recommendedDiagnose).filter((item) => item === "danger").length;
  const recommendedWarnCount = Object.values(recommendedDiagnose).filter((item) => item === "warn").length;
  return {
    openingOptions,
    recommendedOpening: recommended?.opening ?? getString(payload.openingHook),
    recommendedHookScore: recommended?.hookScore ?? null,
    recommendedQualityCeiling: recommended?.qualityCeiling ?? null,
    recommendedOpeningForbiddenHitCount: recommended?.forbiddenHits.length ?? 0,
    recommendedOpeningDangerCount: recommendedDangerCount,
    recommendedOpeningWarnCount: recommendedWarnCount,
    diagnose: recommendedDiagnose,
  };
}

function hasUnsupportedSpecificClaim(text: string) {
  const normalized = text.replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }
  const numericToken = /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两]+)\s*(?:天|小时|分钟|周|月|年|倍|%|％|美元|美金|元|万|亿|人|家|次)/;
  const timeTokens = normalized.match(/(?:\d+(?:\.\d+)?|[一二三四五六七八九十百千万两]+)(?:天|小时|分钟|周|月|年)/g) ?? [];
  const efficiencyCompression = /(?:压到|缩短到|降到|提升到|增长到|从.+到)/;
  return (numericToken.test(text) && efficiencyCompression.test(normalized)) || timeTokens.length >= 2;
}

function mapDeepWriteOutput(value: unknown, fallback: Record<string, unknown>) {
  const record = getRecord(value) ?? {};
  const sectionTasks = getRecordArray(record.sectionTasks);
  const factAnchors = getStringArray(record.factAnchors, 8);
  return {
    writingPlan: getString(record.writingPlan) || getString(fallback.writingPlan),
    sectionTasks: sectionTasks.length > 0 ? sectionTasks : getRecordArray(fallback.sectionTasks),
    factAnchors: factAnchors.length > 0 ? factAnchors : getStringArray(fallback.factAnchors, 8),
  };
}

function mapFactCheckOutput(payload: Record<string, unknown>) {
  const checks = getRecordArray(payload.checks);
  return {
    verifiedClaims: checks.filter((item) => getString(item.status) === "verified").map((item) => getString(item.claim)).filter(Boolean),
    needsEvidence: checks.filter((item) => getString(item.status) === "needs_source").map((item) => getString(item.claim)).filter(Boolean),
    highRiskClaims: checks.filter((item) => getString(item.status) === "risky").map((item) => getString(item.claim)).filter(Boolean),
    missingEvidence: getStringArray(payload.missingEvidence, 6),
    overallRisk: getString(payload.overallRisk),
  };
}

function mapProsePolishOutput(payload: Record<string, unknown>, polishedMarkdown: string) {
  return {
    polishedMarkdown,
    changes: getRecordArray(payload.issues).map((item) => ({
      type: getString(item.type),
      example: getString(item.example),
      suggestion: getString(item.suggestion),
    })),
    noNewFactsCheck: true,
    rewrittenLead: getString(payload.rewrittenLead),
    punchlines: getStringArray(payload.punchlines, 4),
  };
}

function buildDeepWriteFallback(detail: AutomationRunDetail) {
  const outline = getRecord(detail.stages.find((item) => item.stageCode === "outlinePlanning")?.outputJson) ?? {};
  const sections = getRecordArray(outline.sections);
  return {
    writingPlan: getString(getRecord(outline.claimMap)?.centralThesis) || `围绕「${detail.run.inputText.slice(0, 32)}」推进判断、证据和结论。`,
    sectionTasks: sections.map((item, index) => ({
      order: index + 1,
      heading: getString(item.heading) || `章节 ${index + 1}`,
      goal: getString(item.goal),
      evidenceHints: getStringArray(item.evidenceHints, 4),
    })),
    factAnchors: sections.flatMap((item) => getStringArray(item.evidenceHints, 2)).slice(0, 6),
  };
}

function summarizeStageInputs(detail: AutomationRunDetail) {
  return Object.fromEntries(
    detail.stages
      .filter((stage) => stage.status === "completed")
      .map((stage) => [stage.stageCode, stage.outputJson]),
  );
}

function getSupportedStageCodes(detail: AutomationRunDetail) {
  if (detail.run.automationLevel === "strategyOnly") {
    return new Set(Array.from(STRATEGY_ONLY_STAGE_CODES));
  }
  const allStageCodes = PLAN22_STAGE_PROMPT_DEFINITIONS.map((item) => item.stageCode);
  if (isFastDraftPreview(detail)) {
    return new Set(allStageCodes.filter((stageCode) => !DRAFT_PREVIEW_FAST_SKIPPED_STAGE_CODES.has(stageCode)));
  }
  return new Set(allStageCodes);
}

function getStage(detail: AutomationRunDetail, stageCode: string) {
  const stage = detail.stages.find((item) => item.stageCode === stageCode);
  if (!stage) {
    throw new Error(`自动化阶段不存在：${stageCode}`);
  }
  return stage;
}

function buildAutomationArticleTitle(inputText: string) {
  const normalized = inputText
    .replace(/\s+/g, " ")
    .replace(/^请(?:帮我)?(?:生成|写)(?:一篇)?关于/u, "")
    .replace(/^生成(?:一篇)?关于/u, "")
    .replace(/^写(?:一篇)?关于/u, "")
    .replace(/并同步到(?:微信)?草稿箱[。！!]?$/u, "")
    .replace(/的公众号文章[。！!]?$/u, "")
    .replace(/公众号文章[。！!]?$/u, "")
    .trim();
  if (!normalized) return "AI 自动生成稿件";
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

async function resolvePromptContext(userId: number): Promise<AutomationPromptContext> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("自动化运行对应用户不存在");
  }
  return {
    userId,
    role: user.role,
    planCode: await getEffectivePlanCodeForUser(user.id, user.plan_code),
  };
}

async function ensureAutomationArticle(detail: AutomationRunDetail) {
  if (detail.run.articleId) {
    return detail;
  }
  const article = await createArticle(
    detail.run.userId,
    buildAutomationArticleTitle(detail.run.inputText),
    detail.run.targetSeriesId,
  );
  if (!article) {
    throw new Error("自动化运行创建稿件失败");
  }
  const rebound = await bindArticleToAutomationRun({
    runId: detail.run.id,
    userId: detail.run.userId,
    articleId: article.id,
  });
  if (!rebound) {
    throw new Error("自动化运行回写稿件失败");
  }
  return rebound;
}

async function loadFrozenPrompt(stage: ArticleAutomationStageRun, context: AutomationPromptContext): Promise<AutomationPromptMeta> {
  const db = getDatabase();
  const frozen = await db.queryOne<{ prompt_content: string }>(
    "SELECT prompt_content FROM prompt_versions WHERE prompt_id = ? AND version = ? LIMIT 1",
    [stage.promptId, stage.promptVersion],
  );
  if (frozen?.prompt_content) {
    return {
      promptId: stage.promptId,
      version: stage.promptVersion,
      ref: `${stage.promptId}@${stage.promptVersion}`,
      content: frozen.prompt_content,
      resolutionMode: "frozen",
      resolutionReason: "automation_stage_snapshot",
    };
  }
  const fallback = await loadPromptWithMeta(stage.promptId, context);
  return {
    promptId: fallback.promptId,
    version: fallback.version,
    ref: fallback.ref,
    content: fallback.content,
    resolutionMode: fallback.resolutionMode,
    resolutionReason: fallback.resolutionReason,
  };
}

async function executeTopicAnalysis(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  const stage = getStage(detail, "topicAnalysis");
  const promptMeta = await loadFrozenPrompt(stage, promptContext);
  const sourceGrounding = await loadAutomationSourceGrounding(detail);
  const systemSegments = buildGatewaySystemSegments([
    { text: promptMeta.content, cacheable: true },
    { text: ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT, cacheable: true },
  ]);
  const fallback = buildTopicAnalysisFallback(detail, sourceGrounding);
  const articleTitle = detail.article?.title || detail.run.inputText;
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"theme":"字符串","coreAssertion":"字符串","whyNow":"字符串","readerBenefit":"字符串","risk":"字符串","decision":"go|revise|hold","repairActions":[""]}',
    `起稿方式：${detail.run.inputMode}`,
    `自动化级别：${detail.run.automationLevel}`,
    `当前标题：${articleTitle}`,
    `用户输入：${detail.run.inputText}`,
    detail.run.sourceUrl ? `来源链接：${detail.run.sourceUrl}` : null,
    sourceGrounding?.loaded
      ? [
          "链接起稿约束：必须以来源正文作为选题事实源；用户输入里的流程、发布、草稿箱要求只作为执行约束，不得作为文章主题。",
          `来源标题：${sourceGrounding.sourceTitle || "未识别标题"}`,
          `来源正文摘录：${sourceGrounding.sourceExcerpt}`,
        ].join("\n")
      : null,
    sourceGrounding && !sourceGrounding.loaded
      ? `来源正文抓取失败：${sourceGrounding.error || "未知错误"}。抓取成功前不要把用户的自动化流程描述改写成文章主题，应输出 hold 或 revise。`
      : null,
  ].filter(Boolean).join("\n");

  try {
    const result = await generateSceneText({
      sceneCode: "topicAnalysis",
      systemPrompt: promptMeta.content,
      systemSegments,
      userPrompt,
      temperature: 0.2,
      rolloutUserId: detail.run.userId,
      maxAttempts: 1,
      requestTimeoutMs: AUTOMATION_SCENE_REQUEST_TIMEOUT_MS,
    });
    const output = normalizeTopicAnalysisOutput(extractJsonObject(result.text), buildGroundedTopicSeed(detail, sourceGrounding));
    return {
      outputJson: output,
      qualityJson: {
        promptVersionRef: promptMeta.ref,
        decision: output.decision,
        sourceGrounding: sourceGroundingAudit(sourceGrounding),
      },
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    return {
      outputJson: fallback,
      qualityJson: {
        promptVersionRef: promptMeta.ref,
        fallbackUsed: true,
        error: error instanceof Error ? error.message : "topic analysis failed",
        sourceGrounding: sourceGroundingAudit(sourceGrounding),
      },
      provider: "local",
      model: "fallback-local",
    };
  }
}

async function executeResearchBrief(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行研究简报。");
  }
  const topicAnalysis = getRecord(getStage(detail, "topicAnalysis").outputJson) ?? {};
  const sourceGrounding = await loadAutomationSourceGrounding(detail);
  const sourceFragmentId = await ensureAutomationSourceFragment(detail, sourceGrounding);
  const groundedResearchObject = sourceGrounding?.loaded
    ? sourceGrounding.sourceTitle || truncateGroundingText(sourceGrounding.sourceExcerpt, 80)
    : detail.article?.title || detail.run.inputText;
  const sourceMustCoverAngles = sourceGrounding?.loaded
    ? [`原文核心观点：${truncateGroundingText(sourceGrounding.sourceExcerpt, 160)}`]
    : [];
  const maxAttempts = Number(process.env.PLAN22_RESEARCH_BRIEF_ATTEMPTS || 1) > 1 && process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT ? 2 : 1;
  let artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "researchBrief",
    researchSearchHints: {
      topicTheme: sourceGrounding?.loaded ? groundedResearchObject : getString(topicAnalysis.theme) || groundedResearchObject,
      coreAssertion: getString(topicAnalysis.coreAssertion),
      whyNow: getString(topicAnalysis.whyNow),
      researchObject: groundedResearchObject,
      mustCoverAngles: sourceMustCoverAngles,
    },
  });
  let payload = getRecord(artifact.payload) ?? {};
  let gate = getResearchBriefGenerationGate(payload);

  for (let attempt = 2; attempt <= maxAttempts && gate.sufficiency !== "ready"; attempt += 1) {
    artifact = await generateArticleStageArtifact({
      articleId: detail.run.articleId,
      userId: detail.run.userId,
      stageCode: "researchBrief",
      researchSearchHints: {
        topicTheme: sourceGrounding?.loaded ? groundedResearchObject : getString(topicAnalysis.theme) || groundedResearchObject,
        coreAssertion: getString(topicAnalysis.coreAssertion),
        whyNow: getString(topicAnalysis.whyNow),
        researchObject: getString(payload.researchObject) || groundedResearchObject,
        coreQuestion: getString(payload.coreQuestion),
        mustCoverAngles: [...getStringArray(payload.mustCoverAngles, 5), ...sourceMustCoverAngles],
        missingCategories: getStringArray(getRecord(payload.sourceCoverage)?.missingCategories, 5),
      },
    });
    payload = getRecord(artifact.payload) ?? {};
    gate = getResearchBriefGenerationGate(payload);
  }

  const outputJson = mapResearchBriefOutput(payload);
  const inputSourceUrl = detail.run.sourceUrl;
  if (inputSourceUrl && !outputJson.sources.some((item) => item.sourceUrl === inputSourceUrl)) {
    outputJson.sources = [
      ...outputJson.sources,
      {
        label: (() => {
          try {
            return new URL(inputSourceUrl).hostname.replace(/^www\./, "");
          } catch {
            return "起稿原始链接";
          }
        })(),
        sourceType: "url",
        detail: "链接起稿用户提供的原始信源",
        sourceUrl: inputSourceUrl,
      },
    ];
  }
  const externalResearch = getRecord(payload.externalResearch) ?? {};
  return {
    outputJson,
    qualityJson: {
      artifactSummary: artifact.summary,
      artifactStatus: artifact.status,
      promptVersionRefs: getStringArray(getRecord(payload.runtimeMeta)?.promptVersionRefs, 8),
      researchCoverage: getRecord(payload.sourceCoverage) ?? {},
      researchGate: gate,
      researchAttemptCount: maxAttempts,
      sourceGrounding: sourceGroundingAudit(sourceGrounding, sourceFragmentId),
    },
    searchTraceJson: {
      ...externalResearch,
      sourceGrounding: sourceGroundingAudit(sourceGrounding, sourceFragmentId),
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

async function getPostStageBlocker(detail: AutomationRunDetail, stageCode: string) {
  if (stageCode !== "researchBrief" || detail.run.automationLevel === "strategyOnly" || !detail.run.articleId) {
    return null;
  }
  if (!process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT) {
    return null;
  }
  const artifact = await getArticleStageArtifact(detail.run.articleId, detail.run.userId, "researchBrief");
  const gate = getResearchBriefGenerationGate(artifact?.payload);
  if (gate.sufficiency === "ready" || gate.sufficiency === "limited") {
    return null;
  }
  if (detail.run.automationLevel === "draftPreview") {
    const sourceCount = getRecordArray(getRecord(artifact?.payload)?.sources).length;
    if (sourceCount > 0) {
      return null;
    }
  }
  return gate.generationBlockReason || "研究简报仍未达到可写阈值，先补齐信源覆盖。";
}

async function executeAudienceAnalysis(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行受众分析。");
  }
  const artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "audienceAnalysis",
    forceLocal: shouldUseFastLocalStrategy(detail),
  });
  const payload = getRecord(artifact.payload) ?? {};
  return {
    outputJson: mapAudienceAnalysisOutput(payload),
    qualityJson: {
      artifactSummary: artifact.summary,
      artifactStatus: artifact.status,
      fastLocalStrategy: shouldUseFastLocalStrategy(detail),
      promptVersionRefs: getStringArray(getRecord(payload.runtimeMeta)?.promptVersionRefs, 8),
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

async function executeOutlinePlanning(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行大纲规划。");
  }
  const artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "outlinePlanning",
    skipOutlineOptionRefresh: isFastDraftPreview(detail),
  });
  const payload = getRecord(artifact.payload) ?? {};
  return {
    outputJson: mapOutlinePlanningOutput(payload),
    qualityJson: {
      artifactSummary: artifact.summary,
      artifactStatus: artifact.status,
      titleAuditedAt: getString(payload.titleAuditedAt),
      openingAuditedAt: getString(payload.openingAuditedAt),
      outlineOptionRefreshSkipped: payload.outlineOptionRefreshSkipped === true,
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

async function executeTitleOptimization(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行标题优化。");
  }
  const existingArtifact = await getArticleStageArtifact(detail.run.articleId, detail.run.userId, "outlinePlanning");
  const existingPayload = getRecord(existingArtifact?.payload) ?? {};
  const outlineOptionRefreshSkipped = existingPayload.outlineOptionRefreshSkipped === true;
  if (existingArtifact?.status === "ready" && hasUsableTitleOptions(existingPayload) && !outlineOptionRefreshSkipped) {
    const outputJson = mapTitleOptimizationOutput(existingPayload);
    const qualityIssues = getTitleOptimizationGateIssues(outputJson);
    if (qualityIssues.length === 0) {
      const stageMeta = getStageProviderMeta(existingPayload, "titleOptimizer", existingArtifact.provider, existingArtifact.model);
      return {
        outputJson,
        qualityJson: {
          titleAuditedAt: getString(existingPayload.titleAuditedAt),
          titleOptionCount: getRecordArray(existingPayload.titleOptions).length,
          reusedFromOutlinePlanning: true,
          qualityRetryCount: 0,
          qualityGatePassed: true,
        },
        provider: stageMeta.provider,
        model: stageMeta.model,
      };
    }
  }

  let artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "outlinePlanning",
    outlineTitleOptionsOnly: true,
  });
  let payload = getRecord(artifact.payload) ?? {};
  let outputJson = mapTitleOptimizationOutput(payload);
  let qualityIssues = getTitleOptimizationGateIssues(outputJson);
  let attemptCount = 1;

  while (qualityIssues.length > 0 && attemptCount < TITLE_OPTIMIZATION_MAX_ATTEMPTS) {
    artifact = await generateArticleStageArtifact({
      articleId: detail.run.articleId,
      userId: detail.run.userId,
      stageCode: "outlinePlanning",
      outlineTitleOptionsOnly: true,
    });
    payload = getRecord(artifact.payload) ?? {};
    outputJson = mapTitleOptimizationOutput(payload);
    qualityIssues = getTitleOptimizationGateIssues(outputJson);
    attemptCount += 1;
  }

  if (qualityIssues.length > 0) {
    throw new AutomationStageBlockedError(
      `标题优化未达到质量门槛：${formatOptimizationGateIssues(qualityIssues)}`,
      "title_optimization_quality_blocked",
    );
  }

  const stageMeta = getStageProviderMeta(payload, "titleOptimizer", artifact.provider, artifact.model);
  return {
    outputJson,
    qualityJson: {
      titleAuditedAt: getString(payload.titleAuditedAt),
      titleOptionCount: getRecordArray(payload.titleOptions).length,
      reusedFromOutlinePlanning: false,
      qualityRetryCount: Math.max(0, attemptCount - 1),
      qualityGatePassed: true,
    },
    provider: stageMeta.provider,
    model: stageMeta.model,
  };
}

async function executeOpeningOptimization(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行开头优化。");
  }
  const existingArtifact = await getArticleStageArtifact(detail.run.articleId, detail.run.userId, "outlinePlanning");
  const existingPayload = getRecord(existingArtifact?.payload) ?? {};
  const outlineOptionRefreshSkipped = existingPayload.outlineOptionRefreshSkipped === true;
  if (existingArtifact?.status === "ready" && hasUsableOpeningOptions(existingPayload) && !outlineOptionRefreshSkipped) {
    const outputJson = mapOpeningOptimizationOutput(existingPayload);
    const qualityIssues = getOpeningOptimizationGateIssues(outputJson);
    if (qualityIssues.length === 0) {
      const stageMeta = getStageProviderMeta(existingPayload, "openingOptimizer", existingArtifact.provider, existingArtifact.model);
      return {
        outputJson,
        qualityJson: {
          openingAuditedAt: getString(existingPayload.openingAuditedAt),
          openingOptionCount: getRecordArray(existingPayload.openingOptions).length,
          reusedFromOutlinePlanning: true,
          qualityRetryCount: 0,
          qualityGatePassed: true,
        },
        provider: stageMeta.provider,
        model: stageMeta.model,
      };
    }
  }

  let artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "outlinePlanning",
    outlineOpeningOptionsOnly: true,
  });
  let payload = getRecord(artifact.payload) ?? {};
  let outputJson = mapOpeningOptimizationOutput(payload);
  let qualityIssues = getOpeningOptimizationGateIssues(outputJson);
  let attemptCount = 1;

  while (qualityIssues.length > 0 && attemptCount < OPENING_OPTIMIZATION_MAX_ATTEMPTS) {
    artifact = await generateArticleStageArtifact({
      articleId: detail.run.articleId,
      userId: detail.run.userId,
      stageCode: "outlinePlanning",
      outlineOpeningOptionsOnly: true,
    });
    payload = getRecord(artifact.payload) ?? {};
    outputJson = mapOpeningOptimizationOutput(payload);
    qualityIssues = getOpeningOptimizationGateIssues(outputJson);
    attemptCount += 1;
  }

  if (qualityIssues.length > 0) {
    throw new AutomationStageBlockedError(
      `开头优化未达到质量门槛：${formatOptimizationGateIssues(qualityIssues)}`,
      "opening_optimization_quality_blocked",
    );
  }

  const stageMeta = getStageProviderMeta(payload, "openingOptimizer", artifact.provider, artifact.model);
  return {
    outputJson,
    qualityJson: {
      openingAuditedAt: getString(payload.openingAuditedAt),
      openingOptionCount: getRecordArray(payload.openingOptions).length,
      reusedFromOutlinePlanning: false,
      qualityRetryCount: Math.max(0, attemptCount - 1),
      qualityGatePassed: true,
    },
    provider: stageMeta.provider,
    model: stageMeta.model,
  };
}

async function executeDeepWrite(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  const stage = getStage(detail, "deepWrite");
  const promptMeta = await loadFrozenPrompt(stage, promptContext);
  const systemSegments = buildGatewaySystemSegments([
    { text: promptMeta.content, cacheable: true },
    { text: ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT, cacheable: true },
  ]);
  const topicAnalysis = getRecord(getStage(detail, "topicAnalysis").outputJson) ?? {};
  const research = getRecord(getStage(detail, "researchBrief").outputJson) ?? {};
  const audience = getRecord(getStage(detail, "audienceAnalysis").outputJson) ?? {};
  const outline = getRecord(getStage(detail, "outlinePlanning").outputJson) ?? {};
  const fallback = buildDeepWriteFallback(detail);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"writingPlan":"字符串","sectionTasks":[{"heading":"字符串","goal":"字符串","evidenceHints":[""]}],"factAnchors":[""]}',
    `稿件标题：${detail.article?.title || detail.run.inputText}`,
    `选题主题：${getString(topicAnalysis.theme)}`,
    `核心判断：${getString(topicAnalysis.coreAssertion)}`,
    `why now：${getString(topicAnalysis.whyNow)}`,
    `读者收益：${getString(topicAnalysis.readerBenefit)}`,
    `研究摘要：${getString(research.researchSummary)}`,
    `目标读者：${getString(audience.targetReader)}`,
    `表达建议：${getStringArray(audience.toneAdvice, 4).join("；") || "暂无"}`,
    `当前大纲：${JSON.stringify(outline)}`,
  ].join("\n");

  try {
    const result = await generateSceneText({
      sceneCode: "deepWrite",
      systemPrompt: promptMeta.content,
      systemSegments,
      userPrompt,
      temperature: 0.2,
      rolloutUserId: detail.run.userId,
      maxAttempts: 1,
      requestTimeoutMs: AUTOMATION_SCENE_REQUEST_TIMEOUT_MS,
    });
    const outputJson = mapDeepWriteOutput(extractJsonObject(result.text), fallback);
    return {
      outputJson,
      qualityJson: {
        promptVersionRef: promptMeta.ref,
        sectionTaskCount: getRecordArray(outputJson.sectionTasks).length,
      },
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    return {
      outputJson: fallback,
      qualityJson: {
        promptVersionRef: promptMeta.ref,
        fallbackUsed: true,
        error: error instanceof Error ? error.message : "deep write failed",
      },
      provider: "local",
      model: "fallback-local",
    };
  }
}

async function executeArticleWrite(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法生成正文。");
  }
  const artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "deepWriting",
  });
  const payload = getRecord(artifact.payload) ?? {};
  const readinessIssues = getArticleViralReadinessGateIssues({
    researchBrief: getRecord(getStage(detail, "researchBrief").outputJson),
    titleOptimization: getRecord(getStage(detail, "titleOptimization").outputJson),
    openingOptimization: getRecord(getStage(detail, "openingOptimization").outputJson),
    deepWriting: payload,
  });
  if (readinessIssues.length > 0) {
    throw new AutomationStageBlockedError(
      `爆款文章可写性未达到质量门槛：${formatOptimizationGateIssues(readinessIssues)}`,
      "article_viral_readiness_quality_blocked",
    );
  }
  const applied = await applyArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    role: promptContext.role,
    stageCode: "deepWriting",
    skipLanguageGuardAudit: shouldSkipDraftApplyAudit(detail),
  });
  const usedEvidenceIds = Array.from(
    new Set(
      getRecordArray(payload.sectionBlueprint)
        .flatMap((item) => (Array.isArray(item.materialRefs) ? item.materialRefs : []))
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  const viralNarrativePlan = getRecord(payload.viralNarrativePlan) ?? {};
  return {
    outputJson: {
      markdown: applied.markdownContent,
      usedEvidenceIds,
      uncertainClaims: [],
    },
    qualityJson: {
      artifactSummary: artifact.summary,
      applyMode: applied.applyMode,
      command: applied.command,
      applyAuditSkipped: shouldSkipDraftApplyAudit(detail),
      articleViralReadinessGatePassed: true,
      viralNarrativeGatePassed: true,
      viralNarrativeCoreMotif: getString(viralNarrativePlan.coreMotif),
      viralNarrativeEmotionalHookCount: getStringArray(viralNarrativePlan.emotionalHooks, 8).length,
      viralNarrativeMotifCallbackCount: getRecordArray(viralNarrativePlan.motifCallbacks).length,
      viralNarrativeBoundaryRule: getString(viralNarrativePlan.boundaryRule),
      fictionalMaterialCount: getRecordArray(payload.fictionalMaterialPlan).length,
      fictionalMaterialGatePassed: true,
      promptVersionRefs: getStringArray(getRecord(payload.runtimeMeta)?.promptVersionRefs, 8),
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

function hasBlockingFactRisk(payload: Record<string, unknown>) {
  const checks = getRecordArray(payload.checks);
  return (
    getString(payload.overallRisk) === "high"
    || checks.some((item) => getString(item.status) === "risky")
    || getStringArray(payload.missingEvidence, 8).length > 0
  );
}

function hasHighRiskFactClaim(payload: Record<string, unknown>) {
  const checks = getRecordArray(payload.checks);
  return getString(payload.overallRisk) === "high" || checks.some((item) => getString(item.status) === "risky");
}

async function executeFactCheck(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行事实核查。");
  }
  const fullAutoRepairEnabled = process.env.PLAN22_FACT_RISK_AUTO_REPAIR === "1";
  const highRiskAutoRepairEnabled = process.env.PLAN22_FACT_RISK_AUTO_REPAIR !== "0";
  const fastLocalReview = shouldUseFastLocalReview(detail);
  let artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "factCheck",
    forceLocal: fastLocalReview,
  });
  let payload = getRecord(artifact.payload) ?? {};
  const repairAttempts: Array<Record<string, unknown>> = [];
  for (
    let attempt = 0;
    !fastLocalReview
      && attempt < 2
      && (
        fullAutoRepairEnabled
          ? hasBlockingFactRisk(payload)
          : highRiskAutoRepairEnabled && hasHighRiskFactClaim(payload)
      );
    attempt += 1
  ) {
    const repair = await runFactRiskRepairWithRetries({
      articleId: detail.run.articleId,
      userId: detail.run.userId,
      promptContext,
      scope: fullAutoRepairEnabled ? "allBlocking" : "highRiskOnly",
    });
    repairAttempts.push({
      changed: repair.changed,
      provider: repair.provider,
      model: repair.model,
      error: repair.error,
      riskyClaimCount: repair.riskyClaimCount,
      needsSourceClaimCount: repair.needsSourceClaimCount,
      scope: fullAutoRepairEnabled ? "allBlocking" : "highRiskOnly",
    });
    if (!repair.changed) {
      break;
    }
    artifact = await generateArticleStageArtifact({
      articleId: detail.run.articleId,
      userId: detail.run.userId,
      stageCode: "factCheck",
    });
    payload = getRecord(artifact.payload) ?? {};
  }
  return {
    outputJson: mapFactCheckOutput(payload),
    qualityJson: {
      artifactSummary: artifact.summary,
      overallRisk: getString(payload.overallRisk),
      missingEvidenceCount: getStringArray(payload.missingEvidence, 8).length,
      fastLocalReview,
      autoRepairEnabled: !fastLocalReview && (fullAutoRepairEnabled || highRiskAutoRepairEnabled),
      autoRepairMode: fullAutoRepairEnabled ? "allBlocking" : highRiskAutoRepairEnabled ? "highRiskOnly" : "disabled",
      autoRepairAttempts: repairAttempts,
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

async function executeProsePolish(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行文笔润色。");
  }
  const artifact = await generateArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    stageCode: "prosePolish",
    forceLocal: shouldUseFastLocalReview(detail),
  });
  const applied = await applyArticleStageArtifact({
    articleId: detail.run.articleId,
    userId: detail.run.userId,
    role: promptContext.role,
    stageCode: "prosePolish",
    localOnly: shouldUseFastLocalReview(detail),
  });
  const payload = getRecord(artifact.payload) ?? {};
  return {
    outputJson: mapProsePolishOutput(payload, applied.markdownContent),
    qualityJson: {
      artifactSummary: artifact.summary,
      applyMode: applied.applyMode,
      fastLocalReview: shouldUseFastLocalReview(detail),
      issueCount: getRecordArray(payload.issues).length,
      languageGuardHitCount: getRecordArray(payload.languageGuardHits).length,
    },
    provider: artifact.provider,
    model: artifact.model,
  };
}

async function executeLanguageGuardAudit(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行语言守卫复核。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法执行语言守卫复核。");
  }
  const rules = await getLanguageGuardRules(detail.run.userId);
  const hits = collectLanguageGuardHits(article.markdown_content || "", rules).slice(0, 12);
  const repair = await runLanguageGuardAuditWithRetries({
    articleId: article.id,
    userId: detail.run.userId,
    promptContext,
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: detail.run.userId,
    stageCode: "prosePolish",
    payloadPatch: {
      languageGuardHits: repair.remainingHits,
    },
  }).catch(() => undefined);
  return {
    outputJson: {
      violations: hits.map((item) => ({
        ruleId: item.ruleId,
        ruleKind: item.ruleKind,
        matchMode: item.matchMode,
        matchedText: item.matchedText,
        patternText: item.patternText,
        rewriteHint: item.rewriteHint,
        severity: item.severity,
        scope: item.scope,
      })),
      fixedMarkdown: repair.fixedMarkdown,
    },
    qualityJson: {
      aiReviewed: repair.provider !== null,
      hitCount: repair.hitCount,
      attemptsUsed: repair.changed ? 1 : 0,
      aiNoiseScore: repair.aiNoiseScore,
      error: repair.error,
    },
    provider: repair.provider ?? "local",
    model: repair.model ?? "fallback-local",
  };
}

async function executeCoverImageBrief(detail: AutomationRunDetail, promptContext: AutomationPromptContext): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法生成封面图 brief。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法生成封面图 brief。");
  }
  const stage = getStage(detail, "coverImageBrief");
  const promptMeta = await loadFrozenPrompt(stage, promptContext);
  const currentCover = await getLatestArticleCoverImage(detail.run.userId, article.id);
  const existingCoverBrief = (await listArticleVisualBriefs(detail.run.userId, article.id)).find((brief) => brief.visualScope === "cover") ?? null;
  const saved = existingCoverBrief
    ? [existingCoverBrief]
    : await replaceArticleVisualBriefs({
        userId: detail.run.userId,
        articleId: article.id,
        briefs: await planArticleVisualBriefs({
          userId: detail.run.userId,
          articleId: article.id,
          title: article.title,
          markdown: article.markdown_content,
          includeCover: true,
          includeInline: false,
        }),
      });
  const coverBrief = saved.find((brief) => brief.visualScope === "cover");
  if (!coverBrief) {
    throw new AutomationStageBlockedError("封面图 brief 规划失败。");
  }
  return {
    outputJson: {
      prompt: coverBrief.promptText,
      negativePrompt: coverBrief.negativePrompt,
      altText: coverBrief.altText,
      style: coverBrief.styleCode || coverBrief.renderingCode,
      baoyuSkill: coverBrief.baoyuSkill,
      visualType: coverBrief.visualType,
      palette: coverBrief.paletteCode,
      rendering: coverBrief.renderingCode,
      text: coverBrief.textLevel,
      mood: coverBrief.moodCode,
      font: coverBrief.fontCode,
      aspectRatio: coverBrief.aspectRatio,
      outputResolution: coverBrief.outputResolution,
      promptHash: coverBrief.promptHash,
      promptManifest: coverBrief.promptManifest,
    },
    qualityJson: {
      promptVersionRef: promptMeta.ref,
      hasExistingCover: Boolean(currentCover),
      baoyuPresetVersion: "2026-04-27",
      promptManifestRecorded: Boolean(coverBrief.promptManifest),
      reusedExistingVisualBrief: Boolean(existingCoverBrief),
    },
    provider: "local",
    model: "baoyu-compatible-cover-planner",
  };
}

async function executeLayoutApply(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法生成排版预览。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法生成排版预览。");
  }
  return {
    outputJson: {
      templateId: article.wechat_template_id || "default-auto",
      html: article.html_content || "",
      previewWarnings: article.html_content ? [] : ["当前 HTML 预览为空，请先确认正文是否已成功保存。"],
    },
    qualityJson: {
      htmlLength: String(article.html_content || "").length,
      hasTemplate: Boolean(article.wechat_template_id),
    },
    provider: "local",
    model: "rendered-html",
  };
}

async function executeInlineImagePlan(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法规划文中配图。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法规划文中配图。");
  }
  const existingBriefs = await listArticleVisualBriefs(detail.run.userId, article.id);
  const hasCoverBrief = existingBriefs.some((brief) => brief.visualScope === "cover");
  const planned = await planArticleVisualBriefs({
    userId: detail.run.userId,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
    includeCover: !hasCoverBrief,
    includeInline: true,
  });
  const saved = await replaceArticleVisualBriefs({
    userId: detail.run.userId,
    articleId: article.id,
    briefs: planned,
  });
  const inlineBriefs = saved.filter((brief) => brief.visualScope !== "cover");
  return {
    outputJson: {
      imageCount: inlineBriefs.length,
      briefs: inlineBriefs.map((brief) => ({
        id: brief.id,
        visualScope: brief.visualScope,
        visualType: brief.visualType,
        baoyuSkill: brief.baoyuSkill,
        targetAnchor: brief.targetAnchor,
        title: brief.title,
        purpose: brief.purpose,
        promptHash: brief.promptHash,
        status: brief.status,
      })),
      promptHashes: inlineBriefs.map((brief) => brief.promptHash).filter(Boolean),
    },
    qualityJson: {
      provider: "local",
      baoyuPresetVersion: "2026-04-27",
      coverBriefPlanned: saved.some((brief) => brief.visualScope === "cover"),
      reusedExistingCoverBrief: hasCoverBrief,
    },
    provider: "local",
    model: "baoyu-compatible-planner",
  };
}

async function executeInlineImageGenerate(detail: AutomationRunDetail): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法生成文中配图。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法生成文中配图。");
  }
  let briefs = (await listArticleVisualBriefs(detail.run.userId, article.id)).filter((brief) => brief.visualScope !== "cover");
  if (briefs.length === 0) {
    const planned = await planArticleVisualBriefs({
      userId: detail.run.userId,
      articleId: article.id,
      title: article.title,
      markdown: article.markdown_content,
      includeCover: false,
      includeInline: true,
    });
    briefs = (await replaceArticleVisualBriefs({
      userId: detail.run.userId,
      articleId: article.id,
      briefs: planned,
    })).filter((brief) => brief.visualScope !== "cover");
  }

  const generated: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  const pendingBriefs = briefs.filter((item) => item.status !== "generated" && item.status !== "inserted");
  const generationResults = await mapWithConcurrency(pendingBriefs, ARTICLE_IMAGE_BATCH_CONCURRENCY, async (brief) => {
    try {
      return {
        ok: true as const,
        value: await generateArticleVisualAsset(brief),
      };
    } catch (error) {
      return {
        ok: false as const,
        warning: `${brief.title}: ${error instanceof Error ? error.message : "图片生成失败"}`,
      };
    }
  });
  for (const result of generationResults) {
    if (result.ok) {
      generated.push(result.value);
    } else {
      warnings.push(result.warning);
    }
  }

  const refreshedArticle = await getArticleById(article.id, detail.run.userId);
  const insertion = refreshedArticle
    ? await insertArticleVisualAssetsIntoMarkdown({
        userId: detail.run.userId,
        articleId: article.id,
        title: refreshedArticle.title,
        markdown: refreshedArticle.markdown_content,
      })
    : { inserted: [] };

  return {
    outputJson: {
      generated,
      inserted: insertion.inserted,
      warnings,
    },
    qualityJson: {
      generatedCount: generated.length,
      insertedCount: insertion.inserted.length,
      warningCount: warnings.length,
      nonBlocking: true,
      pendingCount: pendingBriefs.length,
      concurrency: ARTICLE_IMAGE_BATCH_CONCURRENCY,
    },
    provider: generated.some((item) => item.assetType !== "diagram_png") ? "coverImageEngine" : "local",
    model: "article-visual-generator",
  };
}

async function executePublishGuard(
  detail: AutomationRunDetail,
  promptContext?: AutomationPromptContext,
  options?: {
    allowRepair?: boolean;
  },
): Promise<StageExecutionResult> {
  if (!detail.run.articleId) {
    throw new AutomationStageBlockedError("缺少稿件记录，无法执行发布守门。");
  }
  const article = await getArticleById(detail.run.articleId, detail.run.userId);
  if (!article) {
    throw new AutomationStageBlockedError("稿件不存在，无法执行发布守门。");
  }
  let repairApplied: string[] = [];
  let repairErrors: string[] = [];
  let result = await evaluatePublishGuard({
    articleId: article.id,
    userId: detail.run.userId,
    templateId: article.wechat_template_id,
    wechatConnectionId: detail.run.targetWechatConnectionId,
  });
  if (!result.canPublish && options?.allowRepair !== false && promptContext) {
    const repair = await runPublishAutoRepair({
      runId: detail.run.id,
      articleId: article.id,
      userId: detail.run.userId,
      promptContext,
    });
    repairApplied = repair.appliedFixes;
    repairErrors = repair.errors;
    result = await evaluatePublishGuard({
      articleId: article.id,
      userId: detail.run.userId,
      templateId: article.wechat_template_id,
      wechatConnectionId: detail.run.targetWechatConnectionId,
    });
  }
  return {
    outputJson: {
      canPublish: result.canPublish,
      blockers: result.blockers,
      warnings: result.warnings,
      repairActions: result.suggestions,
      methodologyGates: result.methodologyGates,
    },
    qualityJson: {
      checkCount: result.checks.length,
      stageReadiness: result.stageReadiness,
      connectionHealth: result.connectionHealth,
      methodologyGates: result.methodologyGates,
      autoPreparedAtStages: repairApplied,
      autoPrepareErrors: repairErrors,
    },
    provider: "local",
    model: "publish-guard",
  };
}

async function executeStage(detail: AutomationRunDetail, promptContext: AutomationPromptContext, stageCode: string) {
  if (stageCode === "topicAnalysis") return await executeTopicAnalysis(detail, promptContext);
  if (stageCode === "researchBrief") return await executeResearchBrief(detail);
  if (stageCode === "audienceAnalysis") return await executeAudienceAnalysis(detail);
  if (stageCode === "outlinePlanning") return await executeOutlinePlanning(detail);
  if (stageCode === "titleOptimization") return await executeTitleOptimization(detail);
  if (stageCode === "openingOptimization") return await executeOpeningOptimization(detail);
  if (stageCode === "deepWrite") return await executeDeepWrite(detail, promptContext);
  if (stageCode === "articleWrite") return await executeArticleWrite(detail, promptContext);
  if (stageCode === "factCheck") return await executeFactCheck(detail, promptContext);
  if (stageCode === "prosePolish") return await executeProsePolish(detail, promptContext);
  if (stageCode === "languageGuardAudit") return await executeLanguageGuardAudit(detail, promptContext);
  if (stageCode === "coverImageBrief") return await executeCoverImageBrief(detail, promptContext);
  if (stageCode === "inlineImagePlan") return await executeInlineImagePlan(detail);
  if (stageCode === "inlineImageGenerate") return await executeInlineImageGenerate(detail);
  if (stageCode === "layoutApply") return await executeLayoutApply(detail);
  if (stageCode === "publishGuard") return await executePublishGuard(detail, promptContext, { allowRepair: shouldRunPublishGuardAutoRepair(detail) });
  throw new Error(`暂不支持的自动化阶段：${stageCode}`);
}

async function refreshLayoutApplyAfterPublishRepair(
  detail: AutomationRunDetail,
  stageResult: StageExecutionResult,
) {
  const autoPreparedAtStages = getStringArray(stageResult.qualityJson?.autoPreparedAtStages, 16);
  if (autoPreparedAtStages.length === 0 || !detail.run.articleId) {
    return;
  }
  const refreshedLayout = await executeLayoutApply(detail);
  await completeArticleAutomationStageRun({
    runId: detail.run.id,
    userId: detail.run.userId,
    stageCode: "layoutApply",
    articleId: detail.run.articleId,
    provider: refreshedLayout.provider ?? null,
    model: refreshedLayout.model ?? null,
    outputJson: {
      ...refreshedLayout.outputJson,
      refreshedAfterStage: "publishGuard",
      refreshReason: "publishGuardAutoRepair",
    },
    qualityJson: {
      ...refreshedLayout.qualityJson,
      refreshedAfterStage: "publishGuard",
      autoPreparedAtStages,
    },
    searchTraceJson: refreshedLayout.searchTraceJson ?? {},
  });
}

async function applyStagePreventivePreparation(
  detail: AutomationRunDetail,
  promptContext: AutomationPromptContext,
  stageCode: string,
) {
  if (!detail.run.articleId || !detail.article) {
    return;
  }
  try {
    if (stageCode === "topicAnalysis") {
      const topicStage = detail.stages.find((stage) => stage.stageCode === "topicAnalysis") ?? null;
      const theme = getString(getRecord(topicStage?.outputJson)?.theme);
      const nextTitle = buildAutomationArticleTitle(theme || detail.run.inputText);
      if (nextTitle && nextTitle !== detail.article.title) {
        await saveArticleDraft({
          articleId: detail.run.articleId,
          userId: detail.run.userId,
          body: {
            title: nextTitle,
            markdownContent: detail.article.markdown_content,
            status: detail.article.status,
            seriesId: detail.article.series_id,
            wechatTemplateId: detail.article.wechat_template_id,
          },
        });
      }
      return;
    }
    if (stageCode === "researchBrief" || stageCode === "audienceAnalysis" || stageCode === "outlinePlanning") {
      await ensureStrategyCardPreparedForWriting({
        articleId: detail.run.articleId,
        userId: detail.run.userId,
        title: detail.article.title,
        markdownContent: detail.article.markdown_content || "",
        promptContext,
      });
      return;
    }
    if (stageCode === "titleOptimization" || stageCode === "openingOptimization") {
      const outlineArtifact = await getArticleStageArtifact(detail.run.articleId, detail.run.userId, "outlinePlanning");
      const titleStage = detail.stages.find((stage) => stage.stageCode === "titleOptimization") ?? null;
      const openingStage = detail.stages.find((stage) => stage.stageCode === "openingOptimization") ?? null;
      const currentSelection = getRecord(outlineArtifact?.payload?.selection) ?? {};
      const nextSelection = {
        ...currentSelection,
        selectedTitle: getString(getRecord(titleStage?.outputJson)?.recommendedTitle) || getString(currentSelection.selectedTitle) || null,
        selectedOpeningHook:
          getString(getRecord(openingStage?.outputJson)?.recommendedOpening)
          || getString(currentSelection.selectedOpeningHook)
          || null,
      };
      await updateArticleStageArtifactPayload({
        articleId: detail.run.articleId,
        userId: detail.run.userId,
        stageCode: "outlinePlanning",
        payloadPatch: {
          selection: nextSelection,
        },
      });
      const nextTitle = getString(nextSelection.selectedTitle);
      if (nextTitle && nextTitle !== detail.article.title) {
        await saveArticleDraft({
          articleId: detail.run.articleId,
          userId: detail.run.userId,
          body: {
            title: nextTitle,
            markdownContent: detail.article.markdown_content,
            status: detail.article.status,
            seriesId: detail.article.series_id,
            wechatTemplateId: detail.article.wechat_template_id,
          },
        });
      }
      return;
    }
    if (stageCode === "factCheck") {
      await ensureEvidencePackagePreparedForPublish({
        articleId: detail.run.articleId,
        userId: detail.run.userId,
      });
      return;
    }
    if (stageCode === "coverImageBrief") {
      await ensureCoverImagePreparedForPublish({
        articleId: detail.run.articleId,
        userId: detail.run.userId,
        title: detail.article.title,
      });
    }
  } catch {
    return;
  }
}

async function skipUnsupportedStages(detail: AutomationRunDetail) {
  const supported = getSupportedStageCodes(detail);
  for (const stage of detail.stages) {
    if (supported.has(stage.stageCode) || stage.status === "completed" || stage.status === "skipped") {
      continue;
    }
    await skipArticleAutomationStageRun({
      runId: detail.run.id,
      userId: detail.run.userId,
      stageCode: stage.stageCode,
      articleId: detail.run.articleId,
      reason: `automationLevel=${detail.run.automationLevel} 下不执行该阶段`,
    });
  }
}

function classifyStageFailureStatus(error: unknown): Extract<ArticleAutomationRunStatus, "blocked" | "failed"> {
  return error instanceof AutomationStageBlockedError ? "blocked" : "failed";
}

function shouldRunPublishGuardAutoRepair(detail: AutomationRunDetail) {
  return readBooleanEnv("ARTICLE_AUTOMATION_PUBLISH_GUARD_AUTO_REPAIR", false);
}

export async function resumeArticleAutomationRun(input: {
  runId: number;
  userId: number;
}) {
  let detail = await getArticleAutomationRunById(input.runId, input.userId);
  if (!detail) {
    throw new Error("自动化运行不存在");
  }
  if (detail.run.status === "cancelled") {
    return detail;
  }

  const promptContext = await resolvePromptContext(input.userId);
  detail = await ensureAutomationArticle(detail);
  await skipUnsupportedStages(detail);
  detail = await getArticleAutomationRunById(input.runId, input.userId);
  if (!detail) {
    throw new Error("自动化运行不存在");
  }

  for (const definition of PLAN22_STAGE_PROMPT_DEFINITIONS) {
    if (!getSupportedStageCodes(detail).has(definition.stageCode)) {
      continue;
    }
    const stage = getStage(detail, definition.stageCode);
    if (stage.status === "completed" || stage.status === "skipped") {
      continue;
    }

    await updateArticleAutomationRun({
      runId: detail.run.id,
      userId: detail.run.userId,
      articleId: detail.run.articleId,
      status: "running",
      currentStageCode: definition.stageCode,
      blockedReason: null,
    });
    await startArticleAutomationStageRun({
      runId: detail.run.id,
      userId: detail.run.userId,
      stageCode: definition.stageCode,
      articleId: detail.run.articleId,
      inputJson: {
        run: {
          inputMode: detail.run.inputMode,
          inputText: detail.run.inputText,
          sourceUrl: detail.run.sourceUrl,
          automationLevel: detail.run.automationLevel,
        },
        articleId: detail.run.articleId,
        completedStages: summarizeStageInputs(detail),
      },
    });

    try {
      const stageResult = await executeStage(detail, promptContext, definition.stageCode);
      await completeArticleAutomationStageRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        stageCode: definition.stageCode,
        articleId: detail.run.articleId,
        provider: stageResult.provider ?? null,
        model: stageResult.model ?? null,
        outputJson: stageResult.outputJson,
        qualityJson: stageResult.qualityJson ?? {},
        searchTraceJson: stageResult.searchTraceJson ?? {},
      });
      if (definition.stageCode === "publishGuard") {
        await refreshLayoutApplyAfterPublishRepair(detail, stageResult);
      }
      const refreshedAfterStage = await getArticleAutomationRunById(input.runId, input.userId);
      if (refreshedAfterStage) {
        await applyStagePreventivePreparation(refreshedAfterStage, promptContext, definition.stageCode);
        const blocker = await getPostStageBlocker(refreshedAfterStage, definition.stageCode);
        if (blocker) {
          return await updateArticleAutomationRun({
            runId: refreshedAfterStage.run.id,
            userId: refreshedAfterStage.run.userId,
            articleId: refreshedAfterStage.run.articleId,
            status: "blocked",
            currentStageCode: definition.stageCode,
            blockedReason: blocker,
          }) ?? refreshedAfterStage;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动化阶段执行失败";
      const nextStatus = classifyStageFailureStatus(error);
      await failArticleAutomationStageRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        stageCode: definition.stageCode,
        articleId: detail.run.articleId,
        status: nextStatus === "blocked" ? "blocked" : "failed",
        errorCode: error instanceof AutomationStageBlockedError ? error.code : "automation_stage_failed",
        errorMessage: message,
      });
      const blocked = await updateArticleAutomationRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        status: nextStatus,
        currentStageCode: definition.stageCode,
        blockedReason: message,
      });
      return blocked ?? detail;
    }

    detail = await getArticleAutomationRunById(input.runId, input.userId);
    if (!detail) {
      throw new Error("自动化运行不存在");
    }
    if (detail.run.status === "cancelled") {
      return detail;
    }
  }

  detail = await getArticleAutomationRunById(input.runId, input.userId);
  if (!detail) {
    throw new Error("自动化运行不存在");
  }

  if (detail.run.automationLevel === "wechatDraft") {
    let publishGuardStage = getStage(detail, "publishGuard");
    let publishGuardOutput = getRecord(publishGuardStage.outputJson) ?? {};
    if (!detail.run.targetWechatConnectionId) {
      return await updateArticleAutomationRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        status: "blocked",
        currentStageCode: "publishGuard",
        blockedReason: "缺少目标公众号连接，无法自动推送草稿箱。",
      }) ?? detail;
    }
    if (!Boolean(publishGuardOutput.canPublish) && detail.run.articleId) {
      const replayedPublishGuard = await executePublishGuard(detail, promptContext, { allowRepair: shouldRunPublishGuardAutoRepair(detail) });
      await completeArticleAutomationStageRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        stageCode: "publishGuard",
        articleId: detail.run.articleId,
        provider: replayedPublishGuard.provider ?? null,
        model: replayedPublishGuard.model ?? null,
        outputJson: replayedPublishGuard.outputJson,
        qualityJson: replayedPublishGuard.qualityJson ?? {},
        searchTraceJson: replayedPublishGuard.searchTraceJson ?? {},
      });
      detail = await getArticleAutomationRunById(input.runId, input.userId);
      if (!detail) {
        throw new Error("自动化运行不存在");
      }
      publishGuardStage = getStage(detail, "publishGuard");
      publishGuardOutput = getRecord(publishGuardStage.outputJson) ?? {};
    }
    if (!Boolean(publishGuardOutput.canPublish)) {
      return await updateArticleAutomationRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        status: "blocked",
        currentStageCode: "publishGuard",
        blockedReason: getStringArray(publishGuardOutput.blockers, 3)[0] || "发布守门未通过。",
      }) ?? detail;
    }
    if (!detail.run.articleId) {
      throw new Error("缺少稿件记录，无法推送微信公众号草稿箱。");
    }
    const targetWechatConnectionId = detail.run.targetWechatConnectionId;
    if (!targetWechatConnectionId) {
      throw new Error("缺少目标公众号连接，无法推送微信公众号草稿箱。");
    }
    try {
      const publishResult = await publishArticleToWechat({
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        wechatConnectionId: targetWechatConnectionId,
      });
      return await updateArticleAutomationRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        status: "completed",
        currentStageCode: "publishGuard",
        blockedReason: null,
        finalWechatMediaId: publishResult.mediaId,
      }) ?? detail;
    } catch (error) {
      const message = error instanceof Error ? error.message : "推送微信草稿箱失败";
      const blockedReason =
        error instanceof WechatPublishError && error.publishGuard?.blockers?.[0]
          ? error.publishGuard.blockers[0]
          : message;
      return await updateArticleAutomationRun({
        runId: detail.run.id,
        userId: detail.run.userId,
        articleId: detail.run.articleId,
        status: error instanceof WechatPublishError && !error.retryable ? "blocked" : "failed",
        currentStageCode: "publishGuard",
        blockedReason,
      }) ?? detail;
    }
  }

  return await updateArticleAutomationRun({
    runId: detail.run.id,
    userId: detail.run.userId,
    articleId: detail.run.articleId,
    status: "completed",
    currentStageCode: detail.run.currentStageCode || "publishGuard",
    blockedReason: null,
  }) ?? detail;
}
