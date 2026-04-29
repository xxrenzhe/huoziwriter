import type { Dispatch, SetStateAction } from "react";
import {
  getFactCheckDecision,
  type AudienceSelectionDraft,
  type FactCheckClaimDecision,
  type FactCheckSelectionDraft,
  type OutlineSelectionDraft,
} from "./stage-selection-drafts";

type SubmitOutlineMaterialAction =
  | "attachExisting"
  | "createManual"
  | "createUrl"
  | "createScreenshot"
  | "updateReferenceFusion";

type ArticleWorkspaceStageHandlersDeps = {
  setAudienceSelectionDraft: Dispatch<SetStateAction<AudienceSelectionDraft>>;
  saveAudienceSelection: () => Promise<void>;
  loadOutlineMaterials: (force?: boolean) => Promise<void>;
  setSupplementalViewpointsDraft: Dispatch<SetStateAction<string[]>>;
  saveSupplementalViewpoints: () => Promise<void>;
  submitOutlineMaterial: (action: SubmitOutlineMaterialAction) => Promise<void>;
  outlineMaterialCreateMode: "manual" | "url" | "screenshot";
  setOutlineSelectionDraft: Dispatch<SetStateAction<OutlineSelectionDraft>>;
  saveOutlineSelection: () => Promise<void>;
  setFactCheckSelectionDraft: Dispatch<SetStateAction<FactCheckSelectionDraft>>;
  generateStageArtifact: (
    stageCode: string,
    options?: Record<string, unknown>,
  ) => Promise<boolean>;
  addFactCheckEvidenceSource: (urlOverride?: string) => Promise<void>;
  setFactCheckEvidenceIssue: (value: { url: string; degradedReason: string; retryRecommended: boolean } | null) => void;
  setExpandedKnowledgeCardId: (value: number | null) => void;
  setHighlightedKnowledgeCardId: (value: number | null) => void;
  saveFactCheckSelection: () => Promise<void>;
};

