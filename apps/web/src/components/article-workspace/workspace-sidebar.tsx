import type { ComponentProps } from "react";
import { ArticleDiffPanel } from "./article-diff-panel";
import { ExportActionsRail } from "./export-actions-rail";
import { KnowledgeCardsRail } from "./knowledge-cards-rail";
import { LanguageGuardRail } from "./language-guard-rail";
import { MobileInspectorEntryCard } from "./mobile-inspector-entry-card";
import { VisualEngineRail } from "./visual-engine-rail";
import { WechatPublishRail } from "./wechat-publish-rail";
import { WorkspaceStatusRail } from "./workspace-status-rail";

type WorkspaceSidebarProps = {
  isFocusMode: boolean;
  statusRailProps: ComponentProps<typeof WorkspaceStatusRail>;
  showKnowledgeCardsRail: boolean;
  knowledgeCardsRailProps: ComponentProps<typeof KnowledgeCardsRail>;
  showLanguageGuardRail: boolean;
  languageGuardRailProps: ComponentProps<typeof LanguageGuardRail>;
  showVisualEngineRail: boolean;
  visualEngineRailProps: ComponentProps<typeof VisualEngineRail>;
  showMobileInspectorEntry: boolean;
  onOpenMobileInspector: () => void;
  showDeliveryRail: boolean;
  exportActionsRailProps: ComponentProps<typeof ExportActionsRail>;
  wechatPublishRailProps: ComponentProps<typeof WechatPublishRail>;
  isPolishPhase: boolean;
  diffState: ComponentProps<typeof ArticleDiffPanel>["diffState"];
};

export function WorkspaceSidebar({
  isFocusMode,
  statusRailProps,
  showKnowledgeCardsRail,
  knowledgeCardsRailProps,
  showLanguageGuardRail,
  languageGuardRailProps,
  showVisualEngineRail,
  visualEngineRailProps,
  showMobileInspectorEntry,
  onOpenMobileInspector,
  showDeliveryRail,
  exportActionsRailProps,
  wechatPublishRailProps,
  isPolishPhase,
  diffState,
}: WorkspaceSidebarProps) {
  return (
    <aside className={`${isFocusMode ? "hidden" : "min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start"}`}>
      <WorkspaceStatusRail {...statusRailProps} />

      {showKnowledgeCardsRail ? <KnowledgeCardsRail {...knowledgeCardsRailProps} /> : null}

      {showLanguageGuardRail ? <LanguageGuardRail {...languageGuardRailProps} /> : null}

      {showVisualEngineRail ? <VisualEngineRail {...visualEngineRailProps} /> : null}

      {showMobileInspectorEntry ? <MobileInspectorEntryCard onOpen={onOpenMobileInspector} /> : null}

      {showDeliveryRail ? <ExportActionsRail {...exportActionsRailProps} /> : null}

      {showDeliveryRail ? <WechatPublishRail {...wechatPublishRailProps} /> : null}

      {isPolishPhase ? <ArticleDiffPanel diffState={diffState} /> : null}
    </aside>
  );
}
