import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getPersonas } from "@/lib/personas";

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function computePersonaSearchScore(query: string, item: {
  name: string;
  summary: string | null;
  identityTags: string[];
  writingStyleTags: string[];
  audienceHints: string[];
  domainKeywords: string[];
}) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 0;
  }

  const haystack = normalizeSearchText(
    [
      item.name,
      item.summary || "",
      ...item.identityTags,
      ...item.writingStyleTags,
      ...item.audienceHints,
      ...item.domainKeywords,
    ].join(" "),
  );
  const normalizedName = normalizeSearchText(item.name);
  let score = 0;

  for (const token of tokens) {
    if (normalizedName.includes(token)) score += 8;
    if (normalizedName.startsWith(token)) score += 3;
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
  const personas = await getPersonas(session.userId);
  const ranked = personas
    .map((item) => ({
      item,
      score: computePersonaSearchScore(trimmedQuery, item),
    }))
    .filter((entry) => !trimmedQuery || entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.item.isDefault !== right.item.isDefault) {
        return Number(right.item.isDefault) - Number(left.item.isDefault);
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
      summary: item.summary,
      identityTags: item.identityTags,
      writingStyleTags: item.writingStyleTags,
      isDefault: item.isDefault,
      updatedAt: item.updatedAt,
    }));

  return ok(ranked);
}
