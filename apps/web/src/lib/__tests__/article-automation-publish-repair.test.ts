import assert from "node:assert/strict";
import test from "node:test";

import {
  buildViralScoreRepairPromptLines,
  buildHumanSignalSeed,
  collapseNearDuplicateIntroParagraphs,
  formatOpeningForPublish,
  stripReaderInvisibleAutomationBlocks,
} from "../article-automation-publish-repair";
import { buildFourPointAudit } from "../article-strategy";

test("buildHumanSignalSeed uses source-topic signals for search advertising", () => {
  const seed = buildHumanSignalSeed("搜索广告的旧规则正在失效：比关键词准不准更重要的，是用户卡在哪个决策时点");
  const text = Object.values(seed).join("\n");

  assert.match(text, /搜索|关键词|投放|需求阶段/);
  assert.doesNotMatch(text, /内容团队|研究、核查、排版|一键发|自动化|生产线|草稿箱/);
});

test("buildHumanSignalSeed gives search advertising enough four-point reader snapshot", () => {
  const seed = buildHumanSignalSeed("Google Ads 精准词为什么不赚钱：问题可能不在关键词，而在搜索意图");
  const audit = buildFourPointAudit({
    archetype: "opinion",
    mainstreamBelief: "很多人以为精准词不赚钱，优先该查出价、匹配方式和质量分。",
    coreAssertion: "真正该先查的是搜索意图和需求阶段，而不是继续只围着词面打转。",
    targetReader: "正在做 Google Ads 的老板和投手",
    whyNow: "预算更紧时，词面误判会更快吞掉线索质量。",
    ...seed,
  });

  assert(audit.readerSnapshot.score >= 3);
  assert.equal(audit.overallLockable, true);
});

test("buildHumanSignalSeed generic fallback avoids content-workflow contamination", () => {
  const seed = buildHumanSignalSeed("普通用户为什么开始重新理解会员订阅");
  const text = Object.values(seed).join("\n");

  assert.match(text, /真实业务现场|判断|变量/);
  assert.doesNotMatch(text, /内容团队|一键发|自动化|生产线|草稿箱/);
});

test("formatOpeningForPublish preserves selected opening order instead of moving later hook clauses forward", () => {
  const opening = "很多账户最贵的浪费，不是买错关键词，而是把“正在了解的人”当成“马上要买的人”。词面越精准，这个误判有时越隐蔽。";

  assert.equal(formatOpeningForPublish(opening), opening);
});

test("formatOpeningForPublish rejects execution-note opening strategies", () => {
  const opening = "沿用已确认开头策略：用匿名复盘现场起手，先让读者看见最熟悉的误判。";

  assert.equal(formatOpeningForPublish(opening), "");
});

test("stripReaderInvisibleAutomationBlocks removes research brief instructions before publish", () => {
  const markdown = [
    "# 标题",
    "很多账户最贵的浪费，不是买错关键词。",
    "先围绕「谷歌搜索意图的本质」把研究问题、信源覆盖、时间脉络和横向比较补齐。；补官方源，明确最基础的事实口径。",
    "## 真正的变量不是词面",
    "词面相近只说明用户说法接近，不能说明他们处在同一个决策阶段。",
  ].join("\n\n");

  const cleaned = stripReaderInvisibleAutomationBlocks(markdown);

  assert.match(cleaned, /很多账户最贵的浪费/);
  assert.match(cleaned, /## 真正的变量不是词面/);
  assert.doesNotMatch(cleaned, /研究问题|信源覆盖|补官方源/);
});

test("collapseNearDuplicateIntroParagraphs removes repeated opening scene block", () => {
  const markdown = [
    "# Google 搜索广告里，最费预算的往往不是错词，而是“看起来很准”的词",
    "",
    "一个账户最难受的时刻，不是买错了词，而是那个看起来最准的词一边吃预算、一边把线索表拖难看。复盘会里，老板盯回收，销售说这批人不像买家，投放还在解释相关性。问题必须先问清楚：搜这个词的人，到底是在了解、比较，还是已经准备行动？",
    "",
    "复盘会开到一半，老板盯预算，销售盯线索质量，投放盯搜索词报告。桌上摊着关键词列表、搜索词报告和线索表，三个人都觉得自己没说错，但会就是越开越冷。",
    "",
    "## 最容易烧钱的，恰恰是“像答案”的词",
  ].join("\n");

  const collapsed = collapseNearDuplicateIntroParagraphs(markdown);

  assert.match(collapsed, /一个账户最难受的时刻/);
  assert.doesNotMatch(collapsed, /复盘会开到一半，老板盯预算/);
});

test("collapseNearDuplicateIntroParagraphs keeps distinct second intro paragraph", () => {
  const markdown = [
    "# 标题",
    "",
    "一个判断最容易出问题的时候，不是数据掉了，而是团队以为自己已经知道原因。",
    "",
    "真正难的是，第二天回到后台以后，你得先拆清楚到底是词、承接页，还是销售跟进在漏水。",
    "",
    "## 后面展开",
  ].join("\n");

  const collapsed = collapseNearDuplicateIntroParagraphs(markdown);

  assert.match(collapsed, /一个判断最容易出问题的时候/);
  assert.match(collapsed, /真正难的是，第二天回到后台以后/);
});

test("buildViralScoreRepairPromptLines switches to power-shift repair contract", () => {
  const lines = buildViralScoreRepairPromptLines({
    title: "刚刚，美国AI霸主换了！Anthropic年收300亿，碾压OpenAI",
    markdownContent: "Anthropic 年化营收冲到 300 亿美元，正式压过 OpenAI 的 240 亿。",
    deepWritingPayload: {
      viralGenomePack: {
        mode: "power_shift_breaking",
        firstScreenPromise: "前 120 字必须同时出现赢家名字、输家名字、硬数字和今天到底变了什么。",
      },
    },
    researchPayload: {},
  }).join("\n");

  assert.match(lines, /王座更替|资本战|路线之争/);
  assert.match(lines, /胜负看板|赢者为什么赢|输家哪里失血/);
  assert.match(lines, /结尾不要落成“今天就去后台做什么”/);
  assert.doesNotMatch(lines, /搜索广告|老板、销售、投放|搜索意图\/判断表|质量得分/);
});
