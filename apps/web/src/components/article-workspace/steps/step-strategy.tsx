import type { WorkspaceStepPanels } from "../types";

export default function StepStrategy({ artifactPanel, researchPanel, strategyPanel }: WorkspaceStepPanels) {
  return (
    <>
      {researchPanel}
      {strategyPanel}
      {artifactPanel}
    </>
  );
}
