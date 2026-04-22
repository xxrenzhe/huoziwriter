import type { ComponentProps } from "react";
import { ImaEvidenceSearchDrawer } from "../ima-evidence-search-drawer";
import { MobileInspectorSheet } from "./mobile-inspector-sheet";
import { WechatConnectModal } from "./wechat-connect-modal";

type WorkspaceOverlaysProps = {
  mobileInspectorSheetProps: ComponentProps<typeof MobileInspectorSheet>;
  wechatConnectModalProps: ComponentProps<typeof WechatConnectModal>;
  imaEvidenceSearchDrawerProps: ComponentProps<typeof ImaEvidenceSearchDrawer>;
};

export function WorkspaceOverlays({
  mobileInspectorSheetProps,
  wechatConnectModalProps,
  imaEvidenceSearchDrawerProps,
}: WorkspaceOverlaysProps) {
  return (
    <>
      <MobileInspectorSheet {...mobileInspectorSheetProps} />
      <WechatConnectModal {...wechatConnectModalProps} />
      <ImaEvidenceSearchDrawer {...imaEvidenceSearchDrawerProps} />
    </>
  );
}
