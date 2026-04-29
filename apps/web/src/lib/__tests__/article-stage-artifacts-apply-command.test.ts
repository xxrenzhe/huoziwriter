import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStageArtifactApplyCommand,
  normalizeViralGenomePackForPipeline,
  type ArticleStageArtifact,
} from "../article-stage-artifacts";
import { getViralGenomePackGateIssues } from "../article-automation-optimization-gates";
import { buildArticleViralGenomePack } from "../article-viral-genome";

function buildDeepWritingArtifact(payload: Record<string, unknown>): ArticleStageArtifact {
  return {
    stageCode: "deepWriting",
    title: "深写作",
    status: "ready",
    summary: null,
    payload,
    model: null,
    provider: null,
    errorMessage: null,
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:00.000Z",
  };
}

test("deep writing apply command puts organic growth before guardrails", () => {
  const command = buildStageArtifactApplyCommand(
    buildDeepWritingArtifact({
      selectedTitle: "搜索流量最贵的错，不是买错关键词",
      centralThesis: "真正昂贵的是没有识别搜索背后的交易意图。",
      materialRealityMode: "nonfiction",
      organicGrowthKernel: {
        startingState: "作者从复盘后的刺痛感进入，不从方法清单起笔。",
        readerConflict: "读者以为自己买错关键词，实际上一直在为错误意图付费。",
        materialSpark: "后台里同一个词带来点击，却没有带来有效成交。",
        authorLens: "作者盯住的是流量计费和真实需求之间的错位。",
        growthPath: [
          "先写读者正在损失的钱。",
          "再写关键词和意图错位。",
          "最后落到可转发判断。",
        ],
        guardrailRole: "规则只做护栏，不做方向盘。",
      },
      sectionBlueprint: [
        { heading: "先看损失", goal: "写出代价", paragraphMission: "从复盘现场进入" },
        { heading: "再看错位", goal: "写出冲突", paragraphMission: "让事实和判断咬合" },
        { heading: "最后收束", goal: "写出判断", paragraphMission: "不写行动清单" },
      ],
      voiceChecklist: ["不要写成教程"],
      finalChecklist: ["规则只做护栏"],
    }),
    { templateCode: "deep_constraints_first_v1" },
  );

  assert.match(command, /文章生长内核/);
  assert.match(command, /作者状态：作者从复盘后的刺痛感进入/);
  assert.match(command, /读者冲突：读者以为自己买错关键词/);
  assert.match(command, /规则身份：规则只做护栏，不做方向盘/);
  assert.ok(command.indexOf("文章生长内核") < command.indexOf("反说教写作姿态"));
  assert.ok(command.indexOf("文章生长内核") < command.indexOf("写作结构"));
});

