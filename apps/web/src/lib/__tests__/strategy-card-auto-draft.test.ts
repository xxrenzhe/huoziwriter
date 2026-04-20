import assert from "node:assert/strict";
import test from "node:test";

import { buildFourPointAudit } from "../article-strategy";
import { buildFallbackStrategyCardAutoDraft, normalizeStrategyCardAutoDraftPayload } from "../strategy-card-auto-draft";

test("normalizeStrategyCardAutoDraftPayload accepts top-level plan17 strategy fields", () => {
  const draft = normalizeStrategyCardAutoDraftPayload({
    archetype: "howto",
    targetReader: "想把公众号写得更稳的创作者",
    coreAssertion: "批量稳定输出靠选题库存，不靠灵感",
    whyNow: "团队开始追求稳定周更",
    publishWindow: "本周三晚间",
  });

  assert.deepEqual(draft, {
    archetype: "howto",
    targetReader: "想把公众号写得更稳的创作者",
    coreAssertion: "批量稳定输出靠选题库存，不靠灵感",
    whyNow: "团队开始追求稳定周更",
    publishWindow: "本周三晚间",
  });
});

test("normalizeStrategyCardAutoDraftPayload accepts nested strategyCard object and filters invalid archetype", () => {
  const draft = normalizeStrategyCardAutoDraftPayload({
    strategyCard: {
      archetype: "invalid-type",
      mainstreamBelief: "大家以为先找灵感再写",
      feltMoment: "周一早上盯着空白文档",
    },
  });

  assert.deepEqual(draft, {
    mainstreamBelief: "大家以为先找灵感再写",
    feltMoment: "周一早上盯着空白文档",
  });
});

test("buildFallbackStrategyCardAutoDraft fills plan17 baseline fields and keeps existing seed", () => {
  const draft = buildFallbackStrategyCardAutoDraft({
    title: "AI 搜索改写内容分发",
    strategyCard: {
      targetReader: "做内容增长的操盘手",
      coreAssertion: "分发规则先变了，写法才会跟着变",
    },
  });

  assert.equal(typeof draft.archetype, "string");
  assert.equal(draft.targetReader, "做内容增长的操盘手");
  assert.equal(draft.coreAssertion, "分发规则先变了，写法才会跟着变");
  assert.match(draft.mainstreamBelief || "", /AI 搜索改写内容分发/);
  assert.match(draft.whyNow || "", /AI 搜索改写内容分发/);
  assert.match(draft.realSceneOrDialogue || "", /AI 搜索改写内容分发/);
  assert.match(draft.feltMoment || "", /旧判断已经不够用了/);
  assert.match(draft.wantToComplain || "", /普通消息/);
  assert.match(draft.nonDelegableTruth || "", /真实发力点/);
});

test("buildFallbackStrategyCardAutoDraft is enough to derive plan17 four-point audit fields", () => {
  const draft = buildFallbackStrategyCardAutoDraft({
    title: "组织开始追求稳定周更",
  });
  const audit = buildFourPointAudit(draft);

  assert.equal(typeof draft.archetype, "string");
  assert.equal(typeof audit.cognitiveFlip.score, "number");
  assert.equal(typeof audit.readerSnapshot.score, "number");
  assert.equal(typeof audit.coreTension.score, "number");
  assert.equal(typeof audit.impactVector.score, "number");
  assert.ok(audit.cognitiveFlip.notes.length > 0);
  assert.ok(audit.readerSnapshot.notes.length > 0);
  assert.ok(audit.coreTension.notes.length > 0);
  assert.ok(audit.impactVector.notes.length > 0);
});
