import { analyzeAiNoise } from "@/lib/ai-noise-scan";
import { buildSuggestedEvidenceItems, getArticleEvidenceStats } from "@/lib/article-evidence";
import { getResearchBriefGenerationGate } from "@/lib/article-research";
import { STRATEGY_ARCHETYPE_OPTIONS } from "@/lib/article-strategy";
import {
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
  getRecordBoolean,
  getRecordNumber,
  getRecordString,
  getRecordStringArray,
  getWeakestWritingQualityLayerSummary,
} from "@/lib/article-workspace-helpers";
import {
  formatOutcomeRhythmStatusLabel,
  formatResearchCoverageSufficiencyLabel,
  formatTopicAttributionSourceLabel,
  formatTopicFissionModeLabel,
} from "@/lib/article-workspace-formatters";
import type { ArticleStatus } from "@/lib/domain";
import type { ImageAuthoringStyleContext } from "@/lib/image-authoring-context";
import { buildVisualSuggestion } from "@/lib/image-prompting";
import { buildWritingDiversityReport } from "@/lib/writing-diversity";
import { buildWritingQualityPanel } from "@/lib/writing-quality";
import {
  ARTICLE_MAIN_STEPS,
  buildEvidenceItemSignature,
  getArticleMainStepByStageCode,
  type EvidenceItem,
  type OutlineMaterialNodeItem,
  type StageArtifactItem,
  type StrategyCardItem,
} from "./article-workspace-client-data";
import type { WechatConnectionItem } from "./article-workspace-publish-actions";
import { getAudienceSelectionDraft, getFactCheckSelectionDraft, getOutlineSelectionDraft } from "./stage-selection-drafts";

type OutcomeWindowCode = "24h" | "72h" | "7d";

type ArticleOutcomeBundleInput = {
  outcome:
    | (Record<string, unknown> & {
        targetPackage?: string | null;
        scorecard: Record<string, unknown>;
        attribution: Record<string, unknown> | null;
        hitStatus?: "pending" | "hit" | "near_miss" | "miss";
        reviewSummary?: string | null;
        nextAction?: string | null;
        playbookTags?: string[];
      })
    | null;
  snapshots: Array<
    Record<string, unknown> & {
      windowCode: OutcomeWindowCode;
      readCount: number;
      shareCount: number;
      likeCount: number;
      notes: string | null;
      writingStateFeedback?: Record<string, unknown> | null;
    }
  >;
};

type WorkflowInput = {
  currentStageCode: string;
  stages: Array<{ code: string; title: string; status: "pending" | "current" | "completed" | "failed" }>;
};

type SeriesInput = {
  targetAudience: string | null;
  thesis: string | null;
} | null;

type SeriesInsightInput = {
  reason: string | null;
} | null;

type OutlineMaterialsInput = {
  nodes: OutlineMaterialNodeItem[];
} | null;

type ArticleWorkspaceDerivedStateInput = {
  article: { id: number; title: string };
  title: string;
  markdown: string;
  status: ArticleStatus | "generating";
  authoringContext: ImageAuthoringStyleContext | null;
  wechatConnections: WechatConnectionItem[];
  selectedConnectionId: string | null;
  articleOutcomeBundle: ArticleOutcomeBundleInput;
  selectedOutcomeWindowCode: OutcomeWindowCode;
  nodes: OutlineMaterialNodeItem[];
  outlineMaterials: OutlineMaterialsInput;
  stageArtifacts: StageArtifactItem[];
  workflow: WorkflowInput;
  selectedSeries: SeriesInput;
  seriesInsight: SeriesInsightInput;
  strategyCard: Pick<StrategyCardItem, "whyNowHints">;
  strategyCardDraft: Pick<StrategyCardItem, "humanSignalScore" | "firstHandObservation" | "realSceneOrDialogue" | "nonDelegableTruth">;
  outcomeTargetPackage: string;
  evidenceDraftItems: EvidenceItem[];
  evidenceItems: EvidenceItem[];
  recentArticles: Array<{ id: number; title: string; markdownContent: string; updatedAt: string }>;
  recentDeepWritingStates: Array<{ id: number; title: string; updatedAt: string; payload: Record<string, unknown> | null }>;
  liveLanguageGuardHitsCount: number;
};

function findStageArtifact(stageArtifacts: StageArtifactItem[], stageCode: string) {
  return stageArtifacts.find((item) => item.stageCode === stageCode) ?? null;
}

