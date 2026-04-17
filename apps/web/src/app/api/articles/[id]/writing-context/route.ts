import { ensureUserSession } from "@/lib/auth";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { fail, ok } from "@/lib/http";
import { getArticleById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const articleId = Number(params.id);
    const article = await getArticleById(articleId, session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }

    const context = await getArticleWritingContext({
      userId: session.userId,
      articleId,
      title: article.title,
      markdownContent: article.markdown_content,
    });

    return ok(context);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作上下文加载失败", 400);
  }
}
