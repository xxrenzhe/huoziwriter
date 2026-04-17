import { ensureUserSession } from "@/lib/auth";
import { saveArticleDraft, serializeArticleDraft } from "@/lib/article-draft";
import { fail, ok } from "@/lib/http";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const articleId = Number(params.id);
    const savedArticle = await saveArticleDraft({
      articleId,
      userId: session.userId,
      body,
    });
    if (!savedArticle) {
      return fail("稿件不存在", 404);
    }
    return ok(serializeArticleDraft(savedArticle));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "稿件保存失败", 400);
  }
}
