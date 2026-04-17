export type ImageAuthoringStyleContext = {
  persona?: {
    name: string;
    identityTags: string[];
    writingStyleTags: string[];
    boundWritingStyleProfileName?: string | null;
  } | null;
  writingStyleProfile?: {
    name: string;
    summary: string;
    toneKeywords: string[];
    structurePatterns: string[];
    languageHabits: string[];
    openingPatterns: string[];
    endingPatterns: string[];
    doNotWrite?: string[];
    imitationPrompt?: string;
  } | null;
};

function joinTags(tags: string[] = [], limit = 3) {
  return Array.from(new Set(tags.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit).join("、");
}

export function buildVisualAuthoringDirective(
  context: ImageAuthoringStyleContext | null | undefined,
  mode: "cover" | "inline",
) {
  if (!context?.persona && !context?.writingStyleProfile) {
    return "";
  }

  const persona = context.persona;
  const profile = context.writingStyleProfile;
  const personaBits = [
    persona?.name ? `作者人设：${persona.name}` : null,
    persona?.identityTags?.length ? `身份语境：${joinTags(persona.identityTags, 2)}` : null,
    persona?.writingStyleTags?.length ? `表达标签：${joinTags(persona.writingStyleTags, 2)}` : null,
    persona?.boundWritingStyleProfileName ? `绑定文风：${persona.boundWritingStyleProfileName}` : null,
  ].filter(Boolean);
  const profileBits = [
    profile?.toneKeywords?.length ? `语气：${joinTags(profile.toneKeywords, 3)}` : null,
    profile?.structurePatterns?.length ? `结构：${joinTags(profile.structurePatterns, 2)}` : null,
    profile?.languageHabits?.length ? `语言习惯：${joinTags(profile.languageHabits, 2)}` : null,
  ].filter(Boolean);
  const modeLine =
    mode === "cover"
      ? "封面需要像这位作者会采用的公众号头图，不要做成泛用图库风或空洞科技海报。"
      : "配图只服务当前段落论点推进，贴合正文语气，不要喧宾夺主。";

  return [personaBits.join("；"), profileBits.join("；"), modeLine].filter(Boolean).join(" ");
}

export function buildVisualSignalText(context: ImageAuthoringStyleContext | null | undefined) {
  if (!context) {
    return "";
  }

  return [
    ...(context.persona?.identityTags || []),
    ...(context.persona?.writingStyleTags || []),
    ...(context.writingStyleProfile?.toneKeywords || []),
    ...(context.writingStyleProfile?.languageHabits || []),
    ...(context.writingStyleProfile?.structurePatterns || []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
}
