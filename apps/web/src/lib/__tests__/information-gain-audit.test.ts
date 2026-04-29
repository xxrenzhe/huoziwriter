import assert from "node:assert/strict";
import test from "node:test";

import { auditInformationGain } from "../information-gain-audit";

test("auditInformationGain stays low risk when anchors are mixed", () => {
  const result = auditInformationGain({
    title: "AI 写作 workflow 的判断成本",
    markdown:
      "2024 年很多团队把 AI 写作 workflow 当成提效工具。我的判断是，真正贵的不是生成速度，而是判断责任。和旧流程相比，去年从“先出稿再审”切到“先定判断再调模型”之后，转化率没变，但返工次数明显下降。不过这条路也有代价：如果没有明确审稿人，流程只会更乱。这意味着工具提效不会自动替代判断责任。周三晚上 10 点，你盯着屏幕改第七版标题时，这个成本会非常具体。",
    fragments: ["周三晚上 10 点，你盯着屏幕改第七版标题。"],
    researchBrief: {
      timelineCards: [{ phase: "2024", summary: "团队开始系统化接入 AI 写作 workflow" }],
      comparisonCards: [{ subject: "旧流程", position: "先出稿再审", differences: ["返工更高"] }],
      intersectionInsights: [{ insight: "工具提效不会自动替代判断责任" }],
    },
    knowledgeCards: [{ title: "判断责任", status: "active", overturnedJudgements: [] }],
    historyReferences: [{ title: "AI 写作 workflow 里的责任回收点" }],
  });

  assert.equal(result.riskLevel, "low");
  assert.equal(result.issues.length, 0);
});

test("auditInformationGain flags missing anchors and research absorption", () => {
  const result = auditInformationGain({
    title: "AI 写作 workflow 的判断成本",
    markdown: "这篇文章会介绍 AI 写作 workflow 的重要性。首先要搭建流程，其次要准备素材，最后要持续优化。",
    fragments: ["周三晚上 10 点，你盯着屏幕改第七版标题。"],
    researchBrief: {
      timelineCards: [{ phase: "2024", summary: "团队开始系统化接入 AI 写作 workflow" }],
      comparisonCards: [{ subject: "旧流程", position: "先出稿再审", differences: ["返工更高"] }],
      intersectionInsights: [{ insight: "工具提效不会自动替代判断责任" }],
    },
    knowledgeCards: [{ title: "判断责任", status: "conflicted", overturnedJudgements: ["不是提效，而是责任再分配"] }],
    historyReferences: [{ title: "AI 写作 workflow 里的责任回收点" }],
  });

  assert.equal(result.riskLevel, "high");
  assert.ok(result.issues.some((item) => item.dimension === "factAnchor"));
  assert.ok(result.issues.some((item) => item.dimension === "comparison"));
  assert.match(result.correctionHint ?? "", /明确判断|数字|时间点|截图线索|可核对事实/);
});
