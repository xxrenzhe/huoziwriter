import type { ArticleOutcomeBundle, ArticleStrategyCard } from "./repositories";

export const STRATEGY_ARCHETYPE_OPTIONS = [
  { key: "opinion", label: "观点评论", prototypeCode: "general", summary: "直接下判断，优先把立场打透。" },
  { key: "case", label: "案例故事", prototypeCode: "personal_narrative", summary: "围绕真实案例或经历推进判断。" },
  { key: "howto", label: "教程指南", prototypeCode: "methodology", summary: "把动作、方法和边界写清楚。" },
  { key: "hotTake", label: "热点评论", prototypeCode: "phenomenon_analysis", summary: "借热点切口，快速做判断与拆解。" },
  { key: "phenomenon", label: "现象解读", prototypeCode: "phenomenon_analysis", summary: "从现象往机制和结构走。" },
] as const;

export type StrategyArchetype = (typeof STRATEGY_ARCHETYPE_OPTIONS)[number]["key"];

export const ARTICLE_STRATEGY_FIELD_LABELS = {
  archetype: "主题原型",
  targetReader: "目标读者",
  coreAssertion: "核心判断",
  whyNow: "为何现在值得写",
  targetPackage: "目标包",
  publishWindow: "发布时间窗",
  endingAction: "结尾动作",
} as const;

export const ARTICLE_HUMAN_SIGNAL_FIELD_LABELS = {
  firstHandObservation: "第一手观察",
  feltMoment: "体感瞬间",
  whyThisHitMe: "为什么这事打到我",
  realSceneOrDialogue: "真实场景或对话",
  wantToComplain: "最想吐槽的点",
  nonDelegableTruth: "不能交给 AI 编的真话",
} as const;

export const FOUR_POINT_AUDIT_DIMENSIONS = [
  { key: "cognitiveFlip", label: "认知翻转" },
  { key: "readerSnapshot", label: "读者快照" },
  { key: "coreTension", label: "核心张力" },
  { key: "impactVector", label: "发力方向" },
] as const;

export type FourPointAuditDimension = (typeof FOUR_POINT_AUDIT_DIMENSIONS)[number]["key"];

type StrategyCardFieldsLike = Partial<
  Pick<
    ArticleStrategyCard,
    | "archetype"
    | "mainstreamBelief"
    | "targetReader"
    | "coreAssertion"
    | "whyNow"
    | "researchHypothesis"
    | "marketPositionInsight"
    | "historicalTurningPoint"
    | "targetPackage"
    | "publishWindow"
    | "endingAction"
    | "firstHandObservation"
    | "feltMoment"
    | "whyThisHitMe"
    | "realSceneOrDialogue"
    | "wantToComplain"
    | "nonDelegableTruth"
  >
>;

type StageArtifactLike = {
  stageCode: string;
  payload: Record<string, unknown> | null;
};

type SeriesInsightLike = {
  label: string | null;
  reason: string | null;
  whyNow: string[];
} | null;

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getStringArray(value: unknown, limit = 4) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function countSnapshotSignals(value: string) {
  let score = 0;
  if (/(周[一二三四五六日天]|早上|上午|中午|下午|晚上|凌晨|\d{1,2}\s*点|昨天|今天|那天|当时|最近|一次)/.test(value)) score += 1;
  if (/(办公室|工位|地铁|电梯|会议室|家里|咖啡馆|手机|微信|群里|现场|门口|复盘|后台|账户|词表|广告组|会议)/.test(value)) score += 1;
  if (/(说|回|问|盯着|点开|弹出|走进|坐着|改|查|翻|发来|看到|愣住|停住|想了|忍不住|解释不了)/.test(value)) score += 1;
  if (/(觉得|怀疑|犹豫|委屈|尴尬|兴奋|别扭|上头|烦|怕|不甘|不对劲|不舒服|刺眼|扎心|慌|卡住)/.test(value)) score += 1;
  return score;
}

