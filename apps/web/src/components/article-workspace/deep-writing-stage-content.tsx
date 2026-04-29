import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { DeepWritingArtifactStagePanel } from "./deep-writing-artifact-stage-panel";

type DeepWritingArtifactStagePanelProps = ComponentProps<typeof DeepWritingArtifactStagePanel>;
type HistoryReferenceSelectionItem = DeepWritingArtifactStagePanelProps["selectedHistoryReferences"][number];
type HistoryReferenceSuggestionItem = DeepWritingArtifactStagePanelProps["historyReferenceSuggestions"][number];
type DeepWritingExecutionCardInput = Parameters<DeepWritingArtifactStagePanelProps["onGenerateExecutionCard"]>[0];

type DeepWritingStageContentProps = Omit<
  DeepWritingArtifactStagePanelProps,
  | "introTitle"
  | "onGenerateExecutionCard"
  | "onRefreshHistorySuggestions"
  | "onRemoveHistoryReference"
  | "onChangeHistoryRelationReason"
  | "onChangeHistoryBridgeSentence"
  | "onSaveHistorySelection"
  | "onToggleHistorySuggestion"
> & {
  currentStageActionLabel?: string | null;
  onGenerateStageArtifact: (stageCode: string, input?: DeepWritingExecutionCardInput) => void | Promise<unknown>;
  onLoadHistoryReferences: (force?: boolean) => void | Promise<unknown>;
  onSaveHistoryReferenceSelection: () => void | Promise<unknown>;
  setSelectedHistoryReferences: Dispatch<SetStateAction<HistoryReferenceSelectionItem[]>>;
  updateHistoryReferenceField: (referencedArticleId: number, field: "relationReason" | "bridgeSentence", value: string) => void;
  toggleHistoryReferenceSelection: (item: HistoryReferenceSuggestionItem) => void;
};

export function DeepWritingStageContent({
  currentStageActionLabel,
  artifact,
  prototypeOverride,
  onSelectPrototype,
  stateVariantOverride,
  onSelectStateVariant,
  creativeLensOverride,
  onSelectCreativeLens,
  openingPreviews,
  openingPreviewLoadingKey,
  openingCheckLoading,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  applyingStageArtifactCode,
  onGenerateStageArtifact,
  onSamplePrototypeOpenings,
  onSampleStateOpenings,
  onLoadOpeningPreview,
  onRunOpeningCheck,
  editorDiversityReport,
  seriesInsight,
  canUseHistoryReferences,
  displayPlanName,
  loadingHistoryReferences,
  savingHistoryReferences,
  onLoadHistoryReferences,
  selectedHistoryReferences,
  setSelectedHistoryReferences,
  updateHistoryReferenceField,
  onSaveHistoryReferenceSelection,
  historyReferenceSuggestions,
  toggleHistoryReferenceSelection,
  generating,
  generateBlockedByResearch,
  generateBlockedMessage,
  onStartWriting,
  onGoToResearch,
}: DeepWritingStageContentProps) {
  return (
    <DeepWritingArtifactStagePanel
      introTitle={currentStageActionLabel || "生成写作执行卡"}
      artifact={artifact}
      prototypeOverride={prototypeOverride}
      onSelectPrototype={onSelectPrototype}
      stateVariantOverride={stateVariantOverride}
      onSelectStateVariant={onSelectStateVariant}
      creativeLensOverride={creativeLensOverride}
      onSelectCreativeLens={onSelectCreativeLens}
      openingPreviews={openingPreviews}
      openingPreviewLoadingKey={openingPreviewLoadingKey}
      openingCheckLoading={openingCheckLoading}
      generatingStageArtifactCode={generatingStageArtifactCode}
      updatingWorkflowCode={updatingWorkflowCode}
      applyingStageArtifactCode={applyingStageArtifactCode}
      onGenerateExecutionCard={(input) => {
        void onGenerateStageArtifact("deepWriting", input);
      }}
      onSamplePrototypeOpenings={onSamplePrototypeOpenings}
      onSampleStateOpenings={onSampleStateOpenings}
      onLoadOpeningPreview={onLoadOpeningPreview}
      onRunOpeningCheck={() => {
        void onRunOpeningCheck();
      }}
      editorDiversityReport={editorDiversityReport}
      seriesInsight={seriesInsight}
      canUseHistoryReferences={canUseHistoryReferences}
      displayPlanName={displayPlanName}
      loadingHistoryReferences={loadingHistoryReferences}
      savingHistoryReferences={savingHistoryReferences}
      onRefreshHistorySuggestions={() => {
        void onLoadHistoryReferences(true);
      }}
      selectedHistoryReferences={selectedHistoryReferences}
      onRemoveHistoryReference={(referencedArticleId) =>
        setSelectedHistoryReferences((current) =>
          current.filter((reference) => reference.referencedArticleId !== referencedArticleId),
        )
      }
      onChangeHistoryRelationReason={(referencedArticleId, value) =>
        updateHistoryReferenceField(referencedArticleId, "relationReason", value)
      }
      onChangeHistoryBridgeSentence={(referencedArticleId, value) =>
        updateHistoryReferenceField(referencedArticleId, "bridgeSentence", value)
      }
      onSaveHistorySelection={() => {
        void onSaveHistoryReferenceSelection();
      }}
      historyReferenceSuggestions={historyReferenceSuggestions}
      onToggleHistorySuggestion={(referencedArticleId) => {
        const target = historyReferenceSuggestions.find((item) => item.referencedArticleId === referencedArticleId);
        if (target) {
          toggleHistoryReferenceSelection(target);
        }
      }}
      generating={generating}
      generateBlockedByResearch={generateBlockedByResearch}
      generateBlockedMessage={generateBlockedMessage}
      onStartWriting={onStartWriting}
      onGoToResearch={onGoToResearch}
    />
  );
}
