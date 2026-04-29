import { getAuthorOutcomeFeedbackLedger } from "./author-outcome-feedback-ledger";
import { getArticleNodes } from "./article-outline";
import { suggestArticleHistoryReferences } from "./article-history-references";
import { getRelevantKnowledgeCardsForArticle } from "./knowledge";
import { buildRetrievalQueryContext, scoreUnifiedRetrievalCandidate } from "./retrieval-ranking";
import { getArticleById, getArticleStrategyCard, getFragmentsByUser } from "./repositories";
import { getSeriesById } from "./series";
import { buildXEvidenceBoard, type XEvidenceBoard } from "./x-evidence-board";

type OutlineNodeContext = {
  title: string;
  description: string | null;
};

type EvidenceFragmentContext = {
  id: number;
  title: string | null;
  rawContent: string | null;
  distilledContent: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  sourceMeta: Record<string, unknown> | null;
  usageMode: string;
};

type KnowledgeCardContext = {
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
};

type SeriesInsightContext = {
  label: string | null;
  reason: string | null;
  commonTerms: string[];
  coreStances: string[];
  driftRisks: string[];
  backgroundChecklist: string[];
  whyNow: string[];
  preHook: string | null;
  postHook: string | null;
  platformPreference: string | null;
  targetPackHint: string | null;
  defaultArchetype: string | null;
  defaultLayoutTemplateId: string | null;
  rhythmOverride: Record<string, unknown> | null;
  relatedArticleCount: number;
};

type HumanSignalContext = {
  firstHandObservation: string | null;
  feltMoment: string | null;
  whyThisHitMe: string | null;
  realSceneOrDialogue: string | null;
  wantToComplain: string | null;
  nonDelegableTruth: string | null;
  score: number;
};

function isXEvidenceFragment(fragment: EvidenceFragmentContext) {
  if (String(fragment.sourceType || "").trim().toLowerCase() === "x-hotspot") {
    return true;
  }
  const sourceMeta = parseJsonRecord(fragment.sourceMeta);
  const sourceKind = String(sourceMeta?.sourceKind || "").trim().toLowerCase();
  return sourceKind === "x_hotspot";
}

async function buildContextXEvidenceBoards(fragments: EvidenceFragmentContext[]) {
  const candidates = fragments
    .filter((fragment) => fragment.usageMode !== "image")
    .filter((fragment) => isXEvidenceFragment(fragment))
    .slice(0, 3);
  if (candidates.length === 0) {
    return [] as XEvidenceBoard[];
  }
  const settled = await Promise.allSettled(
    candidates.map((fragment) =>
      buildXEvidenceBoard({
        title: String(fragment.title || "").trim() || truncateForXEvidenceTopic(fragment.distilledContent),
        summary: fragment.rawContent || fragment.distilledContent,
        sourceUrl: fragment.sourceUrl,
        sourceMeta: fragment.sourceMeta,
      }),
    ),
  );
  const boards: XEvidenceBoard[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") {
      boards.push(item.value as XEvidenceBoard);
    }
  }
  return boards;
}

function truncateForXEvidenceTopic(value: string) {
  const text = String(value || "").trim();
  return text.length <= 80 ? text : `${text.slice(0, 80).trim()}…`;
}

function tokenize(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{3,}/g) ?? []).filter(Boolean)));
}

