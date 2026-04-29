import assert from "node:assert/strict";
import test from "node:test";

import { auditPersonaConsistency } from "../persona-consistency-audit";

const persona = {
  name: "判断型作者",
  summary: "先给判断，再往下拆原因。",
  writingStyleTags: ["观点", "评论"],
  argumentPreferences: ["先判断后论证"],
  toneConstraints: ["克制"],
  audienceHints: ["内容团队负责人"],
};

test("auditPersonaConsistency stays low risk for judgement-first writing", () => {
  const result = auditPersonaConsistency({
    title: "AI 写作 workflow 的判断成本",
    markdown: "我的判断是，AI 写作 workflow 最贵的不是生成速度，而是判断责任。真正的问题是，团队以为模型替他们做了决定，其实没有。",
    persona,
    strategyCard: { targetReader: "内容团队负责人" },
  });

  assert.equal(result?.riskLevel, "low");
  assert.equal(result?.issues.length, 0);
  assert.match(result?.summary ?? "", /仍基本贴合/);
});

test("auditPersonaConsistency flags generic tutorial drift", () => {
  const result = auditPersonaConsistency({
    title: "AI 写作 workflow 的判断成本",
    markdown:
      "本文将介绍 AI 写作 workflow。首先，你可以搭建一个流程。其次，你应该准备素材。最后，所有人都可以通过这套方法快速写作！",
    persona,
    strategyCard: { targetReader: "内容团队负责人" },
  });

  assert.equal(result?.riskLevel, "high");
  assert.ok((result?.issues.length ?? 0) >= 2);
  assert.equal(result?.issues[0]?.dimension, "stance");
  assert.match(result?.correctionHint ?? "", /开头先给作者判断|删掉/);
});
