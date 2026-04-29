import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceFragmentPromptSummary,
  buildXEvidencePromptLines,
  collectEvidenceFragmentFacts,
  normalizeFictionalMaterialItems,
  pickStricterResearchSufficiency,
} from "../article-stage-artifacts";

test("pickStricterResearchSufficiency keeps the more conservative research state", () => {
  assert.equal(pickStricterResearchSufficiency("ready", "limited"), "limited");
  assert.equal(pickStricterResearchSufficiency("limited", "blocked"), "blocked");
  assert.equal(pickStricterResearchSufficiency("ready", "ready"), "ready");
});

test("collectEvidenceFragmentFacts prefers localized fact points over broad summaries", () => {
  const facts = collectEvidenceFragmentFacts({
    distilledContent: "This article discusses distribution and pricing strategy in a broad way.",
    sourceMeta: {
      localization: {
        localizedSummary: "这篇材料解释了分发和定价的关系。",
        factPointsZh: [
          "作者把路径拆成获客、转化和留存三个阶段。",
          "案例里先验证付费意愿，再扩大分发。",
        ],
      },
    },
  });

  assert.deepEqual(facts, [
    "作者把路径拆成获客、转化和留存三个阶段。",
    "案例里先验证付费意愿，再扩大分发。",
  ]);
});

test("buildEvidenceFragmentPromptSummary keeps translation risk visible for downstream prompts", () => {
  const summary = buildEvidenceFragmentPromptSummary(
    {
      distilledContent: "The original article is optimistic about long-term income durability.",
      sourceMeta: {
        localization: {
          localizedSummary: "原文强调长期收入韧性，但主要基于单个案例。",
          translationRisk: "原文偏经验分享口吻，不能直接外推为行业普遍规律。",
        },
      },
    },
    { includeRisk: true },
  );

  assert.match(summary, /长期收入韧性/);
  assert.match(summary, /转述提醒/);
});

test("normalizeFictionalMaterialItems preserves usable fictional scene fields", () => {
  const items = normalizeFictionalMaterialItems([
    {
      kind: "scenario_reconstruction",
      title: "预算会议重构",
      purpose: "把成本压力场景化",
      setting: "会议室里，财务把 token 账单投到屏幕上。",
      role: "财务负责人",
      quote: "如果现在限额，谁来解释进度变慢？",
      metricRange: "月度成本从几万元跳到几十万元",
      anchor: "基于 AI 工具成本压力的常见组织情境",
      section: "中段",
      disclosure: "虚构组织场景，数字为叙事区间。",
    },
  ]);

  assert.equal(items[0]?.type, "scenario_reconstruction");
  assert.equal(items[0]?.label, "预算会议重构");
  assert.match(items[0]?.scene ?? "", /token 账单/);
  assert.match(items[0]?.dataRange ?? "", /几十万元/);
  assert.match(items[0]?.boundaryNote ?? "", /虚构组织场景/);
});

test("normalizeFictionalMaterialItems merges fallback when model output is too thin", () => {
  const items = normalizeFictionalMaterialItems(
    [
      {
        label: "单条弱素材",
        scene: "主角盯着任务列表发呆。",
      },
    ],
    [
      {
        label: "兜底素材",
        scene: "团队复盘会上，投影里只有一张不断上涨的成本表。",
        character: "增长负责人",
        dialogue: "我们不是没提效，只是不知道提效的钱去了哪里。",
        dataRange: "月度成本上涨一成到三成",
        plausibilityAnchor: "基于小团队工具成本压力的复合场景",
        boundaryNote: "虚构复合场景。",
      },
    ],
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.label, "单条弱素材");
  assert.equal(items[0]?.character, "增长负责人");
  assert.equal(items[1]?.label, "兜底素材");
});

