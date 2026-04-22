import type { ComponentProps } from "react";
import { CurrentStageArtifactChildren } from "./current-stage-artifact-children";
import { CurrentStageArtifactSection } from "./current-stage-artifact-section";
import { DeepWritingStageContent } from "./deep-writing-stage-content";
import { LayoutArtifactStagePanel } from "./layout-artifact-stage-panel";

type CurrentStageArtifactSectionProps = ComponentProps<typeof CurrentStageArtifactSection>;
type DeepWritingStageContentProps = ComponentProps<typeof DeepWritingStageContent>;
type CurrentStageArtifactChildrenProps = ComponentProps<typeof CurrentStageArtifactChildren>;
type LayoutArtifactStagePanelProps = ComponentProps<typeof LayoutArtifactStagePanel>;

type CurrentStageArtifactViewProps = Pick<
  CurrentStageArtifactSectionProps,
  | "isResultStep"
  | "currentStage"
  | "currentStageAction"
  | "workspaceBlankSlate"
  | "currentAuthoringDefaultView"
  | "formatWorkspaceViewLabel"
  | "onReturnToDefaultView"
  | "generatingStageArtifactCode"
  | "updatingWorkflowCode"
  | "applyingStageArtifactCode"
  | "showOutlineSyncAction"
  | "syncingOutlineArtifact"
  | "onSyncOutlineArtifactToNodes"
> &
  Pick<
    DeepWritingStageContentProps,
    | "prototypeOverride"
    | "onSelectPrototype"
    | "stateVariantOverride"
    | "onSelectStateVariant"
    | "openingPreviews"
    | "openingPreviewLoadingKey"
    | "openingCheckLoading"
    | "onGenerateStageArtifact"
    | "onSamplePrototypeOpenings"
    | "onSampleStateOpenings"
    | "onLoadOpeningPreview"
    | "onRunOpeningCheck"
    | "editorDiversityReport"
    | "seriesInsight"
    | "canUseHistoryReferences"
    | "displayPlanName"
    | "loadingHistoryReferences"
    | "savingHistoryReferences"
    | "onLoadHistoryReferences"
    | "selectedHistoryReferences"
    | "setSelectedHistoryReferences"
    | "updateHistoryReferenceField"
    | "onSaveHistoryReferenceSelection"
    | "historyReferenceSuggestions"
    | "toggleHistoryReferenceSelection"
    | "generating"
    | "generateBlockedByResearch"
    | "generateBlockedMessage"
    | "onStartWriting"
    | "onGoToResearch"
  > &
  Pick<
    CurrentStageArtifactChildrenProps,
    | "currentStagePayload"
    | "audienceSelection"
    | "onSelectReaderLabel"
    | "onSelectLanguageGuidance"
    | "onSelectBackgroundAwareness"
    | "onSelectReadabilityLevel"
    | "onSelectCallToAction"
    | "savingAudienceSelection"
    | "onSaveAudienceSelection"
    | "outlinePlanningMaterialsPanel"
    | "outlinePlanningSelectionPanel"
    | "factCheckStagePanelProps"
    | "prosePolishStagePanelProps"
  > &
  Pick<LayoutArtifactStagePanelProps, "selectedTemplate" | "applyingLayout" | "onApplyLayout"> & {
    currentStageArtifact: DeepWritingStageContentProps["artifact"];
    getStageApplyButtonLabel: (stageCode: string) => string;
    onApplyStageArtifact: (stageCode: string) => void | Promise<unknown>;
  };

