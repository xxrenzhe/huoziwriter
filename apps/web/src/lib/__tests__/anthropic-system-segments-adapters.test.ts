import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleArtifactPromptSystemSegments,
  buildOpeningOptimizerSystemSegments,
  buildTitleOptimizerSystemSegments,
} from "../article-stage-artifacts";
import { buildImaHookPatternSystemSegments } from "../ima-fission-engine";
import { buildStrategyCardAutoDraftSystemSegments } from "../strategy-card-auto-draft";

test("buildArticleArtifactPromptSystemSegments wraps prompt content as a cacheable system block", () => {
  assert.deepEqual(
    buildArticleArtifactPromptSystemSegments("  article prompt body  "),
    [{ text: "article prompt body", cacheable: true }],
  );
});

test("buildTitleOptimizerSystemSegments keeps prompt and fixed title rules in cacheable system blocks", () => {
  const segments = buildTitleOptimizerSystemSegments("title optimizer prompt");

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { text: "title optimizer prompt", cacheable: true });
  assert.equal(segments[1]?.cacheable, true);
  assert.match(segments[1]?.text || "", /固定返回 6 个 titleOptions/);
  assert.match(segments[1]?.text || "", /forbiddenHits 必须列出命中的禁区标签/);
});

test("buildOpeningOptimizerSystemSegments keeps prompt and opening contract cacheable", () => {
  const segments = buildOpeningOptimizerSystemSegments("opening optimizer prompt");

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { text: "opening optimizer prompt", cacheable: true });
  assert.equal(segments[1]?.cacheable, true);
  assert.match(segments[1]?.text || "", /固定返回 3 个 openingOptions/);
  assert.match(segments[1]?.text || "", /forbiddenHits 必须列出命中的开头禁区标签/);
});

test("buildStrategyCardAutoDraftSystemSegments keeps base prompt and output contract cacheable", () => {
  const segments = buildStrategyCardAutoDraftSystemSegments({
    basePrompt: "strategy auto draft prompt",
    archetypeOptions: "opinion / case / howto",
  });

  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0], { text: "strategy auto draft prompt", cacheable: true });
  assert.equal(segments[1]?.cacheable, true);
  assert.match(segments[1]?.text || "", /只返回 JSON 对象/);
  assert.match(segments[1]?.text || "", /archetype 只能是：opinion \/ case \/ howto。/);
});

test("buildImaHookPatternSystemSegments keeps IMA distill prompt cacheable", () => {
  assert.deepEqual(
    buildImaHookPatternSystemSegments("  ima distill prompt  "),
    [{ text: "ima distill prompt", cacheable: true }],
  );
});
