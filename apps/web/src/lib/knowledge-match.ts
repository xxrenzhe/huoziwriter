export type MatchableKnowledgeCard = {
  id: number;
  title: string;
  summary: string | null;
  cardType?: string;
  card_type?: string;
  status: string;
  confidenceScore?: number;
  confidence_score?: number;
  shared?: boolean;
  ownerUsername?: string | null;
  owner_username?: string | null;
};

export type TopicKnowledgeMatch = {
  id: number;
  title: string;
  cardType: string;
  status: string;
  confidenceScore: number;
  summary: string | null;
  shared: boolean;
  ownerUsername: string | null;
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
      summary: card.summary ?? null,
      shared: Boolean(card.shared),
      ownerUsername: card.ownerUsername ?? card.owner_username ?? null,
    }));
}

function shorten(value: string | null | undefined, maxLength = 54) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function buildTopicJudgementShift(topicTitle: string, matches: TopicKnowledgeMatch[]) {
  if (matches.length === 0) {
    return null;
  }

  const lead = matches[0];
  const summary = shorten(lead.summary);

  if (lead.status === "conflicted") {
    return `旧判断出现冲突：${lead.title}${summary ? ` 当前档案里同时存在“${summary}”等相反信号。` : " 当前档案里已经出现相反信号。"}这次切角要先解释哪些事实已经打架。`;
  }

  if (lead.status === "stale") {
    return `旧判断可能过期：${lead.title}${summary ? ` 上次沉淀的结论是“${summary}”。` : ""}这次切角要先交代哪些新变化让旧结论不够用了。`;
  }

  return `旧判断参照：${lead.title}${summary ? `，已有结论是“${summary}”。` : "。"}这次切角重点写新增变量到底修正了什么。`;
}

export function buildTopicAngleOptions(
  topicTitle: string,
  baseAngles: string[],
  matches: TopicKnowledgeMatch[],
) {
  const defaults = baseAngles.slice(0, 3);
  if (matches.length === 0) {
    return defaults;
  }

  const lead = matches[0];
  const secondary = matches[1];
  const leadSummary = shorten(lead.summary, 42);
  const secondarySummary = shorten(secondary?.summary, 36);

  return [
    `${defaults[0] || `围绕“${topicTitle}”先拆最值得下笔的情绪切口。`} 先对照“${lead.title}”的旧判断，写这次新事实到底推翻了什么。`,
    `${defaults[1] || `别急着重复标题，先拆开“${topicTitle}”背后的利益变化。`} ${leadSummary ? `已有档案提醒：${leadSummary}。` : ""}重点补这次新增变量。`,
    `${defaults[2] || "如果把这件事放回长期观察里，真正变化的是判断坐标。"} ${secondary ? `再和“${secondary.title}”对照${secondarySummary ? `：${secondarySummary}` : ""}，写出最容易误判的地方。` : "不要只复述新闻，要回答今天为什么不能沿用昨天的结论。"} `,
  ].map((item) => item.trim());
}
