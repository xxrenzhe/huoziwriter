import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluatePlan17BusinessAcceptance,
  evaluateFissionVsRadarAcceptance,
  evaluatePlan17FunctionalAcceptance,
  evaluatePlan17NonFunctionalAcceptance,
  evaluatePlan17QualityAcceptance,
  summarizePlan17AcceptanceReport,
  summarizeAcceptanceSection,
} from "../plan17-acceptance";
import { getPlan17QualityReport } from "../writing-eval";

function buildFunctionalAcceptanceFixture(input?: {
  presentPromptIds?: string[];
  activePromptIds?: string[];
  navLabels?: string[];
}) {
  const promptIds = input?.presentPromptIds ?? [
    "topicFission.regularity",
    "topicFission.contrast",
    "topicFission.crossDomain",
    "strategyCard.autoDraft",
    "strategyCard.fourPointAggregate",
    "strategyCard.strengthAudit",
    "strategyCard.reverseWriteback",
    "evidenceHookTagging",
    "styleDna.crossCheck",
    "publishGate.rhythmConsistency",
  ];
  return {
    presentPromptIds: new Set(promptIds),
    activePromptIds: new Set(input?.activePromptIds ?? promptIds),
    navLabels: input?.navLabels ?? ["作战台", "稿件", "复盘", "设置"],
  };
}

