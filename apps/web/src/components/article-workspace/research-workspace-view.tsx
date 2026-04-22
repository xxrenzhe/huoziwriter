import type { ComponentProps } from "react";
import { ResearchWorkspaceSection } from "./research-workspace-section";

type ResearchWorkspaceSectionProps = ComponentProps<typeof ResearchWorkspaceSection>;

type ResearchWorkspaceViewProps = Omit<
  ResearchWorkspaceSectionProps,
  "onGenerateResearchBrief" | "onApplyStrategyWriteback" | "onApplySuggestedEvidence"
> & {
  onGenerateStageArtifact: (stageCode: string) => void | Promise<unknown>;
  onApplyResearchWritebackToStrategyCard: () => void | Promise<unknown>;
  onApplyResearchSuggestedEvidence: () => void | Promise<unknown>;
};

export function ResearchWorkspaceView({
  onGenerateStageArtifact,
  onApplyResearchWritebackToStrategyCard,
  onApplyResearchSuggestedEvidence,
  ...props
}: ResearchWorkspaceViewProps) {
  return (
    <ResearchWorkspaceSection
      {...props}
      onGenerateResearchBrief={() => {
        void onGenerateStageArtifact("researchBrief");
      }}
      onApplyStrategyWriteback={() => {
        void onApplyResearchWritebackToStrategyCard();
      }}
      onApplySuggestedEvidence={() => {
        void onApplyResearchSuggestedEvidence();
      }}
    />
  );
}
