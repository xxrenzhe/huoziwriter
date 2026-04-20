import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnowledgeIndexSignals,
  inferKnowledgeTrackLabel,
} from "../knowledge-indexing";

test("inferKnowledgeTrackLabel detects content creation track", () => {
  const track = inferKnowledgeTrackLabel({
    title: "公众号爆文为什么越来越像同一种写法",
    summary: "围绕选题、流量和传播机制的内容创作观察",
    fragments: [],
  });

  assert.equal(track, "内容创作");
});

test("buildKnowledgeIndexSignals derives hook tags and sample paragraph", () => {
  const signals = buildKnowledgeIndexSignals({
    title: "AI Agent 正在改写内容团队分工",
    summary: "不是单纯提效，而是大模型和 Agent 在重排判断权限",
    fragments: [
      {
        title: "周三晚上 10 点，Agent 还在帮你改第七版",
        distilled_content: "周三晚上 10 点，你还在工位盯着 Agent 改第七版标题，老板微信又弹出一句“再拉高一点”。",
        source_type: "url",
      },
      {
        title: "大众以为大模型只是提效工具",
        distilled_content: "大众以为大模型只是提效工具，其实它先改写的是谁有资格做判断。",
        source_type: "url",
      },
    ],
  });

  assert.equal(signals.trackLabel, "AI");
  assert.ok(signals.hookTags.includes("具身细节"));
  assert.ok(signals.hookTags.includes("反常识"));
  assert.match(signals.sampleParagraph ?? "", /周三晚上 10 点/);
});
