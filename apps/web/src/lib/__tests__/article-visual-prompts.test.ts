import assert from "node:assert/strict";
import test from "node:test";

import { chooseBaoyuCoverPreset, chooseBaoyuInlinePreset } from "../article-visual-presets";
import { buildArticleVisualPromptManifest } from "../article-visual-prompts";
import { sanitizeUserVisibleVisualCaption } from "../article-structure-labels";
import type { ArticleVisualBrief } from "../article-visual-types";

function baseBrief(overrides: Partial<ArticleVisualBrief> = {}): ArticleVisualBrief {
  return {
    userId: 1,
    articleId: 10,
    articleNodeId: null,
    visualScope: "cover",
    targetAnchor: "cover",
    baoyuSkill: "baoyu-cover-image",
    visualType: "conceptual",
    paletteCode: "cool",
    renderingCode: "digital",
    textLevel: "title-only",
    moodCode: "balanced",
    fontCode: "clean",
    aspectRatio: "16:9",
    outputResolution: "1K",
    title: "AI 产品如何重做内容工作流",
    purpose: "建立点击心智",
    altText: "AI 产品文章封面图",
    caption: null,
    labels: ["AI 产品", "内容工作流"],
    sourceFacts: ["团队把选题、写作、事实核查和发布串成一个自动化流程"],
    status: "prompt_ready",
    ...overrides,
  };
}

test("chooseBaoyuCoverPreset maps AI product articles to conceptual digital cover", () => {
  const preset = chooseBaoyuCoverPreset({
    title: "AI 产品如何重做内容工作流",
    markdown: "这是一篇关于 AI 产品、自动化和内容工作流的文章。",
  });
  assert.equal(preset.type, "conceptual");
  assert.equal(preset.palette, "cool");
  assert.equal(preset.rendering, "digital");
});

test("chooseBaoyuInlinePreset prefers diagram for workflow sections", () => {
  const preset = chooseBaoyuInlinePreset({
    title: "完整执行流程",
    text: "从选题到事实核查再到发布形成一个闭环工作流。",
    index: 0,
  });
  assert.equal(preset.scope, "diagram");
  assert.equal(preset.type, "flowchart");
  assert.equal(preset.baoyuSkill, "baoyu-diagram");
});

test("buildArticleVisualPromptManifest is stable and keeps source facts explicit", () => {
  const first = buildArticleVisualPromptManifest(baseBrief());
  const second = buildArticleVisualPromptManifest(baseBrief());
  assert.equal(first.promptHash, second.promptHash);
  assert.match(first.prompt, /只允许从这些事实中提炼画面隐喻/);
  assert.match(first.prompt, /团队把选题、写作、事实核查和发布串成一个自动化流程/);
  assert.equal(first.manifest.skill, "baoyu-cover-image");
  assert.deepEqual(first.manifest.sourceFacts, ["团队把选题、写作、事实核查和发布串成一个自动化流程"]);
});

test("buildArticleVisualPromptManifest records infographic dimensions", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    visualScope: "infographic",
    baoyuSkill: "baoyu-infographic",
    visualType: "comparison",
    layoutCode: "binary-comparison",
    styleCode: "morandi-journal",
    paletteCode: "warm",
    targetAnchor: "核心对比",
    title: "两种内容生产方式对比",
    purpose: "帮助读者快速理解取舍",
    altText: "内容生产方式对比图",
  }));
  assert.match(result.prompt, /type=comparison/);
  assert.match(result.prompt, /layout=binary-comparison/);
  assert.equal(result.manifest.layout, "binary-comparison");
});

test("sanitizeUserVisibleVisualCaption suppresses internal outline labels", () => {
  assert.equal(sanitizeUserVisibleVisualCaption("痛点引入"), null);
  assert.equal(sanitizeUserVisibleVisualCaption(" 核心反转 "), null);
  assert.equal(sanitizeUserVisibleVisualCaption("方法总结"), null);
  assert.equal(sanitizeUserVisibleVisualCaption("读者收益"), null);
  assert.equal(sanitizeUserVisibleVisualCaption("搜索意图四象限"), "搜索意图四象限");
});
