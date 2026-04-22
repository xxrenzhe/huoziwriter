import type { ComponentProps } from "react";
import { OutlineMaterialsArtifactPanel } from "./outline-materials-artifact-panel";
import { OutlineSelectionArtifactPanel } from "./outline-selection-artifact-panel";

type OutlinePlanningArtifactPanelProps = {
  materialsPanel: ComponentProps<typeof OutlineMaterialsArtifactPanel>;
  selectionPanel: ComponentProps<typeof OutlineSelectionArtifactPanel>;
};

export function OutlinePlanningArtifactPanel({
  materialsPanel,
  selectionPanel,
}: OutlinePlanningArtifactPanelProps) {
  return (
    <>
      <OutlineMaterialsArtifactPanel {...materialsPanel} />
      <OutlineSelectionArtifactPanel {...selectionPanel} />
    </>
  );
}