function buildPlan17QualityReportFixture(input?: {
  topicFission?: Partial<{
    sampleCount: number;
    datasetCount: number;
    sceneBreakdown: Array<{
      sceneKey: string;
      promptId: string;
      label: string;
      activeVersion: string | null;
      evaluatedCaseCount: number;
      stableCaseCount: number;
      stableHitCaseCount: number;
      stableHitRate: number | null;
      failedCaseCount: number;
      runCount: number;
      latestRunAt: string | null;
    }>;
  }>;
  strategy?: Partial<{
    sampleCount: number;
    proxySampleCount: number;
    proxySpearman: number | null;
    manualSampleCount: number;
    manualSpearman: number | null;
  }>;
  evidence?: Partial<{
    sampleCount: number;
    labelSampleCount: number;
    precision: number | null;
    recall: number | null;
  }>;
  rhythm?: Partial<{
    sampleCount: number;
    linkedFeedbackCount: number;
    pairSampleCount: number;
    correlation: number | null;
    pValue: number | null;
  }>;
}): Awaited<ReturnType<typeof getPlan17QualityReport>> {
  return {
    generatedAt: "2026-04-21T00:00:00.000Z",
    seededDatasetCodes: [],
    totalDatasetCount: 4,
    totalSampleCount: 88,
    focuses: [
      {
        key: "topic_fission",
        label: "选题裂变",
        description: "",
        promptIds: ["topicFission.regularity", "topicFission.contrast", "topicFission.crossDomain"],
        datasetCount: input?.topicFission?.datasetCount ?? 1,
        activeDatasetCount: 1,
        sampleCount: input?.topicFission?.sampleCount ?? 22,
        enabledCaseCount: 22,
        disabledCaseCount: 0,
        runCount: 60,
        linkedFeedbackCount: 0,
        latestRunAt: "2026-04-21T00:00:00.000Z",
        readiness: { readyCount: 1, warningCount: 0, blockedCount: 0 },
        sourceTypeBreakdown: [],
        taskTypeBreakdown: [],
        reporting: {
          topicFissionSceneBreakdown: input?.topicFission?.sceneBreakdown ?? [],
          proxyScoreVsObservedSpearman: null,
          proxyScoreVsObservedSampleCount: 0,
          strategyManualScoreSpearman: null,
          strategyManualScoreSampleCount: 0,
          evidenceLabelPrecision: null,
          evidenceLabelRecall: null,
          evidenceLabelSampleCount: 0,
          rhythmDeviationVsReadCompletionCorrelation: null,
          rhythmDeviationVsReadCompletionSampleCount: 0,
          rhythmDeviationVsReadCompletionPValue: null,
        },
      },
      {
        key: "strategy_strength",
        label: "策略强度",
        description: "",
        promptIds: [],
        datasetCount: 1,
        activeDatasetCount: 1,
        sampleCount: input?.strategy?.sampleCount ?? 22,
        enabledCaseCount: 22,
        disabledCaseCount: 0,
        runCount: 0,
        linkedFeedbackCount: 0,
        latestRunAt: null,
        readiness: { readyCount: 1, warningCount: 0, blockedCount: 0 },
        sourceTypeBreakdown: [],
        taskTypeBreakdown: [],
        reporting: {
          topicFissionSceneBreakdown: [],
          proxyScoreVsObservedSpearman: input?.strategy?.proxySpearman ?? 0.4,
          proxyScoreVsObservedSampleCount: input?.strategy?.proxySampleCount ?? 22,
          strategyManualScoreSpearman: input?.strategy?.manualSpearman ?? null,
          strategyManualScoreSampleCount: input?.strategy?.manualSampleCount ?? 0,
          evidenceLabelPrecision: null,
          evidenceLabelRecall: null,
          evidenceLabelSampleCount: 0,
          rhythmDeviationVsReadCompletionCorrelation: null,
          rhythmDeviationVsReadCompletionSampleCount: 0,
          rhythmDeviationVsReadCompletionPValue: null,
        },
      },
      {
        key: "evidence_hook",
        label: "证据爆点",
        description: "",
        promptIds: [],
        datasetCount: 1,
        activeDatasetCount: 1,
        sampleCount: input?.evidence?.sampleCount ?? 22,
        enabledCaseCount: 22,
        disabledCaseCount: 0,
        runCount: 0,
        linkedFeedbackCount: 0,
        latestRunAt: null,
        readiness: { readyCount: 1, warningCount: 0, blockedCount: 0 },
        sourceTypeBreakdown: [],
        taskTypeBreakdown: [],
        reporting: {
          topicFissionSceneBreakdown: [],
          proxyScoreVsObservedSpearman: null,
          proxyScoreVsObservedSampleCount: 0,
          strategyManualScoreSpearman: null,
          strategyManualScoreSampleCount: 0,
          evidenceLabelPrecision: input?.evidence?.precision ?? null,
          evidenceLabelRecall: input?.evidence?.recall ?? null,
          evidenceLabelSampleCount: input?.evidence?.labelSampleCount ?? 0,
          rhythmDeviationVsReadCompletionCorrelation: null,
          rhythmDeviationVsReadCompletionSampleCount: 0,
          rhythmDeviationVsReadCompletionPValue: null,
        },
      },
      {
        key: "rhythm_consistency",
        label: "原型节奏",
        description: "",
        promptIds: [],
        datasetCount: 1,
        activeDatasetCount: 1,
        sampleCount: input?.rhythm?.sampleCount ?? 22,
        enabledCaseCount: 22,
        disabledCaseCount: 0,
        runCount: 0,
        linkedFeedbackCount: input?.rhythm?.linkedFeedbackCount ?? 0,
        latestRunAt: null,
        readiness: { readyCount: 1, warningCount: 0, blockedCount: 0 },
        sourceTypeBreakdown: [],
        taskTypeBreakdown: [],
        reporting: {
          topicFissionSceneBreakdown: [],
          proxyScoreVsObservedSpearman: null,
          proxyScoreVsObservedSampleCount: 0,
          strategyManualScoreSpearman: null,
          strategyManualScoreSampleCount: 0,
          evidenceLabelPrecision: null,
          evidenceLabelRecall: null,
          evidenceLabelSampleCount: 0,
          rhythmDeviationVsReadCompletionCorrelation: input?.rhythm?.correlation ?? null,
          rhythmDeviationVsReadCompletionSampleCount: input?.rhythm?.pairSampleCount ?? 0,
          rhythmDeviationVsReadCompletionPValue: input?.rhythm?.pValue ?? null,
        },
      },
    ],
  };
}

