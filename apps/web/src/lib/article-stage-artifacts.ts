import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { buildGatewaySystemSegments } from "./ai-gateway-system-segments";
import { analyzeAiNoise } from "./ai-noise-scan";
import { getMergedActiveArchetypeRhythmHints, normalizeStrategyArchetypeKey } from "./archetype-rhythm";
import { inferEvidenceResearchTag, normalizeEvidenceResearchTag } from "./article-evidence";
import { findUserById } from "./auth";
import { getDatabase } from "./db";
import { getArticleAuthoringStyleContext } from "./article-authoring-style-context";
import { getSavedArticleHistoryReferences } from "./article-history-references";
import { supplementArticleResearchSources } from "./article-research-supplement";
import {
  ARTICLE_ARTIFACT_STAGE_TITLES,
  isArticleArtifactStageCode,
  type ArticleArtifactStageCode,
  type ArticleWorkflowStageCode,
} from "./article-workflow-registry";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "./article-rollout";
import { getArticleWritingContext } from "./article-writing-context";
import { collectLanguageGuardHits, getLanguageGuardRules, getLanguageGuardTokenBlacklist, type LanguageGuardRule } from "./language-guard";
import { getUserPlanContext } from "./plan-access";
import { loadPromptWithMeta } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
import { getArticleById, getArticleOutcomeBundlesByUser, getArticlesByUser, replaceArticleResearchCards } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { scoreSemanticMatch } from "./semantic-search";
import {
  buildFallbackOpeningOptions,
  ensureSingleRecommendedOpeningOption,
  normalizeOpeningOptions,
} from "./opening-patterns";
import { TITLE_OPTION_LIMIT, buildFallbackTitleOptions, ensureSingleRecommendedTitleOption, normalizeTitleOptions } from "./title-patterns";
import { WRITING_EVAL_APPLY_COMMAND_TEMPLATES } from "./writing-eval-assets";
import { getActiveWritingEvalScoringProfile } from "./writing-eval";
import { buildWritingDiversityReport } from "./writing-diversity";
import { buildWritingStateKernel, type ArticlePrototypeCode, type WritingStateVariantCode } from "./writing-state";

function withStageGenerationTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

const ARTICLE_STAGE_ARTIFACT_TIMEOUT_MS = readPositiveIntegerEnv("ARTICLE_STAGE_ARTIFACT_TIMEOUT_MS", 300_000);
const ARTICLE_STAGE_OPTION_TIMEOUT_MS = readPositiveIntegerEnv("ARTICLE_STAGE_OPTION_TIMEOUT_MS", 120_000);
const RESEARCH_BRIEF_ARTIFACT_TIMEOUT_MS = readPositiveIntegerEnv("RESEARCH_BRIEF_ARTIFACT_TIMEOUT_MS", 180_000);
const FACT_CHECK_ARTIFACT_TIMEOUT_MS = readPositiveIntegerEnv("FACT_CHECK_ARTIFACT_TIMEOUT_MS", 120_000);
const ARTICLE_STAGE_ARTIFACT_MAX_ATTEMPTS = readPositiveIntegerEnv("ARTICLE_STAGE_ARTIFACT_MAX_ATTEMPTS", 1);

export type ArticleStageArtifactStatus = "ready" | "failed";

