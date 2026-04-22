import {
  ARTICLE_MAIN_STEP_DEFINITIONS,
  getArticleMainStepDefinitionByStageCode,
} from "@/lib/article-workflow-registry";
import {
  buildFourPointAudit,
  getHumanSignalCompletion,
  getHumanSignalScore,
  getStrategyCardCompletion,
} from "@/lib/article-strategy";
import { getStrategyDraftValue } from "@/lib/article-workspace-helpers";

export type KnowledgeCardPanelItem = {
  id: number;
  userId: number;
  ownerUsername: string | null;
  shared: boolean;
  cardType: string;
  title: string;
  summary: string | null;
  latestChangeSummary: string | null;
  overturnedJudgements: string[];
  keyFacts: string[];
  openQuestions: string[];
  conflictFlags: string[];
  sourceFragmentIds: number[];
  relatedCardIds: number[];
  relatedCards: Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number; summary: string | null; shared: boolean; ownerUsername: string | null; linkType: string }>;
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  relevanceScore: number;
  matchedFragmentCount: number;
};

export type StrategyCardItem = {
  id: number;
  articleId: number;
  userId: number;
  archetype: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief: string | null;
  targetReader: string | null;
  coreAssertion: string | null;
  whyNow: string | null;
  researchHypothesis: string | null;
  marketPositionInsight: string | null;
  historicalTurningPoint: string | null;
  targetPackage: string | null;
  publishWindow: string | null;
  endingAction: string | null;
  firstHandObservation: string | null;
  feltMoment: string | null;
  whyThisHitMe: string | null;
  realSceneOrDialogue: string | null;
  wantToComplain: string | null;
  nonDelegableTruth: string | null;
  fourPointAudit: Record<string, unknown> | null;
  strategyLockedAt: string | null;
  strategyOverride: boolean;
  createdAt: string;
  updatedAt: string;
  completion: {
    archetype: boolean;
    targetReader: boolean;
    coreAssertion: boolean;
    whyNow: boolean;
    targetPackage: boolean;
    publishWindow: boolean;
    endingAction: boolean;
  };
  humanSignalCompletion: {
    firstHandObservation: boolean;
    feltMoment: boolean;
    whyThisHitMe: boolean;
    realSceneOrDialogue: boolean;
    wantToComplain: boolean;
    nonDelegableTruth: boolean;
  };
  humanSignalScore: number;
  whyNowHints: string[];
};

export type EvidenceItem = {
  id: number;
  articleId: number;
  userId: number;
  fragmentId: number | null;
  nodeId: number | null;
  claim: string | null;
  title: string;
  excerpt: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  usageMode: string | null;
  rationale: string | null;
  researchTag: string | null;
  hookTags: string[];
  hookStrength: number | null;
  hookTaggedBy: string | null;
  hookTaggedAt: string | null;
  evidenceRole: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type StageArtifactItem = {
  stageCode: string;
  title: string;
  status: "ready" | "failed";
  summary: string | null;
  payload: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleFragmentItem = {
  id: number;
  title?: string | null;
  distilledContent: string;
  sourceType?: string;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string;
  shared?: boolean;
};

export type OutlineMaterialNodeItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: ArticleFragmentItem[];
};

export type PendingPublishIntent = {
  articleId: number;
  createdAt: string;
  templateId: string | null;
  reason: "missing_connection" | "auth_failed";
};

export type ExternalFetchIssueRecord = {
  id: string;
  articleId: number | null;
  context: "fact-check-evidence";
  title: string | null;
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
  createdAt: string;
  resolvedAt: string | null;
  recoveryCount: number;
};

export const PENDING_PUBLISH_INTENT_STORAGE_KEY = "huoziwriter.pendingPublishIntent";
const FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX = "huoziwriter.factCheckFetchIssues";
const RESEARCH_GUARD_CHECK_KEYS = new Set([
  "researchBrief",
  "researchSourceCoverage",
  "researchTimeline",
  "researchComparison",
  "researchIntersection",
  "counterEvidence",
]);

export const ARTICLE_MAIN_STEPS = ARTICLE_MAIN_STEP_DEFINITIONS;

export async function parseResponseMessage(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text || "请求失败";
  }
}

