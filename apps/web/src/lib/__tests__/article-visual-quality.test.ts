import assert from "node:assert/strict";
import test from "node:test";

import { buildArticleDiagramSvg, sanitizeGeneratedSvg } from "../article-svg-diagram";
import { evaluateVisualAssetQuality } from "../article-visual-quality";
import type { ArticleVisualAsset, ArticleVisualBrief } from "../article-visual-types";

function brief(overrides: Partial<ArticleVisualBrief> = {}): ArticleVisualBrief {
  return {
    id: 7,
    userId: 1,
    articleId: 10,
    articleNodeId: 20,
    visualScope: "diagram",
    targetAnchor: "完整流程",
    baoyuSkill: "baoyu-diagram",
    visualType: "flowchart",
    layoutCode: "flowchart",
    styleCode: "technical-schematic",
    paletteCode: "duotone",
    renderingCode: null,
    textLevel: "title-only",
    moodCode: "balanced",
    fontCode: "clean",
    aspectRatio: "3:4",
    outputResolution: "1K",
    title: "AI 写作生产线",
    purpose: "解释从素材到发布的闭环",
    altText: "AI 写作生产线流程图",
    caption: "完整流程",
    labels: ["素材", "大纲", "写作", "核查"],
    sourceFacts: ["流程包含素材、写作、核查和发布"],
    promptText: "生成流程图",
    negativePrompt: "不要生成未经证实的数字",
    promptHash: "hash-1",
    promptManifest: { skill: "baoyu-diagram" },
    status: "generated",
    ...overrides,
  };
}

function asset(overrides: Partial<ArticleVisualAsset> = {}): ArticleVisualAsset {
  return {
    id: 30,
    visualBriefId: 7,
    articleNodeId: 20,
    assetType: "diagram_png",
    publicUrl: "/uploads/diagram.webp",
    altText: "AI 写作生产线流程图",
    caption: "完整流程",
    insertAnchor: "完整流程",
    status: "ready",
    manifest: {
      promptHash: "hash-1",
      baoyu: { skill: "baoyu-diagram" },
      original: {
        contentType: "image/svg+xml",
        publicUrl: "/uploads/diagram.svg",
      },
      compressed: {
        contentType: "image/webp",
        publicUrl: "/uploads/diagram.webp",
        width: 900,
        height: 1200,
      },
    },
    ...overrides,
  };
}

test("evaluateVisualAssetQuality passes diagram with svg original and raster derivative", () => {
  const result = evaluateVisualAssetQuality({
    brief: brief(),
    asset: asset(),
    requirePublishReady: true,
  });
  assert.equal(result.status, "passed");
  assert.deepEqual(result.blockers, []);
});

test("evaluateVisualAssetQuality blocks publish when diagram lacks raster derivative", () => {
  const result = evaluateVisualAssetQuality({
    brief: brief(),
    asset: asset({
      manifest: {
        promptHash: "hash-1",
        baoyu: { skill: "baoyu-diagram" },
        original: { contentType: "image/svg+xml" },
        compressed: { contentType: "image/svg+xml", width: 900, height: 1200 },
      },
    }),
    requirePublishReady: true,
  });
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("；"), /可发布衍生图/);
});

test("evaluateVisualAssetQuality warns when inline source facts are missing", () => {
  const result = evaluateVisualAssetQuality({
    brief: brief({ sourceFacts: [] }),
    asset: asset(),
    requirePublishReady: false,
  });
  assert.equal(result.status, "warning");
  assert.match(result.warnings.join("；"), /sourceFacts/);
});

test("evaluateVisualAssetQuality blocks internal structure labels in inline visuals", () => {
  const result = evaluateVisualAssetQuality({
    brief: brief({
      visualScope: "inline",
      baoyuSkill: "baoyu-article-illustrator",
      visualType: "scene",
      title: "痛点引入",
      caption: "方法总结",
      labels: ["痛点引入", "预算复盘"],
    }),
    asset: asset(),
    requirePublishReady: true,
  });

  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("；"), /内部结构标签/);
});

