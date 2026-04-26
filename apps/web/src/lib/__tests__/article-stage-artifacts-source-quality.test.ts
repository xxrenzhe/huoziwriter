import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceFragmentPromptSummary,
  collectEvidenceFragmentFacts,
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
