import assert from "node:assert/strict";
import test from "node:test";

import { buildFallbackTitleOptions, buildTitleGenerationBrief, detectTitleForbiddenHits, normalizeTitleOptions, normalizeTitleSeed } from "../title-patterns";

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

  const forbiddenOption = normalized.find((item) => item.title === "震惊：AI 写作的 3 个方法");

  assert(forbiddenOption);
  assert.equal(forbiddenOption.openRateScore, 50);
  assert.deepEqual(forbiddenOption.forbiddenHits, ["震惊", "结论提前剧透"]);
  assert.equal(forbiddenOption.recommendReason, "命中禁止清单，不能作为推荐标题。");
  assert.notEqual(normalized[0]?.title, forbiddenOption.title);
  assert.equal(normalized.length, 6);
});

test("buildFallbackTitleOptions extracts short seed from truncated source title", () => {
  const fallback = buildFallbackTitleOptions("搜索意图决定流量价值：关键词只是表面，需求阶段才是转化的…");

  assert.equal(normalizeTitleSeed("搜索意图决定流量价值：关键词只是表面，需求阶段才是转化的…"), "搜索意图决定流量价值");
  assert.equal(fallback[0]?.title, "搜索意图决定流量价值：真正拖住结果的，不是表面这一步");
  assert.ok(!fallback[0]?.title.includes("…："));
  assert.ok((fallback[0]?.title.match(/[：:]/g) ?? []).length <= 1);
});

test("buildFallbackTitleOptions strips dangling punctuation before colon", () => {
  const fallback = buildFallbackTitleOptions("Google Ads 精准词投放中，");

  assert.equal(normalizeTitleSeed("Google Ads 精准词投放中，"), "Google Ads 精准词投放中");
  assert.equal(fallback[0]?.title, "Google Ads 精准词投放中：真正拖住结果的，不是表面这一步");
  assert.doesNotMatch(fallback[0]?.title ?? "", /[，,、；;]\s*[：:]/);
});

test("detectTitleForbiddenHits catches mechanically spliced titles", () => {
  const hits = detectTitleForbiddenHits("搜索意图决定流量价值：关键词只是表面，需求阶段才是转化的…：真正拖住结果的，不是表面这一步");

  assert.ok(hits.includes("机械拼接"));
  assert.ok(hits.includes("截断标题拼接"));
});

test("detectTitleForbiddenHits catches adjacent punctuation before colon", () => {
  const hits = detectTitleForbiddenHits("Google Ads 精准词投放中，：真正拖住结果的，不是表面这一步");

  assert.ok(hits.includes("异常标点拼接"));
});

test("detectTitleForbiddenHits catches dangling particle before colon", () => {
  const hits = detectTitleForbiddenHits("Google Ads 精准词不赚钱的：真正拖住结果的，不是表面这一步");

  assert.ok(hits.includes("断裂助词拼接"));
});

test("buildFallbackTitleOptions strips dangling particle from seed", () => {
  const fallback = buildFallbackTitleOptions("Google Ads 精准词不赚钱的");

  assert.equal(normalizeTitleSeed("Google Ads 精准词不赚钱的"), "Google Ads 精准词不赚钱");
  assert.equal(fallback[0]?.title, "Google Ads 精准词不赚钱：真正拖住结果的，不是表面这一步");
  assert.doesNotMatch(fallback[0]?.title ?? "", /的\s*[：:]/);
});

test("buildTitleGenerationBrief converts raw titles into a reusable axis", () => {
  const brief = buildTitleGenerationBrief({
    articleTitle: "Google Ads 精准词不赚钱的：真正拖住结果的，不是表面这一步",
    workingTitle: "Google Ads 精准词不赚钱的",
    centralThesis: "精准词不赚钱，问题可能不在关键词，而在搜索意图",
    titleStrategyNotes: ["不要只写关键词准不准", "要写预算和线索错位"],
  });

  assert.equal(brief.titleAxis, "精准词不赚钱");
  assert(brief.forbiddenPrefixes.includes("Google Ads 精准词不赚钱"));
  assert.match(brief.rewriteRule, /不得复制工作标题/);
});

test("normalizeTitleOptions keeps safe fallback candidates when generated titles are structurally broken", () => {
  const fallback = buildFallbackTitleOptions("Google Ads 精准词不赚钱");
  const normalized = normalizeTitleOptions(
    Array.from({ length: 6 }, (_, index) => ({
      title: index === 0
        ? "Google Ads 精准词不赚钱的：真正拖住结果的，不是表面这一步"
        : `Google Ads 精准词不赚钱的：候选标题 ${index}`,
      openRateScore: 46,
      elementsHit: { specific: true, curiosityGap: true, readerView: false },
      isRecommended: index === 0,
    })),
    fallback,
  );
  const recommended = normalized.find((item) => item.isRecommended);

  assert(recommended);
  assert.equal(recommended.forbiddenHits.length, 0);
  assert.equal(recommended.title, "Google Ads 精准词不赚钱：真正拖住结果的，不是表面这一步");
  assert(normalized.some((item) => item.forbiddenHits.includes("断裂助词拼接")));
});
