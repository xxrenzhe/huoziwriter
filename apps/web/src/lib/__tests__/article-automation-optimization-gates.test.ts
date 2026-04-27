import assert from "node:assert/strict";
import test from "node:test";

import {
  getArticleViralReadinessGateIssues,
  getFictionalMaterialPlanGateIssues,
  getOpeningOptimizationGateIssues,
  getTitleOptimizationGateIssues,
  getViralNarrativePlanGateIssues,
} from "../article-automation-optimization-gates";
import { buildFallbackOpeningOptions, ensureSingleRecommendedOpeningOption } from "../opening-patterns";
import { ensureSingleRecommendedTitleOption } from "../title-patterns";

test("getTitleOptimizationGateIssues accepts strong recommended title", () => {
  const issues = getTitleOptimizationGateIssues({
    recommendedTitle: "为什么 AI 写作代理真正卡住的，不是 Prompt，而是证据链",
    recommendedTitleOpenRateScore: 43,
    titleOptions: [
      {
        title: "为什么 AI 写作代理真正卡住的，不是 Prompt，而是证据链",
        openRateScore: 43,
        elementsHit: { specific: true, curiosityGap: true, readerView: false },
        forbiddenHits: [],
        isRecommended: true,
      },
      { title: "AI 写作代理上线后，谁先受益谁先承压", openRateScore: 41, elementsHit: { specific: true, curiosityGap: false, readerView: false }, forbiddenHits: [] },
      { title: "做 AI 内容流水线，最容易被忽略的是哪一层", openRateScore: 40, elementsHit: { specific: false, curiosityGap: true, readerView: false }, forbiddenHits: [] },
      { title: "如果你在做 AI 内容团队，先别急着堆更多 Prompt", openRateScore: 38, elementsHit: { specific: true, curiosityGap: false, readerView: true }, forbiddenHits: [] },
      { title: "一条证据链，决定 AI 写作到底是提效还是翻车", openRateScore: 39, elementsHit: { specific: true, curiosityGap: false, readerView: false }, forbiddenHits: [] },
      { title: "AI 写作这件事，真正该补的不是模型，而是研究闭环", openRateScore: 37, elementsHit: { specific: true, curiosityGap: true, readerView: false }, forbiddenHits: [] },
    ],
    forbiddenHits: [],
  });

  assert.deepEqual(issues, []);
});

test("ensureSingleRecommendedTitleOption refuses weak explicit recommendation", () => {
  const options = ensureSingleRecommendedTitleOption([
    {
      title: "关于 AI 写作的一些思考",
      styleLabel: "弱标题",
      angle: "空泛",
      reason: "空泛",
      riskHint: "空泛",
      openRateScore: 29,
      elementsHit: { specific: false, curiosityGap: false, readerView: false },
      forbiddenHits: ["抽象概念堆砌"],
      isRecommended: true,
      recommendReason: "",
    },
    {
      title: "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链",
      styleLabel: "强标题",
      angle: "判断",
      reason: "有信息差",
      riskHint: "",
      openRateScore: 42,
      elementsHit: { specific: true, curiosityGap: true, readerView: false },
      forbiddenHits: [],
      isRecommended: false,
      recommendReason: "",
    },
  ]);

  assert.equal(options[0]?.isRecommended, false);
  assert.equal(options[1]?.isRecommended, true);
});

test("getTitleOptimizationGateIssues rejects weak title pack", () => {
  const issues = getTitleOptimizationGateIssues({
    recommendedTitle: "关于 AI 写作的一些思考",
    recommendedTitleOpenRateScore: 30,
    titleOptions: [
      {
        title: "关于 AI 写作的一些思考",
        openRateScore: 30,
        elementsHit: { specific: false, curiosityGap: false, readerView: false },
        forbiddenHits: ["抽象概念堆砌"],
        isRecommended: true,
      },
    ],
    forbiddenHits: ["抽象概念堆砌"],
  });

  assert.equal(issues.length, 4);
  assert.match(issues[0]?.detail ?? "", /标题候选不足/);
  assert.match(issues[1]?.detail ?? "", /标题命中禁区/);
  assert.match(issues[2]?.detail ?? "", /三要素命中不足/);
  assert.match(issues[3]?.detail ?? "", /打开率分过低/);
});

