import type { ComponentProps, ReactNode } from "react";
import { WorkspaceControlsBar } from "./workspace-controls-bar";
import { DraftEditorView } from "./draft-editor-view";
import { EditorialAuditView } from "./editorial-audit-view";
import { WorkspacePreviewView } from "./workspace-preview-view";
import { WorkspaceSeriesNotice } from "./workspace-series-notice";
type BuildWorkspaceShellViewSlotsInput = {
  controlsBarProps: ComponentProps<typeof WorkspaceControlsBar>;
  editViewProps: ComponentProps<typeof DraftEditorView>;
  previewViewProps: ComponentProps<typeof WorkspacePreviewView>;
  auditViewProps: ComponentProps<typeof EditorialAuditView>;
  selectedSeries: ComponentProps<typeof WorkspaceSeriesNotice>["selectedSeries"];
  message: string;
};

type WorkspaceShellViewSlots = {
  controlsBar: ReactNode;
  editView: ReactNode;
  previewView: ReactNode;
  auditView: ReactNode;
  selectedSeriesNotice: ReactNode;
  message: ReactNode;
};

export function buildWorkspaceShellViewSlots({
  controlsBarProps,
  editViewProps,
  previewViewProps,
  auditViewProps,
  selectedSeries,
  message,
}: BuildWorkspaceShellViewSlotsInput): WorkspaceShellViewSlots {
  return {
    controlsBar: <WorkspaceControlsBar {...controlsBarProps} />,
    editView: <DraftEditorView {...editViewProps} />,
    previewView: <WorkspacePreviewView {...previewViewProps} />,
    auditView: <EditorialAuditView {...auditViewProps} />,
    selectedSeriesNotice: <WorkspaceSeriesNotice selectedSeries={selectedSeries} />,
    message: message ? <div className="mt-4 text-sm text-cinnabar">{message}</div> : null,
  };
}
