import { createHash } from "node:crypto";
import type { ArticleVisualBrief } from "./article-visual-types";
import type { ArticleViralMode } from "./article-viral-modes";

const DEFAULT_NEGATIVE_PROMPT = [
  "不要水印",
  "不要密集小字",
  "不要纯文字卡片",
  "不要文字溢出或裁切",
  "不要小字堆叠",
  "不要未经正文支撑的数字",
  "不要伪造真实人物肖像或新闻照片",
  "不要品牌 logo 或商标暗示",
].join("；");

type CoverExpressionStrategy =
  | "concept_poster"
  | "mechanism_focus"
  | "scene_narrative"
  | "symbolic_metaphor"
  | "editorial_analysis"
  | "power_shift_scoreboard";

function compactLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => String(line || "").trim()).filter(Boolean).join("\n");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeCoverSourceText(brief: ArticleVisualBrief) {
  return [
    brief.title,
    brief.purpose,
    brief.altText,
    brief.coverHook || "",
    brief.visualAngle || "",
    brief.targetEmotionHint || "",
    brief.labels.join(" "),
    brief.sourceFacts.join(" "),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPattern(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function isPowerShiftVisualBrief(brief: ArticleVisualBrief) {
  if (brief.viralMode === "power_shift_breaking") {
    return true;
  }
  const source = normalizeCoverSourceText(brief);
  return hasPattern(source, [
    /Anthropic|OpenAI|微软|Google|谷歌|Meta|英伟达|NVIDIA|亚马逊|Amazon|奥特曼|CFO|CEO|董事会/i,
    /营收|ARR|估值|融资|IPO|现金流|利润|周活|算力|合同|股价|投资者|反超|超越|碾压|易主|变天|王座|路线分歧|内讧|裂痕/i,
  ]);
}

function inferCoverExpressionStrategy(brief: ArticleVisualBrief) {
  const source = normalizeCoverSourceText(brief);
  const shortConceptTitle = brief.title.replace(/\s+/g, "").length <= 8 && !/[，。！？:：]/.test(brief.title);
  if (isPowerShiftVisualBrief(brief)) {
    return "power_shift_scoreboard" as const;
  }
  const hasSceneSignals = hasPattern(source, [/案例|现场|对话|人物|创始人|老板|用户|客户|会议室|工位|职场|副业|创业|出海|跨境|复盘会|原话/i]);
  const hasMechanismSignals = hasPattern(source, [/AI|产品|SaaS|工具|自动化|系统|工作流|流程|链路|方法|框架|模型|机制|路径|策略/i]);
  const hasAnalysisSignals = hasPattern(source, [/研究|报告|数据|趋势|分析|复盘|拆解|观察|判断|信号|结构|变化/i]);
  const hasTensionSignals = hasPattern(source, [/误判|代价|冲突|反差|危险|焦虑|卡住|压迫|机会|重构|失控|断裂/i]);

  if (brief.visualType === "typography" || (shortConceptTitle && brief.visualType === "conceptual")) {
    return "concept_poster" as const;
  }
  if (brief.visualType === "hero" || brief.visualType === "scene" || hasSceneSignals) {
    return "scene_narrative" as const;
  }
  if (brief.visualType === "minimal" || hasAnalysisSignals) {
    return "editorial_analysis" as const;
  }
  if (brief.visualType === "metaphor" || hasTensionSignals) {
    return "symbolic_metaphor" as const;
  }
  if (brief.visualType === "conceptual" || hasMechanismSignals) {
    return "mechanism_focus" as const;
  }
  return "mechanism_focus" as const;
}

function buildCoverStrategyLines(brief: ArticleVisualBrief) {
  const strategy = inferCoverExpressionStrategy(brief);
  if (strategy === "power_shift_scoreboard") {
    return {
      strategy,
      lines: [
        "封面方向：权力更替/资本战看板封面，优先表达王座易主、胜负反转和账本压力。",
        "画面优先给出两个对立主体、一个倾斜的胜负结构，或一个明显的上升/下坠对比，不要做普通科技感海报。",
        "优先把营收、成本、时间差、企业客户或组织裂痕转成图形化关系，而不是把整句标题贴满画面。",
        "不要做纯文字卡片，不要画成空泛商务人物站位图，也不要伪造新闻照片或真实财报截图。",
      ],
    };
  }
  if (strategy === "concept_poster") {
    return {
      strategy,
      lines: [
        "封面方向：高级概念海报。允许把核心词语或短标题当作视觉骨架，但前提是文字和图像必须共同表达主题，而不是做普通字效海报。",
        "先理解标题里的核心概念、情绪倾向、隐含张力和文化联想，再把它转成一个极简、强记忆点的视觉隐喻。",
        "构图以大字或强符号为核心，元素数量极少，强调图与字的相互咬合。",
        "如果文字进入画面，只允许极少量、完整可读、真正增强主题的标题级文字。",
      ],
    };
  }
  if (strategy === "scene_narrative") {
    return {
      strategy,
      lines: [
        "封面方向：主题场景或人物关系封面，不做抽象海报优先。",
        "优先给出一个能让目标读者秒懂主题的场景瞬间、人物关系、动作冲突或结果感画面，让人一眼知道文章在讨论什么。",
        "避免把封面做成概念空转的隐喻图；场景必须服务主题，不要泛职场插画或空泛商务人物。",
        "优先无字封面；除非关键词能明显增强识别，否则不要强行把完整标题放进画面。",
      ],
    };
  }
  if (strategy === "editorial_analysis") {
    return {
      strategy,
      lines: [
        "封面方向：编辑感分析型封面，强调判断、结构和信息势能，而不是热闹插画。",
        "用单一强主体、对比关系、象征物或编辑化排版建立“这是一篇有判断的分析文章”的气质。",
        "不要生成数据看板截图、假图表或密集信息板；只保留能够承载主题的少量结构性元素。",
        "画面更克制、更高级，优先无字或极少量关键词，不要整句标题贴在画面上。",
      ],
    };
  }
  if (strategy === "symbolic_metaphor") {
    return {
      strategy,
      lines: [
        "封面方向：象征性隐喻封面，但隐喻必须能被读者快速读懂，不能做成晦涩艺术图。",
        "优先用物体关系、尺度反差、方向冲突、遮挡或单一动作瞬间，把主题里的冲突、代价或反差表达出来。",
        "隐喻要紧贴主题，不为了好看偏离文章真正讨论的问题。",
        "默认不强制上大字，只有当一个短词能明显增强记忆点时才允许少量文字入画。",
      ],
    };
  }
  return {
    strategy,
    lines: [
      "封面方向：机制/主题聚焦封面，核心是让用户一眼知道文章在谈哪类问题、工具、路径或变化。",
      "优先把主题转成一个高识别度主体或主体关系，突出机制感、结果感或结构变化，而不是做泛美术插画。",
      "画面要贴主题、利于点击、利于信息流识别，不需要把正文所有信息都塞进封面。",
      "除非关键词本身就是主题的一部分，否则优先无字或极少量关键词，不要强制整句标题入画。",
    ],
  };
}

export function hashArticleVisualPrompt(input: {
  prompt: string;
  manifest: Record<string, unknown>;
}) {
  return createHash("sha256").update(input.prompt).update("\n").update(stableJson(input.manifest)).digest("hex").slice(0, 16);
}

export function buildArticleVisualPromptManifest(brief: ArticleVisualBrief) {
  const coverStrategy = brief.visualScope === "cover" ? inferCoverExpressionStrategy(brief) : null;
  const manifest = {
    skill: brief.baoyuSkill,
    visualScope: brief.visualScope,
    targetAnchor: brief.targetAnchor,
    visualType: brief.visualType,
    layout: brief.layoutCode || null,
    style: brief.styleCode || null,
    palette: brief.paletteCode || null,
    rendering: brief.renderingCode || null,
    text: brief.textLevel || null,
    mood: brief.moodCode || null,
    font: brief.fontCode || null,
    aspect: brief.aspectRatio,
    outputResolution: brief.outputResolution,
    language: "zh",
    title: brief.title,
    purpose: brief.purpose,
    viralMode: (brief.viralMode || "default") as ArticleViralMode,
    labels: brief.labels,
    sourceFacts: brief.sourceFacts,
    altText: brief.altText,
    coverHook: brief.coverHook || null,
    visualAngle: brief.visualAngle || null,
    targetEmotionHint: brief.targetEmotionHint || null,
    coverStrategy,
    promptVersion: "baoyu-compatible-2026-04-29-cover-v2",
  };
  const prompt = buildArticleVisualPrompt(brief);
  return {
    prompt,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    manifest,
    promptHash: hashArticleVisualPrompt({ prompt, manifest }),
  };
}

export function buildArticleVisualPrompt(brief: ArticleVisualBrief) {
  if (brief.visualScope === "cover") {
    const coverStrategy = buildCoverStrategyLines(brief);
    return compactLines([
      `为一篇中文公众号文章生成封面图，标题是《${brief.title}》。`,
      `目标：${brief.purpose}`,
      `使用 baoyu-cover-image 视觉维度：type=${brief.visualType}，palette=${brief.paletteCode}，rendering=${brief.renderingCode}，text=${brief.textLevel}，mood=${brief.moodCode}，font=${brief.fontCode}。`,
      `画幅：${brief.aspectRatio}，输出分辨率：${brief.outputResolution}。`,
      `封面表达策略：${coverStrategy.strategy}。`,
      brief.coverHook ? `封面优先兑现的点击钩子：${brief.coverHook}。` : null,
      brief.visualAngle ? `封面应传达的主题角度：${brief.visualAngle}。` : null,
      brief.targetEmotionHint ? `封面优先传达的情绪：${brief.targetEmotionHint}。` : null,
      brief.labels.length ? `画面可使用的短标签：${brief.labels.join("、")}。` : null,
      brief.sourceFacts.length ? `只允许从这些事实中提炼画面隐喻：${brief.sourceFacts.join("；")}。` : null,
      ...coverStrategy.lines,
      isPowerShiftVisualBrief(brief)
        ? "这类封面优先让读者一眼看见谁在上升、谁在承压、哪边开始倾斜；数字可以图形化表达，但不要塞密集小字和整屏表格。"
        : null,
      "如果上游已经给了点击钩子或视觉角度，封面必须先兑现它，再决定用场景、物体、关系、结构或文字去表达。",
      "画面要有单一高辨识度主体，适合公众号信息流点击；不要做普通商业插画、廉价模板海报、空洞抽象图案或与主题无关的漂亮画面。",
      "先保证主题贴合和点击吸引力，再追求风格化；图像必须让用户感到这篇文章在谈什么，而不只是感到画面好看。",
      "如果包含中文文字，必须极少、完整可读、不得贴边、溢出或裁切；如果文字不能真正增强主题，就不要放文字。",
      `负面约束：${DEFAULT_NEGATIVE_PROMPT}。`,
    ]);
  }

  if (brief.visualScope === "diagram") {
    return compactLines([
      `生成一张中文 SVG 图解，主题：${brief.title}。`,
      `图解目的：${brief.purpose}`,
      `结构类型：${brief.visualType}，布局：${brief.layoutCode || brief.visualType}，风格：${brief.styleCode}，调色：${brief.paletteCode}。`,
      brief.labels.length ? `图中短标签只能使用：${brief.labels.join("、")}。` : null,
      brief.sourceFacts.length ? `事实来源：${brief.sourceFacts.join("；")}。` : null,
      "SVG 必须结构清晰、中文短句可读，不使用外链、脚本、事件属性或远程字体。",
    ]);
  }

  if (brief.visualScope === "comic" || brief.baoyuSkill === "baoyu-comic") {
    return compactLines([
      `为中文公众号文章生成一张知识漫画，主题：${brief.title}。`,
      `漫画目的：${brief.purpose}`,
      `使用 baoyu-comic 视觉维度：type=${brief.visualType}，style=${brief.styleCode}，palette=${brief.paletteCode}，layout=${brief.layoutCode || "knowledge-comic"}。`,
      `画幅：${brief.aspectRatio}，输出分辨率：${brief.outputResolution}。`,
      brief.labels.length ? `分镜或气泡短句只能使用：${brief.labels.join("、")}。` : null,
      brief.sourceFacts.length ? `只允许围绕这些事实做知识解释，不新增人物、数据或案例：${brief.sourceFacts.join("；")}。` : null,
      isPowerShiftVisualBrief(brief)
        ? "漫画应以 2-4 格解释一处路线分歧、组织裂痕、账单压力或战略误判，用人物关系、对话冲突和图形符号承载信息，不做纯文字排版。"
        : "漫画应以 2-4 格解释一个知识点、误区或读者心理，用人物动作、对话冲突和图形符号承载信息，不做纯文字排版。",
      "中文气泡每格最多 1-2 句短句，留足边距，文字必须完整可读且不得溢出、重叠、贴边或被裁切。",
    ]);
  }

  return compactLines([
    `为中文公众号文章的文中段落生成配图，文章标题：《${brief.title}》。`,
    `插图位置：${brief.targetAnchor}。`,
    `配图目的：${brief.purpose}`,
    `使用 baoyu-article-illustrator / infographic 视觉维度：type=${brief.visualType}，style=${brief.styleCode}，palette=${brief.paletteCode}，layout=${brief.layoutCode || "auto"}。`,
    `画幅：${brief.aspectRatio}，输出分辨率：${brief.outputResolution}。`,
    brief.labels.length ? `图中可出现的中文标签：${brief.labels.join("、")}。` : null,
    brief.sourceFacts.length ? `只能使用这些事实，不要新增数据或案例：${brief.sourceFacts.join("；")}。` : null,
    "图片必须承担证据、对比、路径或节奏换气作用，不生成“痛点引入”“方法总结”“行动建议”这类内部结构提示卡。",
    isPowerShiftVisualBrief(brief)
      ? "信息图必须优先做成胜负看板、成本对比、时间差、路线对撞或组织裂痕示意；图标、分区、箭头、对比模块至少使用两类，不要生成纯文字海报或整页文字卡。"
      : "信息图必须有图形化结构：图标、分区、箭头、对比模块或流程节点至少使用两类；不要生成纯文字海报或整页文字卡。",
    "中文标签控制在 4-6 个短标签内，字号要大，留足边距，文字必须完整可读且不得溢出、重叠、贴边或被裁切。",
    "图片要帮助读者理解正文，不做无关装饰；不要出现水印、虚假截图、真实平台收益截图或未经授权品牌标识。",
  ]);
}
