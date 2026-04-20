import type { StrategyArchetype } from "./article-strategy";
import { safeRunImaFissionEngine } from "./ima-fission-engine";
import type { RankedTopicRecommendation } from "./topic-recommendations";

export type TopicFissionMode = "regularity" | "contrast" | "cross-domain";
export type TopicFissionEngine = "local" | "ima";

export type TopicFissionCorpusEvidence = {
  title: string;
  sourceUrl: string | null;
};

export type TopicFissionSignalGroup = {
  label: string;
  items: string[];
};

export type TopicFissionCandidate = {
  id: string;
  title: string;
  fissionMode: TopicFissionMode;
  modeLabel: string;
  targetReader: string;
  description: string;
  predictedFlipStrength: number;
  sourceTrackLabel: string;
  targetTrackLabel: string | null;
  suggestedAngle: string;
  suggestedArchetype: StrategyArchetype;
  suggestedCoreAssertion: string;
  suggestedMainstreamBelief: string;
  suggestedWhyNow: string;
  corpusEvidence?: TopicFissionCorpusEvidence[];
};

export type TopicFissionResult = {
  topicId: number;
  topicTitle: string;
  mode: TopicFissionMode;
  modeLabel: string;
  sourceTrackLabel: string;
  targetTrackLabel: string | null;
  signalGroups: TopicFissionSignalGroup[];
  candidates: TopicFissionCandidate[];
  engine?: TopicFissionEngine;
  degradedReason?: string | null;
};

const MODE_LABELS: Record<TopicFissionMode, string> = {
  regularity: "规律裂变",
  contrast: "差异化",
  "cross-domain": "跨赛道迁移",
};

const TRACK_RULES = [
  { label: "AI 提效", keywords: ["ai", "agent", "模型", "大模型", "自动化", "代码", "编程", "工作流", "copilot"] },
  { label: "内容增长", keywords: ["内容", "流量", "账号", "选题", "公众号", "小红书", "短视频", "创作"] },
  { label: "创业与 SaaS", keywords: ["创业", "融资", "saas", "订阅", "出海", "获客", "增长", "pmf"] },
  { label: "组织管理", keywords: ["组织", "裁员", "绩效", "团队", "管理", "岗位", "升职", "职场"] },
  { label: "电商经营", keywords: ["电商", "gmv", "投流", "直播", "供应链", "转化", "品牌"] },
  { label: "教育认知", keywords: ["教育", "学习", "课程", "训练", "老师", "认知", "培训"] },
];

const TRACK_READER_HINTS: Record<string, string> = {
  "AI 提效": "已经把 AI 工具接进工作流，但还没重写决策方式的创作者和产品人",
  "内容增长": "在平台流量波动里找稳定表达方式的内容创作者",
  "创业与 SaaS": "想把新变量转成增长与续费的独立开发者和创业者",
  "组织管理": "需要重写协作规则的一线管理者和核心执行者",
  "电商经营": "被投流与转化压力同时挤压的操盘手和品牌负责人",
  "教育认知": "想把知识和训练方法真正落到结果上的教育从业者",
  "通用议题": "已经知道这事重要，但还没把它变成判断动作的专业读者",
};

const TRACK_ARCHETYPE_HINTS: Record<string, StrategyArchetype> = {
  "AI 提效": "hotTake",
  "内容增长": "hotTake",
  "创业与 SaaS": "opinion",
  "组织管理": "phenomenon",
  "电商经营": "case",
  "教育认知": "howto",
  "通用议题": "phenomenon",
};

const CROSS_DOMAIN_TARGETS: Record<string, string> = {
  "AI 提效": "内容增长",
  "内容增长": "创业与 SaaS",
  "创业与 SaaS": "组织管理",
  "组织管理": "教育认知",
  "电商经营": "内容增长",
  "教育认知": "AI 提效",
  "通用议题": "内容增长",
};

function dedupe(items: Array<string | null | undefined>, limit = 6) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, limit);
}

function clampFlipStrength(value: number) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function getTopicText(topic: RankedTopicRecommendation) {
  return [
    topic.title,
    topic.summary || "",
    topic.recommendationReason || "",
    topic.matchedPersonaName || "",
    topic.emotionLabels.join(" "),
    topic.angleOptions.join(" "),
  ].join(" ");
}

