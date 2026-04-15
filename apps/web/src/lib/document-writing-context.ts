import { getDocumentNodes } from "./document-outline";
import { suggestDocumentHistoryReferences } from "./document-history-references";
import { getRelevantKnowledgeCardsForDocument } from "./knowledge";
import { getFragmentsByUser } from "./repositories";

type OutlineNodeContext = {
  title: string;
  description: string | null;
};

type EvidenceFragmentContext = {
  id: number;
  title: string | null;
  distilledContent: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
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
  relatedDocumentCount: number;
};

function tokenize(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{3,}/g) ?? []).filter(Boolean)));
}

function toSentenceList(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function buildSeriesInsight(input: {
  documentTitle: string;
  documentMarkdown: string;
  knowledgeCards: KnowledgeCardContext[];
  historySuggestions: Array<{
    title: string;
    relationReason: string | null;
    consistencyHint: string | null;
    seriesLabel?: string | null;
  }>;
}): SeriesInsightContext | null {
  if (input.historySuggestions.length === 0 && input.knowledgeCards.length === 0) {
    return null;
  }

  const termFrequency = new Map<string, number>();
  for (const value of [
    input.documentTitle,
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
  const label = leadHistory?.seriesLabel ?? (leadCard ? `主题系列：${leadCard.title}` : null);
  const reason = leadHistory?.relationReason ?? leadCard?.latestChangeSummary ?? leadCard?.summary ?? null;
  const coreStances = toSentenceList(
    [
      leadHistory?.relationReason,
      ...input.knowledgeCards.map((card) => card.summary),
      ...input.knowledgeCards.flatMap((card) => card.keyFacts.slice(0, 2)),
    ],
    4,
  );
  const driftRisks = toSentenceList(
    [
      ...input.historySuggestions.map((item) => item.consistencyHint),
      ...input.knowledgeCards.flatMap((card) => card.overturnedJudgements),
      ...input.knowledgeCards
        .filter((card) => card.status === "conflicted" || card.status === "stale")
        .map((card) => `主题档案「${card.title}」当前状态为 ${card.status === "conflicted" ? "冲突" : "待刷新"}，写作时不要直接沿用旧结论。`),
    ],
    4,
  );
  const backgroundChecklist = toSentenceList(
    [
      ...input.knowledgeCards.flatMap((card) => card.openQuestions),
      ...input.historySuggestions.map((item) => item.relationReason),
    ],
    4,
  );
  const whyNow = toSentenceList(
    [
      ...input.knowledgeCards.map((card) => card.latestChangeSummary),
      ...input.knowledgeCards.flatMap((card) => card.overturnedJudgements),
      input.documentMarkdown.trim()
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
    relatedDocumentCount: input.historySuggestions.length,
  };
}

export async function getDocumentWritingContext(input: {
  userId: number;
  documentId: number;
  title: string;
  markdownContent: string;
}) {
  const nodes = await getDocumentNodes(input.documentId);
  const attachedFragments = Array.from(
    new Map(
      nodes
        .flatMap((node) => node.fragments)
        .map((fragment) => [
          fragment.id,
          {
            id: fragment.id,
            title: "title" in fragment ? (fragment.title as string | null) : null,
            distilledContent: fragment.distilledContent,
            sourceType: "sourceType" in fragment ? String(fragment.sourceType || "manual") : "manual",
            sourceUrl: "sourceUrl" in fragment ? (fragment.sourceUrl as string | null) : null,
            screenshotPath: "screenshotPath" in fragment ? (fragment.screenshotPath as string | null) : null,
            usageMode: "usageMode" in fragment ? String(fragment.usageMode || "rewrite") : "rewrite",
          },
        ] as const),
    ).entries(),
  ).map(([, fragment]) => fragment);

  const [knowledgeCards, historySuggestions] = await Promise.all([
    getRelevantKnowledgeCardsForDocument(input.userId, {
      documentTitle: input.title,
      markdownContent: input.markdownContent,
      nodeTitles: nodes.map((node) => node.title),
      attachedFragmentIds: attachedFragments.map((fragment) => fragment.id),
    }),
    suggestDocumentHistoryReferences({
      userId: input.userId,
      documentId: input.documentId,
      currentTitle: input.title,
      currentMarkdown: input.markdownContent,
    }),
  ]);

  let fragments = attachedFragments.filter((fragment) => fragment.usageMode !== "image").map((fragment) => fragment.distilledContent);
  let evidenceFragments = attachedFragments;
  if (fragments.length === 0) {
    const fallbackFragments = await getFragmentsByUser(input.userId);
    fragments = fallbackFragments
      .filter((fragment) => fragment.source_type !== "screenshot")
      .slice(0, 6)
      .map((fragment) => fragment.distilled_content);
    evidenceFragments = fallbackFragments.slice(0, 8).map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilled_content,
      sourceType: fragment.source_type,
      sourceUrl: fragment.source_url,
      screenshotPath: fragment.screenshot_path,
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

  return {
    fragments,
    evidenceFragments: evidenceFragments.map<EvidenceFragmentContext>((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
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
    seriesInsight: buildSeriesInsight({
      documentTitle: input.title,
      documentMarkdown: input.markdownContent,
      knowledgeCards: normalizedKnowledgeCards,
      historySuggestions,
    }),
  };
}
