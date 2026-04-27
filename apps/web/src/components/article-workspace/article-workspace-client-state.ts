import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import type { ReviewSeriesPlaybook } from "@/lib/article-outcomes";
import type { ArticleStatus } from "@/lib/domain";
import {
  buildFourPointWritebackDrafts,
  type FourPointAuditDimension,
  getStrategyCardMissingFields,
} from "@/lib/article-strategy";
import { getStrategyDraftValue } from "@/lib/article-workspace-helpers";
import { getDefaultWorkspaceViewForStageCode } from "./authoring-phase";
import type {
  AudienceSelectionDraft,
  FactCheckSelectionDraft,
  OutlineSelectionDraft,
} from "./stage-selection-drafts";
import type { WorkspacePublishPreviewState, WorkspaceView } from "./types";
import {
  buildStrategyCardItem,
  type EvidenceItem,
  type ExternalFetchIssueRecord,
  type StrategyCardItem,
} from "./article-workspace-client-data";
import type {
  ArticleEditorClientProps,
  DiffState,
  HistoryReferenceSelectionItem,
  HistoryReferenceSuggestionItem,
  OutlineMaterialsState,
} from "./article-workspace-client-types";

type UseArticleWorkspaceClientStateInput = {
  article: ArticleEditorClientProps["article"];
  seriesOptions: ArticleEditorClientProps["seriesOptions"];
  initialNodes: ArticleEditorClientProps["nodes"];
  initialFragments: ArticleEditorClientProps["fragments"];
  initialConnections: ArticleEditorClientProps["connections"];
  initialSnapshots: ArticleEditorClientProps["snapshots"];
  recentSyncLogs: ArticleEditorClientProps["recentSyncLogs"];
  initialStrategyCard: ArticleEditorClientProps["initialStrategyCard"];
  initialEvidenceItems: ArticleEditorClientProps["initialEvidenceItems"];
  initialOutcomeBundle: ArticleEditorClientProps["initialOutcomeBundle"];
  initialWorkflow: ArticleEditorClientProps["workflow"];
  initialStageArtifacts: ArticleEditorClientProps["stageArtifacts"];
  knowledgeCards: ArticleEditorClientProps["knowledgeCards"];
  currentSeriesPlaybook: ReviewSeriesPlaybook | null;
  initialCoverImageQuota: ArticleEditorClientProps["coverImageQuota"];
  initialImageAssetQuota: ArticleEditorClientProps["imageAssetQuota"];
  initialCoverImageCandidates: ArticleEditorClientProps["initialCoverImageCandidates"];
  initialImagePrompts: ArticleEditorClientProps["initialImagePrompts"];
  initialCoverImage: ArticleEditorClientProps["initialCoverImage"];
};