test("getOpeningOptimizationGateIssues accepts strong recommended opening", () => {
  const issues = getOpeningOptimizationGateIssues({
    recommendedOpening: "很多团队以为 AI 写作提效，卡点在 Prompt 不够细。真正把产线拖慢的，往往是研究补证、结构兑现和发布前核查这三层没被提前编排。",
    recommendedHookScore: 79,
    recommendedQualityCeiling: "A",
    recommendedOpeningDangerCount: 0,
    openingOptions: [
      {
        opening: "很多团队以为 AI 写作提效，卡点在 Prompt 不够细。真正把产线拖慢的，往往是研究补证、结构兑现和发布前核查这三层没被提前编排。",
        hookScore: 79,
        qualityCeiling: "A",
        diagnose: {
          abstractLevel: "pass",
          paddingLevel: "pass",
          hookDensity: "pass",
          informationFrontLoading: "pass",
        },
        forbiddenHits: [],
        isRecommended: true,
      },
      {
        opening: "如果你也在做内容团队，先别急着把锅都甩给模型。模型之外那几层手工补洞，才是整条写作流水线最容易反复返工的地方。",
        hookScore: 71,
        qualityCeiling: "B+",
        diagnose: {
          abstractLevel: "pass",
          paddingLevel: "pass",
          hookDensity: "pass",
          informationFrontLoading: "pass",
        },
        forbiddenHits: [],
      },
      {
        opening: "问题不是 AI 不能写，而是你把最慢的环节都留到了终稿之后。于是每补一次事实、每改一次开头，整篇文章的节奏都会被拖散。",
        hookScore: 73,
        qualityCeiling: "A",
        diagnose: {
          abstractLevel: "pass",
          paddingLevel: "pass",
          hookDensity: "pass",
          informationFrontLoading: "pass",
        },
        forbiddenHits: [],
      },
    ],
  });

  assert.deepEqual(issues, []);
});

test("buildFallbackOpeningOptions recommends a gate-ready opening", () => {
  const openingOptions = buildFallbackOpeningOptions("海外赚美金副业");
  const recommendedOpening = openingOptions.find((item) => item.isRecommended);
  const issues = getOpeningOptimizationGateIssues({
    recommendedOpening: recommendedOpening?.opening,
    recommendedHookScore: recommendedOpening?.hookScore,
    recommendedQualityCeiling: recommendedOpening?.qualityCeiling,
    recommendedOpeningDangerCount: recommendedOpening
      ? Object.values(recommendedOpening.diagnose).filter((item) => item === "danger").length
      : 99,
    openingOptions,
  });

  assert.equal(openingOptions.length, 3);
  assert(recommendedOpening);
  assert.deepEqual(issues, []);
});

test("ensureSingleRecommendedOpeningOption refuses weak explicit recommendation", () => {
  const options = ensureSingleRecommendedOpeningOption([
    {
      opening: "在当今 AI 时代，内容创作正在发生深刻变化。",
      text: "在当今 AI 时代，内容创作正在发生深刻变化。",
      value: "在当今 AI 时代，内容创作正在发生深刻变化。",
      patternCode: "phenomenon_signal",
      patternLabel: "现象信号",
      qualityCeiling: "B-",
      hookScore: 54,
      recommendReason: "",
      diagnose: {
        abstractLevel: "danger",
        paddingLevel: "danger",
        hookDensity: "danger",
        informationFrontLoading: "danger",
      },
      forbiddenHits: ["D1 抽象空转"],
      isRecommended: true,
    },
    {
      opening: "问题不是 AI 写作不能提效，而是研究补证、结构兑现和发布核查这三步被留到了最后。你越晚处理，整篇文章越容易散掉。",
      text: "问题不是 AI 写作不能提效，而是研究补证、结构兑现和发布核查这三步被留到了最后。你越晚处理，整篇文章越容易散掉。",
      value: "问题不是 AI 写作不能提效，而是研究补证、结构兑现和发布核查这三步被留到了最后。你越晚处理，整篇文章越容易散掉。",
      patternCode: "conflict_entry",
      patternLabel: "冲突反差",
      qualityCeiling: "A",
      hookScore: 78,
      recommendReason: "",
      diagnose: {
        abstractLevel: "pass",
        paddingLevel: "pass",
        hookDensity: "pass",
        informationFrontLoading: "pass",
      },
      forbiddenHits: [],
      isRecommended: false,
    },
  ]);

  assert.equal(options[0]?.isRecommended, false);
  assert.equal(options[1]?.isRecommended, true);
});

