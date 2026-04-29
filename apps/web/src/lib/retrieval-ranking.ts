import { buildSemanticEmbedding, parseSemanticEmbedding, scoreSemanticMatch } from "./semantic-search";

export type RetrievalQueryContext = {
  articleTitle: string;
  queryText: string;
  tokens: string[];
  titleTokens: string[];
  attachedFragmentIds: number[];
};

export type RetrievalCandidate = {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  updatedAt?: string | null;
  attachedFragmentIds?: number[];
  embedding?: unknown;
};

export type RetrievalScoreBreakdown = {
  score: number;
  lexicalOverlap: number;
  longTokenOverlap: number;
  directTitleHits: number;
  attachedFragmentOverlap: number;
  semanticScore: number;
  recencyBoost: number;
};

type RetrievalScoreWeights = {
  lexicalOverlap: number;
  longTokenOverlap: number;
  directTitleHits: number;
  attachedFragmentOverlap: number;
  semantic: number;
  recency: number;
};

const DEFAULT_WEIGHTS: RetrievalScoreWeights = {
  lexicalOverlap: 2,
  longTokenOverlap: 3,
  directTitleHits: 5,
  attachedFragmentOverlap: 8,
  semantic: 20,
  recency: 1,
};

function collectMeaningfulTokens(text: string, embedding?: unknown) {
  const parsed = parseSemanticEmbedding(embedding);
  const vector = Object.keys(parsed).length ? parsed : buildSemanticEmbedding(text);
  return Object.keys(vector).filter((token) => token.length >= 2);
}

export function buildRetrievalQueryContext(input: {
  articleTitle: string;
  markdownContent: string;
  nodeTitles?: string[];
  attachedFragmentIds?: number[];
}) {
  const queryText = [input.articleTitle, input.markdownContent, ...(input.nodeTitles ?? [])].filter(Boolean).join("\n");
  return {
    articleTitle: input.articleTitle,
    queryText,
    tokens: collectMeaningfulTokens(queryText).slice(0, 64),
    titleTokens: collectMeaningfulTokens(input.articleTitle).slice(0, 24),
    attachedFragmentIds: Array.from(new Set((input.attachedFragmentIds ?? []).filter(Boolean))),
  } satisfies RetrievalQueryContext;
}

export function scoreRecencyBoost(updatedAt: string | null | undefined, freshnessWindowDays = 30) {
  if (!updatedAt) {
    return 0;
  }

  const timestamp = new Date(updatedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageDays = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  return Math.max(0, freshnessWindowDays - ageDays);
}

export function scoreUnifiedRetrievalCandidate(
  query: RetrievalQueryContext,
  candidate: RetrievalCandidate,
  weightOverrides: Partial<RetrievalScoreWeights> = {},
): RetrievalScoreBreakdown {
  const weights = { ...DEFAULT_WEIGHTS, ...weightOverrides };
  const title = String(candidate.title ?? "").trim();
  const summary = String(candidate.summary ?? "").trim();
  const content = String(candidate.content ?? "").trim();
  const combined = [title, summary, content].filter(Boolean).join("\n");
  const candidateTokens = new Set(collectMeaningfulTokens(combined, candidate.embedding));
  const candidateTitleTokens = new Set(collectMeaningfulTokens(title));

  const lexicalOverlap = query.tokens.filter((token) => candidateTokens.has(token)).length;
  const longTokenOverlap = query.tokens.filter((token) => token.length >= 3 && candidateTokens.has(token)).length;
  const directTitleHits = query.titleTokens.filter((token) => candidateTitleTokens.has(token)).length;
  const attachedFragmentSet = new Set(query.attachedFragmentIds);
  const attachedFragmentOverlap = (candidate.attachedFragmentIds ?? []).filter((fragmentId) => attachedFragmentSet.has(fragmentId)).length;
  const semanticScore = scoreSemanticMatch(query.queryText, combined, candidate.embedding);
  const recencyBoost = scoreRecencyBoost(candidate.updatedAt);

  return {
    score:
      lexicalOverlap * weights.lexicalOverlap +
      longTokenOverlap * weights.longTokenOverlap +
      directTitleHits * weights.directTitleHits +
      attachedFragmentOverlap * weights.attachedFragmentOverlap +
      semanticScore * weights.semantic +
      recencyBoost * weights.recency,
    lexicalOverlap,
    longTokenOverlap,
    directTitleHits,
    attachedFragmentOverlap,
    semanticScore,
    recencyBoost,
  };
}
