import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceFragmentPromptSummary,
  collectEvidenceFragmentFacts,
  normalizeFictionalMaterialItems,
  pickStricterResearchSufficiency,
} from "../article-stage-artifacts";

test("pickStricterResearchSufficiency keeps the more conservative research state", () => {
  assert.equal(pickStricterResearchSufficiency("ready", "limited"), "limited");
  assert.equal(pickStricterResearchSufficiency("limited", "blocked"), "blocked");
  assert.equal(pickStricterResearchSufficiency("ready", "ready"), "ready");
});

test("collectEvidenceFragmentFacts prefers localized fact points over broad summaries", () => {
  const facts = collectEvidenceFragmentFacts({
    distilledContent: "This article discusses distribution and pricing strategy in a broad way.",
    sourceMeta: {
      localization: {
        localizedSummary: "这篇材料解释了分发和定价的关系。",
        factPointsZh: [
          "作者把路径拆成获客、转化和留存三个阶段。",
          "案例里先验证付费意愿，再扩大分发。",
        ],
      },
    },
  });

  assert.deepEqual(facts, [
    "作者把路径拆成获客、转化和留存三个阶段。",
    "案例里先验证付费意愿，再扩大分发。",
  ]);
});

test("buildEvidenceFragmentPromptSummary keeps translation risk visible for downstream prompts", () => {
  const summary = buildEvidenceFragmentPromptSummary(
    {
      distilledContent: "The original article is optimistic about long-term income durability.",
      sourceMeta: {
        localization: {
          localizedSummary: "原文强调长期收入韧性，但主要基于单个案例。",
          translationRisk: "原文偏经验分享口吻，不能直接外推为行业普遍规律。",
        },
      },
    },
    { includeRisk: true },
  );

  assert.match(summary, /长期收入韧性/);
  assert.match(summary, /转述提醒/);
});

test("normalizeFictionalMaterialItems preserves usable fictional scene fields", () => {
  const items = normalizeFictionalMaterialItems([
    {
      kind: "scenario_reconstruction",
      title: "预算会议重构",
      purpose: "把成本压力场景化",
      setting: "会议室里，财务把 token 账单投到屏幕上。",
      role: "财务负责人",
      quote: "如果现在限额，谁来解释进度变慢？",
      metricRange: "月度成本从几万元跳到几十万元",
      anchor: "基于 AI 工具成本压力的常见组织情境",
      section: "中段",
      disclosure: "虚构组织场景，数字为叙事区间。",
    },
  ]);

  assert.equal(items[0]?.type, "scenario_reconstruction");
  assert.equal(items[0]?.label, "预算会议重构");
  assert.match(items[0]?.scene ?? "", /token 账单/);
  assert.match(items[0]?.dataRange ?? "", /几十万元/);
  assert.match(items[0]?.boundaryNote ?? "", /虚构组织场景/);
});

test("normalizeFictionalMaterialItems merges fallback when model output is too thin", () => {
  const items = normalizeFictionalMaterialItems(
    [
      {
        label: "单条弱素材",
        scene: "主角盯着任务列表发呆。",
      },
    ],
    [
      {
        label: "兜底素材",
        scene: "团队复盘会上，投影里只有一张不断上涨的成本表。",
        character: "增长负责人",
        dialogue: "我们不是没提效，只是不知道提效的钱去了哪里。",
        dataRange: "月度成本上涨一成到三成",
        plausibilityAnchor: "基于小团队工具成本压力的复合场景",
        boundaryNote: "虚构复合场景。",
      },
    ],
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.label, "单条弱素材");
  assert.equal(items[0]?.character, "增长负责人");
  assert.equal(items[1]?.label, "兜底素材");
});