export type ArticleStageArtifact = {
  stageCode: ArticleArtifactStageCode;
  title: string;
  status: ArticleStageArtifactStatus;
  summary: string | null;
  payload: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type ArtifactRow = {
  id: number;
  article_id: number;
  stage_code: ArticleArtifactStageCode;
  status: ArticleStageArtifactStatus;
  summary: string | null;
  payload_json: string | Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type GenerationContext = {
  userId: number;
  userRole: "admin" | "user";
  planCode: string;
  article: {
    id: number;
    title: string;
    markdownContent: string;
  };
  persona: {
    name: string;
    summary?: string | null;
    identityTags: string[];
    writingStyleTags: string[];
    domainKeywords?: string[];
    argumentPreferences?: string[];
    toneConstraints?: string[];
    audienceHints?: string[];
    sourceMode?: string;
    boundWritingStyleProfileName?: string | null;
  } | null;
  writingStyleProfile: {
    name: string;
    summary: string;
    toneKeywords: string[];
    sentenceLengthProfile?: string | null;
    paragraphBreathingPattern?: string | null;
    structurePatterns: string[];
    transitionPatterns?: string[];
    languageHabits: string[];
    openingPatterns: string[];
    endingPatterns: string[];
    punctuationHabits?: string[];
    tangentPatterns?: string[];
    callbackPatterns?: string[];
    tabooPatterns?: string[];
    statePresets?: string[];
    antiOutlineRules?: string[];
    doNotWrite: string[];
    imitationPrompt: string;
  } | null;
  layoutStrategy: {
    id: number;
    code: string;
    name: string;
    config: Record<string, unknown>;
    resolutionMode: "explicit" | "rollout" | "active";
    resolutionReason: string;
  } | null;
  scoringProfile: {
    code: string;
    name: string;
  } | null;
  fragments: string[];
  evidenceFragments: Array<{
    id: number;
    title: string | null;
    rawContent: string | null;
    distilledContent: string;
    sourceType: string;
    sourceUrl: string | null;
    screenshotPath: string | null;
    sourceMeta: Record<string, unknown> | null;
    usageMode: string;
  }>;
  imageFragments: Array<{
    id: number;
    title: string | null;
    screenshotPath: string;
  }>;
  outlineNodes: Array<{ title: string; description: string | null }>;
  knowledgeCards: Array<{
    id: number;
    title: string;
    summary: string | null;
    keyFacts: string[];
    openQuestions: string[];
    latestChangeSummary: string | null;
    overturnedJudgements: string[];
    status: string;
    confidenceScore: number;
    matchedFragmentCount: number;
  }>;
  seriesInsight: {
    label: string | null;
    reason: string | null;
    commonTerms: string[];
    coreStances: string[];
    driftRisks: string[];
    backgroundChecklist: string[];
    whyNow: string[];
    preHook?: string | null;
    postHook?: string | null;
    platformPreference?: string | null;
    targetPackHint?: string | null;
    defaultArchetype?: string | null;
    defaultLayoutTemplateId?: string | null;
    rhythmOverride?: Record<string, unknown> | null;
    relatedArticleCount: number;
  } | null;
  strategyCard: {
    archetype: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
    mainstreamBelief: string | null;
    targetReader: string | null;
    coreAssertion: string | null;
    whyNow: string | null;
    researchHypothesis: string | null;
    marketPositionInsight: string | null;
    historicalTurningPoint: string | null;
    endingAction: string | null;
  } | null;
  humanSignals: {
    firstHandObservation: string | null;
    feltMoment: string | null;
    whyThisHitMe: string | null;
    realSceneOrDialogue: string | null;
    wantToComplain: string | null;
    nonDelegableTruth: string | null;
    score: number;
  } | null;
  bannedWords: string[];
  languageGuardRules: LanguageGuardRule[];
  audienceSelection: {
    selectedReaderLabel: string | null;
    selectedLanguageGuidance: string | null;
    selectedBackgroundAwareness: string | null;
    selectedReadabilityLevel: string | null;
    selectedCallToAction: string | null;
  } | null;
  researchBrief: Record<string, unknown> | null;
  outlineSelection: {
    selectedTitle: string | null;
    selectedTitleStyle: string | null;
    selectedOpeningHook: string | null;
    selectedTargetEmotion: string | null;
    selectedEndingStrategy: string | null;
  } | null;
  outlinePlan: Record<string, unknown> | null;
  supplementalViewpoints: string[];
  recentArticles: Array<{
    id: number;
    title: string;
    markdownContent: string;
    updatedAt: string;
  }>;
  recentDeepWritingStates: Array<{
    id: number;
    title: string;
    updatedAt: string;
    payload: Record<string, unknown> | null;
  }>;
  deepWritingOutcomeFeedback: {
    articleSampleCount: number;
    prototypeSignals: Map<string, {
      code: string;
      label: string;
      sampleCount: number;
      hitCount: number;
      nearMissCount: number;
      missCount: number;
      positiveSampleCount: number;
      followedRecommendationSampleCount: number;
      followedRecommendationPositiveCount: number;
      performanceScore: number;
      rankingAdjustment: number;
      reason: string;
    }>;
    stateSignals: Map<string, {
      code: string;
      label: string;
      sampleCount: number;
      hitCount: number;
      nearMissCount: number;
      missCount: number;
      positiveSampleCount: number;
      followedRecommendationSampleCount: number;
      followedRecommendationPositiveCount: number;
      performanceScore: number;
      rankingAdjustment: number;
      reason: string;
    }>;
  } | null;
  historyReferences: Array<{
    referencedDocumentId: number;
    title: string;
    relationReason: string | null;
    bridgeSentence: string | null;
  }>;
};

type DeepWritingOutcomeSignal = {
  code: string;
  label: string;
  sampleCount: number;
  hitCount: number;
  nearMissCount: number;
  missCount: number;
  positiveSampleCount: number;
  followedRecommendationSampleCount: number;
  followedRecommendationPositiveCount: number;
  performanceScore: number;
  rankingAdjustment: number;
  reason: string;
};

type DeepWritingOutcomeBucket = Omit<DeepWritingOutcomeSignal, "rankingAdjustment" | "reason">;

function parsePayload(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function uniqueStrings(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPreferredResearchSignals(context: GenerationContext) {
  const researchWriteback = normalizeRecord(context.researchBrief?.strategyWriteback);
  return {
    targetReader:
      String(context.strategyCard?.targetReader || "").trim()
      || String(researchWriteback?.targetReader || "").trim(),
    coreAssertion:
      String(context.strategyCard?.coreAssertion || "").trim()
      || String(researchWriteback?.coreAssertion || "").trim(),
    whyNow:
      String(context.strategyCard?.whyNow || "").trim()
      || String(researchWriteback?.whyNow || "").trim()
      || String(context.strategyCard?.researchHypothesis || "").trim()
      || String(researchWriteback?.researchHypothesis || "").trim(),
    researchHypothesis:
      String(context.strategyCard?.researchHypothesis || "").trim()
      || String(researchWriteback?.researchHypothesis || "").trim(),
    marketPositionInsight:
      String(context.strategyCard?.marketPositionInsight || "").trim()
      || String(researchWriteback?.marketPositionInsight || "").trim(),
    historicalTurningPoint:
      String(context.strategyCard?.historicalTurningPoint || "").trim()
      || String(researchWriteback?.historicalTurningPoint || "").trim(),
  };
}

function getPreferredResearchSignalsForApply(input: {
  strategyWriteback?: Record<string, unknown> | null;
  strategyCard?: {
    targetReader?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchHypothesis?: string | null;
    marketPositionInsight?: string | null;
    historicalTurningPoint?: string | null;
  } | null;
}) {
  const strategyWriteback = normalizeRecord(input.strategyWriteback);
  return {
    targetReader:
      String(input.strategyCard?.targetReader || "").trim()
      || String(strategyWriteback?.targetReader || "").trim(),
    coreAssertion:
      String(input.strategyCard?.coreAssertion || "").trim()
      || String(strategyWriteback?.coreAssertion || "").trim(),
    whyNow:
      String(input.strategyCard?.whyNow || "").trim()
      || String(strategyWriteback?.whyNow || "").trim()
      || String(input.strategyCard?.researchHypothesis || "").trim()
      || String(strategyWriteback?.researchHypothesis || "").trim(),
    researchHypothesis:
      String(input.strategyCard?.researchHypothesis || "").trim()
      || String(strategyWriteback?.researchHypothesis || "").trim(),
    marketPositionInsight:
      String(input.strategyCard?.marketPositionInsight || "").trim()
      || String(strategyWriteback?.marketPositionInsight || "").trim(),
    historicalTurningPoint:
      String(input.strategyCard?.historicalTurningPoint || "").trim()
      || String(strategyWriteback?.historicalTurningPoint || "").trim(),
  };
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text: string, limit = 160) {
  return text.length > limit ? text.slice(0, limit) + "…" : text;
}

function promptLine(prefix: string, value: unknown) {
  return formatPromptTemplate(prefix + "{{value}}", { value });
}

function promptBlock(prefix: string, value: unknown) {
  return formatPromptTemplate(prefix + "\n{{value}}", { value });
}

export function buildArticleArtifactPromptSystemSegments(promptContent: string) {
  return buildGatewaySystemSegments([
    { text: promptContent, cacheable: true },
  ]);
}

export function buildTitleOptimizerSystemSegments(promptContent: string) {
  return buildGatewaySystemSegments([
    { text: promptContent, cacheable: true },
    {
      text: [
        "请输出 JSON，不要解释，不要 markdown。",
        '字段：{"titleOptions":[{"title":"字符串","styleLabel":"字符串","angle":"字符串","reason":"字符串","riskHint":"字符串","openRateScore":42,"elementsHit":{"specific":true,"curiosityGap":true,"readerView":false},"forbiddenHits":[""],"recommendReason":"字符串"}],"recommendedIndex":0}',
        "固定返回 6 个 titleOptions，recommendedIndex 取 0-5，代表唯一推荐项。",
        "每个标题至少满足三要素里的 2 项：具体元素、好奇缺口、读者视角。",
        "具体元素：标题里尽量出现数字、产品名、人名、场景、结果、角色或具体对象。",
        "好奇缺口：制造信息差，但不要把结论剧透成清单答案。",
        "读者视角：优先说读者能得到什么判断或提醒，不要写成作者自我倾诉。",
        "禁止清单：震惊、不看后悔、99% 的人都、太可怕了、关于…的思考、…的一些感悟、…的 5 个方法、…的 3 个要点、自我复盘式标题、夸大事实、承诺正文无法兑现的结果。",
        "forbiddenHits 必须列出命中的禁区标签；没命中时返回空数组。",
        "openRateScore 取 0-50；只有 forbiddenHits 为空且至少命中 2 个要素，才能进入 40 分以上区间。",
        "6 个标题必须围绕同一主轴，但风格要明显分开，例如观点判断型、误读切口型、结果反差型、数字反差型、读者提醒型。",
        "title 长度尽量克制，避免空泛大词，不要写成提纲式或方法清单式标题。",
      ].join("\n"),
      cacheable: true,
    },
  ]);
}

export function buildOpeningOptimizerSystemSegments(promptContent: string) {
  return buildGatewaySystemSegments([
    { text: promptContent, cacheable: true },
    {
      text: [
        "请输出 JSON，不要解释，不要 markdown。",
        '字段：{"openingOptions":[{"text":"字符串","patternCode":"scene_entry|conflict_entry|judgement_first|question_hook|phenomenon_signal|direct_entry","patternLabel":"字符串","hookScore":78,"qualityCeiling":"A|B+|B|B-|C","forbiddenHits":[""],"recommendReason":"字符串","diagnose":{"abstractLevel":"pass|warn|danger","paddingLevel":"pass|warn|danger","hookDensity":"pass|warn|danger","informationFrontLoading":"pass|warn|danger"}}],"recommendedIndex":0,"recommendedDirection":"字符串"}',
        "固定返回 3 个 openingOptions，recommendedIndex 取 0-2，代表唯一推荐项。",
        "openingOptions.text 必须是可直接落稿的中文开头句群，优先控制在 80-200 字，不要返回提纲标签或解释句。",
        "3 个候选必须覆盖不同开头模式，patternCode 只能是 scene_entry、conflict_entry、judgement_first、question_hook、phenomenon_signal、direct_entry。",
        "forbiddenHits 必须列出命中的开头禁区标签；没有命中时返回空数组。",
        "qualityCeiling 只能是 A、B+、B、B-、C；推荐项优先选择 forbiddenHits 为空、qualityCeiling 更高、信息更前置的方案。",
        "diagnose 四项必须完整返回，使用 pass|warn|danger。",
        "如果某个候选仍不可用，也要保留它，但必须明确给出 forbiddenHits 和 recommendReason。",
      ].join("\n"),
      cacheable: true,
    },
  ]);
}

function withOpeningOptionAliases<T extends Record<string, unknown>>(option: T): T & {
  opening: string;
  text: string;
  value: string;
} {
  const opening = String(option.opening || option.text || option.content || option.value || "").trim();
  return {
    ...option,
    opening,
    text: opening,
    value: opening,
  };
}

function normalizeIsoTimestamp(value: unknown) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function listPersonaSummary(context: GenerationContext) {
  if (!context.persona) {
    return "未配置作者人设，按通用中文专栏读者分析。";
  }
  const identity = context.persona.identityTags.join(" / ");
  const writingStyle = context.persona.writingStyleTags.join(" / ");
  return formatPromptTemplate("{{name}}（身份：{{identity}}；风格：{{writingStyle}}{{summaryPart}}{{boundProfilePart}}{{sourceModePart}}）", {
    name: context.persona.name,
    identity: identity || "未设置",
    writingStyle: writingStyle || "未设置",
    summaryPart: context.persona.summary ? "；摘要：" + context.persona.summary : "",
    boundProfilePart: context.persona.boundWritingStyleProfileName ? "；绑定文风资产：" + context.persona.boundWritingStyleProfileName : "",
    sourceModePart: context.persona.sourceMode === "analyzed" ? "；资料建模人设" : "",
  });
}

function listWritingStyleProfileSummary(context: GenerationContext) {
  if (!context.writingStyleProfile) {
    return "未绑定文风资产，仅按作者人设和正文上下文生成。";
  }

  const profile = context.writingStyleProfile;
  return [
    promptLine("名称：", profile.name),
    profile.summary ? promptLine("摘要：", profile.summary) : null,
    profile.toneKeywords.length ? promptLine("语气关键词：", profile.toneKeywords.join("、")) : null,
    profile.structurePatterns.length ? promptLine("结构习惯：", profile.structurePatterns.join("；")) : null,
    profile.languageHabits.length ? promptLine("语言习惯：", profile.languageHabits.join("；")) : null,
    profile.openingPatterns.length ? promptLine("开头习惯：", profile.openingPatterns.join("；")) : null,
    profile.endingPatterns.length ? promptLine("结尾习惯：", profile.endingPatterns.join("；")) : null,
    profile.doNotWrite.length ? promptLine("明确规避：", profile.doNotWrite.join("；")) : null,
    profile.imitationPrompt ? promptLine("模仿提示：", profile.imitationPrompt) : null,
  ].filter(Boolean).join("\n");
}

function getLayoutStrategyString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLayoutStrategyList(config: Record<string, unknown>, key: string, limit = 8) {
  const value = config[key];
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function listLayoutStrategySummary(context: GenerationContext) {
  if (!context.layoutStrategy) {
    return "当前未启用额外写作风格资产，仅按作者人设、风格 DNA 与写作状态生成阶段产物。";
  }

  const tone = getLayoutStrategyString(context.layoutStrategy.config, "tone");
  const paragraphLength = getLayoutStrategyString(context.layoutStrategy.config, "paragraphLength");
  const titleStyle = getLayoutStrategyString(context.layoutStrategy.config, "titleStyle");
  const bannedWords = getLayoutStrategyList(context.layoutStrategy.config, "bannedWords");
  const bannedPunctuation = getLayoutStrategyList(context.layoutStrategy.config, "bannedPunctuation");

  return [
    promptLine("名称：", context.layoutStrategy.name),
    context.layoutStrategy.resolutionMode === "explicit"
      ? "来源：稿件显式绑定的写作风格资产"
      : context.layoutStrategy.resolutionMode === "active"
        ? "来源：当前活跃写作风格资产"
        : promptLine(
            "来源：",
            formatPromptTemplate("线上灰度命中的写作风格资产（{{reason}}）", {
              reason: context.layoutStrategy.resolutionReason,
            }),
          ),
    tone ? promptLine("语气偏好：", tone) : null,
    paragraphLength ? promptLine("段落呼吸：", paragraphLength) : null,
    titleStyle ? promptLine("标题倾向：", titleStyle) : null,
    bannedWords.length ? promptLine("附加禁词：", bannedWords.join("、")) : null,
    bannedPunctuation.length ? promptLine("禁用标点：", bannedPunctuation.join(" ")) : null,
  ].filter(Boolean).join("\n");
}

function getSourceFacts(context: GenerationContext, limit = 6) {
  return Array.from(
    new Set([
      ...context.knowledgeCards.flatMap((card) => card.keyFacts),
      ...context.evidenceFragments.flatMap((fragment) => collectEvidenceFragmentFacts(fragment, 2)),
      ...context.fragments,
    ].map((item) => truncateText(String(item || "").trim(), 120)).filter(Boolean)),
  ).slice(0, limit);
}

function getEvidenceFragmentLocalization(fragment: GenerationContext["evidenceFragments"][number]) {
  const sourceMeta = normalizeRecord(fragment.sourceMeta);
  const localization = normalizeRecord(sourceMeta?.localization);
  if (!localization) {
    return null;
  }
  return {
    localizedSummary: String(localization.localizedSummary || "").trim(),
    factPointsZh: getStringArray(localization.factPointsZh, 4),
    quoteCandidatesZh: getStringArray(localization.quoteCandidatesZh, 2),
    translationRisk: String(localization.translationRisk || "").trim() || null,
    originalTitle: String(localization.originalTitle || "").trim() || null,
    originalExcerpt: String(localization.originalExcerpt || "").trim() || null,
    degradedReason: String(localization.degradedReason || "").trim() || null,
  };
}

export function collectEvidenceFragmentFacts(
  fragment: Pick<GenerationContext["evidenceFragments"][number], "distilledContent" | "sourceMeta">,
  limit = 2,
) {
  const localization = getEvidenceFragmentLocalization(fragment as GenerationContext["evidenceFragments"][number]);
  const facts = localization?.factPointsZh ?? [];
  if (facts.length > 0) {
    return facts.slice(0, limit);
  }
  const localizedSummary = String(localization?.localizedSummary || "").trim();
  if (localizedSummary) {
    return [truncateText(localizedSummary, 120)];
  }
  const distilled = String(fragment.distilledContent || "").trim();
  return distilled ? [truncateText(distilled, 120)] : [];
}

export function buildEvidenceFragmentPromptSummary(
  fragment: Pick<GenerationContext["evidenceFragments"][number], "distilledContent" | "sourceMeta">,
  options?: { includeRisk?: boolean },
) {
  const localization = getEvidenceFragmentLocalization(fragment as GenerationContext["evidenceFragments"][number]);
  const baseSummary = String(localization?.localizedSummary || fragment.distilledContent || "").trim();
  const risk = options?.includeRisk ? String(localization?.translationRisk || "").trim() : "";
  const summary = truncateText(baseSummary, 120);
  if (!risk) {
    return summary;
  }
  return truncateText(`${summary}；转述提醒：${risk}`, 160);
}

function getLocalizationRiskNotes(context: GenerationContext, limit = 4) {
  return Array.from(new Set(
    context.evidenceFragments
      .map((fragment) => getEvidenceFragmentLocalization(fragment)?.translationRisk || "")
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, limit);
}

function getLocalizationTermMappings(context: GenerationContext, limit = 6) {
  const pairs = context.evidenceFragments.flatMap((fragment) => {
    const localization = normalizeRecord(normalizeRecord(fragment.sourceMeta)?.localization);
    const mappings = Array.isArray(localization?.termMappings) ? localization.termMappings : [];
    return mappings.map((item) => {
      const record = normalizeRecord(item);
      const sourceTerm = String(record?.sourceTerm || "").trim();
      const zhTerm = String(record?.zhTerm || "").trim();
      const note = String(record?.note || "").trim();
      if (!sourceTerm || !zhTerm) {
        return "";
      }
      return `${sourceTerm}=${zhTerm}${note ? `（${note}）` : ""}`;
    }).filter(Boolean);
  });
  return Array.from(new Set(pairs)).slice(0, limit);
}

function getMaterialBundle(context: GenerationContext, limit = 8) {
  return [
    ...context.evidenceFragments.slice(0, limit).map((fragment) => ({
      fragmentId: fragment.id,
      title: String(fragment.title || "").trim() || ("素材 #" + String(fragment.id)),
      usageMode: fragment.usageMode,
      sourceType: fragment.sourceType,
      summary: buildEvidenceFragmentPromptSummary(fragment, { includeRisk: true }),
      screenshotPath: fragment.screenshotPath,
    })),
  ];
}

function getDocumentClaims(context: GenerationContext, limit = 6) {
  const plain = stripMarkdown(context.article.markdownContent);
  const sentenceClaims = plain
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 8)
    .filter((item) => /\d|%|倍|年|月|日|增长|下降|发布|宣布|融资|亏损|收入|用户|成本/.test(item))
    .slice(0, limit);
  return Array.from(new Set([...sentenceClaims, ...getSourceFacts(context, limit)])).slice(0, limit);
}

function deriveClaimTokens(text: string) {
  const normalized = String(text || "").trim();
  const tokens = Array.from(new Set([
    ...normalized.match(/[\d.]+%?/g) ?? [],
    ...normalized.match(/[A-Za-z]{2,}/g) ?? [],
    ...normalized.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [],
  ])).filter(Boolean);
  return tokens.slice(0, 12);
}

function scoreEvidenceMatch(claim: string, evidence: { title: string | null; distilledContent: string }) {
  const claimText = claim.trim();
  const evidenceText = [evidence.title, evidence.distilledContent].filter(Boolean).join(" ");
  if (!claimText || !evidenceText) {
    return 0;
  }
  if (evidenceText.includes(claimText) || claimText.includes(evidenceText.slice(0, 16))) {
    return 100;
  }
  const tokens = deriveClaimTokens(claimText);
  let score = 0;
  for (const token of tokens) {
    if (token.length >= 2 && evidenceText.includes(token)) {
      score += /\d/.test(token) ? 5 : 2;
    }
  }
  return score;
}

function buildFactCheckEvidenceCards(
  context: GenerationContext,
  checks: Array<{ claim: string; status: string; suggestion: string }>,
) {
  return checks.slice(0, 8).map((check) => {
    const matchedKnowledgeCard = context.knowledgeCards
      .map((card) => ({
        card,
        score: scoreSemanticMatch(
          String(check.claim || "").trim() + "\n" + String(check.suggestion || "").trim(),
          String(card.title || "").trim() + "\n" + String(card.summary ?? "") + "\n" + card.keyFacts.join("；") + "\n" + String(card.latestChangeSummary ?? ""),
        ),
      }))
      .filter((item) => item.score >= 0.18)
      .sort((left, right) => right.score - left.score || right.card.confidenceScore - left.card.confidenceScore)
      .map((item) => item.card)[0] ?? null;
    const matchedEvidence = context.evidenceFragments
      .map((fragment) => ({
        fragment,
        score: scoreEvidenceMatch(check.claim, fragment),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((item) => ({
        fragmentId: item.fragment.id as number | null,
        title: String(item.fragment.title || "").trim() || ("素材 #" + String(item.fragment.id)),
        excerpt: buildEvidenceFragmentPromptSummary(item.fragment, { includeRisk: true }),
        sourceType: item.fragment.sourceType,
        sourceUrl: item.fragment.sourceUrl,
        researchTag:
          inferEvidenceResearchTag({
            title: String(item.fragment.title || "").trim() || ("素材 #" + String(item.fragment.id)),
            excerpt: item.fragment.distilledContent,
            claim: check.claim,
            rationale: check.suggestion,
            sourceUrl: item.fragment.sourceUrl,
          }) || null,
        knowledgeCardId: matchedKnowledgeCard?.id ?? null,
        knowledgeTitle: matchedKnowledgeCard?.title ?? null,
        confidenceLabel:
          matchedKnowledgeCard == null
            ? "待补背景卡"
            : matchedKnowledgeCard.status === "conflicted"
              ? "存在冲突"
              : matchedKnowledgeCard.confidenceScore >= 0.75
                ? "高置信"
                : matchedKnowledgeCard.confidenceScore >= 0.58
                  ? "中置信"
                  : "待验证",
        rationale:
          item.fragment.sourceType === "url" && item.fragment.sourceUrl
            ? "可回到原链接核对一手表述。"
            : item.fragment.sourceType === "screenshot"
              ? "可回到截图或原始记录核对数字与时间。"
              : "可作为现有素材锚点，但最好补充外部来源。",
      }));
    const supportingEvidence = matchedEvidence
      .filter((item) => normalizeEvidenceResearchTag(item.researchTag) !== "contradiction")
      .slice(0, 3)
      .map((item) => ({
        ...item,
        evidenceRole: "supportingEvidence",
      }));
    const counterEvidence = matchedEvidence
      .filter((item) => normalizeEvidenceResearchTag(item.researchTag) === "contradiction")
      .slice(0, 2)
      .map((item) => ({
        ...item,
        evidenceRole: "counterEvidence",
      }));
    if (counterEvidence.length === 0 && matchedKnowledgeCard?.status === "conflicted") {
      counterEvidence.push({
        fragmentId: null,
        title: matchedKnowledgeCard.title,
        excerpt: truncateText(matchedKnowledgeCard.latestChangeSummary || matchedKnowledgeCard.summary || matchedKnowledgeCard.keyFacts.join("；"), 120),
        sourceType: "manual",
        sourceUrl: null,
        researchTag: "contradiction",
        evidenceRole: "counterEvidence",
        knowledgeCardId: matchedKnowledgeCard.id,
        knowledgeTitle: matchedKnowledgeCard.title,
        confidenceLabel: "存在冲突",
        rationale: "背景卡显示这条判断仍有冲突信息，发布前要保留反向证据视角。",
      });
    }

    const supportLevel = supportingEvidence.length >= 2 ? "strong" : supportingEvidence.length === 1 ? "partial" : "missing";
    return {
      claim: check.claim,
      supportLevel,
      supportingEvidence,
      counterEvidence,
    };
  });
}

function buildFactCheckResearchReview(context: GenerationContext) {
  const researchBrief = normalizeRecord(context.researchBrief);
  const sourceCoverage = normalizeRecord(researchBrief?.sourceCoverage);
  const timelineCards = getRecordArray(researchBrief?.timelineCards);
  const comparisonCards = getRecordArray(researchBrief?.comparisonCards);
  const intersectionInsights = getRecordArray(researchBrief?.intersectionInsights);
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const sourceCoverageStatus = ["ready", "limited", "blocked"].includes(String(sourceCoverage?.sufficiency || "").trim())
    ? String(sourceCoverage?.sufficiency || "").trim()
    : "unknown";
  const timelineSupport = timelineCards.length > 0 ? "enough" : "missing";
  const comparisonSupport = comparisonCards.length > 0 ? "enough" : "missing";
  const intersectionSupport = intersectionInsights.length > 0 ? "enough" : "missing";
  const strongestAnchor =
    preferredResearchSignals.coreAssertion
    || preferredResearchSignals.historicalTurningPoint
    || preferredResearchSignals.marketPositionInsight
    || preferredResearchSignals.researchHypothesis
    || "";
  const gaps = dedupeLimited([
    !researchBrief ? "缺少研究简报，当前事实核查只能校对真假，无法判断主判断有没有研究底座。" : null,
    sourceCoverageStatus === "blocked" ? "研究信源覆盖仍被阻断，现阶段不适合把判断写硬。" : null,
    sourceCoverageStatus === "limited" ? "研究信源覆盖仍偏薄，关键判断需要补更多来源类别后再定稿。" : null,
    timelineSupport === "missing" ? "缺少纵向时间脉络支撑，无法解释正文主判断为什么会在今天成立。" : null,
    comparisonSupport === "missing" ? "缺少横向比较支撑，无法判断正文主张是否经得起同类或替代路径对照。" : null,
    intersectionSupport === "missing" ? "缺少交汇洞察支撑，正文结论仍可能停留在素材堆叠。" : null,
  ], 4);
  const summary = !researchBrief
    ? "当前没有研究简报，事实核查只能覆盖真假层，无法完整复核判断是否有纵向与横向支撑。"
    : [
        strongestAnchor ? "当前主判断锚点：" + strongestAnchor : null,
        sourceCoverageStatus === "ready"
          ? "研究信源覆盖已具备基础可写性。"
          : sourceCoverageStatus === "limited"
            ? "研究信源覆盖仍偏薄。"
            : sourceCoverageStatus === "blocked"
              ? "研究信源覆盖仍被阻断。"
              : null,
        timelineSupport === "enough" ? "已接入 " + String(timelineCards.length) + " 条时间脉络卡。" : "还没有时间脉络卡。",
        comparisonSupport === "enough" ? "已接入 " + String(comparisonCards.length) + " 条横向比较卡。" : "还没有横向比较卡。",
        intersectionSupport === "enough" ? "已接入 " + String(intersectionInsights.length) + " 条交汇洞察。" : "还没有交汇洞察。",
      ].filter(Boolean).join(" ");

  return {
    summary,
    sourceCoverage: sourceCoverageStatus,
    timelineSupport,
    comparisonSupport,
    intersectionSupport,
    strongestAnchor,
    gaps,
  } satisfies Record<string, unknown>;
}

const RESEARCH_SOURCE_CATEGORY_LABELS = {
  official: "官方源",
  industry: "行业源",
  comparison: "同类源",
  userVoice: "用户源",
  timeline: "时间源",
} as const;

type ResearchSourceCategoryKey = keyof typeof RESEARCH_SOURCE_CATEGORY_LABELS;
type ResearchSourceReference = {
  label: string;
  sourceType: string;
  detail: string;
  sourceUrl: string | null;
};

function dedupeLimited(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function dedupeSourceReferences(values: Array<ResearchSourceReference | null | undefined>, limit: number) {
  const seen = new Set<string>();
  const result: ResearchSourceReference[] = [];
  for (const item of values) {
    if (!item) {
      continue;
    }
    const label = String(item.label || "").trim();
    const sourceType = String(item.sourceType || "").trim() || "manual";
    const detail = String(item.detail || "").trim();
    const sourceUrl = String(item.sourceUrl || "").trim() || null;
    if (!label && !detail) {
      continue;
    }
    const key = label + "::" + sourceType + "::" + detail + "::" + (sourceUrl || "");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      label,
      sourceType,
      detail,
      sourceUrl,
    });
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function buildEvidenceFragmentSourceReference(
  fragment: GenerationContext["evidenceFragments"][number],
  detailOverride?: string | null,
): ResearchSourceReference {
  const sourceType =
    fragment.sourceType === "screenshot"
      ? "screenshot"
      : fragment.sourceType === "ima_kb"
        ? "knowledge"
        : fragment.sourceUrl
          ? "url"
          : "manual";
  return {
    label: String(fragment.title || "").trim() || ("素材 #" + String(fragment.id)),
    sourceType,
    detail: truncateText(detailOverride || buildEvidenceFragmentPromptSummary(fragment, { includeRisk: true }) || "素材线索", 96),
    sourceUrl: fragment.sourceUrl || null,
  };
}

function buildKnowledgeCardSourceReference(
  card: GenerationContext["knowledgeCards"][number],
  detailOverride?: string | null,
): ResearchSourceReference {
  return {
    label: card.title,
    sourceType: "knowledge",
    detail: truncateText(detailOverride || card.latestChangeSummary || card.summary || card.keyFacts[0] || "背景卡线索", 96),
    sourceUrl: null,
  };
}

function buildHistoryReferenceSourceReference(
  item: GenerationContext["historyReferences"][number],
  detailOverride?: string | null,
): ResearchSourceReference {
  return {
    label: "历史文章《" + item.title + "》",
    sourceType: "history",
    detail: truncateText(detailOverride || item.relationReason || item.bridgeSentence || "可用于补前情与阶段变化。", 96),
    sourceUrl: null,
  };
}

function getResearchCardSourceReferences(value: unknown) {
  return getRecordArray(value).map((item) => ({
    label: String(item.label || "").trim(),
    sourceType: String(item.sourceType || item.kind || "").trim() || "manual",
    detail: String(item.detail || "").trim(),
    sourceUrl: String(item.sourceUrl || "").trim() || null,
  })).filter((item) => item.label || item.detail);
}

function looksLikeOfficialSource(input: { title?: string | null; content?: string | null; sourceUrl?: string | null }) {
  const seed = (String(input.title || "") + " " + String(input.content || "") + " " + String(input.sourceUrl || "")).toLowerCase();
  return /(官网|官方|公告|财报|白皮书|政策|披露|新闻稿|investor|newsroom|press|official|whitepaper|policy|docs|documentation|help|sec\.gov|gov\.)/.test(seed);
}

function looksLikeUserVoice(input: { title?: string | null; content?: string | null; sourceUrl?: string | null }) {
  const seed = (String(input.title || "") + " " + String(input.content || "") + " " + String(input.sourceUrl || "")).toLowerCase();
  return /(reddit|forum|community|comment|review|weibo|x\.com|twitter|评论|社区|用户|反馈|口碑|体验|帖子|吐槽)/.test(seed);
}

function looksLikeComparison(text: string) {
  return /(竞品|对标|替代|比较|差异|玩家|格局|同类|vs\b|versus|benchmark)/i.test(text);
}

function looksLikeTimeline(text: string) {
  return /(19\d{2}|20\d{2}|起点|阶段|节点|转折|此前|后来|历史|演化|timeline|milestone|去年|今年|本月)/i.test(text);
}

function isGenericResearchLandingPage(input: {
  title?: string | null;
  content?: string | null;
  sourceUrl?: string | null;
}) {
  const title = (String(input.title || "")).trim().toLowerCase();
  const content = (String(input.content || "")).trim().toLowerCase();
  const url = String(input.sourceUrl || "").trim().toLowerCase();
  const path = url ? url.replace(/^https?:\/\/[^/]+\/?/i, "") : "";
  const genericTitle = /^(overview|docs|documentation|images|news|templates|workflows|guide|帮助|文档|概览|总览|模板)$/.test(title);
  const genericPath = /(?:^|\/)(overview|docs|images|news|templates|workflows|guide)\/?$/.test(path);
  const thinContent = content.length > 0 && content.length <= 48;
  return (genericTitle || genericPath) && thinContent;
}

function scoreResearchSourceStrength(input: {
  title?: string | null;
  content?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
}) {
  const seed = `${String(input.title || "")} ${String(input.content || "")} ${String(input.sourceUrl || "")}`.toLowerCase();
  let score = 0;
  if (String(input.sourceType || "").trim() === "ima_kb") {
    score += 18;
  }
  if (looksLikeOfficialSource(input)) {
    score += 14;
  }
  if (looksLikeUserVoice(input)) {
    score += 6;
  }
  if (looksLikeComparison(seed) || looksLikeTimeline(seed)) {
    score += 8;
  }
  if (/(案例|实战|复盘|经验|方法|流程|工作流|报告|白皮书|评测|对比|差异|数据|调研|benchmark|analysis|report|case study|retrospective|review|workflow|release|changelog|版本|演进|更新)/i.test(seed)) {
    score += 10;
  }
  if (String(input.content || "").trim().length >= 48) {
    score += 6;
  } else if (String(input.content || "").trim().length > 0 && String(input.content || "").trim().length < 18) {
    score -= 8;
  }
  if (isGenericResearchLandingPage(input)) {
    score -= 18;
  }
  return score;
}

export function pickStricterResearchSufficiency(...values: Array<string | null | undefined>) {
  const order = ["blocked", "limited", "ready"] as const;
  const normalized = values
    .map((item) => String(item || "").trim())
    .filter((item): item is typeof order[number] => (order as readonly string[]).includes(item));
  if (normalized.length === 0) {
    return "";
  }
  return normalized.sort((left, right) => order.indexOf(left) - order.indexOf(right))[0] || "";
}

function buildResearchCoverage(context: GenerationContext) {
  const buckets: Record<ResearchSourceCategoryKey, string[]> = {
    official: [],
    industry: [],
    comparison: [],
    userVoice: [],
    timeline: [],
  };
  const strongBuckets: Record<ResearchSourceCategoryKey, string[]> = {
    official: [],
    industry: [],
    comparison: [],
    userVoice: [],
    timeline: [],
  };

  for (const fragment of context.evidenceFragments.slice(0, 12)) {
    const title = String(fragment.title || "").trim() || ("素材 #" + String(fragment.id));
    const summary = truncateText(fragment.distilledContent, 96);
    const descriptor = title + "：" + summary;
    const comparisonSeed = title + " " + summary;
    const qualityScore = scoreResearchSourceStrength({
      title,
      content: summary,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
    });
    if (fragment.sourceType === "ima_kb") {
      buckets.industry.push(descriptor);
      if (qualityScore >= 16) {
        strongBuckets.industry.push(descriptor);
      }
    }
    if (looksLikeOfficialSource({ title, content: summary, sourceUrl: fragment.sourceUrl })) {
      buckets.official.push(descriptor);
      if (qualityScore >= 16) {
        strongBuckets.official.push(descriptor);
      }
    } else if (fragment.sourceUrl) {
      buckets.industry.push(descriptor);
      if (qualityScore >= 16) {
        strongBuckets.industry.push(descriptor);
      }
    }
    if (looksLikeUserVoice({ title, content: summary, sourceUrl: fragment.sourceUrl })) {
      buckets.userVoice.push(descriptor);
      if (qualityScore >= 18) {
        strongBuckets.userVoice.push(descriptor);
      }
    }
    if (looksLikeComparison(comparisonSeed)) {
      buckets.comparison.push(descriptor);
      if (qualityScore >= 16) {
        strongBuckets.comparison.push(descriptor);
      }
    }
    if (looksLikeTimeline(comparisonSeed)) {
      buckets.timeline.push(descriptor);
      if (qualityScore >= 14) {
        strongBuckets.timeline.push(descriptor);
      }
    }
  }

  for (const card of context.knowledgeCards.slice(0, 6)) {
    const seed = [card.title, card.summary, card.latestChangeSummary, ...card.keyFacts.slice(0, 2)].filter(Boolean).join(" ");
    const descriptor = String(card.title || "").trim() + "：" + truncateText(card.latestChangeSummary || card.summary || card.keyFacts[0] || "背景卡线索", 96);
    buckets.industry.push(descriptor);
    if (looksLikeComparison(seed)) {
      buckets.comparison.push(descriptor);
    }
    if (looksLikeTimeline(seed)) {
      buckets.timeline.push(descriptor);
    }
  }

  if (context.historyReferences.length > 0) {
    buckets.timeline.push(...context.historyReferences.slice(0, 3).map((item) => "历史文章《" + item.title + "》：" + truncateText(item.relationReason || item.bridgeSentence || "可用于补前情与阶段变化。", 96)));
  }

  const official = dedupeLimited(buckets.official, 4);
  const industry = dedupeLimited(buckets.industry, 4);
  const comparison = dedupeLimited(buckets.comparison, 4);
  const userVoice = dedupeLimited(buckets.userVoice, 4);
  const timeline = dedupeLimited(buckets.timeline, 4);
  const categoryMap = { official, industry, comparison, userVoice, timeline };
  const strongCategoryMap = {
    official: dedupeLimited(strongBuckets.official, 3),
    industry: dedupeLimited(strongBuckets.industry, 3),
    comparison: dedupeLimited(strongBuckets.comparison, 3),
    userVoice: dedupeLimited(strongBuckets.userVoice, 3),
    timeline: dedupeLimited(strongBuckets.timeline, 3),
  };
  const coveredCount = (Object.keys(categoryMap) as ResearchSourceCategoryKey[]).filter((key) => categoryMap[key].length > 0).length;
  const strongCoveredCount = (Object.keys(strongCategoryMap) as ResearchSourceCategoryKey[]).filter((key) => strongCategoryMap[key].length > 0).length;
  const missingCategories = (Object.keys(categoryMap) as ResearchSourceCategoryKey[])
    .filter((key) => categoryMap[key].length === 0)
    .map((key) => RESEARCH_SOURCE_CATEGORY_LABELS[key]);
  const weakOnlyCategories = (Object.keys(categoryMap) as ResearchSourceCategoryKey[])
    .filter((key) => categoryMap[key].length > 0 && strongCategoryMap[key].length === 0)
    .map((key) => RESEARCH_SOURCE_CATEGORY_LABELS[key]);
  const sufficiency =
    coveredCount >= 4 && strongCoveredCount >= 2
      ? "ready"
      : coveredCount >= 3 || strongCoveredCount >= 1
        ? "limited"
        : "blocked";

  return {
    ...categoryMap,
    strongCategoryCount: strongCoveredCount,
    weakOnlyCategories,
    sufficiency,
    missingCategories,
    coveredCount,
    note:
      sufficiency === "ready"
        ? "当前研究底座已覆盖多数关键来源维度，且已有足够强证据，可继续进入结构判断。"
        : sufficiency === "limited"
          ? [
              missingCategories.length ? "当前仍缺这些来源维度：" + missingCategories.join("、") : null,
              weakOnlyCategories.length ? "这些维度暂时只有弱证据：" + weakOnlyCategories.join("、") : null,
              "建议先补强研究，再把判断写硬。",
            ].filter(Boolean).join("。")
          : "当前信源覆盖过窄，最多只适合写成观点草稿，不适合直接进入判断型长文。",
  } satisfies Record<string, unknown> & { coveredCount: number };
}

function getExternalResearchDomainLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function inferExternalResearchCategory(input: { category?: string; url?: string | null }): ResearchSourceCategoryKey {
  const category = String(input.category || "").trim();
  const url = String(input.url || "").toLowerCase();
  if (category === "official" || /openai\.com|anthropic\.com|claude\.com|ai\.google\.dev|developers\.google\.com|microsoft\.com|github\.com/.test(url)) {
    return "official";
  }
  if (category === "comparison" || /alternative|compare|versus|benchmark|a16z\.com/.test(url)) {
    return "comparison";
  }
  if (category === "userVoice" || /v2ex\.com|reddit\.com|zhihu\.com|news\.ycombinator\.com|producthunt\.com|lennysnewsletter\.com/.test(url)) {
    return "userVoice";
  }
  if (category === "timeline" || /news|changelog|release|blog/.test(url)) {
    return "timeline";
  }
  return "industry";
}

function enrichResearchCoverageWithExternalSearch(
  coverage: Record<string, unknown>,
  externalResearch?: {
    discoveredUrls?: string[];
    curatedSourceUrls?: string[];
    attached?: Array<{ title: string; sourceUrl: string | null }>;
    searches?: Array<{ category?: string; label?: string; topUrls?: string[] }>;
  } | null,
) {
  if (!externalResearch) return coverage;
  const buckets: Record<ResearchSourceCategoryKey, string[]> = {
    official: dedupeLimited(coverage.official as Array<string | null | undefined>, 6),
    industry: dedupeLimited(coverage.industry as Array<string | null | undefined>, 6),
    comparison: dedupeLimited(coverage.comparison as Array<string | null | undefined>, 6),
    userVoice: dedupeLimited(coverage.userVoice as Array<string | null | undefined>, 6),
    timeline: dedupeLimited(coverage.timeline as Array<string | null | undefined>, 6),
  };
  const addUrl = (url: string | null | undefined, category?: string, title?: string | null) => {
    const normalizedUrl = String(url || "").trim();
    if (!normalizedUrl) return;
    const key = inferExternalResearchCategory({ category, url: normalizedUrl });
    const label = String(title || "").trim() || getExternalResearchDomainLabel(normalizedUrl);
    buckets[key].push(`${label}：${normalizedUrl}`);
  };

  for (const item of externalResearch.attached ?? []) {
    addUrl(item.sourceUrl, undefined, item.title);
  }
  for (const url of externalResearch.curatedSourceUrls ?? []) {
    addUrl(url);
  }
  for (const url of externalResearch.discoveredUrls ?? []) {
    addUrl(url);
  }
  for (const search of externalResearch.searches ?? []) {
    for (const url of search.topUrls ?? []) {
      addUrl(url, search.category, search.label);
    }
  }

  const categoryMap = {
    official: dedupeLimited(buckets.official, 6),
    industry: dedupeLimited(buckets.industry, 6),
    comparison: dedupeLimited(buckets.comparison, 6),
    userVoice: dedupeLimited(buckets.userVoice, 6),
    timeline: dedupeLimited(buckets.timeline, 6),
  };
  const coveredCount = (Object.keys(categoryMap) as ResearchSourceCategoryKey[]).filter((key) => categoryMap[key].length > 0).length;
  const missingCategories = (Object.keys(categoryMap) as ResearchSourceCategoryKey[])
    .filter((key) => categoryMap[key].length === 0)
    .map((key) => RESEARCH_SOURCE_CATEGORY_LABELS[key]);
  const sufficiency = coveredCount >= 4 ? "ready" : coveredCount >= 2 ? "limited" : "blocked";

  return {
    ...coverage,
    ...categoryMap,
    coveredCount,
    missingCategories,
    sufficiency,
    note:
      sufficiency === "ready"
        ? "已结合外部搜索五类结果回填研究覆盖，可继续进入结构判断。"
        : String(coverage.note || ""),
  };
}

function buildResearchTimelineCards(context: GenerationContext, coverage: ReturnType<typeof buildResearchCoverage>) {
  const timelineFragments = context.evidenceFragments.filter((fragment) =>
    looksLikeTimeline(String(fragment.title || "").trim() + " " + truncateText(fragment.distilledContent, 96)),
  );
  const officialFragments = context.evidenceFragments.filter((fragment) =>
    looksLikeOfficialSource({
      title: fragment.title,
      content: truncateText(fragment.distilledContent, 96),
      sourceUrl: fragment.sourceUrl,
    }),
  );
  const comparisonFragments = context.evidenceFragments.filter((fragment) =>
    looksLikeComparison(String(fragment.title || "").trim() + " " + truncateText(fragment.distilledContent, 96)),
  );
  const userVoiceFragments = context.evidenceFragments.filter((fragment) =>
    looksLikeUserVoice({
      title: fragment.title,
      content: truncateText(fragment.distilledContent, 96),
      sourceUrl: fragment.sourceUrl,
    }),
  );
  const timelineSignals = dedupeLimited(
    [
      ...coverage.timeline,
      ...context.knowledgeCards.map((card) => card.latestChangeSummary),
      ...context.knowledgeCards.flatMap((card) => card.keyFacts.filter((fact) => looksLikeTimeline(fact))),
      ...getSourceFacts(context, 6).filter((fact) => looksLikeTimeline(fact)),
    ],
    6,
  );
  const startSignal = timelineSignals[0] || ("围绕「" + context.article.title + "」先补起点，不要把今天的现象写成凭空出现。");
  const turningSignal = timelineSignals[1] || context.seriesInsight?.whyNow?.[0] || "寻找真正改变竞争格局或用户预期的那个转折。";
  const currentSignal = timelineSignals[2] || ("今天值得写「" + context.article.title + "」，是因为它已经进入一个需要重新判断的位置。");

  return [
    {
      phase: "起点",
      title: `这件事从哪里开始`,
      summary: startSignal,
      signals: dedupeLimited([startSignal, coverage.official[0], coverage.timeline[0]], 3),
      sources: dedupeSourceReferences(
        [
          timelineFragments[0] ? buildEvidenceFragmentSourceReference(timelineFragments[0], startSignal) : null,
          officialFragments[0] ? buildEvidenceFragmentSourceReference(officialFragments[0]) : null,
          context.historyReferences[0] ? buildHistoryReferenceSourceReference(context.historyReferences[0]) : null,
        ],
        3,
      ),
    },
    {
      phase: "转折",
      title: `真正改变叙事的节点`,
      summary: turningSignal,
      signals: dedupeLimited([turningSignal, coverage.industry[0], coverage.timeline[1]], 3),
      sources: dedupeSourceReferences(
        [
          timelineFragments[1] ? buildEvidenceFragmentSourceReference(timelineFragments[1], turningSignal) : null,
          context.knowledgeCards[0] ? buildKnowledgeCardSourceReference(context.knowledgeCards[0], turningSignal) : null,
          context.historyReferences[1] ? buildHistoryReferenceSourceReference(context.historyReferences[1]) : null,
        ],
        3,
      ),
    },
    {
      phase: "当前位置",
      title: `今天处在哪个阶段`,
      summary: currentSignal,
      signals: dedupeLimited([currentSignal, coverage.comparison[0], coverage.userVoice[0]], 3),
      sources: dedupeSourceReferences(
        [
          timelineFragments[2] ? buildEvidenceFragmentSourceReference(timelineFragments[2], currentSignal) : null,
          comparisonFragments[0] ? buildEvidenceFragmentSourceReference(comparisonFragments[0]) : null,
          userVoiceFragments[0] ? buildEvidenceFragmentSourceReference(userVoiceFragments[0]) : null,
        ],
        3,
      ),
    },
  ] satisfies Record<string, unknown>[];
}

function buildResearchComparisonCards(context: GenerationContext, coverage: ReturnType<typeof buildResearchCoverage>) {
  const candidateSubjects = dedupeLimited(
    [
      ...context.knowledgeCards.map((card) => card.title),
      ...context.evidenceFragments.map((fragment) => String(fragment.title || "").trim()),
    ],
    3,
  );
  const subjects = candidateSubjects.length >= 2 ? candidateSubjects.slice(0, 2) : ["主线玩家", "替代路径"];

  return subjects.map((subject, index) => {
    const matchingKnowledgeCard = context.knowledgeCards.find((card) => card.title.includes(subject) || subject.includes(card.title));
    const matchingFragments = context.evidenceFragments.filter((fragment) => {
      const seed = String(fragment.title || "").trim() + " " + truncateText(fragment.distilledContent, 96);
      return seed.includes(subject) || looksLikeComparison(seed);
    });
    const matchingUserVoice = context.evidenceFragments.find((fragment) =>
      looksLikeUserVoice({
        title: fragment.title,
        content: truncateText(fragment.distilledContent, 96),
        sourceUrl: fragment.sourceUrl,
      }),
    );
    return {
      subject,
      position: index === 0 ? "主流叙事更强、资源更集中，但也更容易背上历史包袱。" : "更像替代路径或对照组，适合拿来解释结构性差异。",
      differences: dedupeLimited(
        [
          coverage.comparison[index] || "重点比较定位、打法和用户结构，而不是只比表面功能。",
          coverage.industry[index] || "补供给侧和行业口径差异，避免把所有玩家写成同一种角色。",
        ],
        3,
      ),
      userVoices: dedupeLimited(
        [
          coverage.userVoice[index] || "补一条真实用户反馈，判断差异到底落在体验、信任还是价格感知上。",
        ],
        2,
      ),
      opportunities: dedupeLimited(
        [
          "寻找被忽略的空位，而不是只复述头部玩家的显性动作。",
          coverage.comparison[index + 1] || null,
        ],
        2,
      ),
      risks: dedupeLimited(
        [
          "警惕把短期现象误写成长期优势。",
          "警惕只写支持性例子，不写反例或限制条件。",
        ],
        2,
      ),
      sources: dedupeSourceReferences(
        [
          matchingKnowledgeCard ? buildKnowledgeCardSourceReference(matchingKnowledgeCard) : null,
          matchingFragments[index] ? buildEvidenceFragmentSourceReference(matchingFragments[index]) : null,
          matchingFragments[index + 1] ? buildEvidenceFragmentSourceReference(matchingFragments[index + 1]) : null,
          matchingUserVoice ? buildEvidenceFragmentSourceReference(matchingUserVoice) : null,
        ],
        3,
      ),
    };
  }) satisfies Record<string, unknown>[];
}

function buildResearchIntersectionInsights(
  context: GenerationContext,
  timelineCards: Record<string, unknown>[],
  comparisonCards: Record<string, unknown>[],
) {
  const turningPoint = String(timelineCards[1]?.summary || timelineCards[0]?.summary || "").trim();
  const leadingComparison = String(comparisonCards[0]?.subject || "").trim() || "主线玩家";
  const secondaryComparison = String(comparisonCards[1]?.subject || "").trim() || "替代路径";

  return [
    {
      insight: "今天讨论「" + context.article.title + "」，重点不是现象本身，而是它已经进入一个会暴露路径依赖的新阶段。",
      whyNow: turningPoint || "当前阶段变量已经改变，旧判断需要重验。",
      support: dedupeLimited([turningPoint, String(timelineCards[2]?.summary || "").trim()], 3),
      caution: "没有时间脉络时，不要把今天的动作写成单点爆发。",
      sources: dedupeSourceReferences(
        [
          ...getResearchCardSourceReferences(timelineCards[1]?.sources),
          ...getResearchCardSourceReferences(timelineCards[0]?.sources),
          ...getResearchCardSourceReferences(comparisonCards[0]?.sources),
        ],
        4,
      ),
    },
    {
      insight: "横向上真正值得比的是「" + leadingComparison + "」和「" + secondaryComparison + "」背后的组织能力、用户结构与历史负担，而不是表面功能。",
      whyNow: "这能把文章从单点观察推进到结构性比较。",
      support: dedupeLimited([String(comparisonCards[0]?.position || "").trim(), String(comparisonCards[1]?.position || "").trim()], 3),
      caution: "如果只有支持性案例，没有反例或用户反馈，判断仍然会偏空。",
      sources: dedupeSourceReferences(
        [
          ...getResearchCardSourceReferences(comparisonCards[0]?.sources),
          ...getResearchCardSourceReferences(comparisonCards[1]?.sources),
          ...getResearchCardSourceReferences(timelineCards[2]?.sources),
        ],
        4,
      ),
    },
  ] satisfies Record<string, unknown>[];
}

function fallbackResearchBrief(
  context: GenerationContext,
  externalResearch?: Parameters<typeof enrichResearchCoverageWithExternalSearch>[1],
) {
  const sourceCoverage = enrichResearchCoverageWithExternalSearch(
    buildResearchCoverage(context),
    externalResearch,
  ) as ReturnType<typeof buildResearchCoverage>;
  const timelineCards = buildResearchTimelineCards(context, sourceCoverage);
  const comparisonCards = buildResearchComparisonCards(context, sourceCoverage);
  const intersectionInsights = buildResearchIntersectionInsights(context, timelineCards, comparisonCards);
  const targetReader =
    context.audienceSelection?.selectedReaderLabel ||
    context.seriesInsight?.label ||
    context.persona?.audienceHints?.[0] ||
    "希望快速形成结构性判断的读者";
  const coreAssertion = String(context.outlinePlan?.centralThesis || "").trim() || String(context.article.title || "").trim();
  return {
    summary: "先围绕「" + context.article.title + "」把研究问题、信源覆盖、时间脉络和横向比较补齐，再进入策略判断。",
    researchObject: context.article.title,
    coreQuestion: "围绕「" + context.article.title + "」，真正需要研究清楚的不是发生了什么，而是它为什么在今天以这种方式发生。",
    authorHypothesis: context.seriesInsight?.reason || coreAssertion || "先提出一个待验证判断，但不要把它当成已证实结论。",
    targetReader,
    mustCoverAngles: [
      "补官方源，明确最基础的事实口径。",
      "补时间脉络，确认起点、转折与当前位置。",
      "补横向对比，确认主要玩家、替代路径与差异。",
      "补用户反馈，避免只有供给侧叙事。",
      "补反例或限制条件，避免判断写死。",
    ],
    hypothesesToVerify: [
      "「" + context.article.title + "」当前最重要的变化，是否来自一个新的阶段性转折。",
      "当前竞争差异，是否真正来自用户结构、组织能力或历史负担，而不是表面功能。",
      "这件事现在值得写，是否因为旧判断已经不够用了。",
    ],
    forbiddenConclusions: [
      "没有足够纵向证据时，不要直接宣布趋势已经成立。",
      "没有横向比较时，不要直接宣布谁已经赢了。",
      "没有用户或反例材料时，不要把单一叙事写成共识。",
    ],
    sourceCoverage,
    timelineCards,
    comparisonCards,
    intersectionInsights,
    strategyWriteback: {
      targetReader,
      coreAssertion: intersectionInsights[0]?.insight ?? coreAssertion,
      whyNow: intersectionInsights[0]?.whyNow ?? "因为当前阶段已经变化，旧判断需要重验。",
      researchHypothesis: "先把判断写成待验证假设，再决定能不能写硬。",
      marketPositionInsight: intersectionInsights[1]?.insight ?? "比较对象的关键差异，更可能落在结构和位置，而不是表面动作。",
      historicalTurningPoint: String(timelineCards[1]?.summary || timelineCards[0]?.summary || "").trim(),
    },
  } satisfies Record<string, unknown>;
}

function fallbackAudienceAnalysis(context: GenerationContext) {
  const identity = context.persona?.identityTags[0] || "内容创作者";
  const style = context.persona?.writingStyleTags[0] || "经验分享文";
  const sourceFacts = getSourceFacts(context, 3);
  return {
    summary: "这篇稿子更适合面向希望快速形成判断的 " + identity + " 型读者，表达应保持结论前置与事实支撑并行。",
    coreReaderLabel: identity + " / " + style + "受众",
    readerSegments: [
      {
        label: "核心关注者",
        painPoint: "已经关注“" + context.article.title + "”相关话题，但缺少一篇能快速形成判断的整合稿。",
        motivation: "想迅速知道该关注什么、忽略什么、下一步如何行动。",
        preferredTone: "结论前置、少铺垫、避免空话。",
      },
      {
        label: "行动决策者",
        painPoint: "需要把零散信息转成可执行建议或团队沟通材料。",
        motivation: "想拿到可复述的论点、证据和风险提醒。",
        preferredTone: "结构清晰、语气克制、重点高亮。",
      },
      {
        label: "外围读者",
        painPoint: "对行业背景不熟，容易被术语和前情信息劝退。",
        motivation: "想先理解这件事为什么值得看。",
        preferredTone: "提供必要背景解释，减少黑话。",
      },
    ],
    languageGuidance: [
      "开头 3 句内先说清这件事为什么重要。",
      "每一段只推进一个判断，并配一个事实锚点。",
      context.persona?.writingStyleTags.includes("科普文") ? "适度使用类比，降低理解门槛。" : "优先使用行业内熟悉的术语，但别连续堆砌。",
    ],
    backgroundAwarenessOptions: [
      "默认读者知道行业背景，只补最关键的前情。",
      "适度补背景，让跨行业但持续关注此议题的读者能跟上。",
      "按行业外行也能读懂的标准补充概念、前情与角色关系。",
    ],
    readabilityOptions: [
      "保持专业密度，适合行业内读者快速扫描。",
      "专业与通俗平衡，减少黑话堆叠。",
      "尽量口语化，多用短句、类比和直白判断。",
    ],
    contentWarnings: [
      "不要默认读者已经掌握全部背景。",
      "避免只有态度，没有时间、数据或案例支撑。",
      sourceFacts.length ? "优先引用这些已知素材：" + sourceFacts.join("；") : "优先回到用户已采集的素材与背景卡。",
    ],
    recommendedCallToAction: "结尾给出一个明确动作：继续观察什么、验证什么、如何利用这篇稿子做下一步表达。",
  } satisfies Record<string, unknown>;
}

function fallbackOutlinePlanning(context: GenerationContext) {
  const seedFacts = getSourceFacts(context, 4);
  const materialBundle = getMaterialBundle(context, 8);
  const baseTitle = truncateText(String(context.article.title || "").trim(), 28) || "这件事";
  const titleOptions = buildFallbackTitleOptions(baseTitle);
  const now = new Date().toISOString();
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const researchInsights = getRecordArray(context.researchBrief?.intersectionInsights).map((item) => String(item.insight || "").trim()).filter(Boolean);
  const timelineCards = getRecordArray(context.researchBrief?.timelineCards);
  const comparisonCards = getRecordArray(context.researchBrief?.comparisonCards);
  const researchBackbone = {
    openingTimelineAnchor:
      preferredResearchSignals.historicalTurningPoint
      || String(timelineCards[1]?.summary || "").trim()
      || String(timelineCards[0]?.summary || "").trim()
      || "先交代「" + context.article.title + "」是在哪个历史节点真正发生了转折。",
    middleComparisonAnchor:
      preferredResearchSignals.marketPositionInsight
      || String(comparisonCards[0]?.position || "").trim()
      || String(comparisonCards[0]?.subject || "").trim()
      || "中段必须引入一组横向比较，说明差异到底落在位置、组织能力还是用户结构。",
    coreInsightAnchor:
      preferredResearchSignals.coreAssertion
      || preferredResearchSignals.researchHypothesis
      || researchInsights[0]
      || "核心判断要回答「" + context.article.title + "」为什么会这样发生，而不是只复述发生了什么。",
    sequencingNote: context.researchBrief
      ? "先用历史转折把问题抛出来，再用横向比较拉开差异，最后把交汇洞察写成可站住的主判断。"
      : "如果研究卡还不完整，也要按“转折 -> 比较 -> 判断”的顺序组织大纲，避免平铺素材。",
  } satisfies Record<string, unknown>;
  const viewpointIntegration = context.supplementalViewpoints.map((viewpoint) => ({
    viewpoint,
    action: "adopted",
    note: "作为补充观点参与结构规划，但不替代主论点。",
  }));
  const openingHookSeedOptions = [
    `真正拖住 AI 内容生产的，不是某一句 Prompt。是选题、素材、审核和发布之间没人接手。`,
    `一篇 AI 文章写完后还要人工补素材、核查、排版，它就没跑通。问题不在 Prompt，而在流程断点。`,
    `别先看单次生成多漂亮。先看终稿前还要人补多少窟窿，这才是生产线的分水岭。`,
  ];
  const openingOptions = normalizeOpeningOptions(
    [
      { opening: openingHookSeedOptions[0], patternLabel: "历史转折型" },
      { opening: openingHookSeedOptions[1], patternLabel: "冲突回拉型" },
      { opening: openingHookSeedOptions[2], patternLabel: "判断先行型" },
    ],
    buildFallbackOpeningOptions(String(researchBackbone.coreInsightAnchor || context.article.title || "").trim()),
  ).map((item) => withOpeningOptionAliases(item));
  const recommendedOpeningOption = openingOptions.find((item) => item.isRecommended) ?? openingOptions[0] ?? null;
  const openingHookOptions = uniqueStrings(
    [...openingOptions.map((item) => item.opening), ...openingHookSeedOptions],
    4,
  );
  const sections = context.outlineNodes.length > 0
    ? context.outlineNodes.slice(0, 6).map((node, index) => ({
        heading: node.title,
        goal: node.description || ("推进第 " + String(index + 1) + " 个论证层次"),
        keyPoints: [
          truncateText(seedFacts[index] || ("围绕“" + node.title + "”先给出判断，再放事实。"), 80),
        ],
        evidenceHints: seedFacts.slice(index, index + 2),
        materialRefs: materialBundle.slice(index, index + 2).map((item) => item.fragmentId),
        transition: index === 0 ? "从现象切入" : "承接上一段判断，继续加深因果关系",
        researchFocus: index === 0 ? "timeline" : index === 1 ? "comparison" : "intersection",
        researchAnchor:
          index === 0
            ? String(researchBackbone.openingTimelineAnchor || "").trim()
            : index === 1
              ? String(researchBackbone.middleComparisonAnchor || "").trim()
              : String(researchBackbone.coreInsightAnchor || "").trim(),
      }))
    : [
        {
          heading: "先把历史转折立起来",
          goal: "开头直接交代最关键的历史节点，让读者知道今天的问题是怎么走到这一步的。",
          keyPoints: ["关键转折", "它改变了什么", "今天为什么还在影响判断"],
          evidenceHints: seedFacts.slice(0, 2),
          materialRefs: materialBundle.slice(0, 2).map((item) => item.fragmentId),
          transition: "从历史节点转入今天的结构性差异",
          researchFocus: "timeline",
          researchAnchor: String(researchBackbone.openingTimelineAnchor || "").trim(),
        },
        {
          heading: "把横向差异摊开",
          goal: "用横向比较说明真正值得写的差异，不让文章停留在单点观察。",
          keyPoints: ["主要玩家或路径差异", "供给侧或用户结构差异", "最容易被忽略的空位"],
          evidenceHints: seedFacts.slice(1, 3),
          materialRefs: materialBundle.slice(1, 3).map((item) => item.fragmentId),
          transition: "从横向差异推进到这篇文章真正要站住的判断",
          researchFocus: "comparison",
          researchAnchor: String(researchBackbone.middleComparisonAnchor || "").trim(),
        },
        {
          heading: "把差异推成核心判断",
          goal: "把纵向时间脉络和横向比较真正交叉起来，落成这篇文章的主判断。",
          keyPoints: ["为什么是现在", "为什么不是别的解释", "这条判断真正重要在哪"],
          evidenceHints: seedFacts.slice(2, 4),
          materialRefs: materialBundle.slice(2, 4).map((item) => item.fragmentId),
          transition: "从主判断落回读者处境与行动",
          researchFocus: "intersection",
          researchAnchor: String(researchBackbone.coreInsightAnchor || "").trim(),
        },
        {
          heading: "落回读者：怎么理解、怎么行动",
          goal: "把主判断翻译成读者能带走的理解框架、保留意见与下一步动作。",
          keyPoints: ["带走什么判断", "还要保留什么克制", "下一步怎么观察或行动"],
          evidenceHints: seedFacts.slice(0, 2),
          materialRefs: materialBundle.slice(0, 2).map((item) => item.fragmentId),
          transition: "以行动建议收束全文",
          researchFocus: "intersection",
          researchAnchor: String(researchBackbone.coreInsightAnchor || "").trim(),
        },
      ];

  return {
    summary: "建议采用“历史转折—横向差异—核心判断—读者动作”的递进结构，把研究卡真正压进大纲骨架里。",
    workingTitle: context.article.title,
    titleOptions,
    titleStrategyNotes: [
      "6 个标题围绕同一主轴分别从判断、误读、结果分化、细节切口和读者提醒切入，方便横向比较打开率潜力。",
      "标题只放大正文里会真正展开的矛盾和收益点，不拿正文无法兑现的结果做诱饵。",
    ],
    titleAuditedAt: now,
    openingAuditedAt: now,
    outlineUpdatedAt: now,
    centralThesis: String(researchBackbone.coreInsightAnchor || "").trim() || ("围绕“" + context.article.title + "”，用一条主判断串起事实，不做散点式罗列。"),
    openingHook: recommendedOpeningOption?.opening || openingHookSeedOptions[0],
    openingHookOptions,
    openingOptions,
    targetEmotion: "先建立紧迫感，再转入清晰感，最后以确定性的建议收束。",
    targetEmotionOptions: [
      "先建立紧迫感，再转入清晰感，最后以确定性的建议收束。",
      "先制造疑问感，再逐步拆解，最后落到冷静判断。",
      "先写冲突和压力，再把情绪导向可执行的行动感。",
    ],
    researchBackbone,
    supplementalViewpoints: dedupeLimited([...context.supplementalViewpoints, ...researchInsights], 3),
    viewpointIntegration,
    materialBundle,
    outlineSections: sections,
    materialGapHints: [
      ...(materialBundle.length > 0 ? [] : ["当前还没有挂载到大纲阶段的核心素材，至少补 2 条事实素材再继续。"]),
      ...(context.researchBrief ? [] : ["建议先生成研究简报，把时间脉络、横向比较和交汇洞察补齐后再写大纲。"]),
    ],
    endingStrategy: "结尾用一句硬判断 + 一句行动提示收束，避免口号式升华。",
    endingStrategyOptions: [
      "结尾用一句硬判断 + 一句行动提示收束，避免口号式升华。",
      "结尾回到读者处境，给一个保留意见和一个观察点。",
      "结尾不喊口号，只保留清晰结论和下一步判断标准。",
    ],
  } satisfies Record<string, unknown>;
}

function getDeepWritingBaseStrategies(context: GenerationContext) {
  const outlinePlan = context.outlinePlan || {};

  return {
    openingStrategy:
      context.outlineSelection?.selectedOpeningHook ||
      String(outlinePlan.openingHook || "").trim() ||
      "第一段先抛现象或冲突，再给一句硬判断，不要先铺背景。",
    targetEmotion:
      context.outlineSelection?.selectedTargetEmotion ||
      String(outlinePlan.targetEmotion || "").trim() ||
      "先建立值得继续读下去的紧迫感，再把读者带到清晰判断。",
    endingStrategy:
      context.outlineSelection?.selectedEndingStrategy ||
      String(outlinePlan.endingStrategy || "").trim() ||
      context.audienceSelection?.selectedCallToAction ||
      "结尾回到读者动作，给一个判断标准或下一步观察点。",
  };
}

function scoreDeepWritingVariantCandidate(input: {
  diversityReport: ReturnType<typeof buildWritingDiversityReport>;
  optionRank: number;
  outcomeRankingAdjustment?: number;
}) {
  return (
    (input.diversityReport.status === "needs_attention" ? 100 : 0)
    + input.diversityReport.openingRepeatCount * 10
    + input.diversityReport.endingRepeatCount * 8
    + input.diversityReport.syntaxRepeatCount * 9
    + input.diversityReport.prototypeRepeatCount * 10
    + input.diversityReport.stateVariantRepeatCount * 12
    + (input.outcomeRankingAdjustment ?? 0)
    + input.optionRank
  );
}

function getOutcomeWindowRank(windowCode: "24h" | "72h" | "7d") {
  if (windowCode === "7d") return 3;
  if (windowCode === "72h") return 2;
  return 1;
}

function pickDeepWritingOutcomeSnapshot(
  snapshots: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"],
) {
  return snapshots
    .slice()
    .sort((left, right) => {
      const windowDelta = getOutcomeWindowRank(right.windowCode) - getOutcomeWindowRank(left.windowCode);
      if (windowDelta !== 0) {
        return windowDelta;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return right.id - left.id;
    })[0] ?? null;
}

function getDeepWritingOutcomeSampleScore(input: {
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  snapshot: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"][number] | null;
}) {
  let score = 0;
  if (input.hitStatus === "hit") {
    score += 4;
  } else if (input.hitStatus === "near_miss") {
    score += 2;
  } else if (input.hitStatus === "miss") {
    score -= 3;
  }
  if (input.snapshot) {
    if (input.snapshot.readCount >= 500) {
      score += 1;
    }
    if (input.snapshot.shareCount >= 3) {
      score += 1;
    }
    if (input.snapshot.likeCount >= 10) {
      score += 1;
    }
  }
  return score;
}

function shouldCountDeepWritingOutcomeSample(input: {
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  snapshot: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"][number] | null;
}) {
  if (input.hitStatus && input.hitStatus !== "pending") {
    return true;
  }
  return Boolean(
    input.snapshot
    && (
      input.snapshot.readCount >= 500
      || input.snapshot.shareCount >= 3
      || input.snapshot.likeCount >= 10
    ),
  );
}

function getDeepWritingOutcomeRankingAdjustment(performanceScore: number, sampleCount: number) {
  if (sampleCount <= 0) {
    return 0;
  }
  const averageScore = performanceScore / sampleCount;
  let adjustment = 0;
  if (averageScore >= 4) {
    adjustment = -8;
  } else if (averageScore >= 2.5) {
    adjustment = -5;
  } else if (averageScore >= 1) {
    adjustment = -3;
  } else if (averageScore <= -2) {
    adjustment = 7;
  } else if (averageScore < 0) {
    adjustment = 4;
  }
  if (sampleCount === 1 && adjustment !== 0) {
    adjustment = adjustment > 0
      ? Math.max(1, Math.round(adjustment * 0.6))
      : Math.min(-1, Math.round(adjustment * 0.6));
  } else if (sampleCount >= 3 && adjustment !== 0) {
    adjustment += adjustment > 0 ? 1 : -1;
  }
  return adjustment;
}

function createDeepWritingOutcomeBucket(code: string, label: string): DeepWritingOutcomeBucket {
  return {
    code,
    label,
    sampleCount: 0,
    hitCount: 0,
    nearMissCount: 0,
    missCount: 0,
    positiveSampleCount: 0,
    followedRecommendationSampleCount: 0,
    followedRecommendationPositiveCount: 0,
    performanceScore: 0,
  };
}

function registerDeepWritingOutcomeSignal(input: {
  map: Map<string, DeepWritingOutcomeBucket>;
  code: string;
  label: string;
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  performanceScore: number;
  followedRecommendation?: boolean | null;
}) {
  const existing = input.map.get(input.code) ?? createDeepWritingOutcomeBucket(input.code, input.label);
  existing.label = input.label || existing.label || input.code;
  existing.sampleCount += 1;
  existing.performanceScore += input.performanceScore;
  if (input.performanceScore > 0) {
    existing.positiveSampleCount += 1;
  }
  if (input.hitStatus === "hit") {
    existing.hitCount += 1;
  } else if (input.hitStatus === "near_miss") {
    existing.nearMissCount += 1;
  } else if (input.hitStatus === "miss") {
    existing.missCount += 1;
  }
  if (input.followedRecommendation === true) {
    existing.followedRecommendationSampleCount += 1;
    if (input.performanceScore > 0) {
      existing.followedRecommendationPositiveCount += 1;
    }
  }
  input.map.set(input.code, existing);
}

function finalizeDeepWritingOutcomeSignal(bucket: DeepWritingOutcomeBucket, kindLabel: string): DeepWritingOutcomeSignal {
  const rankingAdjustment = getDeepWritingOutcomeRankingAdjustment(bucket.performanceScore, bucket.sampleCount);
  const historySummary =
    bucket.hitCount > 0 || bucket.nearMissCount > 0
      ? "历史 " + String(bucket.sampleCount) + " 篇同" + kindLabel + "里，命中 " + String(bucket.hitCount) + " 篇，接近命中 " + String(bucket.nearMissCount) + " 篇。"
      : bucket.missCount > 0
        ? "历史 " + String(bucket.sampleCount) + " 篇同" + kindLabel + "里，未达目标 " + String(bucket.missCount) + " 篇。"
        : "历史已有 " + String(bucket.sampleCount) + " 篇同" + kindLabel + "结果样本。";
  const recommendationSummary =
    bucket.followedRecommendationSampleCount > 0
      ? bucket.followedRecommendationPositiveCount > 0
        ? "按系统推荐采用时表现更稳。"
        : "按系统推荐采用暂无明显优势。"
      : "";
  const weightingSummary =
    rankingAdjustment < 0
      ? "这次会轻度加权。"
      : rankingAdjustment > 0
        ? "这次先降权观察。"
        : "";

  return {
    ...bucket,
    rankingAdjustment,
    reason: [historySummary, recommendationSummary, weightingSummary].filter(Boolean).join(" "),
  };
}

function buildDeepWritingOutcomeSignalPayload(signal: DeepWritingOutcomeSignal | null | undefined) {
  if (!signal) {
    return null;
  }
  return {
    sampleCount: signal.sampleCount,
    hitCount: signal.hitCount,
    nearMissCount: signal.nearMissCount,
    missCount: signal.missCount,
    positiveSampleCount: signal.positiveSampleCount,
    followedRecommendationSampleCount: signal.followedRecommendationSampleCount,
    followedRecommendationPositiveCount: signal.followedRecommendationPositiveCount,
    performanceScore: signal.performanceScore,
    rankingAdjustment: signal.rankingAdjustment,
    reason: signal.reason,
  } satisfies Record<string, unknown>;
}

function summarizeDeepWritingOutcomeFeedback(input: {
  articleId: number;
  outcomeBundles: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>;
  deepWritingArtifacts: Awaited<ReturnType<typeof getArticleStageArtifactsByDocumentIds>>;
}) {
  const artifactMap = new Map(input.deepWritingArtifacts.map((item) => [item.articleId, item] as const));
  const prototypeBuckets = new Map<string, DeepWritingOutcomeBucket>();
  const stateBuckets = new Map<string, DeepWritingOutcomeBucket>();
  let articleSampleCount = 0;

  for (const bundle of input.outcomeBundles) {
    const articleId = bundle.outcome?.articleId ?? 0;
    if (!articleId || articleId === input.articleId) {
      continue;
    }
    const artifactItem = artifactMap.get(articleId);
    const payload = normalizeRecord(artifactItem?.artifact.payload);
    if (!payload) {
      continue;
    }
    const prototypeCode = getTrimmedString(payload.articlePrototype);
    const prototypeLabel = getTrimmedString(payload.articlePrototypeLabel) || prototypeCode;
    const stateVariantCode = getTrimmedString(payload.stateVariantCode);
    const stateVariantLabel = getTrimmedString(payload.stateVariantLabel) || stateVariantCode;
    if (!prototypeCode && !stateVariantCode) {
      continue;
    }
    const snapshot = pickDeepWritingOutcomeSnapshot(bundle.snapshots);
    const hitStatus = bundle.outcome?.hitStatus ?? null;
    if (!shouldCountDeepWritingOutcomeSample({ hitStatus, snapshot })) {
      continue;
    }
    const performanceScore = getDeepWritingOutcomeSampleScore({ hitStatus, snapshot });
    const followedPrototypeRecommendation = snapshot?.writingStateFeedback?.followedPrototypeRecommendation ?? null;
    const followedVariantRecommendation = snapshot?.writingStateFeedback?.followedRecommendation ?? null;
    articleSampleCount += 1;

    if (prototypeCode) {
      registerDeepWritingOutcomeSignal({
        map: prototypeBuckets,
        code: prototypeCode,
        label: prototypeLabel || prototypeCode,
        hitStatus,
        performanceScore,
        followedRecommendation: followedPrototypeRecommendation,
      });
    }
    if (stateVariantCode) {
      registerDeepWritingOutcomeSignal({
        map: stateBuckets,
        code: stateVariantCode,
        label: stateVariantLabel || stateVariantCode,
        hitStatus,
        performanceScore,
        followedRecommendation: followedVariantRecommendation,
      });
    }
  }

  if (articleSampleCount === 0) {
    return null;
  }

  return {
    articleSampleCount,
    prototypeSignals: new Map(
      Array.from(prototypeBuckets.values()).map((item) => {
        const signal = finalizeDeepWritingOutcomeSignal(item, "原型");
        return [signal.code, signal] as const;
      }),
    ),
    stateSignals: new Map(
      Array.from(stateBuckets.values()).map((item) => {
        const signal = finalizeDeepWritingOutcomeSignal(item, "状态");
        return [signal.code, signal] as const;
      }),
    ),
  };
}

async function resolveDeepWritingState(
  context: GenerationContext,
  preferredStateVariantCode?: WritingStateVariantCode | null,
  preferredPrototypeCode?: ArticlePrototypeCode | null,
) {
  const baseStrategies = getDeepWritingBaseStrategies(context);
  const archetypeRhythmHints = await getMergedActiveArchetypeRhythmHints({
    archetype:
      normalizeStrategyArchetypeKey(context.strategyCard?.archetype)
      ?? normalizeStrategyArchetypeKey(context.seriesInsight?.defaultArchetype),
    override: context.seriesInsight?.rhythmOverride ?? null,
  });
  const buildCandidate = (variantCode?: WritingStateVariantCode | null, prototypeCode?: ArticlePrototypeCode | null) => {
    const writingState = buildWritingStateKernel({
      title: context.article.title,
      markdownContent: context.article.markdownContent,
      humanSignals: context.humanSignals,
      writingStyleProfile: context.writingStyleProfile,
      seriesInsight: context.seriesInsight,
      researchBrief: context.researchBrief,
      strategyCard: context.strategyCard,
      archetypeRhythmHints,
      preferredPrototypeCode: prototypeCode,
      preferredVariantCode: variantCode,
    });
    const diversityReport = buildWritingDiversityReport({
      currentArticle: {
        id: context.article.id,
        title: context.article.title,
        markdownContent: context.article.markdownContent,
      },
      deepWritingPayload: {
        articlePrototype: writingState.articlePrototype,
        articlePrototypeLabel: writingState.articlePrototypeLabel,
        articlePrototypeReason: writingState.articlePrototypeReason,
        prototypeOptions: writingState.prototypeOptions,
        openingStrategy: baseStrategies.openingStrategy,
        openingMove: writingState.openingMove,
        endingStrategy: baseStrategies.endingStrategy,
        stateVariantCode: writingState.stateVariantCode,
        stateVariantLabel: writingState.stateVariantLabel,
        stateOptions: writingState.stateOptions,
      },
      recentArticles: context.recentArticles,
      recentDeepWritingStates: context.recentDeepWritingStates,
    });

    return {
      writingState,
      diversityReport,
    };
  };

  const autoCandidate = buildCandidate(null, null);
  const prototypeOptionRankMap = new Map(
    autoCandidate.writingState.prototypeOptions.map((item, index) => [item.code, index] as const),
  );
  const prototypeCandidateByCode = new Map<ArticlePrototypeCode, ReturnType<typeof buildCandidate>>();
  for (const option of autoCandidate.writingState.prototypeOptions) {
    if (!prototypeCandidateByCode.has(option.code)) {
      prototypeCandidateByCode.set(option.code, buildCandidate(null, option.code));
    }
  }
  const autoPrototypeCandidate =
    prototypeCandidateByCode.get(autoCandidate.writingState.articlePrototype) ??
    autoCandidate;
  const rankedPrototypeCandidates = Array.from(prototypeCandidateByCode.values()).sort((left, right) => {
    const leftOutcomeSignal = context.deepWritingOutcomeFeedback?.prototypeSignals.get(left.writingState.articlePrototype) ?? null;
    const rightOutcomeSignal = context.deepWritingOutcomeFeedback?.prototypeSignals.get(right.writingState.articlePrototype) ?? null;
    const leftScore = scoreDeepWritingVariantCandidate({
      diversityReport: left.diversityReport,
      optionRank: prototypeOptionRankMap.get(left.writingState.articlePrototype) ?? 99,
      outcomeRankingAdjustment: leftOutcomeSignal?.rankingAdjustment ?? 0,
    });
    const rightScore = scoreDeepWritingVariantCandidate({
      diversityReport: right.diversityReport,
      optionRank: prototypeOptionRankMap.get(right.writingState.articlePrototype) ?? 99,
      outcomeRankingAdjustment: rightOutcomeSignal?.rankingAdjustment ?? 0,
    });
    return leftScore - rightScore;
  });
  const bestPrototypeCandidate = rankedPrototypeCandidates[0] ?? autoPrototypeCandidate;
  const autoPrototypeScore = scoreDeepWritingVariantCandidate({
    diversityReport: autoPrototypeCandidate.diversityReport,
    optionRank: prototypeOptionRankMap.get(autoPrototypeCandidate.writingState.articlePrototype) ?? 99,
    outcomeRankingAdjustment:
      context.deepWritingOutcomeFeedback?.prototypeSignals.get(autoPrototypeCandidate.writingState.articlePrototype)?.rankingAdjustment ?? 0,
  });
  const bestPrototypeScore = scoreDeepWritingVariantCandidate({
    diversityReport: bestPrototypeCandidate.diversityReport,
    optionRank: prototypeOptionRankMap.get(bestPrototypeCandidate.writingState.articlePrototype) ?? 99,
    outcomeRankingAdjustment:
      context.deepWritingOutcomeFeedback?.prototypeSignals.get(bestPrototypeCandidate.writingState.articlePrototype)?.rankingAdjustment ?? 0,
  });
  let prototypeRotationReason: string | null = null;
  const selectedPrototypeCandidate =
    preferredPrototypeCode
      ? prototypeCandidateByCode.get(preferredPrototypeCode) ?? autoPrototypeCandidate
      : bestPrototypeCandidate.writingState.articlePrototype !== autoPrototypeCandidate.writingState.articlePrototype && bestPrototypeScore < autoPrototypeScore
        ? (() => {
            prototypeRotationReason = [
              "系统原本推荐「" + autoPrototypeCandidate.writingState.articlePrototypeLabel + "」，但最近几篇的题型重复风险更高。",
              "这次已自动轮换到「" + bestPrototypeCandidate.writingState.articlePrototypeLabel + "」，优先换掉同一种推进骨架。",
              bestPrototypeCandidate.diversityReport.suggestions[0] || "",
            ].filter(Boolean).join(" ");
            return bestPrototypeCandidate;
          })()
        : autoPrototypeCandidate;
  const selectedPrototypeOutcomeSignal =
    context.deepWritingOutcomeFeedback?.prototypeSignals.get(selectedPrototypeCandidate.writingState.articlePrototype) ?? null;
  const prototypeComparisons = rankedPrototypeCandidates.slice(0, 3).map((candidate, index) => {
    const currentOption = candidate.writingState.prototypeOptions.find((item) => item.code === candidate.writingState.articlePrototype) ?? null;
    const outcomeSignal = context.deepWritingOutcomeFeedback?.prototypeSignals.get(candidate.writingState.articlePrototype) ?? null;
    return {
      code: candidate.writingState.articlePrototype,
      label: candidate.writingState.articlePrototypeLabel,
      reason: [
        candidate.writingState.articlePrototype === selectedPrototypeCandidate.writingState.articlePrototype && prototypeRotationReason
          ? prototypeRotationReason
          : candidate.writingState.articlePrototypeReason,
        outcomeSignal?.reason || null,
      ].filter(Boolean).join(" "),
      suitableWhen: String(currentOption?.suitableWhen || "").trim(),
      triggerReason: String(currentOption?.triggerReason || "").trim(),
      openingMove: candidate.writingState.openingMove,
      sectionRhythm: candidate.writingState.sectionRhythm,
      evidenceMode: candidate.writingState.evidenceMode,
      recommendedStateVariantLabel: candidate.writingState.stateVariantLabel,
      openingPatternLabel: candidate.diversityReport.currentOpeningPatternLabel,
      syntaxPatternLabel: candidate.diversityReport.currentSyntaxPatternLabel,
      endingPatternLabel: candidate.diversityReport.currentEndingPatternLabel,
      diversitySummary: candidate.diversityReport.summary,
      diversityIssues: candidate.diversityReport.issues.slice(0, 2),
      diversitySuggestions: candidate.diversityReport.suggestions.slice(0, 2),
      progressiveRevealLabel: candidate.writingState.progressiveRevealLabel,
      progressiveRevealReason: candidate.writingState.progressiveRevealReason,
      historySignal: buildDeepWritingOutcomeSignalPayload(outcomeSignal),
      isRecommended: index === 0,
    };
  });

  const selectedPrototypeCode = selectedPrototypeCandidate.writingState.articlePrototype;
  const stateOptionRankMap = new Map(
    selectedPrototypeCandidate.writingState.stateOptions.map((item, index) => [item.code, index] as const),
  );
  const stateCandidateByCode = new Map<WritingStateVariantCode, ReturnType<typeof buildCandidate>>();
  for (const option of selectedPrototypeCandidate.writingState.stateOptions) {
    if (!stateCandidateByCode.has(option.code)) {
      stateCandidateByCode.set(option.code, buildCandidate(option.code, selectedPrototypeCode));
    }
  }
  const autoStateCandidate =
    stateCandidateByCode.get(selectedPrototypeCandidate.writingState.stateVariantCode) ??
    selectedPrototypeCandidate;
  const rankedStateCandidates = Array.from(stateCandidateByCode.values()).sort((left, right) => {
    const leftOutcomeSignal = context.deepWritingOutcomeFeedback?.stateSignals.get(left.writingState.stateVariantCode) ?? null;
    const rightOutcomeSignal = context.deepWritingOutcomeFeedback?.stateSignals.get(right.writingState.stateVariantCode) ?? null;
    const leftScore = scoreDeepWritingVariantCandidate({
      diversityReport: left.diversityReport,
      optionRank: stateOptionRankMap.get(left.writingState.stateVariantCode) ?? 99,
      outcomeRankingAdjustment: leftOutcomeSignal?.rankingAdjustment ?? 0,
    });
    const rightScore = scoreDeepWritingVariantCandidate({
      diversityReport: right.diversityReport,
      optionRank: stateOptionRankMap.get(right.writingState.stateVariantCode) ?? 99,
      outcomeRankingAdjustment: rightOutcomeSignal?.rankingAdjustment ?? 0,
    });
    return leftScore - rightScore;
  });
  const bestStateCandidate = rankedStateCandidates[0] ?? autoStateCandidate;
  const autoStateScore = scoreDeepWritingVariantCandidate({
    diversityReport: autoStateCandidate.diversityReport,
    optionRank: stateOptionRankMap.get(autoStateCandidate.writingState.stateVariantCode) ?? 99,
    outcomeRankingAdjustment:
      context.deepWritingOutcomeFeedback?.stateSignals.get(autoStateCandidate.writingState.stateVariantCode)?.rankingAdjustment ?? 0,
  });
  const bestStateScore = scoreDeepWritingVariantCandidate({
    diversityReport: bestStateCandidate.diversityReport,
    optionRank: stateOptionRankMap.get(bestStateCandidate.writingState.stateVariantCode) ?? 99,
    outcomeRankingAdjustment:
      context.deepWritingOutcomeFeedback?.stateSignals.get(bestStateCandidate.writingState.stateVariantCode)?.rankingAdjustment ?? 0,
  });
  let stateRotationReason: string | null = null;
  const selectedStateCandidate =
    preferredStateVariantCode
      ? stateCandidateByCode.get(preferredStateVariantCode) ?? autoStateCandidate
      : bestStateCandidate.writingState.stateVariantCode !== autoStateCandidate.writingState.stateVariantCode && bestStateScore < autoStateScore
        ? (() => {
            stateRotationReason = [
              "系统原本推荐「" + autoStateCandidate.writingState.stateVariantLabel + "」，但最近几篇的写法重复风险更高。",
              "这次已自动轮换到「" + bestStateCandidate.writingState.stateVariantLabel + "」，优先错开开头、句法、收尾或状态连用。",
              bestStateCandidate.diversityReport.suggestions[0] || "",
            ].filter(Boolean).join(" ");
            return bestStateCandidate;
          })()
        : autoStateCandidate;
  const selectedStateOutcomeSignal =
    context.deepWritingOutcomeFeedback?.stateSignals.get(selectedStateCandidate.writingState.stateVariantCode) ?? null;
  const stateComparisons = rankedStateCandidates.slice(0, 3).map((candidate, index) => {
    const currentOption = candidate.writingState.stateOptions.find((item) => item.code === candidate.writingState.stateVariantCode) ?? null;
    const outcomeSignal = context.deepWritingOutcomeFeedback?.stateSignals.get(candidate.writingState.stateVariantCode) ?? null;
    return {
      code: candidate.writingState.stateVariantCode,
      label: candidate.writingState.stateVariantLabel,
      reason: [
        candidate.writingState.stateVariantCode === selectedStateCandidate.writingState.stateVariantCode && stateRotationReason
          ? stateRotationReason
          : candidate.writingState.stateVariantReason,
        outcomeSignal?.reason || null,
      ].filter(Boolean).join(" "),
      suitableWhen: String(currentOption?.suitableWhen || "").trim(),
      triggerReason: String(currentOption?.triggerReason || "").trim(),
      openingMove: candidate.writingState.openingMove,
      openingPatternLabel: candidate.diversityReport.currentOpeningPatternLabel,
      syntaxPatternLabel: candidate.diversityReport.currentSyntaxPatternLabel,
      endingPatternLabel: candidate.diversityReport.currentEndingPatternLabel,
      diversitySummary: candidate.diversityReport.summary,
      diversityIssues: candidate.diversityReport.issues.slice(0, 2),
      diversitySuggestions: candidate.diversityReport.suggestions.slice(0, 2),
      progressiveRevealLabel: candidate.writingState.progressiveRevealLabel,
      progressiveRevealReason: candidate.writingState.progressiveRevealReason,
      historySignal: buildDeepWritingOutcomeSignalPayload(outcomeSignal),
      isRecommended: index === 0,
    };
  });
  const reorderedPrototypeOptions = [
    ...selectedStateCandidate.writingState.prototypeOptions.filter((item) => item.code === selectedStateCandidate.writingState.articlePrototype),
    ...selectedStateCandidate.writingState.prototypeOptions.filter((item) => item.code !== selectedStateCandidate.writingState.articlePrototype),
  ];
  const reorderedStateOptions = [
    ...selectedStateCandidate.writingState.stateOptions.filter((item) => item.code === selectedStateCandidate.writingState.stateVariantCode),
    ...selectedStateCandidate.writingState.stateOptions.filter((item) => item.code !== selectedStateCandidate.writingState.stateVariantCode),
  ];

  return {
    ...baseStrategies,
    diversityReport: selectedStateCandidate.diversityReport,
    writingState: {
      ...selectedStateCandidate.writingState,
      articlePrototypeReason: [
        prototypeRotationReason || selectedStateCandidate.writingState.articlePrototypeReason,
        context.deepWritingOutcomeFeedback?.prototypeSignals.get(selectedStateCandidate.writingState.articlePrototype)?.reason || null,
      ].filter(Boolean).join(" "),
      stateVariantReason: [
        stateRotationReason || selectedStateCandidate.writingState.stateVariantReason,
        context.deepWritingOutcomeFeedback?.stateSignals.get(selectedStateCandidate.writingState.stateVariantCode)?.reason || null,
      ].filter(Boolean).join(" "),
      prototypeOptions: reorderedPrototypeOptions,
      stateOptions: reorderedStateOptions,
    },
    selectedPrototypeOutcomeSignal,
    selectedStateOutcomeSignal,
    prototypeComparisons,
    stateComparisons,
  };
}

async function fallbackDeepWriting(
  context: GenerationContext,
  preferredStateVariantCode?: WritingStateVariantCode | null,
  preferredPrototypeCode?: ArticlePrototypeCode | null,
) {
  const resolvedState = await resolveDeepWritingState(context, preferredStateVariantCode, preferredPrototypeCode);
  const writingState = resolvedState.writingState;
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const researchInsights = getRecordArray(context.researchBrief?.intersectionInsights).map((item) => String(item.insight || "").trim()).filter(Boolean);
  const outlinePlan = context.outlinePlan || {};
  const selectedTitle =
    context.outlineSelection?.selectedTitle ||
    String(outlinePlan.workingTitle || "").trim() ||
    context.article.title;
  const centralThesis =
    String(outlinePlan.centralThesis || "").trim() ||
    preferredResearchSignals.coreAssertion ||
    preferredResearchSignals.researchHypothesis ||
    ("围绕“" + selectedTitle + "”把素材重新组织成一条清晰判断，不做散点式复述。");
  const openingStrategy = resolvedState.openingStrategy;
  const targetEmotion = resolvedState.targetEmotion;
  const endingStrategy = resolvedState.endingStrategy;
  const diversityReport = resolvedState.diversityReport;
  const openingDiversityGuard =
    diversityReport.openingRepeatCount >= 3
      ? "最近几篇已经反复用「" + diversityReport.currentOpeningPatternLabel + "」开头，这次必须主动换切口。"
      : "";
  const endingDiversityGuard =
    diversityReport.endingRepeatCount >= 3
      ? "最近几篇已经反复停在「" + diversityReport.currentEndingPatternLabel + "」收尾，这次必须主动换一种停法。"
      : "";
  const syntaxDiversityGuard =
    diversityReport.syntaxRepeatCount >= 3
      ? "最近几篇已经反复用「" + diversityReport.currentSyntaxPatternLabel + "」句法推进，这次必须主动换一种句法呼吸。"
      : "";
  const prototypeDiversityGuard =
    diversityReport.prototypeRepeatCount >= 3 && diversityReport.currentPrototypeLabel
      ? "最近几篇已经反复写成「" + diversityReport.currentPrototypeLabel + "」，这次必须主动换一种推进骨架。"
      : "";
  const guardedOpeningStrategy = [openingStrategy, openingDiversityGuard, syntaxDiversityGuard].filter(Boolean).join(" ");
  const guardedEndingStrategy = [endingStrategy, prototypeDiversityGuard, endingDiversityGuard].filter(Boolean).join(" ");
  const sectionSource = getRecordArray(outlinePlan.outlineSections);
  const getRevealRole = (index: number, total: number) => {
    if (!writingState.progressiveRevealEnabled) {
      return "";
    }
    if (index === 0) return "铺垫样本";
    if (index >= Math.max(1, total - 2)) {
      return index === total - 1 ? "收束判断" : "最强发现";
    }
    return "逐层加码";
  };
  const sectionBlueprint = (
    sectionSource.length
          ? sectionSource
          : context.outlineNodes.slice(0, 6).map((node, index) => ({
              heading: node.title,
              goal: node.description || ("推进第 " + String(index + 1) + " 层论证"),
              keyPoints: ["围绕“" + node.title + "”先下判断，再补事实。"],
              evidenceHints: getSourceFacts(context, 4).slice(index, index + 2),
              materialRefs: [],
              transition: index === 0 ? "从现象切入" : "承接上一段继续推进判断",
            }))
  ).slice(0, 6);
  const sectionBlueprintTotal = sectionBlueprint.length;
  const normalizedSectionBlueprint = sectionBlueprint.map((section, index) => ({
      heading: String(section.heading || "").trim() || ("章节 " + String(index + 1)),
      goal: String(section.goal || "").trim() || ("推进第 " + String(index + 1) + " 段论证"),
      paragraphMission:
        getStringArray((section as Record<string, unknown>).keyPoints, 3).join("；") ||
        ("围绕“" + (String(section.heading || "").trim() || ("章节 " + String(index + 1))) + "”写出一段结论先行的正文。"),
      evidenceHints: getStringArray((section as Record<string, unknown>).evidenceHints, 3),
      materialRefs: Array.isArray((section as Record<string, unknown>).materialRefs)
        ? ((section as Record<string, unknown>).materialRefs as unknown[])
            .map((ref) => Number(ref || 0))
            .filter((ref) => Number.isInteger(ref) && ref > 0)
            .slice(0, 4)
        : [],
      revealRole: getRevealRole(index, sectionBlueprintTotal),
      transition: String((section as Record<string, unknown>).transition || "").trim(),
    }));

  return {
    summary: "正文建议按“" + selectedTitle + "”直接进入完整写作，当前采用「" + writingState.articlePrototypeLabel + " / " + writingState.stateVariantLabel + "」，先沿用已确认大纲和素材，不要离题扩写。" + (diversityReport.status === "needs_attention" ? " 同时启用去重护栏，避免最近几篇又写成同一个原型、开头、句法、收尾或状态。" : ""),
    selectedTitle,
    centralThesis,
    writingAngle: context.audienceSelection?.selectedReaderLabel
      ? "写给 " + context.audienceSelection.selectedReaderLabel + "，先给判断，再补证据与行动意义。"
      : "写给希望快速形成判断的读者，先给结论，再拆证据和影响。",
    openingStrategy: guardedOpeningStrategy,
    targetEmotion,
    endingStrategy: guardedEndingStrategy,
    openingPatternLabel: diversityReport.currentOpeningPatternLabel,
    syntaxPatternLabel: diversityReport.currentSyntaxPatternLabel,
    endingPatternLabel: diversityReport.currentEndingPatternLabel,
    articlePrototype: writingState.articlePrototype,
    articlePrototypeLabel: writingState.articlePrototypeLabel,
    articlePrototypeReason: writingState.articlePrototypeReason,
    prototypeHistorySignal: buildDeepWritingOutcomeSignalPayload(resolvedState.selectedPrototypeOutcomeSignal),
    stateVariantCode: writingState.stateVariantCode,
    stateVariantLabel: writingState.stateVariantLabel,
    stateVariantReason: writingState.stateVariantReason,
    stateHistorySignal: buildDeepWritingOutcomeSignalPayload(resolvedState.selectedStateOutcomeSignal),
    researchFocus: writingState.researchFocus,
    researchLens: writingState.researchLens,
    openingMove: writingState.openingMove,
    sectionRhythm: writingState.sectionRhythm,
    evidenceMode: writingState.evidenceMode,
    progressiveRevealEnabled: writingState.progressiveRevealEnabled,
    progressiveRevealLabel: writingState.progressiveRevealLabel,
    progressiveRevealReason: writingState.progressiveRevealReason,
    climaxPlacement: writingState.climaxPlacement,
    escalationRule: writingState.escalationRule,
    progressiveRevealSteps: writingState.progressiveRevealSteps,
    diversitySummary: diversityReport.summary,
    diversityIssues: diversityReport.issues,
    diversitySuggestions: diversityReport.suggestions,
    stateChecklist: [
      ...writingState.stateChecklist,
      ...diversityReport.suggestions.slice(0, 2),
    ].slice(0, 6),
    prototypeOptions: writingState.prototypeOptions.map((item) => ({
      code: item.code,
      label: item.label,
      suitableWhen: item.suitableWhen,
      triggerReason: item.triggerReason,
      openingMove: item.openingMove,
      sectionRhythm: item.sectionRhythm,
      evidenceMode: item.evidenceMode,
    })),
    prototypeComparisons: resolvedState.prototypeComparisons,
    stateOptions: writingState.stateOptions.map((item) => ({
      code: item.code,
      label: item.label,
      suitableWhen: item.suitableWhen,
      triggerReason: item.triggerReason,
    })),
    stateComparisons: resolvedState.stateComparisons,
    voiceChecklist: Array.from(
      new Set([
        context.audienceSelection?.selectedLanguageGuidance,
        context.audienceSelection?.selectedBackgroundAwareness,
        context.audienceSelection?.selectedReadabilityLevel,
        researchInsights[0] ? "优先围绕这条研究洞察推进：" + researchInsights[0] : null,
        "短句优先，避免解释腔和机器腔。",
        "每一段只推进一个判断，并挂一个事实锚点。",
        context.persona?.summary ? "贴近人设表达：" + context.persona.summary : null,
      ].map((item) => String(item || "").trim()).filter(Boolean)),
    ).slice(0, 6),
    mustUseFacts: getSourceFacts(context, 6),
    bannedWordWatchlist: context.bannedWords.slice(0, 8),
    sectionBlueprint: normalizedSectionBlueprint,
    historyReferencePlan: context.historyReferences.slice(0, 2).map((item) => ({
      title: item.title,
      useWhen: item.relationReason || "当需要补前情、延伸判断或形成自然承接时再引用。",
      bridgeSentence: item.bridgeSentence || "",
    })),
    seriesInsight: context.seriesInsight,
    seriesChecklist: context.seriesInsight
      ? [
          context.seriesInsight.label ? "当前文章属于「" + context.seriesInsight.label + "」这条连续写作线。" : null,
          ...context.seriesInsight.driftRisks.slice(0, 2),
          ...context.seriesInsight.whyNow.slice(0, 2),
        ].filter(Boolean)
      : [],
    finalChecklist: [
      "标题、开头、结尾与已确认大纲保持一致，不要临时换题。",
      ...diversityReport.suggestions.slice(0, 2),
      "先写判断，再写事实，不要把背景介绍铺满前两段。",
      context.researchBrief ? "至少吃透一条时间脉络卡和一条横向比较卡，再把判断写硬。" : "没有研究卡时，正文判断要更克制，避免把猜测写成定论。",
      "截图素材只能作为原图插入，不要改写成伪引用。",
      "历史文章只能自然带出，不要生成“相关文章”区块。",
      "有数字、时间、案例的句子优先保留来源锚点或谨慎语气。",
      context.seriesInsight?.driftRisks[0] || null,
    ].filter(Boolean),
  } satisfies Record<string, unknown>;
}

function fallbackFactCheck(context: GenerationContext) {
  const claims = getDocumentClaims(context, 6);
  const factSet = new Set(getSourceFacts(context, 10));
  const researchReview = buildFactCheckResearchReview(context);
  const checks = claims.map((claim) => {
    const verified = Array.from(factSet).some((fact) => fact.includes(claim.slice(0, 12)) || claim.includes(fact.slice(0, 12)));
    return {
      claim,
      status: verified ? "verified" : /\d|%|倍|年|月|日/.test(claim) ? "needs_source" : "opinion",
      suggestion: verified
        ? "可直接引用，但最好补上来源名称或时间。"
        : /\d|%|倍|年|月|日/.test(claim)
          ? "补一手来源、时间点或原始截图链接。"
          : "标注为判断或经验总结，避免写成绝对事实。",
    };
  });
  const riskyCount = checks.filter((item) => item.status === "risky").length;
  const needsSourceCount = checks.filter((item) => item.status === "needs_source").length;
  const opinionCount = checks.filter((item) => item.status === "opinion").length;
  const riskCount = riskyCount + needsSourceCount + opinionCount;
  return {
    summary: riskCount > 0 ? "当前稿子里至少有 " + String(riskCount) + " 条表述需要补来源或改成判断语气。" : "当前主要事实表述基本可站住脚，进入终稿前仍建议补齐来源锚点。",
    overallRisk: riskyCount > 0 ? "high" : needsSourceCount >= 2 ? "medium" : "low",
    checks,
    evidenceCards: buildFactCheckEvidenceCards(context, checks),
    missingEvidence: dedupeLimited([
      ...checks.filter((item) => item.status === "needs_source").map((item) => item.claim),
      ...researchReview.gaps,
    ], 6),
    researchReview,
    personaAlignment: context.persona ? "当前文风与“" + context.persona.name + "”基本匹配，但要避免为了人设而牺牲证据密度。" : "当前没有明确人设约束，建议统一为克制、可信的专栏口吻。",
    topicAlignment: "正文整体围绕“" + context.article.title + "”，建议删掉与主判断弱相关的旁支信息。",
  } satisfies Record<string, unknown>;
}

function fallbackProsePolish(context: GenerationContext) {
  const plain = stripMarkdown(context.article.markdownContent);
  const paragraphs = context.article.markdownContent.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const longParagraph = paragraphs.find((item) => stripMarkdown(item).length > 180);
  const firstSentence = plain.split(/[。！？!?]/).map((item) => item.trim()).find(Boolean) || context.article.title;
  const bannedHits = context.bannedWords.filter((word) => plain.includes(word)).slice(0, 4);
  const languageGuardHits = collectLanguageGuardHits(plain, context.languageGuardRules).slice(0, 6);
  const aiNoise = analyzeAiNoise(context.article.markdownContent);
  return {
    summary: "这版稿子适合继续做语言降噪与节奏修整，重点是缩短重句、增强首段抓力，并把判断句打得更硬。",
    overallDiagnosis: longParagraph ? "段落偏长，节奏略闷，需要切分。" : "整体节奏可用，但还可以再提升开头与收尾的记忆点。",
    strengths: [
      plain.length >= 240 ? "正文已经具备一定信息密度。" : "正文简洁，方便继续扩写。",
      context.knowledgeCards.length > 0 ? "已经有背景卡可作为事实支撑。" : "主题集中，易于继续打磨单一观点。",
      context.persona ? "人设方向较明确：" + context.persona.name + "。" : "稿件口吻还留有较大可塑空间。",
    ],
    issues: [
      longParagraph
        ? {
            type: "段落过长",
            example: truncateText(stripMarkdown(longParagraph), 60),
            suggestion: "把一个段落拆成“判断句 + 事实句 + 结论句”三拍节奏。",
          }
        : null,
      bannedHits.length
        ? {
            type: "机器腔词汇",
            example: bannedHits.join("、"),
            suggestion: "用更具体的动作、结果和对象替换抽象黑话。",
          }
        : null,
      {
        type: "开头抓力不足",
        example: truncateText(firstSentence, 60),
        suggestion: "开头先抛现象或反常识判断，再补背景。",
      },
    ].filter(Boolean),
    languageGuardHits,
    rewrittenLead: [
      "真正拖慢内容生产的，往往不是某一句提示词，而是素材、核查、排版和发布之间的断点。",
      "只要终稿前还要反复补证据、改结构、查风险，这套流程就还没有形成生产线。",
    ].join("\n\n"),
    punchlines: [
      "这篇稿子最该强化的，不是态度，而是“" + context.article.title + "”背后的证据密度。",
      "先让读者看见变化，再让他接受判断。",
    ],
    rhythmAdvice: [
      "连续两段解释之后，插入一句短结论换气。",
      "每个二级标题下优先保留 2-3 个事实锚点，不要把判断埋进长段落。",
    ],
    aiNoise,
  } satisfies Record<string, unknown>;
}

function normalizeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeResearchBriefPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const sourceCoverage = normalizeRecord(payload?.sourceCoverage) || normalizeRecord(fallback.sourceCoverage) || {};
  const fallbackSourceCoverage = normalizeRecord(fallback.sourceCoverage) || {};
  const sourceKeys = Object.keys(RESEARCH_SOURCE_CATEGORY_LABELS) as ResearchSourceCategoryKey[];
  const normalizedSourceCoverage = sourceKeys.reduce<Record<string, string[]>>((acc, key) => {
    acc[key] = uniqueStrings(sourceCoverage[key], 4);
    return acc;
  }, {
    official: [],
    industry: [],
    comparison: [],
    userVoice: [],
    timeline: [],
  });
  const sourceCoverageCoveredCount = sourceKeys.filter((key) => normalizedSourceCoverage[key].length > 0).length;
  const derivedSufficiency =
    sourceCoverageCoveredCount >= 4
      ? "ready"
      : sourceCoverageCoveredCount >= 2
        ? "limited"
        : "blocked";
  const fallbackSufficiency = String(fallbackSourceCoverage.sufficiency || "").trim();
  const normalizedSufficiency = pickStricterResearchSufficiency(
    String(sourceCoverage.sufficiency || "").trim() || derivedSufficiency,
    fallbackSufficiency,
  ) || derivedSufficiency;
  const mergedMissingCategories = uniqueStrings(
    [
      ...uniqueStrings(sourceCoverage.missingCategories, 5),
      ...uniqueStrings(fallbackSourceCoverage.missingCategories, 5),
    ],
    5,
  );
  const weakOnlyCategories = uniqueStrings(
    [
      ...uniqueStrings(sourceCoverage.weakOnlyCategories, 5),
      ...uniqueStrings(fallbackSourceCoverage.weakOnlyCategories, 5),
    ],
    5,
  );

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    researchObject: String(payload?.researchObject || fallback.researchObject || "").trim(),
    coreQuestion: String(payload?.coreQuestion || fallback.coreQuestion || "").trim(),
    authorHypothesis: String(payload?.authorHypothesis || fallback.authorHypothesis || "").trim(),
    targetReader: String(payload?.targetReader || fallback.targetReader || "").trim(),
    mustCoverAngles:
      uniqueStrings(payload?.mustCoverAngles, 6).length
        ? uniqueStrings(payload?.mustCoverAngles, 6)
        : uniqueStrings(fallback.mustCoverAngles, 6),
    hypothesesToVerify:
      uniqueStrings(payload?.hypothesesToVerify, 5).length
        ? uniqueStrings(payload?.hypothesesToVerify, 5)
        : uniqueStrings(fallback.hypothesesToVerify, 5),
    forbiddenConclusions:
      uniqueStrings(payload?.forbiddenConclusions, 5).length
        ? uniqueStrings(payload?.forbiddenConclusions, 5)
        : uniqueStrings(fallback.forbiddenConclusions, 5),
    sourceCoverage: {
      ...normalizedSourceCoverage,
      strongCategoryCount:
        Number(sourceCoverage.strongCategoryCount ?? fallbackSourceCoverage.strongCategoryCount ?? 0) || 0,
      weakOnlyCategories,
      sufficiency: normalizedSufficiency,
      missingCategories:
        mergedMissingCategories.length
          ? mergedMissingCategories
          : sourceKeys
              .filter((key) => normalizedSourceCoverage[key].length === 0)
              .map((key) => RESEARCH_SOURCE_CATEGORY_LABELS[key]),
      note: String(sourceCoverage.note || normalizeRecord(fallback.sourceCoverage)?.note || "").trim(),
    },
    timelineCards: getRecordArray(payload?.timelineCards).length
      ? getRecordArray(payload?.timelineCards)
          .map((item) => ({
            phase: String(item.phase || "").trim(),
            title: String(item.title || "").trim(),
            summary: String(item.summary || "").trim(),
            signals: uniqueStrings(item.signals, 3),
            sources: getResearchCardSourceReferences(item.sources).slice(0, 3),
          }))
          .filter((item) => item.title && item.summary)
          .slice(0, 4)
      : getRecordArray(fallback.timelineCards),
    comparisonCards: getRecordArray(payload?.comparisonCards).length
      ? getRecordArray(payload?.comparisonCards)
          .map((item) => ({
            subject: String(item.subject || "").trim(),
            position: String(item.position || "").trim(),
            differences: uniqueStrings(item.differences, 3),
            userVoices: uniqueStrings(item.userVoices, 2),
            opportunities: uniqueStrings(item.opportunities, 2),
            risks: uniqueStrings(item.risks, 2),
            sources: getResearchCardSourceReferences(item.sources).slice(0, 3),
          }))
          .filter((item) => item.subject)
          .slice(0, 4)
      : getRecordArray(fallback.comparisonCards),
    intersectionInsights: getRecordArray(payload?.intersectionInsights).length
      ? getRecordArray(payload?.intersectionInsights)
          .map((item) => ({
            insight: String(item.insight || "").trim(),
            whyNow: String(item.whyNow || "").trim(),
            support: uniqueStrings(item.support, 3),
            caution: String(item.caution || "").trim(),
            sources: getResearchCardSourceReferences(item.sources).slice(0, 4),
          }))
          .filter((item) => item.insight)
          .slice(0, 4)
      : getRecordArray(fallback.intersectionInsights),
    strategyWriteback: (() => {
      const strategyWriteback = normalizeRecord(payload?.strategyWriteback) || normalizeRecord(fallback.strategyWriteback) || {};
      return {
        targetReader: String(strategyWriteback.targetReader || "").trim(),
        coreAssertion: String(strategyWriteback.coreAssertion || "").trim(),
        whyNow: String(strategyWriteback.whyNow || "").trim(),
        researchHypothesis: String(strategyWriteback.researchHypothesis || "").trim(),
        marketPositionInsight: String(strategyWriteback.marketPositionInsight || "").trim(),
        historicalTurningPoint: String(strategyWriteback.historicalTurningPoint || "").trim(),
      };
    })(),
  } satisfies Record<string, unknown>;
}

function buildPersistedResearchCardSources(value: unknown) {
  return getRecordArray(value)
    .map((item, index) => {
      const label = String(item.label || "").trim();
      const detail = String(item.detail || "").trim();
      return {
        label: label || truncateText(detail, 48) || ("来源 " + String(index + 1)),
        sourceType: String(item.sourceType || item.kind || "").trim() || "manual",
        detail: detail || null,
        sourceUrl: String(item.sourceUrl || "").trim() || null,
        sortOrder: index + 1,
      };
    })
    .filter((item) => item.label);
}

function buildPersistedResearchCardsFromPayload(payload: Record<string, unknown>) {
  const normalized = normalizeResearchBriefPayload(payload, {});
  const timelineCards = getRecordArray(normalized.timelineCards).map((item, index) => ({
    cardKind: "timeline" as const,
    title: String(item.title || "").trim(),
    summary: String(item.summary || "").trim() || null,
    payload: item,
    sortOrder: index + 1,
    sources: buildPersistedResearchCardSources(item.sources),
  }));
  const comparisonCards = getRecordArray(normalized.comparisonCards).map((item, index) => ({
    cardKind: "comparison" as const,
    title: String(item.subject || "").trim(),
    summary: String(item.position || "").trim() || null,
    payload: item,
    sortOrder: index + 1,
    sources: buildPersistedResearchCardSources(item.sources),
  }));
  const intersectionCards = getRecordArray(normalized.intersectionInsights).map((item, index) => {
    const insight = String(item.insight || "").trim();
    return {
      cardKind: "intersection" as const,
      title: truncateText(insight, 40) || ("洞察 " + String(index + 1)),
      summary: insight || null,
      payload: item,
      sortOrder: index + 1,
      sources: buildPersistedResearchCardSources(item.sources),
    };
  });
  return [...timelineCards, ...comparisonCards, ...intersectionCards].filter((item) => item.title);
}

async function syncResearchCardsFromArtifact(input: {
  articleId: number;
  userId: number;
  payload: Record<string, unknown>;
}) {
  return replaceArticleResearchCards({
    articleId: input.articleId,
    userId: input.userId,
    cards: buildPersistedResearchCardsFromPayload(input.payload),
  });
}

function normalizeAudiencePayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackSegments = Array.isArray(fallback.readerSegments) ? fallback.readerSegments : [];
  const segments = Array.isArray(payload?.readerSegments)
    ? payload.readerSegments
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          label: String(item?.label || "").trim(),
          painPoint: String(item?.painPoint || "").trim(),
          motivation: String(item?.motivation || "").trim(),
          preferredTone: String(item?.preferredTone || "").trim(),
        }))
        .filter((item) => item.label && item.painPoint)
        .slice(0, 4)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    coreReaderLabel: String(payload?.coreReaderLabel || fallback.coreReaderLabel || "").trim(),
    readerSegments: segments.length ? segments : fallbackSegments,
    languageGuidance: uniqueStrings(payload?.languageGuidance, 5).length ? uniqueStrings(payload?.languageGuidance, 5) : uniqueStrings(fallback.languageGuidance, 5),
    backgroundAwarenessOptions:
      uniqueStrings(payload?.backgroundAwarenessOptions, 4).length
        ? uniqueStrings(payload?.backgroundAwarenessOptions, 4)
        : uniqueStrings(fallback.backgroundAwarenessOptions, 4),
    readabilityOptions:
      uniqueStrings(payload?.readabilityOptions, 4).length
        ? uniqueStrings(payload?.readabilityOptions, 4)
        : uniqueStrings(fallback.readabilityOptions, 4),
    contentWarnings: uniqueStrings(payload?.contentWarnings, 5).length ? uniqueStrings(payload?.contentWarnings, 5) : uniqueStrings(fallback.contentWarnings, 5),
    recommendedCallToAction: String(payload?.recommendedCallToAction || fallback.recommendedCallToAction || "").trim(),
  } satisfies Record<string, unknown>;
}

function normalizeOutlinePayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const payloadRuntimeMeta = normalizeRecord(payload?.runtimeMeta);
  const fallbackRuntimeMeta = normalizeRecord(fallback.runtimeMeta);
  const payloadOpeningOptimizer = normalizeRecord(payloadRuntimeMeta?.openingOptimizer);
  const fallbackOpeningOptimizer = normalizeRecord(fallbackRuntimeMeta?.openingOptimizer);
  const normalizeOutlineSection = (item: Record<string, unknown>) => ({
    heading: String(item.heading || "").trim(),
    goal: String(item.goal || "").trim(),
    keyPoints: uniqueStrings(item.keyPoints, 4),
    evidenceHints: uniqueStrings(item.evidenceHints, 4),
    materialRefs: Array.isArray(item.materialRefs)
      ? item.materialRefs.map((ref) => Number(ref || 0)).filter((ref) => Number.isInteger(ref) && ref > 0).slice(0, 4)
      : [],
    transition: String(item.transition || "").trim(),
    researchFocus: String(item.researchFocus || "").trim(),
    researchAnchor: String(item.researchAnchor || "").trim(),
  });
  const fallbackSections = getRecordArray(fallback.outlineSections)
    .map((item) => normalizeOutlineSection(item))
    .filter((item) => item.heading)
    .slice(0, 8);
  const fallbackTitleOptions = normalizeTitleOptions(getRecordArray(fallback.titleOptions), buildFallbackTitleOptions(String(fallback.workingTitle || "").trim()));
  const sections = Array.isArray(payload?.outlineSections)
    ? payload.outlineSections
        .map((item) => normalizeRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => normalizeOutlineSection(item))
        .filter((item) => item.heading)
        .slice(0, 8)
    : [];
  const payloadResearchBackbone = normalizeRecord(payload?.researchBackbone);
  const fallbackResearchBackbone = normalizeRecord(fallback.researchBackbone);
  const workingTitle = String(payload?.workingTitle || fallback.workingTitle || "").trim();
  const researchBackbone = {
    openingTimelineAnchor: String(payloadResearchBackbone?.openingTimelineAnchor || fallbackResearchBackbone?.openingTimelineAnchor || "").trim(),
    middleComparisonAnchor: String(payloadResearchBackbone?.middleComparisonAnchor || fallbackResearchBackbone?.middleComparisonAnchor || "").trim(),
    coreInsightAnchor: String(payloadResearchBackbone?.coreInsightAnchor || fallbackResearchBackbone?.coreInsightAnchor || "").trim(),
    sequencingNote: String(payloadResearchBackbone?.sequencingNote || fallbackResearchBackbone?.sequencingNote || "").trim(),
  };
  const openingHookSeed = String(payload?.openingHook || fallback.openingHook || "").trim();
  const baseOpeningHookOptions =
    uniqueStrings(payload?.openingHookOptions, 4).length
      ? uniqueStrings(payload?.openingHookOptions, 4)
      : uniqueStrings(fallback.openingHookOptions, 4);
  const fallbackOpeningOptions = normalizeOpeningOptions(
    [
      { opening: baseOpeningHookOptions[0] || openingHookSeed, patternLabel: "历史转折型" },
      { opening: baseOpeningHookOptions[1] || "先抛现实冲突，再倒回关键转折。", patternLabel: "冲突回拉型" },
      { opening: baseOpeningHookOptions[2] || "先给一句判断，再补最关键的横向差异。", patternLabel: "判断先行型" },
    ].filter((item) => String(item.opening || "").trim()),
    buildFallbackOpeningOptions(
      workingTitle
      || researchBackbone.coreInsightAnchor
      || researchBackbone.openingTimelineAnchor
      || String(fallback.workingTitle || "").trim(),
    ),
  ).map((item) => withOpeningOptionAliases(item));
  const openingOptions = normalizeOpeningOptions(payload?.openingOptions, fallbackOpeningOptions).map((item) => withOpeningOptionAliases(item));
  const normalizedOpeningHookOptions = uniqueStrings(
    [...baseOpeningHookOptions, ...openingOptions.map((item) => item.opening)],
    4,
  );
  const recommendedOpeningText = openingOptions.find((item) => item.isRecommended)?.opening || openingOptions[0]?.opening || "";

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    workingTitle,
    titleOptions: normalizeTitleOptions(payload?.titleOptions, fallbackTitleOptions),
    titleStrategyNotes:
      uniqueStrings(payload?.titleStrategyNotes, 4).length
        ? uniqueStrings(payload?.titleStrategyNotes, 4)
        : uniqueStrings(fallback.titleStrategyNotes, 4),
    titleAuditedAt:
      normalizeIsoTimestamp(payload?.titleAuditedAt)
      || normalizeIsoTimestamp(fallback.titleAuditedAt),
    openingPromptVersionRef:
      String(
        payload?.openingPromptVersionRef
        || payloadOpeningOptimizer?.ref
        || fallback.openingPromptVersionRef
        || fallbackOpeningOptimizer?.ref
        || "",
      ).trim() || null,
    openingAuditedAt:
      normalizeIsoTimestamp(payload?.openingAuditedAt)
      || normalizeIsoTimestamp(fallback.openingAuditedAt)
      || normalizeIsoTimestamp(payload?.outlineUpdatedAt)
      || normalizeIsoTimestamp(fallback.outlineUpdatedAt),
    outlineUpdatedAt:
      normalizeIsoTimestamp(payload?.outlineUpdatedAt)
      || normalizeIsoTimestamp(fallback.outlineUpdatedAt),
    centralThesis: String(payload?.centralThesis || fallback.centralThesis || "").trim(),
    openingHook: recommendedOpeningText || openingHookSeed,
    openingHookOptions: normalizedOpeningHookOptions,
    openingOptions,
    targetEmotion: String(payload?.targetEmotion || fallback.targetEmotion || "").trim(),
    targetEmotionOptions:
      uniqueStrings(payload?.targetEmotionOptions, 4).length
        ? uniqueStrings(payload?.targetEmotionOptions, 4)
        : uniqueStrings(fallback.targetEmotionOptions, 4),
    supplementalViewpoints:
      uniqueStrings(payload?.supplementalViewpoints, 3).length
        ? uniqueStrings(payload?.supplementalViewpoints, 3)
        : uniqueStrings(fallback.supplementalViewpoints, 3),
    viewpointIntegration: getRecordArray(payload?.viewpointIntegration).length
      ? getRecordArray(payload?.viewpointIntegration).map((item) => ({
          viewpoint: String(item.viewpoint || "").trim(),
          action: String(item.action || "").trim() || "adopted",
          note: String(item.note || "").trim(),
        })).filter((item) => item.viewpoint)
      : getRecordArray(fallback.viewpointIntegration),
    materialBundle: getRecordArray(payload?.materialBundle).length
      ? getRecordArray(payload?.materialBundle)
      : getRecordArray(fallback.materialBundle),
    researchBackbone,
    outlineSections: sections.length ? sections : fallbackSections,
    materialGapHints:
      uniqueStrings(payload?.materialGapHints, 5).length
        ? uniqueStrings(payload?.materialGapHints, 5)
        : uniqueStrings(fallback.materialGapHints, 5),
    endingStrategy: String(payload?.endingStrategy || fallback.endingStrategy || "").trim(),
    endingStrategyOptions:
      uniqueStrings(payload?.endingStrategyOptions, 4).length
        ? uniqueStrings(payload?.endingStrategyOptions, 4)
        : uniqueStrings(fallback.endingStrategyOptions, 4),
  } satisfies Record<string, unknown>;
}

function normalizeDeepWritingPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackSectionBlueprint = getRecordArray(fallback.sectionBlueprint);
  const sectionBlueprint = Array.isArray(payload?.sectionBlueprint)
    ? payload.sectionBlueprint
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          heading: String(item?.heading || "").trim(),
          goal: String(item?.goal || "").trim(),
          paragraphMission: String(item?.paragraphMission || "").trim(),
          evidenceHints: uniqueStrings(item?.evidenceHints, 4),
          materialRefs: Array.isArray(item?.materialRefs)
            ? item.materialRefs.map((ref) => Number(ref || 0)).filter((ref) => Number.isInteger(ref) && ref > 0).slice(0, 4)
            : [],
          revealRole: String(item?.revealRole || "").trim(),
          transition: String(item?.transition || "").trim(),
        }))
        .filter((item) => item.heading)
        .slice(0, 6)
    : [];
  const fallbackHistoryReferencePlan = getRecordArray(fallback.historyReferencePlan);
  const historyReferencePlan = Array.isArray(payload?.historyReferencePlan)
    ? payload.historyReferencePlan
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          title: String(item?.title || "").trim(),
          useWhen: String(item?.useWhen || "").trim(),
          bridgeSentence: String(item?.bridgeSentence || "").trim(),
        }))
        .filter((item) => item.title)
        .slice(0, 2)
    : [];
  const fallbackStateOptions = getRecordArray(fallback.stateOptions);
  const fallbackPrototypeOptions = getRecordArray(fallback.prototypeOptions);
  const fallbackPrototypeComparisonMap = new Map(
    getRecordArray(fallback.prototypeComparisons).map((item) => [String(item.code || "").trim(), item] as const),
  );
  const fallbackStateComparisonMap = new Map(
    getRecordArray(fallback.stateComparisons).map((item) => [String(item.code || "").trim(), item] as const),
  );
  const prototypeOptions = Array.isArray(payload?.prototypeOptions)
    ? payload.prototypeOptions
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          code: String(item?.code || "").trim(),
          label: String(item?.label || "").trim(),
          suitableWhen: String(item?.suitableWhen || "").trim(),
          triggerReason: String(item?.triggerReason || "").trim(),
          openingMove: String(item?.openingMove || "").trim(),
          sectionRhythm: String(item?.sectionRhythm || "").trim(),
          evidenceMode: String(item?.evidenceMode || "").trim(),
        }))
        .filter((item) => item.code && item.label)
        .slice(0, 3)
    : [];
  const stateOptions = Array.isArray(payload?.stateOptions)
    ? payload.stateOptions
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          code: String(item?.code || "").trim(),
          label: String(item?.label || "").trim(),
          suitableWhen: String(item?.suitableWhen || "").trim(),
          triggerReason: String(item?.triggerReason || "").trim(),
        }))
        .filter((item) => item.label)
        .slice(0, 3)
    : [];
  const fallbackStateComparisons = getRecordArray(fallback.stateComparisons);
  const fallbackPrototypeComparisons = getRecordArray(fallback.prototypeComparisons);
  const fallbackRecommendedPrototypeComparison = fallbackPrototypeComparisons.find((item) => Boolean(item.isRecommended)) ?? fallbackPrototypeComparisons[0] ?? null;
  const fallbackRecommendedStateComparison = fallbackStateComparisons.find((item) => Boolean(item.isRecommended)) ?? fallbackStateComparisons[0] ?? null;
  const prototypeComparisons = Array.isArray(payload?.prototypeComparisons)
    ? payload.prototypeComparisons
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => {
          const code = String(item?.code || "").trim();
          const fallbackItem = fallbackPrototypeComparisonMap.get(code);
          return {
            code,
            label: String(item?.label || fallbackItem?.label || "").trim(),
            reason: [String(item?.reason || "").trim(), String(fallbackItem?.reason || "").trim()].filter(Boolean).join(" "),
            suitableWhen: String(item?.suitableWhen || fallbackItem?.suitableWhen || "").trim(),
            triggerReason: String(item?.triggerReason || fallbackItem?.triggerReason || "").trim(),
            openingMove: String(item?.openingMove || fallbackItem?.openingMove || "").trim(),
            sectionRhythm: String(item?.sectionRhythm || fallbackItem?.sectionRhythm || "").trim(),
            evidenceMode: String(item?.evidenceMode || fallbackItem?.evidenceMode || "").trim(),
          recommendedStateVariantLabel: String(item?.recommendedStateVariantLabel || fallbackItem?.recommendedStateVariantLabel || "").trim(),
          openingPatternLabel: String(item?.openingPatternLabel || fallbackItem?.openingPatternLabel || "").trim(),
          syntaxPatternLabel: String(item?.syntaxPatternLabel || fallbackItem?.syntaxPatternLabel || "").trim(),
          endingPatternLabel: String(item?.endingPatternLabel || fallbackItem?.endingPatternLabel || "").trim(),
          historySignal: normalizeRecord(item?.historySignal) || normalizeRecord(fallbackItem?.historySignal) || null,
          diversitySummary: String(item?.diversitySummary || fallbackItem?.diversitySummary || "").trim(),
          diversityIssues: uniqueStrings(item?.diversityIssues, 3).length
              ? uniqueStrings(item?.diversityIssues, 3)
              : uniqueStrings(fallbackItem?.diversityIssues, 3),
            diversitySuggestions: uniqueStrings(item?.diversitySuggestions, 3).length
              ? uniqueStrings(item?.diversitySuggestions, 3)
              : uniqueStrings(fallbackItem?.diversitySuggestions, 3),
            progressiveRevealLabel: String(item?.progressiveRevealLabel || fallbackItem?.progressiveRevealLabel || "").trim(),
            progressiveRevealReason: String(item?.progressiveRevealReason || fallbackItem?.progressiveRevealReason || "").trim(),
            isRecommended: typeof item?.isRecommended === "boolean" ? Boolean(item.isRecommended) : Boolean(fallbackItem?.isRecommended),
          };
        })
        .filter((item) => item.code && item.label)
        .slice(0, 3)
    : [];
  const stateComparisons = Array.isArray(payload?.stateComparisons)
    ? payload.stateComparisons
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => {
          const code = String(item?.code || "").trim();
          const fallbackItem = fallbackStateComparisonMap.get(code);
          return {
            code,
            label: String(item?.label || fallbackItem?.label || "").trim(),
            reason: [String(item?.reason || "").trim(), String(fallbackItem?.reason || "").trim()].filter(Boolean).join(" "),
            suitableWhen: String(item?.suitableWhen || fallbackItem?.suitableWhen || "").trim(),
            triggerReason: String(item?.triggerReason || fallbackItem?.triggerReason || "").trim(),
            openingMove: String(item?.openingMove || fallbackItem?.openingMove || "").trim(),
            openingPatternLabel: String(item?.openingPatternLabel || fallbackItem?.openingPatternLabel || "").trim(),
            syntaxPatternLabel: String(item?.syntaxPatternLabel || fallbackItem?.syntaxPatternLabel || "").trim(),
            endingPatternLabel: String(item?.endingPatternLabel || fallbackItem?.endingPatternLabel || "").trim(),
            historySignal: normalizeRecord(item?.historySignal) || normalizeRecord(fallbackItem?.historySignal) || null,
            diversitySummary: String(item?.diversitySummary || fallbackItem?.diversitySummary || "").trim(),
            diversityIssues: uniqueStrings(item?.diversityIssues, 3).length
              ? uniqueStrings(item?.diversityIssues, 3)
              : uniqueStrings(fallbackItem?.diversityIssues, 3),
            diversitySuggestions: uniqueStrings(item?.diversitySuggestions, 3).length
              ? uniqueStrings(item?.diversitySuggestions, 3)
              : uniqueStrings(fallbackItem?.diversitySuggestions, 3),
            progressiveRevealLabel: String(item?.progressiveRevealLabel || fallbackItem?.progressiveRevealLabel || "").trim(),
            progressiveRevealReason: String(item?.progressiveRevealReason || fallbackItem?.progressiveRevealReason || "").trim(),
            isRecommended: typeof item?.isRecommended === "boolean" ? Boolean(item.isRecommended) : Boolean(fallbackItem?.isRecommended),
          };
        })
        .filter((item) => item.code && item.label)
        .slice(0, 3)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    selectedTitle: String(payload?.selectedTitle || fallback.selectedTitle || "").trim(),
    centralThesis: String(payload?.centralThesis || fallback.centralThesis || "").trim(),
    writingAngle: String(payload?.writingAngle || fallback.writingAngle || "").trim(),
    openingStrategy: String(payload?.openingStrategy || fallback.openingStrategy || "").trim(),
    targetEmotion: String(payload?.targetEmotion || fallback.targetEmotion || "").trim(),
    endingStrategy: String(payload?.endingStrategy || fallback.endingStrategy || "").trim(),
    openingPatternLabel: String(
      payload?.openingPatternLabel
      || fallback.openingPatternLabel
      || fallbackRecommendedStateComparison?.openingPatternLabel
      || fallbackRecommendedPrototypeComparison?.openingPatternLabel
      || "",
    ).trim(),
    syntaxPatternLabel: String(
      payload?.syntaxPatternLabel
      || fallback.syntaxPatternLabel
      || fallbackRecommendedStateComparison?.syntaxPatternLabel
      || fallbackRecommendedPrototypeComparison?.syntaxPatternLabel
      || "",
    ).trim(),
    endingPatternLabel: String(
      payload?.endingPatternLabel
      || fallback.endingPatternLabel
      || fallbackRecommendedStateComparison?.endingPatternLabel
      || fallbackRecommendedPrototypeComparison?.endingPatternLabel
      || "",
    ).trim(),
    diversitySummary: String(payload?.diversitySummary || fallback.diversitySummary || "").trim(),
    diversityIssues:
      uniqueStrings(payload?.diversityIssues, 4).length
        ? uniqueStrings(payload?.diversityIssues, 4)
        : uniqueStrings(fallback.diversityIssues, 4),
    diversitySuggestions:
      uniqueStrings(payload?.diversitySuggestions, 4).length
        ? uniqueStrings(payload?.diversitySuggestions, 4)
        : uniqueStrings(fallback.diversitySuggestions, 4),
    articlePrototype: String(payload?.articlePrototype || fallback.articlePrototype || "").trim(),
    articlePrototypeLabel: String(payload?.articlePrototypeLabel || fallback.articlePrototypeLabel || "").trim(),
    articlePrototypeReason: [
      String(payload?.articlePrototypeReason || "").trim(),
      String(fallback.articlePrototypeReason || "").trim(),
    ].filter(Boolean).join(" "),
    prototypeHistorySignal: normalizeRecord(payload?.prototypeHistorySignal) || normalizeRecord(fallback.prototypeHistorySignal) || null,
    stateVariantCode: String(payload?.stateVariantCode || fallback.stateVariantCode || "").trim(),
    stateVariantLabel: String(payload?.stateVariantLabel || fallback.stateVariantLabel || "").trim(),
    stateVariantReason: [
      String(payload?.stateVariantReason || "").trim(),
      String(fallback.stateVariantReason || "").trim(),
    ].filter(Boolean).join(" "),
    stateHistorySignal: normalizeRecord(payload?.stateHistorySignal) || normalizeRecord(fallback.stateHistorySignal) || null,
    researchFocus: String(payload?.researchFocus || fallback.researchFocus || "").trim(),
    researchLens: String(payload?.researchLens || fallback.researchLens || "").trim(),
    openingMove: String(payload?.openingMove || fallback.openingMove || "").trim(),
    sectionRhythm: String(payload?.sectionRhythm || fallback.sectionRhythm || "").trim(),
    evidenceMode: String(payload?.evidenceMode || fallback.evidenceMode || "").trim(),
    progressiveRevealEnabled: Boolean(payload?.progressiveRevealEnabled ?? fallback.progressiveRevealEnabled),
    progressiveRevealLabel: String(payload?.progressiveRevealLabel || fallback.progressiveRevealLabel || "").trim(),
    progressiveRevealReason: String(payload?.progressiveRevealReason || fallback.progressiveRevealReason || "").trim(),
    climaxPlacement: String(payload?.climaxPlacement || fallback.climaxPlacement || "").trim(),
    escalationRule: String(payload?.escalationRule || fallback.escalationRule || "").trim(),
    progressiveRevealSteps:
      getRecordArray(payload?.progressiveRevealSteps).length
        ? getRecordArray(payload?.progressiveRevealSteps)
            .map((item) => ({
              label: String(item.label || "").trim(),
              instruction: String(item.instruction || "").trim(),
            }))
            .filter((item) => item.label && item.instruction)
            .slice(0, 4)
        : getRecordArray(fallback.progressiveRevealSteps),
    stateChecklist:
      uniqueStrings(payload?.stateChecklist, 6).length
        ? uniqueStrings(payload?.stateChecklist, 6)
        : uniqueStrings(fallback.stateChecklist, 6),
    prototypeOptions: prototypeOptions.length ? prototypeOptions : fallbackPrototypeOptions,
    prototypeComparisons: prototypeComparisons.length ? prototypeComparisons : fallbackPrototypeComparisons,
    stateOptions: stateOptions.length ? stateOptions : fallbackStateOptions,
    stateComparisons: stateComparisons.length ? stateComparisons : fallbackStateComparisons,
    voiceChecklist:
      uniqueStrings(payload?.voiceChecklist, 6).length
        ? uniqueStrings(payload?.voiceChecklist, 6)
        : uniqueStrings(fallback.voiceChecklist, 6),
    mustUseFacts:
      uniqueStrings(payload?.mustUseFacts, 6).length
        ? uniqueStrings(payload?.mustUseFacts, 6)
        : uniqueStrings(fallback.mustUseFacts, 6),
    bannedWordWatchlist:
      uniqueStrings(payload?.bannedWordWatchlist, 8).length
        ? uniqueStrings(payload?.bannedWordWatchlist, 8)
        : uniqueStrings(fallback.bannedWordWatchlist, 8),
    sectionBlueprint: sectionBlueprint.length ? sectionBlueprint : fallbackSectionBlueprint,
    historyReferencePlan: historyReferencePlan.length ? historyReferencePlan : fallbackHistoryReferencePlan,
    seriesInsight: normalizeRecord(payload?.seriesInsight) || normalizeRecord(fallback.seriesInsight) || null,
    seriesChecklist:
      uniqueStrings(payload?.seriesChecklist, 6).length
        ? uniqueStrings(payload?.seriesChecklist, 6)
        : uniqueStrings(fallback.seriesChecklist, 6),
    finalChecklist:
      uniqueStrings(payload?.finalChecklist, 6).length
        ? uniqueStrings(payload?.finalChecklist, 6)
        : uniqueStrings(fallback.finalChecklist, 6),
  } satisfies Record<string, unknown>;
}

