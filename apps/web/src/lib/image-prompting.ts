import { buildVisualAuthoringDirective, buildVisualSignalText, type ImageAuthoringStyleContext } from "./image-authoring-context";

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveMood(seed: string, authoringSignals: string) {
  const combined = `${seed} ${authoringSignals}`;
  if (/裁员|下滑|亏损|焦虑|风险|危机|崩|压力/.test(seed)) {
    return "冷峻、高反差、纪实摄影";
  }
  if (/增长|机会|扩张|新品|突破|创新|发布/.test(seed)) {
    return "克制、留白、现代商业摄影";
  }
  if (/幽默|段子|轻松|俏皮|反差/.test(combined)) {
    return "轻巧、机智、略带插画感";
  }
  if (/专业论文|研究|顾问|严谨|理性|方法论/.test(combined)) {
    return "理性、克制、信息设计感";
  }
  if (/故事文|叙事|纪实|经历|经验分享/.test(combined)) {
    return "有叙事感、轻电影感、场景明确";
  }
  return "新中式、纸张肌理、静物感";
}

function buildRoleHint(context: ImageAuthoringStyleContext | null | undefined) {
  const identity = context?.persona?.identityTags?.[0];
  if (!identity) {
    return "";
  }
  return `如需出现职业或工作场景，请优先贴近“${identity}”的真实语境。`;
}

export function buildVisualSuggestion(
  title: string,
  markdown: string,
  authoringContext?: ImageAuthoringStyleContext | null,
) {
  const plain = stripMarkdown(markdown);
  const seed = (plain || title || "写作主题").slice(0, 120);
  const mood = resolveMood(seed, buildVisualSignalText(authoringContext));

  const subject = title.trim() || seed.slice(0, 24) || "内容生产现场";
  const authoringLine = buildVisualAuthoringDirective(authoringContext, "cover");
  const roleHint = buildRoleHint(authoringContext);
  return `视觉联想：围绕“${subject}”，提炼一个单主体隐喻场景，画面保持 ${mood}，16:9 横版，不出现水印与密集文字，只保留一个高辨识度主体和明确情绪。${authoringLine ? `${authoringLine} ` : ""}${roleHint ? `${roleHint} ` : ""}参考内容：${seed || "请根据当前稿件核心冲突生成画面。"}。`;
}

export function buildNodeVisualSuggestion(input: {
  articleTitle: string;
  nodeTitle: string;
  nodeDescription?: string | null;
  fragments: Array<{ distilledContent: string }>;
  authoringContext?: ImageAuthoringStyleContext | null;
}) {
  const seed = stripMarkdown(
    [input.nodeTitle, input.nodeDescription || "", ...input.fragments.slice(0, 2).map((fragment) => fragment.distilledContent)].join(" "),
  ).slice(0, 140);
  const subject = input.nodeTitle.trim() || input.articleTitle.trim() || "当前段落";
  const mood = /裁员|亏损|争议|风险|危机|焦虑|失效|冲突/.test(seed)
    ? "冷峻、压迫感、纪实摄影"
    : /增长|机会|突破|创新|回暖|发布/.test(seed)
      ? "克制、明亮、商业摄影"
      : resolveMood(seed, buildVisualSignalText(input.authoringContext));
  const authoringLine = buildVisualAuthoringDirective(input.authoringContext, "inline");
  const roleHint = buildRoleHint(input.authoringContext);
  return `围绕“${subject}”做一张段落配图：单主体隐喻场景，${mood}，竖版留白，避免海报感与大段文字。${authoringLine ? `${authoringLine} ` : ""}${roleHint ? `${roleHint} ` : ""}参考信息：${seed || "根据当前节点的冲突与结论生成配图。"}。`;
}
