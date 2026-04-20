import assert from "node:assert/strict";
import test from "node:test";

import type { RankedTopicRecommendation } from "../topic-recommendations";
import { buildLocalTopicFissionResult } from "../topic-fission";

function createTopic(): RankedTopicRecommendation {
  return {
    id: 1,
    ownerUserId: null,
    sourceName: "即刻热榜",
    sourceType: "news",
    sourcePriority: 10,
    title: "AI 代理开始改写内容团队协作",
    summary: "内容团队开始用 AI 代理拆研究、选题和分发链路。",
    emotionLabels: ["判断失效", "协作重排"],
    angleOptions: ["旧流程为什么开始失效", "谁会先被新的协作顺序淘汰"],
    sourceUrl: "https://example.com/topic",
    relatedSourceNames: [],
    relatedSourceUrls: [],
    publishedAt: null,
    recommendationType: "hot",
    recommendationReason: "平台热度正在转向 AI 驱动的内容协作方式。",
    matchedPersonaId: null,
    matchedPersonaName: "内容团队负责人",
    freshnessScore: 92,
    relevanceScore: 88,
    priorityScore: 90,
  };
}

test("buildLocalTopicFissionResult keeps a unified candidate shape across three modes", () => {
  const topic = createTopic();
  const modes = ["regularity", "contrast", "cross-domain"] as const;

  for (const mode of modes) {
    const result = buildLocalTopicFissionResult({
      topic,
      mode,
      knowledgeSamples: [
        {
          id: 1,
          title: "AI 写作工作流样本",
          summary: "团队从灵感驱动改成库存驱动。",
          sampleParagraph: "真正稳定的不是谁更勤奋，而是谁先把库存和判断线接起来。",
          trackLabel: "内容创作",
          hookTags: ["认知反转"],
        },
      ] as never,
    });

    assert.equal(result.mode, mode);
    assert.equal(result.topicId, topic.id);
    assert.ok(result.modeLabel.length > 0);
    assert.ok(result.signalGroups.length >= 2);
    assert.ok(result.candidates.length >= 3);

    for (const candidate of result.candidates) {
      assert.equal(candidate.fissionMode, mode);
      assert.equal(typeof candidate.title, "string");
      assert.equal(typeof candidate.description, "string");
      assert.equal(typeof candidate.targetReader, "string");
      assert.equal(typeof candidate.suggestedAngle, "string");
      assert.equal(typeof candidate.suggestedArchetype, "string");
      assert.equal(typeof candidate.suggestedCoreAssertion, "string");
      assert.equal(typeof candidate.suggestedMainstreamBelief, "string");
      assert.equal(typeof candidate.suggestedWhyNow, "string");
      assert.ok(candidate.title.length > 0);
      assert.ok(candidate.description.length > 0);
      assert.ok(candidate.targetReader.length > 0);
      assert.ok(candidate.suggestedAngle.length > 0);
      assert.ok(candidate.suggestedCoreAssertion.length > 0);
      assert.ok(candidate.suggestedMainstreamBelief.length > 0);
      assert.ok(candidate.suggestedWhyNow.length > 0);
      assert.ok(candidate.predictedFlipStrength >= 0 && candidate.predictedFlipStrength <= 5);
    }
  }
});