function buildPlan17BusinessReportFixture(input?: {
  authorLift?: Partial<{
    activatedAuthorCount: number;
    comparableAuthorCount: number;
    improvedAuthorCount: number;
    nonDegradedAuthorCount: number;
    averageLiftPp: number | null;
    medianLiftPp: number | null;
    baselineMedianHitRate: number | null;
    currentMedianHitRate: number | null;
    minimumReviewedCountPerWindow: number;
    windowDays: number;
  }>;
  fissionVsRadar?: Partial<{
    fissionReviewedCount: number;
    fissionHitCount: number;
    fissionHitRate: number | null;
    radarReviewedCount: number;
    radarHitCount: number;
    radarHitRate: number | null;
    hitRateDeltaPp: number | null;
  }>;
  matrix?: Partial<{
    matrixAuthorCount: number;
    comparableAuthorCount: number;
    qualityComparableAuthorCount: number;
    nonDegradedQualityAuthorCount: number;
    batchCount: number;
    batchLinkedArticleCount: number;
    weeklyOutputMedianBefore: number | null;
    weeklyOutputMedianAfter: number | null;
    weeklyOutputGrowthPp: number | null;
    hitRateMedianBefore: number | null;
    hitRateMedianAfter: number | null;
    observedQualityDeltaPp: number | null;
    windowWeeks: number;
  }>;
  styleUsage?: Partial<{
    totalUsageEventCount: number;
    multiSampleUsageEventCount: number;
    multiSampleUsageShare: number | null;
    recent30dUsageEventCount: number;
    recent30dMultiSampleUsageEventCount: number;
    recent30dMultiSampleUsageShare: number | null;
    profileCount: number;
    recent30dProfileCount: number;
    authorCount: number;
    recent30dAuthorCount: number;
  }>;
}) {
  return {
    generatedAt: "2026-04-21T00:00:00.000Z",
    authorLiftVsBaseline: {
      activatedAuthorCount: input?.authorLift?.activatedAuthorCount ?? 4,
      comparableAuthorCount: input?.authorLift?.comparableAuthorCount ?? 3,
      improvedAuthorCount: input?.authorLift?.improvedAuthorCount ?? 3,
      nonDegradedAuthorCount: input?.authorLift?.nonDegradedAuthorCount ?? 3,
      averageLiftPp: input?.authorLift?.averageLiftPp ?? 6,
      medianLiftPp: input?.authorLift?.medianLiftPp ?? 5.5,
      baselineMedianHitRate: input?.authorLift?.baselineMedianHitRate ?? 32,
      currentMedianHitRate: input?.authorLift?.currentMedianHitRate ?? 38,
      minimumReviewedCountPerWindow: input?.authorLift?.minimumReviewedCountPerWindow ?? 3,
      windowDays: input?.authorLift?.windowDays ?? 30,
    },
    fissionVsRadar: {
      fissionReviewedCount: input?.fissionVsRadar?.fissionReviewedCount ?? 6,
      fissionHitCount: input?.fissionVsRadar?.fissionHitCount ?? 3,
      fissionHitRate: input?.fissionVsRadar?.fissionHitRate ?? 50,
      radarReviewedCount: input?.fissionVsRadar?.radarReviewedCount ?? 5,
      radarHitCount: input?.fissionVsRadar?.radarHitCount ?? 2,
      radarHitRate: input?.fissionVsRadar?.radarHitRate ?? 40,
      hitRateDeltaPp: input?.fissionVsRadar?.hitRateDeltaPp ?? 10,
      fissionModeBreakdown: [],
    },
    matrixWeeklyOutput: {
      matrixAuthorCount: input?.matrix?.matrixAuthorCount ?? 4,
      comparableAuthorCount: input?.matrix?.comparableAuthorCount ?? 3,
      qualityComparableAuthorCount: input?.matrix?.qualityComparableAuthorCount ?? 3,
      nonDegradedQualityAuthorCount: input?.matrix?.nonDegradedQualityAuthorCount ?? 3,
      batchCount: input?.matrix?.batchCount ?? 4,
      batchLinkedArticleCount: input?.matrix?.batchLinkedArticleCount ?? 24,
      weeklyOutputMedianBefore: input?.matrix?.weeklyOutputMedianBefore ?? 4,
      weeklyOutputMedianAfter: input?.matrix?.weeklyOutputMedianAfter ?? 6,
      weeklyOutputGrowthPp: input?.matrix?.weeklyOutputGrowthPp ?? 50,
      hitRateMedianBefore: input?.matrix?.hitRateMedianBefore ?? 30,
      hitRateMedianAfter: input?.matrix?.hitRateMedianAfter ?? 31,
      observedQualityDeltaPp: input?.matrix?.observedQualityDeltaPp ?? 1,
      windowWeeks: input?.matrix?.windowWeeks ?? 4,
    },
    styleHeatmapUsage: {
      totalUsageEventCount: input?.styleUsage?.totalUsageEventCount ?? 20,
      multiSampleUsageEventCount: input?.styleUsage?.multiSampleUsageEventCount ?? 12,
      multiSampleUsageShare: input?.styleUsage?.multiSampleUsageShare ?? 60,
      recent30dUsageEventCount: input?.styleUsage?.recent30dUsageEventCount ?? 10,
      recent30dMultiSampleUsageEventCount: input?.styleUsage?.recent30dMultiSampleUsageEventCount ?? 6,
      recent30dMultiSampleUsageShare: input?.styleUsage?.recent30dMultiSampleUsageShare ?? 60,
      profileCount: input?.styleUsage?.profileCount ?? 5,
      recent30dProfileCount: input?.styleUsage?.recent30dProfileCount ?? 3,
      authorCount: input?.styleUsage?.authorCount ?? 4,
      recent30dAuthorCount: input?.styleUsage?.recent30dAuthorCount ?? 3,
    },
    batchDrilldown: {
      batchCount: 0,
      linkedArticleCount: 0,
      reviewedArticleCount: 0,
      pendingReviewArticleCount: 0,
      hitArticleCount: 0,
      nearMissArticleCount: 0,
      missArticleCount: 0,
      reviewCoverage: null,
      hitRate: null,
      items: [],
    },
    authorLiftDrilldown: [],
    matrixAuthorDrilldown: [],
    styleUsageDrilldown: [],
    fissionVsRadarDrilldown: [],
  };
}

