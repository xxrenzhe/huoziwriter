import type { ComponentProps } from "react";
import type { WorkspaceShellAuthoringPhase, WorkspaceShellMainStep, WorkspaceView } from "./types";
import type { buildWorkspaceShellPanels } from "./workspace-shell-panels";
import type { buildWorkspaceShellViewSlots } from "./workspace-shell-view-slots";
import { WorkspaceLeftRail } from "./workspace-left-rail";
import { WorkspaceOverlays } from "./workspace-overlays";
import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceSidebar } from "./workspace-sidebar";

type WorkspaceShellViewSlots = ReturnType<typeof buildWorkspaceShellViewSlots>;
type WorkspaceShellPanelsBundle = ReturnType<typeof buildWorkspaceShellPanels>;

export function buildWorkspaceLeftRailProps(input: {
  isCollectPhase: boolean;
  articleId: number;
  nodes: ComponentProps<typeof WorkspaceLeftRail>["outlinePanel"]["nodes"];
  fragments: ComponentProps<typeof WorkspaceLeftRail>["outlinePanel"]["fragments"];
  onChangeOutlinePanel: ComponentProps<typeof WorkspaceLeftRail>["outlinePanel"]["onChange"];
  snapshotNote: string;
  onChangeSnapshotNote: ComponentProps<typeof WorkspaceLeftRail>["onChangeSnapshotNote"];
  onCreateSnapshot: ComponentProps<typeof WorkspaceLeftRail>["onCreateSnapshot"];
  snapshots: ComponentProps<typeof WorkspaceLeftRail>["snapshots"];
  loadingDiffId: number | null;
  onLoadDiff: ComponentProps<typeof WorkspaceLeftRail>["onLoadDiff"];
  onRestoreSnapshot: ComponentProps<typeof WorkspaceLeftRail>["onRestoreSnapshot"];
}): ComponentProps<typeof WorkspaceLeftRail> {
  return {
    isCollectPhase: input.isCollectPhase,
    outlinePanel: {
      articleId: input.articleId,
      nodes: input.nodes,
      fragments: input.fragments,
      onChange: input.onChangeOutlinePanel,
    },
    snapshotNote: input.snapshotNote,
    onChangeSnapshotNote: input.onChangeSnapshotNote,
    onCreateSnapshot: input.onCreateSnapshot,
    snapshots: input.snapshots,
    loadingDiffId: input.loadingDiffId,
    onLoadDiff: input.onLoadDiff,
    onRestoreSnapshot: input.onRestoreSnapshot,
  };
}

