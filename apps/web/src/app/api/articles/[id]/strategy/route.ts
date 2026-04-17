import { buildSuggestedStrategyCard } from "@/lib/article-strategy";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifacts } from "@/lib/article-stage-artifacts";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleOutcomeBundle, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";

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
    const strategyCard = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: session.userId,
      targetReader: body.targetReader === undefined ? undefined : String(body.targetReader || "").trim() || null,
      coreAssertion: body.coreAssertion === undefined ? undefined : String(body.coreAssertion || "").trim() || null,
      whyNow: body.whyNow === undefined ? undefined : String(body.whyNow || "").trim() || null,
      researchHypothesis: body.researchHypothesis === undefined ? undefined : String(body.researchHypothesis || "").trim() || null,
      marketPositionInsight: body.marketPositionInsight === undefined ? undefined : String(body.marketPositionInsight || "").trim() || null,
      historicalTurningPoint: body.historicalTurningPoint === undefined ? undefined : String(body.historicalTurningPoint || "").trim() || null,
      targetPackage: body.targetPackage === undefined ? undefined : String(body.targetPackage || "").trim() || null,
      publishWindow: body.publishWindow === undefined ? undefined : String(body.publishWindow || "").trim() || null,
      endingAction: body.endingAction === undefined ? undefined : String(body.endingAction || "").trim() || null,
      firstHandObservation: body.firstHandObservation === undefined ? undefined : String(body.firstHandObservation || "").trim() || null,
      feltMoment: body.feltMoment === undefined ? undefined : String(body.feltMoment || "").trim() || null,
      whyThisHitMe: body.whyThisHitMe === undefined ? undefined : String(body.whyThisHitMe || "").trim() || null,
      realSceneOrDialogue: body.realSceneOrDialogue === undefined ? undefined : String(body.realSceneOrDialogue || "").trim() || null,
      wantToComplain: body.wantToComplain === undefined ? undefined : String(body.wantToComplain || "").trim() || null,
      nonDelegableTruth: body.nonDelegableTruth === undefined ? undefined : String(body.nonDelegableTruth || "").trim() || null,
    });
    return ok(strategyCard);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "策略卡保存失败", 400);
  }
}