function buildPlan17NonFunctionalFixture(input?: {
  topicFissionFirstByte?: Partial<{
    observationCount: number;
    sampleCount: number;
    completedCount: number;
    failedCount: number;
    avgMs: number | null;
    p95Ms: number | null;
    latestObservedAt: string | null;
  }>;
  topicFissionTotal?: Partial<{
    observationCount: number;
    sampleCount: number;
    completedCount: number;
    failedCount: number;
    avgMs: number | null;
    p95Ms: number | null;
    latestObservedAt: string | null;
  }>;
  strengthAudit?: Partial<{
    observationCount: number;
    sampleCount: number;
    completedCount: number;
    failedCount: number;
    avgMs: number | null;
    p95Ms: number | null;
    latestObservedAt: string | null;
  }>;
  batchIsolation?: Partial<{
    observationCount: number;
    batchCount: number;
    completedItemCount: number;
    failedItemCount: number;
    failureBatchCount: number;
    isolatedFailureBatchCount: number;
    isolationRate: number | null;
    latestObservedAt: string | null;
  }>;
  promptSafety?: Partial<{
    scannedCount: 8;
    unsafeFiles: string[];
  }>;
}): Parameters<typeof evaluatePlan17NonFunctionalAcceptance>[0] {
  return {
    topicFissionFirstByteLatency: {
      metricKey: "topicFission.sse.firstByte",
      observationCount: input?.topicFissionFirstByte?.observationCount ?? 8,
      sampleCount: input?.topicFissionFirstByte?.sampleCount ?? 8,
      completedCount: input?.topicFissionFirstByte?.completedCount ?? 8,
      failedCount: input?.topicFissionFirstByte?.failedCount ?? 0,
      avgMs: input?.topicFissionFirstByte?.avgMs ?? 1200,
      p95Ms: input?.topicFissionFirstByte?.p95Ms ?? 1800,
      latestObservedAt: input?.topicFissionFirstByte?.latestObservedAt ?? "2026-04-21T00:00:00.000Z",
    },
    topicFissionTotalLatency: {
      metricKey: "topicFission.sse.total",
      observationCount: input?.topicFissionTotal?.observationCount ?? 8,
      sampleCount: input?.topicFissionTotal?.sampleCount ?? 8,
      completedCount: input?.topicFissionTotal?.completedCount ?? 8,
      failedCount: input?.topicFissionTotal?.failedCount ?? 0,
      avgMs: input?.topicFissionTotal?.avgMs ?? 12000,
      p95Ms: input?.topicFissionTotal?.p95Ms ?? 18000,
      latestObservedAt: input?.topicFissionTotal?.latestObservedAt ?? "2026-04-21T00:00:00.000Z",
    },
    strengthAuditLatency: {
      metricKey: "strategyCard.strengthAudit.route",
      observationCount: input?.strengthAudit?.observationCount ?? 8,
      sampleCount: input?.strengthAudit?.sampleCount ?? 8,
      completedCount: input?.strengthAudit?.completedCount ?? 8,
      failedCount: input?.strengthAudit?.failedCount ?? 0,
      avgMs: input?.strengthAudit?.avgMs ?? 320,
      p95Ms: input?.strengthAudit?.p95Ms ?? 420,
      latestObservedAt: input?.strengthAudit?.latestObservedAt ?? "2026-04-21T00:00:00.000Z",
    },
    batchIsolation: {
      metricKey: "topicBacklogGenerate.item",
      observationCount: input?.batchIsolation?.observationCount ?? 12,
      batchCount: input?.batchIsolation?.batchCount ?? 4,
      completedItemCount: input?.batchIsolation?.completedItemCount ?? 10,
      failedItemCount: input?.batchIsolation?.failedItemCount ?? 2,
      failureBatchCount: input?.batchIsolation?.failureBatchCount ?? 2,
      isolatedFailureBatchCount: input?.batchIsolation?.isolatedFailureBatchCount ?? 2,
      isolationRate: input?.batchIsolation?.isolationRate ?? 1,
      latestObservedAt: input?.batchIsolation?.latestObservedAt ?? "2026-04-21T00:00:00.000Z",
    },
    promptSafety: {
      scannedCount: input?.promptSafety?.scannedCount ?? 8,
      unsafeFiles: input?.promptSafety?.unsafeFiles ?? [],
    },
  };
}

