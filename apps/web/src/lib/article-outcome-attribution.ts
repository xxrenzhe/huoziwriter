import { evaluateArchetypeRhythmConsistency } from "./archetype-rhythm";
import { getArticleEvidenceStats, type EvidenceHookTag } from "./article-evidence";
import { FOUR_POINT_AUDIT_DIMENSIONS, getHumanSignalScore, STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import type { ArticleEvidenceItem, ArticleStrategyCard, ArticleTopicAttribution } from "./repositories";
import type { ArticleStageArtifact } from "./article-stage-artifacts";

type OutcomeAttributionDimensionKey = (typeof FOUR_POINT_AUDIT_DIMENSIONS)[number]["key"];

export type ArticleOutcomeAttribution = {
  topic: {
    source: string | null;
    fissionMode: string | null;
    sourceTrackLabel: string | null;
    topicLeadId: number | null;
    backlogId: number | null;
    backlogName: string | null;
    backlogItemId: number | null;
    batchId: string | null;
    predictedFlipStrength: number | null;
  } | null;
  strategy: {
    archetype: ArticleStrategyCard["archetype"];
    fourPointAverageScore: number | null;
    fourPointScores: Record<OutcomeAttributionDimensionKey, number | null>;
    humanSignalScore: number;
    strategyOverride: boolean;
  };
  evidence: {
    hookTagCoverage: EvidenceHookTag[];
    hookTagCoverageCount: number;
    hookStrengthAverage: number | null;
    dominantHookTags: EvidenceHookTag[];
    primaryHookComboLabel: string | null;
  };
  rhythm: {
    status: "aligned" | "needs_attention" | "insufficient";
    score: number | null;
    expectedPrototypeCode: string | null;
    actualPrototypeCode: string | null;
    detail: string;
  };
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getDeepWritingArtifact(stageArtifacts: ArticleStageArtifact[]) {
  return stageArtifacts.find((item) => item.stageCode === "deepWriting") ?? null;
}

function buildFourPointScores(strategyCard: ArticleStrategyCard | null) {
  const audit = getRecord(strategyCard?.fourPointAudit);
  const fourPointScores = Object.fromEntries(
    FOUR_POINT_AUDIT_DIMENSIONS.map((dimension) => {
      const score = getNumber(getRecord(audit?.[dimension.key])?.score);
      return [dimension.key, score];
    }),
  ) as Record<OutcomeAttributionDimensionKey, number | null>;
  const scoreValues = Object.values(fourPointScores).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    fourPointScores,
    fourPointAverageScore: scoreValues.length > 0
      ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(2))
      : null,
  };
}

function buildEvidenceAttribution(evidenceItems: ArticleEvidenceItem[]) {
  const stats = getArticleEvidenceStats(evidenceItems);
  const hookStrengthValues = evidenceItems
    .map((item) => item.hookStrength)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const hookStrengthAverage = hookStrengthValues.length > 0
    ? Number((hookStrengthValues.reduce((sum, value) => sum + value, 0) / hookStrengthValues.length).toFixed(2))
    : null;
  const tagCounts = new Map<EvidenceHookTag, number>();
  for (const item of evidenceItems) {
    for (const tag of item.hookTags ?? []) {
      tagCounts.set(tag as EvidenceHookTag, (tagCounts.get(tag as EvidenceHookTag) ?? 0) + 1);
    }
  }
  const dominantHookTags = Array.from(tagCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0], "zh-CN");
    })
    .map(([tag]) => tag)
    .slice(0, 3);
  return {
    hookTagCoverage: stats.hookTagCoverage,
    hookTagCoverageCount: stats.hookTagCoverageCount,
    hookStrengthAverage,
    dominantHookTags,
    primaryHookComboLabel: dominantHookTags.length > 0 ? dominantHookTags.join(" + ") : null,
  };
}

export function buildArticleOutcomeAttribution(input: {
  markdownContent: string;
  strategyCard: ArticleStrategyCard | null;
  evidenceItems: ArticleEvidenceItem[];
  stageArtifacts: ArticleStageArtifact[];
  topicAttribution: ArticleTopicAttribution | null;
}) {
  const deepWritingArtifact = getDeepWritingArtifact(input.stageArtifacts);
  const expectedPrototypeCode =
    STRATEGY_ARCHETYPE_OPTIONS.find((item) => item.key === input.strategyCard?.archetype)?.prototypeCode ?? null;
  const actualPrototypeCode =
    getString(getRecord(deepWritingArtifact?.payload)?.articlePrototype)
    || null;
  const rhythm = evaluateArchetypeRhythmConsistency({
    archetype: input.strategyCard?.archetype ?? null,
    expectedPrototypeCode,
    actualPrototypeCode,
    markdownContent: input.markdownContent,
    deepWritingPayload: deepWritingArtifact?.payload ?? null,
  });
  const { fourPointScores, fourPointAverageScore } = buildFourPointScores(input.strategyCard);

  return {
    topic: input.topicAttribution
      ? {
          source: input.topicAttribution.source,
          fissionMode: input.topicAttribution.fissionMode,
          sourceTrackLabel: input.topicAttribution.sourceTrackLabel,
          topicLeadId: input.topicAttribution.topicLeadId,
          backlogId: input.topicAttribution.backlogId,
          backlogName: input.topicAttribution.backlogName,
          backlogItemId: input.topicAttribution.backlogItemId,
          batchId: input.topicAttribution.batchId,
          predictedFlipStrength: input.topicAttribution.predictedFlipStrength,
        }
      : null,
    strategy: {
      archetype: input.strategyCard?.archetype ?? null,
      fourPointAverageScore,
      fourPointScores,
      humanSignalScore: getHumanSignalScore(input.strategyCard),
      strategyOverride: Boolean(input.strategyCard?.strategyOverride),
    },
    evidence: buildEvidenceAttribution(input.evidenceItems),
    rhythm: {
      status: rhythm.status,
      score: rhythm.score,
      expectedPrototypeCode,
      actualPrototypeCode,
      detail: rhythm.detail,
    },
  } satisfies ArticleOutcomeAttribution;
}
