import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlan17PromptSceneMeta,
  getWritingEvalImportFocusBoost,
  getWritingEvalDatasetFocusMeta,
  getWritingEvalTaskTypeLabel,
  inferWritingEvalDatasetFocus,
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
      datasetFocusKey: "rhythm_consistency",
      baseTaskType: "experience_recap",
      sourceType: "article",
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