test("evaluateFissionVsRadarAcceptance passes when fission hit rate is not lower than radar", () => {
  const result = evaluateFissionVsRadarAcceptance({
    fissionReviewedCount: 6,
    radarReviewedCount: 5,
    fissionHitRate: 0.5,
    radarHitRate: 0.4,
  });

  assert.equal(result.status, "passed");
  assert.match(result.detail, /不低于基线 radar/);
});

test("evaluateFissionVsRadarAcceptance stays partial when 7d samples are insufficient", () => {
  const result = evaluateFissionVsRadarAcceptance({
    fissionReviewedCount: 2,
    radarReviewedCount: 1,
    fissionHitRate: 1,
    radarHitRate: 0,
  });

  assert.equal(result.status, "partial");
  assert.match(result.detail, /样本还不足/);
});

test("summarizeAcceptanceSection marks blocked when any item is blocked", () => {
  const section = summarizeAcceptanceSection("quality", "11.2 质量验收", [
    { key: "a", label: "A", status: "passed", detail: "ok" },
    { key: "b", label: "B", status: "blocked", detail: "missing" },
    { key: "c", label: "C", status: "partial", detail: "partial" },
  ]);

  assert.equal(section.status, "blocked");
  assert.equal(section.passedCount, 1);
  assert.equal(section.totalCount, 3);
});