export async function parseResponsePayload(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      data?: Record<string, unknown>;
    };
    return {
      message: json.message || json.error || text || "请求失败",
      data: json.data,
    };
  } catch {
    return {
      message: text || "请求失败",
      data: null as Record<string, unknown> | null,
    };
  }
}

export function buildStrategyCardItem(input: {
  base?: Partial<StrategyCardItem> | null;
  archetype?: string | null;
  mainstreamBelief?: string;
  targetReader: string;
  coreAssertion: string;
  whyNow: string;
  researchHypothesis: string;
  marketPositionInsight: string;
  historicalTurningPoint: string;
  targetPackage: string;
  publishWindow: string;
  endingAction: string;
  firstHandObservation: string;
  feltMoment: string;
  whyThisHitMe: string;
  realSceneOrDialogue: string;
  wantToComplain: string;
  nonDelegableTruth: string;
  whyNowHints?: string[];
}) {
  const targetReader = getStrategyDraftValue(input.targetReader);
  const coreAssertion = getStrategyDraftValue(input.coreAssertion);
  const whyNow = getStrategyDraftValue(input.whyNow);
  const archetype =
    input.archetype === "opinion" || input.archetype === "case" || input.archetype === "howto" || input.archetype === "hotTake" || input.archetype === "phenomenon"
      ? input.archetype
      : input.base?.archetype ?? null;
  const mainstreamBelief = getStrategyDraftValue(input.mainstreamBelief ?? input.base?.mainstreamBelief ?? "");
  const researchHypothesis = getStrategyDraftValue(input.researchHypothesis);
  const marketPositionInsight = getStrategyDraftValue(input.marketPositionInsight);
  const historicalTurningPoint = getStrategyDraftValue(input.historicalTurningPoint);
  const targetPackage = getStrategyDraftValue(input.targetPackage);
  const publishWindow = getStrategyDraftValue(input.publishWindow);
  const endingAction = getStrategyDraftValue(input.endingAction);
  const firstHandObservation = getStrategyDraftValue(input.firstHandObservation);
  const feltMoment = getStrategyDraftValue(input.feltMoment);
  const whyThisHitMe = getStrategyDraftValue(input.whyThisHitMe);
  const realSceneOrDialogue = getStrategyDraftValue(input.realSceneOrDialogue);
  const wantToComplain = getStrategyDraftValue(input.wantToComplain);
  const nonDelegableTruth = getStrategyDraftValue(input.nonDelegableTruth);
  const completion = getStrategyCardCompletion({
    archetype,
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
  });
  const humanSignalCompletion = getHumanSignalCompletion({
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
  });

  return {
    id: Number(input.base?.id || 0),
    articleId: Number(input.base?.articleId || 0),
    userId: Number(input.base?.userId || 0),
    archetype,
    mainstreamBelief,
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
    fourPointAudit:
      input.base?.fourPointAudit
      ?? buildFourPointAudit({
        archetype,
        mainstreamBelief,
        targetReader,
        coreAssertion,
        whyNow,
        researchHypothesis,
        marketPositionInsight,
        historicalTurningPoint,
        targetPackage,
        publishWindow,
        endingAction,
        firstHandObservation,
        feltMoment,
        whyThisHitMe,
        realSceneOrDialogue,
        wantToComplain,
        nonDelegableTruth,
      }),
    strategyLockedAt: input.base?.strategyLockedAt || null,
    strategyOverride: Boolean(input.base?.strategyOverride),
    createdAt: input.base?.createdAt || new Date().toISOString(),
    updatedAt: input.base?.updatedAt || new Date().toISOString(),
    completion,
    humanSignalCompletion,
    humanSignalScore: getHumanSignalScore({
      firstHandObservation,
      feltMoment,
      whyThisHitMe,
      realSceneOrDialogue,
      wantToComplain,
      nonDelegableTruth,
    }),
    whyNowHints: input.whyNowHints ?? input.base?.whyNowHints ?? [],
  } satisfies StrategyCardItem;
}