test("evaluateVisualAssetQuality blocks missing inline assets when preparing wechat draft", () => {
  const result = evaluateVisualAssetQuality({
    brief: brief({ visualScope: "inline", baoyuSkill: "baoyu-article-illustrator", visualType: "scene" }),
    asset: null,
    requirePublishReady: true,
  });
  assert.equal(result.status, "blocked");
  assert.match(result.blockers.join("；"), /文中配图/);
});

test("sanitizeGeneratedSvg removes scripts, event handlers and remote links", () => {
  const sanitized = sanitizeGeneratedSvg('<svg><script>alert(1)</script><a href="https://bad.test"><rect onclick="x()" /></a></svg>');
  assert.doesNotMatch(sanitized, /script/i);
  assert.doesNotMatch(sanitized, /onclick/i);
  assert.doesNotMatch(sanitized, /https:\/\/bad\.test/i);
});

test("buildArticleDiagramSvg emits safe svg text from brief labels", () => {
  const svg = buildArticleDiagramSvg(brief({ labels: ["素材<script>", "核查&发布"] }));
  assert.match(svg, /素材/);
  assert.match(svg, /核查&amp;发布/);
  assert.doesNotMatch(svg, /<script>/i);
});

test("buildArticleDiagramSvg wraps diagram labels and filters broken text fragments", () => {
  const svg = buildArticleDiagramSvg(brief({
    title: "质量得分（Quality Score）是 Google Ads 搜索广告的关键词级诊断工具",
    purpose: "解释质量得分能看什么，以及为什么它不是优化目标本身",
    labels: ["质量得分（Quality", "Score）是", "Google", "Ads", "分值范围为", "10"],
    sourceFacts: [
      "质量得分（Quality Score）是 Google Ads 用于搜索广告系列的关键词级诊断工具，分值范围为 1 至 10",
      "它不是关键绩效指标，也不作为广告竞价的输入，不应与其他数据汇总后用于优化",
      "该分数由预期点击率、广告相关性和落地页体验 3 个组成部分的综合表现计算而来",
    ],
  }));

  assert.match(svg, /<tspan\b/);
  assert.match(svg, /质量得分/);
  assert.match(svg, /预期点击率|广告相关性|落地页体验/);
  assert.doesNotMatch(svg, /Quality<\/tspan>|Score）是|Google<\/tspan>|Ads<\/tspan>|分值范围为|>10</);
});

test("buildArticleDiagramSvg keeps long framework text inside bounded lines", () => {
  const svg = buildArticleDiagramSvg(brief({
    visualType: "framework",
    layoutCode: "framework",
    title: "搜索广告投放中，关键词表现存在差异：一些看起来精准的关键词长期不赚钱",
    purpose: "用结构图说明为什么应先判断搜索意图，而不只是做关键词字面匹配",
    labels: [
      "一些普通关键词能稳定出单",
      "而不只是关键词",
      "出价",
      "质量分",
      "文案或竞争强度",
      "而不只是做关键词字面匹配",
    ],
    sourceFacts: [
      "影响流量价值的核心变量是搜索意图，而不只是关键词、出价、质量分、文案或竞争强度",
      "搜索引擎会根据用户当下想做的事进行意图匹配，而不只是做关键词字面匹配；当搜索意图变化时，搜索结果会随之变化",
    ],
  }));
  const textLines = [...svg.matchAll(/<tspan[^>]*>(.*?)<\/tspan>/g)].map((match) => match[1].replace(/&[^;]+;/g, ""));

  assert.ok(textLines.length >= 8);
  assert.ok(textLines.every((line) => line.length <= 25), textLines.join(" | "));
  assert.doesNotMatch(svg, /而不只是关键词|而不只是做关键词字面匹配/);
});
