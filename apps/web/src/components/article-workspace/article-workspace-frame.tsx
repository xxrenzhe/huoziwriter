import type { ComponentProps } from "react";
import { WorkspaceLeftRail } from "./workspace-left-rail";
import { WorkspaceOverlays } from "./workspace-overlays";
import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceSidebar } from "./workspace-sidebar";

type ArticleWorkspaceFrameProps = {
  workspaceGridClass: string;
  showLeftWorkspaceRail: boolean;
  leftRailProps: ComponentProps<typeof WorkspaceLeftRail>;
  workspaceShellProps: ComponentProps<typeof WorkspaceShell>;
  workspaceSidebarProps: ComponentProps<typeof WorkspaceSidebar>;
  workspaceOverlaysProps: ComponentProps<typeof WorkspaceOverlays>;
};

export function ArticleWorkspaceFrame({
  workspaceGridClass,
  showLeftWorkspaceRail,
  leftRailProps,
  workspaceShellProps,
  workspaceSidebarProps,
  workspaceOverlaysProps,
}: ArticleWorkspaceFrameProps) {
  return (
    <div className={`grid min-w-0 gap-4 transition-all duration-500 ${workspaceGridClass}`}>
      {showLeftWorkspaceRail ? <WorkspaceLeftRail {...leftRailProps} /> : null}
      <WorkspaceShell {...workspaceShellProps} />
      <WorkspaceSidebar {...workspaceSidebarProps} />
      <WorkspaceOverlays {...workspaceOverlaysProps} />
    </div>
  );
}
