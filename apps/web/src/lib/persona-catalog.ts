export const PERSONA_IDENTITY_OPTIONS = [
  "程序员",
  "独立开发者",
  "AI 产品经理",
  "产品运营",
  "自媒体编辑",
  "科技记者",
  "创业者",
  "商业顾问",
  "投资人",
  "职场教练",
  "教育从业者",
  "电商操盘手",
] as const;

export const PERSONA_WRITING_STYLE_OPTIONS = [
  "科普文",
  "故事文",
  "专业论文",
  "经验分享",
  "幽默段子",
  "社论评论",
  "采访纪实",
  "案例拆解",
  "清单攻略",
  "复盘笔记",
] as const;

export function deriveAuthorPersonaName(identityTags: string[], writingStyleTags: string[]) {
  const identity = identityTags[0] || "创作者";
  const style = writingStyleTags[0] || "写作风格";
  return `${identity} · ${style}`;
}