test("evaluatePlan17FunctionalAcceptance marks blocked when required prompts are missing or nav drifts", () => {
  const section = evaluatePlan17FunctionalAcceptance(
    buildFunctionalAcceptanceFixture({
      presentPromptIds: [
        "topicFission.regularity",
        "topicFission.contrast",
        "strategyCard.autoDraft",
      ],
      activePromptIds: [
        "topicFission.regularity",
        "strategyCard.autoDraft",
      ],
      navLabels: ["作战台", "灵感", "复盘", "设置"],
    }),
  );

  assert.equal(section.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "topicFissionModes")?.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "promptAdminVisibility")?.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "writerNavStable")?.status, "blocked");
});

test("evaluatePlan17FunctionalAcceptance passes when required prompt scenes and nav are all stable", () => {
  const section = evaluatePlan17FunctionalAcceptance(buildFunctionalAcceptanceFixture());

  assert.equal(section.status, "passed");
  assert.equal(section.passedCount, section.totalCount);
  assert.equal(section.items.every((item) => item.status === "passed"), true);
});

test("evaluatePlan17QualityAcceptance marks blocked when any quality gate is below hard threshold", () => {
  const section = evaluatePlan17QualityAcceptance({
    report: buildPlan17QualityReportFixture({
      topicFission: {
        sceneBreakdown: [
          {
            sceneKey: "regularity",
            promptId: "topicFission.regularity",
            label: "regularity",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 16,
            stableHitRate: 16 / 24,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "contrast",
            promptId: "topicFission.contrast",
            label: "contrast",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 18,
            stableHitRate: 0.75,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "crossDomain",
            promptId: "topicFission.crossDomain",
            label: "crossDomain",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 17,
            stableHitRate: 17 / 24,
            failedCaseCount: 1,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
      strategy: {
        manualSampleCount: 20,
        manualSpearman: 0.72,
      },
      evidence: {
        labelSampleCount: 20,
        precision: 0.8,
        recall: 0.7,
      },
      rhythm: {
        linkedFeedbackCount: 20,
        pairSampleCount: 20,
        correlation: -0.42,
        pValue: 0.04,
      },
    }),
  });

  assert.equal(section.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "topicFissionEval")?.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "strategySpearman")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "evidenceHookPR")?.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "rhythmCorrelation")?.status, "passed");
});

test("evaluatePlan17QualityAcceptance marks partial when buckets exist but true acceptance samples are still insufficient", () => {
  const section = evaluatePlan17QualityAcceptance({
    report: buildPlan17QualityReportFixture({
      topicFission: {
        sceneBreakdown: [
          {
            sceneKey: "regularity",
            promptId: "topicFission.regularity",
            label: "regularity",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 12,
            stableHitCaseCount: 8,
            stableHitRate: 8 / 12,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "contrast",
            promptId: "topicFission.contrast",
            label: "contrast",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 13,
            stableHitCaseCount: 9,
            stableHitRate: 9 / 13,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "crossDomain",
            promptId: "topicFission.crossDomain",
            label: "crossDomain",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 11,
            stableHitCaseCount: 7,
            stableHitRate: 7 / 11,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
      strategy: {
        manualSampleCount: 12,
        manualSpearman: null,
      },
      evidence: {
        labelSampleCount: 8,
        precision: null,
        recall: null,
      },
      rhythm: {
        linkedFeedbackCount: 6,
        pairSampleCount: 9,
        correlation: null,
        pValue: null,
      },
    }),
  });

  assert.equal(section.status, "partial");
  assert.equal(section.items.find((item) => item.key === "topicFissionEval")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "strategySpearman")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "evidenceHookPR")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "rhythmCorrelation")?.status, "partial");
});