test("getOpeningOptimizationGateIssues rejects weak opening pack", () => {
  const issues = getOpeningOptimizationGateIssues({
    recommendedOpening: "在当今 AI 时代，内容创作正在发生深刻变化。",
    recommendedHookScore: 58,
    recommendedQualityCeiling: "B-",
    recommendedOpeningDangerCount: 2,
    openingOptions: [
      {
        opening: "在当今 AI 时代，内容创作正在发生深刻变化。",
        hookScore: 58,
        qualityCeiling: "B-",
        diagnose: {
          abstractLevel: "danger",
          paddingLevel: "pass",
          hookDensity: "danger",
          informationFrontLoading: "warn",
        },
        forbiddenHits: ["D1 宏大背景开场"],
        isRecommended: true,
      },
      {
        opening: "最近几年，AI 内容赛道发展很快。",
        hookScore: 52,
        qualityCeiling: "C",
        diagnose: {
          abstractLevel: "danger",
          paddingLevel: "warn",
          hookDensity: "danger",
          informationFrontLoading: "danger",
        },
        forbiddenHits: ["D1 宏大背景开场"],
      },
    ],
  });

  assert.equal(issues.length, 5);
  assert.match(issues[0]?.detail ?? "", /开头候选不足/);
  assert.match(issues[1]?.detail ?? "", /开头命中禁区/);
  assert.match(issues[2]?.detail ?? "", /danger 诊断项/);
  assert.match(issues[3]?.detail ?? "", /钩子分过低/);
  assert.match(issues[4]?.detail ?? "", /质量上限不足/);
});

test("getFictionalMaterialPlanGateIssues accepts concrete fictional material package", () => {
  const issues = getFictionalMaterialPlanGateIssues({
    fictionalMaterialPlan: [
      {
        label: "夜间工位复合场景",
        scene: "晚上 11 点，任务列表还在刷新。",
        character: "内容负责人",
        dialogue: "我不是怕 AI 不够强，我是怕自己一停下来就追不上。",
        dataRange: "十几个并行任务",
        plausibilityAnchor: "基于 AI 工作流压力的复合场景",
        boundaryNote: "虚构复合人物。",
      },
      {
        label: "预算会议重构",
        scene: "财务把账单投到会议屏幕上。",
        character: "财务负责人",
        dialogue: "这不是省钱的问题，是谁先承认速度没有白来。",
        dataRange: "月度成本几万元到几十万元",
        plausibilityAnchor: "用区间表达成本压力",
        boundaryNote: "虚构组织场景。",
      },
      {
        label: "私聊求助复合素材",
        scene: "凌晨聊天窗口里，消息删了又写。",
        character: "普通执行者",
        dialogue: "我不知道学到哪一步才算安全。",
        dataRange: "连续数周每天数小时",
        plausibilityAnchor: "职场转型焦虑",
        boundaryNote: "虚构私聊。",
      },
      {
        label: "小团队账本",
        scene: "五人团队把订阅工具和模型调用写进同一张表。",
        character: "团队创始人",
        dialogue: "我们买的是继续下注的资格。",
        dataRange: "占固定开支一成到三成",
        plausibilityAnchor: "小团队经营压力",
        boundaryNote: "虚构经营场景。",
      },
    ],
  });

  assert.deepEqual(issues, []);
});

test("getFictionalMaterialPlanGateIssues rejects thin fictional material package", () => {
  const issues = getFictionalMaterialPlanGateIssues({
    fictionalMaterialPlan: [
      {
        label: "空泛案例",
        scene: "有个人遇到了困难。",
      },
    ],
  });

  assert.equal(issues.length, 3);
  assert.match(issues[0]?.detail ?? "", /拟真虚构素材不足/);
  assert.match(issues[1]?.detail ?? "", /场景、人物、对话/);
  assert.match(issues[2]?.detail ?? "", /过于空泛/);
});

test("getViralNarrativePlanGateIssues accepts complete viral narrative plan", () => {
  const issues = getViralNarrativePlanGateIssues({
    viralNarrativePlan: {
      coreMotif: "所有人都跟不上自己制造出来的加速。",
      sceneEntry: "先用凌晨工位和跳动的任务列表进入现场。",
      storyDataAlternation: "每个场景后接区间数据，每组数据后接人物处境。",
      emotionalHooks: ["停不下来", "成本失控", "被替代焦虑"],
      motifCallbacks: [
        { section: "开头", callback: "抛出跟不上母题" },
        { section: "结尾", callback: "回收到读者自己的判断" },
      ],
      boundaryRule: "真实锚点只写公开背景，复合场景不冒充真实采访。",
    },
  });

  assert.deepEqual(issues, []);
});

test("getViralNarrativePlanGateIssues rejects missing motif and boundary", () => {
  const issues = getViralNarrativePlanGateIssues({
    viralNarrativePlan: {
      sceneEntry: "有一个场景。",
      emotionalHooks: ["焦虑"],
      motifCallbacks: [{ section: "开头", callback: "提一下主题" }],
    },
  });

  assert.equal(issues.length, 4);
  assert.match(issues[0]?.detail ?? "", /核心母题/);
  assert.match(issues[1]?.detail ?? "", /情绪钩子不足/);
  assert.match(issues[2]?.detail ?? "", /母题回收节点不足/);
  assert.match(issues[3]?.detail ?? "", /边界/);
});

