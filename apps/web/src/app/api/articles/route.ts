import { normalizeArticleStatus } from "@/lib/article-status-label";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertPersonaReady } from "@/lib/personas";
import { createArticle, getArticlesByUser } from "@/lib/repositories";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const articles = await getArticlesByUser(session.userId);
  return ok(
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
      htmlContent: article.html_content,
      status: normalizeArticleStatus(article.status),
      seriesId: article.series_id,
      updatedAt: article.updated_at,
      createdAt: article.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertPersonaReady(session.userId);
    const body = await request.json();
    const article = await createArticle(session.userId, body.title || "未命名稿件", body.seriesId);
    return ok({
      id: article?.id,
      title: article?.title,
      status: normalizeArticleStatus(article?.status),
      seriesId: article?.series_id ?? null,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建稿件失败", 400);
  }
}