test("evaluatePlan17QualityAcceptance passes when all four quality gates meet final thresholds", () => {
  const section = evaluatePlan17QualityAcceptance({
    report: buildPlan17QualityReportFixture({
      topicFission: {
        sceneBreakdown: [
          {
            sceneKey: "regularity",
            promptId: "topicFission.regularity",
            label: "regularity",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 18,
            stableHitRate: 0.75,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "contrast",
            promptId: "topicFission.contrast",
            label: "contrast",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 18,
            stableHitRate: 0.75,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
          {
            sceneKey: "crossDomain",
            promptId: "topicFission.crossDomain",
            label: "crossDomain",
            activeVersion: "v1",
            evaluatedCaseCount: 24,
            stableCaseCount: 24,
            stableHitCaseCount: 17,
            stableHitRate: 17 / 24,
            failedCaseCount: 0,
            runCount: 24,
            latestRunAt: "2026-04-21T00:00:00.000Z",
          },
        ],
      },
      strategy: {
        manualSampleCount: 20,
        manualSpearman: 0.82,
      },
      evidence: {
        labelSampleCount: 20,
        precision: 0.81,
        recall: 0.84,
      },
      rhythm: {
        linkedFeedbackCount: 20,
        pairSampleCount: 20,
        correlation: -0.51,
        pValue: 0.01,
      },
    }),
  });

  assert.equal(section.status, "passed");
  assert.equal(section.passedCount, 4);
  assert.equal(section.items.every((item) => item.status === "passed"), true);
});

test("evaluatePlan17BusinessAcceptance marks blocked when any business gate misses a hard threshold", () => {
  const section = evaluatePlan17BusinessAcceptance({
    report: buildPlan17BusinessReportFixture({
      styleUsage: {
        recent30dUsageEventCount: 10,
        recent30dMultiSampleUsageEventCount: 4,
        recent30dMultiSampleUsageShare: 40,
      },
    }),
  });

  assert.equal(section.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "authorLiftVsBaseline")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "fissionVsRadar")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "matrixWeeklyOutput")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "styleHeatmapUsage")?.status, "blocked");
});

test("evaluatePlan17BusinessAcceptance marks partial when comparison windows exist but samples are still insufficient", () => {
  const section = evaluatePlan17BusinessAcceptance({
    report: buildPlan17BusinessReportFixture({
      authorLift: {
        activatedAuthorCount: 2,
        comparableAuthorCount: 2,
        averageLiftPp: 4,
      },
      fissionVsRadar: {
        fissionReviewedCount: 2,
        radarReviewedCount: 2,
        fissionHitCount: 1,
        radarHitCount: 1,
        fissionHitRate: 50,
        radarHitRate: 50,
        hitRateDeltaPp: 0,
      },
      matrix: {
        matrixAuthorCount: 3,
        comparableAuthorCount: 2,
        qualityComparableAuthorCount: 2,
        nonDegradedQualityAuthorCount: 2,
        batchCount: 3,
        batchLinkedArticleCount: 12,
        weeklyOutputGrowthPp: 40,
      },
    }),
  });

  assert.equal(section.status, "partial");
  assert.equal(section.items.find((item) => item.key === "authorLiftVsBaseline")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "fissionVsRadar")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "matrixWeeklyOutput")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "styleHeatmapUsage")?.status, "passed");
});

test("evaluatePlan17BusinessAcceptance passes when all four business gates meet final thresholds", () => {
  const section = evaluatePlan17BusinessAcceptance({
    report: buildPlan17BusinessReportFixture(),
  });

  assert.equal(section.status, "passed");
  assert.equal(section.passedCount, 4);
  assert.equal(section.items.every((item) => item.status === "passed"), true);
});

test("evaluatePlan17NonFunctionalAcceptance marks blocked when any non-functional gate misses a hard threshold", () => {
  const section = evaluatePlan17NonFunctionalAcceptance(
    buildPlan17NonFunctionalFixture({
      topicFissionFirstByte: {
        p95Ms: 2400,
      },
      topicFissionTotal: {
        p95Ms: 21000,
      },
      promptSafety: {
        unsafeFiles: ["apps/web/src/lib/generation.ts"],
      },
    }),
  );

  assert.equal(section.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "topicFissionSseLatency")?.status, "blocked");
  assert.equal(section.items.find((item) => item.key === "strengthAuditLatency")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "batchIsolation")?.status, "passed");
  assert.equal(section.items.find((item) => item.key === "promptSafety")?.status, "blocked");
});