export function buildEvidenceItemSignature(item: Partial<EvidenceItem>) {
  return JSON.stringify({
    fragmentId: Number(item.fragmentId || 0) || 0,
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getStrategyDraftValue(item.claim),
    title: getStrategyDraftValue(item.title),
    excerpt: getStrategyDraftValue(item.excerpt),
    sourceType: getStrategyDraftValue(item.sourceType),
    sourceUrl: getStrategyDraftValue(item.sourceUrl),
    screenshotPath: getStrategyDraftValue(item.screenshotPath),
    usageMode: getStrategyDraftValue(item.usageMode),
    rationale: getStrategyDraftValue(item.rationale),
    researchTag: getStrategyDraftValue(item.researchTag),
    hookTags: Array.isArray(item.hookTags) ? item.hookTags : [],
    hookStrength: item.hookStrength ?? null,
    evidenceRole: getStrategyDraftValue(item.evidenceRole),
  });
}

export function readPendingPublishIntent(articleId: number): PendingPublishIntent | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingPublishIntent | null;
    const storedArticleId = typeof parsed?.articleId === "number" ? parsed.articleId : null;
    if (!parsed || storedArticleId !== articleId) {
      return null;
    }
    return {
      articleId: storedArticleId,
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      templateId: parsed.templateId ? String(parsed.templateId) : null,
      reason: String((parsed as { reason?: string | null }).reason || "") === "missing_connection" ? "missing_connection" : "auth_failed",
    };
  } catch {
    return null;
  }
}

export function buildFactCheckFetchIssuesStorageKey(articleId: number) {
  return `${FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX}.${articleId}`;
}

export function normalizeExternalFetchIssueRecord(
  value: unknown,
  expectedContext: ExternalFetchIssueRecord["context"],
  articleId?: number | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const url = String(item.url || "").trim();
  const degradedReason = String(item.degradedReason || "").trim();
  if (!url || !degradedReason) {
    return null;
  }
  return {
    id: String(item.id || `${expectedContext}-${url}-${item.createdAt || ""}`),
    articleId:
      articleId === undefined
        ? item.articleId == null
          ? null
          : Number.isInteger(Number(item.articleId))
            ? Number(item.articleId)
            : null
        : articleId,
    context: expectedContext,
    title: item.title ? String(item.title).trim() : null,
    url,
    degradedReason,
    retryRecommended: Boolean(item.retryRecommended),
    createdAt: String(item.createdAt || new Date().toISOString()),
    resolvedAt: item.resolvedAt ? String(item.resolvedAt) : null,
    recoveryCount: Math.max(0, Number(item.recoveryCount || 0) || 0),
  } satisfies ExternalFetchIssueRecord;
}

export function readExternalFetchIssues(
  storageKey: string,
  expectedContext: ExternalFetchIssueRecord["context"],
  articleId?: number | null,
) {
  if (typeof window === "undefined") {
    return [] as ExternalFetchIssueRecord[];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [] as ExternalFetchIssueRecord[];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as ExternalFetchIssueRecord[];
    }
    return parsed
      .map((item) => normalizeExternalFetchIssueRecord(item, expectedContext, articleId))
      .filter((item): item is ExternalFetchIssueRecord => Boolean(item))
      .slice(0, 8);
  } catch {
    return [] as ExternalFetchIssueRecord[];
  }
}

export function writeExternalFetchIssues(storageKey: string, issues: ExternalFetchIssueRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(issues.slice(0, 8)));
}

