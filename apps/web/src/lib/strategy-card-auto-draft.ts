import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { inferStrategyArchetype, STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import { loadPromptWithMeta, type PromptLoadContext } from "./prompt-loader";
import type { ArticleStrategyCard } from "./repositories";

type StrategyCardDraftField = keyof Pick<
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
>;

export type StrategyCardAutoDraft = Partial<Pick<ArticleStrategyCard, StrategyCardDraftField>>;

type StrategyCardAutoDraftInput = {
  title: string;
  summary?: string | null;
  sourceName?: string | null;
  chosenAngle?: string | null;
  recommendationReason?: string | null;
  sourceUrl?: string | null;
  readerSnapshotHint?: string | null;
  strategyCard?: StrategyCardAutoDraft | null;
  promptContext?: PromptLoadContext;
};

const VALID_ARCHETYPES = new Set(STRATEGY_ARCHETYPE_OPTIONS.map((item) => item.key));

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getText(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function getArchetype(value: unknown) {
  const normalized = getText(value);
  return normalized && VALID_ARCHETYPES.has(normalized as (typeof STRATEGY_ARCHETYPE_OPTIONS)[number]["key"])
    ? normalized as ArticleStrategyCard["archetype"]
    : null;
}

function compactDraft(input: StrategyCardAutoDraft) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  ) as StrategyCardAutoDraft;
}

export function buildFallbackStrategyCardAutoDraft(input: {
  title: string;
  strategyCard?: StrategyCardAutoDraft | null;
}) {
  const title = getText(input.title) || "当前选题";
  const titleLabel = title === "未命名稿件" ? "当前选题" : `「${title}」`;
  const existingDraft = compactDraft(input.strategyCard ?? {});

  return compactDraft({
    archetype:
      existingDraft.archetype
      ?? inferStrategyArchetype({
        archetype: existingDraft.archetype,
        title,
        coreAssertion: existingDraft.coreAssertion,
        realSceneOrDialogue: existingDraft.realSceneOrDialogue,
        feltMoment: existingDraft.feltMoment,
      }),
    mainstreamBelief:
      existingDraft.mainstreamBelief
      ?? `大多数人会把${titleLabel}当成一条表层信息，还没意识到它真正改写了什么判断。`,
    targetReader:
      existingDraft.targetReader
      ?? `已经被${titleLabel}触发关注，但还没形成稳定判断的读者。`,
    coreAssertion:
      existingDraft.coreAssertion
      ?? `${titleLabel}真正值得写的，不是重复消息本身，而是它暴露出的判断分水岭。`,
    whyNow:
      existingDraft.whyNow
      ?? `${titleLabel}正在发生，读者此刻需要一个可落地的判断框架。`,
    realSceneOrDialogue:
      existingDraft.realSceneOrDialogue
      ?? `读者刷到${titleLabel}时，第一反应往往还是沿用旧判断。`,
    feltMoment:
      existingDraft.feltMoment
      ?? `真正该抓住的瞬间，是你意识到旧判断已经不够用了。`,
    wantToComplain:
      existingDraft.wantToComplain
      ?? `最该反驳的是把${titleLabel}只当作一条普通消息。`,
    nonDelegableTruth:
      existingDraft.nonDelegableTruth
      ?? `${titleLabel}如果只停留在转述层，这篇文章就不会有真实发力点。`,
  });
}

export function normalizeStrategyCardAutoDraftPayload(payload: unknown): StrategyCardAutoDraft {
  const root = getRecord(payload);
  const source = getRecord(root?.strategyCard) ?? root ?? {};
  const draft: StrategyCardAutoDraft = {
    archetype: getArchetype(source.archetype) ?? undefined,
    mainstreamBelief: getText(source.mainstreamBelief) ?? undefined,
    targetReader: getText(source.targetReader) ?? undefined,
    coreAssertion: getText(source.coreAssertion) ?? undefined,
    whyNow: getText(source.whyNow) ?? undefined,
    researchHypothesis: getText(source.researchHypothesis) ?? undefined,
    marketPositionInsight: getText(source.marketPositionInsight) ?? undefined,
    historicalTurningPoint: getText(source.historicalTurningPoint) ?? undefined,
    targetPackage: getText(source.targetPackage) ?? undefined,
    publishWindow: getText(source.publishWindow) ?? undefined,
    endingAction: getText(source.endingAction) ?? undefined,
    firstHandObservation: getText(source.firstHandObservation) ?? undefined,
    feltMoment: getText(source.feltMoment) ?? undefined,
    whyThisHitMe: getText(source.whyThisHitMe) ?? undefined,
    realSceneOrDialogue: getText(source.realSceneOrDialogue) ?? undefined,
    wantToComplain: getText(source.wantToComplain) ?? undefined,
    nonDelegableTruth: getText(source.nonDelegableTruth) ?? undefined,
  };
  return compactDraft(draft);
}

export async function generateStrategyCardAutoDraft(input: StrategyCardAutoDraftInput): Promise<StrategyCardAutoDraft> {
  const promptMeta = await loadPromptWithMeta("strategyCard.autoDraft", input.promptContext);
  const systemPrompt = [
    promptMeta.content,
    "只返回 JSON 对象，不要 markdown，不要解释。",
    "字段仅允许使用：archetype、mainstreamBelief、targetReader、coreAssertion、whyNow、researchHypothesis、marketPositionInsight、historicalTurningPoint、targetPackage、publishWindow、endingAction、firstHandObservation、feltMoment、whyThisHitMe、realSceneOrDialogue、wantToComplain、nonDelegableTruth。",
    `archetype 只能是：${Array.from(VALID_ARCHETYPES).join(" / ")}。`,
    "如果某个字段无法可靠判断，就不要输出该字段。",
  ].join("\n");
  const existingDraft = compactDraft(input.strategyCard ?? {});
  const userPrompt = [
    `选题标题：${input.title}`,
    input.summary ? `选题摘要：${input.summary}` : null,
    input.sourceName ? `来源上下文：${input.sourceName}` : null,
    input.chosenAngle ? `切入角度：${input.chosenAngle}` : null,
    input.recommendationReason ? `推荐理由：${input.recommendationReason}` : null,
    input.readerSnapshotHint ? `读者快照提示：${input.readerSnapshotHint}` : null,
    input.sourceUrl ? `参考链接：${input.sourceUrl}` : null,
    Object.keys(existingDraft).length > 0 ? `已有策略草稿：${JSON.stringify(existingDraft)}` : null,
  ].filter(Boolean).join("\n");
  const result = await generateSceneText({
    sceneCode: "strategyCard.autoDraft",
    systemPrompt,
    userPrompt,
    temperature: 0.2,
  });
  return normalizeStrategyCardAutoDraftPayload(extractJsonObject(result.text));
}
