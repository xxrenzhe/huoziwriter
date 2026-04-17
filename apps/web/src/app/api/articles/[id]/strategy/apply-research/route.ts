import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const [strategyCard, researchArtifact] = await Promise.all([
    getArticleStrategyCard(article.id, session.userId),
    getArticleStageArtifact(article.id, session.userId, "researchBrief"),
  ]);
  const researchWriteback = getRecord(getRecord(researchArtifact?.payload)?.strategyWriteback);
  const nextTargetReader = getString(researchWriteback?.targetReader);
  const nextCoreAssertion = getString(researchWriteback?.coreAssertion);
  const nextWhyNow = getString(researchWriteback?.whyNow);
  const nextResearchHypothesis = getString(researchWriteback?.researchHypothesis);
  const nextMarketPositionInsight = getString(researchWriteback?.marketPositionInsight);
  const nextHistoricalTurningPoint = getString(researchWriteback?.historicalTurningPoint);

  if (!nextTargetReader && !nextCoreAssertion && !nextWhyNow && !nextResearchHypothesis && !nextMarketPositionInsight && !nextHistoricalTurningPoint) {
    return fail("当前研究简报还没有可直接写回策略卡的字段。", 400);
  }

  const saved = await upsertArticleStrategyCard({
    articleId: article.id,
    userId: session.userId,
    targetReader: nextTargetReader || strategyCard?.targetReader || null,
    coreAssertion: nextCoreAssertion || strategyCard?.coreAssertion || null,
    whyNow: nextWhyNow || strategyCard?.whyNow || null,
    researchHypothesis: nextResearchHypothesis || strategyCard?.researchHypothesis || null,
    marketPositionInsight: nextMarketPositionInsight || strategyCard?.marketPositionInsight || null,
    historicalTurningPoint: nextHistoricalTurningPoint || strategyCard?.historicalTurningPoint || null,
    targetPackage: strategyCard?.targetPackage ?? null,
    publishWindow: strategyCard?.publishWindow ?? null,
    endingAction: strategyCard?.endingAction ?? null,
    firstHandObservation: strategyCard?.firstHandObservation ?? null,
    feltMoment: strategyCard?.feltMoment ?? null,
    whyThisHitMe: strategyCard?.whyThisHitMe ?? null,
    realSceneOrDialogue: strategyCard?.realSceneOrDialogue ?? null,
    wantToComplain: strategyCard?.wantToComplain ?? null,
    nonDelegableTruth: strategyCard?.nonDelegableTruth ?? null,
  });

  return ok({
    strategyCard: saved,
  });
}
