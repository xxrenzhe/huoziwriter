import Link from "next/link";

type WechatPublishUpsellSectionProps = {
  displayPlanName: string;
};

export function WechatPublishUpsellSection({ displayPlanName }: WechatPublishUpsellSectionProps) {
  return (
    <>
      <div className="mt-3 border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
        {displayPlanName}当前不支持微信草稿箱推送。你仍可继续编辑、导出 Markdown 或 HTML；升级到 Pro 或更高套餐后，才可绑定公众号并一键推送到草稿箱。
      </div>
      <Link href="/pricing" className="mt-3 block border border-cinnabar bg-surface px-4 py-3 text-center text-sm text-cinnabar">
        查看套餐权限
      </Link>
    </>
  );
}
