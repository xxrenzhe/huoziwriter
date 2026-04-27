import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStageDetailSections,
  buildStageSummary,
  getStageQualityGateClassName,
  getStageQualityGateState,
  getStageSearchMetrics,
  type AutomationStage,
} from "../../components/article-automation-cockpit-shared";

function createStage(input?: Partial<AutomationStage>): AutomationStage {
  return {
    stageCode: "researchBrief",
    promptId: "plan22.research",
    promptVersion: "v1",
    sceneCode: "researchBrief",
    provider: "openai",
    model: "gpt-5.4",
    status: "completed",
    inputJson: {},
    outputJson: {},
    qualityJson: {},
    searchTraceJson: {},
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-04-25T10:00:00.000Z",
    completedAt: "2026-04-25T10:00:10.000Z",
    ...input,
  };
}

test("buildStageDetailSections summarizes research outputs and search trace", () => {
  const stage = createStage({
    outputJson: {
      queries: [
        { query: "AI 自动化写作", purpose: "自动补源" },
        { query: "公众号 草稿箱 自动化", purpose: "研究必查维度" },
      ],
      sources: [
        { label: "OpenAI Docs", sourceType: "official", sourceUrl: "https://platform.openai.com/docs/images" },
        { label: "SearXNG", sourceType: "search", detail: "JSON API", sourceUrl: "https://docs.searxng.org/dev/search_api.html" },
      ],
      evidenceGaps: ["最近 30 天真实案例不足"],
    },
    qualityJson: {
      artifactSummary: "已完成研究归并",
      promptVersionRefs: ["plan22.research@v1"],
    },
    searchTraceJson: {
      provider: "searxng",
      query: "AI 自动化写作",
      items: [
        { url: "https://platform.openai.com/docs/images" },
        { url: "https://docs.searxng.org/dev/search_api.html" },
      ],
    },
  });

  const sections = buildStageDetailSections(stage);
  const metrics = getStageSearchMetrics(stage);

  assert.equal(metrics?.queryCount, 1);
  assert.equal(metrics?.domainCount, 2);
  assert.equal(metrics?.urlCount, 2);
  assert(sections.some((section) => section.title === "研究查询" && section.items.some((item) => item.includes("AI 自动化写作"))));
  assert(sections.some((section) => section.title === "信源摘要" && section.items.some((item) => item.includes("platform.openai.com"))));
  assert(sections.some((section) => section.title === "质量记录" && section.items.some((item) => item.includes("plan22.research@v1"))));
  assert(sections.some((section) => section.title === "搜索轨迹" && section.items.some((item) => item.includes("域名 2 个"))));
});

test("buildStageDetailSections surfaces publish guard blockers and repair actions", () => {
  const stage = createStage({
    stageCode: "publishGuard",
    sceneCode: "publishGuard",
    outputJson: {
      blockers: ["缺少公众号连接"],
      warnings: ["封面图仍使用占位图"],
      repairActions: ["先补公众号连接后再推送草稿箱"],
      canPublish: false,
    },
  });

  const sections = buildStageDetailSections(stage);
  const publishGuard = sections.find((section) => section.title === "发布守门");

  assert(publishGuard);
  assert(publishGuard.items.some((item) => item.includes("阻塞：缺少公众号连接")));
  assert(publishGuard.items.some((item) => item.includes("修复：先补公众号连接后再推送草稿箱")));
  assert(publishGuard.items.some((item) => item.includes("可发布：否")));
});

test("buildStageDetailSections surfaces quality gate retry pass state", () => {
  const stage = createStage({
    stageCode: "titleOptimization",
    sceneCode: "titleOptimizer",
    outputJson: {
      recommendedTitle: "为什么 AI 写作流程真正卡住的，不是 Prompt，而是证据链",
    },
    qualityJson: {
      qualityRetryCount: 1,
      qualityGatePassed: true,
    },
  });

  const sections = buildStageDetailSections(stage);
  const qualitySection = sections.find((section) => section.title === "质量记录");

  assert(qualitySection);
  assert(qualitySection.items.some((item) => item.includes("门禁：自动补救后通过")));
  assert.match(buildStageSummary(stage), /自动补救后通过/);
  assert.equal(getStageQualityGateState(stage)?.tone, "warning");
  assert.equal(getStageQualityGateState(stage)?.action?.stageCode, "titleOptimization");
  assert.equal(getStageQualityGateState(stage)?.action?.label, "重跑标题优化");
});

