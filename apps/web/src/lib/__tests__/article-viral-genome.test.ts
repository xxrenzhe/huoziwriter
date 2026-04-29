import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleViralGenomePack,
  buildArticleViralGenomePromptLines,
  buildViralVisualRhythmSlots,
  scoreVisualRhythmPosition,
} from "../article-viral-genome";
import { buildArticlePromptQualityBrief } from "../article-prompt-quality-brief";

test("viral genome turns 100-article findings into upstream writing directions", () => {
  const pack = buildArticleViralGenomePack({
    title: "AI 让内容生产变快之后，真正慢下来的是什么",
    centralThesis: "慢的不是写作，而是事实、判断和发布之间的断点。",
    targetReader: "内容团队负责人",
    viralBlueprintLabel: "结构张力型",
  });

  assert.match(pack.sampleSummary, /100 篇全文/);
  assert.match(pack.sampleSummary, /数字锚点 42/);
  assert.equal(pack.sampleSourceProfile.source, "plan24_business_monetization_100");
  assert.equal(pack.sampleSourceProfile.vertical, "AI产品与Agent");
  assert(pack.readerShareReasons.length >= 2);
  assert(pack.materialJobs.length >= 3);
  assert(pack.readerSceneAnchors.length >= 3);
  assert(pack.abstractToConcretePairs.length >= 2);
  assert(pack.openingMicroScenes.length >= 2);
  assert.equal(pack.authorPostureMode, "analysis_interpreter");
  assert.equal(pack.businessQuestions.length, 7);
  assert.match(pack.openingEngine, /账本|产品动作|实测/);
  assert(pack.upstreamDirections.some((item) => /处境、冲突、素材、钱流和作者视角/.test(item)));
  assert(pack.openingDirections.some((item) => /前 120 字|前 200 字/.test(item)));
  assert(pack.antiDidacticContracts.some((item) => /你应该/.test(item)));
});

test("viral genome calibrates search marketing topics to business sample profile", () => {
  const pack = buildArticleViralGenomePack({
    title: "别再只盯关键词了：真正值钱的是搜索意图",
    centralThesis: "搜索投放的错位经常不在词面，而在用户离行动还有多远。",
    targetReader: "正在做搜索广告的老板和投手",
    viralBlueprintLabel: "结构张力型",
  });

  assert.equal(pack.sampleSourceProfile.vertical, "联盟营销与搜索变现（稀疏）");
  assert.equal(pack.mechanismBias.code, "counter_intuition");
  assert.equal(pack.sampleSourceProfile.sparseTrack, true);
  assert.match(pack.firstScreenPromise, /前 120 字/);
  assert.match(pack.shareTrigger, /复盘|代价|后台/);
  assert(pack.negativePatterns.some((item) => /方法论|课堂|趋势/.test(item)));
  assert.match(pack.sparseTrackAlert, /样本稀疏区/);
});

test("viral genome prompt lines guide deep writing without becoming downstream gates", () => {
  const lines = buildArticleViralGenomePromptLines("deepWriting", {
    title: "AI 产品正在重排内容团队工作流",
    viralBlueprintLabel: "AI产品重排型",
  }).join("\n");

  assert.match(lines, /百篇样本基因/);
  assert.match(lines, /样本垂类画像/);
  assert.match(lines, /读者转发理由/);
  assert.match(lines, /素材任务/);
  assert.match(lines, /贴近现场词/);
  assert.match(lines, /开头微场景/);
  assert.match(lines, /抽象翻译/);
  assert.match(lines, /上游方向/);
  assert.match(lines, /反说教契约/);
  assert.match(lines, /商业七问/);
  assert.match(lines, /商业骨架/);
  assert.match(lines, /配图节奏/);
});