test("deep writing apply command keeps viral genome signals in final command", () => {
  const command = buildStageArtifactApplyCommand(
    buildDeepWritingArtifact({
      selectedTitle: "团队写得更快之后，为什么还是发得更慢",
      centralThesis: "写作提速之后，真正拖慢流程的是核查、判断和发布收口。",
      materialRealityMode: "nonfiction",
      organicGrowthKernel: {
        startingState: "作者从一次终稿前返工进入，而不是从方法论起笔。",
        readerConflict: "读者看到的是效率提升，实际承受的是终稿前反复返工的代价。",
        materialSpark: "同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。",
        authorLens: "作者盯住的是责任没有随着写作提速一起前移。",
        growthPath: [
          "高概率爆点不是观点更响，而是读者能看见状态正在变化。",
          "结构按承诺兑现顺序推进：可见信号、误判代价、关键变量、角色分化、反例边界、可转发判断。",
        ],
        guardrailRole: "规则只做护栏，不做方向盘。",
      },
      viralNarrativePlan: {
        coreMotif: "流程加速之后，断点开始后移。",
        sceneEntry: "文档越写越快，稿子却还是卡在发布前一晚。",
        realWorldAnchors: ["同一篇稿子能在一天里改三轮标题，却还在终稿前补证据。"],
        emotionalHooks: [
          "开头前三句优先使用处境变化、反常识信号、问题句或数字锚点，不用背景介绍暖场。",
          "读者以为自己拿到了效率，实际只是在更晚的环节里返工。",
        ],
        motifCallbacks: [
          { section: "返工不是偶然", callback: "先让读者看到代价已经发生。" },
          { section: "最后留下的判断", callback: "最后把断点翻译成一句可转发判断。" },
        ],
        storyDataAlternation: "每个事实后面接一个判断，每个判断后面回到来源事实。",
        boundaryRule: "非虚构模式不得新增命名平台或伪造作者亲历。",
      },
      voiceChecklist: [
        "正文不以“你应该/首先/其次/最后/必须/不要”作为主节奏。",
        "建议必须藏在读者已看见的代价之后，以判断、边界或复盘口吻出现。",
      ],
      viralGenomePack: {
        sampleSourceProfile: {
          vertical: "AI产品与Agent",
          categorySampleCount: 39,
          accountCount: 5,
          matchedMechanisms: ["数字锚点", "反常识翻转"],
          sparseTrack: false,
          coverageNote: "样本覆盖充分。",
        },
        mechanismBias: {
          label: "反常识翻转",
          reason: "样本常靠旧判断失效制造传播张力。",
        },
        firstScreenPromise: "前 200 字交代具体处境、误判代价和半步答案。",
        shareTrigger: "读者会转发给正在把 AI 接进内容流程的同事。",
        authorPostureMode: "analysis_interpreter",
        businessQuestions: ["谁在降本或抢时间？", "成本卡在哪里？", "为什么是现在？"],
        titleDirections: [
          "标题先给具体对象：内容团队写作流程。",
          "标题必须写出变化：写作提速之后发布变慢。",
          "标题落到后果：核查和发布成为新断点。",
        ],
        openingEngine: "误判代价先抛。",
        narrativeSkeleton: "变化出现 -> 误判代价 -> 真正变量 -> 可转发判断。",
      },
      sectionBlueprint: [
        { heading: "返工不是偶然", goal: "先写代价", paragraphMission: "从返工现场切入" },
        { heading: "最后留下的判断", goal: "写出判断", paragraphMission: "不要写成步骤清单" },
      ],
    }),
    { templateCode: "deep_default_v1" },
  );

  assert.match(command, /高概率爆点不是观点更响，而是读者能看见状态正在变化/);
  assert.match(command, /情绪钩子：开头前三句优先使用处境变化/);
  assert.match(command, /表达约束：正文不以“你应该\/首先\/其次\/最后\/必须\/不要”作为主节奏/);
  assert.match(command, /现场入口：文档越写越快，稿子却还是卡在发布前一晚/);
  assert.match(command, /标题方向：标题先给具体对象：内容团队写作流程/);
  assert.match(command, /标题必须写出变化：写作提速之后发布变慢/);
});

test("viral genome normalization canonicalizes model aliases before readiness gates", () => {
  const fallback = buildArticleViralGenomePack({
    title: "别再只盯关键词了：真正值钱的是搜索意图",
    centralThesis: "搜索投放的错位经常不在词面，而在用户离行动还有多远。",
    targetReader: "正在做搜索广告的老板和投手",
    viralBlueprintLabel: "结构张力型",
  });
  const normalized = normalizeViralGenomePackForPipeline({
    firstScreenPromise: "你看到的不是一个关键词技巧问题，而是一个更贵地买来未行动流量的问题；如果还按词面修，预算只会更快变成解释不清的线索。",
    visualRhythmSlots: [
      {
        code: "early_proof",
        label: "早段证据位",
        preferredPosition: "第1节后半",
        purpose: "在读者刚接受主判断时补一张规则或结构图。",
      },
      {
        code: "mid_breath",
        label: "中段换气位",
        preferredPosition: "第2-3节之间",
        purpose: "用比较图或链路图承接覆盖边界、诊断边界和盈利边界。",
      },
    ],
  }, fallback);

  const slots = Array.isArray(normalized.visualRhythmSlots) ? normalized.visualRhythmSlots : [];
  const slotCodes = slots.map((slot) => String(slot.code || ""));

  assert.match(String(normalized.firstScreenPromise || ""), /前 120 字/);
  assert(slotCodes.includes("early_evidence"));
  assert(slotCodes.includes("middle_pacing"));
  assert.deepEqual(getViralGenomePackGateIssues({ viralGenomePack: normalized }), []);
});
