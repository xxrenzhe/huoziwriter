import type { ComponentProps } from "react";
import { AudienceAnalysisArtifactStagePanel } from "./audience-analysis-artifact-stage-panel";
import { FactCheckArtifactStagePanel } from "./fact-check-artifact-stage-panel";
import { OutlinePlanningArtifactPanel } from "./outline-planning-artifact-panel";
import { ProsePolishArtifactStagePanel } from "./prose-polish-artifact-stage-panel";

type CurrentStageArtifactChildrenProps = {
  currentStageCode?: string | null;
  currentStagePayload: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["payload"];
  audienceSelection: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["selection"];
  onSelectReaderLabel: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["onSelectReaderLabel"];
  onSelectLanguageGuidance: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["onSelectLanguageGuidance"];
  onSelectBackgroundAwareness: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["onSelectBackgroundAwareness"];
  onSelectReadabilityLevel: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["onSelectReadabilityLevel"];
  onSelectCallToAction: ComponentProps<typeof AudienceAnalysisArtifactStagePanel>["onSelectCallToAction"];
  savingAudienceSelection: boolean;
  onSaveAudienceSelection: () => void;
  outlinePlanningMaterialsPanel: ComponentProps<typeof OutlinePlanningArtifactPanel>["materialsPanel"];
  outlinePlanningSelectionPanel: ComponentProps<typeof OutlinePlanningArtifactPanel>["selectionPanel"];
  factCheckStagePanelProps: Omit<ComponentProps<typeof FactCheckArtifactStagePanel>, "payload">;
  prosePolishStagePanelProps: Omit<ComponentProps<typeof ProsePolishArtifactStagePanel>, "payload">;
};

export function CurrentStageArtifactChildren({
  currentStageCode,
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
}: CurrentStageArtifactChildrenProps) {
  if (currentStageCode === "audienceAnalysis") {
    return (
      <AudienceAnalysisArtifactStagePanel
        payload={currentStagePayload}
        selection={audienceSelection}
        onSelectReaderLabel={onSelectReaderLabel}
        onSelectLanguageGuidance={onSelectLanguageGuidance}
        onSelectBackgroundAwareness={onSelectBackgroundAwareness}
        onSelectReadabilityLevel={onSelectReadabilityLevel}
        onSelectCallToAction={onSelectCallToAction}
        savingSelection={savingAudienceSelection}
        onSaveSelection={onSaveAudienceSelection}
      />
    );
  }

  if (currentStageCode === "outlinePlanning") {
    return (
      <OutlinePlanningArtifactPanel
        materialsPanel={outlinePlanningMaterialsPanel}
        selectionPanel={outlinePlanningSelectionPanel}
      />
    );
  }

  if (currentStageCode === "factCheck") {
    return <FactCheckArtifactStagePanel payload={currentStagePayload} {...factCheckStagePanelProps} />;
  }

  if (currentStageCode === "prosePolish") {
    return <ProsePolishArtifactStagePanel payload={currentStagePayload} {...prosePolishStagePanelProps} />;
  }

  return null;
}