test("buildXEvidencePromptLines gives title stage immediate conflict and numbers", () => {
  const lines = buildXEvidencePromptLines("titleOptimization", [
    {
      topic: "Anthropic ARR 反超 OpenAI",
      whyNow: "X 上的讨论已经从情绪转向收入与成本结构的正面比较。",
      originSignal: {
        firstBreakHandle: "NoLimitGains",
        firstBreakAt: "2026-04-29T08:00:00.000Z",
        firstBreakUrl: "https://x.com/example/1",
      },
      coreClaims: [
        {
          claim: "Anthropic 年化营收达到 300 亿美元。",
          sourceTier: "social",
          sourceLabel: "@NoLimitGains",
          sourceUrl: "https://x.com/example/1",
          confidence: "medium",
        },
      ],
      numberBoard: [
        {
          label: "帖子核心数字",
          value: "300 亿美元",
          sourceTier: "social",
          sourceLabel: "@NoLimitGains",
          sourceUrl: "https://x.com/example/1",
        },
      ],
      conflictBoard: [
        {
          sideA: "@NoLimitGains",
          sideB: "WSJ",
          sentence: "这不是普通增长新闻，而是 AI 龙头位置正在被公开重排。",
          evidenceRefs: ["https://x.com/example/1"],
        },
      ],
      quoteBoard: [
        {
          speaker: "@NoLimitGains",
          quoteStyle: "direct-short",
          content: "Anthropic just passed OpenAI in ARR.",
          sourceTier: "social",
          sourceUrl: "https://x.com/example/1",
        },
      ],
      audienceImpact: [
        {
          audience: "AI 产品从业者",
          impact: "需要重新判断企业端收入模式的护城河。",
          urgency: "high",
        },
      ],
      riskNotes: ["当前主要还是 X 信号，标题不能把未验证数字写成铁事实。"],
      verificationHits: [],
    },
  ]);

  const text = lines.join("\n");
  assert.match(text, /标题必须把变化对象、冲突双方或结果写出来/);
  assert.match(text, /关键数字：帖子核心数字：300 亿美元/);
  assert.match(text, /核心冲突：这不是普通增长新闻/);
});

test("buildXEvidencePromptLines gives deep writing stage quote, impact and risk boundary", () => {
  const lines = buildXEvidencePromptLines("deepWriting", [
    {
      topic: "副业赚钱话题",
      whyNow: "这条副业案例开始从晒结果转向讨论复制门槛。",
      originSignal: {
        firstBreakHandle: "CreatorThread",
        firstBreakAt: null,
        firstBreakUrl: "https://x.com/example/2",
      },
      coreClaims: [
        {
          claim: "案例收入主要来自联盟营销，而不是课程分销。",
          sourceTier: "social",
          sourceLabel: "@CreatorThread",
          sourceUrl: "https://x.com/example/2",
          confidence: "medium",
        },
      ],
      numberBoard: [],
      conflictBoard: [
        {
          sideA: "@CreatorThread",
          sideB: null,
          sentence: "争议点不在赚没赚钱，而在这是不是一个普通人也能复制的副业路径。",
          evidenceRefs: [],
        },
      ],
      quoteBoard: [
        {
          speaker: "@CreatorThread",
          quoteStyle: "direct-short",
          content: "Most people are copying the wrong part of the funnel.",
          sourceTier: "social",
          sourceUrl: "https://x.com/example/2",
        },
      ],
      audienceImpact: [
        {
          audience: "副业尝试者",
          impact: "要先分清结果截图和可复制路径是不是一回事。",
          urgency: "high",
        },
      ],
      riskNotes: ["目前缺少完整后台数据，正文要保留有限观察口径。"],
      verificationHits: [],
    },
  ]);

  const text = lines.join("\n");
  assert.match(text, /正文先把 X 现场当引爆点/);
  assert.match(text, /现场原话：@CreatorThread：Most people are copying the wrong part of the funnel\./);
  assert.match(text, /谁最受影响：副业尝试者：要先分清结果截图和可复制路径是不是一回事。/);
  assert.match(text, /事实边界：目前缺少完整后台数据/);
});