function detectTrackLabel(topic: RankedTopicRecommendation) {
  const haystack = getTopicText(topic).toLowerCase();
  for (const rule of TRACK_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return rule.label;
    }
  }
  return "通用议题";
}

function deriveTargetReader(topic: RankedTopicRecommendation, trackLabel: string) {
  if (topic.matchedPersonaName) {
    return `${topic.matchedPersonaName}，尤其是那些已经感到旧判断开始失灵的人`;
  }
  return TRACK_READER_HINTS[trackLabel] ?? TRACK_READER_HINTS["通用议题"];
}

function deriveEmotion(topic: RankedTopicRecommendation) {
  return topic.emotionLabels[0] || "判断失效";
}

function deriveMainstreamBelief(topic: RankedTopicRecommendation, trackLabel: string) {
  const topicTitle = topic.title.replace(/[《》]/g, "");
  if (trackLabel === "AI 提效") {
    return `大众以为只要跟进 ${topicTitle} 这类新工具，效率自然会提升。`;
  }
  if (trackLabel === "内容增长") {
    return `大众以为 ${topicTitle} 这种热门话题，只要跟着平台热度写就能拿到结果。`;
  }
  if (trackLabel === "创业与 SaaS") {
    return `大众以为 ${topicTitle} 只是一波短期机会，先跟再说。`;
  }
  return `大众以为 ${topicTitle} 只是一个新热点，不值得重写底层判断。`;
}

function deriveWhyNow(topic: RankedTopicRecommendation, trackLabel: string) {
  const sourceName = topic.sourceName || "当前信号";
  if (trackLabel === "组织管理") {
    return `${sourceName} 这波变化已经开始影响岗位分工和协作顺序，现在不改判断，接下来会直接反噬执行质量。`;
  }
  if (trackLabel === "内容增长") {
    return `${sourceName} 给的是即时流量信号，但真正值得写的是平台热度背后正在重排的表达逻辑。`;
  }
  return `${sourceName} 不是单点新闻，而是结构变化的前哨。如果现在还沿用旧共识，接下来容易连续误判。`;
}

function deriveReferenceSignals(topic: RankedTopicRecommendation, trackLabel: string) {
  return dedupe([
    topic.recommendationReason,
    topic.summary,
    topic.angleOptions[0],
    `${trackLabel} 读者对“${deriveEmotion(topic)}”最敏感`,
  ], 4);
}

function getCrossDomainTargetTrack(trackLabel: string) {
  return CROSS_DOMAIN_TARGETS[trackLabel] ?? "内容增长";
}

function buildCandidate(input: {
  index: number;
  topic: RankedTopicRecommendation;
  mode: TopicFissionMode;
  title: string;
  description: string;
  targetReader: string;
  sourceTrackLabel: string;
  targetTrackLabel?: string | null;
  corpusEvidence?: TopicFissionCorpusEvidence[];
}) {
  const modeLabel = MODE_LABELS[input.mode];
  const topicTitle = input.topic.title.replace(/[《》]/g, "");
  const suggestedAngle =
    input.mode === "regularity"
      ? `从“旧判断为什么失效”切入，写清 ${input.targetReader} 在 ${topicTitle} 这类变化里最容易踩空的决策点。`
      : input.mode === "contrast"
        ? `不要复述大家都在写的表层热度，直接写 ${input.targetReader} 在 ${topicTitle} 这类话题里被忽略的真实代价。`
        : `先拆 ${input.sourceTrackLabel} 的传播基因，再解释它为什么能迁移到 ${input.targetTrackLabel || "新赛道"}。`;
  const suggestedMainstreamBelief = deriveMainstreamBelief(input.topic, input.sourceTrackLabel);
  const suggestedCoreAssertion =
    input.mode === "cross-domain"
      ? `${input.sourceTrackLabel} 里已经验证过的传播基因，正在 ${input.targetTrackLabel || "新赛道"} 里重演，但多数人还没意识到。`
      : `${input.title} 不是一个更花哨的选题，而是对 ${input.targetReader} 的旧判断做了一次强制翻面。`;
  const predictedFlipStrength = clampFlipStrength(
    (input.mode === "contrast" ? 4 : 3)
    + (input.mode === "cross-domain" ? 1 : 0)
    + (input.title.includes("不是") || input.title.includes("真正") ? 1 : 0),
  );

  return {
    id: `${input.mode}-${input.index + 1}`,
    title: input.title,
    fissionMode: input.mode,
    modeLabel,
    targetReader: input.targetReader,
    description: input.description,
    predictedFlipStrength,
    sourceTrackLabel: input.sourceTrackLabel,
    targetTrackLabel: input.targetTrackLabel ?? null,
    suggestedAngle,
    suggestedArchetype: TRACK_ARCHETYPE_HINTS[input.sourceTrackLabel] ?? TRACK_ARCHETYPE_HINTS["通用议题"],
    suggestedCoreAssertion,
    suggestedMainstreamBelief,
    suggestedWhyNow: deriveWhyNow(input.topic, input.sourceTrackLabel),
    corpusEvidence: input.corpusEvidence ?? [],
  } satisfies TopicFissionCandidate;
}