function hasConcreteFactMarker(claim: string) {
  const normalized = claim.trim();
  if (!normalized) return false;
  if (/[0-9０-９]/.test(normalized)) return true;
  if (/[一二三四五六七八九十百千万亿]+(?:个|位|人|年|月|天|周|款|项|家|%|％|倍|美元|美金|元|人民币|万|亿)/.test(normalized)) return true;
  if (/(?:19|20)\d{2}\s*年|(?:19|20)\d{2}[-/]\d{1,2}|[一二三四五六七八九十]+月[一二三四五六七八九十\d]+日/.test(normalized)) return true;
  if (/https?:\/\/|www\./i.test(normalized)) return true;
  return /(OpenAI|Anthropic|Google|Microsoft|Meta|Apple|NVIDIA|Claude|ChatGPT|Gemini|Deep Research|SearXNG|微信|公众号|GitHub|V2EX).{0,32}(发布|推出|宣布|上线|下线|支持|限制|收费|开源|收购|投资|更新|提供|允许|禁止|要求|可用|不可用|接入|关闭|新增|移除)/i.test(normalized);
}

function normalizeFactCheckStatus(input: unknown, claim: string) {
  const status = String(input || "").trim();
  if (!["verified", "needs_source", "risky", "opinion"].includes(status)) return "needs_source";
  if (status === "risky" && !hasConcreteFactMarker(claim)) return "opinion";
  return status;
}