export function useArticleWorkspaceClientState(input: UseArticleWorkspaceClientStateInput) {
  const [title, setTitle] = useState(input.article.title);
  const [markdown, setMarkdown] = useState(input.article.markdownContent);
  const [htmlPreview, setHtmlPreview] = useState(input.article.htmlContent);
  const [status, setStatus] = useState<ArticleStatus | "generating">(() =>
    normalizeArticleStatus(input.article.status),
  );
  const [seriesId, setSeriesId] = useState<number | null>(
    input.article.seriesId ?? (input.seriesOptions.length === 1 ? input.seriesOptions[0].id : null),
  );
  const [wechatTemplateId, setWechatTemplateId] = useState<string | null>(input.article.wechatTemplateId);
  const [nodes, setNodes] = useState(input.initialNodes);
  const [fragmentPool, setFragmentPool] = useState(input.initialFragments);
  const [wechatConnections, setWechatConnections] = useState(input.initialConnections);
  const [syncLogs, setSyncLogs] = useState(input.recentSyncLogs);
  const [strategyCard, setStrategyCard] = useState<StrategyCardItem>(() =>
    input.initialStrategyCard.id > 0
      ? input.initialStrategyCard
      : buildStrategyCardItem({
          base: input.initialStrategyCard,
          archetype: input.initialStrategyCard.archetype ?? "",
          mainstreamBelief: input.initialStrategyCard.mainstreamBelief ?? "",
          targetReader: "",
          coreAssertion: "",
          whyNow: "",
          researchHypothesis: "",
          marketPositionInsight: "",
          historicalTurningPoint: "",
          targetPackage: "",
          publishWindow: "",
          endingAction: "",
          firstHandObservation: "",
          feltMoment: "",
          whyThisHitMe: "",
          realSceneOrDialogue: "",
          wantToComplain: "",
          nonDelegableTruth: "",
          whyNowHints: input.initialStrategyCard.whyNowHints,
        }),
  );
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>(() =>
    input.initialEvidenceItems.filter((item) => item.id > 0),
  );
  const [evidenceDraftItems, setEvidenceDraftItems] = useState<EvidenceItem[]>(input.initialEvidenceItems);
  const [articleOutcomeBundle, setArticleOutcomeBundle] = useState(input.initialOutcomeBundle);
  const [knowledgeCardItems, setKnowledgeCardItems] = useState(input.knowledgeCards);
  const [workflow, setWorkflow] = useState(input.initialWorkflow);
  const [stageArtifacts, setStageArtifacts] = useState(input.initialStageArtifacts);
  const [view, setView] = useState<WorkspaceView>(() =>
    getDefaultWorkspaceViewForStageCode(input.initialWorkflow.currentStageCode),
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => {
    const preferred =
      input.initialConnections.find((connection) => connection.isDefault) ?? input.initialConnections[0];
    return preferred?.id ? String(preferred.id) : "";
  });
  const [snapshots, setSnapshots] = useState(input.initialSnapshots);
  const [snapshotNote, setSnapshotNote] = useState("");
  const requestedMainStepHandledRef = useRef<string | null>(null);
  const [diffState, setDiffState] = useState<DiffState>(null);
  const [saveState, setSaveState] = useState("未保存");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [coverImage, setCoverImage] = useState(input.initialCoverImage);
  const [coverImageCandidates, setCoverImageCandidates] = useState(input.initialCoverImageCandidates);
  const [coverImageQuota, setCoverImageQuota] = useState(input.initialCoverImageQuota);
  const [imageAssetQuota, setImageAssetQuota] = useState(input.initialImageAssetQuota);
  const [imagePrompts, setImagePrompts] = useState(input.initialImagePrompts);
  const [coverImageReferenceDataUrl, setCoverImageReferenceDataUrl] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [selectingCoverCandidateId, setSelectingCoverCandidateId] = useState<number | null>(null);
  const [savingImagePrompts, setSavingImagePrompts] = useState(false);
  const [generatingInlineImages, setGeneratingInlineImages] = useState(false);
  const [insertingVisualAssets, setInsertingVisualAssets] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [retryingPublish, setRetryingPublish] = useState(false);
  const [loadingDiffId, setLoadingDiffId] = useState<number | null>(null);
  const [refreshingKnowledgeId, setRefreshingKnowledgeId] = useState<number | null>(null);
  const [expandedKnowledgeCardId, setExpandedKnowledgeCardId] = useState<number | null>(
    input.knowledgeCards[0]?.id ?? null,
  );
  const [highlightedKnowledgeCardId, setHighlightedKnowledgeCardId] = useState<number | null>(null);
  const [updatingWorkflowCode, setUpdatingWorkflowCode] = useState<string | null>(null);
  const [generatingStageArtifactCode, setGeneratingStageArtifactCode] = useState<string | null>(null);
  const [applyingStageArtifactCode, setApplyingStageArtifactCode] = useState<string | null>(null);
  const [syncingOutlineArtifact, setSyncingOutlineArtifact] = useState(false);
  const [savingAudienceSelection, setSavingAudienceSelection] = useState(false);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [loadingPublishPreview, setLoadingPublishPreview] = useState(false);
  const [refreshingPublishPreview, setRefreshingPublishPreview] = useState(false);
  const [deepWritingPrototypeOverride, setDeepWritingPrototypeOverride] = useState<string | null>(null);
  const [deepWritingStateVariantOverride, setDeepWritingStateVariantOverride] = useState<string | null>(null);
  const [deepWritingOpeningPreviewLoadingKey, setDeepWritingOpeningPreviewLoadingKey] = useState<string | null>(
    null,
  );
  const [deepWritingOpeningPreviews, setDeepWritingOpeningPreviews] = useState<Record<string, string>>({});
  const [deepWritingOpeningCheckLoading, setDeepWritingOpeningCheckLoading] = useState(false);
  const [publishPreview, setPublishPreview] = useState<WorkspacePublishPreviewState | null>(null);
  const [pendingPublishIntent, setPendingPublishIntent] = useState(
    input.initialWorkflow.pendingPublishIntent ?? null,
  );
  const [factCheckEvidenceUrl, setFactCheckEvidenceUrl] = useState("");
  const [addingFactCheckEvidence, setAddingFactCheckEvidence] = useState(false);
  const [factCheckEvidenceIssue, setFactCheckEvidenceIssue] = useState<null | {
    url: string;
    degradedReason: string;
    retryRecommended: boolean;
  }>(null);
  const [recentFactCheckEvidenceIssues, setRecentFactCheckEvidenceIssues] = useState<
    ExternalFetchIssueRecord[]
  >([]);
  const factCheckRetryableCount = recentFactCheckEvidenceIssues.filter(
    (item) => item.retryRecommended && !item.resolvedAt,
  ).length;
  const factCheckRecoveredCount = recentFactCheckEvidenceIssues
    .filter((item) => item.recoveryCount > 0)
    .reduce((sum, item) => sum + item.recoveryCount, 0);
  const [showMobileInspector, setShowMobileInspector] = useState(false);
  const [showWechatConnectModal, setShowWechatConnectModal] = useState(false);
  const [wechatConnectSubmitting, setWechatConnectSubmitting] = useState(false);
  const [continuePublishAfterWechatConnect, setContinuePublishAfterWechatConnect] = useState(false);
  const [wechatConnectAccountName, setWechatConnectAccountName] = useState("");
  const [wechatConnectOriginalId, setWechatConnectOriginalId] = useState("");
  const [wechatConnectAppId, setWechatConnectAppId] = useState("");
  const [wechatConnectAppSecret, setWechatConnectAppSecret] = useState("");
  const [wechatConnectIsDefault, setWechatConnectIsDefault] = useState(
    input.initialConnections.length === 0,
  );
  const [wechatConnectMessage, setWechatConnectMessage] = useState("");
  const [selectedOutcomeWindowCode, setSelectedOutcomeWindowCode] = useState<"24h" | "72h" | "7d">(
    input.initialOutcomeBundle.nextWindowCode ?? "24h",
  );
  const [outcomeReadCount, setOutcomeReadCount] = useState("0");
  const [outcomeShareCount, setOutcomeShareCount] = useState("0");
  const [outcomeLikeCount, setOutcomeLikeCount] = useState("0");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [outcomeTargetPackage, setOutcomeTargetPackage] = useState(
    input.initialOutcomeBundle.outcome?.targetPackage ?? input.initialStrategyCard.targetPackage ?? "",
  );
  const [outcomeHitStatus, setOutcomeHitStatus] = useState<"pending" | "hit" | "near_miss" | "miss">(
    input.initialOutcomeBundle.outcome?.hitStatus ?? "pending",
  );
  const [outcomeReviewSummary, setOutcomeReviewSummary] = useState(
    input.initialOutcomeBundle.outcome?.reviewSummary ?? "",
  );
  const [outcomeNextAction, setOutcomeNextAction] = useState(
    input.initialOutcomeBundle.outcome?.nextAction ?? "",
  );
  const [outcomePlaybookTagsInput, setOutcomePlaybookTagsInput] = useState(
    input.initialOutcomeBundle.outcome?.playbookTags.join("，") ?? "",
  );
  const [savingOutcomeSnapshot, setSavingOutcomeSnapshot] = useState(false);
  const [seriesPlaybook, setSeriesPlaybook] = useState<ReviewSeriesPlaybook | null>(
    input.currentSeriesPlaybook,
  );
  const [loadingSeriesPlaybook, setLoadingSeriesPlaybook] = useState(false);
  const [audienceSelectionDraft, setAudienceSelectionDraft] = useState<AudienceSelectionDraft>({
    selectedReaderLabel: "",
    selectedLanguageGuidance: "",
    selectedBackgroundAwareness: "",
    selectedReadabilityLevel: "",
    selectedCallToAction: "",
  });
  const [outlineSelectionDraft, setOutlineSelectionDraft] = useState<OutlineSelectionDraft>({
    selectedTitle: "",
    selectedTitleStyle: "",
    selectedOpeningHook: "",
    selectedTargetEmotion: "",
    selectedEndingStrategy: "",
  });
  const [outlineMaterials, setOutlineMaterials] = useState<OutlineMaterialsState | null>(null);
  const [loadingOutlineMaterials, setLoadingOutlineMaterials] = useState(false);
  const [savingOutlineMaterials, setSavingOutlineMaterials] = useState(false);
  const [strategyTargetReader, setStrategyTargetReader] = useState(
    input.initialStrategyCard.targetReader ?? "",
  );
  const [strategyCoreAssertion, setStrategyCoreAssertion] = useState(
    input.initialStrategyCard.coreAssertion ?? "",
  );
  const [strategyWhyNow, setStrategyWhyNow] = useState(input.initialStrategyCard.whyNow ?? "");
  const [strategyArchetype, setStrategyArchetype] = useState<StrategyCardItem["archetype"]>(
    input.initialStrategyCard.archetype ?? null,
  );
  const [strategyMainstreamBelief, setStrategyMainstreamBelief] = useState(
    input.initialStrategyCard.mainstreamBelief ?? "",
  );
  const [strategyResearchHypothesis, setStrategyResearchHypothesis] = useState(
    input.initialStrategyCard.researchHypothesis ?? "",
  );
  const [strategyMarketPositionInsight, setStrategyMarketPositionInsight] = useState(
    input.initialStrategyCard.marketPositionInsight ?? "",
  );
  const [strategyHistoricalTurningPoint, setStrategyHistoricalTurningPoint] = useState(
    input.initialStrategyCard.historicalTurningPoint ?? "",
  );
  const [strategyTargetPackage, setStrategyTargetPackage] = useState(
    input.initialStrategyCard.targetPackage ?? "",
  );
  const [strategyPublishWindow, setStrategyPublishWindow] = useState(
    input.initialStrategyCard.publishWindow ?? "",
  );
  const [strategyEndingAction, setStrategyEndingAction] = useState(
    input.initialStrategyCard.endingAction ?? "",
  );
  const [strategyFirstHandObservation, setStrategyFirstHandObservation] = useState(
    input.initialStrategyCard.firstHandObservation ?? "",
  );
  const [strategyFeltMoment, setStrategyFeltMoment] = useState(
    input.initialStrategyCard.feltMoment ?? "",
  );
  const [strategyWhyThisHitMe, setStrategyWhyThisHitMe] = useState(
    input.initialStrategyCard.whyThisHitMe ?? "",
  );
  const [strategyRealSceneOrDialogue, setStrategyRealSceneOrDialogue] = useState(
    input.initialStrategyCard.realSceneOrDialogue ?? "",
  );
  const [strategyWantToComplain, setStrategyWantToComplain] = useState(
    input.initialStrategyCard.wantToComplain ?? "",
  );
  const [strategyNonDelegableTruth, setStrategyNonDelegableTruth] = useState(
    input.initialStrategyCard.nonDelegableTruth ?? "",
  );
  const [strategyViewMode, setStrategyViewMode] = useState<"author" | "penjian">("author");
  const [savingStrategyCard, setSavingStrategyCard] = useState(false);
  const [auditingStrategyCard, setAuditingStrategyCard] = useState(false);
  const [lockingStrategyCard, setLockingStrategyCard] = useState(false);
  const [reversingStrategyCardDimension, setReversingStrategyCardDimension] =
    useState<FourPointAuditDimension | null>(null);
  const [savingEvidenceItems, setSavingEvidenceItems] = useState(false);
  const [taggingEvidenceItems, setTaggingEvidenceItems] = useState(false);
  const [showImaEvidenceDrawer, setShowImaEvidenceDrawer] = useState(false);
  const strategyCardDraft = useMemo(
    () =>
      buildStrategyCardItem({
        base: strategyCard,
        archetype: strategyArchetype,
        mainstreamBelief: strategyMainstreamBelief,
        targetReader: strategyTargetReader,
        coreAssertion: strategyCoreAssertion,
        whyNow: strategyWhyNow,
        researchHypothesis: strategyResearchHypothesis,
        marketPositionInsight: strategyMarketPositionInsight,
        historicalTurningPoint: strategyHistoricalTurningPoint,
        targetPackage: strategyTargetPackage,
        publishWindow: strategyPublishWindow,
        endingAction: strategyEndingAction,
        firstHandObservation: strategyFirstHandObservation,
        feltMoment: strategyFeltMoment,
        whyThisHitMe: strategyWhyThisHitMe,
        realSceneOrDialogue: strategyRealSceneOrDialogue,
        wantToComplain: strategyWantToComplain,
        nonDelegableTruth: strategyNonDelegableTruth,
        whyNowHints: strategyCard.whyNowHints,
      }),
    [
      strategyCard,
      strategyArchetype,
      strategyCoreAssertion,
      strategyEndingAction,
      strategyFeltMoment,
      strategyFirstHandObservation,
      strategyNonDelegableTruth,
      strategyPublishWindow,
      strategyResearchHypothesis,
      strategyMainstreamBelief,
      strategyTargetPackage,
      strategyTargetReader,
      strategyHistoricalTurningPoint,
      strategyMarketPositionInsight,
      strategyRealSceneOrDialogue,
      strategyWantToComplain,
      strategyWhyNow,
      strategyWhyThisHitMe,
    ],
  );
  const [strategyFourPointDrafts, setStrategyFourPointDrafts] = useState<
    Record<FourPointAuditDimension, string>
  >(() => buildFourPointWritebackDrafts(input.initialStrategyCard));

  useEffect(() => {
    setStrategyFourPointDrafts(buildFourPointWritebackDrafts(strategyCardDraft));
  }, [
    strategyCardDraft.mainstreamBelief,
    strategyCardDraft.coreAssertion,
    strategyCardDraft.realSceneOrDialogue,
    strategyCardDraft.feltMoment,
    strategyCardDraft.firstHandObservation,
    strategyCardDraft.wantToComplain,
    strategyCardDraft.nonDelegableTruth,
  ]);

  const strategyCardMissingFields = useMemo(
    () => getStrategyCardMissingFields(strategyCardDraft),
    [strategyCardDraft],
  );
  const savedStrategyCardMissingFields = useMemo(
    () => getStrategyCardMissingFields(strategyCard),
    [strategyCard],
  );
  const strategyCardIsComplete = strategyCardMissingFields.length === 0;
  const savedStrategyCardIsComplete = savedStrategyCardMissingFields.length === 0;
  const strategyCardHasUnsavedChanges = useMemo(
    () =>
      getStrategyDraftValue(strategyCard.archetype) !== strategyCardDraft.archetype ||
      getStrategyDraftValue(strategyCard.mainstreamBelief) !== strategyCardDraft.mainstreamBelief ||
      getStrategyDraftValue(strategyCard.targetReader) !== strategyCardDraft.targetReader ||
      getStrategyDraftValue(strategyCard.coreAssertion) !== strategyCardDraft.coreAssertion ||
      getStrategyDraftValue(strategyCard.whyNow) !== strategyCardDraft.whyNow ||
      getStrategyDraftValue(strategyCard.researchHypothesis) !== strategyCardDraft.researchHypothesis ||
      getStrategyDraftValue(strategyCard.marketPositionInsight) !== strategyCardDraft.marketPositionInsight ||
      getStrategyDraftValue(strategyCard.historicalTurningPoint) !== strategyCardDraft.historicalTurningPoint ||
      getStrategyDraftValue(strategyCard.targetPackage) !== strategyCardDraft.targetPackage ||
      getStrategyDraftValue(strategyCard.publishWindow) !== strategyCardDraft.publishWindow ||
      getStrategyDraftValue(strategyCard.endingAction) !== strategyCardDraft.endingAction ||
      getStrategyDraftValue(strategyCard.firstHandObservation) !== strategyCardDraft.firstHandObservation ||
      getStrategyDraftValue(strategyCard.feltMoment) !== strategyCardDraft.feltMoment ||
      getStrategyDraftValue(strategyCard.whyThisHitMe) !== strategyCardDraft.whyThisHitMe ||
      getStrategyDraftValue(strategyCard.realSceneOrDialogue) !== strategyCardDraft.realSceneOrDialogue ||
      getStrategyDraftValue(strategyCard.wantToComplain) !== strategyCardDraft.wantToComplain ||
      getStrategyDraftValue(strategyCard.nonDelegableTruth) !== strategyCardDraft.nonDelegableTruth,
    [strategyCard, strategyCardDraft],
  );
  const [supplementalViewpointsDraft, setSupplementalViewpointsDraft] = useState<string[]>(["", "", ""]);
  const [outlineMaterialNodeId, setOutlineMaterialNodeId] = useState<string>(
    input.initialNodes[0]?.id ? String(input.initialNodes[0].id) : "",
  );
  const [outlineMaterialFragmentId, setOutlineMaterialFragmentId] = useState("");
  const [outlineMaterialUsageMode, setOutlineMaterialUsageMode] = useState<"rewrite" | "image">(
    "rewrite",
  );
  const [outlineMaterialCreateMode, setOutlineMaterialCreateMode] = useState<
    "manual" | "url" | "screenshot"
  >("manual");
  const [outlineMaterialTitle, setOutlineMaterialTitle] = useState("");
  const [outlineMaterialContent, setOutlineMaterialContent] = useState("");
  const [outlineMaterialUrl, setOutlineMaterialUrl] = useState("");
  const [outlineMaterialImageDataUrl, setOutlineMaterialImageDataUrl] = useState<string | null>(null);
  const [outlineMaterialScreenshotFileName, setOutlineMaterialScreenshotFileName] = useState("");
  const [factCheckSelectionDraft, setFactCheckSelectionDraft] = useState<FactCheckSelectionDraft>({
    claimDecisions: [],
  });
  const [historyReferenceSuggestions, setHistoryReferenceSuggestions] = useState<
    HistoryReferenceSuggestionItem[]
  >([]);
  const [selectedHistoryReferences, setSelectedHistoryReferences] = useState<
    HistoryReferenceSelectionItem[]
  >([]);
  const [loadingHistoryReferences, setLoadingHistoryReferences] = useState(false);
  const [savingHistoryReferences, setSavingHistoryReferences] = useState(false);
  const lastSavedRef = useRef({
    title: input.article.title,
    markdown: input.article.markdownContent,
    status: normalizeArticleStatus(input.article.status),
    seriesId:
      input.article.seriesId ?? (input.seriesOptions.length === 1 ? input.seriesOptions[0].id : null),
    wechatTemplateId: input.article.wechatTemplateId,
  });
  const outlineMaterialScreenshotInputRef = useRef<HTMLInputElement | null>(null);

  return {
    title,
    setTitle,
    markdown,
    setMarkdown,
    htmlPreview,
    setHtmlPreview,
    status,
    setStatus,
    seriesId,
    setSeriesId,
    wechatTemplateId,
    setWechatTemplateId,
    nodes,
    setNodes,
    fragmentPool,
    setFragmentPool,
    wechatConnections,
    setWechatConnections,
    syncLogs,
    setSyncLogs,
    strategyCard,
    setStrategyCard,
    evidenceItems,
    setEvidenceItems,
    evidenceDraftItems,
    setEvidenceDraftItems,
    articleOutcomeBundle,
    setArticleOutcomeBundle,
    knowledgeCardItems,
    setKnowledgeCardItems,
    workflow,
    setWorkflow,
    stageArtifacts,
    setStageArtifacts,
    view,
    setView,
    selectedConnectionId,
    setSelectedConnectionId,
    snapshots,
    setSnapshots,
    snapshotNote,
    setSnapshotNote,
    requestedMainStepHandledRef,
    diffState,
    setDiffState,
    saveState,
    setSaveState,
    message,
    setMessage,
    generating,
    setGenerating,
    coverImage,
    setCoverImage,
    coverImageCandidates,
    setCoverImageCandidates,
    coverImageQuota,
    setCoverImageQuota,
    imageAssetQuota,
    setImageAssetQuota,
    imagePrompts,
    setImagePrompts,
    coverImageReferenceDataUrl,
    setCoverImageReferenceDataUrl,
    generatingCover,
    setGeneratingCover,
    selectingCoverCandidateId,
    setSelectingCoverCandidateId,
    savingImagePrompts,
    setSavingImagePrompts,
    generatingInlineImages,
    setGeneratingInlineImages,
    insertingVisualAssets,
    setInsertingVisualAssets,
    publishing,
    setPublishing,
    retryingPublish,
    setRetryingPublish,
    loadingDiffId,
    setLoadingDiffId,
    refreshingKnowledgeId,
    setRefreshingKnowledgeId,
    expandedKnowledgeCardId,
    setExpandedKnowledgeCardId,
    highlightedKnowledgeCardId,
    setHighlightedKnowledgeCardId,
    updatingWorkflowCode,
    setUpdatingWorkflowCode,
    generatingStageArtifactCode,
    setGeneratingStageArtifactCode,
    applyingStageArtifactCode,
    setApplyingStageArtifactCode,
    syncingOutlineArtifact,
    setSyncingOutlineArtifact,
    savingAudienceSelection,
    setSavingAudienceSelection,
    applyingLayout,
    setApplyingLayout,
    loadingPublishPreview,
    setLoadingPublishPreview,
    refreshingPublishPreview,
    setRefreshingPublishPreview,
    deepWritingPrototypeOverride,
    setDeepWritingPrototypeOverride,
    deepWritingStateVariantOverride,
    setDeepWritingStateVariantOverride,
    deepWritingOpeningPreviewLoadingKey,
    setDeepWritingOpeningPreviewLoadingKey,
    deepWritingOpeningPreviews,
    setDeepWritingOpeningPreviews,
    deepWritingOpeningCheckLoading,
    setDeepWritingOpeningCheckLoading,
    publishPreview,
    setPublishPreview,
    pendingPublishIntent,
    setPendingPublishIntent,
    factCheckEvidenceUrl,
    setFactCheckEvidenceUrl,
    addingFactCheckEvidence,
    setAddingFactCheckEvidence,
    factCheckEvidenceIssue,
    setFactCheckEvidenceIssue,
    recentFactCheckEvidenceIssues,
    setRecentFactCheckEvidenceIssues,
    factCheckRetryableCount,
    factCheckRecoveredCount,
    showMobileInspector,
    setShowMobileInspector,
    showWechatConnectModal,
    setShowWechatConnectModal,
    wechatConnectSubmitting,
    setWechatConnectSubmitting,
    continuePublishAfterWechatConnect,
    setContinuePublishAfterWechatConnect,
    wechatConnectAccountName,
    setWechatConnectAccountName,
    wechatConnectOriginalId,
    setWechatConnectOriginalId,
    wechatConnectAppId,
    setWechatConnectAppId,
    wechatConnectAppSecret,
    setWechatConnectAppSecret,
    wechatConnectIsDefault,
    setWechatConnectIsDefault,
    wechatConnectMessage,
    setWechatConnectMessage,
    selectedOutcomeWindowCode,
    setSelectedOutcomeWindowCode,
    outcomeReadCount,
    setOutcomeReadCount,
    outcomeShareCount,
    setOutcomeShareCount,
    outcomeLikeCount,
    setOutcomeLikeCount,
    outcomeNotes,
    setOutcomeNotes,
    outcomeTargetPackage,
    setOutcomeTargetPackage,
    outcomeHitStatus,
    setOutcomeHitStatus,
    outcomeReviewSummary,
    setOutcomeReviewSummary,
    outcomeNextAction,
    setOutcomeNextAction,
    outcomePlaybookTagsInput,
    setOutcomePlaybookTagsInput,
    savingOutcomeSnapshot,
    setSavingOutcomeSnapshot,
    seriesPlaybook,
    setSeriesPlaybook,
    loadingSeriesPlaybook,
    setLoadingSeriesPlaybook,
    audienceSelectionDraft,
    setAudienceSelectionDraft,
    outlineSelectionDraft,
    setOutlineSelectionDraft,
    outlineMaterials,
    setOutlineMaterials,
    loadingOutlineMaterials,
    setLoadingOutlineMaterials,
    savingOutlineMaterials,
    setSavingOutlineMaterials,
    strategyTargetReader,
    setStrategyTargetReader,
    strategyCoreAssertion,
    setStrategyCoreAssertion,
    strategyWhyNow,
    setStrategyWhyNow,
    strategyArchetype,
    setStrategyArchetype,
    strategyMainstreamBelief,
    setStrategyMainstreamBelief,
    strategyResearchHypothesis,
    setStrategyResearchHypothesis,
    strategyMarketPositionInsight,
    setStrategyMarketPositionInsight,
    strategyHistoricalTurningPoint,
    setStrategyHistoricalTurningPoint,
    strategyTargetPackage,
    setStrategyTargetPackage,
    strategyPublishWindow,
    setStrategyPublishWindow,
    strategyEndingAction,
    setStrategyEndingAction,
    strategyFirstHandObservation,
    setStrategyFirstHandObservation,
    strategyFeltMoment,
    setStrategyFeltMoment,
    strategyWhyThisHitMe,
    setStrategyWhyThisHitMe,
    strategyRealSceneOrDialogue,
    setStrategyRealSceneOrDialogue,
    strategyWantToComplain,
    setStrategyWantToComplain,
    strategyNonDelegableTruth,
    setStrategyNonDelegableTruth,
    strategyViewMode,
    setStrategyViewMode,
    savingStrategyCard,
    setSavingStrategyCard,
    auditingStrategyCard,
    setAuditingStrategyCard,
    lockingStrategyCard,
    setLockingStrategyCard,
    reversingStrategyCardDimension,
    setReversingStrategyCardDimension,
    savingEvidenceItems,
    setSavingEvidenceItems,
    taggingEvidenceItems,
    setTaggingEvidenceItems,
    showImaEvidenceDrawer,
    setShowImaEvidenceDrawer,
    strategyCardDraft,
    strategyFourPointDrafts,
    setStrategyFourPointDrafts,
    strategyCardMissingFields,
    savedStrategyCardMissingFields,
    strategyCardIsComplete,
    savedStrategyCardIsComplete,
    strategyCardHasUnsavedChanges,
    supplementalViewpointsDraft,
    setSupplementalViewpointsDraft,
    outlineMaterialNodeId,
    setOutlineMaterialNodeId,
    outlineMaterialFragmentId,
    setOutlineMaterialFragmentId,
    outlineMaterialUsageMode,
    setOutlineMaterialUsageMode,
    outlineMaterialCreateMode,
    setOutlineMaterialCreateMode,
    outlineMaterialTitle,
    setOutlineMaterialTitle,
    outlineMaterialContent,
    setOutlineMaterialContent,
    outlineMaterialUrl,
    setOutlineMaterialUrl,
    outlineMaterialImageDataUrl,
    setOutlineMaterialImageDataUrl,
    outlineMaterialScreenshotFileName,
    setOutlineMaterialScreenshotFileName,
    factCheckSelectionDraft,
    setFactCheckSelectionDraft,
    historyReferenceSuggestions,
    setHistoryReferenceSuggestions,
    selectedHistoryReferences,
    setSelectedHistoryReferences,
    loadingHistoryReferences,
    setLoadingHistoryReferences,
    savingHistoryReferences,
    setSavingHistoryReferences,
    lastSavedRef,
    outlineMaterialScreenshotInputRef,
  };
}