test("evaluatePlan17NonFunctionalAcceptance marks partial when runtime samples exist but are still insufficient", () => {
  const section = evaluatePlan17NonFunctionalAcceptance(
    buildPlan17NonFunctionalFixture({
      topicFissionFirstByte: {
        sampleCount: 2,
        completedCount: 2,
        observationCount: 2,
      },
      topicFissionTotal: {
        sampleCount: 2,
        completedCount: 2,
        observationCount: 2,
      },
      strengthAudit: {
        sampleCount: 4,
        completedCount: 4,
        observationCount: 4,
      },
      batchIsolation: {
        batchCount: 3,
        failureBatchCount: 0,
        isolatedFailureBatchCount: 0,
        isolationRate: null,
      },
    }),
  );

  assert.equal(section.status, "partial");
  assert.equal(section.items.find((item) => item.key === "topicFissionSseLatency")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "strengthAuditLatency")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "batchIsolation")?.status, "partial");
  assert.equal(section.items.find((item) => item.key === "promptSafety")?.status, "passed");
});

test("evaluatePlan17NonFunctionalAcceptance passes when all four non-functional gates meet final thresholds", () => {
  const section = evaluatePlan17NonFunctionalAcceptance(buildPlan17NonFunctionalFixture());

  assert.equal(section.status, "passed");
  assert.equal(section.passedCount, 4);
  assert.equal(section.items.every((item) => item.status === "passed"), true);
});

test("summarizePlan17AcceptanceReport keeps overallStatus partial when any section is passed or partial", () => {
  const report = summarizePlan17AcceptanceReport([
    summarizeAcceptanceSection("functional", "11.1 功能验收", [
      { key: "functional-a", label: "A", status: "passed", detail: "ok" },
    ]),
    summarizeAcceptanceSection("quality", "11.2 质量验收", [
      { key: "quality-a", label: "A", status: "blocked", detail: "missing" },
    ]),
    summarizeAcceptanceSection("business", "11.3 业务验收", [
      { key: "business-a", label: "A", status: "partial", detail: "warming up" },
    ]),
  ], "2026-04-21T00:00:00.000Z");

  assert.equal(report.overallStatus, "partial");
  assert.equal(report.summary.passedCount, 1);
  assert.equal(report.summary.blockedCount, 1);
  assert.equal(report.summary.partialCount, 1);
});

test("summarizePlan17AcceptanceReport sorts topGaps by severity and caps at eight items", () => {
  const report = summarizePlan17AcceptanceReport([
    summarizeAcceptanceSection("functional", "11.1 功能验收", [
      { key: "f-1", label: "F1", status: "blocked", detail: "blocked-1" },
      { key: "f-2", label: "F2", status: "blocked", detail: "blocked-2" },
      { key: "f-3", label: "F3", status: "partial", detail: "partial-1" },
    ]),
    summarizeAcceptanceSection("quality", "11.2 质量验收", [
      { key: "q-1", label: "Q1", status: "blocked", detail: "blocked-3" },
      { key: "q-2", label: "Q2", status: "partial", detail: "partial-2" },
      { key: "q-3", label: "Q3", status: "partial", detail: "partial-3" },
    ]),
    summarizeAcceptanceSection("business", "11.3 业务验收", [
      { key: "b-1", label: "B1", status: "blocked", detail: "blocked-4" },
      { key: "b-2", label: "B2", status: "partial", detail: "partial-4" },
      { key: "b-3", label: "B3", status: "partial", detail: "partial-5" },
    ]),
  ], "2026-04-21T00:00:00.000Z");

  assert.equal(report.topGaps.length, 8);
  assert.deepEqual(
    report.topGaps.map((item) => item.key),
    ["f-1", "f-2", "q-1", "b-1", "f-3", "q-2", "q-3", "b-2"],
  );
  assert.equal(report.topGaps.every((item) => item.status === "blocked"), false);
  assert.equal(report.topGaps.slice(0, 4).every((item) => item.status === "blocked"), true);
});