export function buildWorkspaceShellProps(input: {
  currentArticleLabel: string;
  currentArticleMainStep: ComponentProps<typeof WorkspaceShell>["currentArticleMainStep"];
  currentArticleMainStepDetail: string;
  saveState: string;
  theme: string;
  isFocusMode: boolean;
  onToggleTheme: ComponentProps<typeof WorkspaceShell>["onToggleTheme"];
  onToggleFocusMode: ComponentProps<typeof WorkspaceShell>["onToggleFocusMode"];
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
  researchStepSummary: ComponentProps<typeof WorkspaceShell>["researchStepSummary"];
  researchCoverageRibbon: ComponentProps<typeof WorkspaceShell>["researchCoverageRibbon"];
  currentArticleTask: ComponentProps<typeof WorkspaceShell>["currentArticleTask"];
  onGoToResearchStep: ComponentProps<typeof WorkspaceShell>["onGoToResearchStep"];
  isUpdatingWorkflow: boolean;
  hideMainStepRail: boolean;
  articleMainSteps: WorkspaceShellMainStep[];
  onSelectMainStep: ComponentProps<typeof WorkspaceShell>["onSelectMainStep"];
  canOpenResultStep: boolean;
  resultLeadPanel: WorkspaceShellPanelsBundle["resultLeadPanel"];
  authoringPhases: WorkspaceShellAuthoringPhase[];
  currentAuthoringPhaseTitle: string;
  currentAuthoringPhaseHint: string;
  onSelectAuthoringPhase: ComponentProps<typeof WorkspaceShell>["onSelectAuthoringPhase"];
  view: WorkspaceView;
  onViewChange: ComponentProps<typeof WorkspaceShell>["onViewChange"];
  formatWorkspaceViewLabel: ComponentProps<typeof WorkspaceShell>["formatWorkspaceViewLabel"];
  workspaceShellViewSlots: WorkspaceShellViewSlots;
  workspaceStepPanels: WorkspaceShellPanelsBundle["workspaceStepPanels"];
}): ComponentProps<typeof WorkspaceShell> {
  return {
    currentArticleLabel: input.currentArticleLabel,
    currentArticleMainStep: input.currentArticleMainStep,
    currentArticleMainStepDetail: input.currentArticleMainStepDetail,
    saveState: input.saveState,
    topbarActions: input.workspaceShellViewSlots.topbarActions,
    theme: input.theme,
    isFocusMode: input.isFocusMode,
    onToggleTheme: input.onToggleTheme,
    onToggleFocusMode: input.onToggleFocusMode,
    generateBlockedByResearch: input.generateBlockedByResearch,
    generateBlockedMessage: input.generateBlockedMessage,
    researchStepSummary: input.researchStepSummary,
    researchCoverageRibbon: input.researchCoverageRibbon,
    currentArticleTask: input.currentArticleTask,
    onGoToResearchStep: input.onGoToResearchStep,
    isUpdatingWorkflow: input.isUpdatingWorkflow,
    hideMainStepRail: input.hideMainStepRail,
    articleMainSteps: input.articleMainSteps,
    onSelectMainStep: input.onSelectMainStep,
    canOpenResultStep: input.canOpenResultStep,
    resultLeadPanel: input.resultLeadPanel,
    authoringPhases: input.authoringPhases,
    currentAuthoringPhaseTitle: input.currentAuthoringPhaseTitle,
    currentAuthoringPhaseHint: input.currentAuthoringPhaseHint,
    onSelectAuthoringPhase: input.onSelectAuthoringPhase,
    controlsBar: input.workspaceShellViewSlots.controlsBar,
    view: input.view,
    onViewChange: input.onViewChange,
    formatWorkspaceViewLabel: input.formatWorkspaceViewLabel,
    selectedSeriesNotice: input.workspaceShellViewSlots.selectedSeriesNotice,
    workspaceStepPanels: input.workspaceStepPanels,
    editView: input.workspaceShellViewSlots.editView,
    previewView: input.workspaceShellViewSlots.previewView,
    auditView: input.workspaceShellViewSlots.auditView,
    message: input.workspaceShellViewSlots.message,
  };
}

