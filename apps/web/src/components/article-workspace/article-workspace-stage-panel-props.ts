import type { ComponentProps } from "react";
import { getPayloadRecord, getPayloadRecordArray, getPayloadStringArray } from "@/lib/article-workspace-helpers";
import {
  formatFragmentSourceType,
  formatFragmentUsageMode,
  formatOutlineResearchFocusLabel,
  formatTitleAuditTimestamp,
  formatViewpointAction,
} from "@/lib/article-workspace-formatters";
import { CurrentStageArtifactView } from "./current-stage-artifact-view";
import type {
  ArticleFragmentItem,
  KnowledgeCardPanelItem,
  OutlineMaterialNodeItem,
} from "./article-workspace-client-data";
import {
  getFactCheckActionOptions,
  getFactCheckDecision,
  getOutlineOpeningOptionHookScore,
  getOutlineOpeningOptionPatternLabel,
  getOutlineOpeningOptionQualityCeiling,
  getOutlineOpeningOptionText,
  type FactCheckSelectionDraft,
  type OutlineSelectionDraft,
} from "./stage-selection-drafts";

type ArtifactViewProps = ComponentProps<typeof CurrentStageArtifactView>;
type FactCheckStagePanelProps = ArtifactViewProps["factCheckStagePanelProps"];
type ProsePolishStagePanelProps = ArtifactViewProps["prosePolishStagePanelProps"];
type OutlinePlanningMaterialsPanelProps = ArtifactViewProps["outlinePlanningMaterialsPanel"];

const referenceFusionLabels: Record<string, string> = {
  inspiration: "只借灵感",
  structure: "借结构",
  evidence: "抽证据",
  close_read: "精读拆解",
};

function getFragmentReferenceFusionMode(fragment: ArticleFragmentItem) {
  const sourceMeta = fragment.sourceMeta && typeof fragment.sourceMeta === "object" && !Array.isArray(fragment.sourceMeta)
    ? fragment.sourceMeta
    : null;
  const referenceFusion = getPayloadRecord(sourceMeta, "referenceFusion");
  const mode = String(sourceMeta?.referenceFusionMode || referenceFusion?.mode || "").trim();
  return mode || "";
}

function formatFragmentReferenceFusionLabel(fragment: ArticleFragmentItem) {
  const mode = getFragmentReferenceFusionMode(fragment);
  return referenceFusionLabels[mode] || "";
}

type StagePanelPropsBundle = Pick<
  ArtifactViewProps,
  | "factCheckStagePanelProps"
  | "prosePolishStagePanelProps"
  | "outlinePlanningMaterialsPanel"
  | "outlinePlanningSelectionPanel"
>;

