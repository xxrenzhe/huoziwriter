import { buildArchetypeRhythmHintText, type ArchetypeRhythmHints } from "./archetype-rhythm";
import { buildArticleViralBlueprint } from "./article-viral-blueprint";
import { resolveCreativeLens, type CreativeLensCode, type CreativeLensOption } from "./creative-lenses";

type HumanSignalsLike = {
  firstHandObservation?: string | null;
  feltMoment?: string | null;
  whyThisHitMe?: string | null;
  realSceneOrDialogue?: string | null;
  wantToComplain?: string | null;
  nonDelegableTruth?: string | null;
  score?: number | null;
} | null;

type WritingStyleProfileLike = {
  statePresets?: string[];
  antiOutlineRules?: string[];
  tabooPatterns?: string[];
  openingPatterns?: string[];
  endingPatterns?: string[];
  tangentPatterns?: string[];
  callbackPatterns?: string[];
  sentenceLengthProfile?: string | null;
  paragraphBreathingPattern?: string | null;
  factDensity?: string | null;
  emotionalIntensity?: string | null;
  reusablePromptFragments?: string[];
} | null;

type SeriesInsightLike = {
  label?: string | null;
  reason?: string | null;
  commonTerms?: string[];
  coreStances?: string[];
  whyNow?: string[];
} | null;

type ResearchBriefLike = {
  coreQuestion?: string | null;
  mustCoverAngles?: string[];
  timelineCards?: Array<{ phase?: string | null; title?: string | null; summary?: string | null }>;
  comparisonCards?: Array<{ subject?: string | null; position?: string | null; differences?: string[]; opportunities?: string[]; risks?: string[] }>;
  intersectionInsights?: Array<{ insight?: string | null; whyNow?: string | null; caution?: string | null }>;
  strategyWriteback?: {
    targetReader?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchHypothesis?: string | null;
    marketPositionInsight?: string | null;
    historicalTurningPoint?: string | null;
  } | null;
} | null;

type StrategyCardLike = {
  archetype?: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief?: string | null;
  targetReader?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
  researchHypothesis?: string | null;
  marketPositionInsight?: string | null;
  historicalTurningPoint?: string | null;
  endingAction?: string | null;
} | null;

export const WRITING_STATE_VARIANT_CODES = ["analytical", "animated", "sharp"] as const;
export const ARTICLE_PROTOTYPE_CODES = ["ordinary_breakthrough", "investigation", "product_walkthrough", "phenomenon_analysis", "tool_share", "methodology", "personal_narrative", "general"] as const;

export type WritingStateVariantCode = (typeof WRITING_STATE_VARIANT_CODES)[number];
export type ArticlePrototypeCode = (typeof ARTICLE_PROTOTYPE_CODES)[number];

export type ArticlePrototypeOption = {
  code: ArticlePrototypeCode;
  label: string;
  suitableWhen: string;
  triggerReason: string;
  openingMove: string;
  sectionRhythm: string;
  evidenceMode: string;
};

export type WritingStateOption = {
  code: WritingStateVariantCode;
  label: string;
  suitableWhen: string;
  triggerReason: string;
  narrativePosture: string;
  energyCurve: string;
  judgementStrength: string;
  humilityMode: string;
  openingBias: string;
  endingBias: string;
};

export type ProgressiveRevealStep = {
  label: string;
  instruction: string;
};

export type WritingStateKernel = {
  articlePrototype: ArticlePrototypeCode;
  articlePrototypeLabel: string;
  articlePrototypeReason: string;
  archetypeRhythmHint: string;
  creativeLensCode: CreativeLensCode;
  creativeLensLabel: string;
  creativeLensReason: string;
  creativeLensInstruction: string;
  stateVariantCode: WritingStateVariantCode;
  stateVariantLabel: string;
  stateVariantReason: string;
  narrativePosture: string;
  readerDistance: string;
  energyCurve: string;
  discoveryMode: string;
  tangentAllowance: string;
  breakPattern: string;
  callbackMode: string;
  judgementStrength: string;
  humilityMode: string;
  stopMode: string;
  emotionalTemperature: string;
  researchFocus: string;
  researchLens: string;
  openingMove: string;
  sectionRhythm: string;
  evidenceMode: string;
  progressiveRevealEnabled: boolean;
  progressiveRevealLabel: string;
  progressiveRevealReason: string;
  climaxPlacement: string;
  escalationRule: string;
  progressiveRevealSteps: ProgressiveRevealStep[];
  antiOutlineRules: string[];
  tabooPatterns: string[];
  stateChecklist: string[];
  prototypeOptions: ArticlePrototypeOption[];
  stateOptions: WritingStateOption[];
  creativeLensOptions: CreativeLensOption[];
};

function mapStrategyArchetypeToPrototype(archetype: NonNullable<StrategyCardLike>["archetype"]): ArticlePrototypeCode | null {
  if (archetype === "case") return "personal_narrative";
  if (archetype === "howto") return "methodology";
  if (archetype === "hotTake" || archetype === "phenomenon") return "phenomenon_analysis";
  if (archetype === "opinion") return "general";
  return null;
}

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function uniqueStrings(values: string[], limit?: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (limit && result.length >= limit) break;
  }
  return result;
}

function getPreferredResearchSignals(input: {
  strategyCard?: StrategyCardLike;
  researchBrief?: ResearchBriefLike;
}) {
  const researchWriteback = input.researchBrief?.strategyWriteback ?? null;
  return {
    targetReader:
      String(input.strategyCard?.targetReader || "").trim()
      || String(researchWriteback?.targetReader || "").trim(),
    coreAssertion:
      String(input.strategyCard?.coreAssertion || "").trim()
      || String(researchWriteback?.coreAssertion || "").trim(),
    whyNow:
      String(input.strategyCard?.whyNow || "").trim()
      || String(researchWriteback?.whyNow || "").trim()
      || String(input.strategyCard?.researchHypothesis || "").trim()
      || String(researchWriteback?.researchHypothesis || "").trim(),
    researchHypothesis:
      String(input.strategyCard?.researchHypothesis || "").trim()
      || String(researchWriteback?.researchHypothesis || "").trim(),
    marketPositionInsight:
      String(input.strategyCard?.marketPositionInsight || "").trim()
      || String(researchWriteback?.marketPositionInsight || "").trim(),
    historicalTurningPoint:
      String(input.strategyCard?.historicalTurningPoint || "").trim()
      || String(researchWriteback?.historicalTurningPoint || "").trim(),
  };
}

