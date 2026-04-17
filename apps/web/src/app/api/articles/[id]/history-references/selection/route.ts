import { ensureUserSession } from "@/lib/auth";
import { replaceArticleHistoryReferences } from "@/lib/article-history-references";
import { fail, ok } from "@/lib/http";
import { assertHistoryReferenceAllowed } from "@/lib/plan-access";
import { getArticleById } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
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
    const body = await request.json();
    const references = Array.isArray(body.references)
      ? body.references as Array<{
          referencedArticleId?: unknown;
          relationReason?: unknown;
          bridgeSentence?: unknown;
        }>
      : [];
    const saved = await replaceArticleHistoryReferences({
      userId: session.userId,
      articleId: article.id,
      references: references.map((item) => ({
        referencedArticleId: Number(item.referencedArticleId),
        relationReason: item.relationReason ? String(item.relationReason) : null,
        bridgeSentence: item.bridgeSentence ? String(item.bridgeSentence) : null,
      })),
    });
    return ok(saved);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "历史文章自然引用保存失败", 400);
  }
}