export function buildWorkspaceSidebarProps(input: {
  isFocusMode: boolean;
  showCompactSixStepRail: boolean;
  currentArticleMainStepTitle: string;
  currentArticleMainStepDetail: string;
  articleMainSteps: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["articleMainSteps"];
  updatingWorkflow: boolean;
  canOpenResultStep: boolean;
  onSelectMainStep: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["onSelectMainStep"];
  showSnapshotManager: boolean;
  snapshotNote: string;
  onChangeSnapshotNote: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["onChangeSnapshotNote"];
  onCreateSnapshot: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["onCreateSnapshot"];
  snapshots: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["snapshots"];
  loadingDiffId: number | null;
  onLoadDiff: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["onLoadDiff"];
  onRestoreSnapshot: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["onRestoreSnapshot"];
  showResearchChecklistRail: boolean;
  researchStepSummary: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["researchStepSummary"];
  editorStageChecklist: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["editorStageChecklist"];
  planCapabilityHints: ComponentProps<typeof WorkspaceSidebar>["statusRailProps"]["planCapabilityHints"];
  currentStageTitle: string | null;
  stageArtifactsCount: number;
  articleStatusLabel: string;
  showKnowledgeCardsRail: boolean;
  knowledgeCardsRailProps: ComponentProps<typeof WorkspaceSidebar>["knowledgeCardsRailProps"];
  showLanguageGuardRail: boolean;
  languageGuardRailProps: ComponentProps<typeof WorkspaceSidebar>["languageGuardRailProps"];
  showVisualEngineRail: boolean;
  visualEngineRailProps: ComponentProps<typeof WorkspaceSidebar>["visualEngineRailProps"];
  showMobileInspectorEntry: boolean;
  onOpenMobileInspector: ComponentProps<typeof WorkspaceSidebar>["onOpenMobileInspector"];
  showDeliveryRail: boolean;
  exportActionsRailProps: ComponentProps<typeof WorkspaceSidebar>["exportActionsRailProps"];
  wechatPublishRailProps: ComponentProps<typeof WorkspaceSidebar>["wechatPublishRailProps"];
  isPolishPhase: boolean;
  diffState: ComponentProps<typeof WorkspaceSidebar>["diffState"];
}): ComponentProps<typeof WorkspaceSidebar> {
  return {
    isFocusMode: input.isFocusMode,
    statusRailProps: {
      showCompactSixStepRail: input.showCompactSixStepRail,
      currentArticleMainStepTitle: input.currentArticleMainStepTitle,
      currentArticleMainStepDetail: input.currentArticleMainStepDetail,
      articleMainSteps: input.articleMainSteps,
      updatingWorkflow: input.updatingWorkflow,
      canOpenResultStep: input.canOpenResultStep,
      onSelectMainStep: input.onSelectMainStep,
      showSnapshotManager: input.showSnapshotManager,
      snapshotNote: input.snapshotNote,
      onChangeSnapshotNote: input.onChangeSnapshotNote,
      onCreateSnapshot: input.onCreateSnapshot,
      snapshots: input.snapshots,
      loadingDiffId: input.loadingDiffId,
      onLoadDiff: input.onLoadDiff,
      onRestoreSnapshot: input.onRestoreSnapshot,
      showResearchChecklistRail: input.showResearchChecklistRail,
      researchStepSummary: input.researchStepSummary,
      editorStageChecklist: input.editorStageChecklist,
      planCapabilityHints: input.planCapabilityHints,
      currentStageTitle: input.currentStageTitle,
      stageArtifactsCount: input.stageArtifactsCount,
      articleStatusLabel: input.articleStatusLabel,
    },
    showKnowledgeCardsRail: input.showKnowledgeCardsRail,
    knowledgeCardsRailProps: input.knowledgeCardsRailProps,
    showLanguageGuardRail: input.showLanguageGuardRail,
    languageGuardRailProps: input.languageGuardRailProps,
    showVisualEngineRail: input.showVisualEngineRail,
    visualEngineRailProps: input.visualEngineRailProps,
    showMobileInspectorEntry: input.showMobileInspectorEntry,
    onOpenMobileInspector: input.onOpenMobileInspector,
    showDeliveryRail: input.showDeliveryRail,
    exportActionsRailProps: input.exportActionsRailProps,
    wechatPublishRailProps: input.wechatPublishRailProps,
    isPolishPhase: input.isPolishPhase,
    diffState: input.diffState,
  };
}

export function buildWorkspaceOverlaysProps(input: {
  mobileInspectorSheetProps: ComponentProps<typeof WorkspaceOverlays>["mobileInspectorSheetProps"];
  wechatConnectModalProps: ComponentProps<typeof WorkspaceOverlays>["wechatConnectModalProps"];
  imaEvidenceSearchDrawerProps: ComponentProps<typeof WorkspaceOverlays>["imaEvidenceSearchDrawerProps"];
}): ComponentProps<typeof WorkspaceOverlays> {
  return {
    mobileInspectorSheetProps: input.mobileInspectorSheetProps,
    wechatConnectModalProps: input.wechatConnectModalProps,
    imaEvidenceSearchDrawerProps: input.imaEvidenceSearchDrawerProps,
  };
}