type ArticleWorkspaceStagePanelPropsDeps = {
  currentStageArtifactPayload: Record<string, unknown> | null | undefined;
  outlineArtifactPayload: Record<string, unknown> | null | undefined;
  currentStagePayload: Record<string, unknown> | null | undefined;
  factCheckSelectionDraft: FactCheckSelectionDraft;
  factCheckEvidenceUrl: string;
  setFactCheckEvidenceUrl: (value: string) => void;
  addingFactCheckEvidence: boolean;
  handleFactCheckStageAddEvidenceSource: (urlOverride?: string) => void;
  factCheckEvidenceIssue: FactCheckStagePanelProps["evidenceIssue"];
  handleFactCheckStageClearEvidenceIssue: () => void;
  recentFactCheckEvidenceIssues: FactCheckStagePanelProps["recentEvidenceIssues"];
  factCheckRetryableCount: number;
  factCheckRecoveredCount: number;
  dismissFactCheckEvidenceIssue: (issueId: string) => void;
  updateFactCheckDecision: FactCheckStagePanelProps["onUpdateCheckDecision"];
  handleFactCheckStageOpenKnowledgeCard: (knowledgeCardId: number) => void;
  savingAudienceSelection: boolean;
  handleFactCheckStageSaveSelection: () => void;
  prosePolishSelectedTitle: string;
  prosePolishOutlinePayload: Record<string, unknown> | null;
  prosePolishRegeneratingTitles: boolean;
  regenerateOutlinePlanningTitleOptions: () => void;
  regenerateOutlinePlanningOpeningOptions: () => void;
  prosePolishWeakestLayer: ProsePolishStagePanelProps["weakestLayer"];
  editorQualityPanel: ProsePolishStagePanelProps["editorQualityPanel"];
  loadingOutlineMaterials: boolean;
  savingOutlineMaterials: boolean;
  refreshOutlinePlanningMaterials: () => void;
  outlineMaterialReadiness: {
    status: string;
    score: number;
    detail: string;
    fragmentCount: number;
    sourceTypeCount: number;
    screenshotCount: number;
    flags: string[];
  };
  knowledgeCardItems: KnowledgeCardPanelItem[];
  supplementalViewpointsDraft: string[];
  handleOutlinePlanningSupplementalViewpointChange: (index: number, value: string) => void;
  handleOutlinePlanningSaveSupplementalViewpoints: () => void;
  outlineMaterialNodeId: string;
  setOutlineMaterialNodeId: (value: string) => void;
  outlineMaterialUsageMode: "rewrite" | "image";
  setOutlineMaterialUsageMode: (value: "rewrite" | "image") => void;
  outlineMaterialReferenceFusionMode: string;
  setOutlineMaterialReferenceFusionMode: (value: string) => void;
  outlineMaterialFragmentId: string;
  setOutlineMaterialFragmentId: (value: string) => void;
  outlineMaterialsNodes: OutlineMaterialNodeItem[] | null | undefined;
  nodes: OutlineMaterialNodeItem[];
  fragmentPool: ArticleFragmentItem[];
  handleOutlinePlanningAttachExistingMaterial: () => void;
  handleOutlinePlanningUpdateMaterialReferenceFusion: () => void;
  outlineMaterialCreateMode: "manual" | "url" | "screenshot";
  setOutlineMaterialCreateMode: (value: "manual" | "url" | "screenshot") => void;
  outlineMaterialTitle: string;
  setOutlineMaterialTitle: (value: string) => void;
  outlineMaterialContent: string;
  setOutlineMaterialContent: (value: string) => void;
  outlineMaterialUrl: string;
  setOutlineMaterialUrl: (value: string) => void;
  outlineMaterialScreenshotInputRef: OutlinePlanningMaterialsPanelProps["screenshotInputRef"];
  handleOutlineMaterialScreenshotFileChange: OutlinePlanningMaterialsPanelProps["onScreenshotFileChange"];
  outlineMaterialScreenshotFileName: string;
  handleOutlinePlanningSubmitCreateMaterial: () => void;
  outlineSelectionDraft: OutlineSelectionDraft;
  generatingStageArtifactCode: string | null;
  updatingWorkflowCode: string | null;
  handleOutlinePlanningSelectTitle: (titleValue: string, styleValue: string) => void;
  handleOutlinePlanningSelectOpeningHook: (value: string) => void;
  handleOutlinePlanningSelectTargetEmotion: (value: string) => void;
  handleOutlinePlanningSelectEndingStrategy: (value: string) => void;
  handleOutlinePlanningSaveSelection: () => void;
};

