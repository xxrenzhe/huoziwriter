import { formatArticleStatusLabel } from "@/lib/article-status-label";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticlesByUser } from "@/lib/repositories";

function normalizeSearchText(value: string) {
  return String(value || "").trim().toLowerCase();
}

function formatArticleUpdatedAt(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function computeArticleSearchScore(query: string, article: {
  title: string;
  markdown_content: string;
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

  const normalizedTitle = normalizeSearchText(article.title);
  const normalizedContent = normalizeSearchText(article.markdown_content);
  const normalizedStatus = normalizeSearchText(formatArticleStatusLabel(article.status));
  let score = 0;

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 8;
    if (normalizedTitle.startsWith(token)) score += 3;
    if (normalizedContent.includes(token)) score += 2;
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
  const articles = await getArticlesByUser(session.userId);
  const ranked = articles
    .map((article) => ({
      article,
      score: computeArticleSearchScore(trimmedQuery, article),
    }))
    .filter((item) => !trimmedQuery || item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.article.updated_at !== left.article.updated_at) {
        return right.article.updated_at.localeCompare(left.article.updated_at);
      }
      return right.article.id - left.article.id;
    })
    .slice(0, trimmedQuery ? 12 : 8)
    .map(({ article }) => {
      const statusLabel = formatArticleStatusLabel(article.status);
      return {
        id: `article:${article.id}`,
        articleId: article.id,
        title: article.title,
        subtitle: `${statusLabel} · 更新于 ${formatArticleUpdatedAt(article.updated_at)}`,
        href: `/articles/${article.id}`,
        badge: statusLabel,
        updatedAt: article.updated_at,
        keywords: [article.title, statusLabel],
      };
    });

  return ok(ranked);
}