function getPrototypeBlueprint(prototype: WritingStateKernel["articlePrototype"]) {
  if (prototype === "ordinary_breakthrough") {
    return {
      label: "普通人逆袭型",
      suitableWhen: "适合写低起点身份借助工具、方法或关键机会，跑出超预期结果，并最终升维到公平、选择或机会结构的文章。",
      openingMove: "从强结果和低起点身份反差切入，立刻补可信来源，再说明这不是普通努力故事。",
      sectionRhythm: "按逆袭链推进：结果反差 -> 背景难度 -> 方法路径 -> 边界反转 -> 公共议题 -> 可转发收束。",
      evidenceMode: "优先放身份差、结果锚点、过程截图、工具名、练习量、人物原话和资源门槛，不把故事写成空泛励志。",
    };
  }
  if (prototype === "investigation") {
    return {
      label: "调查实验型",
      suitableWhen: "适合要验证一个说法、拆过程、看反证或交代试验链路的文章。",
      openingMove: "从一个异常、一次试验结果或前后反差切入，不先写背景概述。",
      sectionRhythm: "按发现链推进：现象 -> 拆解 -> 反证/代价 -> 判断。",
      evidenceMode: "优先使用对照、过程细节、时间点和真实观察，不用空泛概括顶替证据。",
    };
  }
  if (prototype === "product_walkthrough") {
    return {
      label: "产品体验型",
      suitableWhen: "适合围绕上手过程、使用手感、关键卡点和真实体验转折来展开。",
      openingMove: "从上手一刻的感受、卡点或惊喜开始，让读者先进入使用场景。",
      sectionRhythm: "按体验路径推进：进入场景 -> 关键操作 -> 转折感受 -> 适用边界。",
      evidenceMode: "优先放手感、界面反馈、前后对比和真实使用代价。",
    };
  }
  if (prototype === "phenomenon_analysis") {
    return {
      label: "现象解读型",
      suitableWhen: "适合解释一个刷屏现象、误读信号、趋势变化或角色分化。",
      openingMove: "从一个反常识信号、集体误读或突然刷屏的现象切入。",
      sectionRhythm: "按解释链推进：现象 -> 成因变量 -> 结构分化 -> 真实判断。",
      evidenceMode: "优先放趋势信号、角色关系和时间差，不把现象描述当结论。",
    };
  }
  if (prototype === "tool_share") {
    return {
      label: "工具分享型",
      suitableWhen: "适合围绕某个工具、模板或工作流，讲清它在什么场景下真有用。",
      openingMove: "先抛一个具体使用场景，再说这个工具到底解决了什么问题。",
      sectionRhythm: "按使用价值推进：问题 -> 用法 -> 限制 -> 什么时候值得上手。",
      evidenceMode: "优先放操作动作、产出变化和踩坑点，不写成产品介绍页。",
    };
  }
  if (prototype === "methodology") {
    return {
      label: "方法论分享型",
      suitableWhen: "适合把一套方法、动作或复盘心得讲清楚，并交代边界和例外。",
      openingMove: "从一个失败点、低效旧做法或刚想明白的动作开始，不摆老师姿态。",
      sectionRhythm: "按方法理解推进：问题 -> 原理 -> 动作 -> 边界与例外。",
      evidenceMode: "优先放步骤、失败成本和可复用动作，而不是抽象原则堆叠。",
    };
  }
  if (prototype === "personal_narrative") {
    return {
      label: "个人叙事型",
      suitableWhen: "适合从一次亲历、一次对话、一个体感瞬间或一段连续经历里长出判断。",
      openingMove: "从一个具体场景、一个动作或一句原话切进去，让读者先站到作者当时的位置上。",
      sectionRhythm: "按经历链推进：进入场景 -> 感受变化 -> 关键转折 -> 最后长出的判断。",
      evidenceMode: "优先放亲历细节、情绪变化和触发判断的关键瞬间，不要把叙事压成总结提纲。",
    };
  }
  return {
    label: "通用判断型",
    suitableWhen: "适合暂时还不属于明显固定题型，但已经有明确判断要推进的文章。",
    openingMove: "从最具体的冲突、变化或读者处境切入，不先搭宏大背景。",
    sectionRhythm: "按判断推进：冲突 -> 变量 -> 影响 -> 收束。",
    evidenceMode: "优先放能推动判断的事实锚点，避免并列罗列资料。",
  };
}

