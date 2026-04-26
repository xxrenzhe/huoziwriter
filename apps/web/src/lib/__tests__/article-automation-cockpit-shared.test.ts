import assert from "node:assert/strict";
import test from "node:test";

import { buildStageDetailSections, getStageSearchMetrics, type AutomationStage } from "../../components/article-automation-cockpit-shared";

function createStage(input?: Partial<AutomationStage>): AutomationStage {
  return {
    stageCode: "researchBrief",
    promptId: "plan22.research",
    promptVersion: "v1",
    sceneCode: "researchBrief",
    provider: "openai",
    model: "gpt-5.4",
    status: "completed",
    inputJson: {},
    outputJson: {},
    qualityJson: {},
    searchTraceJson: {},
    errorCode: null,
    errorMessage: null,
    startedAt: "2026-04-25T10:00:00.000Z",
    completedAt: "2026-04-25T10:00:10.000Z",
    ...input,
  };
}

test("buildStageDetailSections summarizes research outputs and search trace", () => {
  const stage = createStage({
    outputJson: {
      queries: [
        { query: "AI 自动化写作", purpose: "自动补源" },
        { query: "公众号 草稿箱 自动化", purpose: "研究必查维度" },
      ],
      sources: [
        { label: "OpenAI Docs", sourceType: "official", sourceUrl: "https://platform.openai.com/docs/images" },
        { label: "SearXNG", sourceType: "search", detail: "JSON API", sourceUrl: "https://docs.searxng.org/dev/search_api.html" },
      ],
      evidenceGaps: ["最近 30 天真实案例不足"],
    },
    qualityJson: {
      artifactSummary: "已完成研究归并",
      promptVersionRefs: ["plan22.research@v1"],
    },
    searchTraceJson: {
      provider: "searxng",
      query: "AI 自动化写作",
      items: [
        { url: "https://platform.openai.com/docs/images" },
        { url: "https://docs.searxng.org/dev/search_api.html" },
      ],
    },
  });

  const sections = buildStageDetailSections(stage);
  const metrics = getStageSearchMetrics(stage);

  assert.equal(metrics?.queryCount, 1);
  assert.equal(metrics?.domainCount, 2);
  assert.equal(metrics?.urlCount, 2);
  assert(sections.some((section) => section.title === "研究查询" && section.items.some((item) => item.includes("AI 自动化写作"))));
  assert(sections.some((section) => section.title === "信源摘要" && section.items.some((item) => item.includes("platform.openai.com"))));
  assert(sections.some((section) => section.title === "质量记录" && section.items.some((item) => item.includes("plan22.research@v1"))));
  assert(sections.some((section) => section.title === "搜索轨迹" && section.items.some((item) => item.includes("域名 2 个"))));
});

test("buildStageDetailSections surfaces publish guard blockers and repair actions", () => {
  const stage = createStage({
    stageCode: "publishGuard",
    sceneCode: "publishGuard",
    outputJson: {
      blockers: ["缺少公众号连接"],
      warnings: ["封面图仍使用占位图"],
      repairActions: ["先补公众号连接后再推送草稿箱"],
      canPublish: false,
    },
  });

  const sections = buildStageDetailSections(stage);
  const publishGuard = sections.find((section) => section.title === "发布守门");

  assert(publishGuard);
  assert(publishGuard.items.some((item) => item.includes("阻塞：缺少公众号连接")));
  assert(publishGuard.items.some((item) => item.includes("修复：先补公众号连接后再推送草稿箱")));
  assert(publishGuard.items.some((item) => item.includes("可发布：否")));
});
