import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlan17PromptSceneMeta,
  getWritingEvalImportFocusBoost,
  getWritingEvalDatasetFocusMeta,
  getWritingEvalTaskTypeLabel,
  inferWritingEvalDatasetFocus,
  isPlan17WritingEvalFocusKey,
  isWritingEvalSourceTypeRecommendedForFocus,
  resolveWritingEvalTaskTypeForDatasetFocus,
} from "../writing-eval-plan17";

test("inferWritingEvalDatasetFocus detects plan17 topic fission datasets", () => {
  const focus = inferWritingEvalDatasetFocus({
    code: "plan17-topic-fission-v1",
    name: "Plan17 · Topic Fission",
  });

  assert.equal(focus.key, "topic_fission");
  assert.deepEqual(focus.promptIds, [
    "topicFission.regularity",
    "topicFission.contrast",
    "topicFission.crossDomain",
  ]);
});

test("inferWritingEvalDatasetFocus detects opening optimizer datasets without folding them into plan17", () => {
  const focus = inferWritingEvalDatasetFocus({
    code: "plan21-opening-optimizer-v1",
    name: "Plan21 · Opening Optimizer",
  });

  assert.equal(focus.key, "opening_optimizer");
  assert.deepEqual(focus.promptIds, ["opening_optimizer"]);
  assert.equal(isPlan17WritingEvalFocusKey(focus.key), false);
});

test("resolveWritingEvalTaskTypeForDatasetFocus remaps focused datasets to scene task types", () => {
  assert.equal(
    resolveWritingEvalTaskTypeForDatasetFocus({
      datasetFocusKey: "evidence_hook",
      baseTaskType: "series_observation",
      sourceType: "fragment",
    }),
    "evidence_hook_tagging",
  );
  assert.equal(
    resolveWritingEvalTaskTypeForDatasetFocus({
      datasetFocusKey: "evidence_hook",
      baseTaskType: "series_observation",
      sourceType: "topic_item",
    }),
    "evidence_hook_tagging",
  );

  assert.equal(
    resolveWritingEvalTaskTypeForDatasetFocus({
      datasetFocusKey: "rhythm_consistency",
      baseTaskType: "experience_recap",
      sourceType: "article",
    }),
    "rhythm_consistency",
  );
  assert.equal(
    resolveWritingEvalTaskTypeForDatasetFocus({
      datasetFocusKey: "rhythm_consistency",
      baseTaskType: "series_observation",
      sourceType: "topic_item",
    }),
    "rhythm_consistency",
  );
});

test("getWritingEvalImportFocusBoost rewards matching source and task type", () => {
  const boost = getWritingEvalImportFocusBoost({
    datasetFocusKey: "topic_fission",
    candidateSourceType: "topic_item",
    candidateTaskType: "topic_fission",
  });

  assert.equal(boost.score, 42);
  assert.equal(boost.reasons.length, 2);
  assert.match(boost.reasons[0] ?? "", /选题裂变评测/);
});

test("getWritingEvalTaskTypeLabel returns readable labels for plan17 task types", () => {
  assert.equal(getWritingEvalTaskTypeLabel("strategy_strength_audit"), "策略强度审计");
  assert.equal(getWritingEvalTaskTypeLabel("custom_type"), "custom_type");
});

test("getPlan17PromptSceneMeta exposes plan17 prompt scene metadata", () => {
  const scene = getPlan17PromptSceneMeta("publishGate.rhythmConsistency");
  assert.equal(scene?.label, "原型节奏一致性");
  assert.equal(scene?.groupLabel, "发布前总控");
  assert.equal(scene?.datasetFocusKey, "rhythm_consistency");
});

test("getWritingEvalDatasetFocusMeta returns dataset focus definition by key", () => {
  const focus = getWritingEvalDatasetFocusMeta("strategy_strength");
  assert.equal(focus?.label, "策略强度评测");
  assert.deepEqual(focus?.targetTaskTypes, ["strategy_strength_audit"]);
});

test("getWritingEvalDatasetFocusMeta exposes opening optimizer focus metadata", () => {
  const focus = getWritingEvalDatasetFocusMeta("opening_optimizer");
  assert.equal(focus?.label, "开头优化器评测");
  assert.equal(focus?.promptIds.includes("opening_optimizer"), true);
  assert.equal(isPlan17WritingEvalFocusKey("opening_optimizer"), false);
});

test("isWritingEvalSourceTypeRecommendedForFocus enforces plan17 preferred source types", () => {
  assert.equal(
    isWritingEvalSourceTypeRecommendedForFocus({
      datasetFocusKey: "evidence_hook",
      candidateSourceType: "fragment",
    }),
    true,
  );
  assert.equal(
    isWritingEvalSourceTypeRecommendedForFocus({
      datasetFocusKey: "evidence_hook",
      candidateSourceType: "topic_item",
    }),
    true,
  );
  assert.equal(
    isWritingEvalSourceTypeRecommendedForFocus({
      datasetFocusKey: "rhythm_consistency",
      candidateSourceType: "article",
    }),
    true,
  );
  assert.equal(
    isWritingEvalSourceTypeRecommendedForFocus({
      datasetFocusKey: "rhythm_consistency",
      candidateSourceType: "topic_item",
    }),
    true,
  );
});
