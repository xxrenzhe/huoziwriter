import assert from "node:assert/strict";
import test from "node:test";

import { analyzeAiNoise } from "../ai-noise-scan";

test("analyzeAiNoise flags didactic article posture as viral quality risk", () => {
  const result = analyzeAiNoise([
    "# 关键词表为什么管不住流量价值",
    "",
    "如果你现在就在做搜索广告或 SEO，不要先扩词。",
    "",
    "真正该问的是，用户搜这个词的时候到底要完成什么任务。",
    "",
    "第一步，先把现有关键词表重做一遍。",
    "",
    "第二步，再按用户要完成的任务、决策阶段和页面承接方式分组。",
    "",
    "页面也要跟着改。评估方式也得一起换。",
    "",
    "更合理的做法，是把排产单位从关键词表换成任务矩阵。",
  ].join("\n"));

  assert.equal(result.didacticToneRisk, "high");
  assert(result.didacticCueCount >= 8);
  assert(result.findings.some((item) => item.includes("说教姿态偏重")));
  assert(result.suggestions.some((item) => item.includes("损失、冲突、复盘或误判现场")));
});

test("analyzeAiNoise does not punish reader-centered conflict writing", () => {
  const result = analyzeAiNoise([
    "# 搜索流量最贵的错，不是买错关键词",
    "",
    "关键词看起来都对，广告却只剩消耗；SEO 有排名、有流量，用户还是看完就走。",
    "",
    "这不是最麻烦的。",
    "",
    "最麻烦的是，复盘会上每个解释都像是真的。出价可以再看，质量分可以再查，文案可以再换。",
    "",
    "用户打下那几个字的时候，到底想做什么？",
    "",
    "同一个词，装得下四种人。结果自然不可能一样。",
  ].join("\n"));

  assert.equal(result.didacticToneRisk, "low");
  assert.equal(result.findings.some((item) => item.includes("说教姿态偏重")), false);
});
