import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleResearchCards } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const researchCards = await getArticleResearchCards(article.id, session.userId);
  return ok(researchCards);
}
