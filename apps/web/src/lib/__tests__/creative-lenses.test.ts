import assert from "node:assert/strict";
import test from "node:test";

import { CREATIVE_LENS_CODES, resolveCreativeLens, type CreativeLensCode } from "../creative-lenses";
import { buildWritingStateGuide, buildWritingStateKernel } from "../writing-state";

test("resolveCreativeLens recommends tool operator for executable workflow topics", () => {
  const result = resolveCreativeLens({
    title: "用 GitHub 开源项目搭一条 AI 自动化工作流",
    markdownContent: "这篇要讲 Prompt、配置、脚本和第一次跑通的坑。",
    articlePrototype: "tool_share",
  });

  assert.equal(result.selected.code, "tool_operator");
  assert.match(result.selected.triggerReason, /工具操盘/);
  assert.equal(result.options.length, CREATIVE_LENS_CODES.length);
});

test("writing state changes opening and evidence instructions when lens switches", () => {
  const baseInput = {
    title: "AI 搜索投放突然升温，内容团队该怎么判断",
    strategyCard: {
      coreAssertion: "AI 搜索不是多一个入口，而是在改变投放、内容和转化的判断顺序。",
      targetReader: "内容团队负责人",
    },
  } as const;

  const sharp = buildWritingStateKernel({
    ...baseInput,
    preferredCreativeLensCode: "sharp_opinion",
  });
  const field = buildWritingStateKernel({
    ...baseInput,
    preferredCreativeLensCode: "field_observation",
    humanSignals: {
      firstHandObservation: "一个投放同事说，关键词还没变，但询盘质量先变了。",
      realSceneOrDialogue: "群里有人问：现在到底该投搜索词，还是先改内容页？",
      score: 4,
    },
  });

  assert.equal(sharp.creativeLensCode, "sharp_opinion");
  assert.equal(field.creativeLensCode, "field_observation");
  assert.notEqual(sharp.openingMove, field.openingMove);
  assert.notEqual(sharp.evidenceMode, field.evidenceMode);
  assert.match(buildWritingStateGuide(sharp), /创意镜头：锐评判断镜头/);
  assert.match(buildWritingStateGuide(field), /创意镜头：现场观察镜头/);
});

test("six creative lenses produce concrete writing-state guidance", () => {
  const codes: CreativeLensCode[] = [
    "case_dissection",
    "field_observation",
    "sharp_opinion",
    "warm_personal",
    "experimental_walkthrough",
    "counterintuitive_analysis",
  ];

  const seenEvidenceModes = new Set<string>();
  for (const code of codes) {
    const kernel = buildWritingStateKernel({
      title: "一个 SaaS 创业团队用 AI Agent 重做客服工作流",
      preferredCreativeLensCode: code,
      strategyCard: {
        targetReader: "AI 产品经理",
        coreAssertion: "这不是功能升级，而是团队协作顺序被重排。",
      },
    });

    assert.equal(kernel.creativeLensCode, code);
    assert.match(kernel.creativeLensInstruction, /创意镜头/);
    assert(kernel.antiOutlineRules.length >= 4);
    assert(kernel.tabooPatterns.length >= 4);
    seenEvidenceModes.add(kernel.evidenceMode);
  }

  assert.equal(seenEvidenceModes.size, codes.length);
});

test("creative lens does not override high-confidence style profile constraints", () => {
  const kernel = buildWritingStateKernel({
    title: "一个创始人为什么暂停了增长投放",
    preferredCreativeLensCode: "founder_memo",
    writingStyleProfile: {
      paragraphBreathingPattern: "短段推进，每三段必须有一次具体回扣。",
      factDensity: "每一节至少一个具体数字或动作。",
      emotionalIntensity: "低到中等，不喊口号。",
      antiOutlineRules: ["保留作者自己的破题顺序"],
      tabooPatterns: ["不要使用行业黑话"],
    },
  });

  assert.equal(kernel.creativeLensCode, "founder_memo");
  assert.match(kernel.breakPattern, /短段推进/);
  assert.match(kernel.evidenceMode, /每一节至少一个具体数字或动作/);
  assert.match(kernel.emotionalTemperature, /低到中等/);
  assert(kernel.antiOutlineRules.includes("保留作者自己的破题顺序"));
  assert(kernel.tabooPatterns.includes("不要使用行业黑话"));
  assert(kernel.antiOutlineRules.some((item) => /成功学/.test(item)));
  assert(kernel.tabooPatterns.some((item) => /长期主义/.test(item)));
});

test("writing state uses author creative-lens outcome history unless manually overridden", () => {
  const authorOutcomeFeedbackLedger = {
    sampleCount: 3,
    positiveSampleCount: 2,
    prototypeSignals: [],
    stateVariantSignals: [],
    creativeLensSignals: [
      {
        key: "sharp_opinion",
        label: "锐评判断镜头",
        sampleCount: 3,
        hitCount: 2,
        nearMissCount: 0,
        missCount: 1,
        positiveSampleCount: 2,
        followedRecommendationSampleCount: 2,
        followedRecommendationPositiveCount: 2,
        performanceScore: 12,
        rankingAdjustment: -9,
        reason: "历史 3 篇同创意镜头里，命中 2 篇。这次可优先采用。",
      },
    ],
    openingPatternSignals: [],
    sectionRhythmSignals: [],
    recommendations: {
      prototype: null,
      stateVariant: null,
      creativeLens: {
        key: "sharp_opinion",
        label: "锐评判断镜头",
        sampleCount: 3,
        positiveSampleCount: 2,
        rankingAdjustment: -9,
        reason: "历史 3 篇同创意镜头里，命中 2 篇。这次可优先采用。",
      },
      openingPattern: null,
      sectionRhythm: null,
    },
    effectiveWritingProfile: null,
    updatedAt: new Date().toISOString(),
  };

  const auto = buildWritingStateKernel({
    title: "一次内容团队内部复盘",
    authorOutcomeFeedbackLedger,
  });
  const manual = buildWritingStateKernel({
    title: "一次内容团队内部复盘",
    authorOutcomeFeedbackLedger,
    preferredCreativeLensCode: "founder_memo",
  });

  assert.equal(auto.creativeLensCode, "sharp_opinion");
  assert.match(auto.creativeLensReason, /历史结果/);
  assert.equal(auto.creativeLensOptions[0]?.isRecommended, true);
  assert.equal(auto.creativeLensOptions[0]?.historySignal?.rankingAdjustment, -9);
  assert.equal(manual.creativeLensCode, "founder_memo");
});
