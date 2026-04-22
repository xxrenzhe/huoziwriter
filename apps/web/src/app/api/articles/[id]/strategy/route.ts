import { buildFourPointAudit, buildSuggestedStrategyCard, hasStrategyLockInputsChanged } from "@/lib/article-strategy";
import { recomputeAndPersistArticleOutcome } from "@/lib/article-outcome-runtime";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifacts } from "@/lib/article-stage-artifacts";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleOutcomeBundle, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";
import { mergeStrategyCardPatch, parseStrategyCardPatch } from "./shared";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const [strategyCard, stageArtifacts, writingContext, outcomeBundle] = await Promise.all([
    getArticleStrategyCard(article.id, session.userId),
    getArticleStageArtifacts(article.id, session.userId),
    getArticleWritingContext({
      userId: session.userId,
      articleId: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
    }),
    getArticleOutcomeBundle(article.id, session.userId),
  ]);

  return ok(
    buildSuggestedStrategyCard({
      strategyCard,
      stageArtifacts,
      seriesInsight: writingContext.seriesInsight,
      outcomeBundle,
    }),
  );
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  try {
    const body = await request.json();
    const currentStrategyCard = await getArticleStrategyCard(article.id, session.userId);
    const patch = parseStrategyCardPatch(body);
    const nextStrategyCard = mergeStrategyCardPatch(currentStrategyCard, patch);
    const fourPointAudit = buildFourPointAudit(nextStrategyCard);
    const shouldClearLock = hasStrategyLockInputsChanged(currentStrategyCard, nextStrategyCard);
    const strategyCard = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: session.userId,
      ...patch,
      fourPointAudit,
      strategyLockedAt: shouldClearLock ? null : currentStrategyCard?.strategyLockedAt ?? null,
      strategyOverride: shouldClearLock ? false : currentStrategyCard?.strategyOverride ?? false,
    });
    await recomputeAndPersistArticleOutcome({
      articleId: article.id,
      userId: session.userId,
    });
    return ok(strategyCard);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "策略卡保存失败", 400);
  }
}
