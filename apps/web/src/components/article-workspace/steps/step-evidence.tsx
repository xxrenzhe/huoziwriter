import type { WorkspaceStepPanels } from "../types";

export default function StepEvidence({ artifactPanel, researchPanel, evidencePanel }: WorkspaceStepPanels) {
  return (
    <>
      {researchPanel}
      {evidencePanel}
      {artifactPanel}
    </>
  );
}
