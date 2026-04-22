import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { buildGatewaySystemSegments } from "./ai-gateway-system-segments";
import { inferStrategyArchetype, STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import { loadPromptWithMeta, type PromptLoadContext } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
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

export function buildStrategyCardAutoDraftSystemSegments(input: {
  basePrompt: string;
  archetypeOptions: string;
}) {
  return buildGatewaySystemSegments([
    { text: input.basePrompt, cacheable: true },
    {
      text: [
        "只返回 JSON 对象，不要 markdown，不要解释。",
        "字段仅允许使用：archetype、mainstreamBelief、targetReader、coreAssertion、whyNow、researchHypothesis、marketPositionInsight、historicalTurningPoint、targetPackage、publishWindow、endingAction、firstHandObservation、feltMoment、whyThisHitMe、realSceneOrDialogue、wantToComplain、nonDelegableTruth。",
        formatPromptTemplate("archetype 只能是：{{archetypeOptions}}。", {
          archetypeOptions: input.archetypeOptions,
        }),
        "如果某个字段无法可靠判断，就不要输出该字段。",
      ].join("\n"),
      cacheable: true,
    },
  ]);
}

export function buildFallbackStrategyCardAutoDraft(input: {
  title: string;
  strategyCard?: StrategyCardAutoDraft | null;
}) {
  const title = getText(input.title) || "当前选题";
  const titleLabel = title === "未命名稿件"
    ? "当前选题"
    : formatPromptTemplate("「{{title}}」", {
      title,
    });
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
      ?? formatPromptTemplate("大多数人会把{{titleLabel}}当成一条表层信息，还没意识到它真正改写了什么判断。", {
        titleLabel,
      }),
    targetReader:
      existingDraft.targetReader
      ?? formatPromptTemplate("已经被{{titleLabel}}触发关注，但还没形成稳定判断的读者。", {
        titleLabel,
      }),
    coreAssertion:
      existingDraft.coreAssertion
      ?? formatPromptTemplate("{{titleLabel}}真正值得写的，不是重复消息本身，而是它暴露出的判断分水岭。", {
        titleLabel,
      }),
    whyNow:
      existingDraft.whyNow
      ?? formatPromptTemplate("{{titleLabel}}正在发生，读者此刻需要一个可落地的判断框架。", {
        titleLabel,
      }),
    realSceneOrDialogue:
      existingDraft.realSceneOrDialogue
      ?? formatPromptTemplate("读者刷到{{titleLabel}}时，第一反应往往还是沿用旧判断。", {
        titleLabel,
      }),
    feltMoment:
      existingDraft.feltMoment
      ?? `真正该抓住的瞬间，是你意识到旧判断已经不够用了。`,
    wantToComplain:
      existingDraft.wantToComplain
      ?? formatPromptTemplate("最该反驳的是把{{titleLabel}}只当作一条普通消息。", {
        titleLabel,
      }),
    nonDelegableTruth:
      existingDraft.nonDelegableTruth
      ?? formatPromptTemplate("{{titleLabel}}如果只停留在转述层，这篇文章就不会有真实发力点。", {
        titleLabel,
      }),
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
  const systemSegments = buildStrategyCardAutoDraftSystemSegments({
    basePrompt: promptMeta.content,
    archetypeOptions: Array.from(VALID_ARCHETYPES).join(" / "),
  });
  const existingDraft = compactDraft(input.strategyCard ?? {});
  const userPrompt = [
    formatPromptTemplate("选题标题：{{title}}", {
      title: input.title,
    }),
    input.summary
      ? formatPromptTemplate("选题摘要：{{summary}}", {
        summary: input.summary,
      })
      : null,
    input.sourceName
      ? formatPromptTemplate("来源上下文：{{sourceName}}", {
        sourceName: input.sourceName,
      })
      : null,
    input.chosenAngle
      ? formatPromptTemplate("切入角度：{{chosenAngle}}", {
        chosenAngle: input.chosenAngle,
      })
      : null,
    input.recommendationReason
      ? formatPromptTemplate("推荐理由：{{recommendationReason}}", {
        recommendationReason: input.recommendationReason,
      })
      : null,
    input.readerSnapshotHint
      ? formatPromptTemplate("读者快照提示：{{readerSnapshotHint}}", {
        readerSnapshotHint: input.readerSnapshotHint,
      })
      : null,
    input.sourceUrl
      ? formatPromptTemplate("参考链接：{{sourceUrl}}", {
        sourceUrl: input.sourceUrl,
      })
      : null,
    Object.keys(existingDraft).length > 0
      ? formatPromptTemplate("已有策略草稿：{{existingDraft}}", {
        existingDraft,
      })
      : null,
  ].filter(Boolean).join("\n");
  const result = await generateSceneText({
    sceneCode: "strategyCard.autoDraft",
    systemPrompt: promptMeta.content,
    systemSegments,
    userPrompt,
    temperature: 0.2,
    rolloutUserId: input.promptContext?.userId ?? null,
  });
  return normalizeStrategyCardAutoDraftPayload(extractJsonObject(result.text));
}
