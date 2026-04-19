import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getSeries } from "@/lib/series";

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function computeSeriesSearchScore(query: string, item: {
  name: string;
  personaName: string;
  thesis: string | null;
  targetAudience: string | null;
  activeStatus: string;
}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  const normalizedName = normalizeSearchText(item.name);
  const normalizedPersonaName = normalizeSearchText(item.personaName);
  const normalizedThesis = normalizeSearchText(item.thesis || "");
  const normalizedAudience = normalizeSearchText(item.targetAudience || "");
  const normalizedStatus = normalizeSearchText(item.activeStatus);
  let score = 0;

  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 8;
    if (normalizedName.startsWith(token)) score += 3;
    if (normalizedPersonaName.includes(token)) score += 4;
    if (normalizedThesis.includes(token)) score += 3;
    if (normalizedAudience.includes(token)) score += 2;
    if (normalizedStatus.includes(token)) score += 1;
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
  const series = await getSeries(session.userId);
  const ranked = series
    .map((item) => ({
      item,
      score: computeSeriesSearchScore(trimmedQuery, item),
    }))
    .filter((entry) => !trimmedQuery || entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.item.updatedAt !== left.item.updatedAt) {
        return right.item.updatedAt.localeCompare(left.item.updatedAt);
      }
      return right.item.id - left.item.id;
    })
    .slice(0, 6)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      personaName: item.personaName,
      thesis: item.thesis,
      activeStatus: item.activeStatus,
      updatedAt: item.updatedAt,
    }));

  return ok(ranked);
}
