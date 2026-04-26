import assert from "node:assert/strict";
import test from "node:test";

import {
  composeLocalizedChineseContent,
  detectSourceLanguage,
  localizeSourceMaterialToChinese,
  shouldLocalizeSourceMaterial,
} from "../source-localization";

test("detectSourceLanguage identifies english-heavy and chinese-heavy content", () => {
  assert.equal(detectSourceLanguage({
    title: "How to build a side hustle income stream",
    excerpt: "Remote work, creator business, pricing and audience growth.",
  }), "en");

  assert.equal(detectSourceLanguage({
    title: "副业赚钱的关键不是努力，而是渠道选择",
    excerpt: "这篇文章拆解三个真实可执行的变现路径。",
  }), "zh");
});

test("shouldLocalizeSourceMaterial prefers localization for english-heavy sources", () => {
  assert.equal(shouldLocalizeSourceMaterial({
    title: "The creator economy playbook",
    excerpt: "Newsletter growth, affiliate revenue and audience retention.",
  }), true);
});

test("composeLocalizedChineseContent merges summary facts and term mappings into chinese writing material", () => {
  const content = composeLocalizedChineseContent({
    localizedSummary: "这篇材料的核心不是工具数量，而是收入结构正在从单次接单转向可复用资产。",
    factPointsZh: ["作者先靠接单验证需求，再把经验封装成课程。"],
    quoteCandidatesZh: ["真正的变化不是更努力，而是更可复用。"],
    termMappings: [{ sourceTerm: "creator economy", zhTerm: "创作者经济" }],
    translationRisk: "原文带明显经验分享口吻，不宜直接当作行业普遍事实。",
  });

  assert.match(content, /创作者经济/);
  assert.match(content, /1\. 作者先靠接单验证需求/);
  assert.match(content, /转述提醒/);
});

test("localizeSourceMaterialToChinese preserves original text and returns chinese payload from scene", async () => {
  const localized = await localizeSourceMaterialToChinese(
    {
      title: "How to build a location-independent career",
      excerpt: "The article explains how remote work and freelancing create durable income optionality.",
      sourceUrl: "https://example.com/remote-income",
    },
    {
      loadSystemPrompt: async () => "test prompt",
      runScene: async () => JSON.stringify({
        localizedTitle: "如何建立不受地域限制的职业收入系统",
        localizedSummary: "这篇材料强调，远程工作和自由职业的价值，不只是多赚一份钱，而是获得收入与地点的双重选择权。",
        factPointsZh: ["作者把路径拆成远程工作、自由职业和可复用数字资产三层。"],
        quoteCandidatesZh: ["真正稀缺的不是一份远程工作，而是可迁移的收入能力。"],
        termMappings: [{ sourceTerm: "location-independent", zhTerm: "不受地域限制", note: "保留职业机动性含义" }],
        translationRisk: "原文以经验口吻为主，涉及收入效果时不能外推到所有人。",
      }),
    },
  );

  assert.equal(localized.localizationStatus, "localized");
  assert.equal(localized.localizedTitle, "如何建立不受地域限制的职业收入系统");
  assert.match(localized.composedChineseContent, /收入与地点的双重选择权/);
  assert.match(localized.originalExcerpt, /remote work and freelancing/);
});

test("localizeSourceMaterialToChinese degrades gracefully when prompt loading fails", async () => {
  const localized = await localizeSourceMaterialToChinese(
    {
      title: "Remote work salary trends",
      excerpt: "The report compares compensation bands, demand shifts and hiring signals.",
      sourceUrl: "https://example.com/remote-salary",
    },
    {
      loadSystemPrompt: async () => {
        throw new Error("Prompt not found: source_localization");
      },
    },
  );

  assert.equal(localized.localizationStatus, "degraded");
  assert.equal(localized.localizedTitle, "Remote work salary trends");
  assert.match(localized.localizedSummary, /The report compares compensation bands/);
  assert.equal(localized.translationRisk, "中文化表达转化失败，本条仍以原文事实为准。");
  assert.equal(localized.degradedReason, "Prompt not found: source_localization");
});