export function buildArticleWorkspaceStagePanelProps({
  currentStageArtifactPayload,
  outlineArtifactPayload,
  currentStagePayload,
  factCheckSelectionDraft,
  factCheckEvidenceUrl,
  setFactCheckEvidenceUrl,
  addingFactCheckEvidence,
  handleFactCheckStageAddEvidenceSource,
  factCheckEvidenceIssue,
  handleFactCheckStageClearEvidenceIssue,
  recentFactCheckEvidenceIssues,
  factCheckRetryableCount,
  factCheckRecoveredCount,
  dismissFactCheckEvidenceIssue,
  updateFactCheckDecision,
  handleFactCheckStageOpenKnowledgeCard,
  savingAudienceSelection,
  handleFactCheckStageSaveSelection,
  prosePolishSelectedTitle,
  prosePolishOutlinePayload,
  prosePolishRegeneratingTitles,
  regenerateOutlinePlanningTitleOptions,
  regenerateOutlinePlanningOpeningOptions,
  prosePolishWeakestLayer,
  editorQualityPanel,
  loadingOutlineMaterials,
  savingOutlineMaterials,
  refreshOutlinePlanningMaterials,
  outlineMaterialReadiness,
  knowledgeCardItems,
  supplementalViewpointsDraft,
  handleOutlinePlanningSupplementalViewpointChange,
  handleOutlinePlanningSaveSupplementalViewpoints,
  outlineMaterialNodeId,
  setOutlineMaterialNodeId,
  outlineMaterialUsageMode,
  setOutlineMaterialUsageMode,
  outlineMaterialReferenceFusionMode,
  setOutlineMaterialReferenceFusionMode,
  outlineMaterialFragmentId,
  setOutlineMaterialFragmentId,
  outlineMaterialsNodes,
  nodes,
  fragmentPool,
  handleOutlinePlanningAttachExistingMaterial,
  handleOutlinePlanningUpdateMaterialReferenceFusion,
  outlineMaterialCreateMode,
  setOutlineMaterialCreateMode,
  outlineMaterialTitle,
  setOutlineMaterialTitle,
  outlineMaterialContent,
  setOutlineMaterialContent,
  outlineMaterialUrl,
  setOutlineMaterialUrl,
  outlineMaterialScreenshotInputRef,
  handleOutlineMaterialScreenshotFileChange,
  outlineMaterialScreenshotFileName,
  handleOutlinePlanningSubmitCreateMaterial,
  outlineSelectionDraft,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  handleOutlinePlanningSelectTitle,
  handleOutlinePlanningSelectOpeningHook,
  handleOutlinePlanningSelectTargetEmotion,
  handleOutlinePlanningSelectEndingStrategy,
  handleOutlinePlanningSaveSelection,
}: ArticleWorkspaceStagePanelPropsDeps): StagePanelPropsBundle {
  const outlineOpeningHookOptions = getPayloadStringArray(currentStageArtifactPayload, "openingHookOptions");
  const outlineTitleOptions = getPayloadRecordArray(currentStageArtifactPayload, "titleOptions");
  const outlineArtifactTitleOptions = getPayloadRecordArray(outlineArtifactPayload, "titleOptions");
  const outlineTitleStrategyNotes = getPayloadStringArray(currentStageArtifactPayload, "titleStrategyNotes");
  const outlineTargetEmotionOptions = getPayloadStringArray(currentStageArtifactPayload, "targetEmotionOptions");
  const outlineEndingStrategyOptions = getPayloadStringArray(currentStageArtifactPayload, "endingStrategyOptions");
  const factCheckChecks = getPayloadRecordArray(currentStageArtifactPayload, "checks");
  const factCheckResolvedCount = factCheckChecks.filter((item) => {
    const claim = String(item.claim || "").trim();
    const status = String(item.status || "").trim();
    return getFactCheckDecision(factCheckSelectionDraft, claim, status).action !== "keep";
  }).length;

  const outlinePlanningResearchBackbone = (() => {
    const outlineResearchBackbone = getPayloadRecord(currentStagePayload, "researchBackbone");
    const openingTimelineAnchor = String(outlineResearchBackbone?.openingTimelineAnchor || "").trim();
    const middleComparisonAnchor = String(outlineResearchBackbone?.middleComparisonAnchor || "").trim();
    const coreInsightAnchor = String(outlineResearchBackbone?.coreInsightAnchor || "").trim();
    const sequencingNote = String(outlineResearchBackbone?.sequencingNote || "").trim();
    if (!openingTimelineAnchor && !middleComparisonAnchor && !coreInsightAnchor && !sequencingNote) {
      return null;
    }
    return {
      openingTimelineAnchor,
      middleComparisonAnchor,
      coreInsightAnchor,
      sequencingNote,
    };
  })();

  return {
    factCheckStagePanelProps: {
      factCheckChecks,
      factCheckSelectionDraft,
      getFactCheckDecision,
      getFactCheckActionOptions,
      factCheckResolvedCount,
      evidenceUrl: factCheckEvidenceUrl,
      onChangeEvidenceUrl: setFactCheckEvidenceUrl,
      addingEvidence: addingFactCheckEvidence,
      onAddEvidenceSource: handleFactCheckStageAddEvidenceSource,
      evidenceIssue: factCheckEvidenceIssue,
      onClearEvidenceIssue: handleFactCheckStageClearEvidenceIssue,
      recentEvidenceIssues: recentFactCheckEvidenceIssues,
      retryableIssueCount: factCheckRetryableCount,
      recoveredIssueCount: factCheckRecoveredCount,
      onDismissEvidenceIssue: dismissFactCheckEvidenceIssue,
      onUpdateCheckDecision: updateFactCheckDecision,
      onOpenKnowledgeCard: handleFactCheckStageOpenKnowledgeCard,
      savingSelection: savingAudienceSelection,
      onSaveSelection: handleFactCheckStageSaveSelection,
    },
    prosePolishStagePanelProps: {
      selectedTitle: prosePolishSelectedTitle,
      outlinePayload: prosePolishOutlinePayload,
      titleOptionCount: outlineArtifactTitleOptions.length,
      regeneratingTitles: prosePolishRegeneratingTitles,
      onRegenerateTitles: regenerateOutlinePlanningTitleOptions,
      weakestLayer: prosePolishWeakestLayer,
      editorQualityPanel,
    },
    outlinePlanningMaterialsPanel: {
      loadingMaterials: loadingOutlineMaterials,
      savingMaterials: savingOutlineMaterials,
      onRefreshMaterials: refreshOutlinePlanningMaterials,
      readiness: {
        status: outlineMaterialReadiness.status === "passed"
          ? "passed"
          : outlineMaterialReadiness.status === "warning"
            ? "warning"
            : "blocked",
        score: String(outlineMaterialReadiness.score),
        detail: outlineMaterialReadiness.detail,
        fragmentCount: outlineMaterialReadiness.fragmentCount,
        sourceTypeCount: outlineMaterialReadiness.sourceTypeCount,
        screenshotCount: outlineMaterialReadiness.screenshotCount,
        flags: outlineMaterialReadiness.flags,
      },
      knowledgeCards: knowledgeCardItems.map((card) => ({
        id: card.id,
        title: card.title,
        confidenceLabel: `置信度 ${Math.round(card.confidenceScore * 100)}%`,
        summary: card.summary || "",
        latestChangeSummary: card.latestChangeSummary || "",
        conflictFlags: card.conflictFlags,
        overturnedJudgement: card.overturnedJudgements[0] || "",
      })),
      supplementalViewpoints: supplementalViewpointsDraft,
      onChangeSupplementalViewpoint: handleOutlinePlanningSupplementalViewpointChange,
      onSaveSupplementalViewpoints: handleOutlinePlanningSaveSupplementalViewpoints,
      selectedNodeId: outlineMaterialNodeId,
      onChangeSelectedNodeId: setOutlineMaterialNodeId,
      selectedUsageMode: outlineMaterialUsageMode,
      onChangeSelectedUsageMode: setOutlineMaterialUsageMode,
      selectedReferenceFusionMode: outlineMaterialReferenceFusionMode,
      onChangeSelectedReferenceFusionMode: setOutlineMaterialReferenceFusionMode,
      selectedFragmentId: outlineMaterialFragmentId,
      onChangeSelectedFragmentId: setOutlineMaterialFragmentId,
      nodeOptions: (outlineMaterialsNodes ?? nodes).map((node) => ({
        id: String(node.id),
        title: node.title,
      })),
      fragmentOptions: fragmentPool
        .filter((fragment) => {
          const selectedNode = (outlineMaterialsNodes ?? nodes).find((node) => String(node.id) === outlineMaterialNodeId);
          return !selectedNode?.fragments.some((item) => item.id === fragment.id);
        })
        .map((fragment) => ({
          id: String(fragment.id),
          label: `${fragment.title ? `${fragment.title} · ` : ""}${formatFragmentSourceType(fragment.sourceType)} · ${fragment.distilledContent.slice(0, 28)}`,
          referenceFusionLabel: formatFragmentReferenceFusionLabel(fragment),
        })),
      onAttachExisting: handleOutlinePlanningAttachExistingMaterial,
      onUpdateSelectedReferenceFusion: handleOutlinePlanningUpdateMaterialReferenceFusion,
      createMode: outlineMaterialCreateMode,
      onChangeCreateMode: setOutlineMaterialCreateMode,
      materialTitle: outlineMaterialTitle,
      onChangeMaterialTitle: setOutlineMaterialTitle,
      materialContent: outlineMaterialContent,
      onChangeMaterialContent: setOutlineMaterialContent,
      materialUrl: outlineMaterialUrl,
      onChangeMaterialUrl: setOutlineMaterialUrl,
      screenshotInputRef: outlineMaterialScreenshotInputRef,
      onScreenshotFileChange: handleOutlineMaterialScreenshotFileChange,
      screenshotFileName: outlineMaterialScreenshotFileName,
      onSubmitCreate: handleOutlinePlanningSubmitCreateMaterial,
      nodeFragmentSummaries: (outlineMaterialsNodes ?? nodes).map((node) => ({
        nodeId: node.id,
        title: node.title,
        fragments: node.fragments.map((fragment) => ({
          id: fragment.id,
          label: `${fragment.title || `素材 #${fragment.id}`} · ${formatFragmentSourceType(fragment.sourceType)} · ${formatFragmentUsageMode(fragment.usageMode)}`,
          referenceFusionLabel: formatFragmentReferenceFusionLabel(fragment),
        })),
      })),
    },
    outlinePlanningSelectionPanel: {
      titleOptions: outlineTitleOptions.map((item) => {
        const optionTitle = String(item.title || "").trim();
        const optionStyle = String(item.styleLabel || "").trim();
        const elementsHit = {
          specific: Array.isArray(item.elementsHit) ? item.elementsHit.includes("specific") : Boolean(item.specificElement),
          curiosityGap: Array.isArray(item.elementsHit) ? item.elementsHit.includes("curiosityGap") : Boolean(item.curiosityGap),
          readerView: Array.isArray(item.elementsHit) ? item.elementsHit.includes("readerView") : Boolean(item.readerView),
        };
        const score = typeof item.openRateScore === "number" ? item.openRateScore : typeof item.score === "number" ? item.score : 0;
        return {
          title: optionTitle,
          style: optionStyle,
          angle: String(item.angle || "").trim(),
          reason: String(item.reason || "").trim(),
          riskHint: String(item.riskHint || "").trim(),
          recommendReason: String(item.recommendReason || "").trim(),
          forbiddenHits: getPayloadStringArray(item, "forbiddenHits"),
          score,
          scoreWidth: `${Math.max(8, Math.round((score / 50) * 100))}%`,
          elements: [
            { label: "具体元素", active: elementsHit.specific },
            { label: "好奇缺口", active: elementsHit.curiosityGap },
            { label: "读者视角", active: elementsHit.readerView },
          ],
          isSelected: outlineSelectionDraft.selectedTitle === optionTitle,
          isRecommended: Boolean(item.isRecommended),
        };
      }),
      openingOptions: getPayloadRecordArray(currentStagePayload, "openingOptions")
        .map((item) => {
          const openingValue = getOutlineOpeningOptionText(item);
          const diagnose = getPayloadRecord(item, "diagnose");
          const hookScore = getOutlineOpeningOptionHookScore(item);
          return {
            value: openingValue,
            patternLabel: getOutlineOpeningOptionPatternLabel(item),
            qualityCeiling: getOutlineOpeningOptionQualityCeiling(item),
            recommendReason: String(item.recommendReason || "").trim(),
            forbiddenHits: getPayloadStringArray(item, "forbiddenHits"),
            hookScore,
            hookScoreWidth: `${Math.max(8, hookScore)}%`,
            diagnoseBadges: [
              { label: "抽象度", value: String(diagnose?.abstractLevel || "").trim() },
              { label: "铺垫度", value: String(diagnose?.paddingLevel || "").trim() },
              { label: "钩子浓度", value: String(diagnose?.hookDensity || "").trim() },
              { label: "信息前置", value: String(diagnose?.informationFrontLoading || "").trim() },
            ]
              .filter((badge) => badge.value === "pass" || badge.value === "warn" || badge.value === "danger")
              .map((badge) => ({
                label: `${badge.label} ${badge.value === "pass" ? "通过" : badge.value === "warn" ? "关注" : "危险"}`,
                tone: badge.value as "pass" | "warn" | "danger",
              })),
            isSelected: openingValue.length > 0 && outlineSelectionDraft.selectedOpeningHook === openingValue,
            isRecommended: Boolean(item.isRecommended),
          };
        })
        .filter((item) => item.value),
      titleAuditTimestampLabel: formatTitleAuditTimestamp(String(currentStagePayload?.titleAuditedAt || "")) || "",
      regeneratingTitles: generatingStageArtifactCode === "outlinePlanning",
      disableRegenerateTitles: Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || savingAudienceSelection,
      onRegenerateTitles: regenerateOutlinePlanningTitleOptions,
      regeneratingOpenings: generatingStageArtifactCode === "outlinePlanning",
      disableRegenerateOpenings: Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || savingAudienceSelection,
      onRegenerateOpenings: regenerateOutlinePlanningOpeningOptions,
      onSelectTitle: handleOutlinePlanningSelectTitle,
      titleStrategyNotes: outlineTitleStrategyNotes,
      centralThesis: String(currentStagePayload?.centralThesis || "").trim(),
      supplementalViewpoints: getPayloadStringArray(currentStagePayload, "supplementalViewpoints"),
      viewpointIntegration: getPayloadRecordArray(currentStagePayload, "viewpointIntegration").map((item) => ({
        viewpoint: String(item.viewpoint || "").trim(),
        actionLabel: formatViewpointAction(String(item.action || "")),
        note: String(item.note || "").trim(),
      })),
      materialBundle: getPayloadRecordArray(currentStagePayload, "materialBundle").map((item, index) => ({
        title: String(item.title || `素材 ${index + 1}`).trim(),
        meta: `${formatFragmentSourceType(String(item.sourceType || ""))} · ${formatFragmentUsageMode(String(item.usageMode || ""))}`,
        summary: String(item.summary || "").trim(),
        screenshotPath: String(item.screenshotPath || "").trim(),
      })),
      openingHookOptions: outlineOpeningHookOptions,
      selectedOpeningHook: outlineSelectionDraft.selectedOpeningHook,
      onSelectOpeningHook: handleOutlinePlanningSelectOpeningHook,
      targetEmotionOptions: outlineTargetEmotionOptions,
      selectedTargetEmotion: outlineSelectionDraft.selectedTargetEmotion,
      onSelectTargetEmotion: handleOutlinePlanningSelectTargetEmotion,
      researchBackbone: outlinePlanningResearchBackbone,
      outlineSections: getPayloadRecordArray(currentStagePayload, "outlineSections").map((section, index) => ({
        heading: String(section.heading || `章节 ${index + 1}`).trim(),
        researchFocusLabel: String(section.researchFocus || "").trim()
          ? formatOutlineResearchFocusLabel(String(section.researchFocus))
          : "",
        goal: String(section.goal || "").trim(),
        keyPoints: getPayloadStringArray(section, "keyPoints"),
        evidenceHints: getPayloadStringArray(section, "evidenceHints"),
        materialRefs: Array.isArray(section.materialRefs) ? section.materialRefs.map((item) => String(item || "").trim()).filter(Boolean) : [],
        researchAnchor: String(section.researchAnchor || "").trim(),
        transition: String(section.transition || "").trim(),
      })),
      materialGapHints: getPayloadStringArray(currentStagePayload, "materialGapHints"),
      endingStrategyOptions: outlineEndingStrategyOptions,
      selectedEndingStrategy: outlineSelectionDraft.selectedEndingStrategy,
      onSelectEndingStrategy: handleOutlinePlanningSelectEndingStrategy,
      selectionSummary: {
        selectedTitle: outlineSelectionDraft.selectedTitle || String(currentStagePayload?.workingTitle || "").trim(),
        selectedTitleStyle: outlineSelectionDraft.selectedTitleStyle,
        selectedOpeningHook: outlineSelectionDraft.selectedOpeningHook,
        selectedTargetEmotion: outlineSelectionDraft.selectedTargetEmotion,
        selectedEndingStrategy: outlineSelectionDraft.selectedEndingStrategy,
      },
      savingSelection: savingAudienceSelection,
      saveDisabled: savingAudienceSelection || !outlineSelectionDraft.selectedTitle.trim(),
      onSaveSelection: handleOutlinePlanningSaveSelection,
      endingStrategyText: String(currentStagePayload?.endingStrategy || "").trim(),
    },
  };
}