function splitMeaningfulParts(value: string, limit = 3) {
  return value
    .split(/\n+|；|;/)
    .map((item) => item.replace(/^[\-*•\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function getLabeledTextValue(text: string, labels: string[]) {
  const lines = text
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  for (const line of lines) {
    for (const label of labels) {
      if (line.startsWith(`${label}：`) || line.startsWith(`${label}:`)) {
        return line.slice(label.length + 1).trim();
      }
    }
  }
  return "";
}

export function inferStrategyArchetype(input: {
  archetype?: string | null;
  coreAssertion?: string | null;
  title?: string | null;
  realSceneOrDialogue?: string | null;
  feltMoment?: string | null;
} | null | undefined): StrategyArchetype {
  const normalized = input ?? {};
  if (
    normalized.archetype === "opinion"
    || normalized.archetype === "case"
    || normalized.archetype === "howto"
    || normalized.archetype === "hotTake"
    || normalized.archetype === "phenomenon"
  ) {
    return normalized.archetype;
  }
  const seed = `${String(normalized.title || "")} ${String(normalized.coreAssertion || "")} ${String(normalized.realSceneOrDialogue || "")} ${String(normalized.feltMoment || "")}`;
  if (/(怎么做|步骤|方法|指南|教程|工作流)/.test(seed)) return "howto";
  if (/(案例|那天|经历|亲历|原话|对话|故事)/.test(seed)) return "case";
  if (/(热点|刷屏|热搜|这两天|刚刚|事件)/.test(seed)) return "hotTake";
  if (/(为什么|现象|背后|趋势|信号|结构)/.test(seed)) return "phenomenon";
  return "opinion";
}

export function buildFourPointAudit(strategyCard?: StrategyCardFieldsLike | null) {
  const mainstreamBelief = getString(strategyCard?.mainstreamBelief);
  const coreAssertion = getString(strategyCard?.coreAssertion);
  const whyThisHitMe = getString(strategyCard?.whyThisHitMe);
  const readerSnapshotText = [strategyCard?.realSceneOrDialogue, strategyCard?.feltMoment, strategyCard?.firstHandObservation]
    .map((item) => getString(item))
    .filter(Boolean)
    .join("；");
  const forceA = coreAssertion || mainstreamBelief || "作者判断还不够明确";
  const forceB = getString(strategyCard?.wantToComplain) || mainstreamBelief || "主流叙事还没有被明确点名";
  const pinnedMoment = getString(strategyCard?.feltMoment) || getString(strategyCard?.nonDelegableTruth) || getString(strategyCard?.realSceneOrDialogue);
  const cognitiveScore = clampScore((mainstreamBelief ? 2 : 0) + (coreAssertion ? 2 : 0) + (whyThisHitMe ? 1 : 0));
  const readerScore = clampScore((readerSnapshotText ? 1 : 0) + countSnapshotSignals(readerSnapshotText));
  const tensionScore = clampScore((forceA ? 2 : 0) + (forceB ? 2 : 0) + (forceA && forceB && forceA !== forceB ? 1 : 0));
  const impactScore = clampScore((pinnedMoment ? 3 : 0) + (getString(strategyCard?.nonDelegableTruth) ? 1 : 0) + (getString(strategyCard?.feltMoment) ? 1 : 0));
  return {
    runId: `local-${Date.now()}`,
    archetype: inferStrategyArchetype(strategyCard),
    cognitiveFlip: {
      score: cognitiveScore,
      notes: cognitiveScore >= 3 ? "主流认知与作者判断已经形成对照。" : "先补足“大众以为”和“你真正判断”的对照。",
      mainstreamSource: mainstreamBelief ? "author" : "ai-inferred",
    },
    readerSnapshot: {
      score: readerScore,
      notes: readerScore >= 3 ? "读者快照已经接近一个可拍成镜头的场景。" : "补足时间、地点、动作或即时心理，让读者快照更像镜头。",
      cinematizedText: readerSnapshotText,
    },
    coreTension: {
      score: tensionScore,
      notes: tensionScore >= 3 ? "文章内部的冲突两极已经可见。" : "把你反对的那一极说得更具体，别只保留单边情绪。",
      forceA,
      forceB,
    },
    impactVector: {
      score: impactScore,
      notes: impactScore >= 3 ? "已经有能带动正文的核弹头瞬间。" : "补一个不能被泛化替换的具体瞬间或真话。",
      pinnedMoment,
    },
    overallLockable: [cognitiveScore, readerScore, tensionScore, impactScore].every((score) => score >= 3),
    auditedAt: new Date().toISOString(),
  };
}

export function buildFourPointWritebackDrafts(strategyCard?: StrategyCardFieldsLike | null) {
  const mainstreamBelief = getString(strategyCard?.mainstreamBelief);
  const coreAssertion = getString(strategyCard?.coreAssertion);
  const realSceneOrDialogue = getString(strategyCard?.realSceneOrDialogue);
  const feltMoment = getString(strategyCard?.feltMoment);
  const firstHandObservation = getString(strategyCard?.firstHandObservation);
  const wantToComplain = getString(strategyCard?.wantToComplain);
  const nonDelegableTruth = getString(strategyCard?.nonDelegableTruth);
  return {
    cognitiveFlip: [mainstreamBelief ? `主流认知：${mainstreamBelief}` : "", coreAssertion ? `作者判断：${coreAssertion}` : ""].filter(Boolean).join("\n"),
    readerSnapshot: [
      realSceneOrDialogue ? `场景：${realSceneOrDialogue}` : "",
      feltMoment ? `体感：${feltMoment}` : "",
      firstHandObservation ? `观察：${firstHandObservation}` : "",
    ].filter(Boolean).join("\n"),
    coreTension: [coreAssertion ? `张力A：${coreAssertion}` : "", wantToComplain ? `张力B：${wantToComplain}` : ""].filter(Boolean).join("\n"),
    impactVector: [feltMoment ? `核弹头：${feltMoment}` : "", nonDelegableTruth ? `真话：${nonDelegableTruth}` : ""].filter(Boolean).join("\n"),
  } satisfies Record<FourPointAuditDimension, string>;
}

export function applyFourPointReverseWriteback(
  strategyCard: StrategyCardFieldsLike | null | undefined,
  input: {
    dimension: FourPointAuditDimension;
    text: string;
  },
) {
  const text = getString(input.text);
  const parts = splitMeaningfulParts(text, 3);
  if (!text) {
    return {} as Partial<StrategyCardFieldsLike>;
  }

  if (input.dimension === "cognitiveFlip") {
    const mainstreamBelief = getLabeledTextValue(text, ["主流认知", "大众以为", "主流看法"]) || parts[0] || getString(strategyCard?.mainstreamBelief);
    const coreAssertion = getLabeledTextValue(text, ["作者判断", "真正判断", "我的判断"]) || parts[1] || getString(strategyCard?.coreAssertion);
    return {
      mainstreamBelief: mainstreamBelief || null,
      coreAssertion: coreAssertion || null,
    } satisfies Partial<StrategyCardFieldsLike>;
  }

  if (input.dimension === "readerSnapshot") {
    const realSceneOrDialogue = getLabeledTextValue(text, ["场景", "镜头", "对话"]) || parts[0] || getString(strategyCard?.realSceneOrDialogue);
    const feltMoment = getLabeledTextValue(text, ["体感", "心理", "情绪"]) || parts[1] || getString(strategyCard?.feltMoment);
    const firstHandObservation = getLabeledTextValue(text, ["观察", "细节"]) || parts[2] || getString(strategyCard?.firstHandObservation);
    return {
      realSceneOrDialogue: realSceneOrDialogue || null,
      feltMoment: feltMoment || null,
      firstHandObservation: firstHandObservation || null,
    } satisfies Partial<StrategyCardFieldsLike>;
  }

  if (input.dimension === "coreTension") {
    const coreAssertion = getLabeledTextValue(text, ["张力A", "力量A", "判断侧"]) || parts[0] || getString(strategyCard?.coreAssertion);
    const wantToComplain = getLabeledTextValue(text, ["张力B", "力量B", "反对侧"]) || parts[1] || getString(strategyCard?.wantToComplain);
    return {
      coreAssertion: coreAssertion || null,
      wantToComplain: wantToComplain || null,
    } satisfies Partial<StrategyCardFieldsLike>;
  }

  const feltMoment = getLabeledTextValue(text, ["核弹头", "瞬间", "发力点"]) || parts[0] || getString(strategyCard?.feltMoment);
  const nonDelegableTruth = getLabeledTextValue(text, ["真话", "不能外包", "底牌"]) || parts[1] || getString(strategyCard?.nonDelegableTruth);
  return {
    feltMoment: feltMoment || null,
    nonDelegableTruth: nonDelegableTruth || null,
  } satisfies Partial<StrategyCardFieldsLike>;
}

export function hasStrategyLockInputsChanged(previous: StrategyCardFieldsLike | null | undefined, next: StrategyCardFieldsLike | null | undefined) {
  const trackedKeys: Array<keyof StrategyCardFieldsLike> = [
    "archetype",
    "mainstreamBelief",
    "targetReader",
    "coreAssertion",
    "whyNow",
    "researchHypothesis",
    "marketPositionInsight",
    "historicalTurningPoint",
    "targetPackage",
    "publishWindow",
    "endingAction",
    "firstHandObservation",
    "feltMoment",
    "whyThisHitMe",
    "realSceneOrDialogue",
    "wantToComplain",
    "nonDelegableTruth",
  ];
  return trackedKeys.some((key) => getString(previous?.[key]) !== getString(next?.[key]));
}

export function getStrategyCardCompletion(strategyCard: StrategyCardFieldsLike | null | undefined) {
  return {
    archetype: Boolean(getString(strategyCard?.archetype)),
    targetReader: Boolean(getString(strategyCard?.targetReader)),
    coreAssertion: Boolean(getString(strategyCard?.coreAssertion)),
    whyNow: Boolean(getString(strategyCard?.whyNow)),
    targetPackage: Boolean(getString(strategyCard?.targetPackage)),
    publishWindow: Boolean(getString(strategyCard?.publishWindow)),
    endingAction: Boolean(getString(strategyCard?.endingAction)),
  };
}

export function getStrategyCardMissingFields(strategyCard: StrategyCardFieldsLike | null | undefined) {
  const completion = getStrategyCardCompletion(strategyCard);
  return (Object.entries(ARTICLE_STRATEGY_FIELD_LABELS) as Array<[keyof typeof ARTICLE_STRATEGY_FIELD_LABELS, string]>)
    .filter(([key]) => !completion[key])
    .map(([, label]) => label);
}

export function isStrategyCardComplete(strategyCard: StrategyCardFieldsLike | null | undefined) {
  return getStrategyCardMissingFields(strategyCard).length === 0;
}

export function getHumanSignalCompletion(strategyCard: StrategyCardFieldsLike | null | undefined) {
  return {
    firstHandObservation: Boolean(getString(strategyCard?.firstHandObservation)),
    feltMoment: Boolean(getString(strategyCard?.feltMoment)),
    whyThisHitMe: Boolean(getString(strategyCard?.whyThisHitMe)),
    realSceneOrDialogue: Boolean(getString(strategyCard?.realSceneOrDialogue)),
    wantToComplain: Boolean(getString(strategyCard?.wantToComplain)),
    nonDelegableTruth: Boolean(getString(strategyCard?.nonDelegableTruth)),
  };
}

export function getHumanSignalScore(strategyCard: StrategyCardFieldsLike | null | undefined) {
  return Object.values(getHumanSignalCompletion(strategyCard)).filter(Boolean).length;
}

export function buildSuggestedStrategyCard(input: {
  strategyCard?: ArticleStrategyCard | null;
  stageArtifacts: StageArtifactLike[];
  seriesInsight: SeriesInsightLike;
  outcomeBundle?: ArticleOutcomeBundle | null;
}) {
  const researchArtifact = input.stageArtifacts.find((item) => item.stageCode === "researchBrief") ?? null;
  const audienceArtifact = input.stageArtifacts.find((item) => item.stageCode === "audienceAnalysis") ?? null;
  const outlineArtifact = input.stageArtifacts.find((item) => item.stageCode === "outlinePlanning") ?? null;
  const researchWriteback = getRecord(researchArtifact?.payload ? getRecord(researchArtifact.payload.strategyWriteback) : null);
  const researchInsights = getRecordArray(researchArtifact?.payload?.intersectionInsights).map((item) => getString(item.insight)).filter(Boolean);
  const audienceSelection = getRecord(audienceArtifact?.payload ? getRecord(audienceArtifact.payload.selection) : null);
  const outlineSelection = getRecord(outlineArtifact?.payload ? getRecord(outlineArtifact.payload.selection) : null);
  const whyNowHints = [...researchInsights.slice(0, 2), ...(input.seriesInsight?.whyNow ?? [])];
  const persisted = input.strategyCard ?? null;
  const archetype = persisted?.archetype ?? inferStrategyArchetype({
    coreAssertion: persisted?.coreAssertion ?? getString(researchWriteback?.coreAssertion) ?? getString(outlineArtifact?.payload?.centralThesis),
    title: getString(outlineArtifact?.payload?.selectedTitle) || getString(outlineArtifact?.payload?.title),
    realSceneOrDialogue: persisted?.realSceneOrDialogue,
    feltMoment: persisted?.feltMoment,
  });
  const mainstreamBelief = persisted?.mainstreamBelief ?? null;
  const targetReader =
    (persisted?.targetReader
    ?? getString(researchWriteback?.targetReader)
    ?? getString(audienceSelection?.selectedReaderLabel))
    || getString(audienceArtifact?.payload?.coreReaderLabel)
    || null;
  const coreAssertion =
    (persisted?.coreAssertion
    ?? getString(researchWriteback?.coreAssertion)
    ?? getString(outlineArtifact?.payload?.centralThesis))
    || null;
  const whyNow =
    (persisted?.whyNow
    ?? getString(researchWriteback?.whyNow)
    ?? whyNowHints.join("；"))
    || getString(input.seriesInsight?.reason)
    || null;
  const researchHypothesis =
    (persisted?.researchHypothesis
    ?? getString(researchWriteback?.researchHypothesis))
    || null;
  const marketPositionInsight =
    (persisted?.marketPositionInsight
    ?? getString(researchWriteback?.marketPositionInsight))
    || null;
  const historicalTurningPoint =
    (persisted?.historicalTurningPoint
    ?? getString(researchWriteback?.historicalTurningPoint))
    || null;
  const targetPackage =
    persisted?.targetPackage
    ?? input.outcomeBundle?.outcome?.targetPackage
    ?? null;
  const publishWindow = persisted?.publishWindow ?? null;
  const endingAction =
    (persisted?.endingAction
    ?? getString(audienceSelection?.selectedCallToAction))
    || getString(audienceArtifact?.payload?.recommendedCallToAction)
    || getString(outlineSelection?.selectedEndingStrategy)
    || getString(outlineArtifact?.payload?.endingStrategy)
    || null;
  const firstHandObservation = persisted?.firstHandObservation ?? null;
  const feltMoment = persisted?.feltMoment ?? null;
  const whyThisHitMe = persisted?.whyThisHitMe ?? null;
  const realSceneOrDialogue = persisted?.realSceneOrDialogue ?? null;
  const wantToComplain = persisted?.wantToComplain ?? null;
  const nonDelegableTruth = persisted?.nonDelegableTruth ?? null;
  const completion = getStrategyCardCompletion({
    archetype,
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
  });
  const fourPointAudit = persisted?.fourPointAudit ?? buildFourPointAudit({
    archetype,
    mainstreamBelief,
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
  });
  const humanSignalCompletion = getHumanSignalCompletion({
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
  });

  return {
    id: persisted?.id ?? 0,
    articleId: persisted?.articleId ?? 0,
    userId: persisted?.userId ?? 0,
    archetype,
    mainstreamBelief,
    targetReader,
    coreAssertion,
    whyNow,
    researchHypothesis,
    marketPositionInsight,
    historicalTurningPoint,
    targetPackage,
    publishWindow,
    endingAction,
    firstHandObservation,
    feltMoment,
    whyThisHitMe,
    realSceneOrDialogue,
    wantToComplain,
    nonDelegableTruth,
    fourPointAudit,
    strategyLockedAt: persisted?.strategyLockedAt ?? null,
    strategyOverride: persisted?.strategyOverride ?? false,
    createdAt: persisted?.createdAt ?? new Date().toISOString(),
    updatedAt: persisted?.updatedAt ?? new Date().toISOString(),
    completion,
    humanSignalCompletion,
    humanSignalScore: getHumanSignalScore({
      firstHandObservation,
      feltMoment,
      whyThisHitMe,
      realSceneOrDialogue,
      wantToComplain,
      nonDelegableTruth,
    }),
    whyNowHints: getStringArray(whyNowHints, 4),
  };
}
