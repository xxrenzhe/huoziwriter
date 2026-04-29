import assert from "node:assert/strict";
import test from "node:test";

import {
  getArticleViralReadinessGateIssues,
  getFictionalMaterialPlanGateIssues,
  getGeneratedArticleViralQualityGateIssues,
  getOpeningOptimizationGateIssues,
  getTitleOptimizationGateIssues,
  getViralGenomePackGateIssues,
  getViralNarrativePlanGateIssues,
} from "../article-automation-optimization-gates";
import { buildArticleViralGenomePack } from "../article-viral-genome";
import { buildFallbackOpeningOptions, ensureSingleRecommendedOpeningOption } from "../opening-patterns";
import { ensureSingleRecommendedTitleOption } from "../title-patterns";

function buildBusinessResearchFields(pack: ReturnType<typeof buildArticleViralGenomePack>) {
  return {
    businessQuestions: pack.businessQuestions,
    businessQuestionAnswers: pack.businessQuestions.map((question) => ({
      question,
      answer: `${question} 已用钱流、why now、适用边界和证据锚点回答。`,
      evidenceNeed: "案例/数字/原话/工具平台证据",
      status: "answered",
    })),
    sparseTrackResearchPlan: {
      sparseTrack: Boolean(pack.sampleSourceProfile.sparseTrack),
      sourceIntensity: pack.sampleSourceProfile.sparseTrack ? "elevated" : "standard",
      requiredAngles: pack.sampleSourceProfile.sparseTrack
        ? ["钱从哪里来", "为什么现在", "谁不适合做"]
        : ["钱流/成本", "why now", "适用边界"],
      note: pack.sparseTrackAlert || pack.sampleSourceProfile.coverageNote,
    },
  };
}

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

