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
    outcome: article.outcomeBundle.outcome,
    snapshots: article.outcomeBundle.snapshots,
    completedWindowCodes: article.outcomeBundle.completedWindowCodes,
    missingWindowCodes: article.outcomeBundle.missingWindowCodes,
    nextWindowCode: article.outcomeBundle.nextWindowCode,
  });
}
