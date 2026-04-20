import { buildFourPointAudit } from "@/lib/article-strategy";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";

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
    const override = Boolean((body as Record<string, unknown>).override);
    const strategyCard = await getArticleStrategyCard(article.id, session.userId);
    if (!strategyCard) {
      return fail("策略卡不存在", 404);
    }

    const fourPointAudit = buildFourPointAudit(strategyCard);
    if (!fourPointAudit.overallLockable && !override) {
      return fail("当前四元强度还没达标，请先补强后再锁定，或使用强行锁定。", 400);
    }

    const saved = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: session.userId,
      fourPointAudit,
      strategyLockedAt: new Date().toISOString(),
      strategyOverride: override,
    });

    return ok({
      strategyLockedAt: saved?.strategyLockedAt ?? null,
      strategyOverride: saved?.strategyOverride ?? override,
      strategyCard: saved,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "策略卡锁定失败", 400);
  }
}