test("viral genome gives title stage object-change-consequence directions", () => {
  const lines = buildArticleViralGenomePromptLines("titleOptimization", {
    title: "体验完4月最强的三个模型：跑分涨了，却不说人话了",
    centralThesis: "真正让人决定换模型的，不是榜单分数，而是结果能不能直接拿来用。",
    targetReader: "正在比较 AI 工具的产品和内容团队",
  }).join("\n");

  assert.match(lines, /标题方向/);
  assert.match(lines, /具体对象/);
  assert.match(lines, /变化/);
  assert.match(lines, /后果|机会/);
});

test("quality brief absorbs viral genome into shared stage prompts", () => {
  const text = buildArticlePromptQualityBrief("openingOptimization", {
    articleTitle: "AI 产品正在重排内容团队工作流",
    strategyCard: {
      targetReader: "内容团队负责人",
      coreAssertion: "旧流程的断点正在从写作转向核查和发布。",
    },
  }).join("\n");

  assert.match(text, /百篇样本基因/);
  assert.match(text, /开头方向/);
  assert.match(text, /开头发动机/);
});

test("viral genome exposes sparse-track warning for side-hustle topics", () => {
  const pack = buildArticleViralGenomePack({
    title: "副业赚钱这件事，第一笔钱到底从哪里来",
    centralThesis: "副业的核心不是灵感，而是钱流路径和时间成本。",
    targetReader: "想做第二收入的上班族",
  });

  assert.equal(pack.sampleSourceProfile.vertical, "副业与个人变现");
  assert.equal(pack.sampleSourceProfile.sparseTrack, true);
  assert.match(pack.sparseTrackAlert, /覆盖极薄|样本稀疏区/);
  assert.match(pack.narrativeSkeleton, /钱从哪里来/);
  assert.equal(pack.authorPostureMode, "analysis_interpreter");
});

test("viral genome routes MCP production topics to tooling-focused verticals", () => {
  const pack = buildArticleViralGenomePack({
    title: "MCP 已死？不不不，Agent 进生产都绕不开 MCP",
    centralThesis: "真正决定团队能不能把 Agent 接进生产的，不是模型分数，而是协议层和工作流接入成本。",
    targetReader: "正在做 AI 工具接入的产品和工程负责人",
  });

  assert.notEqual(pack.sampleSourceProfile.vertical, "AI产品与Agent");
  assert.match(pack.sampleSourceProfile.vertical, /GitHub项目与开发工具|实操复盘与解决方案/);
  assert.match(pack.narrativeSkeleton, /实测结论|对象动作|变化出现/);
  assert.match(pack.openingEngine, /工具实测结论先抛|账本\/结果先抛|误判代价先抛/);
});

test("viral genome recognizes power-shift AI capital battle topics", () => {
  const pack = buildArticleViralGenomePack({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    centralThesis: "这不是普通融资新闻，而是一次赢家、输家和成本结构同时改写的权力更替。",
    targetReader: "关注 AI 商业化和产业格局的从业者",
  });

  assert.match(pack.titleDirections.join("；"), /王座更替|胜负已分|刚刚|易主|反超/);
  assert.match(pack.firstScreenPromise, /赢家名字|输家名字|硬数字|权力更替/);
  assert.match(pack.openingEngine, /权力更替先抛/);
  assert.match(pack.narrativeSkeleton, /胜负已分|数字看板|输家哪里失血/);
  assert.match(pack.shareTrigger, /谁上位、谁失血、为什么是今天/);
  assert.match(pack.evidencePriorities.join("；"), /营收|估值|融资|时间锚点|外部媒体/);
});

test("visual rhythm slots prefer evidence, pacing, and reinforcement positions", () => {
  const slots = buildViralVisualRhythmSlots(3);

  assert.deepEqual(slots.map((slot) => slot.code), ["early_evidence", "middle_pacing", "late_reinforcement"]);
  assert.equal(scoreVisualRhythmPosition({ nodeIndex: 0, totalNodes: 6, slots }), 3);
  assert.equal(scoreVisualRhythmPosition({ nodeIndex: 3, totalNodes: 6, slots }), 3);
  assert.equal(scoreVisualRhythmPosition({ nodeIndex: 5, totalNodes: 6, slots }), 3);
});
