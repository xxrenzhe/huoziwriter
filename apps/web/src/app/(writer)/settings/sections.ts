export type SettingsSectionKey =
  | "author"
  | "assets"
  | "sources"
  | "intelligence-kb"
  | "publish"
  | "account"
  | "language-guard";

export const settingsSections: Array<{
  key: SettingsSectionKey;
  title: string;
  shortTitle: string;
  eyebrow: string;
  description: string;
  href: string;
  legacyAnchorId: string;
}> = [
  {
    key: "author",
    title: "作者与系列",
    shortTitle: "作者",
    eyebrow: "Author",
    description: "人设、系列与写作风格资产",
    href: "/settings/author",
    legacyAnchorId: "personas-series",
  },
  {
    key: "assets",
    title: "资产中心",
    shortTitle: "资产",
    eyebrow: "Assets",
    description: "素材、背景卡、模板与图像库存",
    href: "/settings/assets",
    legacyAnchorId: "asset-center",
  },
  {
    key: "sources",
    title: "机会信源",
    shortTitle: "信源",
    eyebrow: "Sources",
    description: "系统源与自定义来源池",
    href: "/settings/sources",
    legacyAnchorId: "topic-sources",
  },
  {
    key: "intelligence-kb",
    title: "智库信源",
    shortTitle: "智库",
    eyebrow: "Intelligence",
    description: "IMA 知识库绑定、默认库与健康状态",
    href: "/settings/intelligence-kb",
    legacyAnchorId: "ima-integration",
  },
  {
    key: "publish",
    title: "发布连接",
    shortTitle: "发布",
    eyebrow: "Publish",
    description: "公众号连接与最近同步诊断",
    href: "/settings/publish",
    legacyAnchorId: "publishing-connections",
  },
  {
    key: "account",
    title: "账号安全与套餐",
    shortTitle: "账号",
    eyebrow: "Account",
    description: "身份信息、安全与配额边界",
    href: "/settings/account",
    legacyAnchorId: "account-security",
  },
  {
    key: "language-guard",
    title: "死刑词库",
    shortTitle: "死刑词库",
    eyebrow: "Language Guard",
    description: "系统默认规则与个人禁词",
    href: "/settings/language-guard",
    legacyAnchorId: "language-guard",
  },
];

export function getSettingsSection(key: SettingsSectionKey) {
  return settingsSections.find((section) => section.key === key) ?? settingsSections[0];
}
