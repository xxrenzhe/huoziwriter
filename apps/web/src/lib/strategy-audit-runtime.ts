import { buildFourPointAudit, hasStrategyLockInputsChanged } from "./article-strategy";
import { recomputeAndPersistArticleOutcome } from "./article-outcome-runtime";
import { recordPlan17RuntimeObservation } from "./plan17-observability";
import { getArticleById, getArticleStrategyCard, upsertArticleStrategyCard } from "./repositories";
import { mergeStrategyCardPatch, parseStrategyCardPatch } from "../app/api/articles/[id]/strategy/shared";

export async function runStrategyAuditForArticle(input: {
  userId: number;
  articleId: number;
  body: unknown;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在");
  }

  const startedAt = Date.now();
  let observationStatus: "completed" | "failed" = "completed";

  try {
    const currentStrategyCard = await getArticleStrategyCard(article.id, input.userId);
    const patch = parseStrategyCardPatch(input.body);
    const nextStrategyCard = mergeStrategyCardPatch(currentStrategyCard, patch);
    const fourPointAudit = buildFourPointAudit(nextStrategyCard);
    const shouldClearLock = hasStrategyLockInputsChanged(currentStrategyCard, nextStrategyCard);
    const saved = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: input.userId,
      ...patch,
      fourPointAudit,
      strategyLockedAt: shouldClearLock ? null : currentStrategyCard?.strategyLockedAt ?? null,
      strategyOverride: shouldClearLock ? false : currentStrategyCard?.strategyOverride ?? false,
    });
    await recomputeAndPersistArticleOutcome({
      articleId: article.id,
      userId: input.userId,
    });

    return {
      fourPointAudit: saved?.fourPointAudit ?? fourPointAudit,
      strategyCard: saved,
    };
  } catch (error) {
    observationStatus = "failed";
    throw error;
  } finally {
    await recordPlan17RuntimeObservation({
      metricKey: "strategyCard.strengthAudit.route",
      userId: input.userId,
      status: observationStatus,
      durationMs: Date.now() - startedAt,
      meta: {
        articleId: article.id,
        route: "/api/articles/[id]/strategy/audit",
      },
    }).catch(() => undefined);
  }
}
