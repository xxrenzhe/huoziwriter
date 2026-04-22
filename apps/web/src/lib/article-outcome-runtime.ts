import { buildArticleOutcomeAttribution } from "./article-outcome-attribution";
import { buildArticleScorecard } from "./article-scorecard";
import { getArticleStageArtifacts, type ArticleStageArtifact } from "./article-stage-artifacts";
import { getArticleWorkflow } from "./article-workflows";
import { getArticleNodes } from "./article-outline";
import {
  getArticleById,
  getArticleEvidenceItems,
  getArticleStrategyCard,
  getArticleTopicAttribution,
  upsertArticleOutcome,
} from "./repositories";
import { getActiveWritingEvalScoringProfile } from "./writing-eval";

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

export function buildWritingStateFeedback(stageArtifacts: ArticleStageArtifact[]) {
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

export async function computeArticleOutcomeRefresh(input: {
  articleId: number;
  userId: number;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    return null;
  }

  const [workflow, stageArtifacts, nodes, activeScoringProfile, strategyCard, evidenceItems, topicAttribution] = await Promise.all([
    getArticleWorkflow(article.id, input.userId),
    getArticleStageArtifacts(article.id, input.userId),
    getArticleNodes(article.id),
    getActiveWritingEvalScoringProfile(),
    getArticleStrategyCard(article.id, input.userId),
    getArticleEvidenceItems(article.id, input.userId),
    getArticleTopicAttribution(article.id, input.userId),
  ]);

  const scorecard = buildArticleScorecard({
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
  const attribution = buildArticleOutcomeAttribution({
    markdownContent: article.markdown_content,
    strategyCard,
    evidenceItems,
    stageArtifacts,
    topicAttribution,
  });

  return {
    article,
    strategyCard,
    scorecard,
    attribution,
    writingStateFeedback: buildWritingStateFeedback(stageArtifacts),
  };
}

export async function recomputeAndPersistArticleOutcome(input: {
  articleId: number;
  userId: number;
  targetPackage?: string | null;
}) {
  const computed = await computeArticleOutcomeRefresh(input);
  if (!computed) {
    return null;
  }

  const outcome = await upsertArticleOutcome({
    articleId: computed.article.id,
    userId: input.userId,
    targetPackage: input.targetPackage !== undefined
      ? input.targetPackage
      : computed.strategyCard
        ? (computed.strategyCard.targetPackage ?? null)
        : undefined,
    scorecard: computed.scorecard,
    attribution: computed.attribution,
  });

  return {
    ...computed,
    outcome,
  };
}
