import type { ComponentProps } from "react";
import Link from "next/link";
import { Button } from "@huoziwriter/ui";
import { WechatPublishPreviewSection } from "./wechat-publish-preview-section";
import { WechatPublishSetupSection } from "./wechat-publish-setup-section";
import { WechatPublishSyncSection } from "./wechat-publish-sync-section";
import { WechatPublishUpsellSection } from "./wechat-publish-upsell-section";

type WechatPublishRailProps = {
  canShowWechatControls: boolean;
  displayPlanName: string;
  publishing: boolean;
  onPublish: () => void | Promise<void>;
  setupSection: ComponentProps<typeof WechatPublishSetupSection>;
  previewSection: ComponentProps<typeof WechatPublishPreviewSection>;
  syncSection: ComponentProps<typeof WechatPublishSyncSection>;
};

export function WechatPublishRail({
  canShowWechatControls,
  displayPlanName,
  publishing,
  onPublish,
  setupSection,
  previewSection,
  syncSection,
}: WechatPublishRailProps) {
  return (
    <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
      <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">发布到公众号</div>
      {canShowWechatControls ? (
        <>
          <WechatPublishSetupSection {...setupSection} />
          <WechatPublishPreviewSection {...previewSection} />
          <Button onClick={() => void onPublish()} disabled={publishing} variant="primary" fullWidth className="mt-4">
            {publishing ? "推送中…" : "推送到微信草稿箱"}
          </Button>
          <Link href="/settings" className="mt-3 block border border-lineStrong bg-surface px-4 py-3 text-center text-sm text-inkSoft">
            去设置页管理公众号连接
          </Link>
        </>
      ) : (
        <WechatPublishUpsellSection displayPlanName={displayPlanName} />
      )}
      <WechatPublishSyncSection {...syncSection} />
    </div>
  );
}