test("getArticleViralReadinessGateIssues accepts complete writing prerequisites", () => {
  const issues = getArticleViralReadinessGateIssues({
    researchBrief: {
      sourceCoverage: { sufficiency: "ready" },
      sources: [{ label: "IMA 高价值素材" }],
      timelineCards: [{ title: "起点" }],
      comparisonCards: [{ subject: "路径 A" }],
      intersectionInsights: [{ insight: "交汇洞察" }],
    },
    titleOptimization: {
      recommendedTitle: "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链",
      recommendedTitleOpenRateScore: 43,
      titleOptions: Array.from({ length: 6 }, (_, index) => ({
        title: index === 0 ? "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链" : `AI 写作证据链标题 ${index}`,
        openRateScore: 40,
        elementsHit: { specific: true, curiosityGap: true, readerView: false },
        forbiddenHits: [],
        isRecommended: index === 0,
      })),
      forbiddenHits: [],
    },
    openingOptimization: {
      recommendedOpening: "很多团队以为 AI 写作提效，卡点在 Prompt 不够细。真正拖慢的，是研究补证、结构兑现和发布前核查。",
      recommendedHookScore: 79,
      recommendedQualityCeiling: "A",
      recommendedOpeningDangerCount: 0,
      openingOptions: [
        {
          opening: "很多团队以为 AI 写作提效，卡点在 Prompt 不够细。真正拖慢的，是研究补证、结构兑现和发布前核查。",
          hookScore: 79,
          qualityCeiling: "A",
          diagnose: { abstractLevel: "pass", paddingLevel: "pass", hookDensity: "pass", informationFrontLoading: "pass" },
          forbiddenHits: [],
          isRecommended: true,
        },
        { opening: "如果你在做内容团队，先别急着堆 Prompt。", hookScore: 70, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
        { opening: "问题不是 AI 不能写，而是慢环节留到了终稿后。", hookScore: 72, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
      ],
    },
    deepWriting: {
      sectionBlueprint: [{ heading: "一" }, { heading: "二" }, { heading: "三" }],
      viralNarrativePlan: {
        coreMotif: "所有人都跟不上自己制造出来的加速。",
        sceneEntry: "凌晨工位。",
        storyDataAlternation: "每个场景后接区间数据。",
        emotionalHooks: ["停不下来", "成本失控"],
        motifCallbacks: [{ section: "开头", callback: "抛出母题" }, { section: "结尾", callback: "回收母题" }],
        boundaryRule: "复合场景不冒充真实采访。",
      },
      fictionalMaterialPlan: [
        { scene: "A", character: "B", dialogue: "C", dataRange: "D", plausibilityAnchor: "E", boundaryNote: "F" },
        { scene: "A2", character: "B2", dialogue: "C2", dataRange: "D2", plausibilityAnchor: "E2", boundaryNote: "F2" },
        { scene: "A3", character: "B3", dialogue: "C3", dataRange: "D3", plausibilityAnchor: "E3", boundaryNote: "F3" },
        { scene: "A4", character: "B4", dialogue: "C4", dataRange: "D4", plausibilityAnchor: "E4", boundaryNote: "F4" },
      ],
    },
  });

  assert.deepEqual(issues, []);
});

test("getArticleViralReadinessGateIssues blocks fragmented patch-style prerequisites", () => {
  const issues = getArticleViralReadinessGateIssues({
    researchBrief: {
      sourceCoverage: { sufficiency: "blocked" },
      timelineCards: [],
      comparisonCards: [],
      intersectionInsights: [],
    },
    titleOptimization: {},
    openingOptimization: {},
    deepWriting: {
      sectionBlueprint: [{ heading: "一" }],
      viralNarrativePlan: {
        sceneEntry: "有一个场景。",
      },
      fictionalMaterialPlan: [{ scene: "有人很焦虑。" }],
    },
  });

  assert(issues.some((item) => item.code === "readiness_research_blocked"));
  assert(issues.some((item) => item.code === "readiness_research_backbone"));
  assert(issues.some((item) => item.code === "readiness_title_missing"));
  assert(issues.some((item) => item.code === "readiness_opening_missing"));
  assert(issues.some((item) => item.code === "readiness_section_blueprint"));
  assert(issues.some((item) => item.code.startsWith("readiness_viral_")));
  assert(issues.some((item) => item.code.startsWith("readiness_fictional_")));
});
