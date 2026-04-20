import { resolveArticleOutcomeBundle } from "@/lib/article-outcomes";
import { buildArticleOutcomeAttribution } from "@/lib/article-outcome-attribution";
import { buildArticleScorecard } from "@/lib/article-scorecard";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifacts } from "@/lib/article-stage-artifacts";
import { getArticleWorkflow } from "@/lib/article-workflows";
import { getArticleNodes } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import {
    getArticleById,
    getArticleEvidenceItems,
    getArticleOutcomeBundle,
    getArticleStrategyCard,
    getArticleTopicAttribution,
    upsertArticleOutcome,
    upsertArticleOutcomeSnapshot,
} from "@/lib/repositories";
import { getActiveWritingEvalScoringProfile } from "@/lib/writing-eval";

function normalizeWindowCode(value: unknown): "24h" | "72h" | "7d" | null {
  if (value === "24h" || value === "72h" || value === "7d") {
    return value;
  }
  return null;
}

function normalizeHitStatus(value: unknown): "pending" | "hit" | "near_miss" | "miss" {
  if (value === "hit" || value === "near_miss" || value === "miss") {
    return value;
  }
  return "pending";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildWritingStateFeedback(stageArtifacts: Awaited<ReturnType<typeof getArticleStageArtifacts>>) {
  const deepWritingArtifact = stageArtifacts.find((item) => item.stageCode === "deepWriting") ?? null;
  const payload = getRecord(deepWritingArtifact?.payload);
  if (!payload) {
    return null;
  }
  const prototypeComparisons = getRecordArray(payload.prototypeComparisons);
  const recommendedPrototypeComparison =
    prototypeComparisons.find((item) => Boolean(item.isRecommended)) ??
    prototypeComparisons[0] ??
    null;
  const stateComparisons = getRecordArray(payload.stateComparisons);
  const recommendedComparison =
    stateComparisons.find((item) => Boolean(item.isRecommended)) ??
    stateComparisons[0] ??
    null;
  const adoptedPrototypeCode = getString(payload.articlePrototype) || null;
  const recommendedPrototypeCode = getString(recommendedPrototypeComparison?.code) || null;
  const adoptedVariantCode = getString(payload.stateVariantCode) || null;
  const recommendedVariantCode = getString(recommendedComparison?.code) || null;
  const adoptedOpeningPatternLabel = getString(payload.openingPatternLabel) || null;
  const adoptedSyntaxPatternLabel = getString(payload.syntaxPatternLabel) || null;
  const adoptedEndingPatternLabel = getString(payload.endingPatternLabel) || null;
  const recommendedOpeningPatternLabel =
    getString(recommendedComparison?.openingPatternLabel)
    || getString(recommendedPrototypeComparison?.openingPatternLabel)
    || adoptedOpeningPatternLabel;
  const recommendedSyntaxPatternLabel =
    getString(recommendedComparison?.syntaxPatternLabel)
    || getString(recommendedPrototypeComparison?.syntaxPatternLabel)
    || adoptedSyntaxPatternLabel;
  const recommendedEndingPatternLabel =
    getString(recommendedComparison?.endingPatternLabel)
    || getString(recommendedPrototypeComparison?.endingPatternLabel)
    || adoptedEndingPatternLabel;
  const patternPairs = [
    [adoptedOpeningPatternLabel, recommendedOpeningPatternLabel],
    [adoptedSyntaxPatternLabel, recommendedSyntaxPatternLabel],
    [adoptedEndingPatternLabel, recommendedEndingPatternLabel],
  ].filter((pair) => Boolean(pair[1]));

  return {
    recommendedPrototypeCode,
    recommendedPrototypeLabel: getString(recommendedPrototypeComparison?.label) || null,
    adoptedPrototypeCode,
    adoptedPrototypeLabel: getString(payload.articlePrototypeLabel) || null,
    followedPrototypeRecommendation:
      adoptedPrototypeCode && recommendedPrototypeCode
        ? adoptedPrototypeCode === recommendedPrototypeCode
        : null,
    recommendedVariantCode,
    recommendedVariantLabel: getString(recommendedComparison?.label) || null,
    adoptedVariantCode,
    adoptedVariantLabel: getString(payload.stateVariantLabel) || null,
    followedRecommendation:
      adoptedVariantCode && recommendedVariantCode
        ? adoptedVariantCode === recommendedVariantCode
        : null,
    recommendedOpeningPatternLabel: recommendedOpeningPatternLabel || null,
    recommendedSyntaxPatternLabel: recommendedSyntaxPatternLabel || null,
    recommendedEndingPatternLabel: recommendedEndingPatternLabel || null,
    adoptedOpeningPatternLabel,
    adoptedSyntaxPatternLabel,
    adoptedEndingPatternLabel,
    followedPatternRecommendation:
      patternPairs.length > 0
        ? patternPairs.every(([adoptedLabel, recommendedLabel]) => adoptedLabel && adoptedLabel === recommendedLabel)
        : null,
    availableVariantCount: Math.max(getRecordArray(payload.stateOptions).length, stateComparisons.length),
    comparisonSampleCount: stateComparisons.length,
    recommendationReason:
      getString(recommendedPrototypeComparison?.reason)
      || getString(recommendedComparison?.reason)
      || getString(recommendedComparison?.triggerReason)
      || null,
    adoptedReason: getString(payload.stateVariantReason) || null,
  } satisfies Record<string, unknown>;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const windowCode = normalizeWindowCode(body.windowCode);
  if (!windowCode) {
    return fail("windowCode 必须是 24h / 72h / 7d", 400);
  }
  const [workflow, stageArtifacts, nodes, activeScoringProfile, strategyCard, evidenceItems, topicAttribution] = await Promise.all([
    getArticleWorkflow(article.id, session.userId),
    getArticleStageArtifacts(article.id, session.userId),
    getArticleNodes(article.id),
    getActiveWritingEvalScoringProfile(),
    getArticleStrategyCard(article.id, session.userId),
    getArticleEvidenceItems(article.id, session.userId),
    getArticleTopicAttribution(article.id, session.userId),
  ]);
  const computedScorecard = buildArticleScorecard({
    title: article.title,
    markdownContent: article.markdown_content,
    status: article.status,
    activeScoringProfile: activeScoringProfile
      ? {
          code: activeScoringProfile.code,
          name: activeScoringProfile.name,
        }
      : null,
    workflow,
    stageArtifacts,
    nodes,
  });
  const writingStateFeedback = buildWritingStateFeedback(stageArtifacts);
  const computedAttribution = buildArticleOutcomeAttribution({
    markdownContent: article.markdown_content,
    strategyCard,
    evidenceItems,
    stageArtifacts,
    topicAttribution,
  });

  await upsertArticleOutcome({
    articleId: article.id,
    userId: session.userId,
    targetPackage: body.targetPackage === undefined ? undefined : String(body.targetPackage || "").trim() || null,
    scorecard: computedScorecard,
    attribution: computedAttribution,
    hitStatus: body.hitStatus === undefined ? undefined : normalizeHitStatus(body.hitStatus),
    reviewSummary: body.reviewSummary === undefined ? undefined : String(body.reviewSummary || "").trim() || null,
    nextAction: body.nextAction === undefined ? undefined : String(body.nextAction || "").trim() || null,
    playbookTags: Array.isArray(body.playbookTags)
      ? body.playbookTags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : undefined,
  });

  await upsertArticleOutcomeSnapshot({
    articleId: article.id,
    userId: session.userId,
    windowCode,
    readCount: Number(body.readCount || 0),
    shareCount: Number(body.shareCount || 0),
    likeCount: Number(body.likeCount || 0),
    notes: String(body.notes || "").trim() || null,
    writingStateFeedback,
  });

  const bundle = resolveArticleOutcomeBundle({
    articleId: article.id,
    userId: session.userId,
    bundle: await getArticleOutcomeBundle(article.id, session.userId),
    scorecard: computedScorecard,
  });
  return ok({
    outcome: bundle.outcome,
    snapshots: bundle.snapshots,
    completedWindowCodes: bundle.completedWindowCodes,
    missingWindowCodes: bundle.missingWindowCodes,
    nextWindowCode: bundle.nextWindowCode,
  });
}
