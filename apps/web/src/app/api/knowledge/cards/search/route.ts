import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCards } from "@/lib/knowledge";

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function computeKnowledgeSearchScore(query: string, item: {
  title: string;
  summary: string | null;
  latest_change_summary: string | null;
  card_type: string;
  status: string;
}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  const normalizedTitle = normalizeSearchText(item.title);
  const haystack = normalizeSearchText(
    [item.title, item.summary || "", item.latest_change_summary || "", item.card_type, item.status].join(" "),
  );
  let score = 0;

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 8;
    if (normalizedTitle.startsWith(token)) score += 3;
    if (haystack.includes(token)) score += 2;
  }

  return score;
}

export async function GET(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const trimmedQuery = query.trim();
  const knowledgeCards = await getKnowledgeCards(session.userId);
  const ranked = knowledgeCards
    .map((item) => ({
      item,
      score: computeKnowledgeSearchScore(trimmedQuery, item),
      updatedAt: (item as typeof item & { updated_at?: string | null }).updated_at || null,
    }))
    .filter((entry) => !trimmedQuery || entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if ((right.updatedAt || "") !== (left.updatedAt || "")) {
        return (right.updatedAt || "").localeCompare(left.updatedAt || "");
      }
      if (right.item.confidence_score !== left.item.confidence_score) {
        return right.item.confidence_score - left.item.confidence_score;
      }
      return right.item.id - left.item.id;
    })
    .slice(0, 6)
    .map(({ item, updatedAt }) => ({
      id: item.id,
      title: item.title,
      cardType: item.card_type,
      summary: item.summary,
      status: item.status,
      confidenceScore: item.confidence_score,
      latestChangeSummary: item.latest_change_summary,
      ...(updatedAt ? { updatedAt } : {}),
    }));

  return ok(ranked);
}
