import assert from "node:assert/strict";
import test from "node:test";

import { resolveArticleMainStepNavigationAccess } from "../article-workspace-step-navigation";

test("research gate blocks forward main-step navigation when coverage is still blocked", () => {
  const access = resolveArticleMainStepNavigationAccess({
    targetStepCode: "evidence",
    currentStepCode: "strategy",
    canOpenResultStep: false,
    generateBlockedByResearch: true,
    generateBlockedMessage: "研究覆盖仍不足，请先补官方、行业、同类、用户或时间维度信源。",
  });

  assert.equal(access.disabled, true);
  assert.match(access.reason || "", /研究覆盖仍不足/);
});

test("research gate still allows backward navigation for repair work", () => {
  const access = resolveArticleMainStepNavigationAccess({
    targetStepCode: "opportunity",
    currentStepCode: "draft",
    canOpenResultStep: false,
    generateBlockedByResearch: true,
    generateBlockedMessage: "研究覆盖仍不足，请先补官方、行业、同类、用户或时间维度信源。",
  });

  assert.deepEqual(access, { disabled: false, reason: null });
});

test("result step remains blocked until the article is published", () => {
  const access = resolveArticleMainStepNavigationAccess({
    targetStepCode: "result",
    currentStepCode: "publish",
    canOpenResultStep: false,
    generateBlockedByResearch: false,
    generateBlockedMessage: null,
  });

  assert.equal(access.disabled, true);
  assert.match(access.reason || "", /正式发布后/);
});