function normalizeFactCheckPayload(value: unknown, fallback: Record<string, unknown>, context: GenerationContext) {
  const payload = normalizeRecord(value);
  const payloadResearchReview = normalizeRecord(payload?.researchReview);
  const fallbackResearchReview = normalizeRecord(fallback.researchReview) ?? buildFactCheckResearchReview(context);
  const fallbackChecks = Array.isArray(fallback.checks) ? fallback.checks : [];
  const checks = Array.isArray(payload?.checks)
    ? payload.checks
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => {
          const claim = String(item?.claim || "").trim();
          return {
            claim,
            status: normalizeFactCheckStatus(item?.status, claim),
            suggestion: String(item?.suggestion || "").trim(),
          };
        })
        .filter((item) => item.claim)
        .slice(0, 8)
    : [];
  const normalizedChecks = checks.length ? checks : fallbackChecks;
  const fallbackEvidenceCards = Array.isArray(fallback.evidenceCards) ? fallback.evidenceCards : [];
  const evidenceCards = Array.isArray(payload?.evidenceCards)
    ? payload.evidenceCards
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          claim: String(item?.claim || "").trim(),
          supportLevel: ["strong", "partial", "missing"].includes(String(item?.supportLevel || "").trim())
            ? String(item?.supportLevel || "").trim()
            : "missing",
          supportingEvidence: (() => {
            const sourceItems = Array.isArray(item?.supportingEvidence)
              ? item.supportingEvidence
              : Array.isArray(item?.evidenceItems)
                ? item.evidenceItems
                : [];
            return sourceItems
              .map((evidence) => normalizeRecord(evidence))
              .filter(Boolean)
              .map((evidence) => ({
                fragmentId: Number(evidence?.fragmentId || 0) || null,
                title: String(evidence?.title || "").trim(),
                excerpt: String(evidence?.excerpt || "").trim(),
                sourceType: String(evidence?.sourceType || "manual").trim(),
                sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                researchTag:
                  normalizeEvidenceResearchTag(evidence?.researchTag)
                  || inferEvidenceResearchTag({
                    title: String(evidence?.title || "").trim(),
                    excerpt: String(evidence?.excerpt || "").trim(),
                    claim: String(item?.claim || "").trim(),
                    rationale: String(evidence?.rationale || "").trim(),
                    sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                  }),
                evidenceRole: "supportingEvidence",
                knowledgeCardId: Number(evidence?.knowledgeCardId || 0) || null,
                knowledgeTitle: String(evidence?.knowledgeTitle || "").trim() || null,
                confidenceLabel: String(evidence?.confidenceLabel || "").trim() || null,
                rationale: String(evidence?.rationale || "").trim(),
              }))
              .filter((evidence) => evidence.title && evidence.excerpt)
              .slice(0, 3);
          })(),
          counterEvidence: (Array.isArray(item?.counterEvidence) ? item.counterEvidence : [])
            .map((evidence) => normalizeRecord(evidence))
            .filter(Boolean)
            .map((evidence) => ({
              fragmentId: Number(evidence?.fragmentId || 0) || null,
              title: String(evidence?.title || "").trim(),
              excerpt: String(evidence?.excerpt || "").trim(),
              sourceType: String(evidence?.sourceType || "manual").trim(),
              sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
              researchTag:
                normalizeEvidenceResearchTag(evidence?.researchTag)
                || inferEvidenceResearchTag({
                  title: String(evidence?.title || "").trim(),
                  excerpt: String(evidence?.excerpt || "").trim(),
                  claim: String(item?.claim || "").trim(),
                  rationale: String(evidence?.rationale || "").trim(),
                  sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                })
                || "contradiction",
              evidenceRole: "counterEvidence",
              knowledgeCardId: Number(evidence?.knowledgeCardId || 0) || null,
              knowledgeTitle: String(evidence?.knowledgeTitle || "").trim() || null,
              confidenceLabel: String(evidence?.confidenceLabel || "").trim() || null,
              rationale: String(evidence?.rationale || "").trim(),
            }))
            .filter((evidence) => evidence.title && evidence.excerpt)
            .slice(0, 2),
        }))
        .filter((item) => item.claim)
        .slice(0, 8)
    : [];
  const derivedEvidenceCards = buildFactCheckEvidenceCards(
    context,
    normalizedChecks as Array<{ claim: string; status: string; suggestion: string }>,
  );
  const riskyCheckCount = normalizedChecks.filter((item) => String(item.status || "").trim() === "risky").length;
  const needsSourceCheckCount = normalizedChecks.filter((item) => String(item.status || "").trim() === "needs_source").length;
  const rawOverallRisk = String(payload?.overallRisk || "").trim();
  const normalizedOverallRisk =
    rawOverallRisk === "high" && riskyCheckCount === 0
      ? needsSourceCheckCount >= 2 ? "medium" : "low"
      : ["low", "medium", "high"].includes(rawOverallRisk)
        ? rawOverallRisk
        : String(fallback.overallRisk || "medium");

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    overallRisk: normalizedOverallRisk,
    checks: normalizedChecks,
    evidenceCards: evidenceCards.length ? evidenceCards : fallbackEvidenceCards.length ? fallbackEvidenceCards : derivedEvidenceCards,
    missingEvidence: uniqueStrings([
      ...uniqueStrings(payload?.missingEvidence, 6),
      ...uniqueStrings(payloadResearchReview?.gaps, 4),
    ], 6).length
      ? uniqueStrings([
          ...uniqueStrings(payload?.missingEvidence, 6),
          ...uniqueStrings(payloadResearchReview?.gaps, 4),
        ], 6)
      : uniqueStrings(fallback.missingEvidence, 6),
    researchReview: {
      summary: String(payloadResearchReview?.summary || fallbackResearchReview.summary || "").trim(),
      sourceCoverage: ["ready", "limited", "blocked", "unknown"].includes(String(payloadResearchReview?.sourceCoverage || "").trim())
        ? String(payloadResearchReview?.sourceCoverage || "").trim()
        : String(fallbackResearchReview.sourceCoverage || "unknown"),
      timelineSupport: ["enough", "missing"].includes(String(payloadResearchReview?.timelineSupport || "").trim())
        ? String(payloadResearchReview?.timelineSupport || "").trim()
        : String(fallbackResearchReview.timelineSupport || "missing"),
      comparisonSupport: ["enough", "missing"].includes(String(payloadResearchReview?.comparisonSupport || "").trim())
        ? String(payloadResearchReview?.comparisonSupport || "").trim()
        : String(fallbackResearchReview.comparisonSupport || "missing"),
      intersectionSupport: ["enough", "missing"].includes(String(payloadResearchReview?.intersectionSupport || "").trim())
        ? String(payloadResearchReview?.intersectionSupport || "").trim()
        : String(fallbackResearchReview.intersectionSupport || "missing"),
      strongestAnchor: String(payloadResearchReview?.strongestAnchor || fallbackResearchReview.strongestAnchor || "").trim(),
      gaps: uniqueStrings(payloadResearchReview?.gaps, 4).length
        ? uniqueStrings(payloadResearchReview?.gaps, 4)
        : uniqueStrings(fallbackResearchReview.gaps, 4),
    },
    personaAlignment: String(payload?.personaAlignment || fallback.personaAlignment || "").trim(),
    topicAlignment: String(payload?.topicAlignment || fallback.topicAlignment || "").trim(),
  } satisfies Record<string, unknown>;
}