export function prependExternalFetchIssue(
  current: ExternalFetchIssueRecord[],
  next: Omit<ExternalFetchIssueRecord, "id" | "createdAt" | "resolvedAt" | "recoveryCount">,
) {
  const createdAt = new Date().toISOString();
  const issue = {
    ...next,
    id: `${next.context}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    resolvedAt: null,
    recoveryCount: 0,
  } satisfies ExternalFetchIssueRecord;
  return [
    issue,
    ...current.filter((item) => !(item.context === issue.context && item.url === issue.url && item.degradedReason === issue.degradedReason)),
  ].slice(0, 8);
}

export function removeExternalFetchIssue(current: ExternalFetchIssueRecord[], issueId: string) {
  return current.filter((item) => item.id !== issueId);
}

export function markExternalFetchIssueRecovered(
  current: ExternalFetchIssueRecord[],
  input: { context: ExternalFetchIssueRecord["context"]; url: string },
) {
  let recovered = false;
  const next = current.map((item) => {
    if (recovered || item.context !== input.context || item.url !== input.url) {
      return item;
    }
    recovered = true;
    return {
      ...item,
      resolvedAt: new Date().toISOString(),
      recoveryCount: item.recoveryCount + 1,
    } satisfies ExternalFetchIssueRecord;
  });
  return {
    issues: next,
    recovered,
  };
}

export function upsertStageArtifact(items: StageArtifactItem[], next: StageArtifactItem) {
  const filtered = items.filter((item) => item.stageCode !== next.stageCode);
  return [next, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function upsertKnowledgeCard(items: KnowledgeCardPanelItem[], next: KnowledgeCardPanelItem) {
  return [next, ...items.filter((item) => item.id !== next.id)];
}

export function reorderKnowledgeCards(items: KnowledgeCardPanelItem[], highlightedId: number | null) {
  if (!highlightedId) {
    return items;
  }
  const highlighted = items.find((item) => item.id === highlightedId);
  if (!highlighted) {
    return items;
  }
  return [highlighted, ...items.filter((item) => item.id !== highlightedId)];
}

export function buildHighlightedKnowledgeCard(
  detail: Partial<KnowledgeCardPanelItem> & { id: number; title: string },
  fallback?: KnowledgeCardPanelItem | null,
) {
  return {
    id: detail.id,
    userId: typeof detail.userId === "number" ? detail.userId : fallback?.userId ?? 0,
    ownerUsername: detail.ownerUsername ?? fallback?.ownerUsername ?? null,
    shared: typeof detail.shared === "boolean" ? detail.shared : fallback?.shared ?? false,
    cardType: detail.cardType ?? fallback?.cardType ?? "topic",
    title: detail.title,
    summary: detail.summary ?? fallback?.summary ?? null,
    latestChangeSummary: detail.latestChangeSummary ?? fallback?.latestChangeSummary ?? null,
    overturnedJudgements: Array.isArray(detail.overturnedJudgements) ? detail.overturnedJudgements : fallback?.overturnedJudgements ?? [],
    keyFacts: Array.isArray(detail.keyFacts) ? detail.keyFacts : fallback?.keyFacts ?? [],
    openQuestions: Array.isArray(detail.openQuestions) ? detail.openQuestions : fallback?.openQuestions ?? [],
    conflictFlags: Array.isArray(detail.conflictFlags) ? detail.conflictFlags : fallback?.conflictFlags ?? [],
    sourceFragmentIds: Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds : fallback?.sourceFragmentIds ?? [],
    relatedCardIds: Array.isArray(detail.relatedCardIds) ? detail.relatedCardIds : fallback?.relatedCardIds ?? [],
    relatedCards: Array.isArray(detail.relatedCards) ? detail.relatedCards : fallback?.relatedCards ?? [],
    sourceFragments: Array.isArray(detail.sourceFragments) ? detail.sourceFragments : fallback?.sourceFragments ?? [],
    confidenceScore: typeof detail.confidenceScore === "number" ? detail.confidenceScore : fallback?.confidenceScore ?? 0,
    status: detail.status ?? fallback?.status ?? "draft",
    lastCompiledAt: detail.lastCompiledAt ?? fallback?.lastCompiledAt ?? null,
    relevanceScore: typeof detail.relevanceScore === "number" ? detail.relevanceScore : fallback?.relevanceScore ?? 1,
    matchedFragmentCount:
      typeof detail.matchedFragmentCount === "number"
        ? detail.matchedFragmentCount
        : fallback?.matchedFragmentCount ?? (Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds.length : 0),
  } satisfies KnowledgeCardPanelItem;
}

export function getArticleMainStepByStageCode(stageCode: string) {
  return getArticleMainStepDefinitionByStageCode(stageCode);
}

export function isResearchGuardCheckKey(value: string) {
  return RESEARCH_GUARD_CHECK_KEYS.has(value);
}

export function normalizeOutlineMaterialNode(node: {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: Array<{
    id: number;
    title?: string | null;
    distilledContent: string;
    sourceType?: string;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string;
    shared?: boolean;
  }>;
}): OutlineMaterialNodeItem {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    sortOrder: node.sortOrder,
    fragments: node.fragments.map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
      usageMode: fragment.usageMode,
      shared: fragment.shared,
    })),
  };
}

export function getStageApplyButtonLabel(stageCode: string) {
  if (stageCode === "factCheck") {
    return "精修高风险句子";
  }
  if (stageCode === "prosePolish") {
    return "精修句段节奏";
  }
  return "一键应用回正文";
}

export function extractPlainText(value: string) {
  return String(value || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
