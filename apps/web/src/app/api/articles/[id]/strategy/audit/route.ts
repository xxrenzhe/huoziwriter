import { buildFourPointAudit, hasStrategyLockInputsChanged } from "@/lib/article-strategy";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";
import { mergeStrategyCardPatch, parseStrategyCardPatch } from "../shared";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const currentStrategyCard = await getArticleStrategyCard(article.id, session.userId);
    const patch = parseStrategyCardPatch(body);
    const nextStrategyCard = mergeStrategyCardPatch(currentStrategyCard, patch);
    const fourPointAudit = buildFourPointAudit(nextStrategyCard);
    const shouldClearLock = hasStrategyLockInputsChanged(currentStrategyCard, nextStrategyCard);
    const saved = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: session.userId,
      ...patch,
      fourPointAudit,
      strategyLockedAt: shouldClearLock ? null : currentStrategyCard?.strategyLockedAt ?? null,
      strategyOverride: shouldClearLock ? false : currentStrategyCard?.strategyOverride ?? false,
    });
    return ok({
      fourPointAudit: saved?.fourPointAudit ?? fourPointAudit,
      strategyCard: saved,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "策略卡四元自检失败", 400);
  }
}
