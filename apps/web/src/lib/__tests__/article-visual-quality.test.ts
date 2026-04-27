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
  assert.match(svg, /素材&lt;script&gt;/);
  assert.match(svg, /核查&amp;发布/);
  assert.doesNotMatch(svg, /<script>/i);
});
