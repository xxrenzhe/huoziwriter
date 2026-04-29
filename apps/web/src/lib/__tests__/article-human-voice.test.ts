import assert from "node:assert/strict";
import test from "node:test";

import { buildHumanPracticalVoiceGuide } from "../article-human-voice";
import { closeDatabase } from "../db";
import { finalizeProsePolishMarkdownForReader, repairProsePolishSoftLineBreaks } from "../generation";
import { collectLanguageGuardHits, getLanguageGuardRules } from "../language-guard";

test("buildHumanPracticalVoiceGuide forces practical experienced voice", () => {
  const guide = buildHumanPracticalVoiceGuide({
    title: "搜索广告预算为什么漏掉",
    targetReader: "正在复盘账户的投放负责人",
    humanSignals: {
      realSceneOrDialogue: "复盘会上销售说这批线索不像买家。",
    },
  });

  assert.match(guide, /复盘会上销售说这批线索不像买家/);
  assert.match(guide, /我会查哪张表|先问哪个问题|怎么判断继续投还是停手/);
  assert.match(guide, /谁在亏、谁在急、谁在解释不动/);
  assert.match(guide, /谁说了什么、盯着哪张表、结果卡在了哪里/);
  assert.match(guide, /不要冒充亲历故事|不要用“因此可以看出”/);
});

test("system language guard catches formal report voice", async () => {
  const rules = await getLanguageGuardRules(1);
  const hits = collectLanguageGuardHits(
    "因此可以看出，对于投放团队而言，该方法具有重要意义，并提供了新的视角。",
    rules,
  );

  assert.ok(hits.some((hit) => hit.patternText === "因此可以看出"));
  assert.ok(hits.some((hit) => hit.patternText === "对于"));
  assert.ok(hits.some((hit) => hit.patternText === "具有重要意义"));
  assert.ok(hits.some((hit) => hit.patternText === "提供了新的视角"));
  await closeDatabase();
});

test("repairProsePolishSoftLineBreaks keeps natural paragraphs intact", () => {
  const markdown = [
    "# 标题",
    "",
    "广告后台里，一个看起来最精准的词，往往不是最赚钱的词。",
    "而是这个词的点击很像答案，转化却像路过。",
    "",
    "- 保留列表",
  ].join("\n");

  const repaired = repairProsePolishSoftLineBreaks(markdown);

  assert.match(repaired, /最赚钱的词。而是这个词/);
  assert.match(repaired, /\n\n- 保留列表/);
});

test("finalizeProsePolishMarkdownForReader preserves stronger practical opening", () => {
  const original = [
    "# Google 搜索广告里，最费预算的往往不是错词",
    "",
    "一个账户最难受的时刻，通常不是买错了词，而是后台里那个看起来很准的词，点击不差，花费在走，线索表却越来越难看。复盘会开到一半，老板盯着预算，销售盯着线索质量，投放还在解释相关性。真正让人发冷的，不是“这个词还要不要加价”，而是另一句：搜这个词的人，到底是在了解、比较，还是已经准备行动。",
    "",
    "这就是最常见的误判。",
  ].join("\n");
  const candidate = [
    "# Google 搜索广告里，最费预算的往往不是错词",
    "",
    "广告后台里，一个看起来最精准的词，往往不是最赚钱的词。复盘会里最刺耳的那句话不是“要不要加价”。",
    "而是“这个词的点击很像答案，转化却像路过”。",
    "",
    "这就是最常见的误判。",
  ].join("\n");

  const finalized = finalizeProsePolishMarkdownForReader({
    originalMarkdown: original,
    candidateMarkdown: candidate,
    bannedWords: [],
    deepWritingPayload: {
      openingStrategy: "广告后台里，一个看起来最精准的词，往往不是最赚钱的词。复盘会里最刺耳的那句话不是“要不要加价”，而是“这个词的点击很像答案，转化却像路过”。",
    },
  });

  assert.match(finalized, /一个账户最难受的时刻/);
  assert.doesNotMatch(finalized, /最刺耳的那句话不是“要不要加价”。\n而是/);
});
