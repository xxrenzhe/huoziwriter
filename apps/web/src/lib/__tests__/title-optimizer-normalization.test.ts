import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackTitleOptions, normalizeTitleOptions } from "../title-patterns";

test("normalizeTitleOptions fills legacy title payloads to six options", () => {
  const fallback = buildFallbackTitleOptions("公众号标题模式");
  const normalized = normalizeTitleOptions(
    [
      { title: "微信改版后，公众号编辑最容易忽略的一步" },
      { title: "如果你还在追 AI 写作，先别急着下结论" },
    ],
    fallback,
  );

  assert.equal(normalized.length, 6);
  assert.equal(normalized[0]?.title, "微信改版后，公众号编辑最容易忽略的一步");
  assert.equal(normalized[1]?.title, "如果你还在追 AI 写作，先别急着下结论");
  assert.equal(normalized.filter((item) => item.isRecommended).length, 1);
  assert.equal(typeof normalized[0]?.openRateScore, "number");
  assert.equal(typeof normalized[0]?.elementsHit.specific, "boolean");
  assert.equal(typeof normalized[0]?.recommendReason, "string");
});

test("normalizeTitleOptions backfills missing fields and infers forbidden hits", () => {
  const fallback = buildFallbackTitleOptions("AI 写作标题");
  const normalized = normalizeTitleOptions(
    [
      {
        title: "震惊：AI 写作的 3 个方法",
        openRateScore: "62",
      },
    ],
    fallback,
  );

  assert.equal(normalized[0]?.openRateScore, 50);
  assert.deepEqual(normalized[0]?.forbiddenHits, ["震惊", "结论提前剧透"]);
  assert.equal(normalized[0]?.recommendReason, "命中禁止清单，不能作为推荐标题。");
  assert.equal(normalized.length, 6);
});
