import type { ArticleOutcomeBundle, ArticleStrategyCard } from "./repositories";

export const ARTICLE_STRATEGY_FIELD_LABELS = {
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

type StrategyCardFieldsLike = Partial<
  Pick<
    ArticleStrategyCard,
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

export function getStrategyCardCompletion(strategyCard: StrategyCardFieldsLike | null | undefined) {
  return {
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