test("buildStageDetailSections surfaces title and opening quality gate metrics", () => {
  const titleStage = createStage({
    stageCode: "titleOptimization",
    sceneCode: "titleOptimizer",
    outputJson: {
      recommendedTitle: "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链",
      recommendedTitleOpenRateScore: 43,
      recommendedTitleElementsHitCount: 2,
      recommendedTitleForbiddenHitCount: 0,
      titleOptions: [
        { title: "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链" },
        { title: "AI 写作流程最该补的不是模型" },
      ],
    },
    qualityJson: {
      titleOptionCount: 6,
      qualityGatePassed: true,
    },
  });
  const openingStage = createStage({
    stageCode: "openingOptimization",
    sceneCode: "openingOptimizer",
    outputJson: {
      recommendedOpening: "很多团队以为 AI 写作提效，卡点在 Prompt 不够细。",
      recommendedHookScore: 79,
      recommendedQualityCeiling: "A",
      recommendedOpeningDangerCount: 0,
      recommendedOpeningForbiddenHitCount: 0,
    },
    qualityJson: {
      openingOptionCount: 3,
      qualityGatePassed: true,
    },
  });

  const titleQualitySection = buildStageDetailSections(titleStage).find((section) => section.title === "质量记录");
  const openingQualitySection = buildStageDetailSections(openingStage).find((section) => section.title === "质量记录");

  assert(titleQualitySection?.items.some((item) => item.includes("门禁指标：候选：6 个")));
  assert(titleQualitySection?.items.some((item) => item.includes("门禁指标：打开率分：43")));
  assert(titleQualitySection?.items.some((item) => item.includes("门禁指标：标题三要素：2/3")));
  assert(openingQualitySection?.items.some((item) => item.includes("门禁指标：候选：3 个")));
  assert(openingQualitySection?.items.some((item) => item.includes("门禁指标：钩子分：79")));
  assert(openingQualitySection?.items.some((item) => item.includes("门禁指标：质量上限：A")));
});

test("getStageQualityGateState surfaces quality gate blocked state", () => {
  const stage = createStage({
    stageCode: "openingOptimization",
    sceneCode: "openingOptimizer",
    status: "blocked",
    errorCode: "opening_optimization_quality_blocked",
    errorMessage: "开头优化未达到质量门槛：开头钩子分过低。",
  });

  const state = getStageQualityGateState(stage);

  assert(state);
  assert.equal(state?.tone, "blocked");
  assert.match(state?.detail ?? "", /质量门槛/);
  assert.match(buildStageSummary(stage), /质量门槛/);
  assert.equal(state?.action?.stageCode, "openingOptimization");
  assert.equal(state?.action?.label, "重跑开头优化");
  assert.equal(getStageQualityGateClassName(state?.tone ?? "blocked"), "border-cinnabar/20 bg-cinnabar/5 text-cinnabar");
});

test("article write timeline surfaces viral narrative and fictional material gates", () => {
  const stage = createStage({
    stageCode: "articleWrite",
    sceneCode: "articleWrite",
    outputJson: {
      markdown: "# 成稿\n\n正文内容",
    },
    qualityJson: {
      articleViralReadinessGatePassed: true,
      viralNarrativeGatePassed: true,
      viralNarrativeCoreMotif: "所有人都跟不上自己制造出来的加速。",
      viralNarrativeEmotionalHookCount: 3,
      viralNarrativeMotifCallbackCount: 4,
      viralNarrativeBoundaryRule: "真实锚点只写公开背景，复合场景不冒充真实采访。",
      fictionalMaterialGatePassed: true,
      fictionalMaterialCount: 5,
    },
  });

  const state = getStageQualityGateState(stage);
  const qualitySection = buildStageDetailSections(stage).find((section) => section.title === "质量记录");

  assert.equal(state?.tone, "passed");
  assert.equal(state?.label, "爆款可写性门禁通过");
  assert(qualitySection?.items.some((item) => item.includes("门禁：爆款可写性门禁通过")));
  assert(qualitySection?.items.some((item) => item.includes("门禁指标：核心母题：所有人都跟不上自己制造出来的加速。")));
  assert(qualitySection?.items.some((item) => item.includes("门禁指标：情绪钩子：3 个")));
  assert(qualitySection?.items.some((item) => item.includes("门禁指标：母题回收：4 处")));
  assert(qualitySection?.items.some((item) => item.includes("门禁指标：拟真素材：5 条")));
});

test("article write quality gate blocker offers rerun action", () => {
  const stage = createStage({
    stageCode: "articleWrite",
    sceneCode: "articleWrite",
    status: "blocked",
    errorCode: "article_viral_readiness_quality_blocked",
    errorMessage: "爆款文章可写性未达到质量门槛：缺少核心母题。",
  });

  const state = getStageQualityGateState(stage);

  assert.equal(state?.tone, "blocked");
  assert.equal(state?.action?.stageCode, "articleWrite");
  assert.equal(state?.action?.label, "重跑正文生成");
});
