import assert from "node:assert/strict";
import test from "node:test";

import { buildHumanSignalSeed, formatOpeningForPublish, stripReaderInvisibleAutomationBlocks } from "../article-automation-publish-repair";
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
