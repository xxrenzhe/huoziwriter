import { createHash } from "node:crypto";
import type { ArticleVisualBrief } from "./article-visual-types";

const DEFAULT_NEGATIVE_PROMPT = [
  "不要水印",
  "不要密集小字",
  "不要未经正文支撑的数字",
  "不要伪造真实人物肖像或新闻照片",
  "不要品牌 logo 或商标暗示",
].join("；");

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

export function hashArticleVisualPrompt(input: {
  prompt: string;
  manifest: Record<string, unknown>;
}) {
  return createHash("sha256").update(input.prompt).update("\n").update(stableJson(input.manifest)).digest("hex").slice(0, 16);
}

export function buildArticleVisualPromptManifest(brief: ArticleVisualBrief) {
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
    labels: brief.labels,
    sourceFacts: brief.sourceFacts,
    altText: brief.altText,
    promptVersion: "baoyu-compatible-2026-04-27",
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
    return compactLines([
      `为一篇中文公众号文章生成封面图，标题是《${brief.title}》。`,
      `目标：${brief.purpose}`,
      `使用 baoyu-cover-image 视觉维度：type=${brief.visualType}，palette=${brief.paletteCode}，rendering=${brief.renderingCode}，text=${brief.textLevel}，mood=${brief.moodCode}，font=${brief.fontCode}。`,
      `画幅：${brief.aspectRatio}，输出分辨率：${brief.outputResolution}。`,
      brief.labels.length ? `画面可使用的短标签：${brief.labels.join("、")}。` : null,
      brief.sourceFacts.length ? `只允许从这些事实中提炼画面隐喻：${brief.sourceFacts.join("；")}。` : null,
      "画面要有单一高辨识度主体，适合公众号信息流点击；如果包含中文文字，只保留标题级短字，不要密集排版。",
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

  return compactLines([
    `为中文公众号文章的文中段落生成配图，文章标题：《${brief.title}》。`,
    `插图位置：${brief.targetAnchor}。`,
    `配图目的：${brief.purpose}`,
    `使用 baoyu-article-illustrator / infographic 视觉维度：type=${brief.visualType}，style=${brief.styleCode}，palette=${brief.paletteCode}，layout=${brief.layoutCode || "auto"}。`,
    `画幅：${brief.aspectRatio}，输出分辨率：${brief.outputResolution}。`,
    brief.labels.length ? `图中可出现的中文标签：${brief.labels.join("、")}。` : null,
    brief.sourceFacts.length ? `只能使用这些事实，不要新增数据或案例：${brief.sourceFacts.join("；")}。` : null,
    "图片必须承担证据、对比、路径或节奏换气作用，不生成“痛点引入”“方法总结”“行动建议”这类内部结构提示卡。",
    "图片要帮助读者理解正文，不做无关装饰；不要出现水印、虚假截图、真实平台收益截图或未经授权品牌标识。",
  ]);
}
