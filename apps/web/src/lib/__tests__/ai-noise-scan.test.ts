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
  assert.equal(result.distantToneRisk, "low");
  assert.equal(result.findings.some((item) => item.includes("说教姿态偏重")), false);
});

test("analyzeAiNoise allows practical checklist when anchored in account scene", () => {
  const result = analyzeAiNoise([
    "# 搜索广告里最贵的不是错词",
    "",
    "复盘会里，老板盯预算，销售说这批人不像买家，投放还在解释搜索词报告。账户真正难受的地方，不是没人做动作，而是每个动作都绕开了需求阶段。",
    "",
    "## 今天回后台，先做这个动作",
    "",
    "- 把花费前 20 个搜索词拉出来，对照搜索词报告和销售反馈。",
    "- 更像查概念、查问题、查区别，先标“了解”。",
    "- 更像比方案、比价格、比品牌，先标“比较”。",
    "- 更像找报价、找联系、找服务入口，先标“行动”。",
    "- 标完阶段，再看落地页、表单和跟进方式有没有接住。",
    "",
    "这不是培训清单，而是为了让账户少把预算继续花在看起来准、当下却不该高价买的词上。",
  ].join("\n"));

  assert.notEqual(result.didacticToneRisk, "high");
  assert(result.readerClosenessCueCount >= 8);
});

test("analyzeAiNoise flags distant research-style expressions", () => {
  const result = analyzeAiNoise([
    "# 别再只盯关键词了：真正值钱的是搜索意图",
    "",
    "这种损失感很具体。很多旧解释就是从这里开始松动。",
    "",
    "搜索投放这些年的变化，也在把解释权往这里推。",
    "",
    "旧常识失效，往往不是因为工具没用，而是因为工具被推到了终局解释的位置。",
    "",
    "真正的分水岭，是需求阶段决定商业质量。",
  ].join("\n"));

  assert.equal(result.distantToneRisk, "high");
  assert(result.matchedDistantExpressionPhrases.includes("损失感"));
  assert(result.matchedDistantExpressionPhrases.includes("旧解释"));
  assert(result.findings.some((item) => item.includes("读者距离感偏重")));
  assert(result.suggestions.some((item) => item.includes("后台有点击但没有单")));
});