test("getTitleOptimizationGateIssues rejects mechanically spliced recommended title", () => {
  const badTitle = "搜索意图决定流量价值：关键词只是表面，需求阶段才是转化的…：真正拖住结果的，不是表面这一步";
  const issues = getTitleOptimizationGateIssues({
    recommendedTitle: badTitle,
    recommendedTitleOpenRateScore: 46,
    titleOptions: Array.from({ length: 6 }, (_, index) => ({
      title: index === 0 ? badTitle : `搜索意图决定流量价值，为什么不能只看关键词 ${index}`,
      openRateScore: index === 0 ? 46 : 40,
      elementsHit: { specific: true, curiosityGap: true, readerView: false },
      forbiddenHits: [],
      isRecommended: index === 0,
    })),
    forbiddenHits: [],
  });

  assert.equal(issues.length, 1);
  assert.match(issues[0]?.detail ?? "", /机械拼接|截断标题拼接/);
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

test("getOpeningOptimizationGateIssues rejects model-pass opening when local diagnosis finds D2", () => {
  const weakOpening = "复盘会里，老板盯着广告后台问的还是那句：这个精准词还要不要加价？但真正把预算拖慢的，往往不是出价。词已经够窄了，线索表却越来越钝：有人只是来了解，有人在比较，还有人准备行动，却被你接进了同一个入口。一个词看起来越精准，账户里越容易暴露更难看的问题——点进来的人，未必是你想接的人。半步答案是：先别急着改价，先判断这个词接住的到底是哪一段需求。";
  const passDiagnose = {
    abstractLevel: "pass",
    paddingLevel: "pass",
    hookDensity: "pass",
    informationFrontLoading: "pass",
  };
  const issues = getOpeningOptimizationGateIssues({
    recommendedOpening: weakOpening,
    recommendedHookScore: 82,
    recommendedQualityCeiling: "A",
    recommendedOpeningDangerCount: 0,
    openingOptions: [
      {
        opening: weakOpening,
        hookScore: 82,
        qualityCeiling: "A",
        diagnose: passDiagnose,
        forbiddenHits: [],
        isRecommended: true,
      },
      {
        opening: "词很精准，质量分也不差，预算还能跑，结果就是不出单。真正该复盘的，是搜索词背后的需求阶段。",
        hookScore: 76,
        qualityCeiling: "A",
        diagnose: passDiagnose,
        forbiddenHits: [],
      },
      {
        opening: "如果一个精准词长期不赚钱，问题可能不在匹配方式，也不在质量分，而在搜这个词的人还没到成交位置。",
        hookScore: 74,
        qualityCeiling: "B+",
        diagnose: passDiagnose,
        forbiddenHits: [],
      },
    ],
  });

  assert(issues.some((item) => item.code === "opening_forbidden_hits"));
  assert.match(issues.find((item) => item.code === "opening_forbidden_hits")?.detail ?? "", /D2 铺垫过长/);
});

test("getOpeningOptimizationGateIssues requires first-screen object change and consequence", () => {
  const weakOpening = "Cursor 和 Figma 最近都在发生变化，AI 应用格局也在调整。";
  const issues = getOpeningOptimizationGateIssues({
    recommendedOpening: weakOpening,
    recommendedHookScore: 82,
    recommendedQualityCeiling: "A",
    recommendedOpeningDangerCount: 0,
    openingOptions: [
      {
        opening: weakOpening,
        hookScore: 82,
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
      { opening: "Cursor 和 Figma 都在被重新估值。", hookScore: 75, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
      { opening: "AI 应用的讨论开始变多。", hookScore: 72, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
    ],
  });

  assert(issues.some((item) => item.code === "opening_first_screen_contract"));
  assert.match(issues.find((item) => item.code === "opening_first_screen_contract")?.detail ?? "", /后果\/机会/);
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

test("buildFallbackOpeningOptions creates concrete search marketing openings", () => {
  const openingOptions = buildFallbackOpeningOptions("Google Ads 精准词为什么不赚钱");
  const recommendedOpening = openingOptions.find((item) => item.isRecommended);
  const text = openingOptions.map((item) => item.opening).join("\n");

  assert.equal(openingOptions.length, 3);
  assert(recommendedOpening);
  assert.match(text, /质量分|搜索词|关键词|出单|成交位置/);
  assert.doesNotMatch(text, /执行顺序|成本账本|旧流程|内容生产|Prompt/);
  assert.equal(recommendedOpening.forbiddenHits.length, 0);
  assert.notEqual(recommendedOpening.diagnose.hookDensity, "danger");
  assert.notEqual(recommendedOpening.diagnose.informationFrontLoading, "danger");
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

  assert.equal(issues.length, 6);
  assert.match(issues[0]?.detail ?? "", /开头候选不足/);
  assert.match(issues[1]?.detail ?? "", /开头命中禁区/);
  assert.match(issues[2]?.detail ?? "", /danger 诊断项/);
  assert.match(issues[3]?.detail ?? "", /钩子分过低/);
  assert.match(issues[4]?.detail ?? "", /质量上限不足/);
  assert.match(issues[5]?.detail ?? "", /第一屏承诺/);
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
  const viralGenomePack = buildArticleViralGenomePack({
    title: "为什么 AI 写作真正卡住的，不是 Prompt，而是证据链",
    centralThesis: "慢的不是写作，而是事实、判断和发布之间的断点。",
    targetReader: "内容团队负责人",
    viralBlueprintLabel: "结构张力型",
  });
  const issues = getArticleViralReadinessGateIssues({
    researchBrief: {
      sourceCoverage: { sufficiency: "ready" },
      sources: [{ label: "IMA 高价值素材" }],
      timelineCards: [{ title: "起点" }],
      comparisonCards: [{ subject: "路径 A" }],
      intersectionInsights: [{ insight: "交汇洞察" }],
      ...buildBusinessResearchFields(viralGenomePack),
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
      mustUseFacts: [
        "同一篇稿子会在终稿前反复补证据。",
        "写作提速后，核查和发布收口成为新断点。",
      ],
      sectionBlueprint: [
        { heading: "一", evidenceHints: ["终稿前反复补证据"] },
        { heading: "二", evidenceHints: ["核查和发布收口"] },
        { heading: "三", evidenceHints: ["流程断点后移"] },
      ],
      viralGenomePack,
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

test("getArticleViralReadinessGateIssues accepts nonfiction writing card without fictional material", () => {
  const viralGenomePack = buildArticleViralGenomePack({
    title: "别再只盯关键词了：真正值钱的是搜索意图",
    centralThesis: "搜索意图决定投放复盘到底是在修词面，还是在修用户行动阶段。",
    targetReader: "正在做搜索广告的老板和投手",
    viralBlueprintLabel: "结构张力型",
  });
  const base = {
    researchBrief: {
      sourceCoverage: { sufficiency: "ready" },
      sources: [{ label: "来源正文" }],
      timelineCards: [{ title: "起点" }],
      comparisonCards: [{ subject: "路径 A" }],
      intersectionInsights: [{ insight: "交汇洞察" }],
      ...buildBusinessResearchFields(viralGenomePack),
    },
    titleOptimization: {
      recommendedTitle: "别再只盯关键词了：真正值钱的是搜索意图",
      recommendedTitleOpenRateScore: 43,
      titleOptions: Array.from({ length: 6 }, (_, index) => ({
        title: index === 0 ? "别再只盯关键词了：真正值钱的是搜索意图" : `搜索意图标题 ${index}`,
        openRateScore: 40,
        elementsHit: { specific: true, curiosityGap: true, readerView: false },
        forbiddenHits: [],
        isRecommended: index === 0,
      })),
      forbiddenHits: [],
    },
    openingOptimization: {
      recommendedOpening: "词很精准，质量分也不差，预算还能跑，结果就是不出单。这个时候，先别急着调出价，真正该复盘的是搜索词背后的需求阶段。",
      recommendedHookScore: 79,
      recommendedQualityCeiling: "A",
      recommendedOpeningDangerCount: 0,
      openingOptions: [
        {
          opening: "词很精准，质量分也不差，预算还能跑，结果就是不出单。这个时候，先别急着调出价，真正该复盘的是搜索词背后的需求阶段。",
          hookScore: 79,
          qualityCeiling: "A",
          diagnose: { abstractLevel: "pass", paddingLevel: "pass", hookDensity: "pass", informationFrontLoading: "pass" },
          forbiddenHits: [],
          isRecommended: true,
        },
        { opening: "如果你在做搜索广告，先别急着扩关键词。", hookScore: 70, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
        { opening: "关键词只是入口，意图才决定后面的转化。", hookScore: 72, qualityCeiling: "B+", diagnose: {}, forbiddenHits: [] },
      ],
    },
    deepWriting: {
      materialRealityMode: "nonfiction",
      mustUseFacts: [
        "词很精准、质量分不差但仍然不出单。",
        "搜索词背后的需求阶段会影响成交位置。",
      ],
      sectionBlueprint: [
        { heading: "一", evidenceHints: ["词很精准但不出单"] },
        { heading: "二", evidenceHints: ["需求阶段不同"] },
        { heading: "三", evidenceHints: ["成交位置差异"] },
      ],
      viralNarrativePlan: {
        coreMotif: "关键词只是表层。",
        sceneEntry: "从来源事实切入。",
        storyDataAlternation: "事实后接判断。",
        emotionalHooks: ["少走弯路", "重新判断流量价值"],
        motifCallbacks: [{ section: "开头", callback: "抛出母题" }, { section: "结尾", callback: "回收母题" }],
        boundaryRule: "只使用来源事实和行业泛例。",
      },
      viralGenomePack,
      fictionalMaterialPlan: [],
    },
  };

  assert.deepEqual(getArticleViralReadinessGateIssues(base), []);
  assert.deepEqual(getArticleViralReadinessGateIssues({
    ...base,
    deepWriting: {
      ...base.deepWriting,
      fictionalMaterialPlan: [{
        type: "author_inference",
        scene: "作者可以从一个匿名复盘会切入，写团队表面都在查参数，其实忽略了搜索意图。",
        character: "作者旁白与匿名团队",
        dialogue: "这不是某个真实会议原话，也不是任何真实聊天记录，而是一句复合后的追问。",
        boundaryNote: "作者视角推演素材，不对应真实会议或真实聊天记录。",
      }],
    },
  }), []);
  assert.deepEqual(getArticleViralReadinessGateIssues({
    ...base,
    deepWriting: {
      ...base.deepWriting,
      fictionalMaterialPlan: [{
        type: "author_inference",
        scene: "作者推演两种查询语境：一种在了解，一种在比较或准备行动。",
        character: "不出现命名品牌、平台、页面或真实客户。",
        dialogue: "可写成作者判断句：词面接近，不等于决策阶段接近。",
        dataRange: "只写相对描述，不写金额和比例。",
        plausibilityAnchor: "来自研究交汇洞察与现有事实素材中的同类现象。",
        boundaryNote: "只作概念可视化，不作为真实账户案例或真实查询记录。",
      }],
    },
  }), []);
  assert.deepEqual(getArticleViralReadinessGateIssues({
    ...base,
    deepWriting: {
      ...base.deepWriting,
      fictionalMaterialPlan: [{
        type: "scenario_reconstruction",
        scene: "两个搜索者输入相似词，一个在了解方案，一个在比较供应商。",
        character: "匿名化的搜索者A与搜索者B",
        dialogue: "A：“我先看看有什么方案。” B：“我现在就想比价。”",
        dataRange: "无具体数字，仅表达阶段差异。",
        plausibilityAnchor: "与搜索意图和需求阶段的常见分层一致。",
        boundaryNote: "概念性场景重建，仅用于说明机制，不是实际用户访谈。",
      }],
    },
  }), []);
  assert.deepEqual(getArticleViralReadinessGateIssues({
    ...base,
    deepWriting: {
      ...base.deepWriting,
      fictionalMaterialPlan: [{
        type: "author_inference",
        scene: "作者推演两种极端：全部依赖 exact match 与全部放开 broad match。",
        character: "作者判断视角，无具体账户主体",
        dialogue: "不是越准越好，也不是越宽越好。",
        dataRange: "只写机制与可能后果，不写真实投放结果数字。",
        plausibilityAnchor: "Google Ads 三种匹配方式覆盖与控制差异为可确认事实。",
        boundaryNote: "策略推演，不冒充真实投放结果或客户案例。",
      }],
    },
  }), []);
  assert(getArticleViralReadinessGateIssues({
    ...base,
    deepWriting: {
      ...base.deepWriting,
      fictionalMaterialPlan: [{ scene: "知乎登录页案例" }],
    },
  }).some((item) => item.code === "readiness_nonfiction_author_perspective_material_boundary"));
});

test("getViralGenomePackGateIssues requires Plan24 source profile and share reason", () => {
  assert.deepEqual(getViralGenomePackGateIssues({
    viralGenomePack: buildArticleViralGenomePack({
      title: "别再只盯关键词了：真正值钱的是搜索意图",
      centralThesis: "搜索意图决定投放复盘到底是在修词面，还是在修用户行动阶段。",
      targetReader: "正在做搜索广告的老板和投手",
    }),
  }), []);

  const issues = getViralGenomePackGateIssues({
    viralGenomePack: {
      sampleSummary: "百篇样本",
      mechanismBias: { label: "反常识翻转", reason: "看起来像机制" },
      firstScreenPromise: "第一屏说清观点。",
      shareTrigger: "",
    },
  });

  assert(issues.some((item) => item.code === "viral_genome_source_profile"));
  assert(issues.some((item) => item.code === "viral_genome_first_screen_contract"));
  assert(issues.some((item) => item.code === "viral_genome_share_reason"));
  assert(issues.some((item) => item.code === "viral_genome_title_directions"));
  assert(issues.some((item) => item.code === "viral_genome_evidence_priorities"));
  assert(issues.some((item) => item.code === "viral_genome_emotion_vectors"));
  assert(issues.some((item) => item.code === "viral_genome_visual_rhythm"));
  assert(issues.some((item) => item.code === "viral_genome_reader_scene_anchors"));
  assert(issues.some((item) => item.code === "viral_genome_translation_pairs"));
  assert(issues.some((item) => item.code === "viral_genome_opening_micro_scenes"));
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
  assert(issues.some((item) => item.code.startsWith("readiness_viral_genome_")));
  assert(issues.some((item) => item.code.startsWith("readiness_evidence_")));
  assert(issues.some((item) => item.code.startsWith("readiness_fictional_")));
});

test("getGeneratedArticleViralQualityGateIssues rejects preachy distant final article", () => {
  const issues = getGeneratedArticleViralQualityGateIssues({
    markdownContent: [
      "# 搜索投放这些年的变化",
      "",
      "痛点引入",
      "",
      "搜索投放这些年的变化，说明很多旧解释就是从这里开始松动。这种损失感很具体，解释权也在发生价值分化。你应该先做第一步，然后你需要做第二步，必须先完成方法论拆解。",
      "",
      "你应该先做第一步，然后你需要做第二步。我们需要搭建任务矩阵，必须先完成方法论拆解，不要先看账户里的真实订单。",
      "",
      "你应该继续按照步骤执行，第一步看流程，第二步看路径，最后做行动建议。",
    ].join("\n"),
    htmlContent: "<figure><figcaption>方法总结</figcaption></figure>",
  });

  assert(issues.some((item) => item.code === "generated_article_first_screen_contract"));
  assert(issues.some((item) => item.code === "generated_article_didactic_tone"));
  assert(issues.some((item) => item.code === "generated_article_first_paragraph_didactic_signal"));
  assert(issues.some((item) => item.code === "generated_article_commercial_evidence_coverage"));
  assert(issues.some((item) => item.code === "generated_article_distant_tone"));
  assert(issues.some((item) => item.code === "generated_article_obscure_expression"));
  assert(issues.some((item) => item.code === "generated_article_internal_label_exposure"));
});

test("getGeneratedArticleViralQualityGateIssues accepts concrete reader-close final article", () => {
  const issues = getGeneratedArticleViralQualityGateIssues({
    markdownContent: [
      "# 关键词没错，钱还是花没了",
      "",
      "一个做 Google Ads 的老板上周把词表翻了三遍，关键词够准，质量分 8 分，后台每天有点击，订单却还是没有动。他在复盘会上说：「钱花得出去，单就是不来。」真正卡住的不是词面，而是搜这个词的人还停在比方案，离下单差了半步。",
      "",
      "这类复盘最刺眼的地方，是预算已经花出去了，团队还在围着出价和匹配方式打转。账户里看起来每个指标都有解释，老板要的那张订单却没有出现。",
      "",
      "我更愿意把它看成一次搜索意图复盘：同一个词，可以是了解、比较，也可以是准备买。文章后面只讨论这个误判怎么发生，以及它为什么会让投手少赚一轮转化。",
    ].join("\n"),
  });

  assert.deepEqual(issues, []);
});