function buildRegularityResult(topic: RankedTopicRecommendation, sourceTrackLabel: string) {
  const targetReader = deriveTargetReader(topic, sourceTrackLabel);
  const emotion = deriveEmotion(topic);
  const topicTitle = topic.title.replace(/[《》]/g, "");
  const regularities = [
    `${sourceTrackLabel} 里最容易出爆点的，不是“发生了新事”，而是“原来默认做法开始失灵”。`,
    `读者真正会转发的点，不是工具或新闻本身，而是它如何重排自己的处境、身份和收益。`,
    `把“${emotion}”写成具体场景，通常比继续堆宏大判断更容易形成认知翻转。`,
  ];
  const candidates = [
    `大家都在追 ${topicTitle}，真正危险的是还按旧流程做决定的人`,
    `${topicTitle} 之后，最先掉队的不是慢的人，而是判断框架没更新的人`,
    `别再把 ${topicTitle} 写成趋势了，真正值得写的是谁会先被它重排`,
    `${topicTitle} 这波变化里，最容易被误伤的是那群“看起来最懂”的人`,
    `当 ${topicTitle} 成为共识，真正有价值的内容应该写哪些旧经验正在失效`,
    `${topicTitle} 带来的不是新机会清单，而是一轮身份与分工的重新洗牌`,
  ].map((title, index) =>
    buildCandidate({
      index,
      topic,
      mode: "regularity",
      title,
      description: `把 ${topicTitle} 从热点层往下压一层，写清 ${targetReader} 在这个节点最容易犯的旧判断，以及为什么现在必须重写动作顺序。`,
      targetReader,
      sourceTrackLabel,
    }),
  );

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    mode: "regularity",
    modeLabel: MODE_LABELS.regularity,
    sourceTrackLabel,
    targetTrackLabel: null,
    signalGroups: [
      { label: "赛道规律", items: regularities },
      { label: "参考信号", items: deriveReferenceSignals(topic, sourceTrackLabel) },
    ],
    candidates,
    engine: "local",
    degradedReason: null,
  } satisfies TopicFissionResult;
}

function buildContrastResult(topic: RankedTopicRecommendation, sourceTrackLabel: string) {
  const targetReader = deriveTargetReader(topic, sourceTrackLabel);
  const topicTitle = topic.title.replace(/[《》]/g, "");
  const staleAngles = [
    `继续复述 ${topicTitle} 是不是热点，以及谁先发布了消息。`,
    "把平台情绪当成完整判断，只写态度，不写结构变化。",
    "只拆表层玩法，不写这件事为什么改变了读者的风险和收益。",
  ];
  const freshAngles = [
    `把“谁看起来受益，实际上最焦虑”写出来。`,
    `把读者最想逃避但已经躲不过去的代价写具体。`,
    `不要比较谁做得快，改写成“谁还在用旧框架理解这件事”。`,
  ];
  const candidates = [
    `围绕 ${topicTitle}，最值得写的不是新机会，而是谁还在假装旧规则有效`,
    `大家都在夸 ${topicTitle} 的增量，真正该写的是哪类人开始失去安全感`,
    `${topicTitle} 被写烂了，真正稀缺的是把读者代价和误判路径讲明白`,
  ].map((title, index) =>
    buildCandidate({
      index,
      topic,
      mode: "contrast",
      title,
      description: `避开“热点复述”和“表层教程”，直接给 ${targetReader} 一个反常识切角：为什么真正值得警惕的，不是机会本身，而是旧判断还在惯性运行。`,
      targetReader,
      sourceTrackLabel,
    }),
  );

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    mode: "contrast",
    modeLabel: MODE_LABELS.contrast,
    sourceTrackLabel,
    targetTrackLabel: null,
    signalGroups: [
      { label: "被写烂的角度", items: staleAngles },
      { label: "值得深挖的新角度", items: freshAngles },
    ],
    candidates,
    engine: "local",
    degradedReason: null,
  } satisfies TopicFissionResult;
}

