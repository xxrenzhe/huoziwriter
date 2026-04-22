import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFallbackOpeningOptions,
  evaluateOpeningGuardChecks,
  normalizeOpeningOptions,
} from "../opening-patterns";

test("normalizeOpeningOptions fills legacy opening payloads to three options", () => {
  const fallback = buildFallbackOpeningOptions("公众号开头模式");
  const normalized = normalizeOpeningOptions(
    [
      { text: "很多人把公众号改版当成一次功能更新，但真正先承压的是编辑流程。问题不在按钮，而在动作顺序。" },
      { opening: "如果你也在盯着 AI 写作，先别急着追模型名单。最先该补的是交付口径和素材筛选。" },
    ],
    fallback,
  );

  assert.equal(normalized.length, 3);
  assert.equal(normalized[0]?.opening, "很多人把公众号改版当成一次功能更新，但真正先承压的是编辑流程。问题不在按钮，而在动作顺序。");
  assert.equal(normalized[1]?.opening, "如果你也在盯着 AI 写作，先别急着追模型名单。最先该补的是交付口径和素材筛选。");
  assert.equal(normalized.filter((item) => item.isRecommended).length, 1);
  assert.equal(typeof normalized[0]?.hookScore, "number");
  assert.equal(typeof normalized[0]?.qualityCeiling, "string");
  assert.equal(typeof normalized[0]?.diagnose.abstractLevel, "string");
  assert.equal(typeof normalized[0]?.recommendReason, "string");
});

test("normalizeOpeningOptions infers D1 D2 D3 and backfills diagnose fields", () => {
  const fallback = buildFallbackOpeningOptions("AI 写作开头");
  const normalized = normalizeOpeningOptions(
    [
      {
        opening: "在这个信息爆炸的时代，内容创作正在发生深刻变化，今天想和你聊聊这件事。",
      },
    ],
    fallback,
  );

  assert.deepEqual(normalized[0]?.forbiddenHits, ["D1 抽象空转", "D2 铺垫过长", "D3 钩子后置"]);
  assert.equal(normalized[0]?.qualityCeiling, "B-");
  assert.equal(normalized[0]?.recommendReason, "命中开头禁区，不能作为默认推荐。");
  assert.equal(normalized[0]?.diagnose.abstractLevel, "danger");
  assert.equal(normalized[0]?.diagnose.paddingLevel, "danger");
  assert.equal(normalized[0]?.diagnose.hookDensity, "danger");
});

test("normalizeOpeningOptions aligns quality ceiling with five-tier pattern map", () => {
  const fallback = buildFallbackOpeningOptions("公众号开头模式");
  const normalized = normalizeOpeningOptions(
    [
      { opening: "上周我帮一个朋友改稿，改到一半我把电脑关了。因为真正的问题不是标题，而是开头没有先放冲突。", patternCode: "scene_entry" },
      { opening: "先说结论：一篇稿子能不能被读完，开头比标题更难。", patternCode: "judgement_first" },
      { opening: "很多人都在谈这波变化，但大多数讨论还停留在现象层。", patternCode: "phenomenon_signal" },
    ],
    fallback,
  );

  assert.equal(normalized[0]?.qualityCeiling, "A");
  assert.equal(normalized[1]?.qualityCeiling, "B+");
  assert.equal(normalized[2]?.qualityCeiling, "B-");
  assert.equal(normalized[0]?.patternCode, "scene_entry");
  assert.equal(normalized[0]?.text, normalized[0]?.opening);
  assert.equal(normalized[0]?.value, normalized[0]?.opening);
});

test("evaluateOpeningGuardChecks blocks forbidden openings", () => {
  const result = evaluateOpeningGuardChecks({
    selectedOpening: "在这个信息爆炸的时代，内容创作正在发生深刻变化，今天想和你聊聊这件事。",
  });

  assert.equal(result.openingConfirmed, true);
  assert.deepEqual(result.openingForbiddenHits, ["D1 抽象空转", "D2 铺垫过长", "D3 钩子后置"]);
  assert.equal(result.blockers.length, 1);
  assert.match(result.blockers[0] ?? "", /开头命中禁止清单/);
  assert.equal(result.checks.find((item) => item.key === "opening_forbidden")?.status, "blocked");
});

test("evaluateOpeningGuardChecks warns on weak opening strength and outdated audit", () => {
  const result = evaluateOpeningGuardChecks({
    selectedOpening: "AI 写作这件事最近很热，我先把背景补齐，再说后面的判断。",
    openingAuditedAt: "2026-04-19T08:00:00.000Z",
    outlineUpdatedAt: "2026-04-20T08:00:00.000Z",
  });

  assert.deepEqual(result.openingForbiddenHits, []);
  assert.equal(result.blockers.length, 0);
  assert.equal(result.checks.find((item) => item.key === "opening_strength")?.status, "warning");
  assert.equal(result.checks.find((item) => item.key === "opening_audit")?.status, "warning");
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /开头钩子分/);
  assert.match(result.warnings[1] ?? "", /开头还没有按最新大纲做体检/);
});
