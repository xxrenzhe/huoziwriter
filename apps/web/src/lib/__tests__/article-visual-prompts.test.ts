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

test("chooseBaoyuCoverPreset switches power-shift topics to dark scene cover", () => {
  const preset = chooseBaoyuCoverPreset({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    markdown: "Anthropic ARR 300 亿美元，OpenAI 240 亿，CFO 与 CEO 路线分歧浮出水面。",
  });
  assert.equal(preset.type, "scene");
  assert.equal(preset.palette, "dark");
  assert.equal(preset.rendering, "digital");
});

test("chooseBaoyuInlinePreset maps workflow sections to image-backed infographic", () => {
  const preset = chooseBaoyuInlinePreset({
    title: "完整执行流程",
    text: "从选题到事实核查再到发布形成一个闭环工作流。",
    index: 0,
  });
  assert.equal(preset.scope, "infographic");
  assert.equal(preset.type, "flowchart");
  assert.equal(preset.baoyuSkill, "baoyu-infographic");
});

test("chooseBaoyuInlinePreset uses comic for knowledge explanation sections", () => {
  const preset = chooseBaoyuInlinePreset({
    title: "为什么读者会误解这个概念",
    text: "这一节用一个反直觉案例解释用户心理和关键知识点。",
    index: 1,
  });
  assert.equal(preset.scope, "comic");
  assert.equal(preset.type, "comic");
  assert.equal(preset.baoyuSkill, "baoyu-comic");
});

test("chooseBaoyuInlinePreset maps capital battle scoreboard sections to infographic", () => {
  const preset = chooseBaoyuInlinePreset({
    title: "胜负先看数字",
    text: "Anthropic ARR、OpenAI 收入、算力合同、现金流和时间差一起决定这场胜负。",
    index: 0,
  });
  assert.equal(preset.scope, "infographic");
  assert.equal(preset.type, "comparison");
  assert.equal(preset.baoyuSkill, "baoyu-infographic");
});

test("chooseBaoyuInlinePreset maps internal fracture sections to comic", () => {
  const preset = chooseBaoyuInlinePreset({
    title: "输家的伤口，已经从外部打到内部",
    text: "CFO 对账单担忧，CEO 继续扩张，董事会和投资者开始质疑路线分歧。",
    index: 1,
  });
  assert.equal(preset.scope, "comic");
  assert.equal(preset.baoyuSkill, "baoyu-comic");
});

test("buildArticleVisualPromptManifest is stable and keeps source facts explicit", () => {
  const first = buildArticleVisualPromptManifest(baseBrief());
  const second = buildArticleVisualPromptManifest(baseBrief());
  assert.equal(first.promptHash, second.promptHash);
  assert.match(first.prompt, /只允许从这些事实中提炼画面隐喻/);
  assert.match(first.prompt, /封面表达策略：mechanism_focus/);
  assert.match(first.prompt, /机制\/主题聚焦封面/);
  assert.match(first.prompt, /不要强制整句标题入画/);
  assert.match(first.prompt, /团队把选题、写作、事实核查和发布串成一个自动化流程/);
  assert.equal(first.manifest.skill, "baoyu-cover-image");
  assert.equal(first.manifest.coverStrategy, "mechanism_focus");
  assert.deepEqual(first.manifest.sourceFacts, ["团队把选题、写作、事实核查和发布串成一个自动化流程"]);
});

test("cover prompt consumes upstream cover hook and visual angle", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    coverHook: "如果内容团队还把发布慢归咎给模型，真正的瓶颈就会继续藏着。",
    visualAngle: "把发布慢拆成图片、素材和微信接口三段，而不是空谈效率。",
    targetEmotionHint: "紧迫但克制",
  }));
  assert.match(result.prompt, /封面优先兑现的点击钩子/);
  assert.match(result.prompt, /真正的瓶颈就会继续藏着/);
  assert.match(result.prompt, /封面应传达的主题角度/);
  assert.match(result.prompt, /图片、素材和微信接口三段/);
  assert.match(result.prompt, /封面优先传达的情绪：紧迫但克制/);
  assert.equal(result.manifest.coverHook, "如果内容团队还把发布慢归咎给模型，真正的瓶颈就会继续藏着。");
  assert.equal(result.manifest.visualAngle, "把发布慢拆成图片、素材和微信接口三段，而不是空谈效率。");
  assert.equal(result.manifest.targetEmotionHint, "紧迫但克制");
});

test("cover prompt switches to concept poster for short abstract concepts", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    title: "自由",
    visualType: "conceptual",
    textLevel: "title-only",
    labels: ["自由", "边界"],
    sourceFacts: ["文章讨论自由感背后的边界与代价。"],
  }));
  assert.match(result.prompt, /封面表达策略：concept_poster/);
  assert.match(result.prompt, /高级概念海报/);
  assert.match(result.prompt, /大字或强符号为核心/);
  assert.equal(result.manifest.coverStrategy, "concept_poster");
});