function buildCrossDomainResult(topic: RankedTopicRecommendation, sourceTrackLabel: string) {
  const targetTrackLabel = getCrossDomainTargetTrack(sourceTrackLabel);
  const targetReader = `${deriveTargetReader(topic, targetTrackLabel)}，尤其是正在把 ${sourceTrackLabel} 的方法借用到 ${targetTrackLabel} 的人`;
  const topicTitle = topic.title.replace(/[《》]/g, "");
  const transferGenes = [
    `认知钩子：不要只告诉读者“有新变量”，而是指出“旧判断为什么开始赔钱”。`,
    `情绪机制：把焦虑从抽象趋势改写成岗位、身份或收益的具体挤压感。`,
    `转发心理：读者愿意转发的不是结论，而是“这句话能替我解释当前处境”。`,
  ];
  const candidates = [
    `把 ${sourceTrackLabel} 里的“旧判断失效”基因，迁移到 ${targetTrackLabel} 会发生什么`,
    `${topicTitle} 给了 ${sourceTrackLabel} 一个强信号，但它真正能改写的是 ${targetTrackLabel} 的决策方式`,
    `在 ${targetTrackLabel} 里复用 ${sourceTrackLabel} 的爆点写法，最值得写的是哪类人先被迫转身`,
    `别把 ${sourceTrackLabel} 的传播逻辑留在原赛道，它已经在 ${targetTrackLabel} 开始兑现后果`,
  ].map((title, index) =>
    buildCandidate({
      index,
      topic,
      mode: "cross-domain",
      title,
      description: `先从 ${sourceTrackLabel} 提炼可迁移的传播基因，再把它平移到 ${targetTrackLabel}。文章重点不是类比本身，而是解释为什么 ${targetReader} 会比别人更早感受到这轮变化。`,
      targetReader,
      sourceTrackLabel,
      targetTrackLabel,
    }),
  );

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    mode: "cross-domain",
    modeLabel: MODE_LABELS["cross-domain"],
    sourceTrackLabel,
    targetTrackLabel,
    signalGroups: [
      { label: "可迁移的传播基因", items: transferGenes },
      { label: "参考信号", items: deriveReferenceSignals(topic, sourceTrackLabel) },
    ],
    candidates,
    engine: "local",
    degradedReason: null,
  } satisfies TopicFissionResult;
}

function generateLocalTopicFission(input: {
  topic: RankedTopicRecommendation;
  mode: TopicFissionMode;
}) {
  const sourceTrackLabel = detectTrackLabel(input.topic);
  if (input.mode === "regularity") {
    return buildRegularityResult(input.topic, sourceTrackLabel);
  }
  if (input.mode === "contrast") {
    return buildContrastResult(input.topic, sourceTrackLabel);
  }
  return buildCrossDomainResult(input.topic, sourceTrackLabel);
}

export async function generateTopicFission(input: {
  userId: number;
  topic: RankedTopicRecommendation;
  mode: TopicFissionMode;
  engine?: TopicFissionEngine;
}) {
  const sourceTrackLabel = detectTrackLabel(input.topic);
  if (input.engine === "ima") {
    try {
      return await safeRunImaFissionEngine({
        userId: input.userId,
        topic: input.topic,
        mode: input.mode,
        sourceTrackLabel,
        targetTrackLabel: input.mode === "cross-domain" ? getCrossDomainTargetTrack(sourceTrackLabel) : null,
        buildCandidate,
      });
    } catch (error) {
      const degraded = generateLocalTopicFission({
        topic: input.topic,
        mode: input.mode,
      });
      return {
        ...degraded,
        degradedReason: error instanceof Error ? error.message : "IMA 裂变失败，已降级到本地裂变",
      };
    }
  }
  return generateLocalTopicFission({
    topic: input.topic,
    mode: input.mode,
  });
}
