import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT,
  ARTICLE_VIRAL_NARRATIVE_SYSTEM_CONTRACT,
  buildArticlePromptQualityBrief,
} from "../article-prompt-quality-brief";

test("quality brief keeps missing research and human-signal gaps visible upstream", () => {
  const lines = buildArticlePromptQualityBrief("deepWriting", {
    materialRealityMode: "nonfiction",
    strategyCard: {
      mainstreamBelief: "很多人以为多写几个 Prompt 就能解决文章质量。",
      coreAssertion: "真正决定质量的是研究、张力和结构是否被前置编排。",
    },
    humanSignals: {
      score: 1,
      whyThisHitMe: "因为每次都在终稿阶段返工。",
    },
    researchBrief: {
      sourceCoverage: {
        sufficiency: "limited",
        missingCategories: ["用户源", "时间源"],
      },
      timelineCards: [],
      comparisonCards: [{ subject: "A", position: "B" }],
      intersectionInsights: [],
    },
    outlineSelection: {
      selectedTitle: "为什么内容流程真正卡住的，不是 Prompt",
      selectedOpeningHook: "先给判断，再拆卡点",
    },
  });

  assert.match(lines.join("\n"), /研究底座：信源覆盖=limited/);
  assert.match(lines.join("\n"), /缺口=用户源、时间源/);
  assert.match(lines.join("\n"), /不得伪造第一人称亲历/);
  assert.match(lines.join("\n"), /沿用已确认标题=为什么内容流程真正卡住的，不是 Prompt/);
});

test("quality brief allows real human signals but still forbids over-expansion", () => {
  const lines = buildArticlePromptQualityBrief("openingOptimization", {
    materialRealityMode: "nonfiction",
    strategyCard: {
      mainstreamBelief: "很多人以为 AI 写作的瓶颈只在模型。",
      coreAssertion: "真正拖慢成稿的是证据与节奏没有提前锁住。",
    },
    humanSignals: {
      score: 4,
      realSceneOrDialogue: "会上有人说，再把标题拉高一点。",
      firstHandObservation: "同一篇稿子在终稿前被改了七版开头。",
      feltMoment: "我当时第一反应不是继续写，而是停下来补证据。",
      nonDelegableTruth: "没有证据底座，再好的开头也接不住正文。",
    },
    researchBrief: {
      sourceCoverage: {
        sufficiency: "ready",
        missingCategories: [],
      },
      timelineCards: [{ phase: "起点" }],
      comparisonCards: [{ subject: "A", position: "B" }],
      intersectionInsights: [{ insight: "C" }],
    },
  });

  assert.match(lines.join("\n"), /当前可用 真实场景、第一手观察、体感瞬间、不能外包的真话/);
  assert.match(lines.join("\n"), /不得扩写成输入里不存在的细节/);
  assert.match(lines.join("\n"), /开头目标：前三秒先给读者处境、反差或判断/);
});

test("quality brief infers fiction only from explicit fictional framing", () => {
  const lines = buildArticlePromptQualityBrief("outlinePlanning", {
    articleTitle: "全员 token-maxxing，一场没人敢停的军备竞赛",
    strategyCard: {
      coreAssertion: "一个虚构团队在 AI 军备竞赛里被 token 成本拖进失控状态。",
    },
    humanSignals: {
      score: 0,
    },
    researchBrief: {
      sourceCoverage: {
        sufficiency: "blocked",
        missingCategories: ["用户源", "时间源"],
      },
    },
  });
  const text = lines.join("\n");

  assert.match(text, /素材现实模式：fiction/);
  assert.match(text, /当前写作系统默认按虚构类文章处理/);
  assert.match(text, /可以生成拟真的人物、对话、场景、组织细节和区间化数据/);
  assert.match(text, /真实素材不足时，用合理虚构细节补足场景密度/);
});

test("quality brief defaults to nonfiction and forbids unsupported named cases", () => {
  const lines = buildArticlePromptQualityBrief("deepWriting", {
    articleTitle: "谷歌搜索意图的本质",
    strategyCard: {
      coreAssertion: "搜索意图比关键词表层更能决定流量价值。",
    },
  });
  const text = lines.join("\n");

  assert.match(text, /素材现实模式：nonfiction/);
  assert.match(text, /fictionalMaterialPlan 必须为空数组/);
  assert.match(text, /不得引入素材、来源正文、研究简报或事实锚点中不存在的命名平台/);
});

test("quality brief front-loads viral narrative mechanics without permitting fake facts", () => {
  const lines = buildArticlePromptQualityBrief("deepWriting", {
    articleTitle: "全员 token-maxxing，一场没人敢停的军备竞赛",
    strategyCard: {
      coreAssertion: "把 AI 加速写成一个不断回收的母题。",
    },
  });
  const text = lines.join("\n");

  assert.match(text, /爆款叙事前置/);
  assert.match(text, /读者处境、真实锚点、事实和判断交替、情绪钩子和母题回收/);
  assert.match(text, /输出爆款叙事计划/);
  assert.match(ARTICLE_VIRAL_NARRATIVE_SYSTEM_CONTRACT, /第一人称或近距离现场感/);
  assert.match(ARTICLE_VIRAL_NARRATIVE_SYSTEM_CONTRACT, /复合、重构、假设、寓言或虚构口径/);
  assert.match(ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT, /爆款叙事六件套必须前置/);
  assert.match(ARTICLE_ARTIFACT_QUALITY_SYSTEM_CONTRACT, /不得编造真实主体的未证实行为/);
});
