import assert from "node:assert/strict";
import test from "node:test";

import { buildStageArtifactApplyCommand, type ArticleStageArtifact } from "../article-stage-artifacts";

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