export function buildArticleWorkspaceDerivedState({
  article,
  title,
  markdown,
  status,
  authoringContext,
  wechatConnections,
  selectedConnectionId,
  articleOutcomeBundle,
  selectedOutcomeWindowCode,
  nodes,
  outlineMaterials,
  stageArtifacts,
  workflow,
  selectedSeries,
  seriesInsight,
  strategyCard,
  strategyCardDraft,
  outcomeTargetPackage,
  evidenceDraftItems,
  evidenceItems,
  recentArticles,
  recentDeepWritingStates,
  liveLanguageGuardHitsCount,
}: ArticleWorkspaceDerivedStateInput) {
  const selectedConnection =
    wechatConnections.find((connection) => String(connection.id) === selectedConnectionId) ?? null;
  const currentArticleOutcome = articleOutcomeBundle.outcome;
  const currentOutcomeSnapshot =
    articleOutcomeBundle.snapshots.find((snapshot) => snapshot.windowCode === selectedOutcomeWindowCode) ?? null;
  const visualSuggestion = buildVisualSuggestion(title, markdown, authoringContext);

  const activeNodes = outlineMaterials?.nodes ?? nodes;
  const allFragments = activeNodes.flatMap((node) => node.fragments);
  const uniqueFragmentIds = new Set(allFragments.map((fragment) => fragment.id));
  const uniqueSourceTypes = new Set(allFragments.map((fragment) => String(fragment.sourceType || "manual")));
  const screenshotCount = allFragments.filter(
    (fragment) => String(fragment.usageMode || "") === "image" || String(fragment.sourceType || "") === "screenshot",
  ).length;
  const outlineMaterialReadinessFlags = [
    uniqueFragmentIds.size < 2 ? "缺最小素材集" : null,
    uniqueSourceTypes.size <= 1 ? "信源过单一" : null,
    screenshotCount === 0 ? "缺证据型素材" : null,
  ].filter(Boolean) as string[];
  const outlineMaterialReadiness = {
    fragmentCount: uniqueFragmentIds.size,
    sourceTypeCount: uniqueSourceTypes.size,
    screenshotCount,
    score: Math.max(
      0,
      Math.min(
        100,
        100
          - (uniqueFragmentIds.size < 2 ? 40 : 0)
          - (uniqueSourceTypes.size <= 1 ? 25 : 0)
          - (screenshotCount === 0 ? 15 : 0),
      ),
    ),
    flags: outlineMaterialReadinessFlags,
    status:
      uniqueFragmentIds.size === 0
        ? "blocked"
        : uniqueSourceTypes.size <= 1
          ? "warning"
          : "passed",
    detail:
      uniqueFragmentIds.size === 0
        ? "当前大纲节点还没有挂素材，至少补 2 条文字素材再确认大纲。"
        : uniqueFragmentIds.size < 2
          ? "素材条数还不够，建议先补齐最小素材集，再继续确认标题和章节。"
          : uniqueSourceTypes.size <= 1
            ? "素材已挂入，但信源类型过于单一，建议补链接或截图证据。"
            : screenshotCount === 0
              ? "基础素材已够，但还缺证据型素材，后续事实核查会更容易卡住。"
              : `已挂 ${uniqueFragmentIds.size} 条素材，覆盖 ${uniqueSourceTypes.size} 类来源，当前可支撑大纲推进。`,
  } as const;

  const articleScorecardSummary = currentArticleOutcome?.scorecard
    ? {
        predictedScore: getRecordNumber(currentArticleOutcome.scorecard, "predictedScore"),
        qualityScore: getRecordNumber(currentArticleOutcome.scorecard, "qualityScore"),
        viralScore: getRecordNumber(currentArticleOutcome.scorecard, "viralScore"),
        riskPenalty: getRecordNumber(currentArticleOutcome.scorecard, "riskPenalty"),
        summary: getRecordString(currentArticleOutcome.scorecard, "summary"),
        blockers: getRecordStringArray(currentArticleOutcome.scorecard, "blockers"),
        aiNoiseScore: getRecordNumber(getPayloadRecord(currentArticleOutcome.scorecard, "aiNoise"), "score"),
        aiNoiseLevel: getRecordString(getPayloadRecord(currentArticleOutcome.scorecard, "aiNoise"), "level"),
      }
    : null;

  const articleOutcomeAttributionSummary = currentArticleOutcome?.attribution
    ? (() => {
        const topic = getPayloadRecord(currentArticleOutcome.attribution, "topic");
        const strategy = getPayloadRecord(currentArticleOutcome.attribution, "strategy");
        const evidence = getPayloadRecord(currentArticleOutcome.attribution, "evidence");
        const rhythm = getPayloadRecord(currentArticleOutcome.attribution, "rhythm");
        const archetypeKey = getRecordString(strategy, "archetype");
        const resolvedArchetypeLabel = archetypeKey
          ? (STRATEGY_ARCHETYPE_OPTIONS.find((item) => item.key === archetypeKey)?.label ?? archetypeKey)
          : "未记录";
        const fissionMode = getRecordString(topic, "fissionMode");
        const primaryHookComboLabel = getRecordString(evidence, "primaryHookComboLabel");
        const dominantHookTags = getRecordStringArray(evidence, "dominantHookTags");

        return {
          topicSummary: topic
            ? [
                formatTopicAttributionSourceLabel(getRecordString(topic, "source") || null),
                getRecordString(topic, "sourceTrackLabel") || null,
                getRecordString(topic, "backlogName") || null,
                fissionMode ? formatTopicFissionModeLabel(fissionMode) : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "未记录",
          predictedFlipStrength: getRecordNumber(topic, "predictedFlipStrength"),
          archetypeLabel: resolvedArchetypeLabel,
          fourPointAverageScore: getRecordNumber(strategy, "fourPointAverageScore"),
          humanSignalScore: getRecordNumber(strategy, "humanSignalScore"),
          strategyOverride: getRecordBoolean(strategy, "strategyOverride"),
          hookLabel: primaryHookComboLabel || dominantHookTags.join(" / ") || "未记录",
          hookTagCoverageCount: getRecordNumber(evidence, "hookTagCoverageCount"),
          hookStrengthAverage: getRecordNumber(evidence, "hookStrengthAverage"),
          rhythmStatusLabel: formatOutcomeRhythmStatusLabel(getRecordString(rhythm, "status") || null),
          rhythmScore: getRecordNumber(rhythm, "score"),
          rhythmDetail: getRecordString(rhythm, "detail") || "当前还没有节奏归因说明。",
        };
      })()
    : null;

  const audienceArtifact = findStageArtifact(stageArtifacts, "audienceAnalysis");
  const outlineArtifact = findStageArtifact(stageArtifacts, "outlinePlanning");
  const deepWritingArtifact = findStageArtifact(stageArtifacts, "deepWriting");
  const factCheckArtifact = findStageArtifact(stageArtifacts, "factCheck");
  const prosePolishArtifact = findStageArtifact(stageArtifacts, "prosePolish");
  const researchArtifact = findStageArtifact(stageArtifacts, "researchBrief");
  const currentStage = workflow.stages.find((stage) => stage.code === workflow.currentStageCode) ?? workflow.stages[0] ?? null;
  const currentArticleMainStep =
    status === "published"
      ? ARTICLE_MAIN_STEPS[ARTICLE_MAIN_STEPS.length - 1]
      : getArticleMainStepByStageCode(workflow.currentStageCode);
  const currentStageArtifact = findStageArtifact(stageArtifacts, workflow.currentStageCode);
  const currentStagePayload = currentStageArtifact?.payload ?? null;
  const currentAudienceSelection = getAudienceSelectionDraft(currentStageArtifact?.payload);
  const currentOutlineSelection = getOutlineSelectionDraft(currentStageArtifact?.payload);
  const currentFactCheckSelection = getFactCheckSelectionDraft(currentStageArtifact?.payload);
  const audienceSelectionState = getAudienceSelectionDraft(audienceArtifact?.payload);
  const outlineSelectionState = getOutlineSelectionDraft(outlineArtifact?.payload);
  const liveAiNoise = analyzeAiNoise(markdown);
  const activeAiNoiseRecord =
    getPayloadRecord(prosePolishArtifact?.payload, "aiNoise") ?? (liveAiNoise as unknown as Record<string, unknown>);
  const activeAiNoiseScore = Number(activeAiNoiseRecord?.score ?? 0);
  const historyPlanCount = getPayloadRecordArray(deepWritingArtifact?.payload, "historyReferencePlan").length;
  const strategySuggestedValues = {
    targetReader:
      audienceSelectionState.selectedReaderLabel
      || getRecordString(audienceArtifact?.payload, "coreReaderLabel")
      || selectedSeries?.targetAudience
      || "",
    coreAssertion: getRecordString(outlineArtifact?.payload, "centralThesis") || selectedSeries?.thesis || "",
    whyNow: strategyCard.whyNowHints.join("；") || seriesInsight?.reason || "",
    targetPackage: outcomeTargetPackage.trim() || "",
    publishWindow: "",
    endingAction:
      audienceSelectionState.selectedCallToAction
      || getRecordString(audienceArtifact?.payload, "recommendedCallToAction")
      || outlineSelectionState.selectedEndingStrategy
      || getRecordString(outlineArtifact?.payload, "endingStrategy")
      || "",
  };
  const suggestedEvidenceItems = buildSuggestedEvidenceItems({
    nodes: outlineMaterials?.nodes ?? nodes,
    factCheckPayload: factCheckArtifact?.payload ?? null,
  });
  const evidenceDraftStats = getArticleEvidenceStats(evidenceDraftItems);
  const savedEvidenceStats = getArticleEvidenceStats(evidenceItems);
  const editorDiversityReport = buildWritingDiversityReport({
    currentArticle: {
      id: article.id,
      title,
      markdownContent: markdown,
    },
    deepWritingPayload: deepWritingArtifact?.payload ?? null,
    recentArticles,
    recentDeepWritingStates,
  });
  const editorQualityPanel = buildWritingQualityPanel({
    markdownContent: markdown,
    aiNoise: liveAiNoise,
    languageGuardHitsCount: liveLanguageGuardHitsCount,
    humanSignalScore: strategyCardDraft.humanSignalScore,
    hasRealScene: Boolean(strategyCardDraft.firstHandObservation || strategyCardDraft.realSceneOrDialogue),
    hasNonDelegableTruth: Boolean(strategyCardDraft.nonDelegableTruth),
    materialReadiness: {
      attachedFragmentCount: evidenceDraftStats.itemCount,
      uniqueSourceTypeCount: evidenceDraftStats.uniqueSourceTypeCount,
      screenshotCount: evidenceDraftStats.screenshotEvidenceCount,
    },
    evidenceStats: {
      ready: evidenceDraftStats.ready,
      itemCount: evidenceDraftStats.itemCount,
      flags: evidenceDraftStats.flags,
    },
    missingEvidenceCount: getPayloadStringArray(factCheckArtifact?.payload, "missingEvidence").length,
    deepWritingPayload: deepWritingArtifact?.payload ?? null,
    researchBriefPayload: researchArtifact?.payload ?? null,
    diversityReport: editorDiversityReport,
  });
  const weakestLayer = getWeakestWritingQualityLayerSummary(editorQualityPanel);
  const prosePolishWeakestLayer = weakestLayer
    ? {
        title: weakestLayer.title,
        status: weakestLayer.status,
        suggestion: weakestLayer.suggestion,
      }
    : null;
  const prosePolishSelectedTitle =
    outlineSelectionState.selectedTitle || String(outlineArtifact?.payload?.workingTitle || article.title).trim() || "未确认";
  const prosePolishOutlinePayload = (outlineArtifact?.payload as Record<string, unknown> | null | undefined) ?? null;
  const evidenceHasUnsavedChanges = (() => {
    const left = evidenceDraftItems.map(buildEvidenceItemSignature);
    const right = evidenceItems.map(buildEvidenceItemSignature);
    return left.length !== right.length || left.some((item, index) => item !== right[index]);
  })();
  const outlineGapHintsForGuide = getPayloadStringArray(outlineArtifact?.payload, "materialGapHints");
  const titleConfirmedForGuide = Boolean(
    (outlineSelectionState.selectedTitle || "").trim() || String(outlineArtifact?.payload?.workingTitle || "").trim(),
  );
  const factCheckReady = Boolean(factCheckArtifact?.status === "ready" && factCheckArtifact?.payload);
  const prosePolishReady = Boolean(prosePolishArtifact?.status === "ready" && prosePolishArtifact?.payload);
  const researchTimelineCountForGuide = getPayloadRecordArray(researchArtifact?.payload, "timelineCards").length;
  const researchComparisonCountForGuide = getPayloadRecordArray(researchArtifact?.payload, "comparisonCards").length;
  const researchInsightCountForGuide = getPayloadRecordArray(researchArtifact?.payload, "intersectionInsights").length;
  const researchCoverageSufficiencyForGuide = String(
    getPayloadRecord(researchArtifact?.payload, "sourceCoverage")?.sufficiency || "",
  ).trim();
  const researchGenerationGate = getResearchBriefGenerationGate(researchArtifact?.payload ?? null);
  const generateBlockedByResearch = researchGenerationGate.generationBlocked;
  const generateBlockedMessage = researchGenerationGate.generationBlockReason;
  const researchStepSummary = (() => {
    const sourceCoverage = getPayloadRecord(researchArtifact?.payload, "sourceCoverage");
    const missingCategories = getPayloadStringArray(sourceCoverage, "missingCategories");
    const missingParts = [
      researchTimelineCountForGuide === 0 ? "时间脉络" : null,
      researchComparisonCountForGuide === 0 ? "横向比较" : null,
      researchInsightCountForGuide === 0 ? "交汇洞察" : null,
    ].filter(Boolean) as string[];

    if (!researchArtifact?.payload) {
      return {
        status: "needs_attention" as const,
        title: "研究底座还没启动",
        detail: "还没有研究简报。建议先生成一版，把时间脉络、横向比较和交汇洞察补齐后，再继续往下推进。",
        highlights: ["待补：时间脉络", "待补：横向比较", "待补：交汇洞察"],
      };
    }

    if (researchCoverageSufficiencyForGuide === "blocked") {
      return {
        status: "blocked" as const,
        title: "研究覆盖不足",
        detail:
          missingCategories.length > 0
            ? `当前研究仍缺这些来源类别：${missingCategories.join("、")}。现在更像观点草稿，不适合直接把判断写硬。`
            : "当前研究覆盖仍不足，建议继续补官方、行业、同类、用户或时间维度的信源。",
        highlights: missingCategories.map((item) => `缺口：${item}`),
      };
    }

    if (missingParts.length > 0) {
      return {
        status: "needs_attention" as const,
        title: "研究骨架还没闭合",
        detail: `研究简报已有骨架，但仍缺 ${missingParts.join("、")}，主判断还没有完全被研究层写硬。`,
        highlights: missingParts.map((item) => `待补：${item}`),
      };
    }

    return {
      status: "ready" as const,
      title: "研究底座已就位",
      detail: `当前已补齐 ${researchTimelineCountForGuide} 张时间脉络卡、${researchComparisonCountForGuide} 张横向比较卡和 ${researchInsightCountForGuide} 条交汇洞察，可继续推进策略、证据和成稿。`,
      highlights: [
        `时间脉络 ${researchTimelineCountForGuide}`,
        `横向比较 ${researchComparisonCountForGuide}`,
        `交汇洞察 ${researchInsightCountForGuide}`,
      ],
    };
  })();
  const researchCoverageRibbon = (() => {
    const sourceCoverage = getPayloadRecord(researchArtifact?.payload, "sourceCoverage");
    const dimensions = [
      { key: "official", label: "官方源" },
      { key: "industry", label: "行业源" },
      { key: "comparison", label: "同类源" },
      { key: "userVoice", label: "用户源" },
      { key: "timeline", label: "时间源" },
    ].map((item) => {
      const signals = getPayloadStringArray(sourceCoverage, item.key);
      return {
        ...item,
        signals,
        covered: signals.length > 0,
      };
    });
    const coveredCount = dimensions.filter((item) => item.covered).length;
    const missingCategories = getPayloadStringArray(sourceCoverage, "missingCategories");
    const gaps = Array.from(
      new Set(
        (missingCategories.length > 0 ? missingCategories : dimensions.filter((item) => !item.covered).map((item) => item.label))
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );

    return {
      dimensions,
      coveredCount,
      totalCount: dimensions.length,
      sufficiencyLabel: sourceCoverage
        ? formatResearchCoverageSufficiencyLabel(String(sourceCoverage.sufficiency || "").trim())
        : "研究未启动",
      note: String(sourceCoverage?.note || "").trim(),
      gaps,
    };
  })();

  return {
    selectedConnection,
    currentOutcomeSnapshot,
    visualSuggestion,
    outlineMaterialReadiness,
    articleScorecardSummary,
    articleOutcomeAttributionSummary,
    audienceArtifact,
    outlineArtifact,
    deepWritingArtifact,
    factCheckArtifact,
    prosePolishArtifact,
    researchArtifact,
    currentStage,
    currentArticleMainStep,
    currentStageArtifact,
    currentStagePayload,
    currentAudienceSelection,
    currentOutlineSelection,
    currentFactCheckSelection,
    audienceSelectionState,
    outlineSelectionState,
    liveAiNoise,
    activeAiNoiseRecord,
    activeAiNoiseScore,
    historyPlanCount,
    strategySuggestedValues,
    suggestedEvidenceItems,
    evidenceDraftStats,
    savedEvidenceStats,
    editorDiversityReport,
    editorQualityPanel,
    prosePolishWeakestLayer,
    prosePolishSelectedTitle,
    prosePolishOutlinePayload,
    evidenceHasUnsavedChanges,
    outlineGapHintsForGuide,
    titleConfirmedForGuide,
    factCheckReady,
    prosePolishReady,
    researchTimelineCountForGuide,
    researchComparisonCountForGuide,
    researchInsightCountForGuide,
    researchCoverageSufficiencyForGuide,
    researchGenerationGate,
    generateBlockedByResearch,
    generateBlockedMessage,
    researchStepSummary,
    researchCoverageRibbon,
  };
}