function normalizeProsePolishPayload(value: unknown, fallback: Record<string, unknown>) {
  const payload = normalizeRecord(value);
  const fallbackIssues = Array.isArray(fallback.issues) ? fallback.issues : [];
  const issues = Array.isArray(payload?.issues)
    ? payload.issues
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          type: String(item?.type || "").trim(),
          example: String(item?.example || "").trim(),
          suggestion: String(item?.suggestion || "").trim(),
        }))
        .filter((item) => item.type && item.suggestion)
        .slice(0, 6)
    : [];
  const languageGuardHits = Array.isArray(payload?.languageGuardHits)
    ? payload.languageGuardHits
        .map((item) => normalizeRecord(item))
        .filter(Boolean)
        .map((item) => ({
          ruleId: String(item?.ruleId || "").trim(),
          ruleKind: String(item?.ruleKind || "").trim(),
          matchMode: String(item?.matchMode || "").trim(),
          matchedText: String(item?.matchedText || "").trim(),
          patternText: String(item?.patternText || "").trim(),
          rewriteHint: String(item?.rewriteHint || "").trim(),
          severity: String(item?.severity || "").trim() || "medium",
          scope: String(item?.scope || "").trim() || "user",
        }))
        .filter((item) => item.matchedText && item.patternText)
        .slice(0, 8)
    : [];

  return {
    summary: String(payload?.summary || fallback.summary || "").trim(),
    overallDiagnosis: String(payload?.overallDiagnosis || fallback.overallDiagnosis || "").trim(),
    strengths: uniqueStrings(payload?.strengths, 5).length ? uniqueStrings(payload?.strengths, 5) : uniqueStrings(fallback.strengths, 5),
    issues: issues.length ? issues : fallbackIssues,
    languageGuardHits: languageGuardHits.length ? languageGuardHits : getRecordArray(fallback.languageGuardHits),
    rewrittenLead: String(payload?.rewrittenLead || fallback.rewrittenLead || "").trim(),
    punchlines: uniqueStrings(payload?.punchlines, 5).length ? uniqueStrings(payload?.punchlines, 5) : uniqueStrings(fallback.punchlines, 5),
    rhythmAdvice: uniqueStrings(payload?.rhythmAdvice, 5).length ? uniqueStrings(payload?.rhythmAdvice, 5) : uniqueStrings(fallback.rhythmAdvice, 5),
    aiNoise: normalizeRecord(payload?.aiNoise) || normalizeRecord(fallback.aiNoise),
  } satisfies Record<string, unknown>;
}

