import type { ComponentProps, ReactNode } from "react";
import type { ArticleMainStepCode } from "@/lib/article-workflow-registry";
import { CurrentStageArtifactView } from "./current-stage-artifact-view";
import { EvidenceWorkspaceView } from "./evidence-workspace-view";
import { OutcomeWorkspaceView } from "./outcome-workspace-view";
import { ResearchWorkspaceView } from "./research-workspace-view";
import { StrategyWorkspaceView } from "./strategy-workspace-view";
import type { WorkspaceStepPanels } from "./types";

type BuildWorkspaceShellPanelsInput = {
  currentArticleMainStepCode: ArticleMainStepCode;
  artifactProps: ComponentProps<typeof CurrentStageArtifactView>;
  researchProps: ComponentProps<typeof ResearchWorkspaceView>;
  strategyProps: ComponentProps<typeof StrategyWorkspaceView>;
  evidenceProps: ComponentProps<typeof EvidenceWorkspaceView>;
  outcomeProps: ComponentProps<typeof OutcomeWorkspaceView>;
};

type WorkspaceShellPanelsBundle = {
  resultLeadPanel: ReactNode;
  workspaceStepPanels: WorkspaceStepPanels;
};

export function buildWorkspaceShellPanels({
  currentArticleMainStepCode,
  artifactProps,
  researchProps,
  strategyProps,
  evidenceProps,
  outcomeProps,
}: BuildWorkspaceShellPanelsInput): WorkspaceShellPanelsBundle {
  return {
    resultLeadPanel: currentArticleMainStepCode === "result" ? (
      <OutcomeWorkspaceView {...outcomeProps} />
    ) : null,
    workspaceStepPanels: {
      artifactPanel: <CurrentStageArtifactView {...artifactProps} />,
      researchPanel:
        currentArticleMainStepCode === "strategy" || currentArticleMainStepCode === "evidence" ? (
          <ResearchWorkspaceView {...researchProps} />
        ) : null,
      strategyPanel: currentArticleMainStepCode === "strategy" ? <StrategyWorkspaceView {...strategyProps} /> : null,
      evidencePanel: currentArticleMainStepCode === "evidence" ? <EvidenceWorkspaceView {...evidenceProps} /> : null,
    },
  };
}
