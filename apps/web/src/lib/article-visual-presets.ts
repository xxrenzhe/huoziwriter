import type {
  ArticleVisualBrief,
  ArticleVisualScope,
  BaoyuCoverPalette,
  BaoyuCoverRendering,
  BaoyuCoverType,
  BaoyuFont,
  BaoyuInlinePalette,
  BaoyuInlineStyle,
  BaoyuInlineType,
  BaoyuMood,
} from "./article-visual-types";

export const BAOYU_COVER_TYPES = ["hero", "conceptual", "typography", "metaphor", "scene", "minimal"] as const;
export const BAOYU_COVER_PALETTES = ["warm", "elegant", "cool", "dark", "earth", "vivid", "pastel", "mono", "retro", "duotone", "macaron"] as const;
export const BAOYU_COVER_RENDERINGS = ["flat-vector", "hand-drawn", "painterly", "digital", "pixel", "chalk", "screen-print"] as const;
export const BAOYU_INLINE_TYPES = ["infographic", "scene", "flowchart", "comparison", "framework", "timeline", "diagram", "comic"] as const;
export const BAOYU_INLINE_STYLES = ["editorial", "notion", "warm", "minimal", "blueprint", "technical-schematic", "morandi-journal"] as const;
export const BAOYU_INLINE_PALETTES = ["warm", "cool", "macaron", "mono", "retro", "earth", "duotone"] as const;

type CoverPreset = {
  type: BaoyuCoverType;
  palette: BaoyuCoverPalette;
  rendering: BaoyuCoverRendering;
  mood: BaoyuMood;
  font: BaoyuFont;
};

type InlinePreset = {
  scope: ArticleVisualScope;
  type: BaoyuInlineType;
  style: BaoyuInlineStyle;
  palette: BaoyuInlinePalette;
  layoutCode: string | null;
  aspectRatio: string;
  baoyuSkill: ArticleVisualBrief["baoyuSkill"];
};

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function isPowerShiftTopic(text: string) {
  return hasAny(text, [
    /Anthropic|OpenAI|微软|Google|谷歌|Meta|英伟达|NVIDIA|亚马逊|Amazon|奥特曼|CFO|CEO|董事会/i,
    /营收|ARR|估值|融资|IPO|现金流|利润|周活|算力|合同|股价|投资者|反超|超越|碾压|易主|变天|王座|路线分歧|内讧/i,
  ]);
}

export function chooseBaoyuCoverPreset(input: {
  title: string;
  markdown?: string | null;
  audience?: string | null;
}): CoverPreset {
  const text = [input.title, input.markdown || "", input.audience || ""].join("\n");
  if (isPowerShiftTopic(text)) {
    return {
      type: "scene",
      palette: "dark",
      rendering: "digital",
      mood: "bold",
      font: "clean",
    };
  }
  if (hasAny(text, [/AI|人工智能|产品|SaaS|工具|模型|自动化|工作流/i, /方法论|框架|系统/i])) {
    return {
      type: "conceptual",
      palette: "cool",
      rendering: "digital",
      mood: "balanced",
      font: "clean",
    };
  }
  if (hasAny(text, [/海外|美金|美元|联盟营销|affiliate|出海|跨境|独立站/i, /赚钱|副业|变现|收入/i])) {
    return {
      type: "hero",
      palette: "retro",
      rendering: "screen-print",
      mood: "bold",
      font: "display",
    };
  }
  if (hasAny(text, [/职场|老板|同事|晋升|跳槽|简历|面试|裁员|副业/i])) {
    return {
      type: "metaphor",
      palette: "warm",
      rendering: "flat-vector",
      mood: "balanced",
      font: "clean",
    };
  }
  if (hasAny(text, [/事实核查|研究|报告|数据|趋势|分析|复盘/i])) {
    return {
      type: "minimal",
      palette: "mono",
      rendering: "flat-vector",
      mood: "subtle",
      font: "serif",
    };
  }
  return {
    type: "conceptual",
    palette: "elegant",
    rendering: "flat-vector",
    mood: "balanced",
    font: "clean",
  };
}

export function chooseBaoyuInlinePreset(input: {
  title: string;
  text: string;
  index: number;
}): InlinePreset {
  const text = [input.title, input.text].join("\n");
  if (hasAny(text, [/CFO|CEO|董事会|路线分歧|内讧|裂痕|担忧|后院起火|抄袭|掉队|失和/i])) {
    return {
      scope: "comic",
      type: "comic",
      style: "editorial",
      palette: "warm",
      layoutCode: "knowledge-comic",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-comic",
    };
  }
  if (hasAny(text, [/营收|ARR|估值|融资|IPO|现金流|利润|周活|算力|合同|股价|投资者|时间差|成本结构|企业客户/i])) {
    return {
      scope: "infographic",
      type: "comparison",
      style: "technical-schematic",
      palette: "duotone",
      layoutCode: "scoreboard-comparison",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/步骤|流程|路径|怎么做|操作|链路|工作流| SOP|闭环/i])) {
    return {
      scope: "infographic",
      type: "flowchart",
      style: "blueprint",
      palette: "cool",
      layoutCode: "flowchart",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/框架|模型|系统|结构|机制|原则|方法论/i])) {
    return {
      scope: "infographic",
      type: "framework",
      style: "technical-schematic",
      palette: "duotone",
      layoutCode: "framework",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/对比|区别|优劣|选择|相比|取舍|利弊/i])) {
    return {
      scope: "infographic",
      type: "comparison",
      style: "morandi-journal",
      palette: "warm",
      layoutCode: "binary-comparison",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/清单|工具|资源|渠道|平台|指标|数据|漏斗/i])) {
    return {
      scope: "infographic",
      type: "infographic",
      style: "notion",
      palette: "macaron",
      layoutCode: "dense-modules",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/趋势|阶段|演进|时间线|过去|未来|历史/i])) {
    return {
      scope: "infographic",
      type: "timeline",
      style: "minimal",
      palette: "mono",
      layoutCode: "timeline",
      aspectRatio: "16:9",
      baoyuSkill: "baoyu-infographic",
    };
  }
  if (hasAny(text, [/误区|反直觉|为什么|知识点|概念|案例|故事|对话|读者|用户心理|认知/i])) {
    return {
      scope: "comic",
      type: "comic",
      style: "editorial",
      palette: "warm",
      layoutCode: "knowledge-comic",
      aspectRatio: "3:4",
      baoyuSkill: "baoyu-comic",
    };
  }
  return {
    scope: "inline",
    type: input.index % 2 === 0 ? "framework" : "scene",
    style: input.index % 2 === 0 ? "notion" : "editorial",
    palette: input.index % 2 === 0 ? "macaron" : "warm",
    layoutCode: input.index % 2 === 0 ? "framework" : null,
    aspectRatio: "3:4",
    baoyuSkill: "baoyu-article-illustrator",
  };
}
