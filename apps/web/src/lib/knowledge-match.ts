type MatchableKnowledgeCard = {
  id: number;
  title: string;
  summary: string | null;
  cardType?: string;
  card_type?: string;
  status: string;
  confidenceScore?: number;
  confidence_score?: number;
};

function tokenize(value: string) {
  const normalized = value.toLowerCase();
  const matches = normalized.match(/[\u4e00-\u9fa5]{2,}|[a-z0-9]{3,}/g) ?? [];
  return Array.from(new Set(matches));
}

function scoreTopicMatch(topicTitle: string, card: MatchableKnowledgeCard) {
  const topicTokens = tokenize(topicTitle);
  const haystack = `${card.title} ${card.summary ?? ""}`;
  const haystackTokens = new Set(tokenize(haystack));

  let score = 0;
  for (const token of topicTokens) {
    if (haystackTokens.has(token)) {
      score += token.length >= 4 ? 3 : 2;
    }
  }

  if (haystack.includes(topicTitle) || topicTitle.includes(card.title)) {
    score += 4;
  }
  return score;
}

export function matchTopicToKnowledgeCards(topicTitle: string, cards: MatchableKnowledgeCard[], limit = 2) {
  return cards
    .map((card) => ({ card, score: scoreTopicMatch(topicTitle, card) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ card }) => ({
      id: card.id,
      title: card.title,
      cardType: card.cardType ?? card.card_type ?? "topic",
      status: card.status,
      confidenceScore: card.confidenceScore ?? card.confidence_score ?? 0.5,
    }));
}