export function CurrentStageArtifactView({
  isResultStep,
  currentStage,
  currentStageAction,
  currentStageArtifact,
  workspaceBlankSlate,
  currentAuthoringDefaultView,
  formatWorkspaceViewLabel,
  onReturnToDefaultView,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  applyingStageArtifactCode,
  showOutlineSyncAction,
  syncingOutlineArtifact,
  onSyncOutlineArtifactToNodes,
  prototypeOverride,
  onSelectPrototype,
  stateVariantOverride,
  onSelectStateVariant,
  openingPreviews,
  openingPreviewLoadingKey,
  openingCheckLoading,
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
  currentStagePayload,
  audienceSelection,
  onSelectReaderLabel,
  onSelectLanguageGuidance,
  onSelectBackgroundAwareness,
  onSelectReadabilityLevel,
  onSelectCallToAction,
  savingAudienceSelection,
  onSaveAudienceSelection,
  outlinePlanningMaterialsPanel,
  outlinePlanningSelectionPanel,
  factCheckStagePanelProps,
  prosePolishStagePanelProps,
  selectedTemplate,
  applyingLayout,
  onApplyLayout,
  getStageApplyButtonLabel,
  onApplyStageArtifact,
}: CurrentStageArtifactViewProps) {
  return (
    <CurrentStageArtifactSection
      isResultStep={isResultStep}
      currentStage={currentStage}
      currentStageAction={currentStageAction}
      currentStageArtifact={currentStageArtifact}
      workspaceBlankSlate={workspaceBlankSlate}
      currentAuthoringDefaultView={currentAuthoringDefaultView}
      formatWorkspaceViewLabel={formatWorkspaceViewLabel}
      onReturnToDefaultView={onReturnToDefaultView}
      generatingStageArtifactCode={generatingStageArtifactCode}
      updatingWorkflowCode={updatingWorkflowCode}
      applyingStageArtifactCode={applyingStageArtifactCode}
      onGenerateCurrentStageArtifact={() => {
        if (currentStage?.code) {
          void onGenerateStageArtifact(currentStage.code);
        }
      }}
      onApplyCurrentStageArtifact={() => {
        if (currentStage?.code) {
          void onApplyStageArtifact(currentStage.code);
        }
      }}
      currentStageApplyButtonLabel={currentStage?.code ? getStageApplyButtonLabel(currentStage.code) : ""}
      showOutlineSyncAction={showOutlineSyncAction}
      syncingOutlineArtifact={syncingOutlineArtifact}
      onSyncOutlineArtifactToNodes={onSyncOutlineArtifactToNodes}
      deepWritingContent={currentStage?.code === "deepWriting" ? (
        <DeepWritingStageContent
          currentStageActionLabel={currentStageAction?.label}
          artifact={currentStageArtifact}
          prototypeOverride={prototypeOverride}
          onSelectPrototype={onSelectPrototype}
          stateVariantOverride={stateVariantOverride}
          onSelectStateVariant={onSelectStateVariant}
          openingPreviews={openingPreviews}
          openingPreviewLoadingKey={openingPreviewLoadingKey}
          openingCheckLoading={openingCheckLoading}
          generatingStageArtifactCode={generatingStageArtifactCode}
          updatingWorkflowCode={updatingWorkflowCode}
          applyingStageArtifactCode={applyingStageArtifactCode}
          onGenerateStageArtifact={onGenerateStageArtifact}
          onSamplePrototypeOpenings={onSamplePrototypeOpenings}
          onSampleStateOpenings={onSampleStateOpenings}
          onLoadOpeningPreview={onLoadOpeningPreview}
          onRunOpeningCheck={onRunOpeningCheck}
          editorDiversityReport={editorDiversityReport}
          seriesInsight={seriesInsight}
          canUseHistoryReferences={canUseHistoryReferences}
          displayPlanName={displayPlanName}
          loadingHistoryReferences={loadingHistoryReferences}
          savingHistoryReferences={savingHistoryReferences}
          onLoadHistoryReferences={onLoadHistoryReferences}
          selectedHistoryReferences={selectedHistoryReferences}
          setSelectedHistoryReferences={setSelectedHistoryReferences}
          updateHistoryReferenceField={updateHistoryReferenceField}
          onSaveHistoryReferenceSelection={onSaveHistoryReferenceSelection}
          historyReferenceSuggestions={historyReferenceSuggestions}
          toggleHistoryReferenceSelection={toggleHistoryReferenceSelection}
          generating={generating}
          generateBlockedByResearch={generateBlockedByResearch}
          generateBlockedMessage={generateBlockedMessage}
          onStartWriting={onStartWriting}
          onGoToResearch={onGoToResearch}
        />
      ) : null}
      layoutContent={currentStage?.code === "layout" ? (
        <LayoutArtifactStagePanel
          selectedTemplate={selectedTemplate}
          applyingLayout={applyingLayout}
          onApplyLayout={onApplyLayout}
        />
      ) : null}
      stageArtifactChildren={
        <CurrentStageArtifactChildren
          currentStageCode={currentStage?.code}
          currentStagePayload={currentStagePayload}
          audienceSelection={audienceSelection}
          onSelectReaderLabel={onSelectReaderLabel}
          onSelectLanguageGuidance={onSelectLanguageGuidance}
          onSelectBackgroundAwareness={onSelectBackgroundAwareness}
          onSelectReadabilityLevel={onSelectReadabilityLevel}
          onSelectCallToAction={onSelectCallToAction}
          savingAudienceSelection={savingAudienceSelection}
          onSaveAudienceSelection={onSaveAudienceSelection}
          outlinePlanningMaterialsPanel={outlinePlanningMaterialsPanel}
          outlinePlanningSelectionPanel={outlinePlanningSelectionPanel}
          factCheckStagePanelProps={factCheckStagePanelProps}
          prosePolishStagePanelProps={prosePolishStagePanelProps}
        />
      }
    />
  );
}