function toSentenceList(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function parseJsonRecord(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readSourceMetaFromRawPayload(value: unknown) {
  const payload = parseJsonRecord(value);
  return parseJsonRecord(payload?.sourceMeta);
}

function buildSeriesInsight(input: {
  articleTitle: string;
  articleMarkdown: string;
  boundSeries?: {
    name: string;
    thesis: string | null;
    targetAudience: string | null;
    preHook: string | null;
    postHook: string | null;
    platformPreference: string | null;
    targetPackHint: string | null;
    defaultArchetype: string | null;
    defaultLayoutTemplateId: string | null;
    rhythmOverride: Record<string, unknown> | null;
  } | null;
  knowledgeCards: KnowledgeCardContext[];
  historySuggestions: Array<{
    title: string;
    relationReason: string | null;
    consistencyHint: string | null;
    seriesLabel?: string | null;
  }>;
}): SeriesInsightContext | null {
  if (!input.boundSeries && input.historySuggestions.length === 0 && input.knowledgeCards.length === 0) {
    return null;
  }

  const termFrequency = new Map<string, number>();
  for (const value of [
    input.articleTitle,
    input.boundSeries?.name ?? "",
    input.boundSeries?.thesis ?? "",
    ...input.historySuggestions.map((item) => item.title),
    ...input.knowledgeCards.map((item) => item.title),
  ]) {
    for (const token of tokenize(value)) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }
  }

  const commonTerms = Array.from(termFrequency.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([term]) => term)
    .slice(0, 4);

  const leadHistory = input.historySuggestions[0] ?? null;
  const leadCard = input.knowledgeCards[0] ?? null;
  const label = input.boundSeries?.name ? `系列：${input.boundSeries.name}` : leadHistory?.seriesLabel ?? (leadCard ? `主题系列：${leadCard.title}` : null);
  const reason =
    input.boundSeries?.thesis
    ?? leadHistory?.relationReason
    ?? leadCard?.latestChangeSummary
    ?? leadCard?.summary
    ?? null;
  const coreStances = toSentenceList(
    [
      leadHistory?.relationReason,
      input.boundSeries?.thesis,
      ...input.knowledgeCards.map((card) => card.summary),
      ...input.knowledgeCards.flatMap((card) => card.keyFacts.slice(0, 2)),
    ],
    4,
  );
  const driftRisks = toSentenceList(
    [
      ...input.historySuggestions.map((item) => item.consistencyHint),
      input.boundSeries?.targetAudience ? `当前系列目标读者是「${input.boundSeries.targetAudience}」，写作时不要偏离这个受众语境。` : null,
      ...input.knowledgeCards.flatMap((card) => card.overturnedJudgements),
      ...input.knowledgeCards
        .filter((card) => card.status === "conflicted" || card.status === "stale")
        .map((card) => `背景卡「${card.title}」当前状态为 ${card.status === "conflicted" ? "冲突" : "待刷新"}，写作时不要直接沿用旧结论。`),
    ],
    4,
  );
  const backgroundChecklist = toSentenceList(
    [
      ...input.knowledgeCards.flatMap((card) => card.openQuestions),
      input.boundSeries?.targetAudience ? `目标读者：${input.boundSeries.targetAudience}` : null,
      ...input.historySuggestions.map((item) => item.relationReason),
    ],
    4,
  );
  const whyNow = toSentenceList(
    [
      ...input.knowledgeCards.map((card) => card.latestChangeSummary),
      ...input.knowledgeCards.flatMap((card) => card.overturnedJudgements),
      input.boundSeries?.thesis ? `这篇稿件归属「${input.boundSeries.name}」，正文要继续服务这个系列的核心判断。` : null,
      input.articleMarkdown.trim()
        ? `当前正文已经落到这个系列里，继续写时要明确这次新增变量与旧判断的关系。`
        : "当前还没展开正文，适合先把这次新增变量与旧判断差异写清楚。",
    ],
    4,
  );

  return {
    label,
    reason,
    commonTerms,
    coreStances,
    driftRisks,
    backgroundChecklist,
    whyNow,
    preHook: input.boundSeries?.preHook ?? null,
    postHook: input.boundSeries?.postHook ?? null,
    platformPreference: input.boundSeries?.platformPreference ?? null,
    targetPackHint: input.boundSeries?.targetPackHint ?? null,
    defaultArchetype: input.boundSeries?.defaultArchetype ?? null,
    defaultLayoutTemplateId: input.boundSeries?.defaultLayoutTemplateId ?? null,
    rhythmOverride: input.boundSeries?.rhythmOverride ?? null,
    relatedArticleCount: input.historySuggestions.length,
  };
}

export async function getArticleWritingContext(input: {
  userId: number;
  articleId: number;
  title: string;
  markdownContent: string;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  const strategyCard = await getArticleStrategyCard(input.articleId, input.userId);
  const boundSeries = article?.series_id ? await getSeriesById(input.userId, article.series_id) : null;
  const nodes = await getArticleNodes(input.articleId);
  const attachedFragments = Array.from(
    new Map(
      nodes
        .flatMap((node) => node.fragments)
        .map((fragment) => [
          fragment.id,
          {
            id: fragment.id,
            title: "title" in fragment ? (fragment.title as string | null) : null,
            rawContent: "rawContent" in fragment ? (fragment.rawContent as string | null) : null,
            distilledContent: fragment.distilledContent,
            sourceType: "sourceType" in fragment ? String(fragment.sourceType || "manual") : "manual",
            sourceUrl: "sourceUrl" in fragment ? (fragment.sourceUrl as string | null) : null,
            screenshotPath: "screenshotPath" in fragment ? (fragment.screenshotPath as string | null) : null,
            sourceMeta: "sourceMeta" in fragment ? (fragment.sourceMeta as Record<string, unknown> | null) : null,
            usageMode: "usageMode" in fragment ? String(fragment.usageMode || "rewrite") : "rewrite",
          },
        ] as const),
    ).entries(),
  ).map(([, fragment]) => fragment);

  const [knowledgeCards, historySuggestions, authorOutcomeFeedbackLedger] = await Promise.all([
    getRelevantKnowledgeCardsForArticle(input.userId, {
      articleTitle: input.title,
      markdownContent: input.markdownContent,
      nodeTitles: nodes.map((node) => node.title),
      attachedFragmentIds: attachedFragments.map((fragment) => fragment.id),
    }),
    suggestArticleHistoryReferences({
      userId: input.userId,
      articleId: input.articleId,
      currentTitle: input.title,
      currentMarkdown: input.markdownContent,
    }),
    getAuthorOutcomeFeedbackLedger({
      userId: input.userId,
      excludeArticleId: input.articleId,
    }),
  ]);

  let fragments = attachedFragments.filter((fragment) => fragment.usageMode !== "image").map((fragment) => fragment.distilledContent);
  let evidenceFragments = attachedFragments;
  if (fragments.length === 0) {
    const query = buildRetrievalQueryContext({
      articleTitle: input.title,
      markdownContent: input.markdownContent,
      nodeTitles: nodes.map((node) => node.title),
    });
    const fallbackFragments = (await getFragmentsByUser(input.userId))
      .map((fragment) => ({
        fragment,
        score: scoreUnifiedRetrievalCandidate(
          query,
          {
            title: fragment.title,
            content: fragment.distilled_content,
            updatedAt: fragment.created_at,
          },
          { recency: 0.5 },
        ).score,
      }))
      .sort((left, right) => right.score - left.score || right.fragment.id - left.fragment.id)
      .map((item) => item.fragment);
    fragments = fallbackFragments
      .filter((fragment) => fragment.source_type !== "screenshot")
      .slice(0, 6)
      .map((fragment) => fragment.distilled_content);
    evidenceFragments = fallbackFragments.slice(0, 8).map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      rawContent: fragment.raw_content,
      distilledContent: fragment.distilled_content,
      sourceType: fragment.source_type,
      sourceUrl: fragment.source_url,
      screenshotPath: fragment.screenshot_path,
      sourceMeta: readSourceMetaFromRawPayload(fragment.raw_payload_json),
      usageMode: fragment.source_type === "screenshot" ? "image" : "rewrite",
    }));
  }

  const normalizedKnowledgeCards = knowledgeCards.map<KnowledgeCardContext>((card) => ({
    id: card.id,
    title: card.title,
    summary: card.summary,
    keyFacts: card.keyFacts,
    openQuestions: card.openQuestions,
    latestChangeSummary: card.latestChangeSummary ?? null,
    overturnedJudgements: Array.isArray(card.overturnedJudgements) ? card.overturnedJudgements : [],
    status: card.status,
    confidenceScore: card.confidenceScore,
    matchedFragmentCount: card.matchedFragmentCount,
  }));
  const xEvidenceBoards = await buildContextXEvidenceBoards(evidenceFragments.map<EvidenceFragmentContext>((fragment) => ({
    id: fragment.id,
    title: fragment.title,
    rawContent: fragment.rawContent,
    distilledContent: fragment.distilledContent,
    sourceType: fragment.sourceType,
    sourceUrl: fragment.sourceUrl,
    screenshotPath: fragment.screenshotPath,
    sourceMeta: fragment.sourceMeta,
    usageMode: fragment.usageMode,
  })));

  return {
    fragments,
    evidenceFragments: evidenceFragments.map<EvidenceFragmentContext>((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      rawContent: fragment.rawContent,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
      sourceMeta: fragment.sourceMeta,
      usageMode: fragment.usageMode,
    })),
    imageFragments: evidenceFragments
      .filter((fragment) => fragment.usageMode === "image" && fragment.screenshotPath)
      .map((fragment) => ({
        id: fragment.id,
        title: fragment.title,
        screenshotPath: fragment.screenshotPath,
      })),
    outlineNodes: nodes.map<OutlineNodeContext>((node) => ({
      title: node.title,
      description: node.description,
    })),
    knowledgeCards: normalizedKnowledgeCards,
    xEvidenceBoards,
    authorOutcomeFeedbackLedger,
    seriesInsight: buildSeriesInsight({
      articleTitle: input.title,
      articleMarkdown: input.markdownContent,
      boundSeries: boundSeries
        ? {
            name: boundSeries.name,
            thesis: boundSeries.thesis,
            targetAudience: boundSeries.targetAudience,
            preHook: boundSeries.preHook ?? null,
            postHook: boundSeries.postHook ?? null,
            platformPreference: boundSeries.platformPreference ?? null,
            targetPackHint: boundSeries.targetPackHint ?? null,
            defaultArchetype: boundSeries.defaultArchetype ?? null,
            defaultLayoutTemplateId: boundSeries.defaultLayoutTemplateId ?? null,
            rhythmOverride: boundSeries.rhythmOverride ?? null,
          }
        : null,
      knowledgeCards: normalizedKnowledgeCards,
      historySuggestions,
    }),
    strategyCard: {
      archetype: strategyCard?.archetype ?? null,
      mainstreamBelief: strategyCard?.mainstreamBelief ?? null,
      targetReader: strategyCard?.targetReader ?? null,
      coreAssertion: strategyCard?.coreAssertion ?? null,
      whyNow: strategyCard?.whyNow ?? null,
      researchHypothesis: strategyCard?.researchHypothesis ?? null,
      marketPositionInsight: strategyCard?.marketPositionInsight ?? null,
      historicalTurningPoint: strategyCard?.historicalTurningPoint ?? null,
      endingAction: strategyCard?.endingAction ?? null,
    },
    humanSignals: {
      firstHandObservation: strategyCard?.firstHandObservation ?? null,
      feltMoment: strategyCard?.feltMoment ?? null,
      whyThisHitMe: strategyCard?.whyThisHitMe ?? null,
      realSceneOrDialogue: strategyCard?.realSceneOrDialogue ?? null,
      wantToComplain: strategyCard?.wantToComplain ?? null,
      nonDelegableTruth: strategyCard?.nonDelegableTruth ?? null,
      score: [
        strategyCard?.firstHandObservation,
        strategyCard?.feltMoment,
        strategyCard?.whyThisHitMe,
        strategyCard?.realSceneOrDialogue,
        strategyCard?.wantToComplain,
        strategyCard?.nonDelegableTruth,
      ].filter((item) => String(item || "").trim().length > 0).length,
    } satisfies HumanSignalContext,
  };
}
