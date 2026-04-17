import { ensureUserSession } from "@/lib/auth";
import { getSavedArticleHistoryReferences, suggestArticleHistoryReferences } from "@/lib/article-history-references";
import { fail, ok } from "@/lib/http";
import { assertHistoryReferenceAllowed } from "@/lib/plan-access";
import { getArticleById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertHistoryReferenceAllowed(session.userId);
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const [suggestions, saved] = await Promise.all([
      suggestArticleHistoryReferences({
        userId: session.userId,
        articleId: article.id,
        currentTitle: article.title,
        currentMarkdown: article.markdown_content,
      }),
      getSavedArticleHistoryReferences(article.id),
    ]);
    return ok({
      suggestions,
      saved,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "历史文章建议加载失败", 400);
  }
}
