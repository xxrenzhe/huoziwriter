import type { ComponentProps } from "react";
import { OutcomeWorkspaceSection } from "./outcome-workspace-section";

type OutcomeWorkspaceSectionProps = ComponentProps<typeof OutcomeWorkspaceSection>;
type SelectedSeries = {
  name: string;
  personaName: string;
} | null;

type OutcomeWorkspaceViewProps = Omit<OutcomeWorkspaceSectionProps, "selectedSeries"> & {
  selectedSeriesSource: {
    name?: string | null;
    personaName?: string | null;
  } | null;
};

function normalizeSelectedSeries(selectedSeriesSource: OutcomeWorkspaceViewProps["selectedSeriesSource"]): SelectedSeries {
  if (!selectedSeriesSource?.name) {
    return null;
  }

  return {
    name: selectedSeriesSource.name,
    personaName: selectedSeriesSource.personaName || "",
  };
}

export function OutcomeWorkspaceView({
  selectedSeriesSource,
  ...props
}: OutcomeWorkspaceViewProps) {
  return (
    <OutcomeWorkspaceSection
      {...props}
      selectedSeries={normalizeSelectedSeries(selectedSeriesSource)}
    />
  );
}