function buildPrototypeScoredOptions(input: {
  title: string;
  markdownContent?: string | null;
  humanSignals?: HumanSignalsLike;
  researchBrief?: ResearchBriefLike;
  strategyCard?: StrategyCardLike;
}) {
  const seed = `${input.title} ${input.markdownContent || ""} ${input.humanSignals?.firstHandObservation || ""} ${input.humanSignals?.realSceneOrDialogue || ""}`.toLowerCase();
  const viralBlueprint = buildArticleViralBlueprint({
    articleTitle: input.title,
    markdownContent: input.markdownContent,
    strategyCard: input.strategyCard,
    humanSignals: input.humanSignals,
    researchBrief: input.researchBrief as unknown as Record<string, unknown> | null,
  });
  const researchTimelineCount = Array.isArray(input.researchBrief?.timelineCards) ? input.researchBrief.timelineCards.length : 0;
  const researchComparisonCount = Array.isArray(input.researchBrief?.comparisonCards) ? input.researchBrief.comparisonCards.length : 0;
  const researchInsightCount = Array.isArray(input.researchBrief?.intersectionInsights) ? input.researchBrief.intersectionInsights.length : 0;
  const targetReader = String(input.strategyCard?.targetReader || "").trim();

  const scored = ARTICLE_PROTOTYPE_CODES.map((code) => {
    const blueprint = getPrototypeBlueprint(code);
    const score =
      (code === "product_walkthrough" && includesAny(seed, [/实测|体验|上手|用了|试了|开箱|测了/]) ? 6 : 0)
      + (code === "ordinary_breakthrough" && viralBlueprint.code === "ordinary_breakthrough" ? 10 : 0)
      + (code === "investigation" && viralBlueprint.code === "money_path" ? 8 : 0)
      + (code === "methodology" && viralBlueprint.code === "money_path" ? 5 : 0)
      + (code === "phenomenon_analysis" && viralBlueprint.code === "career_crossroads" ? 8 : 0)
      + (code === "personal_narrative" && viralBlueprint.code === "career_crossroads" ? 4 : 0)
      + (code === "product_walkthrough" && viralBlueprint.code === "ai_product_disruption" ? 8 : 0)
      + (code === "product_walkthrough" && includesAny(seed, [/ai\s*产品|ai产品|agent|智能体|saas|工作流|自动化|cursor|claude|openai|gemini/]) ? 7 : 0)
      + (code === "phenomenon_analysis" && viralBlueprint.code === "ai_product_disruption" ? 5 : 0)
      + (code === "investigation" && includesAny(seed, [/调查|实验|我去|我买了|我试着|亲手|踩坑|复盘过程/]) ? 6 : 0)
      + (code === "methodology" && includesAny(seed, [/方法|心得|怎么做|工作流|步骤|复盘方法/]) ? 6 : 0)
      + (code === "tool_share" && includesAny(seed, [/prompt|工具|神器|模板|工作流/]) ? 6 : 0)
      + (code === "phenomenon_analysis" && includesAny(seed, [/为什么|现象|背后|看起来|趋势|信号|刷屏/]) ? 6 : 0)
      + (code === "personal_narrative" && includesAny(seed, [/那天|有次|后来|当时|说实话|我自己|我那会|一开始|一句话|对话|经历|亲历|回头看/]) ? 6 : 0)
      + (code === "investigation" && researchTimelineCount > 0 ? 2 : 0)
      + (code === "phenomenon_analysis" && researchComparisonCount > 0 ? 2 : 0)
      + (code === "phenomenon_analysis" && researchInsightCount > 0 ? 2 : 0)
      + (code === "product_walkthrough" && Boolean(String(input.humanSignals?.firstHandObservation || "").trim()) ? 2 : 0)
      + (code === "methodology" && Boolean(String(input.humanSignals?.whyThisHitMe || "").trim()) ? 1 : 0)
      + (code === "personal_narrative" && Boolean(String(input.humanSignals?.realSceneOrDialogue || "").trim()) ? 3 : 0)
      + (code === "personal_narrative" && Boolean(String(input.humanSignals?.feltMoment || "").trim()) ? 2 : 0)
      + (code === "personal_narrative" && Boolean(String(input.humanSignals?.whyThisHitMe || "").trim()) ? 2 : 0)
      + (code === "general" ? 1 : 0);

    const triggerReason =
      code === "ordinary_breakthrough" && viralBlueprint.code === "ordinary_breakthrough"
        ? `爆文蓝图识别为「${viralBlueprint.label}」：${viralBlueprint.reason}`
        : code === "investigation" && viralBlueprint.code === "money_path"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：赚钱题材必须先把钱流、路径、成本和失败边界查清，适合按调查拆解推进。`
        : code === "methodology" && viralBlueprint.code === "money_path"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：如果素材足够明确，可转成低风险验证动作和方法论。`
        : code === "phenomenon_analysis" && viralBlueprint.code === "career_crossroads"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：职场题材必须先解释组织规则和角色分化。`
        : code === "personal_narrative" && viralBlueprint.code === "career_crossroads"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：如果有足够场景，可从一个职场瞬间长出判断。`
        : code === "product_walkthrough" && viralBlueprint.code === "ai_product_disruption"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：AI 产品题材必须落到具体工作流和使用场景。`
        : code === "product_walkthrough" && includesAny(seed, [/ai\s*产品|ai产品|agent|智能体|saas|工作流|自动化|cursor|claude|openai|gemini/])
          ? "当前题材涉及 AI 产品、智能体或工作流，优先落到具体使用场景和流程变化。"
        : code === "phenomenon_analysis" && viralBlueprint.code === "ai_product_disruption"
          ? `爆文蓝图识别为「${viralBlueprint.label}」：AI 产品变化也需要解释流程、成本和组织后果。`
        : code === "product_walkthrough" && includesAny(seed, [/实测|体验|上手|用了|试了|开箱|测了/])
        ? "标题、正文或人类信号里已经有明显上手 / 实测 / 体验线索。"
        : code === "investigation" && includesAny(seed, [/调查|实验|我去|我买了|我试着|亲手|踩坑|复盘过程/])
          ? "当前素材更像是在验证一个说法、复盘过程或交代试验链路。"
        : code === "methodology" && includesAny(seed, [/方法|心得|怎么做|工作流|步骤|复盘方法/])
          ? "当前题目明显在讲方法、动作或复盘逻辑。"
        : code === "tool_share" && includesAny(seed, [/prompt|工具|神器|模板|工作流/])
          ? "当前题目更像工具 / 模板 / 工作流分享，不适合写成纯评论。"
        : code === "phenomenon_analysis" && includesAny(seed, [/为什么|现象|背后|看起来|趋势|信号|刷屏/])
          ? "当前题目更像解释现象、误读或趋势变化。"
        : code === "personal_narrative" && includesAny(seed, [/那天|有次|后来|当时|说实话|我自己|我那会|一开始|一句话|对话|经历|亲历|回头看/])
          ? "当前素材更适合从亲历场景、情绪转折或一句原话里长出判断。"
        : code === "investigation" && researchTimelineCount > 0
          ? "研究层已经有时间脉络，适合按发现链推进。"
        : code === "phenomenon_analysis" && (researchComparisonCount > 0 || researchInsightCount > 0)
          ? "研究层已有比较或交汇洞察，适合先解读现象再收束判断。"
          : code === "personal_narrative" && Boolean(String(input.humanSignals?.realSceneOrDialogue || "").trim() || String(input.humanSignals?.feltMoment || "").trim())
            ? "当前人类信号里已有场景、原话或体感瞬间，适合按个人叙事推进。"
          : targetReader
            ? `当前先按更适合「${targetReader}」理解的题型组织。`
            : "当前没有特别强的题型锚点，先保留为通用判断型。";

    return {
      score,
      option: {
        code,
        label: blueprint.label,
        suitableWhen: blueprint.suitableWhen,
        triggerReason,
        openingMove: blueprint.openingMove,
        sectionRhythm: blueprint.sectionRhythm,
        evidenceMode: blueprint.evidenceMode,
      } satisfies ArticlePrototypeOption,
    };
  });

  return scored
    .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label, "zh-CN"))
    .map((item) => item.option);
}

function buildVariantScoredOptions(input: {
  prototype: WritingStateKernel["articlePrototype"];
  humanSignals?: HumanSignalsLike;
  writingStyleProfile?: WritingStyleProfileLike;
}) {
  const presetText = (input.writingStyleProfile?.statePresets ?? []).join(" ");
  const humanText = [
    input.humanSignals?.feltMoment,
    input.humanSignals?.wantToComplain,
    input.humanSignals?.nonDelegableTruth,
    input.humanSignals?.firstHandObservation,
  ].join(" ");
  const humanScore = Number(input.humanSignals?.score || 0);
  const hasComplaint = Boolean(String(input.humanSignals?.wantToComplain || "").trim() || String(input.humanSignals?.nonDelegableTruth || "").trim());
  const hasExcitement = /兴奋|上头|来劲|惊到|爽|激动|好用|想分享/.test(humanText);
  const prefersAnalytical = /克制|分析|冷静|拆解|判断|不端着/.test(presetText);
  const prefersAnimated = /分享|熟人|兴奋|来劲|上头|边讲边想/.test(presetText);
  const prefersSharp = /尖锐|不服|吐槽|反驳|火气|锋利/.test(presetText);

  const scored = [
    {
      score:
        (input.prototype === "methodology" || input.prototype === "phenomenon_analysis" || input.prototype === "general" ? 3 : 0)
        + (humanScore < 3 ? 2 : 0)
        + (prefersAnalytical ? 2 : 0),
      option: {
        code: "analytical" as const,
        label: "克制分析态",
        suitableWhen: "适合要把复杂问题拆清楚、又不想写成讲义的时候。",
        triggerReason: prefersAnalytical
          ? "文风资产本身偏克制分析。"
          : humanScore < 3
            ? "当前人类信号还不够厚，先用克制分析态稳住判断和节奏。"
            : "当前题型更适合用冷静拆解推进判断。",
        narrativePosture: "像作者把复杂问题拆给熟人听，判断清楚，但不端着讲课。",
        energyCurve: "前段稳住问题框架，中段逐层拆变量，结尾收成一个清楚判断。",
        judgementStrength: "判断明确，但尽量让事实先撑住语气，不用喊口号。",
        humilityMode: "保留不确定和边界提醒，避免全知结论腔。",
        openingBias: "开头先给问题切口或反常识判断，再迅速补事实。",
        endingBias: "结尾停在判断或标准上，不额外升华。",
      },
    },
    {
      score:
        (input.prototype === "product_walkthrough" || input.prototype === "tool_share" || input.prototype === "personal_narrative" ? 3 : 0)
        + (String(input.humanSignals?.firstHandObservation || "").trim() ? 2 : 0)
        + (hasExcitement ? 2 : 0)
        + (prefersAnimated ? 2 : 0),
      option: {
        code: "animated" as const,
        label: "兴奋分享态",
        suitableWhen: "适合作者刚试明白一件事，想把发现快速讲给读者的时候。",
        triggerReason: hasExcitement
          ? "人类信号里已经有明显体感和分享冲动。"
          : prefersAnimated
            ? "文风资产更适合带着呼吸感和分享感推进。"
            : "当前题型天然适合从体验和发现往前推。",
        narrativePosture: "像作者刚试出结果，压着兴奋但不失控地和熟人分享。",
        energyCurve: "起手抓场景，中段越写越来劲，后段收成清楚建议或边界。",
        judgementStrength: "判断可以更直接，但每次来劲都要拿体验或事实接住。",
        humilityMode: "允许兴奋，但别把个人感受包装成普适真理。",
        openingBias: "开头优先写一个上手瞬间、惊讶点或体感变化。",
        endingBias: "结尾收在一个值得试、值得防或值得继续观察的动作上。",
      },
    },
    {
      score:
        (input.prototype === "investigation" || input.prototype === "phenomenon_analysis" || input.prototype === "personal_narrative" ? 3 : 0)
        + (hasComplaint ? 3 : 0)
        + (prefersSharp ? 2 : 0),
      option: {
        code: "sharp" as const,
        label: "尖锐评论态",
        suitableWhen: "适合作者有明确不服点、要拆误读或戳破体面套话的时候。",
        triggerReason: hasComplaint
          ? "作者已经给出了明确吐槽点或不能让 AI 代写的真话。"
          : prefersSharp
            ? "文风资产里有更锋利的判断倾向。"
            : "当前题型适合直接拆误读、打假象或压缩套话空间。",
        narrativePosture: "像作者带着火气拆误读，句子更锋利，但每刀都对准事实。",
        energyCurve: "前段先戳破表象，中段持续加压，结尾收成清楚立场和代价判断。",
        judgementStrength: "判断要更硬，但必须让证据和逻辑承担锋利度。",
        humilityMode: "可以尖锐，但别靠嘲讽顶替论证。",
        openingBias: "开头直接挑明误读、伪问题或最值得拆掉的说法。",
        endingBias: "结尾停在代价、判断或不可回避的现实，不做情绪喊话。",
      },
    },
  ];

  return scored
    .sort((left, right) => right.score - left.score || left.option.label.localeCompare(right.option.label, "zh-CN"))
    .map((item) => item.option);
}

function buildProgressiveRevealPlan(input: {
  prototype: WritingStateKernel["articlePrototype"];
  variantCode: WritingStateVariantCode;
  humanSignals?: HumanSignalsLike;
}) {
  const hasFirstHandObservation = Boolean(String(input.humanSignals?.firstHandObservation || "").trim() || String(input.humanSignals?.realSceneOrDialogue || "").trim());
  const hasComplaint = Boolean(String(input.humanSignals?.wantToComplain || "").trim() || String(input.humanSignals?.nonDelegableTruth || "").trim());
  const enabled =
    input.prototype === "ordinary_breakthrough"
    || input.prototype === "investigation"
    || input.prototype === "product_walkthrough"
    || input.prototype === "tool_share"
    || input.prototype === "personal_narrative"
    || (input.prototype === "phenomenon_analysis" && input.variantCode === "sharp");

  if (!enabled) {
    return {
      enabled: false,
      label: "直接判断推进",
      reason: input.prototype === "methodology"
        ? "方法类文章更适合先把动作和原理讲清楚，不需要刻意藏后手。"
        : "当前题型更适合直接把核心判断说清楚，再补证据。",
      climaxPlacement: "核心判断可以在前半段亮出，不必刻意后置。",
      escalationRule: "如果没有连续样本或递进证据，就不要硬造升番结构。",
      steps: [
        {
          label: "起手亮判断",
          instruction: "开头直接给问题切口或判断，不先写长铺垫。",
        },
        {
          label: "中段补证据",
          instruction: "中段把关键事实和变量讲透，避免信息并列。",
        },
        {
          label: "结尾收动作",
          instruction: "结尾停在动作、标准或代价判断上，不做摘要。",
        },
      ] satisfies ProgressiveRevealStep[],
    };
  }

  return {
    enabled: true,
    label: "逐一展示 / 升番",
    reason:
      input.prototype === "investigation"
        ? "调查实验型最适合按发现链逐步加码，把最强发现留到后面。"
        : input.prototype === "ordinary_breakthrough"
          ? "普通人逆袭型必须先让读者看到结果反差，再逐步揭示路径、边界和公共议题，不能一开始就写成道理。"
        : input.prototype === "product_walkthrough"
          ? "体验型文章更适合边上手边升级感受，不要一开始就把所有结论讲完。"
          : input.prototype === "tool_share"
            ? "工具分享型适合先放普通收益，再放真正让人记住的高价值场景。"
            : input.prototype === "personal_narrative"
              ? "个人叙事型适合先放普通情境，再逐层推进到真正改变判断的那个瞬间。"
            : hasComplaint
              ? "当前有明确吐槽点，适合先拆表象，再逐层把最锋利的判断压上去。"
              : "当前题型适合分阶段放证据，让读者跟着发现一路往上走。",
    climaxPlacement: hasFirstHandObservation
      ? "把最强的亲历细节、最反常的样本或最炸的发现放到后 1/3，再接硬判断。"
      : "把最强反差、最关键对照或最不容易反驳的一层证据放到后 1/3。",
    escalationRule: "先放读者熟悉的样本或普通发现，再逐层加码；每升一层都要更具体、更反常或更有代价感，不能只换说法。",
    steps: [
      {
        label: "先放普通样本",
        instruction: "开头先放读者能立刻理解的场景、样本或低烈度发现，不一次把最炸的点说完。",
      },
      {
        label: "中段逐层加码",
        instruction: "中段每推进一节都要比上一节更具体、更有代价或更反常，形成可感知的升级。",
      },
      {
        label: "后段亮最强发现",
        instruction: "把最强证据、最痛的反例或最能定论的发现放在后 1/3，再接最终判断。",
      },
    ] satisfies ProgressiveRevealStep[],
  };
}

export function resolveArticlePrototype(input: {
  title: string;
  markdownContent?: string | null;
  humanSignals?: HumanSignalsLike;
}) {
  const seed = `${input.title} ${input.markdownContent || ""} ${input.humanSignals?.firstHandObservation || ""} ${input.humanSignals?.realSceneOrDialogue || ""}`.toLowerCase();
  const viralBlueprintCode = buildArticleViralBlueprint({
    articleTitle: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
  }).code;
  if (viralBlueprintCode === "ordinary_breakthrough") return "ordinary_breakthrough";
  if (viralBlueprintCode === "money_path") return "investigation";
  if (viralBlueprintCode === "career_crossroads") return "phenomenon_analysis";
  if (viralBlueprintCode === "ai_product_disruption") return "product_walkthrough";
  if (includesAny(seed, [/实测|体验|上手|用了|试了|开箱|测了/])) return "product_walkthrough";
  if (includesAny(seed, [/调查|实验|我去|我买了|我试着|亲手|踩坑|复盘过程/])) return "investigation";
  if (includesAny(seed, [/那天|有次|后来|当时|说实话|我自己|我那会|一开始|一句话|对话|经历|亲历|回头看/])) return "personal_narrative";
  if (includesAny(seed, [/方法|心得|怎么做|工作流|步骤|复盘方法/])) return "methodology";
  if (includesAny(seed, [/prompt|工具|神器|模板|工作流/])) return "tool_share";
  if (includesAny(seed, [/为什么|现象|背后|看起来|趋势|信号|刷屏/])) return "phenomenon_analysis";
  return "general";
}

export function buildWritingStateKernel(input: {
  title: string;
  markdownContent?: string | null;
  humanSignals?: HumanSignalsLike;
  writingStyleProfile?: WritingStyleProfileLike;
  seriesInsight?: SeriesInsightLike;
  researchBrief?: ResearchBriefLike;
  strategyCard?: StrategyCardLike;
  archetypeRhythmHints?: ArchetypeRhythmHints | null;
  preferredPrototypeCode?: ArticlePrototypeCode | null;
  preferredVariantCode?: WritingStateVariantCode | null;
  preferredCreativeLensCode?: CreativeLensCode | null;
}): WritingStateKernel {
  const strategyMappedPrototype = mapStrategyArchetypeToPrototype(input.strategyCard?.archetype);
  const prototypeOptions = buildPrototypeScoredOptions({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
  });
  const recommendedPrototype = prototypeOptions[0];
  const resolvedPreferredPrototypeCode = input.preferredPrototypeCode ?? strategyMappedPrototype;
  const preferredPrototype = resolvedPreferredPrototypeCode
    ? prototypeOptions.find((item) => item.code === resolvedPreferredPrototypeCode) ?? null
    : null;
  const selectedPrototype = preferredPrototype ?? recommendedPrototype;
  const prototype = selectedPrototype.code;
  const prototypeBlueprint = getPrototypeBlueprint(prototype);
  const viralBlueprint = buildArticleViralBlueprint({
    articleTitle: input.title,
    markdownContent: input.markdownContent,
    strategyCard: input.strategyCard,
    humanSignals: input.humanSignals,
    researchBrief: input.researchBrief as unknown as Record<string, unknown> | null,
  });
  const archetypeRhythmHint = input.archetypeRhythmHints ? buildArchetypeRhythmHintText(input.archetypeRhythmHints) : "";
  const articlePrototypeReason =
    preferredPrototype && recommendedPrototype && preferredPrototype.code !== recommendedPrototype.code
      ? `${
        input.preferredPrototypeCode
          ? `已手动切换到「${preferredPrototype.label}」。`
          : `策略卡原型已指定为「${String(input.strategyCard?.archetype || "").trim() || preferredPrototype.label}」，优先映射到「${preferredPrototype.label}」。`
      }系统默认推荐是「${recommendedPrototype.label}」；本次切换依据：${preferredPrototype.triggerReason}`
      : selectedPrototype.triggerReason;
  const humanScore = Number(input.humanSignals?.score || 0);
  const hasRealScene = Boolean(String(input.humanSignals?.realSceneOrDialogue || "").trim() || String(input.humanSignals?.firstHandObservation || "").trim());
  const researchTimelineCount = Array.isArray(input.researchBrief?.timelineCards) ? input.researchBrief.timelineCards.length : 0;
  const researchComparisonCount = Array.isArray(input.researchBrief?.comparisonCards) ? input.researchBrief.comparisonCards.length : 0;
  const researchInsightItems = Array.isArray(input.researchBrief?.intersectionInsights) ? input.researchBrief.intersectionInsights : [];
  const researchWriteback = input.researchBrief?.strategyWriteback ?? null;
  const preferredResearchSignals = getPreferredResearchSignals({
    strategyCard: input.strategyCard,
    researchBrief: input.researchBrief,
  });
  const strongestResearchInsight =
    preferredResearchSignals.marketPositionInsight
    || preferredResearchSignals.researchHypothesis
    || researchInsightItems.map((item) => String(item?.insight || "").trim()).find(Boolean)
    || preferredResearchSignals.historicalTurningPoint
    || String(researchWriteback?.marketPositionInsight || "").trim()
    || String(researchWriteback?.historicalTurningPoint || "").trim();
  const researchCoreQuestion = String(input.researchBrief?.coreQuestion || "").trim();
  const researchWhyNow =
    preferredResearchSignals.whyNow
    || researchInsightItems.map((item) => String(item?.whyNow || "").trim()).find(Boolean)
    || input.seriesInsight?.whyNow?.[0]
    || "";
  const stateOptions = buildVariantScoredOptions({
    prototype,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
  });
  const recommendedVariant = stateOptions[0];
  const preferredVariant = input.preferredVariantCode
    ? stateOptions.find((item) => item.code === input.preferredVariantCode) ?? null
    : null;
  const selectedVariant = preferredVariant ?? recommendedVariant;
  const stateVariantReason =
    preferredVariant && recommendedVariant && preferredVariant.code !== recommendedVariant.code
      ? `已手动切换到「${preferredVariant.label}」。系统默认推荐是「${recommendedVariant.label}」；本次切换依据：${preferredVariant.triggerReason}`
      : selectedVariant.triggerReason;
  const progressiveReveal = buildProgressiveRevealPlan({
    prototype,
    variantCode: selectedVariant.code,
    humanSignals: input.humanSignals,
  });
  const creativeLensResult = resolveCreativeLens({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    articlePrototype: prototype,
    preferredLensCode: input.preferredCreativeLensCode,
  });
  const creativeLens = creativeLensResult.selected;
  const creativeLensInstruction = [
    `创意镜头：${creativeLens.label}（${creativeLens.code}）`,
    `推荐原因：${creativeLens.triggerReason}`,
    `叙述姿态：${creativeLens.narrativePosture}`,
    `读者距离：${creativeLens.readerDistance}`,
    `判断强度：${creativeLens.judgementStrength}`,
    `证据偏好：${creativeLens.evidenceMode}`,
  ].join("；");

  const narrativePosture =
    humanScore >= 3
      ? `${input.archetypeRhythmHints ? `默认叙事姿态是「${input.archetypeRhythmHints.narrativeStance}」。` : ""}${selectedVariant.narrativePosture} 作者手里已经有足够体感和现场感，可以把“我为什么这么判断”说透。`
      : `${input.archetypeRhythmHints ? `默认叙事姿态是「${input.archetypeRhythmHints.narrativeStance}」。` : ""}${selectedVariant.narrativePosture} 当前人类信号还不算厚，句子要更节制，别装成全知全能。`;
  const narrativePostureWithLens = `${narrativePosture} 镜头要求：${creativeLens.narrativePosture}`;
  const readerDistanceBase = preferredResearchSignals.targetReader
    ? `默认把读者当成「${preferredResearchSignals.targetReader}」，先解决他们为什么现在必须关心这件事。`
    : String(researchWriteback?.targetReader || "").trim()
      ? `默认把读者当成「${String(researchWriteback?.targetReader).trim()}」，先解决他们为什么现在必须关心这件事。`
      : "默认把读者当成懂一点背景、但不想听套话的熟人。";
  const readerDistance = `${readerDistanceBase} 镜头要求：${creativeLens.readerDistance}`;
  const energyCurve = input.archetypeRhythmHints
    ? `${input.archetypeRhythmHints.energyCurve} ${selectedVariant.energyCurve}`
    : `${prototypeBlueprint.sectionRhythm} ${selectedVariant.energyCurve}`;
  const discoveryModePrefix = input.archetypeRhythmHints ? `默认发现模式是「${input.archetypeRhythmHints.discoveryMode}」。` : "";
  const discoveryMode = hasRealScene
    ? `${discoveryModePrefix}优先从亲历观察、真实场景或一句原话落笔，再带出判断。`
    : researchTimelineCount > 0 || researchComparisonCount > 0
      ? `${discoveryModePrefix}优先从研究层最关键的时间节点、横向反差或交汇洞察落笔，不要只平铺素材。`
    : `${discoveryModePrefix}优先从具体事实或当前现象落笔，不要先写背景介绍。`;
  const tangentAllowance = input.writingStyleProfile?.tangentPatterns?.length
    ? `允许短暂偏题，但必须按这些方式回到主线：${input.writingStyleProfile.tangentPatterns.slice(0, 2).join("；")}`
    : input.archetypeRhythmHints?.offTopicTolerance === "low"
      ? "默认低跑题容忍度：尽量不横向岔开，只允许极短类比，并且立刻回到主线判断。"
      : input.archetypeRhythmHints?.offTopicTolerance === "high"
        ? "默认高跑题容忍度：允许短暂绕到侧面样本或更大背景，但每次偏出后都要回收成同一条判断。"
        : "默认中等跑题容忍度：允许短暂偏题补类比或吐槽，但每次偏出去后都要用一句判断拉回主线。";
  const breakPattern = input.writingStyleProfile?.paragraphBreathingPattern
    ? `段落呼吸优先遵守：${input.writingStyleProfile.paragraphBreathingPattern} 镜头只做微调：${creativeLens.sectionRhythm}`
    : `允许短段、断句和一句话独段，不要把每段写得一样长。镜头节奏：${creativeLens.sectionRhythm}`;
  const callbackMode = input.writingStyleProfile?.callbackPatterns?.length
    ? `如有条件，优先使用这些回环方式：${input.writingStyleProfile.callbackPatterns.slice(0, 2).join("；")}`
    : "如果开头抛了一个具象现象，结尾尽量回扣，但不要硬凑升华。";
  const rhythmJudgementStrength =
    input.archetypeRhythmHints?.judgmentStrength === "high"
      ? "原型默认判断强度较高，可以更早亮出立场，但必须让事实承重。"
      : input.archetypeRhythmHints?.judgmentStrength === "low"
        ? "原型默认判断强度较低，先把动作和事实讲清，再自然收成判断。"
        : input.archetypeRhythmHints
          ? "原型默认判断强度中等，判断清楚，但不要压过事实层。"
          : "";
  const judgementStrength = preferredResearchSignals.coreAssertion
    ? `核心判断是「${preferredResearchSignals.coreAssertion}」。${rhythmJudgementStrength}${rhythmJudgementStrength ? " " : ""}${selectedVariant.judgementStrength} 镜头要求：${creativeLens.judgementStrength}`
    : preferredResearchSignals.researchHypothesis
      ? `这次正文至少要围绕这条研究假设推进：「${preferredResearchSignals.researchHypothesis}」。${rhythmJudgementStrength}${rhythmJudgementStrength ? " " : ""}${selectedVariant.judgementStrength} 镜头要求：${creativeLens.judgementStrength}`
      : String(researchWriteback?.coreAssertion || "").trim()
        ? `研究层已经推到这条主判断：「${String(researchWriteback?.coreAssertion).trim()}」。${rhythmJudgementStrength}${rhythmJudgementStrength ? " " : ""}${selectedVariant.judgementStrength} 镜头要求：${creativeLens.judgementStrength}`
        : `${rhythmJudgementStrength}${rhythmJudgementStrength ? " " : ""}${selectedVariant.judgementStrength} 镜头要求：${creativeLens.judgementStrength}`;
  const humilityMode = prototype === "methodology"
    ? "方法类文章先卸掉教人姿态，允许承认不确定、学习曲线和失败点。"
    : selectedVariant.humilityMode;
  const stopMode = input.strategyCard?.endingAction
    ? `结尾优先停在这个动作或收束上：${input.strategyCard.endingAction}`
    : input.writingStyleProfile?.endingPatterns?.length
      ? `默认收束方式是「${input.archetypeRhythmHints?.closureMode || "按题型收束"}」，同时参考这些结尾倾向：${input.writingStyleProfile.endingPatterns.slice(0, 2).join("；")}`
      : `默认收束方式是「${input.archetypeRhythmHints?.closureMode || "按题型收束"}」。${selectedVariant.endingBias}`;
  const emotionalTemperature = String(input.humanSignals?.feltMoment || "").trim()
    ? `当前情绪线索来自作者体感：「${String(input.humanSignals?.feltMoment).trim()}」。`
    : researchWhyNow
      ? `情绪温度围绕这条研究结论展开：${researchWhyNow}`
      : String(input.writingStyleProfile?.emotionalIntensity || "").trim()
        ? `文风资产里的情绪幅度是「${String(input.writingStyleProfile?.emotionalIntensity).trim()}」，正文情绪别比这个更平或更炸。`
      : input.seriesInsight?.reason
        ? `情绪温度围绕系列主轴展开：${input.seriesInsight.reason}`
        : "情绪可以有，但不要用空泛激情替代具体体感。";
  const emotionalTemperatureWithLens = `${emotionalTemperature} 镜头温度：${creativeLens.emotionalTemperature}`;
  const researchFocus =
    researchCoreQuestion && strongestResearchInsight
      ? `研究主问题是「${researchCoreQuestion}」，正文要把它推进到这条研究锚点上：${strongestResearchInsight}`
      : researchCoreQuestion
        ? `研究主问题先围绕「${researchCoreQuestion}」收束，不要写着写着跑回泛泛背景。`
      : strongestResearchInsight
        ? `研究层当前最值得写硬的是：${strongestResearchInsight}`
        : "如果已有研究卡片，正文优先消化其中最关键的一条判断，不要退回资料整理。";
  const researchLens =
    researchTimelineCount > 0 && researchComparisonCount > 0
      ? preferredResearchSignals.marketPositionInsight
        ? `这次正文要把“纵向时间脉络 + 横向比较”交汇起来，并把比较最终落到这条位置判断上：${preferredResearchSignals.marketPositionInsight}`
        : "这次正文要把“纵向时间脉络 + 横向比较”交汇起来，不能只选其中一边。"
      : researchTimelineCount > 0
        ? preferredResearchSignals.historicalTurningPoint
          ? `这次正文至少要把关键时间节点串起来，尤其要解释这条转折为什么成立：${preferredResearchSignals.historicalTurningPoint}`
          : "这次正文至少要把关键时间节点串起来，解释为什么会走到今天。"
        : researchComparisonCount > 0
          ? preferredResearchSignals.marketPositionInsight
            ? `这次正文至少要把关键玩家差异讲清楚，重点落在这条位置判断上：${preferredResearchSignals.marketPositionInsight}`
            : "这次正文至少要把关键玩家差异讲清楚，避免单点观察。"
          : researchInsightItems.length > 0
            ? "这次正文优先围绕交汇洞察推进，别把洞察拆回散点素材。"
            : preferredResearchSignals.researchHypothesis
              ? `如果研究卡还不完整，正文至少先围绕这条研究假设推进：${preferredResearchSignals.researchHypothesis}`
            : "如果还没有研究卡片，正文判断要更克制，避免把猜测写成定论。";
  const openingMove = preferredResearchSignals.historicalTurningPoint
    ? `${creativeLens.openingMove} ${prototypeBlueprint.openingMove} 优先考虑从这条历史转折切入：${preferredResearchSignals.historicalTurningPoint}。 ${selectedVariant.openingBias}`
    : strongestResearchInsight
      ? `${creativeLens.openingMove} ${prototypeBlueprint.openingMove} 如果要抓注意力，优先用这条研究洞察开场：${strongestResearchInsight}。 ${selectedVariant.openingBias}`
      : `${creativeLens.openingMove} ${prototypeBlueprint.openingMove} ${selectedVariant.openingBias}`;
  const sectionRhythmBase =
    researchTimelineCount > 0 && researchComparisonCount > 0
      ? "章节先铺关键历史节点，再接横向差异，最后收束成交汇判断。"
      : researchTimelineCount > 0
        ? "章节按关键节点推进，每推进一次都要解释变量怎么变了。"
        : researchComparisonCount > 0
          ? "章节按主要玩家或方案差异推进，不要把比较写成并排清单。"
          : prototypeBlueprint.sectionRhythm;
  const sectionRhythm = progressiveReveal.enabled
    ? `${creativeLens.sectionRhythm} ${sectionRhythmBase} 当前额外启用「${progressiveReveal.label}」，节奏上要明显一层比一层更强。`
    : `${creativeLens.sectionRhythm} ${sectionRhythmBase}`;
  const evidenceMode =
    researchTimelineCount > 0 || researchComparisonCount > 0 || researchInsightItems.length > 0
      ? `${prototypeBlueprint.evidenceMode} 同时优先调用研究卡片里的时间节点、横向比较、交汇洞察和反证，不要只平铺原始素材。`
      : prototypeBlueprint.evidenceMode;
  const evidenceModeWithStyle =
    String(input.writingStyleProfile?.factDensity || "").trim()
      ? `${evidenceMode} 文风资产要求的事实密度是：${String(input.writingStyleProfile?.factDensity).trim()}。镜头证据偏好只补方向、不覆盖事实密度：${creativeLens.evidenceMode}`
      : `${evidenceMode} 镜头证据偏好：${creativeLens.evidenceMode}`;
  const stateChecklist = [
    `爆文蓝图：${viralBlueprint.label}；${viralBlueprint.titlePromise}`,
    `蓝图叙事弧：${viralBlueprint.narrativeArc.join(" -> ")}`,
    `蓝图证据配方：${viralBlueprint.evidenceRecipe.join("；")}`,
    `先按「${prototypeBlueprint.label}」写，不要把所有题材都写成同一种三段论。`,
    `这次文章原型定为「${prototypeBlueprint.label}」，原因：${articlePrototypeReason}`,
    archetypeRhythmHint ? `当前原型节奏模板：${archetypeRhythmHint}` : null,
    `这次优先用「${selectedVariant.label}」，原因：${stateVariantReason}`,
    `创意镜头定为「${creativeLens.label}」，原因：${creativeLens.triggerReason}`,
    progressiveReveal.enabled
      ? `当前启用「${progressiveReveal.label}」：${progressiveReveal.escalationRule}`
      : `当前不强制「逐一展示 / 升番」：${progressiveReveal.reason}`,
    researchFocus,
    researchLens,
    evidenceModeWithStyle,
    selectedVariant.endingBias,
    input.writingStyleProfile?.reusablePromptFragments?.length
      ? `可以借这些作者惯用推进动作：${input.writingStyleProfile.reusablePromptFragments.slice(0, 2).join("；")}`
      : null,
  ].filter(Boolean) as string[];

  return {
    articlePrototype: prototype,
    articlePrototypeLabel: prototypeBlueprint.label,
    articlePrototypeReason,
    archetypeRhythmHint,
    creativeLensCode: creativeLens.code,
    creativeLensLabel: creativeLens.label,
    creativeLensReason: creativeLens.triggerReason,
    creativeLensInstruction,
    stateVariantCode: selectedVariant.code,
    stateVariantLabel: selectedVariant.label,
    stateVariantReason,
    narrativePosture: narrativePostureWithLens,
    readerDistance,
    energyCurve,
    discoveryMode,
    tangentAllowance,
    breakPattern,
    callbackMode,
    judgementStrength,
    humilityMode,
    stopMode,
    emotionalTemperature: emotionalTemperatureWithLens,
    researchFocus,
    researchLens,
    openingMove,
    sectionRhythm,
    evidenceMode: evidenceModeWithStyle,
    progressiveRevealEnabled: progressiveReveal.enabled,
    progressiveRevealLabel: progressiveReveal.label,
    progressiveRevealReason: progressiveReveal.reason,
    climaxPlacement: progressiveReveal.climaxPlacement,
    escalationRule: progressiveReveal.escalationRule,
    progressiveRevealSteps: progressiveReveal.steps,
    antiOutlineRules: uniqueStrings([
      ...(input.writingStyleProfile?.antiOutlineRules?.slice(0, 4) ?? [
      "不要按首先、其次、最后编号展开",
      "不要把背景介绍写在核心判断前面太久",
      "不要所有段落都用同样句法推进",
      "不要单独写一段总结式升华",
      ]),
      ...creativeLens.antiOutlineRules,
    ], 7),
    tabooPatterns: uniqueStrings([
      ...(input.writingStyleProfile?.tabooPatterns?.slice(0, 4) ?? [
      "预告式转场",
      "对称三段论",
      "教科书式科普",
      "总结腔收尾",
      ]),
      ...creativeLens.tabooPatterns,
    ], 7),
    stateChecklist,
    prototypeOptions,
    stateOptions,
    creativeLensOptions: creativeLensResult.options,
  };
}

export function buildHumanSignalGuide(humanSignals: HumanSignalsLike) {
  if (!humanSignals) {
    return "";
  }
  const lines = [
    humanSignals.firstHandObservation ? `第一手观察：${humanSignals.firstHandObservation}` : null,
    humanSignals.feltMoment ? `体感瞬间：${humanSignals.feltMoment}` : null,
    humanSignals.whyThisHitMe ? `为什么这事打到作者：${humanSignals.whyThisHitMe}` : null,
    humanSignals.realSceneOrDialogue ? `真实场景或对话：${humanSignals.realSceneOrDialogue}` : null,
    humanSignals.wantToComplain ? `最想吐槽的点：${humanSignals.wantToComplain}` : null,
    humanSignals.nonDelegableTruth ? `不能交给 AI 编的真话：${humanSignals.nonDelegableTruth}` : null,
  ].filter(Boolean);
  if (lines.length === 0) {
    return "";
  }
  return ["以下内容必须优先进入正文，它们属于作者本人，不要把它们抹平成通用表达：", ...lines].join("\n");
}

export function buildWritingStateGuide(kernel: WritingStateKernel) {
  return [
    "这次正文先按写作状态组织，不要按施工图死板展开：",
    `文章原型：${kernel.articlePrototypeLabel}（${kernel.articlePrototype}）`,
    `原型原因：${kernel.articlePrototypeReason}`,
    kernel.archetypeRhythmHint ? `原型节奏模板：${kernel.archetypeRhythmHint}` : null,
    `创意镜头：${kernel.creativeLensLabel}（${kernel.creativeLensCode}）`,
    `镜头原因：${kernel.creativeLensReason}`,
    `镜头指令：${kernel.creativeLensInstruction}`,
    `状态变体：${kernel.stateVariantLabel}`,
    `切换原因：${kernel.stateVariantReason}`,
    `叙述姿态：${kernel.narrativePosture}`,
    `读者距离：${kernel.readerDistance}`,
    `研究焦点：${kernel.researchFocus}`,
    `研究镜头：${kernel.researchLens}`,
    `起手动作：${kernel.openingMove}`,
    `章节节奏：${kernel.sectionRhythm}`,
    `证据组织：${kernel.evidenceMode}`,
    `节奏插件：${kernel.progressiveRevealLabel}`,
    `启用原因：${kernel.progressiveRevealReason}`,
    `高潮位置：${kernel.climaxPlacement}`,
    `升番规则：${kernel.escalationRule}`,
    `逐层推进：${kernel.progressiveRevealSteps.map((item) => `${item.label}:${item.instruction}`).join("；")}`,
    `能量曲线：${kernel.energyCurve}`,
    `发现方式：${kernel.discoveryMode}`,
    `允许偏题方式：${kernel.tangentAllowance}`,
    `断裂与呼吸：${kernel.breakPattern}`,
    `回环方式：${kernel.callbackMode}`,
    `判断强度：${kernel.judgementStrength}`,
    `谦逊模式：${kernel.humilityMode}`,
    `结尾停法：${kernel.stopMode}`,
    `情绪温度：${kernel.emotionalTemperature}`,
    `状态自检：${kernel.stateChecklist.join("；")}`,
    `原型候选：${kernel.prototypeOptions.map((item) => `${item.label}（${item.suitableWhen}；触发：${item.triggerReason}）`).join("；")}`,
    `反结构规则：${kernel.antiOutlineRules.join("；")}`,
    `禁忌写法：${kernel.tabooPatterns.join("；")}`,
  ].filter(Boolean).join("\n");
}