export function createArticleWorkspaceStageHandlers({
  setAudienceSelectionDraft,
  saveAudienceSelection,
  loadOutlineMaterials,
  setSupplementalViewpointsDraft,
  saveSupplementalViewpoints,
  submitOutlineMaterial,
  outlineMaterialCreateMode,
  setOutlineSelectionDraft,
  saveOutlineSelection,
  setFactCheckSelectionDraft,
  generateStageArtifact,
  addFactCheckEvidenceSource,
  setFactCheckEvidenceIssue,
  setExpandedKnowledgeCardId,
  setHighlightedKnowledgeCardId,
  saveFactCheckSelection,
}: ArticleWorkspaceStageHandlersDeps) {
  function handleAudienceAnalysisSelectReaderLabel(value: string) {
    setAudienceSelectionDraft((current) => ({ ...current, selectedReaderLabel: value }));
  }

  function handleAudienceAnalysisSelectLanguageGuidance(value: string) {
    setAudienceSelectionDraft((current) => ({ ...current, selectedLanguageGuidance: value }));
  }

  function handleAudienceAnalysisSelectBackgroundAwareness(value: string) {
    setAudienceSelectionDraft((current) => ({ ...current, selectedBackgroundAwareness: value }));
  }

  function handleAudienceAnalysisSelectReadabilityLevel(value: string) {
    setAudienceSelectionDraft((current) => ({ ...current, selectedReadabilityLevel: value }));
  }

  function handleAudienceAnalysisSelectCallToAction(value: string) {
    setAudienceSelectionDraft((current) => ({ ...current, selectedCallToAction: value }));
  }

  function handleAudienceAnalysisSaveSelection() {
    void saveAudienceSelection();
  }

  function refreshOutlinePlanningMaterials() {
    void loadOutlineMaterials(true);
  }

  function handleOutlinePlanningSupplementalViewpointChange(index: number, value: string) {
    setSupplementalViewpointsDraft((current) =>
      Array.from({ length: 3 }, (_, draftIndex) =>
        draftIndex === index ? value : current[draftIndex] || "",
      ),
    );
  }

  function handleOutlinePlanningSaveSupplementalViewpoints() {
    void saveSupplementalViewpoints();
  }

  function handleOutlinePlanningAttachExistingMaterial() {
    void submitOutlineMaterial("attachExisting");
  }

  function handleOutlinePlanningUpdateMaterialReferenceFusion() {
    void submitOutlineMaterial("updateReferenceFusion");
  }

  function handleOutlinePlanningSubmitCreateMaterial() {
    void submitOutlineMaterial(
      outlineMaterialCreateMode === "manual"
        ? "createManual"
        : outlineMaterialCreateMode === "url"
          ? "createUrl"
          : "createScreenshot",
    );
  }

  function handleOutlinePlanningSelectTitle(titleValue: string, styleValue: string) {
    setOutlineSelectionDraft((current) => ({
      ...current,
      selectedTitle: titleValue,
      selectedTitleStyle: styleValue,
    }));
  }

  function handleOutlinePlanningSelectOpeningHook(value: string) {
    setOutlineSelectionDraft((current) => ({ ...current, selectedOpeningHook: value }));
  }

  function handleOutlinePlanningSelectTargetEmotion(value: string) {
    setOutlineSelectionDraft((current) => ({ ...current, selectedTargetEmotion: value }));
  }

  function handleOutlinePlanningSelectEndingStrategy(value: string) {
    setOutlineSelectionDraft((current) => ({ ...current, selectedEndingStrategy: value }));
  }

  function handleOutlinePlanningSaveSelection() {
    void saveOutlineSelection();
  }

  function updateFactCheckDecision(claim: string, status: string, patch: Partial<FactCheckClaimDecision>) {
    const normalizedClaim = String(claim || "").trim();
    if (!normalizedClaim) {
      return;
    }
    setFactCheckSelectionDraft((current) => {
      const existing = getFactCheckDecision(current, normalizedClaim, status);
      const nextDecision = {
        ...existing,
        ...patch,
        claim: normalizedClaim,
      } satisfies FactCheckClaimDecision;
      const others = current.claimDecisions.filter((item) => item.claim !== normalizedClaim);
      return {
        claimDecisions: [...others, nextDecision],
      };
    });
  }

  function regenerateOutlinePlanningTitleOptions() {
    void generateStageArtifact("outlinePlanning", { titleOptionsOnly: true });
  }

  function regenerateOutlinePlanningOpeningOptions() {
    void generateStageArtifact("outlinePlanning", { openingOptionsOnly: true });
  }

  function handleFactCheckStageAddEvidenceSource(urlOverride?: string) {
    void addFactCheckEvidenceSource(urlOverride);
  }

  function handleFactCheckStageClearEvidenceIssue() {
    setFactCheckEvidenceIssue(null);
  }

  function handleFactCheckStageOpenKnowledgeCard(knowledgeCardId: number) {
    setExpandedKnowledgeCardId(knowledgeCardId);
    setHighlightedKnowledgeCardId(knowledgeCardId);
  }

  function handleFactCheckStageSaveSelection() {
    void saveFactCheckSelection();
  }

  return {
    handleAudienceAnalysisSelectReaderLabel,
    handleAudienceAnalysisSelectLanguageGuidance,
    handleAudienceAnalysisSelectBackgroundAwareness,
    handleAudienceAnalysisSelectReadabilityLevel,
    handleAudienceAnalysisSelectCallToAction,
    handleAudienceAnalysisSaveSelection,
    refreshOutlinePlanningMaterials,
    handleOutlinePlanningSupplementalViewpointChange,
    handleOutlinePlanningSaveSupplementalViewpoints,
    handleOutlinePlanningAttachExistingMaterial,
    handleOutlinePlanningUpdateMaterialReferenceFusion,
    handleOutlinePlanningSubmitCreateMaterial,
    handleOutlinePlanningSelectTitle,
    handleOutlinePlanningSelectOpeningHook,
    handleOutlinePlanningSelectTargetEmotion,
    handleOutlinePlanningSelectEndingStrategy,
    handleOutlinePlanningSaveSelection,
    updateFactCheckDecision,
    regenerateOutlinePlanningTitleOptions,
    regenerateOutlinePlanningOpeningOptions,
    handleFactCheckStageAddEvidenceSource,
    handleFactCheckStageClearEvidenceIssue,
    handleFactCheckStageOpenKnowledgeCard,
    handleFactCheckStageSaveSelection,
  };
}