test("cover prompt switches to scene narrative for case-driven topics", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    title: "老板在复盘会上突然砍掉了投放预算",
    visualType: "hero",
    textLevel: "none",
    labels: ["复盘会", "投放预算"],
    sourceFacts: ["文章围绕复盘会上的预算决策与团队反应展开。"],
  }));
  assert.match(result.prompt, /封面表达策略：scene_narrative/);
  assert.match(result.prompt, /主题场景或人物关系封面/);
  assert.match(result.prompt, /优先无字封面/);
  assert.equal(result.manifest.coverStrategy, "scene_narrative");
});

test("cover prompt switches to power-shift scoreboard strategy for AI capital battle topics", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    viralMode: "power_shift_breaking",
    visualType: "scene",
    paletteCode: "dark",
    textLevel: "none",
    labels: ["Anthropic", "OpenAI", "300亿", "240亿"],
    sourceFacts: ["Anthropic 年化营收 300 亿美元，OpenAI 当前年收入约 240 亿美元。", "CFO、CEO 与董事会围绕算力账单和扩张路线出现裂痕。"],
    purpose: "建立王座更替/资本战点击心智",
  }));
  assert.match(result.prompt, /封面表达策略：power_shift_scoreboard/);
  assert.match(result.prompt, /权力更替\/资本战看板封面/);
  assert.match(result.prompt, /两个对立主体|胜负反转/);
  assert.equal(result.manifest.coverStrategy, "power_shift_scoreboard");
  assert.equal(result.manifest.viralMode, "power_shift_breaking");
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

test("buildArticleVisualPromptManifest records comic dimensions", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    visualScope: "comic",
    baoyuSkill: "baoyu-comic",
    visualType: "comic",
    layoutCode: "knowledge-comic",
    styleCode: "editorial",
    paletteCode: "warm",
    targetAnchor: "概念误区",
    title: "概念误区解释",
    purpose: "用知识漫画解释读者常见误区",
    altText: "概念误区知识漫画",
  }));
  assert.match(result.prompt, /baoyu-comic/);
  assert.match(result.prompt, /2-4 格/);
  assert.equal(result.manifest.skill, "baoyu-comic");
  assert.equal(result.manifest.layout, "knowledge-comic");
});

test("power-shift infographic prompt asks for scoreboard-style structure instead of pure text", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    visualScope: "infographic",
    baoyuSkill: "baoyu-infographic",
    visualType: "comparison",
    layoutCode: "scoreboard-comparison",
    styleCode: "technical-schematic",
    paletteCode: "duotone",
    targetAnchor: "胜负先看数字",
    title: "胜负先看数字",
    purpose: "把胜负数字、成本差和时间差转成可保存、可转发的看板式信息图",
    altText: "AI 资本战胜负看板",
    labels: ["300亿", "240亿", "算力账单", "时间差"],
    sourceFacts: ["Anthropic 年化营收 300 亿美元，OpenAI 当前年收入约 240 亿美元。"],
  }));
  assert.match(result.prompt, /胜负看板|成本对比|时间差|路线对撞/);
  assert.match(result.prompt, /不要生成纯文字海报/);
});

test("power-shift comic prompt asks for internal fracture explanation", () => {
  const result = buildArticleVisualPromptManifest(baseBrief({
    visualScope: "comic",
    baoyuSkill: "baoyu-comic",
    visualType: "comic",
    layoutCode: "knowledge-comic",
    styleCode: "editorial",
    paletteCode: "warm",
    targetAnchor: "输家的伤口，已经从外部打到内部",
    title: "输家的伤口，已经从外部打到内部",
    purpose: "用知识漫画解释一路扩张背后的路线分歧与账单压力",
    altText: "AI 公司内部裂痕知识漫画",
    labels: ["CFO", "CEO", "董事会", "账单"],
    sourceFacts: ["CFO 对账单担忧，CEO 还在推扩张，董事会开始重新看待这条路。"],
  }));
  assert.match(result.prompt, /路线分歧、组织裂痕、账单压力/);
  assert.match(result.prompt, /2-4 格/);
});

test("sanitizeUserVisibleVisualCaption suppresses internal outline labels", () => {
  assert.equal(sanitizeUserVisibleVisualCaption("痛点引入"), null);
  assert.equal(sanitizeUserVisibleVisualCaption(" 核心反转 "), null);
  assert.equal(sanitizeUserVisibleVisualCaption("方法总结"), null);
  assert.equal(sanitizeUserVisibleVisualCaption("读者收益"), null);
  assert.equal(sanitizeUserVisibleVisualCaption("搜索意图四象限"), "搜索意图四象限");
});