function getStringArray(value: unknown, limit = 6) {
  return uniqueStrings(value, limit);
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getAudienceSelection(payload: Record<string, unknown> | null | undefined) {
  const selection = normalizeRecord(payload?.selection);
  if (!selection) {
    return null;
  }
  return {
    selectedReaderLabel: String(selection.selectedReaderLabel || "").trim() || null,
    selectedLanguageGuidance: String(selection.selectedLanguageGuidance || "").trim() || null,
    selectedBackgroundAwareness: String(selection.selectedBackgroundAwareness || "").trim() || null,
    selectedReadabilityLevel: String(selection.selectedReadabilityLevel || "").trim() || null,
    selectedCallToAction: String(selection.selectedCallToAction || "").trim() || null,
  };
}

function getOutlineSelection(payload: Record<string, unknown> | null | undefined) {
  const selection = normalizeRecord(payload?.selection);
  if (!selection) {
    return null;
  }
  return {
    selectedTitle: String(selection.selectedTitle || "").trim() || null,
    selectedTitleStyle: String(selection.selectedTitleStyle || "").trim() || null,
    selectedOpeningHook: String(selection.selectedOpeningHook || "").trim() || null,
    selectedTargetEmotion: String(selection.selectedTargetEmotion || "").trim() || null,
    selectedEndingStrategy: String(selection.selectedEndingStrategy || "").trim() || null,
  };
}

function toArtifact(row: ArtifactRow) {
  return {
    stageCode: row.stage_code,
    title: ARTICLE_ARTIFACT_STAGE_TITLES[row.stage_code],
    status: row.status,
    summary: row.summary,
    payload: parsePayload(row.payload_json),
    model: row.model,
    provider: row.provider,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies ArticleStageArtifact;
}

type ArtifactRuntimeMetaInput = {
  promptVersionRefs?: string[] | null;
  promptVersion?: {
    promptId: string;
    version: string;
    resolutionMode: "active" | "rollout";
    resolutionReason: string;
  } | null;
  layoutStrategy?: {
    id: number;
    code: string;
    name: string;
    resolutionMode: "explicit" | "rollout" | "active";
    resolutionReason: string;
  } | null;
  applyCommandTemplate?: {
    code: string;
    name: string;
    resolutionMode: "active" | "rollout";
    resolutionReason: string;
  } | null;
  scoringProfile?: {
    code: string;
    name: string;
  } | null;
};

export function buildArticleArtifactRuntimeMetaPatch(input: ArtifactRuntimeMetaInput) {
  const runtimeMeta: Record<string, unknown> = {};
  const promptVersionRefs = Array.from(
    new Set(
      [
        ...(Array.isArray(input.promptVersionRefs) ? input.promptVersionRefs : []),
        input.promptVersion?.promptId && input.promptVersion.version
          ? String(input.promptVersion.promptId) + "@" + String(input.promptVersion.version)
          : null,
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  if (promptVersionRefs.length > 0) {
    runtimeMeta.promptVersionRefs = promptVersionRefs;
  }
  if (input.promptVersion?.promptId && input.promptVersion.version) {
    runtimeMeta.promptVersion = {
      promptId: input.promptVersion.promptId,
      version: input.promptVersion.version,
      ref: String(input.promptVersion.promptId) + "@" + String(input.promptVersion.version),
      resolutionMode: input.promptVersion.resolutionMode,
      resolutionReason: input.promptVersion.resolutionReason,
    };
  }
  if (input.scoringProfile?.code) {
    runtimeMeta.scoringProfile = {
      code: input.scoringProfile.code,
      name: input.scoringProfile.name,
    };
  }
  if (input.layoutStrategy) {
    runtimeMeta.layoutStrategy = {
      id: input.layoutStrategy.id,
      code: input.layoutStrategy.code,
      name: input.layoutStrategy.name,
      resolutionMode: input.layoutStrategy.resolutionMode,
      resolutionReason: input.layoutStrategy.resolutionReason,
    };
  }
  if (input.applyCommandTemplate?.code) {
    runtimeMeta.applyCommandTemplate = {
      code: input.applyCommandTemplate.code,
      name: input.applyCommandTemplate.name,
      resolutionMode: input.applyCommandTemplate.resolutionMode,
      resolutionReason: input.applyCommandTemplate.resolutionReason,
    };
  }
  return Object.keys(runtimeMeta).length > 0 ? { runtimeMeta } : {};
}

async function ensureArticleAccess(articleId: number, userId: number) {
  const article = await getArticleById(articleId, userId);
  if (!article) {
    throw new Error("稿件不存在");
  }
  return article;
}

async function buildGenerationContext(articleId: number, userId: number): Promise<GenerationContext> {
  await ensureExtendedProductSchema();
  const article = await ensureArticleAccess(articleId, userId);
  const [user, planContext, authoringStyleContext, writingContext, languageGuardRules, researchBriefArtifact, audienceArtifact, outlineArtifact, historyReferences, recentArticles, outcomeBundles, activeScoringProfile] = await Promise.all([
    findUserById(userId),
    getUserPlanContext(userId),
    getArticleAuthoringStyleContext(userId, articleId),
    getArticleWritingContext({
      userId,
      articleId,
      title: article.title,
      markdownContent: article.markdown_content,
    }),
    getLanguageGuardRules(userId),
    getArticleStageArtifact(articleId, userId, "researchBrief"),
    getArticleStageArtifact(articleId, userId, "audienceAnalysis"),
    getArticleStageArtifact(articleId, userId, "outlinePlanning"),
    getSavedArticleHistoryReferences(articleId),
    getArticlesByUser(userId),
    getArticleOutcomeBundlesByUser(userId),
    getActiveWritingEvalScoringProfile(),
  ]);
  if (!user) {
    throw new Error("用户不存在");
  }
  const layoutStrategy = await resolveArticleLayoutStrategy({
    userId,
    role: user.role,
    planCode: planContext.effectivePlanCode,
  });
  const supplementalViewpoints = uniqueStrings(outlineArtifact?.payload?.supplementalViewpoints, 3);
  const canUseSavedHistoryReferences = planContext.planSnapshot.canUseHistoryReferences;
  const recentArticleItems = recentArticles
    .filter((item) => item.id !== article.id)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      markdownContent: item.markdown_content,
      updatedAt: item.updated_at,
    }));
  const recentDeepWritingStates = recentArticleItems.length
    ? await getArticleStageArtifactsByDocumentIds({
        userId,
        articleIds: recentArticleItems.map((item) => item.id),
        stageCode: "deepWriting",
      })
    : [];
  const outcomeFeedbackArticleIds = outcomeBundles
    .map((bundle) => bundle.outcome?.articleId ?? 0)
    .filter((candidateArticleId) => candidateArticleId > 0 && candidateArticleId !== article.id)
    .slice(0, 12);
  const deepWritingOutcomeArtifacts = outcomeFeedbackArticleIds.length
    ? await getArticleStageArtifactsByDocumentIds({
        userId,
        articleIds: outcomeFeedbackArticleIds,
        stageCode: "deepWriting",
      })
    : [];
  const deepWritingOutcomeFeedback = summarizeDeepWritingOutcomeFeedback({
    articleId,
    outcomeBundles: outcomeBundles.slice(0, 12),
    deepWritingArtifacts: deepWritingOutcomeArtifacts,
  });

  return {
    userId,
    userRole: user.role,
    planCode: planContext.effectivePlanCode,
    article: {
      id: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
    },
    persona: authoringStyleContext.persona,
    writingStyleProfile: authoringStyleContext.writingStyleProfile,
    layoutStrategy,
    scoringProfile: activeScoringProfile
      ? {
          code: activeScoringProfile.code,
          name: activeScoringProfile.name,
        }
      : null,
    fragments: writingContext.fragments,
    evidenceFragments: writingContext.evidenceFragments,
    imageFragments: writingContext.imageFragments
      .filter((item): item is typeof item & { screenshotPath: string } => Boolean(item.screenshotPath))
      .map((item) => ({
        id: item.id,
        title: item.title,
        screenshotPath: item.screenshotPath,
      })),
    outlineNodes: writingContext.outlineNodes,
    knowledgeCards: writingContext.knowledgeCards,
    seriesInsight: writingContext.seriesInsight ?? null,
    strategyCard: writingContext.strategyCard ?? null,
    humanSignals: writingContext.humanSignals ?? null,
    bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
    languageGuardRules,
    audienceSelection: getAudienceSelection(audienceArtifact?.payload),
    researchBrief: researchBriefArtifact?.payload ?? null,
    outlineSelection: getOutlineSelection(outlineArtifact?.payload),
    outlinePlan: outlineArtifact?.payload || null,
    supplementalViewpoints,
    recentArticles: recentArticleItems,
    recentDeepWritingStates: recentDeepWritingStates.map((item) => ({
      id: item.articleId,
      title: item.title,
      updatedAt: item.updatedAt,
      payload: item.artifact.payload,
    })),
    deepWritingOutcomeFeedback,
    historyReferences: canUseSavedHistoryReferences
      ? historyReferences.map((item) => ({
          referencedDocumentId: item.referencedArticleId,
          title: item.title,
          relationReason: item.relationReason,
          bridgeSentence: item.bridgeSentence,
        }))
      : [],
  };
}

async function upsertArtifact(input: {
  articleId: number;
  userId?: number;
  stageCode: ArticleArtifactStageCode;
  status: ArticleStageArtifactStatus;
  summary: string | null;
  payload: Record<string, unknown>;
  model?: string | null;
  provider?: string | null;
  errorMessage?: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM article_stage_artifacts WHERE article_id = ? AND stage_code = ?",
    [input.articleId, input.stageCode],
  );

  if (!existing) {
    await db.exec(
      `INSERT INTO article_stage_artifacts (
        article_id, stage_code, status, summary, payload_json, model, provider, error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.articleId,
        input.stageCode,
        input.status,
        input.summary,
        JSON.stringify(input.payload),
        input.model ?? null,
        input.provider ?? null,
        input.errorMessage ?? null,
        now,
        now,
      ],
    );
  } else {
    await db.exec(
      `UPDATE article_stage_artifacts
       SET status = ?, summary = ?, payload_json = ?, model = ?, provider = ?, error_message = ?, updated_at = ?
       WHERE article_id = ? AND stage_code = ?`,
      [
        input.status,
        input.summary,
        JSON.stringify(input.payload),
        input.model ?? null,
        input.provider ?? null,
        input.errorMessage ?? null,
        now,
        input.articleId,
        input.stageCode,
      ],
    );
  }

  const saved = await db.queryOne<ArtifactRow>(
    "SELECT * FROM article_stage_artifacts WHERE article_id = ? AND stage_code = ?",
    [input.articleId, input.stageCode],
  );
  if (!saved) {
    throw new Error("阶段产物保存失败");
  }
  if (input.stageCode === "researchBrief" && input.userId) {
    await syncResearchCardsFromArtifact({
      articleId: input.articleId,
      userId: input.userId,
      payload: input.payload,
    });
  }
  return toArtifact(saved);
}

async function generateWithPrompt(input: {
  stageCode: ArticleArtifactStageCode;
  promptId: string;
  sceneCode:
    | "researchBrief"
    | "articleWrite"
    | "languageGuardAudit"
    | "audienceProfile"
    | "outlinePlan"
    | "titleOptimizer"
    | "openingOptimizer"
    | "deepWrite"
    | "factCheck"
    | "prosePolish";
  userPrompt: string;
  fallback: Record<string, unknown>;
  normalize: (value: unknown, fallback: Record<string, unknown>) => Record<string, unknown>;
  context: GenerationContext;
  runtimeMetaPatch?: Record<string, unknown>;
}) {
  const existingArtifact = await getArticleStageArtifact(input.context.article.id, input.context.userId, input.stageCode);
  const preservedSelection = normalizeRecord(existingArtifact?.payload?.selection);
  try {
    const promptMeta = await loadPromptWithMeta(input.promptId, {
      userId: input.context.userId,
      role: input.context.userRole,
      planCode: input.context.planCode,
    });
    const systemSegments = buildArticleArtifactPromptSystemSegments(promptMeta.content);
    const stageTimeoutMs =
      input.stageCode === "factCheck"
        ? Math.min(ARTICLE_STAGE_ARTIFACT_TIMEOUT_MS, FACT_CHECK_ARTIFACT_TIMEOUT_MS)
        : input.stageCode === "researchBrief"
          ? Math.min(ARTICLE_STAGE_ARTIFACT_TIMEOUT_MS, RESEARCH_BRIEF_ARTIFACT_TIMEOUT_MS)
          : ARTICLE_STAGE_ARTIFACT_TIMEOUT_MS;
    const result = await withStageGenerationTimeout(
      generateSceneText({
        sceneCode: input.sceneCode,
        systemPrompt: promptMeta.content,
        systemSegments,
        userPrompt: input.userPrompt,
        observationMeta: {
          articleId: input.context.article.id,
        },
        temperature: 0.2,
        rolloutUserId: input.context.userId,
        maxAttempts: ARTICLE_STAGE_ARTIFACT_MAX_ATTEMPTS,
        requestTimeoutMs: stageTimeoutMs,
      }),
      stageTimeoutMs,
      `${input.stageCode} AI 生成超时`,
    );
    let parsedPayload: unknown;
    try {
      parsedPayload = extractJsonObject(result.text);
    } catch (parseError) {
      if (input.stageCode !== "prosePolish") {
        throw parseError;
      }
      const repaired = await withStageGenerationTimeout(
        generateSceneText({
          sceneCode: input.sceneCode,
          systemPrompt: [
            "你是严格的 JSON 修复器。",
            "你的唯一任务是把用户给出的内容整理为一个合法 JSON 对象。",
            "不要新增事实，不要补充原文没有的信息，不要解释，不要输出 markdown。",
            "尽量保留原字段名、数组结构和原意，只修复 JSON 语法问题。",
          ].join("\n"),
          userPrompt: [
            "请把下面内容修复为合法 JSON 对象，只输出 JSON：",
            result.text,
          ].join("\n\n"),
          observationMeta: {
            articleId: input.context.article.id,
          },
          temperature: 0.1,
          rolloutUserId: input.context.userId,
          maxAttempts: 1,
          requestTimeoutMs: ARTICLE_STAGE_OPTION_TIMEOUT_MS,
        }),
        ARTICLE_STAGE_OPTION_TIMEOUT_MS,
        `${input.stageCode} JSON 修复超时`,
      );
      parsedPayload = extractJsonObject(repaired.text);
    }
    const normalized = input.normalize(parsedPayload, input.fallback);
    const basePayload = preservedSelection ? { ...normalized, selection: preservedSelection } : normalized;
    return upsertArtifact({
      articleId: input.context.article.id,
      userId: input.context.userId,
      stageCode: input.stageCode,
      status: "ready",
      summary: String(normalized.summary || input.fallback.summary || "").trim() || null,
      payload: {
        ...basePayload,
        ...buildArticleArtifactRuntimeMetaPatch({
          promptVersion: {
            promptId: promptMeta.promptId,
            version: promptMeta.version,
            resolutionMode: promptMeta.resolutionMode,
            resolutionReason: promptMeta.resolutionReason,
          },
          scoringProfile: input.context.scoringProfile,
          layoutStrategy: input.context.layoutStrategy,
        }),
        ...(input.runtimeMetaPatch ?? {}),
      },
      model: result.model,
      provider: result.provider,
      errorMessage: null,
    });
  } catch (error) {
    const basePayload = preservedSelection ? { ...input.fallback, selection: preservedSelection } : input.fallback;
    return upsertArtifact({
      articleId: input.context.article.id,
      userId: input.context.userId,
      stageCode: input.stageCode,
      status: "ready",
      summary: String(input.fallback.summary || "").trim() || null,
      payload: {
        ...basePayload,
        ...buildArticleArtifactRuntimeMetaPatch({
          scoringProfile: input.context.scoringProfile,
          layoutStrategy: input.context.layoutStrategy,
        }),
        ...(input.runtimeMetaPatch ?? {}),
      },
      model: "fallback-local",
      provider: "local",
      errorMessage: error instanceof Error ? error.message : "stage artifact generation failed",
    });
  }
}

async function generateResearchBrief(
  context: GenerationContext,
  externalResearch?: {
    attempted: boolean;
    query: string;
    searchUrl: string | null;
    discoveredUrls: string[];
    imaQueries?: string[];
    imaDiscoveredTitles?: string[];
    imaError?: string | null;
    curatedSourceUrls?: string[];
    attached: Array<{ fragmentId: number; nodeId: number; title: string; sourceUrl: string | null }>;
    skipped: string[];
    failed: Array<{ url: string; error: string }>;
    searchError: string | null;
    searches?: Array<{ category?: string; label?: string; topUrls?: string[] }>;
  } | null,
) {
  const fallback = fallbackResearchBrief(context, externalResearch);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","researchObject":"字符串","coreQuestion":"字符串","authorHypothesis":"字符串","targetReader":"字符串","mustCoverAngles":[""],"hypothesesToVerify":[""],"forbiddenConclusions":[""],"sourceCoverage":{"official":[""],"industry":[""],"comparison":[""],"userVoice":[""],"timeline":[""],"sufficiency":"ready|limited|blocked","missingCategories":[""],"note":"字符串"},"timelineCards":[{"phase":"字符串","title":"字符串","summary":"字符串","signals":[""],"sources":[{"label":"字符串","sourceType":"official|industry|comparison|userVoice|timeline|knowledge|history|url|manual|screenshot","detail":"字符串","sourceUrl":"字符串或空"}]}],"comparisonCards":[{"subject":"字符串","position":"字符串","differences":[""],"userVoices":[""],"opportunities":[""],"risks":[""],"sources":[{"label":"字符串","sourceType":"official|industry|comparison|userVoice|timeline|knowledge|history|url|manual|screenshot","detail":"字符串","sourceUrl":"字符串或空"}]}],"intersectionInsights":[{"insight":"字符串","whyNow":"字符串","support":[""],"caution":"字符串","sources":[{"label":"字符串","sourceType":"official|industry|comparison|userVoice|timeline|knowledge|history|url|manual|screenshot","detail":"字符串","sourceUrl":"字符串或空"}]}],"strategyWriteback":{"targetReader":"字符串","coreAssertion":"字符串","whyNow":"字符串","researchHypothesis":"字符串","marketPositionInsight":"字符串","historicalTurningPoint":"字符串"}}',
    "你是在做研究层，而不是直接写公众号正文。",
    "先把研究对象、核心问题和待验证假设写清楚，再判断信源是否充分。",
    "sourceCoverage 必须覆盖官方源、行业源、同类源、用户源、时间源五类，并明确哪些仍然缺失。",
    "不要把总览页、目录页、列表页、模板集合页直接当成强证据；这类页面最多只能算弱证据或入口线索。",
    "IMA 命中属于高价值私有信源，但仍要区分是可直接支撑判断的案例/复盘/数据，还是只有标题级提示的弱线索。",
    "timelineCards 必须体现起点、关键转折和当前位置，不要只写今天发生了什么。",
    "comparisonCards 必须体现横向差异、用户口碑差异、风险与机会差异。",
    "intersectionInsights 必须把纵向时间脉络和横向比较交叉起来，输出真正可写成判断的洞察。",
    "每张 timelineCards、comparisonCards、intersectionInsights 都要补 1-3 条 sources，确保作者能回到原始线索继续核对。",
    "strategyWriteback 只给策略卡可直接吸收的字段，不要空话。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    context.seriesInsight ? promptLine("系列主轴：", [context.seriesInsight.label, context.seriesInsight.reason, ...context.seriesInsight.whyNow].filter(Boolean).join("；")) : "当前暂无明确系列主轴。",
    context.strategyCard?.targetReader ? promptLine("已有目标读者：", context.strategyCard.targetReader) : null,
    context.strategyCard?.coreAssertion ? promptLine("已有核心判断：", context.strategyCard.coreAssertion) : null,
    context.strategyCard?.whyNow ? promptLine("已有 why now：", context.strategyCard.whyNow) : null,
    promptLine("当前正文摘要：", truncateText(stripMarkdown(context.article.markdownContent), 700) || "暂无正文，请以研究先行。"),
    externalResearch?.attempted
      ? formatPromptTemplate("自动补源：IMA 查询 {{imaQueryCount}} 次、命中 {{imaCount}} 条；直达高质量来源 {{curatedCount}} 条；外部搜索查询「{{query}}」，发现 {{discoveredCount}} 个候选链接，成功补入 {{attachedCount}} 条研究素材。", {
        imaQueryCount: externalResearch.imaQueries?.length ?? 0,
        imaCount: externalResearch.imaDiscoveredTitles?.length ?? 0,
        curatedCount: externalResearch.curatedSourceUrls?.length ?? 0,
        query: externalResearch.query,
        discoveredCount: externalResearch.discoveredUrls.length,
        attachedCount: externalResearch.attached.length,
      })
      : "外部补源：本次未发现可用搜索入口或补源线索。",
    externalResearch?.imaDiscoveredTitles?.length
      ? promptLine("IMA 命中：", externalResearch.imaDiscoveredTitles.slice(0, 4).join("；"))
      : null,
    externalResearch?.curatedSourceUrls?.length
      ? promptLine("高质量直达源：", externalResearch.curatedSourceUrls.slice(0, 4).join("；"))
      : null,
    promptLine("可用事实素材：", getSourceFacts(context, 8).join("；") || "暂无已挂载事实素材。"),
    promptLine(
      "可用素材包：",
      getMaterialBundle(context, 8)
        .map((item) =>
          formatPromptTemplate("{{fragmentId}}. {{title}}（{{usageMode}}/{{sourceType}}）：{{summary}}", {
            fragmentId: item.fragmentId,
            title: item.title,
            usageMode: item.usageMode,
            sourceType: item.sourceType,
            summary: item.summary,
          }),
        )
        .join("；") || "暂无。",
    ),
    context.historyReferences.length
      ? promptLine(
          "历史文章与前情：",
          context.historyReferences
            .map((item) =>
              formatPromptTemplate("《{{title}}》{{relationPart}}", {
                title: item.title,
                relationPart: item.relationReason ? "：" + item.relationReason : "",
              }),
            )
            .join("；"),
        )
      : "暂无已保存历史文章引用。",
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "researchBrief",
    promptId: "research_brief",
    sceneCode: "researchBrief",
    userPrompt,
    fallback,
    normalize: normalizeResearchBriefPayload,
    context,
    runtimeMetaPatch: externalResearch
      ? {
          externalResearch,
        }
      : undefined,
  });
}

async function generateAudienceAnalysis(context: GenerationContext) {
  const fallback = fallbackAudienceAnalysis(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","coreReaderLabel":"字符串","readerSegments":[{"label":"字符串","painPoint":"字符串","motivation":"字符串","preferredTone":"字符串"}],"languageGuidance":[""],"backgroundAwarenessOptions":[""],"readabilityOptions":[""],"contentWarnings":[""],"recommendedCallToAction":"字符串"}',
    "readerSegments 返回 2-4 项，其余数组返回 2-5 项。",
    "你是在做真实的内容策略判断，不是在写宽泛画像。",
    "优先判断谁最可能点开、读完、转发这篇内容，再给表达建议。",
    "readerSegments 不要写年龄、性别这类空泛人口学标签，必须写成可执行的读者类型。",
    "languageGuidance 必须是具体表达策略，例如先讲事实还是先下判断、术语是否需要翻译、是否适合对话式表达。",
    "backgroundAwarenessOptions 必须覆盖至少三档认知背景，例如小白、半熟悉、行业内。",
    "readabilityOptions 必须覆盖至少三档通俗度，例如新手可读、兼顾专业、高信息密度。",
    "contentWarnings 只写真正会造成理解偏差、争议或阅读门槛的风险点。",
    "recommendedCallToAction 要能指导结尾动作，例如评论区讨论、收藏转发、继续观察某指标。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    promptBlock("绑定文风资产细节：", listWritingStyleProfileSummary(context)),
    promptBlock("写作风格资产 / DNA 注入细节：", listLayoutStrategySummary(context)),
    context.researchBrief ? promptLine("研究简报摘要：", String(context.researchBrief.summary || "").trim() || String(context.researchBrief.coreQuestion || "").trim()) : null,
    promptLine("当前正文摘要：", truncateText(stripMarkdown(context.article.markdownContent), 600) || "暂无正文，请结合标题、素材与大纲推断。"),
    promptLine(
      "大纲锚点：",
      context.outlineNodes
        .map((item) =>
          formatPromptTemplate("{{title}}{{descriptionPart}}", {
            title: item.title,
            descriptionPart: item.description ? "（" + item.description + "）" : "",
          }),
        )
        .join("；") || "暂无大纲锚点",
    ),
    promptLine("已知事实：", getSourceFacts(context, 6).join("；") || "暂无事实素材"),
    promptLine("开放问题：", context.knowledgeCards.flatMap((card) => card.openQuestions).slice(0, 4).join("；") || "暂无"),
    context.audienceSelection?.selectedBackgroundAwareness ? promptLine("已确认背景预设：", context.audienceSelection.selectedBackgroundAwareness) : null,
    context.audienceSelection?.selectedReadabilityLevel ? promptLine("已确认通俗度：", context.audienceSelection.selectedReadabilityLevel) : null,
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "audienceAnalysis",
    promptId: "audience_analysis",
    sceneCode: "audienceProfile",
    userPrompt,
    fallback,
    normalize: normalizeAudiencePayload,
    context,
  });
}

async function runTitleOptimizer(context: GenerationContext, outlinePayload: Record<string, unknown>) {
  const fallbackTitleOptions = normalizeTitleOptions(
    outlinePayload.titleOptions,
    buildFallbackTitleOptions(String(outlinePayload.workingTitle || context.article.title || "").trim()),
  );
  const outlineSections = getRecordArray(outlinePayload.outlineSections)
    .slice(0, 6)
    .map((section, index) =>
      [
        promptLine(String(index + 1) + ". ", String(section.heading || "").trim() || ("章节 " + String(index + 1))),
        String(section.goal || "").trim() ? promptLine("目标：", String(section.goal).trim()) : null,
        getStringArray(section.keyPoints, 4).length ? promptLine("关键点：", getStringArray(section.keyPoints, 4).join("；")) : null,
      ].filter(Boolean).join("\n"),
    );
  const userPrompt = [
    promptLine("稿件标题：", context.article.title),
    promptLine("当前工作标题：", String(outlinePayload.workingTitle || context.article.title).trim()),
    String(outlinePayload.centralThesis || "").trim() ? promptLine("核心判断：", String(outlinePayload.centralThesis).trim()) : null,
    context.audienceSelection?.selectedReaderLabel ? promptLine("目标读者：", context.audienceSelection.selectedReaderLabel) : null,
    getStringArray(outlinePayload.titleStrategyNotes, 4).length ? promptLine("当前标题主轴：", getStringArray(outlinePayload.titleStrategyNotes, 4).join("；")) : null,
    outlineSections.length ? promptBlock("大纲骨架：", outlineSections.join("\n\n")) : null,
    promptLine("关键事实：", getSourceFacts(context, 6).join("；") || "暂无关键事实，请围绕现有判断生成标题。"),
    promptLine("当前正文摘要：", truncateText(stripMarkdown(context.article.markdownContent), 600) || "暂无正文，请根据标题、判断和大纲生成候选。"),
  ].filter(Boolean).join("\n");

  try {
    const promptMeta = await loadPromptWithMeta("title_optimizer", {
      userId: context.userId,
      role: context.userRole,
      planCode: context.planCode,
    });
    const systemSegments = buildTitleOptimizerSystemSegments(promptMeta.content);
    const result = await withStageGenerationTimeout(
      generateSceneText({
        sceneCode: "titleOptimizer",
        systemPrompt: promptMeta.content,
        systemSegments,
        userPrompt,
        temperature: 0.2,
        rolloutUserId: context.userId,
        maxAttempts: 1,
        requestTimeoutMs: ARTICLE_STAGE_OPTION_TIMEOUT_MS,
      }),
      ARTICLE_STAGE_OPTION_TIMEOUT_MS,
      "标题优化 AI 超时",
    );
    const titleOptimizerRuntimeMeta = buildArticleArtifactRuntimeMetaPatch({
      promptVersionRefs: [String(promptMeta.promptId) + "@" + String(promptMeta.version)],
    }).runtimeMeta as Record<string, unknown> | undefined;
    const raw = normalizeRecord(extractJsonObject(result.text)) || {};
    const recommendedIndexRaw = typeof raw.recommendedIndex === "number"
      ? raw.recommendedIndex
      : typeof raw.recommendedIndex === "string" && raw.recommendedIndex.trim()
        ? Number(raw.recommendedIndex)
        : -1;
    const hasRecommendedIndex = Number.isInteger(recommendedIndexRaw) && recommendedIndexRaw >= 0;
    const normalizedOptions = normalizeTitleOptions(raw.titleOptions, fallbackTitleOptions).map((item, index) => ({
      ...item,
      isRecommended: hasRecommendedIndex
        ? index === Math.max(0, Math.min(TITLE_OPTION_LIMIT - 1, Number(recommendedIndexRaw)))
        : item.isRecommended,
    }));
    const titleOptions = ensureSingleRecommendedTitleOption(normalizedOptions);
    return {
      titleOptions,
      titleAuditedAt: new Date().toISOString(),
      runtimeMetaPatch: {
        runtimeMeta: {
          ...(titleOptimizerRuntimeMeta ?? {}),
          titleOptimizer: {
            promptId: promptMeta.promptId,
            version: promptMeta.version,
            ref: String(promptMeta.promptId) + "@" + String(promptMeta.version),
            resolutionMode: promptMeta.resolutionMode,
            resolutionReason: promptMeta.resolutionReason,
            provider: result.provider,
            model: result.model,
          },
        },
      },
      model: result.model,
      provider: result.provider,
    };
  } catch {
    return {
      titleOptions: ensureSingleRecommendedTitleOption(fallbackTitleOptions),
      titleAuditedAt: new Date().toISOString(),
      runtimeMetaPatch: undefined,
      model: null,
      provider: null,
    };
  }
}

async function runOpeningOptimizer(context: GenerationContext, outlinePayload: Record<string, unknown>) {
  const fallbackOpeningOptions = normalizeOpeningOptions(
    outlinePayload.openingOptions,
    buildFallbackOpeningOptions(
      String(
        outlinePayload.workingTitle
        || outlinePayload.centralThesis
        || outlinePayload.openingHook
        || context.article.title
        || "",
      ).trim(),
    ),
  ).map((item) => withOpeningOptionAliases(item));
  const outlineSections = getRecordArray(outlinePayload.outlineSections)
    .slice(0, 6)
    .map((section, index) =>
      [
        promptLine(String(index + 1) + ". ", String(section.heading || "").trim() || ("章节 " + String(index + 1))),
        String(section.goal || "").trim() ? promptLine("目标：", String(section.goal).trim()) : null,
        getStringArray(section.keyPoints, 4).length ? promptLine("关键点：", getStringArray(section.keyPoints, 4).join("；")) : null,
      ].filter(Boolean).join("\n"),
    );
  const openingCandidates = fallbackOpeningOptions
    .map((item, index) =>
      [
        promptLine(String(index + 1) + ". ", item.opening),
        promptLine("模式：", item.patternLabel),
        promptLine("质量上限：", item.qualityCeiling),
        item.forbiddenHits.length ? promptLine("当前禁区：", item.forbiddenHits.join("；")) : null,
        item.recommendReason ? promptLine("当前说明：", item.recommendReason) : null,
      ].filter(Boolean).join("\n"),
    )
    .filter(Boolean);
  const userPrompt = [
    promptLine("稿件标题：", context.article.title),
    promptLine("当前工作标题：", String(outlinePayload.workingTitle || context.article.title).trim()),
    String(outlinePayload.centralThesis || "").trim() ? promptLine("核心判断：", String(outlinePayload.centralThesis).trim()) : null,
    context.audienceSelection?.selectedReaderLabel ? promptLine("目标读者：", context.audienceSelection.selectedReaderLabel) : null,
    String(outlinePayload.targetEmotion || "").trim() ? promptLine("目标情绪：", String(outlinePayload.targetEmotion).trim()) : null,
    promptLine(
      "当前推荐开头：",
      String(outlinePayload.openingHook || "").trim() || fallbackOpeningOptions[0]?.opening || "暂无",
    ),
    outlineSections.length ? promptBlock("大纲骨架：", outlineSections.join("\n\n")) : null,
    promptLine("关键事实：", getSourceFacts(context, 6).join("；") || "暂无关键事实，请围绕现有判断提升开头前三秒留存。"),
    openingCandidates.length ? promptBlock("当前 3 个开头候选：", openingCandidates.join("\n\n")) : null,
  ].filter(Boolean).join("\n");

  try {
    const promptMeta = await loadPromptWithMeta("opening_optimizer", {
      userId: context.userId,
      role: context.userRole,
      planCode: context.planCode,
    });
    const systemSegments = buildOpeningOptimizerSystemSegments(promptMeta.content);
    const result = await withStageGenerationTimeout(
      generateSceneText({
        sceneCode: "openingOptimizer",
        systemPrompt: promptMeta.content,
        systemSegments,
        userPrompt,
        temperature: 0.2,
        rolloutUserId: context.userId,
        maxAttempts: 1,
        requestTimeoutMs: ARTICLE_STAGE_OPTION_TIMEOUT_MS,
      }),
      ARTICLE_STAGE_OPTION_TIMEOUT_MS,
      "开头优化 AI 超时",
    );
    const openingOptimizerRuntimeMeta = buildArticleArtifactRuntimeMetaPatch({
      promptVersionRefs: [String(promptMeta.promptId) + "@" + String(promptMeta.version)],
    }).runtimeMeta as Record<string, unknown> | undefined;
    const raw = normalizeRecord(extractJsonObject(result.text)) || {};
    const recommendedIndexRaw = typeof raw.recommendedIndex === "number"
      ? raw.recommendedIndex
      : typeof raw.recommendedIndex === "string" && raw.recommendedIndex.trim()
        ? Number(raw.recommendedIndex)
        : -1;
    const hasRecommendedIndex = Number.isInteger(recommendedIndexRaw) && recommendedIndexRaw >= 0;
    const normalizedOptions = normalizeOpeningOptions(raw.openingOptions, fallbackOpeningOptions).map((item, index) => ({
      ...item,
      isRecommended: hasRecommendedIndex
        ? index === Math.max(0, Math.min(fallbackOpeningOptions.length - 1, Number(recommendedIndexRaw)))
        : item.isRecommended,
    }));
    const openingOptions = ensureSingleRecommendedOpeningOption(normalizedOptions).map((item) => withOpeningOptionAliases(item));
    return {
      openingOptions,
      openingAuditedAt: new Date().toISOString(),
      openingPromptVersionRef: String(promptMeta.promptId) + "@" + String(promptMeta.version),
      runtimeMetaPatch: {
        runtimeMeta: {
          ...(openingOptimizerRuntimeMeta ?? {}),
          openingOptimizer: {
            promptId: promptMeta.promptId,
            version: promptMeta.version,
            ref: String(promptMeta.promptId) + "@" + String(promptMeta.version),
            resolutionMode: promptMeta.resolutionMode,
            resolutionReason: promptMeta.resolutionReason,
            provider: result.provider,
            model: result.model,
          },
        },
      },
      model: result.model,
      provider: result.provider,
    };
  } catch {
    return {
      openingOptions: ensureSingleRecommendedOpeningOption(fallbackOpeningOptions).map((item) => withOpeningOptionAliases(item)),
      openingAuditedAt: new Date().toISOString(),
      openingPromptVersionRef: null,
      runtimeMetaPatch: undefined,
      model: null,
      provider: null,
    };
  }
}

async function refreshOutlineTitleOptions(input: {
  context: GenerationContext;
  artifact: ArticleStageArtifact;
  fallback: Record<string, unknown>;
  preserveOutlineUpdatedAt?: boolean;
}) {
  const normalized = normalizeOutlinePayload(input.artifact.payload, input.fallback);
  const optimized = await runTitleOptimizer(input.context, normalized);
  return updateArticleStageArtifactPayload({
    articleId: input.context.article.id,
    userId: input.context.userId,
    stageCode: "outlinePlanning",
    payloadPatch: {
      titleOptions: optimized.titleOptions,
      titleAuditedAt: optimized.titleAuditedAt,
      outlineUpdatedAt:
        input.preserveOutlineUpdatedAt
          ? normalized.outlineUpdatedAt || null
          : new Date().toISOString(),
      ...(optimized.runtimeMetaPatch ?? {}),
    },
  });
}

async function refreshOutlineOpeningOptions(input: {
  context: GenerationContext;
  artifact: ArticleStageArtifact;
  fallback: Record<string, unknown>;
  preserveOutlineUpdatedAt?: boolean;
}) {
  const normalized = normalizeOutlinePayload(input.artifact.payload, input.fallback);
  const optimized = await runOpeningOptimizer(input.context, normalized);
  return updateArticleStageArtifactPayload({
    articleId: input.context.article.id,
    userId: input.context.userId,
    stageCode: "outlinePlanning",
    payloadPatch: {
      openingOptions: optimized.openingOptions,
      openingAuditedAt: optimized.openingAuditedAt,
      openingPromptVersionRef: optimized.openingPromptVersionRef,
      outlineUpdatedAt:
        input.preserveOutlineUpdatedAt
          ? normalized.outlineUpdatedAt || null
          : new Date().toISOString(),
      ...(optimized.runtimeMetaPatch ?? {}),
    },
  });
}

async function generateOutlinePlanning(
  context: GenerationContext,
  options?: {
    skipOptionRefresh?: boolean;
  },
) {
  const fallback = fallbackOutlinePlanning(context);
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","workingTitle":"字符串","titleStrategyNotes":[""],"centralThesis":"字符串","openingHook":"字符串","openingHookOptions":[""],"openingOptions":[{"text":"字符串","patternCode":"scene_entry|conflict_entry|judgement_first|question_hook|phenomenon_signal|direct_entry","patternLabel":"字符串","hookScore":80,"forbiddenHits":[""],"qualityCeiling":"A|B+|B|B-|C","recommendReason":"字符串","isRecommended":true,"diagnose":{"abstractLevel":"pass|warn|danger","paddingLevel":"pass|warn|danger","hookDensity":"pass|warn|danger","informationFrontLoading":"pass|warn|danger"}}],"targetEmotion":"字符串","targetEmotionOptions":[""],"researchBackbone":{"openingTimelineAnchor":"字符串","middleComparisonAnchor":"字符串","coreInsightAnchor":"字符串","sequencingNote":"字符串"},"supplementalViewpoints":[""],"viewpointIntegration":[{"viewpoint":"字符串","action":"adopted|softened|deferred|conflicted","note":"字符串"}],"materialBundle":[{"fragmentId":1,"title":"字符串","usageMode":"rewrite|image","sourceType":"manual|url|screenshot","summary":"字符串","screenshotPath":"字符串或空"}],"outlineSections":[{"heading":"字符串","goal":"字符串","keyPoints":[""],"evidenceHints":[""],"materialRefs":[1],"transition":"字符串","researchFocus":"timeline|comparison|intersection|support","researchAnchor":"字符串"}],"materialGapHints":[""],"endingStrategy":"字符串","endingStrategyOptions":[""]}',
    "outlineSections 返回 3-6 节，每节 2-4 个关键点。",
    "titleStrategyNotes 返回 2-4 条，说明这篇稿子的标题主轴、读者收益点、信息差方向与禁止踩的标题风险。",
    "大纲要体现论证递进，不允许各节只是并列堆料。",
    "主论点必须由系统综合选题、人设、受众和素材形成，用户补充观点只能作为校准或强调，不能直接取代主论点。",
    "openingHookOptions 给出不同开头策略，例如事实冲突、反常识判断、人物切口、问题切口。",
    "openingOptions 返回 3 个不同模式的候选开头文本或策略句，能够直接回写到 selectedOpeningHook，并补上 patternCode、hookScore、qualityCeiling、forbiddenHits、isRecommended、recommendReason 与 diagnose。",
    "targetEmotionOptions 给出读者读完后的情绪目标，例如警惕、被说服、想转发、愿意行动。",
    "outlineSections.goal 必须说明这一节承担什么推进任务，而不是重复标题。",
    "outlineSections.keyPoints 必须具体到观点或信息点，避免“展开分析”“补充背景”这类空话。",
    "outlineSections.evidenceHints 优先引用现有素材、背景卡和待补事实，不要虚构来源。",
    "outlineSections.materialRefs 必须尽量引用 materialBundle 中的 fragmentId；截图素材只能作为原图使用，不可改写成伪原文。",
    "viewpointIntegration 必须逐条说明用户补充观点是被采纳、弱化、暂缓还是判定冲突。",
    "transition 必须说明如何从上一节自然推进到下一节。",
    "endingStrategy 与 recommendedCallToAction 保持一致，结尾要么收束判断，要么给动作，要么留下观察点。",
    "researchBackbone 必须明确指出：最适合开场的历史节点、中段最该展开的横向比较、最适合落成主判断的交汇洞察，以及为什么按这个顺序排。",
    "outlineSections 至少要有一节承接历史节点、一节承接横向比较、一节承接交汇洞察；researchFocus 和 researchAnchor 不能写空话。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    promptBlock("绑定文风资产细节：", listWritingStyleProfileSummary(context)),
    promptBlock("写作风格资产 / DNA 注入细节：", listLayoutStrategySummary(context)),
    context.researchBrief ? promptLine("研究核心问题：", String(context.researchBrief.coreQuestion || "").trim()) : null,
    context.researchBrief ? promptLine("研究必查维度：", getStringArray(context.researchBrief.mustCoverAngles, 5).join("；")) : null,
    context.researchBrief
      ? promptLine(
          "纵向时间脉络：",
          getRecordArray(context.researchBrief.timelineCards)
            .map((item) =>
              formatPromptTemplate("{{phase}}：{{summary}}", {
                phase: String(item.phase || "").trim() || "阶段",
                summary: String(item.summary || "").trim(),
              }),
            )
            .join("；"),
        )
      : null,
    context.researchBrief
      ? promptLine(
          "横向比较：",
          getRecordArray(context.researchBrief.comparisonCards)
            .map((item) =>
              formatPromptTemplate("{{subject}}：{{position}}", {
                subject: String(item.subject || "").trim(),
                position: String(item.position || "").trim(),
              }),
            )
            .join("；"),
        )
      : null,
    context.researchBrief ? promptLine("交汇洞察：", getRecordArray(context.researchBrief.intersectionInsights).map((item) => String(item.insight || "").trim()).join("；")) : null,
    preferredResearchSignals.coreAssertion ? promptLine("当前策略核心判断：", preferredResearchSignals.coreAssertion) : null,
    preferredResearchSignals.whyNow ? promptLine("当前策略 why now：", preferredResearchSignals.whyNow) : null,
    preferredResearchSignals.researchHypothesis ? promptLine("当前策略研究假设：", preferredResearchSignals.researchHypothesis) : null,
    preferredResearchSignals.marketPositionInsight ? promptLine("当前策略位置判断：", preferredResearchSignals.marketPositionInsight) : null,
    preferredResearchSignals.historicalTurningPoint ? promptLine("当前策略历史转折：", preferredResearchSignals.historicalTurningPoint) : null,
    context.audienceSelection?.selectedReaderLabel ? promptLine("已确认目标读者：", context.audienceSelection.selectedReaderLabel) : null,
    context.audienceSelection?.selectedLanguageGuidance ? promptLine("已确认表达方式：", context.audienceSelection.selectedLanguageGuidance) : null,
    context.audienceSelection?.selectedBackgroundAwareness ? promptLine("已确认背景预设：", context.audienceSelection.selectedBackgroundAwareness) : null,
    context.audienceSelection?.selectedReadabilityLevel ? promptLine("已确认通俗度：", context.audienceSelection.selectedReadabilityLevel) : null,
    context.audienceSelection?.selectedCallToAction ? promptLine("已确认结尾动作：", context.audienceSelection.selectedCallToAction) : null,
    context.supplementalViewpoints.length ? promptLine("用户补充观点：", context.supplementalViewpoints.join("；")) : "用户暂未补充额外观点。",
    promptLine("当前正文摘要：", truncateText(stripMarkdown(context.article.markdownContent), 800) || "暂无正文，请先根据素材规划结构。"),
    promptLine(
      "大纲草稿：",
      context.outlineNodes
        .map((item) =>
          formatPromptTemplate("{{title}}{{descriptionPart}}", {
            title: item.title,
            descriptionPart: item.description ? "（" + item.description + "）" : "",
          }),
        )
        .join("；") || "暂无大纲草稿",
    ),
    promptLine("背景卡事实：", getSourceFacts(context, 6).join("；") || "暂无背景卡事实"),
    getLocalizationTermMappings(context, 6).length ? promptLine("外文术语对照：", getLocalizationTermMappings(context, 6).join("；")) : null,
    getLocalizationRiskNotes(context, 4).length ? promptLine("外文转述风险：", getLocalizationRiskNotes(context, 4).join("；")) : null,
    promptLine(
      "当前可用素材包：",
      getMaterialBundle(context, 8)
        .map((item) =>
          formatPromptTemplate("{{fragmentId}}. {{title}}（{{usageMode}}/{{sourceType}}）{{imagePart}}：{{summary}}", {
            fragmentId: item.fragmentId,
            title: item.title,
            usageMode: item.usageMode,
            sourceType: item.sourceType,
            imagePart: item.screenshotPath ? "，原图：" + item.screenshotPath : "",
            summary: item.summary,
          }),
        )
        .join("；") || "暂无已挂载素材",
    ),
  ].filter(Boolean).join("\n");

  const artifact = await generateWithPrompt({
    stageCode: "outlinePlanning",
    promptId: "outline_planning",
    sceneCode: "outlinePlan",
    userPrompt,
    fallback,
    normalize: normalizeOutlinePayload,
    context,
    runtimeMetaPatch: options?.skipOptionRefresh
      ? {
          outlineOptionRefreshSkipped: true,
          outlineOptionRefreshSkipReason: "fast_draft_preview",
        }
      : undefined,
  });
  if (options?.skipOptionRefresh) {
    return artifact;
  }
  const titleOptimizedArtifact = await refreshOutlineTitleOptions({
    context,
    artifact,
    fallback,
  });
  return refreshOutlineOpeningOptions({
    context,
    artifact: titleOptimizedArtifact,
    fallback,
    preserveOutlineUpdatedAt: true,
  });
}

async function generateDeepWriting(
  context: GenerationContext,
  preferredStateVariantCode?: WritingStateVariantCode | null,
  preferredPrototypeCode?: ArticlePrototypeCode | null,
) {
  const fallback = await fallbackDeepWriting(context, preferredStateVariantCode, preferredPrototypeCode);
  const resolvedState = await resolveDeepWritingState(context, preferredStateVariantCode, preferredPrototypeCode);
  const writingState = resolvedState.writingState;
  const applyCommandTemplate = await resolveArticleApplyCommandTemplate({
    userId: context.userId,
    role: context.userRole,
    planCode: context.planCode,
  });
  const outlineSections = getRecordArray(context.outlinePlan?.outlineSections)
    .map((section, index) =>
      [
        promptLine(String(index + 1) + ". ", String(section.heading || "").trim() || ("章节 " + String(index + 1))),
        String(section.goal || "").trim() ? promptLine("目标：", String(section.goal).trim()) : null,
        getStringArray(section.keyPoints, 4).length ? promptLine("关键点：", getStringArray(section.keyPoints, 4).join("；")) : null,
        getStringArray(section.evidenceHints, 4).length ? promptLine("证据提示：", getStringArray(section.evidenceHints, 4).join("；")) : null,
        String(section.researchFocus || "").trim() ? promptLine("研究焦点：", String(section.researchFocus).trim()) : null,
        String(section.researchAnchor || "").trim() ? promptLine("研究锚点：", String(section.researchAnchor).trim()) : null,
      ].filter(Boolean).join("\n"),
    );
  const outlineResearchBackbone = normalizeRecord(context.outlinePlan?.researchBackbone);
  const diversityIssues = uniqueStrings(fallback.diversityIssues, 4);
  const diversitySuggestions = uniqueStrings(fallback.diversitySuggestions, 4);
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
            '字段：{"summary":"字符串","selectedTitle":"字符串","centralThesis":"字符串","writingAngle":"字符串","openingStrategy":"字符串","targetEmotion":"字符串","endingStrategy":"字符串","openingPatternLabel":"字符串","syntaxPatternLabel":"字符串","endingPatternLabel":"字符串","diversitySummary":"字符串","diversityIssues":[""],"diversitySuggestions":[""],"articlePrototype":"字符串","articlePrototypeLabel":"字符串","articlePrototypeReason":"字符串","prototypeOptions":[{"code":"字符串","label":"字符串","suitableWhen":"字符串","triggerReason":"字符串","openingMove":"字符串","sectionRhythm":"字符串","evidenceMode":"字符串"}],"prototypeComparisons":[{"code":"字符串","label":"字符串","reason":"字符串","suitableWhen":"字符串","triggerReason":"字符串","openingMove":"字符串","sectionRhythm":"字符串","evidenceMode":"字符串","recommendedStateVariantLabel":"字符串","openingPatternLabel":"字符串","syntaxPatternLabel":"字符串","endingPatternLabel":"字符串","diversitySummary":"字符串","diversityIssues":[""],"diversitySuggestions":[""],"progressiveRevealLabel":"字符串","progressiveRevealReason":"字符串","isRecommended":true}],"stateVariantCode":"字符串","stateVariantLabel":"字符串","stateVariantReason":"字符串","researchFocus":"字符串","researchLens":"字符串","openingMove":"字符串","sectionRhythm":"字符串","evidenceMode":"字符串","progressiveRevealEnabled":true,"progressiveRevealLabel":"字符串","progressiveRevealReason":"字符串","climaxPlacement":"字符串","escalationRule":"字符串","progressiveRevealSteps":[{"label":"字符串","instruction":"字符串"}],"stateChecklist":[""],"stateOptions":[{"code":"字符串","label":"字符串","suitableWhen":"字符串","triggerReason":"字符串"}],"stateComparisons":[{"code":"字符串","label":"字符串","reason":"字符串","suitableWhen":"字符串","triggerReason":"字符串","openingMove":"字符串","openingPatternLabel":"字符串","syntaxPatternLabel":"字符串","endingPatternLabel":"字符串","diversitySummary":"字符串","diversityIssues":[""],"diversitySuggestions":[""],"progressiveRevealLabel":"字符串","progressiveRevealReason":"字符串","isRecommended":true}],"voiceChecklist":[""],"mustUseFacts":[""],"bannedWordWatchlist":[""],"sectionBlueprint":[{"heading":"字符串","goal":"字符串","paragraphMission":"字符串","evidenceHints":[""],"materialRefs":[1],"revealRole":"字符串","transition":"字符串"}],"historyReferencePlan":[{"title":"字符串","useWhen":"字符串","bridgeSentence":"字符串"}],"finalChecklist":[""]}',
    "你是在给正文生成器准备一张可执行的写作执行卡，不是在复述大纲。",
    "sectionBlueprint 返回 3-6 节，每节都要写清本节任务、段落推进方式和证据提示。",
    "voiceChecklist 返回 3-6 条，必须是可执行的表达约束，不要写空泛风格形容词。",
    "articlePrototype / articlePrototypeLabel / articlePrototypeReason / stateVariantCode / stateVariantLabel / stateVariantReason 必须明确告诉后续正文生成器这次在用哪种原型和状态。",
    "prototypeOptions 返回 2-3 个候选原型，第一项放当前最推荐的；prototypeComparisons 返回 2-3 个原型预览卡，帮助用户比较这篇到底更适合哪种推进骨架。",
    "diversitySummary / diversityIssues / diversitySuggestions 要明确写清这次为了避免最近几篇撞车，执行卡主动换掉了哪些原型、开头、句法、结尾或状态套路。",
    "stateComparisons 返回 2-3 个候选状态预览卡，帮助用户比较当前推荐状态与备选状态的差异；第一项必须是当前推荐。",
    "如果题型适合“逐一展示 / 升番”，必须返回 progressiveRevealEnabled=true，并写清 progressiveRevealReason / climaxPlacement / escalationRule / progressiveRevealSteps。",
    "如果 progressiveRevealEnabled=true，sectionBlueprint 的 revealRole 必须标明每一节承担的是铺垫样本、逐层加码、最强发现还是收束判断。",
    "stateOptions 返回 2-3 个候选状态，第一项放当前最推荐的；stateChecklist 返回 3-5 条能直接执行的状态自检。",
    "researchFocus / researchLens 必须明确告诉后续正文生成器：这次最该写硬的研究判断是什么，以及应该优先用时间脉络、横向比较还是交汇洞察来组织文章。",
    "mustUseFacts 只保留真正值得写进正文的事实锚点，不超过 6 条。",
    "historyReferencePlan 最多 2 条，没有可用旧文时返回空数组。",
    "finalChecklist 必须覆盖标题一致性、事实密度、语言守卫规避、结尾动作或判断收束。",
    "如果已提供 seriesInsight 或 seriesChecklist，请保留下来并显式提醒系列口径一致性。",
    "如果大纲里已经确认了标题、开头、目标情绪、结尾策略，必须优先沿用。",
    "事实风险前置约束：不要把未验证的具体数字、时间压缩、金额、比例或第一人称效率案例写进标题、开头、sectionBlueprint 或 mustUseFacts；证据不足时只能写成有限观察或趋势信号。",
    diversityIssues.length
      ? "如果最近几篇的原型、开头、句法、结尾或状态已经重复，openingStrategy / endingStrategy / stateChecklist / finalChecklist 必须主动改写并吸收 diversitySuggestions，不能继续沿用同一种推进骨架和句法呼吸。"
      : "如果最近几篇没有明显重复，也要在 diversitySummary 中说明当前多样性状态，并给出 0-2 条保持差异化的动作。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    promptBlock("绑定文风资产细节：", listWritingStyleProfileSummary(context)),
    promptBlock("写作风格资产 / DNA 注入细节：", listLayoutStrategySummary(context)),
    context.researchBrief
      ? promptLine(
          "研究交汇洞察：",
          getRecordArray(context.researchBrief.intersectionInsights)
            .map((item) =>
              formatPromptTemplate("{{insight}}{{whyNowPart}}", {
                insight: String(item.insight || "").trim(),
                whyNowPart: String(item.whyNow || "").trim() ? "（" + String(item.whyNow).trim() + "）" : "",
              }),
            )
            .join("；"),
        )
      : null,
    preferredResearchSignals.coreAssertion ? promptLine("当前策略核心判断：", preferredResearchSignals.coreAssertion) : null,
    preferredResearchSignals.whyNow ? promptLine("当前策略 why now：", preferredResearchSignals.whyNow) : null,
    preferredResearchSignals.researchHypothesis ? promptLine("当前策略研究假设：", preferredResearchSignals.researchHypothesis) : null,
    preferredResearchSignals.marketPositionInsight ? promptLine("当前策略位置判断：", preferredResearchSignals.marketPositionInsight) : null,
    preferredResearchSignals.historicalTurningPoint ? promptLine("当前策略历史转折：", preferredResearchSignals.historicalTurningPoint) : null,
    context.audienceSelection?.selectedReaderLabel ? promptLine("已确认目标读者：", context.audienceSelection.selectedReaderLabel) : null,
    context.audienceSelection?.selectedLanguageGuidance ? promptLine("已确认表达方式：", context.audienceSelection.selectedLanguageGuidance) : null,
    context.audienceSelection?.selectedBackgroundAwareness ? promptLine("已确认背景预设：", context.audienceSelection.selectedBackgroundAwareness) : null,
    context.audienceSelection?.selectedReadabilityLevel ? promptLine("已确认通俗度：", context.audienceSelection.selectedReadabilityLevel) : null,
    context.outlineSelection?.selectedTitle ? promptLine("已确认标题：", context.outlineSelection.selectedTitle) : null,
    context.outlineSelection?.selectedOpeningHook ? promptLine("已确认开头策略：", context.outlineSelection.selectedOpeningHook) : null,
    context.outlineSelection?.selectedTargetEmotion ? promptLine("已确认目标情绪：", context.outlineSelection.selectedTargetEmotion) : null,
    context.outlineSelection?.selectedEndingStrategy ? promptLine("已确认结尾策略：", context.outlineSelection.selectedEndingStrategy) : null,
    String(context.outlinePlan?.centralThesis || "").trim() ? promptLine("大纲核心观点：", String(context.outlinePlan?.centralThesis).trim()) : null,
    outlineResearchBackbone
      ? promptLine("大纲研究骨架：", [
          String(outlineResearchBackbone.openingTimelineAnchor || "").trim() ? formatPromptTemplate("开场历史节点 {{value}}", { value: String(outlineResearchBackbone.openingTimelineAnchor).trim() }) : null,
          String(outlineResearchBackbone.middleComparisonAnchor || "").trim() ? formatPromptTemplate("中段横向比较 {{value}}", { value: String(outlineResearchBackbone.middleComparisonAnchor).trim() }) : null,
          String(outlineResearchBackbone.coreInsightAnchor || "").trim() ? formatPromptTemplate("核心交汇洞察 {{value}}", { value: String(outlineResearchBackbone.coreInsightAnchor).trim() }) : null,
          String(outlineResearchBackbone.sequencingNote || "").trim() ? formatPromptTemplate("排序理由 {{value}}", { value: String(outlineResearchBackbone.sequencingNote).trim() }) : null,
        ].filter(Boolean).join("；"))
      : null,
    promptLine("当前默认开头策略：", resolvedState.openingStrategy),
    promptLine("当前默认结尾策略：", resolvedState.endingStrategy),
    promptLine(
      "当前文章原型：",
      formatPromptTemplate("{{label}}（{{prototype}}）", {
        label: writingState.articlePrototypeLabel,
        prototype: writingState.articlePrototype,
      }),
    ),
    preferredPrototypeCode ? promptLine("本次手动指定文章原型：", writingState.articlePrototypeLabel) : null,
    promptLine("当前文章原型原因：", writingState.articlePrototypeReason),
    preferredStateVariantCode ? promptLine("本次手动指定写作状态：", writingState.stateVariantLabel) : null,
    promptLine(
      "当前写作状态：",
      formatPromptTemplate("{{label}} / {{reason}}", {
        label: writingState.stateVariantLabel,
        reason: writingState.stateVariantReason,
      }),
    ),
    promptLine("默认起手方式：", writingState.openingMove),
    promptLine("默认章节节奏：", writingState.sectionRhythm),
    promptLine("默认证据组织：", writingState.evidenceMode),
    promptLine(
      "节奏插件：",
      formatPromptTemplate("{{label}} / {{reason}}", {
        label: writingState.progressiveRevealLabel,
        reason: writingState.progressiveRevealReason,
      }),
    ),
    promptLine("高潮位置：", writingState.climaxPlacement),
    promptLine("升番规则：", writingState.escalationRule),
    promptLine(
      "逐层推进：",
      writingState.progressiveRevealSteps
        .map((item) =>
          formatPromptTemplate("{{label}}：{{instruction}}", {
            label: item.label,
            instruction: item.instruction,
          }),
        )
        .join(" | "),
    ),
    promptLine(
      "原型候选：",
      writingState.prototypeOptions
        .map((item) =>
          formatPromptTemplate("{{label}}（{{suitableWhen}}；触发：{{triggerReason}}）", {
            label: item.label,
            suitableWhen: item.suitableWhen,
            triggerReason: item.triggerReason,
          }),
        )
        .join(" | "),
    ),
    promptLine(
      "状态候选：",
      writingState.stateOptions
        .map((item) =>
          formatPromptTemplate("{{label}}（{{suitableWhen}}；触发：{{triggerReason}}）", {
            label: item.label,
            suitableWhen: item.suitableWhen,
            triggerReason: item.triggerReason,
          }),
        )
        .join(" | "),
    ),
    String(fallback.diversitySummary || "").trim() ? promptLine("长期写法去重观察：", String(fallback.diversitySummary).trim()) : null,
    diversityIssues.length ? promptLine("检测到的重复风险：", diversityIssues.join("；")) : "检测到的重复风险：暂无明显撞车。",
    diversitySuggestions.length ? promptLine("这次执行卡必须吸收的去重动作：", diversitySuggestions.join("；")) : "这次执行卡必须吸收的去重动作：保持当前差异化，不要回到总结式开头、模板化句法或教科书式收尾。",
    outlineSections.length ? promptBlock("大纲章节：", outlineSections.join("\n\n")) : "暂无结构化大纲章节。",
    promptLine("现有事实素材：", getSourceFacts(context, 6).join("；") || "暂无"),
    getLocalizationTermMappings(context, 6).length ? promptLine("外文术语对照：", getLocalizationTermMappings(context, 6).join("；")) : null,
    getLocalizationRiskNotes(context, 4).length ? promptLine("外文转述风险：", getLocalizationRiskNotes(context, 4).join("；")) : null,
    promptLine(
      "可用素材包：",
      getMaterialBundle(context, 8)
        .map((item) =>
          formatPromptTemplate("{{fragmentId}}. {{title}}（{{usageMode}}/{{sourceType}}）：{{summary}}", {
            fragmentId: item.fragmentId,
            title: item.title,
            usageMode: item.usageMode,
            sourceType: item.sourceType,
            summary: item.summary,
          }),
        )
        .join("；") || "暂无",
    ),
    context.historyReferences.length
      ? promptLine(
          "已保存历史文章自然引用：",
          context.historyReferences
            .map((item) =>
              formatPromptTemplate("《{{title}}》{{relationPart}}{{bridgePart}}", {
                title: item.title,
                relationPart: item.relationReason ? "：" + item.relationReason : "",
                bridgePart: item.bridgeSentence ? "；桥接句：" + item.bridgeSentence : "",
              }),
            )
            .join("；"),
        )
      : "暂无历史文章自然引用设置。",
    context.seriesInsight
      ? promptLine("系列一致性：", [
          context.seriesInsight.label ? formatPromptTemplate("系列标签 {{value}}", { value: context.seriesInsight.label }) : null,
          context.seriesInsight.reason ? formatPromptTemplate("归因理由 {{value}}", { value: context.seriesInsight.reason }) : null,
          context.seriesInsight.commonTerms.length ? formatPromptTemplate("常用术语 {{value}}", { value: context.seriesInsight.commonTerms.join(" / ") }) : null,
          context.seriesInsight.driftRisks.length ? formatPromptTemplate("口径漂移风险 {{value}}", { value: context.seriesInsight.driftRisks.join("；") }) : null,
          context.seriesInsight.whyNow.length ? formatPromptTemplate("为什么现在值得继续写 {{value}}", { value: context.seriesInsight.whyNow.join("；") }) : null,
        ].filter(Boolean).join("；"))
      : "当前暂无明确系列约束。",
    applyCommandTemplate
      ? promptLine(
          "当前 apply command 模板：",
          formatPromptTemplate("{{name}}（{{code}}）", {
            name: applyCommandTemplate.name,
            code: applyCommandTemplate.code,
          }),
        )
      : null,
    promptLine("语言守卫名单：", context.bannedWords.join("、") || "无"),
    promptLine("当前正文摘要：", truncateText(stripMarkdown(context.article.markdownContent), 800) || "暂无正文，请按大纲和素材组织初稿。"),
  ].filter(Boolean).join("\n");

  return generateWithPrompt({
    stageCode: "deepWriting",
    promptId: "article_write",
    sceneCode: "deepWrite",
    userPrompt,
    fallback,
    normalize: normalizeDeepWritingPayload,
    context,
    runtimeMetaPatch: buildArticleArtifactRuntimeMetaPatch({
      scoringProfile: context.scoringProfile,
      layoutStrategy: context.layoutStrategy,
      applyCommandTemplate: applyCommandTemplate
        ? {
            code: applyCommandTemplate.code,
            name: applyCommandTemplate.name,
            resolutionMode: applyCommandTemplate.resolutionMode,
            resolutionReason: applyCommandTemplate.resolutionReason,
          }
        : null,
    }),
  });
}

async function generateFactCheck(context: GenerationContext) {
  const fallback = fallbackFactCheck(context);
  const preferredResearchSignals = getPreferredResearchSignals(context);
  const researchSourceCoverage = normalizeRecord(context.researchBrief?.sourceCoverage);
  const localizationRiskNotes = getLocalizationRiskNotes(context, 4);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","overallRisk":"low|medium|high","checks":[{"claim":"字符串","status":"verified|needs_source|risky|opinion","suggestion":"字符串"}],"evidenceCards":[{"claim":"字符串","supportLevel":"strong|partial|missing","supportingEvidence":[{"title":"字符串","excerpt":"字符串","sourceType":"url|manual|screenshot","sourceUrl":"字符串或空","researchTag":"timeline|competitor|userVoice|contradiction|turningPoint","rationale":"字符串"}],"counterEvidence":[{"title":"字符串","excerpt":"字符串","sourceType":"url|manual|screenshot","sourceUrl":"字符串或空","researchTag":"contradiction|competitor|userVoice","rationale":"字符串"}]}],"missingEvidence":[""],"researchReview":{"summary":"字符串","sourceCoverage":"ready|limited|blocked|unknown","timelineSupport":"enough|missing","comparisonSupport":"enough|missing","intersectionSupport":"enough|missing","strongestAnchor":"字符串","gaps":[""]},"personaAlignment":"字符串","topicAlignment":"字符串"}',
    "只针对正文里的具体事实、时间、数字、案例与因果判断给出核查结果。",
    "如果提供的事实素材里没有足够依据，不能标 verified，应该标 needs_source 或 risky。",
    "opinion 只用于明显属于作者判断、价值评价或预测的句子，不要滥用。",
    "checks 优先覆盖最关键、最容易出错、最影响发布风险的 5-12 条表述。",
    "suggestion 必须可执行，例如补什么证据、改成什么语气、删掉哪一层因果推断。",
    "evidenceCards 只允许使用已提供的素材、背景卡和 URL 证据，不要编造外部来源。",
    "supportingEvidence 放支持当前判断的证据；counterEvidence 放反证、反例、争议或会削弱判断的材料。",
    "researchTag 尽量标成 timeline、competitor、userVoice、contradiction、turningPoint 之一，方便后续证据包和发布守门使用。",
    "missingEvidence 只列真正阻碍发布的缺口，例如时间、数字口径、案例出处。",
    "researchReview 必须额外判断正文主判断有没有足够的纵向时间脉络、横向比较和交汇洞察支撑；如果研究层缺失，要明确写 missing 和具体缺口。",
    "如果研究简报显示信源覆盖仍 limited 或 blocked，不能把正文里的结构性判断当成已经完全坐实。",
    "如果正文下了横向优劣判断，却没有同类对照或反例，要在 researchReview.gaps 或 missingEvidence 里指出。",
    "personaAlignment 和 topicAlignment 要判断当前正文是否偏离作者人设和主题主轴，必要时直接指出跑题或语气失配。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    promptBlock("绑定文风资产细节：", listWritingStyleProfileSummary(context)),
    promptBlock("写作风格资产 / DNA 注入细节：", listLayoutStrategySummary(context)),
    promptLine("当前正文：", context.article.markdownContent || "暂无正文"),
    promptLine("可对照事实：", getSourceFacts(context, 8).join("；") || "暂无对照事实"),
    localizationRiskNotes.length ? promptLine("外文信源转述提醒：", localizationRiskNotes.join("；")) : null,
    context.researchBrief ? promptLine("研究简报摘要：", String(context.researchBrief.summary || "").trim()) : "当前没有研究简报。",
    context.researchBrief ? promptLine("研究核心问题：", String(context.researchBrief.coreQuestion || "").trim()) : null,
    context.researchBrief
      ? promptLine(
          "研究信源覆盖：",
          formatPromptTemplate("{{sufficiency}}；缺口：{{gaps}}", {
            sufficiency: String(researchSourceCoverage?.sufficiency || "").trim() || "unknown",
            gaps: getStringArray(researchSourceCoverage?.missingCategories, 5).join("；") || "暂无",
          }),
        )
      : null,
    context.researchBrief
      ? promptLine(
          "时间脉络卡：",
          getRecordArray(context.researchBrief.timelineCards)
            .map((item) =>
              formatPromptTemplate("{{phase}}：{{summary}}", {
                phase: String(item.phase || "").trim() || "阶段",
                summary: String(item.summary || "").trim(),
              }),
            )
            .filter(Boolean)
            .join("；"),
        )
      : null,
    context.researchBrief
      ? promptLine(
          "横向比较卡：",
          getRecordArray(context.researchBrief.comparisonCards)
            .map((item) =>
              formatPromptTemplate("{{subject}}：{{position}}", {
                subject: String(item.subject || "").trim(),
                position: String(item.position || "").trim(),
              }),
            )
            .filter(Boolean)
            .join("；"),
        )
      : null,
    context.researchBrief
      ? promptLine(
          "交汇洞察：",
          getRecordArray(context.researchBrief.intersectionInsights)
            .map((item) =>
              formatPromptTemplate("{{insight}}{{whyNowPart}}", {
                insight: String(item.insight || "").trim(),
                whyNowPart: String(item.whyNow || "").trim() ? "（" + String(item.whyNow).trim() + "）" : "",
              }),
            )
            .filter(Boolean)
            .join("；"),
        )
      : null,
    preferredResearchSignals.coreAssertion ? promptLine("当前策略主判断：", preferredResearchSignals.coreAssertion) : null,
    preferredResearchSignals.historicalTurningPoint ? promptLine("当前策略历史转折：", preferredResearchSignals.historicalTurningPoint) : null,
    preferredResearchSignals.marketPositionInsight ? promptLine("当前策略位置判断：", preferredResearchSignals.marketPositionInsight) : null,
    preferredResearchSignals.researchHypothesis ? promptLine("当前策略研究假设：", preferredResearchSignals.researchHypothesis) : null,
    context.seriesInsight
      ? promptLine("系列助手提示：", [
          context.seriesInsight.label ? formatPromptTemplate("当前系列 {{value}}", { value: context.seriesInsight.label }) : null,
          context.seriesInsight.coreStances.length ? formatPromptTemplate("核心立场 {{value}}", { value: context.seriesInsight.coreStances.join("；") }) : null,
          context.seriesInsight.driftRisks.length ? formatPromptTemplate("口径漂移风险 {{value}}", { value: context.seriesInsight.driftRisks.join("；") }) : null,
        ].filter(Boolean).join("；"))
      : "当前暂无系列历史约束。",
  ].join("\n");

  return generateWithPrompt({
    stageCode: "factCheck",
    promptId: "fact_check",
    sceneCode: "factCheck",
    userPrompt,
    fallback,
    normalize: (value, baseFallback) => normalizeFactCheckPayload(value, baseFallback, context),
    context,
  });
}

async function generateProsePolish(context: GenerationContext) {
  const fallback = fallbackProsePolish(context);
  const userPrompt = [
    "请输出 JSON，不要解释，不要 markdown。",
    '字段：{"summary":"字符串","overallDiagnosis":"字符串","strengths":[""],"issues":[{"type":"字符串","example":"字符串","suggestion":"字符串"}],"languageGuardHits":[{"ruleId":"字符串","ruleKind":"token|pattern","matchMode":"contains|template","matchedText":"字符串","patternText":"字符串","rewriteHint":"字符串","severity":"high|medium","scope":"system|user"}],"rewrittenLead":"字符串","punchlines":[""],"rhythmAdvice":[""]}',
    "润色只负责表达，不负责新增事实、数据、案例和结论。",
    "结合正文、禁词、人设口吻和目标读者，给出可执行的润色建议。",
    "strengths 返回 2-4 条，说明当前稿子已经成立的表达优势。",
    "issues 返回 3-6 条，优先指出机器腔、抽象空话、节奏拖沓、情绪转折不顺、术语过密、起手无力等问题。",
    "languageGuardHits 必须优先返回语言守卫命中项，句式命中也要列出来。",
    "suggestion 必须具体到改法，不要只写“更自然一点”“更有感染力”。",
    "rewrittenLead 要保留原文事实立场，只重写开头表达，长度控制在 80-160 字。",
    "punchlines 提炼 2-4 条可直接入稿的金句或判断句，但不能编造新事实。",
    "rhythmAdvice 给出段落长短、断句、留白、强调句位置等节奏建议。",
    promptLine("稿件标题：", context.article.title),
    promptLine("作者人设：", listPersonaSummary(context)),
    promptBlock("绑定文风资产细节：", listWritingStyleProfileSummary(context)),
    promptBlock("写作风格资产 / DNA 注入细节：", listLayoutStrategySummary(context)),
    promptLine("禁用词：", context.bannedWords.join("、") || "无"),
    promptLine(
      "语言守卫规则：",
      context.languageGuardRules
        .slice(0, 12)
        .map((rule) =>
          formatPromptTemplate("{{pattern}}{{rewriteHintPart}}", {
            pattern: rule.patternText,
            rewriteHintPart: rule.rewriteHint ? "（" + rule.rewriteHint + "）" : "",
          }),
        )
        .join("；"),
    ),
    promptLine("当前正文：", context.article.markdownContent || "暂无正文"),
  ].join("\n");

  return generateWithPrompt({
    stageCode: "prosePolish",
    promptId: "prose_polish",
    sceneCode: "prosePolish",
    userPrompt,
    fallback,
    normalize: normalizeProsePolishPayload,
    context,
  });
}

export function isSupportedArticleArtifactStage(stageCode: string): stageCode is ArticleArtifactStageCode {
  return isArticleArtifactStageCode(stageCode);
}

export async function getArticleStageArtifacts(articleId: number, userId: number) {
  await ensureExtendedProductSchema();
    await ensureArticleAccess(articleId, userId);
  const db = getDatabase();
  const rows = await db.query<ArtifactRow>(
    `SELECT *
     FROM article_stage_artifacts
     WHERE article_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [articleId],
  );
  return rows.map(toArtifact);
}

export async function getArticleStageArtifactsByDocumentIds(input: {
  userId: number;
  articleIds: number[];
  stageCode: ArticleArtifactStageCode;
}) {
  await ensureExtendedProductSchema();
  const uniqueArticleIds = Array.from(new Set(input.articleIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)));
  if (uniqueArticleIds.length === 0) {
    return [] as Array<{
      articleId: number;
      title: string;
      updatedAt: string;
      artifact: ArticleStageArtifact;
    }>;
  }
  const placeholders = uniqueArticleIds.map(() => "?").join(", ");
  const rows = await getDatabase().query<ArtifactRow & { article_title: string; article_updated_at: string }>(
    "SELECT dsa.*, d.title AS article_title, d.updated_at AS article_updated_at\n"
      + "FROM article_stage_artifacts dsa\n"
      + "INNER JOIN articles d ON d.id = dsa.article_id\n"
      + "WHERE d.user_id = ? AND dsa.stage_code = ? AND dsa.article_id IN (" + placeholders + ")\n"
      + "ORDER BY d.updated_at DESC, d.id DESC",
    [input.userId, input.stageCode, ...uniqueArticleIds],
  );
  return rows.map((row) => ({
    articleId: row.article_id,
    title: row.article_title,
    updatedAt: row.article_updated_at,
    artifact: toArtifact(row),
  }));
}

export async function getArticleStageArtifact(articleId: number, userId: number, stageCode: ArticleArtifactStageCode) {
  await ensureExtendedProductSchema();
  await ensureArticleAccess(articleId, userId);
  const row = await getDatabase().queryOne<ArtifactRow>(
    `SELECT *
     FROM article_stage_artifacts
     WHERE article_id = ? AND stage_code = ?`,
    [articleId, stageCode],
  );
  return row ? toArtifact(row) : null;
}

export async function updateArticleStageArtifactPayload(input: {
  articleId: number;
  userId: number;
  stageCode: ArticleArtifactStageCode;
  payloadPatch: Record<string, unknown>;
}) {
  const current = await getArticleStageArtifact(input.articleId, input.userId, input.stageCode);
  if (!current) {
    await ensureArticleAccess(input.articleId, input.userId);
    const summary =
      typeof input.payloadPatch.summary === "string" && input.payloadPatch.summary.trim()
        ? input.payloadPatch.summary.trim()
        : null;
    return upsertArtifact({
      articleId: input.articleId,
      userId: input.userId,
      stageCode: input.stageCode,
      status: "ready",
      summary,
      payload: input.payloadPatch,
      model: "manual-seed",
      provider: "manual",
      errorMessage: null,
    });
  }
  const nextPayload = {
    ...(current.payload || {}),
    ...input.payloadPatch,
  };
  const currentRuntimeMeta = normalizeRecord(current.payload?.runtimeMeta);
  const patchRuntimeMeta = normalizeRecord(input.payloadPatch.runtimeMeta);
  if (currentRuntimeMeta && patchRuntimeMeta) {
    const currentPromptVersionRefs = Array.isArray(currentRuntimeMeta.promptVersionRefs)
      ? currentRuntimeMeta.promptVersionRefs.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const patchPromptVersionRefs = Array.isArray(patchRuntimeMeta.promptVersionRefs)
      ? patchRuntimeMeta.promptVersionRefs.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    nextPayload.runtimeMeta = {
      ...currentRuntimeMeta,
      ...patchRuntimeMeta,
      ...(currentPromptVersionRefs.length > 0 || patchPromptVersionRefs.length > 0
        ? {
            promptVersionRefs: Array.from(new Set([...currentPromptVersionRefs, ...patchPromptVersionRefs])),
          }
        : {}),
    };
  }
  return upsertArtifact({
    articleId: input.articleId,
    userId: input.userId,
    stageCode: input.stageCode,
    status: current.status,
    summary: current.summary,
    payload: nextPayload,
    model: current.model,
    provider: current.provider,
    errorMessage: current.errorMessage,
  });
}

export async function generateArticleStageArtifact(input: {
  articleId: number;
  userId: number;
  stageCode: ArticleArtifactStageCode;
  forceLocal?: boolean;
  skipOutlineOptionRefresh?: boolean;
  deepWritingPrototypeCode?: ArticlePrototypeCode | null;
  deepWritingStateVariantCode?: WritingStateVariantCode | null;
  outlineTitleOptionsOnly?: boolean;
  outlineOpeningOptionsOnly?: boolean;
  researchSearchHints?: {
    topicTheme?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchObject?: string | null;
    coreQuestion?: string | null;
    mustCoverAngles?: string[];
    missingCategories?: string[];
  };
}) {
  if (input.stageCode === "researchBrief") {
    const initialContext = await buildGenerationContext(input.articleId, input.userId);
    let externalResearch: Awaited<ReturnType<typeof supplementArticleResearchSources>>;
    try {
      externalResearch = await withStageGenerationTimeout(
        supplementArticleResearchSources({
          articleId: input.articleId,
          userId: input.userId,
          articleTitle: initialContext.article.title,
          evidenceFragments: initialContext.evidenceFragments.map((item) => ({
            sourceType: item.sourceType,
            sourceUrl: item.sourceUrl,
          })),
          knowledgeCards: initialContext.knowledgeCards.map((item) => ({
            title: item.title,
            summary: item.summary,
          })),
          outlineNodes: initialContext.outlineNodes.map((item) => ({
            title: item.title,
            description: item.description,
          })),
          searchHints: input.researchSearchHints,
        }),
        ARTICLE_STAGE_OPTION_TIMEOUT_MS,
        "researchBrief 外部补源超时",
      );
    } catch (error) {
      externalResearch = {
        attempted: true,
        query: [
          input.researchSearchHints?.topicTheme,
          input.researchSearchHints?.researchObject,
          ...(input.researchSearchHints?.mustCoverAngles ?? []),
        ].map((item) => String(item || "").trim()).filter(Boolean).join(" | "),
        searchUrl: null,
        discoveredUrls: [],
        imaQueries: [],
        imaDiscoveredTitles: [],
        imaError: null,
        curatedSourceUrls: [],
        attached: [],
        skipped: [],
        failed: [],
        searchError: error instanceof Error ? error.message : "researchBrief 外部补源失败",
        searches: [],
      };
    }
    const context = externalResearch.attached.length > 0
      ? await buildGenerationContext(input.articleId, input.userId)
      : initialContext;
    return generateResearchBrief(context, externalResearch);
  }
  const context = await buildGenerationContext(input.articleId, input.userId);
  if (input.stageCode === "audienceAnalysis") {
    if (input.forceLocal) {
      const payload = fallbackAudienceAnalysis(context);
      return upsertArtifact({
        articleId: input.articleId,
        userId: input.userId,
        stageCode: "audienceAnalysis",
        status: "ready",
        summary: String(payload.summary || "").trim() || null,
        payload: {
          ...payload,
          ...buildArticleArtifactRuntimeMetaPatch({
            scoringProfile: context.scoringProfile,
            layoutStrategy: context.layoutStrategy,
          }),
          fastLocalStrategy: true,
        },
        model: "fast-local",
        provider: "local",
        errorMessage: null,
      });
    }
    return generateAudienceAnalysis(context);
  }
  if (input.stageCode === "outlinePlanning") {
    if (input.outlineTitleOptionsOnly || input.outlineOpeningOptionsOnly) {
      const existingOutlineArtifact = await getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning");
      if (!existingOutlineArtifact?.payload) {
        return generateOutlinePlanning(context, {
          skipOptionRefresh: input.skipOutlineOptionRefresh,
        });
      }
      const fallback = fallbackOutlinePlanning(context);
      let artifact = existingOutlineArtifact;
      if (input.outlineTitleOptionsOnly) {
        artifact = await refreshOutlineTitleOptions({
          context,
          artifact,
          fallback,
          preserveOutlineUpdatedAt: true,
        });
      }
      if (input.outlineOpeningOptionsOnly) {
        artifact = await refreshOutlineOpeningOptions({
          context,
          artifact,
          fallback,
          preserveOutlineUpdatedAt: true,
        });
      }
      return artifact;
    }
    return generateOutlinePlanning(context, {
      skipOptionRefresh: input.skipOutlineOptionRefresh,
    });
  }
  if (input.stageCode === "deepWriting") {
    return generateDeepWriting(context, input.deepWritingStateVariantCode, input.deepWritingPrototypeCode);
  }
  if (input.stageCode === "factCheck") {
    if (input.forceLocal) {
      const payload = fallbackFactCheck(context);
      return upsertArtifact({
        articleId: input.articleId,
        userId: input.userId,
        stageCode: "factCheck",
        status: "ready",
        summary: String(payload.summary || "").trim() || null,
        payload: {
          ...payload,
          ...buildArticleArtifactRuntimeMetaPatch({
            scoringProfile: context.scoringProfile,
            layoutStrategy: context.layoutStrategy,
          }),
          fastLocalReview: true,
        },
        model: "fast-local",
        provider: "local",
        errorMessage: null,
      });
    }
    return generateFactCheck(context);
  }
  if (input.forceLocal) {
    const payload = fallbackProsePolish(context);
    return upsertArtifact({
      articleId: input.articleId,
      userId: input.userId,
      stageCode: "prosePolish",
      status: "ready",
      summary: String(payload.summary || "").trim() || null,
      payload: {
        ...payload,
        ...buildArticleArtifactRuntimeMetaPatch({
          scoringProfile: context.scoringProfile,
          layoutStrategy: context.layoutStrategy,
        }),
        fastLocalReview: true,
      },
      model: "fast-local",
      provider: "local",
      errorMessage: null,
    });
  }
  return generateProsePolish(context);
}

export function buildStageArtifactApplyCommand(
  artifact: ArticleStageArtifact,
  options?: {
    templateCode?: string | null;
    strategyCard?: {
      targetReader?: string | null;
      coreAssertion?: string | null;
      whyNow?: string | null;
      researchHypothesis?: string | null;
      marketPositionInsight?: string | null;
      historicalTurningPoint?: string | null;
    } | null;
  },
) {
  const payload = artifact.payload || {};

  if (artifact.stageCode === "researchBrief") {
    const timelineCards = getRecordArray(payload.timelineCards)
      .slice(0, 3)
      .map((item) =>
        formatPromptTemplate("{{phase}}：{{summary}}", {
          phase: String(item.phase || "").trim() || "阶段",
          summary: String(item.summary || "").trim(),
        }),
      );
    const comparisonCards = getRecordArray(payload.comparisonCards)
      .slice(0, 3)
      .map((item) =>
        formatPromptTemplate("{{subject}}：{{position}}", {
          subject: String(item.subject || "").trim() || "比较对象",
          position: String(item.position || "").trim(),
        }),
      );
    const insights = getRecordArray(payload.intersectionInsights)
      .slice(0, 3)
      .map((item) =>
        formatPromptTemplate("{{insight}}{{whyNowPart}}", {
          insight: String(item.insight || "").trim(),
          whyNowPart: String(item.whyNow || "").trim() ? "（" + String(item.whyNow).trim() + "）" : "",
        }),
      );
    const sourceCoverage = normalizeRecord(payload.sourceCoverage);
    const preferredResearchSignals = getPreferredResearchSignalsForApply({
      strategyWriteback: normalizeRecord(payload.strategyWriteback),
      strategyCard: options?.strategyCard ?? null,
    });
    return [
      "请先按照下面的研究简报重写全文，优先补上时间脉络、横向比较和结构性判断，不要直接把资料平铺成报告。",
      String(payload.coreQuestion || "").trim() ? promptLine("研究问题：", String(payload.coreQuestion).trim()) : null,
      String(payload.authorHypothesis || "").trim() ? promptLine("待验证假设：", String(payload.authorHypothesis).trim()) : null,
      preferredResearchSignals.targetReader ? promptLine("默认读者：", preferredResearchSignals.targetReader) : null,
      timelineCards.length ? promptLine("时间脉络：", timelineCards.join(" | ")) : null,
      comparisonCards.length ? promptLine("横向比较：", comparisonCards.join(" | ")) : null,
      insights.length ? promptLine("交汇洞察：", insights.join(" | ")) : null,
      preferredResearchSignals.coreAssertion ? promptLine("主判断优先围绕这条当前策略判断：", preferredResearchSignals.coreAssertion) : null,
      preferredResearchSignals.whyNow ? promptLine("为什么现在值得写：", preferredResearchSignals.whyNow) : null,
      preferredResearchSignals.researchHypothesis ? promptLine("研究假设：", preferredResearchSignals.researchHypothesis) : null,
      preferredResearchSignals.marketPositionInsight ? promptLine("位置判断：", preferredResearchSignals.marketPositionInsight) : null,
      preferredResearchSignals.historicalTurningPoint ? promptLine("历史转折：", preferredResearchSignals.historicalTurningPoint) : null,
      sourceCoverage?.note ? promptLine("研究充分度：", String(sourceCoverage.note).trim()) : null,
      "要求：没有研究支撑的绝对判断要收紧；优先把‘为什么走到现在’和‘为什么它与同类不同’写清楚。",
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "audienceAnalysis") {
    const selection = getAudienceSelection(payload);
    const selectedSegment = getRecordArray(payload.readerSegments).find(
      (segment) => String(segment.label || "").trim() === selection?.selectedReaderLabel,
    );
    const readerSegments = (selectedSegment ? [selectedSegment] : getRecordArray(payload.readerSegments).slice(0, 3))
      .map((segment) =>
        formatPromptTemplate("人群：{{label}}；痛点：{{painPoint}}；动机：{{motivation}}；语气：{{tone}}", {
          label: String(segment.label || "").trim() || "未命名读者",
          painPoint: String(segment.painPoint || "").trim() || "暂无",
          motivation: String(segment.motivation || "").trim() || "暂无",
          tone: String(segment.preferredTone || "").trim() || "暂无",
        }),
      );
    const languageGuidance = selection?.selectedLanguageGuidance
      ? [selection.selectedLanguageGuidance]
      : getStringArray(payload.languageGuidance, 5);
    const backgroundAwareness = selection?.selectedBackgroundAwareness
      ? [selection.selectedBackgroundAwareness]
      : getStringArray(payload.backgroundAwarenessOptions, 4);
    const readabilityLevel = selection?.selectedReadabilityLevel
      ? [selection.selectedReadabilityLevel]
      : getStringArray(payload.readabilityOptions, 4);
    const warnings = getStringArray(payload.contentWarnings, 5);
    return [
      "请根据以下受众分析重写全文，但不要改动核心事实，不要新增未经验证的信息。",
      selection?.selectedReaderLabel
        ? promptLine("已确认目标读者：", selection.selectedReaderLabel)
        : String(payload.coreReaderLabel || "").trim()
          ? promptLine("核心受众：", String(payload.coreReaderLabel).trim())
          : null,
      readerSegments.length ? promptLine("重点人群：", readerSegments.join(" | ")) : null,
      languageGuidance.length ? promptLine("表达方式：", languageGuidance.join("；")) : null,
      backgroundAwareness.length ? promptLine("背景预设：", backgroundAwareness.join("；")) : null,
      readabilityLevel.length ? promptLine("语言通俗度：", readabilityLevel.join("；")) : null,
      warnings.length ? promptLine("写作限制：", warnings.join("；")) : null,
      selection?.selectedCallToAction
        ? promptLine("结尾动作：", selection.selectedCallToAction)
        : String(payload.recommendedCallToAction || "").trim()
          ? promptLine("结尾动作：", String(payload.recommendedCallToAction).trim())
          : null,
      "要求：增强背景解释层次、调整表达通俗度、让正文更贴近目标读者，但保留当前主题判断。",
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "outlinePlanning") {
    const selection = getOutlineSelection(payload);
    const researchBackbone = normalizeRecord(payload.researchBackbone);
    const sections = getRecordArray(payload.outlineSections)
      .slice(0, 6)
      .map((section, index) =>
        [
          promptLine(String(index + 1) + ". ", String(section.heading || "").trim() || ("章节" + String(index + 1))),
          String(section.goal || "").trim() ? promptLine("目标：", String(section.goal).trim()) : null,
          getStringArray(section.keyPoints, 4).length ? promptLine("关键点：", getStringArray(section.keyPoints, 4).join("；")) : null,
          getStringArray(section.evidenceHints, 4).length ? promptLine("证据提示：", getStringArray(section.evidenceHints, 4).join("；")) : null,
          String(section.researchFocus || "").trim() ? promptLine("研究焦点：", String(section.researchFocus).trim()) : null,
          String(section.researchAnchor || "").trim() ? promptLine("研究锚点：", String(section.researchAnchor).trim()) : null,
          String(section.transition || "").trim() ? promptLine("衔接：", String(section.transition).trim()) : null,
        ].filter(Boolean).join("\n"),
      );
    return [
      "请按照下面的大纲规划重组整篇正文，输出完整 Markdown。",
      selection?.selectedTitle
        ? promptLine(
            "采用标题：",
            formatPromptTemplate("{{title}}{{stylePart}}", {
              title: selection.selectedTitle,
              stylePart: selection.selectedTitleStyle ? "（" + selection.selectedTitleStyle + "）" : "",
            }),
          )
        : String(payload.workingTitle || "").trim()
          ? promptLine("采用标题：", String(payload.workingTitle).trim())
          : null,
      String(payload.centralThesis || "").trim() ? promptLine("核心观点：", String(payload.centralThesis).trim()) : null,
      selection?.selectedOpeningHook
        ? promptLine("开头策略：", selection.selectedOpeningHook)
        : String(payload.openingHook || "").trim()
          ? promptLine("开头策略：", String(payload.openingHook).trim())
          : null,
      selection?.selectedTargetEmotion
        ? promptLine("目标情绪：", selection.selectedTargetEmotion)
        : String(payload.targetEmotion || "").trim()
          ? promptLine("目标情绪：", String(payload.targetEmotion).trim())
          : null,
      researchBackbone
        ? [
            String(researchBackbone.openingTimelineAnchor || "").trim() ? promptLine("开场历史节点：", String(researchBackbone.openingTimelineAnchor).trim()) : null,
            String(researchBackbone.middleComparisonAnchor || "").trim() ? promptLine("中段横向比较：", String(researchBackbone.middleComparisonAnchor).trim()) : null,
            String(researchBackbone.coreInsightAnchor || "").trim() ? promptLine("核心交汇洞察：", String(researchBackbone.coreInsightAnchor).trim()) : null,
            String(researchBackbone.sequencingNote || "").trim() ? promptLine("排序理由：", String(researchBackbone.sequencingNote).trim()) : null,
          ].filter(Boolean).join("\n")
        : null,
      sections.length ? promptBlock("大纲结构：", sections.join("\n\n")) : null,
      selection?.selectedEndingStrategy
        ? promptLine("结尾策略：", selection.selectedEndingStrategy)
        : String(payload.endingStrategy || "").trim()
          ? promptLine("结尾策略：", String(payload.endingStrategy).trim())
          : null,
      "要求：保留原有可用事实，调整段落顺序与层次，必要时补充小标题，但不要空泛扩写。",
    ].filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "deepWriting") {
    const applyTemplate =
      WRITING_EVAL_APPLY_COMMAND_TEMPLATES.find((item) => item.code === String(options?.templateCode || "").trim()) ??
      WRITING_EVAL_APPLY_COMMAND_TEMPLATES.find((item) => item.code === "deep_default_v1") ??
      null;
    const templateMode = String(applyTemplate?.config.mode || "default").trim();
    const templateIntro = String(applyTemplate?.config.intro || "请直接输出完整 Markdown 正文，不要解释，不要列步骤。").trim();
    const sections = getRecordArray(payload.sectionBlueprint)
      .slice(0, 6)
      .map((section, index) =>
        [
          promptLine(String(index + 1) + ". ", String(section.heading || "").trim() || ("章节 " + String(index + 1))),
          String(section.goal || "").trim() ? promptLine("目标：", String(section.goal).trim()) : null,
          String(section.paragraphMission || "").trim() ? promptLine("段落任务：", String(section.paragraphMission).trim()) : null,
          getStringArray(section.evidenceHints, 4).length ? promptLine("证据提示：", getStringArray(section.evidenceHints, 4).join("；")) : null,
          String(section.revealRole || "").trim() ? promptLine("节奏角色：", String(section.revealRole).trim()) : null,
          String(section.transition || "").trim() ? promptLine("衔接：", String(section.transition).trim()) : null,
        ].filter(Boolean).join("\n"),
      );
    const historyReferencePlan = getRecordArray(payload.historyReferencePlan)
      .slice(0, 2)
      .map((item) =>
        formatPromptTemplate("旧文：{{title}}{{useWhenPart}}{{bridgePart}}", {
          title: String(item.title || "").trim() || "未命名旧文",
          useWhenPart: String(item.useWhen || "").trim() ? "；使用时机：" + String(item.useWhen).trim() : "",
          bridgePart: String(item.bridgeSentence || "").trim() ? "；桥接句：" + String(item.bridgeSentence).trim() : "",
        }),
      );
    const coreLines = [
      String(payload.selectedTitle || "").trim() ? promptLine("采用标题：", String(payload.selectedTitle).trim()) : null,
      String(payload.centralThesis || "").trim() ? promptLine("核心观点：", String(payload.centralThesis).trim()) : null,
      String(payload.writingAngle || "").trim() ? promptLine("写作角度：", String(payload.writingAngle).trim()) : null,
      String(payload.articlePrototypeLabel || "").trim()
        ? promptLine(
            "文章原型：",
            formatPromptTemplate("{{label}}{{prototypePart}}", {
              label: String(payload.articlePrototypeLabel).trim(),
              prototypePart: String(payload.articlePrototype || "").trim() ? "（" + String(payload.articlePrototype).trim() + "）" : "",
            }),
          )
        : null,
      String(payload.articlePrototypeReason || "").trim() ? promptLine("原型原因：", String(payload.articlePrototypeReason).trim()) : null,
      String(payload.stateVariantLabel || "").trim() ? promptLine("状态变体：", String(payload.stateVariantLabel).trim()) : null,
      String(payload.stateVariantReason || "").trim() ? promptLine("切换原因：", String(payload.stateVariantReason).trim()) : null,
      String(payload.researchFocus || "").trim() ? promptLine("研究焦点：", String(payload.researchFocus).trim()) : null,
      String(payload.researchLens || "").trim() ? promptLine("研究镜头：", String(payload.researchLens).trim()) : null,
      String(payload.openingStrategy || "").trim() ? promptLine("开头策略：", String(payload.openingStrategy).trim()) : null,
      String(payload.openingMove || "").trim() ? promptLine("起手动作：", String(payload.openingMove).trim()) : null,
      String(payload.targetEmotion || "").trim() ? promptLine("目标情绪：", String(payload.targetEmotion).trim()) : null,
      String(payload.endingStrategy || "").trim() ? promptLine("结尾策略：", String(payload.endingStrategy).trim()) : null,
    ];
    const structureLines = [
      String(payload.sectionRhythm || "").trim() ? promptLine("章节节奏：", String(payload.sectionRhythm).trim()) : null,
      String(payload.progressiveRevealLabel || "").trim() ? promptLine("节奏插件：", String(payload.progressiveRevealLabel).trim()) : null,
      String(payload.progressiveRevealReason || "").trim() ? promptLine("启用原因：", String(payload.progressiveRevealReason).trim()) : null,
      String(payload.climaxPlacement || "").trim() ? promptLine("高潮位置：", String(payload.climaxPlacement).trim()) : null,
      sections.length ? promptBlock("写作结构：", sections.join("\n\n")) : null,
      historyReferencePlan.length ? promptLine("历史文章自然引用：", historyReferencePlan.join(" | ")) : null,
    ];
    const constraintLines = [
      String(payload.diversitySummary || "").trim() ? promptLine("去重约束：", String(payload.diversitySummary).trim()) : null,
      getStringArray(payload.diversitySuggestions, 4).length ? promptLine("去重动作：", getStringArray(payload.diversitySuggestions, 4).join("；")) : null,
      String(payload.evidenceMode || "").trim() ? promptLine("证据组织：", String(payload.evidenceMode).trim()) : null,
      String(payload.escalationRule || "").trim() ? promptLine("升番规则：", String(payload.escalationRule).trim()) : null,
      getRecordArray(payload.progressiveRevealSteps).length
        ? promptLine(
            "逐层推进：",
            getRecordArray(payload.progressiveRevealSteps)
              .map((item) =>
                formatPromptTemplate("{{label}}:{{instruction}}", {
                  label: String(item.label || "").trim(),
                  instruction: String(item.instruction || "").trim(),
                }),
              )
              .filter(Boolean)
              .join("；"),
          )
        : null,
      getStringArray(payload.stateChecklist, 6).length ? promptLine("状态自检：", getStringArray(payload.stateChecklist, 6).join("；")) : null,
      getStringArray(payload.mustUseFacts, 6).length ? promptLine("必须吃透的事实：", getStringArray(payload.mustUseFacts, 6).join("；")) : null,
      getStringArray(payload.voiceChecklist, 6).length ? promptLine("表达约束：", getStringArray(payload.voiceChecklist, 6).join("；")) : null,
      getStringArray(payload.bannedWordWatchlist, 8).length ? promptLine("重点避开这些语言守卫词：", getStringArray(payload.bannedWordWatchlist, 8).join("、")) : null,
      getStringArray(payload.finalChecklist, 6).length ? promptLine("终稿自检：", getStringArray(payload.finalChecklist, 6).join("；")) : null,
    ];
    const orderedLines =
      templateMode === "structure_first"
        ? [templateIntro, ...structureLines, ...coreLines, ...constraintLines]
        : templateMode === "constraints_first"
          ? [templateIntro, ...constraintLines, ...coreLines, ...structureLines]
          : [templateIntro, ...coreLines, ...structureLines, ...constraintLines];
    return orderedLines.filter(Boolean).join("\n");
  }

  if (artifact.stageCode === "factCheck") {
    const checks = getRecordArray(payload.checks)
      .slice(0, 6)
      .map((check) =>
        formatPromptTemplate("表述：{{claim}}；状态：{{status}}；处理：{{suggestion}}", {
          claim: String(check.claim || "").trim() || "未命名核查项",
          status: String(check.status || "").trim() || "needs_source",
          suggestion: String(check.suggestion || "").trim() || "请改写为更稳妥的表达",
        }),
      );
    const evidenceCards = getRecordArray(payload.evidenceCards)
      .slice(0, 4)
      .map((card, index) => {
        const supportingEvidence = getRecordArray(card.supportingEvidence)
          .slice(0, 2)
          .map((item) =>
            [
              promptLine("证据：", String(item.title || "").trim() || "未命名证据"),
              String(item.excerpt || "").trim() ? promptLine("摘要：", String(item.excerpt).trim()) : null,
              String(item.sourceUrl || "").trim() ? promptLine("链接：", String(item.sourceUrl).trim()) : null,
            ].filter(Boolean).join("\n"),
          );
        const counterEvidence = getRecordArray(card.counterEvidence)
          .slice(0, 2)
          .map((item) =>
            [
              promptLine("反证：", String(item.title || "").trim() || "未命名反证"),
              String(item.excerpt || "").trim() ? promptLine("摘要：", String(item.excerpt).trim()) : null,
              String(item.sourceUrl || "").trim() ? promptLine("链接：", String(item.sourceUrl).trim()) : null,
            ].filter(Boolean).join("\n"),
          );
        return [
          promptLine(String(index + 1) + ". 表述：", String(card.claim || "").trim() || "未命名核查项"),
          promptLine("证据强度：", String(card.supportLevel || "").trim() || "missing"),
          supportingEvidence.length ? promptBlock("支持证据：", supportingEvidence.join("\n\n")) : "支持证据：暂无",
          counterEvidence.length ? promptBlock("反向证据：", counterEvidence.join("\n\n")) : "反向证据：暂无",
        ].join("\n");
      });
    const missingEvidence = getStringArray(payload.missingEvidence, 6);
    const researchReview = normalizeRecord(payload.researchReview);
    return [
      "请根据以下事实核查结果改写全文，输出完整 Markdown。",
      String(payload.summary || "").trim() ? promptLine("核查摘要：", String(payload.summary).trim()) : null,
      checks.length ? promptLine("逐项处理：", checks.join(" | ")) : null,
      evidenceCards.length ? promptBlock("证据摘要卡：", evidenceCards.join("\n\n")) : null,
      missingEvidence.length ? promptLine("待补证据：", missingEvidence.join("；")) : null,
      researchReview?.summary ? promptLine("研究支撑复核：", String(researchReview.summary).trim()) : null,
      researchReview
        ? [
            String(researchReview.sourceCoverage || "").trim() ? promptLine("信源覆盖：", String(researchReview.sourceCoverage).trim()) : null,
            String(researchReview.timelineSupport || "").trim() ? promptLine("纵向脉络：", String(researchReview.timelineSupport).trim()) : null,
            String(researchReview.comparisonSupport || "").trim() ? promptLine("横向比较：", String(researchReview.comparisonSupport).trim()) : null,
            String(researchReview.intersectionSupport || "").trim() ? promptLine("交汇洞察：", String(researchReview.intersectionSupport).trim()) : null,
          ].filter(Boolean).join("；")
        : null,
      getStringArray(researchReview?.gaps, 4).length ? promptLine("研究层缺口：", getStringArray(researchReview?.gaps, 4).join("；")) : null,
      String(payload.personaAlignment || "").trim() ? promptLine("人设提醒：", String(payload.personaAlignment).trim()) : null,
      String(payload.topicAlignment || "").trim() ? promptLine("主题提醒：", String(payload.topicAlignment).trim()) : null,
      "要求：没有证据的绝对化表述改成判断语气；高风险数字、时间、案例请弱化或删除；研究层缺口不能靠修辞硬补，要把缺的纵向、横向或交汇支撑明确收紧。",
    ].filter(Boolean).join("\n");
  }

  const issues = getRecordArray(payload.issues)
    .slice(0, 6)
    .map((issue) =>
      [
        promptLine("问题：", String(issue.type || "").trim() || "未命名问题"),
        String(issue.example || "").trim() ? promptLine("示例：", String(issue.example).trim()) : null,
        promptLine("建议：", String(issue.suggestion || "").trim() || "请直接改得更清晰有力"),
      ].filter(Boolean).join("\n"),
    );
  const strengths = getStringArray(payload.strengths, 4);
  const punchlines = getStringArray(payload.punchlines, 4);
  const rhythmAdvice = getStringArray(payload.rhythmAdvice, 4);
  return [
    "请根据以下文笔润色建议重写全文，输出完整 Markdown。",
    strengths.length ? promptLine("保留优点：", strengths.join("；")) : null,
    String(payload.overallDiagnosis || "").trim() ? promptLine("整体诊断：", String(payload.overallDiagnosis).trim()) : null,
    issues.length ? promptBlock("重点修改：", issues.join("\n\n")) : null,
    String(payload.rewrittenLead || "").trim() ? promptLine("首段建议：", String(payload.rewrittenLead).trim()) : null,
    punchlines.length ? promptLine("金句候选：", punchlines.join("；")) : null,
    rhythmAdvice.length ? promptLine("节奏建议：", rhythmAdvice.join("；")) : null,
    "要求：主要优化语言节奏、句子力度和开头抓力，不改变文章主旨与事实边界。",
  ].filter(Boolean).join("\n");
}
