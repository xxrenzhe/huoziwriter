import { getArticleOutcomeData } from "@/lib/article-outcomes";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleOutcomeData(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  return ok({
    targetPackage: article.outcomeBundle.outcome.targetPackage,
    hitStatus: article.outcomeBundle.outcome.hitStatus,
    scorecard: article.outcomeBundle.outcome.scorecard,
    completedWindowCodes: article.outcomeBundle.completedWindowCodes,
    missingWindowCodes: article.outcomeBundle.missingWindowCodes,
  });
}
