import type { ComponentProps, Dispatch, SetStateAction } from "react";
import { EvidenceWorkspaceSection } from "./evidence-workspace-section";

type EvidenceWorkspaceSectionProps = ComponentProps<typeof EvidenceWorkspaceSection>;
type EvidenceItemLike = EvidenceWorkspaceSectionProps["evidenceDraftItems"][number];

type EvidenceWorkspaceViewProps = Omit<
  EvidenceWorkspaceSectionProps,
  "onOpenImaDrawer" | "onUseSuggestedPackage" | "onClearDraft"
> & {
  setShowImaEvidenceDrawer: Dispatch<SetStateAction<boolean>>;
  setEvidenceDraftItems: Dispatch<SetStateAction<EvidenceItemLike[]>>;
};

export function EvidenceWorkspaceView({
  suggestedEvidenceItems,
  setShowImaEvidenceDrawer,
  setEvidenceDraftItems,
  ...props
}: EvidenceWorkspaceViewProps) {
  return (
    <EvidenceWorkspaceSection
      {...props}
      suggestedEvidenceItems={suggestedEvidenceItems}
      onOpenImaDrawer={() => setShowImaEvidenceDrawer(true)}
      onUseSuggestedPackage={() =>
        setEvidenceDraftItems(
          suggestedEvidenceItems.map((item, index) => ({ ...item, sortOrder: index + 1 })),
        )
      }
      onClearDraft={() => setEvidenceDraftItems([])}
    />
  );
}
