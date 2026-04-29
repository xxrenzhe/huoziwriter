import { generateSceneText } from "./ai-gateway";
import { buildGatewaySystemSegments } from "./ai-gateway-system-segments";
import { getMergedActiveArchetypeRhythmHints, normalizeStrategyArchetypeKey } from "./archetype-rhythm";
import type { AuthorOutcomeFeedbackLedger } from "./author-outcome-feedback-ledger";
import { auditInformationGain, type InformationGainAuditResult } from "./information-gain-audit";
import { auditPersonaConsistency, type PersonaConsistencyAuditResult } from "./persona-consistency-audit";
import { loadPromptWithMeta } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
import type { WritingStyleConfidenceProfile } from "./writing-style-analysis";
import {
  ARTICLE_PROTOTYPE_CODES,
  WRITING_STATE_VARIANT_CODES,
  buildHumanSignalGuide,
  buildWritingStateGuide,
  buildWritingStateKernel,
  type ArticlePrototypeCode,
  type WritingStateKernel,
  type WritingStateVariantCode,
} from "./writing-state";

export type GenerationBuildResult = {
  markdown: string;
  promptVersionRefs: string[];
  personaAudit?: PersonaConsistencyAuditResult | null;
  informationGainAudit?: InformationGainAuditResult | null;
};

function withGenerationTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

const ARTICLE_WRITE_TIMEOUT_MS = readPositiveIntegerEnv("ARTICLE_WRITE_TIMEOUT_MS", 300_000);
const LANGUAGE_GUARD_TIMEOUT_MS = readPositiveIntegerEnv("LANGUAGE_GUARD_TIMEOUT_MS", 120_000);

type LayoutStrategyConfig = {
  name?: string;
  tone?: string;
  paragraphLength?: string;
  titleStyle?: string;
  bannedWords?: string[];
  bannedPunctuation?: string[];
};

type OutlineNodeContext = {
  title: string;
  description?: string | null;
};

type KnowledgeCardContext = {
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions?: string[];
  latestChangeSummary?: string | null;
  overturnedJudgements?: string[];
  status: string;
  confidenceScore: number;
  matchedFragmentCount?: number;
};

type PersonaContext = {
  name: string;
  summary?: string | null;
  identityTags: string[];
  writingStyleTags: string[];
  domainKeywords?: string[];
  argumentPreferences?: string[];
  toneConstraints?: string[];
  audienceHints?: string[];
  sourceMode?: string;
  boundWritingStyleProfileName?: string | null;
};

type WritingStyleProfileContext = {
  name: string;
  summary: string;
  sampleCount?: number | null;
  confidenceProfile?: Record<string, number> | null;
  toneKeywords: string[];
  sentenceLengthProfile?: string | null;
  paragraphBreathingPattern?: string | null;
  structurePatterns: string[];
  transitionPatterns?: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  punctuationHabits?: string[];
  tangentPatterns?: string[];
  callbackPatterns?: string[];
  factDensity?: string | null;
  emotionalIntensity?: string | null;
  suitableTopics?: string[];
  reusablePromptFragments?: string[];
  verbatimPhraseBanks?: {
    transitionPhrases?: string[];
    judgementPhrases?: string[];
    selfDisclosurePhrases?: string[];
    emotionPhrases?: string[];
    readerBridgePhrases?: string[];
  };
  tabooPatterns?: string[];
  statePresets?: string[];
  antiOutlineRules?: string[];
  doNotWrite: string[];
  imitationPrompt: string;
};

type WritingStyleConfidenceKey = keyof WritingStyleConfidenceProfile;

const STYLE_HARD_CONFIDENCE_THRESHOLD = 0.68;
const STYLE_SOFT_CONFIDENCE_THRESHOLD = 0.5;

type StrategyCardContext = {
  archetype?: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief?: string | null;
  targetReader?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
  researchHypothesis?: string | null;
  marketPositionInsight?: string | null;
  historicalTurningPoint?: string | null;
  endingAction?: string | null;
};

type SeriesInsightContext = {
  label?: string | null;
  reason?: string | null;
  commonTerms?: string[];
  coreStances?: string[];
  whyNow?: string[];
  preHook?: string | null;
  postHook?: string | null;
  platformPreference?: string | null;
  targetPackHint?: string | null;
  defaultArchetype?: string | null;
  defaultLayoutTemplateId?: string | null;
  rhythmOverride?: Record<string, unknown> | null;
};

type ResearchBriefContext = {
  summary?: string | null;
  coreQuestion?: string | null;
  mustCoverAngles?: string[];
  timelineCards?: Array<{
    phase?: string | null;
    title?: string | null;
    summary?: string | null;
    signals?: string[];
  }>;
  comparisonCards?: Array<{
    subject?: string | null;
    position?: string | null;
    differences?: string[];
    opportunities?: string[];
    risks?: string[];
  }>;
  intersectionInsights?: Array<{
    insight?: string | null;
    whyNow?: string | null;
    caution?: string | null;
  }>;
  strategyWriteback?: {
    targetReader?: string | null;
    coreAssertion?: string | null;
    whyNow?: string | null;
    researchHypothesis?: string | null;
    marketPositionInsight?: string | null;
    historicalTurningPoint?: string | null;
  } | null;
};

type HumanSignalsContext = {
  firstHandObservation?: string | null;
  feltMoment?: string | null;
  whyThisHitMe?: string | null;
  realSceneOrDialogue?: string | null;
  wantToComplain?: string | null;
  nonDelegableTruth?: string | null;
  score?: number | null;
};

type ImageFragmentContext = {
  title?: string | null;
  screenshotPath: string;
};

type HistoryReferenceContext = {
  title: string;
  relationReason?: string | null;
  bridgeSentence?: string | null;
};

type AuthorOutcomeFeedbackLedgerContext = AuthorOutcomeFeedbackLedger;

function resolvePreferredPrototypeCodeFromRuntime(input: {
  deepWritingPayload?: Record<string, unknown> | null;
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
}) {
  const payloadValue = getString(input.deepWritingPayload?.articlePrototype);
  if (ARTICLE_PROTOTYPE_CODES.includes(payloadValue as ArticlePrototypeCode)) {
    return payloadValue as ArticlePrototypeCode;
  }
  const ledgerValue = getString(input.authorOutcomeFeedbackLedger?.recommendations.prototype?.key);
  return ARTICLE_PROTOTYPE_CODES.includes(ledgerValue as ArticlePrototypeCode)
    ? ledgerValue as ArticlePrototypeCode
    : null;
}

function resolvePreferredStateVariantCodeFromRuntime(input: {
  deepWritingPayload?: Record<string, unknown> | null;
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
}) {
  const payloadValue = getString(input.deepWritingPayload?.stateVariantCode);
  if (WRITING_STATE_VARIANT_CODES.includes(payloadValue as WritingStateVariantCode)) {
    return payloadValue as WritingStateVariantCode;
  }
  const ledgerValue = getString(input.authorOutcomeFeedbackLedger?.recommendations.stateVariant?.key);
  return WRITING_STATE_VARIANT_CODES.includes(ledgerValue as WritingStateVariantCode)
    ? ledgerValue as WritingStateVariantCode
    : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getRecordArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, limit)
    : [];
}

function uniquePromptRefs(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function attachPersonaAudit(input: {
  title: string;
  markdown: string;
  persona?: PersonaContext | null;
  strategyCard?: StrategyCardContext | null;
}) {
  return auditPersonaConsistency({
    title: input.title,
    markdown: input.markdown,
    persona: input.persona,
    strategyCard: input.strategyCard,
  });
}

function attachInformationGainAudit(input: {
  title: string;
  markdown: string;
  fragments?: string[];
  researchBrief?: ResearchBriefContext | null;
  knowledgeCards?: KnowledgeCardContext[];
  historyReferences?: HistoryReferenceContext[];
  mode?: "draft" | "preview";
}) {
  return auditInformationGain({
    title: input.title,
    markdown: input.markdown,
    fragments: input.fragments,
    researchBrief: input.researchBrief,
    knowledgeCards: input.knowledgeCards,
    historyReferences: input.historyReferences,
    mode: input.mode,
  });
}

export function splitIntoChunks(text: string, size = 28) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function sanitizeBannedWords(content: string, bannedWords: string[]) {
  let sanitized = content;
  for (const bannedWord of bannedWords) {
    const word = bannedWord.trim();
    if (!word) continue;
    sanitized = sanitized.replaceAll(word, "〔已净化〕");
  }
  return sanitized;
}

function promptLine(prefix: string, value: unknown) {
  return formatPromptTemplate(prefix + "{{value}}", { value });
}

function promptBlock(prefix: string, value: unknown) {
  return formatPromptTemplate(prefix + "\n{{value}}", { value });
}

function buildTagText(tags: string[] = []) {
  return tags.map((item) => String(item || "").trim()).filter(Boolean).join("、");
}

function dedupeText(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function compactPromptFragments(values: Array<string | null | undefined>, limit: number, maxCharsPerFragment: number) {
  return dedupeText(values, limit)
    .map((item) => item.length <= maxCharsPerFragment ? item : item.slice(0, Math.max(0, maxCharsPerFragment - 1)).trim() + "…")
    .filter(Boolean);
}

async function resolveGenerationRhythmHints(input: {
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
}) {
  const archetype =
    normalizeStrategyArchetypeKey(input.strategyCard?.archetype)
    ?? normalizeStrategyArchetypeKey(input.seriesInsight?.defaultArchetype);
  return getMergedActiveArchetypeRhythmHints({
    archetype,
    override: input.seriesInsight?.rhythmOverride ?? null,
  });
}

function splitParagraphForFallback(text: string) {
  const sentences = text
    .split(/(?<=[。！？!?；;])/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    return text.trim();
  }
  const midpoint = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, midpoint).join(""), sentences.slice(midpoint).join("")].filter(Boolean).join("\n\n");
}

function buildFactCheckFallbackReplacement(input: {
  claim: string;
  decision: string;
  evidenceTitle: string;
  supportLevel?: string;
}) {
  const claim = input.claim.trim();
  const evidenceTitle = input.evidenceTitle.trim();
  if (!claim) {
    return "";
  }
  if (input.decision === "remove") {
    return evidenceTitle ? "至少按" + evidenceTitle + "这条材料看，这句判断先收住。" : "按现有材料看，这句判断先收住。";
  }
  if (input.decision === "source") {
    return evidenceTitle ? "按" + evidenceTitle + "等现有材料，" + claim : "按现有材料看，" + claim;
  }
  if (input.decision === "mark_opinion") {
    return evidenceTitle ? "如果只按" + evidenceTitle + "这条材料看，" + claim : "这更像当前阶段的判断：" + claim;
  }
  if (input.decision === "soften") {
    if (evidenceTitle) {
      return "至少从" + evidenceTitle + "等现有材料看，" + claim;
    }
    return input.supportLevel === "missing" ? "按现有材料看，" + claim : claim + "，但这里先不把话说满。";
  }
  return claim;
}

function buildProseFallbackReplacement(input: {
  example: string;
  suggestion: string;
  rewrittenLead?: string;
  punchlines?: string[];
  rhythmAdvice?: string[];
}) {
  const example = input.example.trim();
  const suggestion = input.suggestion.trim();
  if (!example) {
    return "";
  }
  if (input.rewrittenLead?.trim() && /开头|起手|首段|抓力/.test(suggestion)) {
    return input.rewrittenLead.trim();
  }
  if (/段落过长|句子过长|长句|句子太满|节奏|转场|重复/.test(suggestion) || example.length > 80) {
    return splitParagraphForFallback(example);
  }
  const punchline = (input.punchlines ?? []).map((item) => item.trim()).find(Boolean) || "";
  if (punchline && /力度|判断|太虚|太软|不够硬|结论/.test(suggestion) && !example.includes(punchline)) {
    return example.replace(/[。！？!?]+$/, "") + "。\n\n" + punchline;
  }
  const rhythmAdvice = (input.rhythmAdvice ?? []).map((item) => item.trim()).find(Boolean) || "";
  if (rhythmAdvice && /节奏|转场|重复/.test(suggestion) && !example.includes(rhythmAdvice)) {
    return splitParagraphForFallback(example) + "\n\n" + rhythmAdvice;
  }
  return example;
}

function resolveResearchStrategySignals(input: {
  researchBrief?: ResearchBriefContext | null;
  strategyCard?: StrategyCardContext | null;
}) {
  const writeback = input.researchBrief?.strategyWriteback ?? null;
  return {
    coreAssertion:
      String(input.strategyCard?.coreAssertion || "").trim()
      || String(writeback?.coreAssertion || "").trim(),
    whyNow:
      String(input.strategyCard?.whyNow || "").trim()
      || String(writeback?.whyNow || "").trim()
      || String(input.strategyCard?.researchHypothesis || "").trim()
      || String(writeback?.researchHypothesis || "").trim(),
    researchHypothesis:
      String(input.strategyCard?.researchHypothesis || "").trim()
      || String(writeback?.researchHypothesis || "").trim(),
    marketPositionInsight:
      String(input.strategyCard?.marketPositionInsight || "").trim()
      || String(writeback?.marketPositionInsight || "").trim(),
    historicalTurningPoint:
      String(input.strategyCard?.historicalTurningPoint || "").trim()
      || String(writeback?.historicalTurningPoint || "").trim(),
  };
}

function buildLocalDraft(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  prompt: string;
  personaGuide?: string;
  writingStyleGuide?: string;
  humanSignalGuide?: string;
  writingStateGuide?: string;
  deepWritingBehaviorGuide?: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
  imageGuide?: string;
  historyGuide?: string;
  researchGuide?: string;
  deepWritingGuide?: string;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const payload = getRecord(input.deepWritingPayload);
  const deepWritingDraft = payload ? buildLocalDeepWritingFallback({
    title: input.title,
    fragments: input.fragments,
    payload,
  }) : "";
  if (deepWritingDraft) {
    return sanitizeGeneratedMarkdownForReader(sanitizeBannedWords(deepWritingDraft, input.bannedWords));
  }

  const researchSignals = String(input.researchGuide || "")
    .split("\n")
    .map((line) => line.replace(/^.*?：/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const cleanFragments = [...researchSignals, ...input.fragments]
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter((item) => !/测试碎片|用于验证|worker\s*自动编译|debug\s*series/i.test(item))
    .filter(Boolean)
    .slice(0, 5);
  const fragmentText = cleanFragments.length > 0
    ? cleanFragments.join("\n\n")
    : "这篇文章先从一个朴素事实开始：越是变化快的时候，越不能把焦虑当成行动计划。";
  const outlineHeadings = String(input.outlineGuide || "")
    .split("\n")
    .map((line) => line.replace(/^\s*\d+\.\s*/, "").split("：")[0]?.trim())
    .filter((line) => line && !line.includes("当前稿件大纲"))
    .slice(0, 4);
  const headings = outlineHeadings.length > 0 ? outlineHeadings : ["先承认问题", "换一个判断", "把行动压小", "今天就能开始"];
  return sanitizeGeneratedMarkdownForReader(sanitizeBannedWords(
    [
      "# " + input.title,
      "很多时候，真正消耗人的不是 AI 本身，而是我们还在用旧判断理解新变化。一个工具冒出来、一条新闻刷过去、一个案例被反复转发，表面上像是信息变多了，实质上更像原来的解释开始失效。",
      "焦虑当然真实，但它本身并不会自动变成答案。更常见的情况是，人先被变化推着走，过了很久才发现自己一直在回应表层刺激，而没有碰到真正值得调整的那一层。",
      ...headings.map((heading, index) => [
        "## " + heading,
        index === 0
          ? "最先冒出来的，往往不是能力差距，而是判断错位。人以为自己缺的是新工具，结果真正拖慢自己的，反而是旧流程里那些没有被重新审视的环节。"
          : index === 1
            ? "比“我会不会落后”更有用的问题，其实是：我今天能不能验证一个小假设。这个问题的价值不在于它更积极，而在于它会逼着人把变化落到一个具体环节，而不是停在一团模糊的压力里。"
            : index === 2
              ? fragmentText
              : "写到这里，更稳妥的结论也就浮出来了：变化不会因为焦虑变得更清楚，但一次次更小的验证，确实能把失控感慢慢压回到可处理的范围里。",
      ].join("\n\n")),
      "真正值得抓住的，不是焦虑提醒你变化来了，而是你能不能把变化翻译成今天可以完成的一件小事。只要还能这样做，AI 时代就不只是压力，也会变成新的训练场。",
    ].filter(Boolean).join("\n\n"),
    input.bannedWords,
  ));
}

function normalizeFallbackSeed(text: unknown) {
  return String(text || "")
    .replace(/^\s*[：:.-]+/, "")
    .replace(/围绕「[^」]+」|围绕“[^”]+”/g, "")
    .replace(/写出|推进|本节|章节|一段|正文|结论先行|不要|避免|必须/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureSentence(text: unknown, fallback: string) {
  const normalized = normalizeFallbackSeed(text);
  const base = normalized || fallback;
  if (!base) return "";
  return /[。！？!?]$/.test(base) ? base : base + "。";
}

function isSearchMarketingTopic(seed: string) {
  return /(搜索广告|搜索意图|关键词|谷歌广告|google ads|ppc|sem|投放|质量分|quality score|出单|转化)/i.test(seed);
}

function isInternalWritingInstruction(text: string) {
  return /痛点引入|核心反转|底层原因|行动建议|先给出判断|再放事实|这一节|承担的是|让读者|素材火花|铺垫样本|逐层加码|收束判断|最强发现|章节|本节|执行|策略|作者可以|作者以人设视角|人设视角|匿名复盘场景|研究问题|信源覆盖|补官方源|补时间脉络|补横向对比|补用户反馈|补反例|来源材料|不把无关/.test(text);
}

function cleanReaderSeed(text: string) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  return normalized && !isInternalWritingInstruction(normalized) ? normalized : "";
}

function readerFacingHeading(input: {
  heading: string;
  index: number;
  title: string;
  seed: string;
}) {
  const heading = input.heading.trim();
  if (!isInternalWritingInstruction(heading)) {
    return heading;
  }
  if (isSearchMarketingTopic(`${input.title} ${input.seed}`)) {
    return [
      "精准词为什么也会浪费钱",
      "真正的变量不是词面",
      "需求阶段错了，流量越准越贵",
      "最后看行动意图",
    ][input.index] || "把搜索意图放回现场";
  }
  return [
    "问题先从错位开始",
    "真正变化的不是表面",
    "代价会在这里冒出来",
    "最后留下一个判断",
  ][input.index] || "把判断落回现场";
}

function buildLocalDeepWritingFallback(input: {
  title: string;
  fragments: string[];
  payload: Record<string, unknown>;
}) {
  const title = getString(input.payload.selectedTitle) || input.title;
  const organicGrowthKernel = getRecord(input.payload.organicGrowthKernel);
  const viralGenomePack = getRecord(input.payload.viralGenomePack);
  const sectionBlueprint = getRecordArray(input.payload.sectionBlueprint).slice(0, 4);
  const mustUseFacts = getStringArray(input.payload.mustUseFacts, 4);
  const centralThesis = getString(input.payload.centralThesis);
  const openingLead = getRequiredOpeningLead(input.payload);
  const readerConflict = cleanReaderSeed(getString(organicGrowthKernel?.readerConflict));
  const materialSpark = cleanReaderSeed(getString(organicGrowthKernel?.materialSpark));
  const authorLens = cleanReaderSeed(getString(organicGrowthKernel?.authorLens));
  const growthPath = getStringArray(organicGrowthKernel?.growthPath, 4).map(cleanReaderSeed).filter(Boolean);
  const firstScreenPromise = cleanReaderSeed(getString(viralGenomePack?.firstScreenPromise));
  const shareTrigger = cleanReaderSeed(getString(viralGenomePack?.shareTrigger));
  const readerShareReasons = getStringArray(viralGenomePack?.readerShareReasons, 3).map(cleanReaderSeed).filter(Boolean);
  const materialJobs = getStringArray(viralGenomePack?.materialJobs, 4).map(cleanReaderSeed).filter(Boolean);
  const readerSceneAnchors = getStringArray(viralGenomePack?.readerSceneAnchors, 4).map(cleanReaderSeed).filter(Boolean);
  const openingMicroScenes = getStringArray(viralGenomePack?.openingMicroScenes, 3).map(cleanReaderSeed).filter(Boolean);
  const translationPairs = getRecordArray(viralGenomePack?.abstractToConcretePairs, 3)
    .map((item) => [cleanReaderSeed(getString(item.abstract)), cleanReaderSeed(getString(item.concrete))].filter(Boolean).join("=>"))
    .filter(Boolean);
  const evidencePool = dedupeText([
    ...mustUseFacts,
    ...input.fragments,
    ...sectionBlueprint.flatMap((section) => getStringArray(section.evidenceHints, 2)),
  ].map(cleanReaderSeed).filter(Boolean), 8);
  const topicSeed = [title, centralThesis, readerConflict, materialSpark, authorLens, ...evidencePool].join(" ");

  if (!sectionBlueprint.length && !readerConflict && !materialSpark && !centralThesis) {
    return "";
  }

  const introParagraphs = [
    openingLead || ensureSentence(readerConflict || firstScreenPromise, centralThesis || "变化先落在读者已经付出的代价上"),
    ensureSentence(
      materialSpark || evidencePool[0] || openingMicroScenes[0] || readerShareReasons[0] || authorLens,
      materialJobs.length
        ? "真正把问题抬高的，是这里已经出现了" + materialJobs.slice(0, 3).join("、") + "，读者不再只是看一个观点"
        : "真正把问题抬高的，不是表面现象，而是它已经开始改写原来的判断顺序",
    ),
    ensureSentence(
      translationPairs[0] || readerSceneAnchors[0],
      "",
    ),
  ].filter(Boolean);

  const sections = (sectionBlueprint.length ? sectionBlueprint : [{ heading: "核心判断" }, { heading: "错位现场" }, { heading: "最后收束" }])
    .map((section: Record<string, unknown>, index: number, allSections: Array<Record<string, unknown>>) => {
      const heading = readerFacingHeading({
        heading: getString(section.heading) || `章节 ${index + 1}`,
        index,
        title,
        seed: topicSeed,
      });
      const mission = getString(section.paragraphMission) || getString(section.goal);
      const evidence = getStringArray(section.evidenceHints, 2)[0] || evidencePool[index] || "";
      const fallbackLine =
        isSearchMarketingTopic(topicSeed)
          ? index === 0
            ? "很多投放复盘最别扭的地方，是账户看起来更精细了，结果却没有更扎实。"
            : index === allSections.length - 1
              ? "判断一个词值不值得继续买，最后还是要回到搜索者此刻离行动还有多远。"
              : "词面相近只说明用户说法接近，不能说明他们处在同一个决策阶段。"
          : index === 0
            ? "表面上看，这是一个很常见的问题；真正难处理的是，读者往往已经为这个错位付了代价。"
            : index === allSections.length - 1
              ? "写到最后，真正值得留下来的，不是更多步骤，而是一句更稳的判断。"
              : "问题继续往前走时，变化会从现象层慢慢压到结构层。";
      const missionSentence = isInternalWritingInstruction(mission) ? fallbackLine : ensureSentence(mission, fallbackLine);
      const evidenceSentence = evidence
        ? ensureSentence(evidence, "")
        : ensureSentence(isInternalWritingInstruction(growthPath[index] || "") ? authorLens : growthPath[index] || authorLens, "");
      const paragraph = [missionSentence, evidenceSentence]
        .filter(Boolean)
        .join("\n\n");
      return ["## " + heading, paragraph].join("\n\n");
    });

  const closing = ensureSentence(
    shareTrigger || centralThesis || growthPath[growthPath.length - 1] || authorLens,
    "当读者终于看清问题的真实落点，文章也就不需要再把自己写成一份操作手册",
  );

  return [
    "# " + title,
    ...introParagraphs,
    ...sections,
    closing,
  ].filter(Boolean).join("\n\n");
}

function sanitizeGeneratedMarkdownForReader(markdown: string) {
  const internalPattern = /你是中文专栏作者|请额外遵守|当前默认作者人设|这次正文先按写作状态组织|当前稿件大纲锚点|相关背景卡：|请优先遵守以下研究层约束|原型候选：|反结构规则：|禁忌写法：|作者可以|作者以人设视角|人设视角|匿名复盘场景|研究问题|信源覆盖|补官方源|补时间脉络|补横向对比|补用户反馈|补反例|来源材料|不把无关|prompt|cacheable/i;
  const syntheticPattern = /测试碎片|用于验证|worker\s*自动编译|debug\s*series/i;
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !internalPattern.test(block) && !syntheticPattern.test(block));
  return blocks.join("\n\n").trim();
}

function buildLocalOpeningPreview(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const requiredLead = getRequiredOpeningLead(input.deepWritingPayload);
  const leadFact = (input.fragments.find((item) => getString(item)) || "单次生成效果不能代表完整交付能力。").slice(0, 90);
  return sanitizeBannedWords(
    requiredLead
      ? [
          requiredLead,
          leadFact && !requiredLead.includes(leadFact.slice(0, 24)) ? leadFact : "",
        ].filter(Boolean).join("\n\n")
      : [
          leadFact,
          "真正值得警惕的，不是表面动作有没有做够，而是读者、场景和行动阶段有没有对上。",
        ].filter(Boolean).join("\n\n"),
    input.bannedWords,
  );
}

function buildStyleGuide(layoutStrategy?: LayoutStrategyConfig | null) {
  if (!layoutStrategy) {
    return "";
  }

  const lines = [
    layoutStrategy.name ? promptLine("当前启用写作风格资产：", layoutStrategy.name) : null,
    layoutStrategy.tone ? promptLine("语气偏好：", layoutStrategy.tone) : null,
    layoutStrategy.paragraphLength ? promptLine("段落呼吸：", layoutStrategy.paragraphLength) : null,
    layoutStrategy.titleStyle ? promptLine("标题倾向：", layoutStrategy.titleStyle) : null,
    layoutStrategy.bannedWords?.length ? promptLine("附加禁词：", layoutStrategy.bannedWords.join("、")) : null,
    layoutStrategy.bannedPunctuation?.length ? promptLine("禁用标点：", layoutStrategy.bannedPunctuation.join(" ")) : null,
  ].filter(Boolean);

  if (!lines.length) {
    return "";
  }

  return ["请额外遵守以下写作风格资产 / DNA 约束：", ...lines].join("\n");
}

function buildPersonaGuide(persona?: PersonaContext | null) {
  if (!persona) {
    return "";
  }

  const identityText = buildTagText(persona.identityTags);
  const writingStyleText = buildTagText(persona.writingStyleTags);
  const lines = [
    promptLine("当前默认作者人设：", persona.name),
    persona.summary ? promptLine("人设摘要：", persona.summary) : null,
    identityText ? promptLine("身份维度：", identityText) : null,
    writingStyleText ? promptLine("标签风格：", writingStyleText) : null,
    persona.domainKeywords?.length ? promptLine("领域关键词：", persona.domainKeywords.join("、")) : null,
    persona.argumentPreferences?.length ? promptLine("常用论证：", persona.argumentPreferences.join("；")) : null,
    persona.toneConstraints?.length ? promptLine("语气约束：", persona.toneConstraints.join("；")) : null,
    persona.audienceHints?.length ? promptLine("默认受众：", persona.audienceHints.join("；")) : null,
    persona.sourceMode === "analyzed" ? "这个人设由用户资料分析得到，优先贴近其真实表达习惯。" : null,
    persona.boundWritingStyleProfileName ? promptLine("已绑定文风资产：", persona.boundWritingStyleProfileName) : null,
    "写作时保持人设视角稳定，不要突然切换成通用 AI 口吻或旁观者口吻。",
  ].filter(Boolean);

  return ["请额外遵守以下作者人设约束：", ...lines].join("\n");
}

function getStyleConfidence(
  writingStyleProfile: WritingStyleProfileContext,
  key: WritingStyleConfidenceKey,
) {
  const value = writingStyleProfile.confidenceProfile?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isMultiSampleStableStyleProfile(writingStyleProfile: WritingStyleProfileContext) {
  return Number(writingStyleProfile.sampleCount || 0) >= 2 && Boolean(writingStyleProfile.confidenceProfile);
}

function meetsHardStyleConfidence(
  writingStyleProfile: WritingStyleProfileContext,
  key: WritingStyleConfidenceKey,
) {
  const confidence = getStyleConfidence(writingStyleProfile, key);
  return confidence == null || confidence >= STYLE_HARD_CONFIDENCE_THRESHOLD;
}

function meetsSoftStyleConfidence(
  writingStyleProfile: WritingStyleProfileContext,
  key: WritingStyleConfidenceKey,
) {
  const confidence = getStyleConfidence(writingStyleProfile, key);
  return confidence == null || confidence >= STYLE_SOFT_CONFIDENCE_THRESHOLD;
}

function buildSoftStyleHint(label: string, value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized ? `${label}：${normalized}` : null;
}

type ExpressionExemplarCandidateKind =
  | "fragment"
  | "judgement"
  | "readerBridge"
  | "emotion"
  | "voice"
  | "scene"
  | "opening"
  | "negative"
  | "contextPositive"
  | "feedbackPositive"
  | "feedbackNegative";

type ExpressionExemplarCandidate = {
  text: string | null | undefined;
  kind: ExpressionExemplarCandidateKind;
};

type ExpressionExemplarRuntimeContext = {
  topicTerms: string[];
  audienceTerms: string[];
  emotionTerms: string[];
  judgementTerms: string[];
  targetReader: string;
  emotionCue: string;
  topicCue: string;
};

function getExpressionFeedbackSummary(ledger?: AuthorOutcomeFeedbackLedgerContext | null) {
  return ledger?.expressionFeedbackSummary ?? null;
}

function tokenizeExpressionContext(value: unknown, limit = 24) {
  const text = String(value || "").toLowerCase().trim();
  if (!text) {
    return [];
  }
  const tokens = new Set<string>();
  for (const token of text.match(/[a-z0-9]{3,}/g) ?? []) {
    tokens.add(token);
  }
  for (const chunk of text.match(/[\u4e00-\u9fa5]{2,}/g) ?? []) {
    const maxGram = Math.min(4, chunk.length);
    for (let size = 2; size <= maxGram; size += 1) {
      for (let index = 0; index <= chunk.length - size; index += 1) {
        tokens.add(chunk.slice(index, index + size));
        if (tokens.size >= limit) {
          return Array.from(tokens);
        }
      }
    }
  }
  return Array.from(tokens).slice(0, limit);
}

function uniqueContextTerms(values: Array<unknown>, limit: number) {
  return Array.from(new Set(values.flatMap((value) => tokenizeExpressionContext(value)))).slice(0, limit);
}

function buildExpressionExemplarRuntimeContext(input: {
  title: string;
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
}): ExpressionExemplarRuntimeContext {
  const researchWriteback = input.researchBrief?.strategyWriteback ?? null;
  const targetReader =
    getString(input.strategyCard?.targetReader)
    || getString(researchWriteback?.targetReader)
    || getString(input.seriesInsight?.targetPackHint)
    || (input.persona?.audienceHints ?? []).map(getString).filter(Boolean)[0]
    || "";
  const emotionCue =
    getString(input.humanSignals?.feltMoment)
    || getString(input.humanSignals?.wantToComplain)
    || getString(input.humanSignals?.whyThisHitMe)
    || getString(input.writingStyleProfile?.emotionalIntensity);
  const topicCue = [
    input.title,
    input.strategyCard?.coreAssertion,
    input.strategyCard?.mainstreamBelief,
    input.strategyCard?.whyNow,
    input.researchBrief?.coreQuestion,
    input.researchBrief?.summary,
    researchWriteback?.coreAssertion,
    researchWriteback?.researchHypothesis,
    input.seriesInsight?.label,
    input.seriesInsight?.reason,
    ...(input.seriesInsight?.commonTerms ?? []),
    ...(input.writingStyleProfile?.suitableTopics ?? []),
    ...(input.persona?.domainKeywords ?? []),
    getString(input.deepWritingPayload?.articlePrototypeLabel),
    getString(input.deepWritingPayload?.stateVariantLabel),
  ].filter(Boolean).join("；");

  return {
    topicTerms: uniqueContextTerms([topicCue], 36),
    audienceTerms: uniqueContextTerms([
      targetReader,
      ...(input.persona?.audienceHints ?? []),
      input.researchBrief?.strategyWriteback?.targetReader,
    ], 24),
    emotionTerms: uniqueContextTerms([
      emotionCue,
      input.humanSignals?.realSceneOrDialogue,
      input.humanSignals?.nonDelegableTruth,
      ...(input.writingStyleProfile?.verbatimPhraseBanks?.emotionPhrases ?? []),
    ], 24),
    judgementTerms: uniqueContextTerms([
      input.strategyCard?.coreAssertion,
      input.strategyCard?.marketPositionInsight,
      input.researchBrief?.strategyWriteback?.coreAssertion,
      input.humanSignals?.nonDelegableTruth,
      ...(input.seriesInsight?.coreStances ?? []),
    ], 24),
    targetReader,
    emotionCue,
    topicCue,
  };
}

function countContextMatches(text: string, terms: string[], max = 4) {
  let count = 0;
  const normalized = text.toLowerCase();
  for (const term of terms) {
    if (term && normalized.includes(term)) {
      count += 1;
      if (count >= max) {
        return count;
      }
    }
  }
  return count;
}

function buildContextualExpressionHints(context: ExpressionExemplarRuntimeContext) {
  const positiveHints = [
    context.targetReader
      ? `读者桥接优先面向「${context.targetReader}」：少解释概念，多写他们眼前的动作、代价和判断压力。`
      : null,
    context.emotionCue
      ? `情绪手势优先贴近作者当前体感：「${context.emotionCue}」，不要另起一种陌生情绪。`
      : null,
    context.targetReader || context.emotionCue || context.judgementTerms.length > 0
      ? "正例优先选择与当前题材、受众或判断姿态能对上的片段；不相关的漂亮句式降权。"
      : null,
  ].filter(Boolean) as string[];
  return { positiveHints };
}

function buildExpressionFeedbackExemplarHints(ledger?: AuthorOutcomeFeedbackLedgerContext | null) {
  const summary = getExpressionFeedbackSummary(ledger);
  if (!summary || summary.feedbackSampleCount <= 0) {
    return {
      positiveHints: [] as string[],
      negativeHints: [] as string[],
    };
  }

  const positiveHints: string[] = [];
  const negativeHints: string[] = [];

  if (summary.likeMeCount > 0) {
    positiveHints.push("优先延续作者自己更像样本的判断手势、转折短句和读者桥接，不要磨平成中性说明文。");
  }
  if (summary.unlikeMeCount > 0) {
    negativeHints.push("不要把正文改写成通用解释体、模板化公众号腔或一眼不像作者本人会说的话。");
  }
  if (summary.tooTutorialCount > 0) {
    negativeHints.push("不要写成教程步骤、方法清单、培训稿或定义-拆解-总结的讲解体。");
    positiveHints.push("优先用判断句、场景推进和读者桥接推进，不要靠抽象讲解撑字数。");
  }
  if (summary.tooCommentaryCount > 0) {
    negativeHints.push("不要只停留在空泛评论；每个判断尽量带上对象、动作、代价或场景。");
  }
  if (summary.tooHardCount > summary.tooSoftCount) {
    negativeHints.push("不要连续下重锤、绝对化定性或句句审判；保留克制和留白。");
  } else if (summary.tooSoftCount > summary.tooHardCount) {
    negativeHints.push("不要铺垫过长、反复打圆场或把判断藏起来；结论要更早落地。");
    positiveHints.push("可以更早给出判断，再用事实补支撑。");
  }

  return { positiveHints, negativeHints };
}

function getExpressionExemplarCandidateScore(
  candidate: ExpressionExemplarCandidate,
  ledger?: AuthorOutcomeFeedbackLedgerContext | null,
  context?: ExpressionExemplarRuntimeContext | null,
) {
  const text = String(candidate.text || "").trim();
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const baseScoreByKind: Record<ExpressionExemplarCandidateKind, number> = {
    fragment: 2,
    judgement: 4,
    readerBridge: 3,
    emotion: 3,
    voice: 3,
    scene: 3,
    opening: 1,
    negative: 2,
    contextPositive: 4,
    feedbackPositive: 7,
    feedbackNegative: 6,
  };
  const summary = getExpressionFeedbackSummary(ledger);
  let score = baseScoreByKind[candidate.kind];

  if (context) {
    const topicMatches = countContextMatches(text, context.topicTerms, 4);
    const audienceMatches = countContextMatches(text, context.audienceTerms, 3);
    const emotionMatches = countContextMatches(text, context.emotionTerms, 3);
    const judgementMatches = countContextMatches(text, context.judgementTerms, 3);
    score += topicMatches * 2;
    score += audienceMatches * (candidate.kind === "readerBridge" ? 4 : 2);
    score += emotionMatches * (candidate.kind === "emotion" || candidate.kind === "scene" ? 4 : 2);
    score += judgementMatches * (candidate.kind === "judgement" ? 4 : 2);
    if (context.targetReader && candidate.kind === "readerBridge") score += 2;
    if (context.emotionCue && candidate.kind === "emotion") score += 2;
    if (context.judgementTerms.length > 0 && candidate.kind === "voice") score += 1;
  }

  if (!summary || summary.feedbackSampleCount <= 0) {
    return score;
  }

  if (summary.likeMeCount > 0) {
    if (candidate.kind === "judgement") score += 2;
    if (candidate.kind === "readerBridge") score += 1;
    if (candidate.kind === "fragment") score += 1;
  }
  if (summary.unlikeMeCount > 0) {
    if (candidate.kind === "judgement") score += 2;
    if (candidate.kind === "readerBridge") score += 2;
    if (candidate.kind === "scene") score += 1;
    if (candidate.kind === "opening") score -= 1;
  }
  if (summary.tooTutorialCount > 0) {
    if (candidate.kind === "judgement") score += 2;
    if (candidate.kind === "scene") score += 1;
    if (candidate.kind === "opening") score -= 2;
  }
  if (summary.tooCommentaryCount > 0) {
    if (candidate.kind === "scene") score += 2;
    if (candidate.kind === "readerBridge") score += 1;
  }
  if (summary.tooHardCount > summary.tooSoftCount) {
    if (candidate.kind === "judgement") score -= 2;
    if (candidate.kind === "scene") score += 1;
    if (candidate.kind === "readerBridge") score += 1;
  } else if (summary.tooSoftCount > summary.tooHardCount) {
    if (candidate.kind === "judgement") score += 2;
    if (candidate.kind === "fragment") score += 1;
  }

  return score;
}

function pickExpressionExemplars(
  candidates: ExpressionExemplarCandidate[],
  limit: number,
  ledger?: AuthorOutcomeFeedbackLedgerContext | null,
  context?: ExpressionExemplarRuntimeContext | null,
) {
  return candidates
    .map((candidate, index) => ({
      text: String(candidate.text || "").trim(),
      score: getExpressionExemplarCandidateScore(candidate, ledger, context),
      index,
    }))
    .filter((item) => item.text)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.text)
    .filter((text, index, values) => values.indexOf(text) === index)
    .slice(0, limit);
}

function buildReaderProximityGuide(deepWritingPayload?: Record<string, unknown> | null) {
  const payload = getRecord(deepWritingPayload);
  const viralGenomePack = getRecord(payload?.viralGenomePack);
  const sceneAnchors = getStringArray(viralGenomePack?.readerSceneAnchors, 6);
  const openingMicroScenes = getStringArray(viralGenomePack?.openingMicroScenes, 3);
  const materialJobs = getStringArray(viralGenomePack?.materialJobs, 5);
  const translationPairs = getRecordArray(viralGenomePack?.abstractToConcretePairs, 4)
    .map((item) => ({
      abstract: getString(item.abstract),
      concrete: getString(item.concrete),
    }))
    .filter((item) => item.abstract && item.concrete);

  return [
    "读者亲近感约束：",
    sceneAnchors.length
      ? `1. 当前题材优先落到这些现场词：${sceneAnchors.join("、")}。不要让正文连续三段飘在概念层。`
      : "1. 把抽象判断先翻译成读者看得见的现场、动作、代价和情绪。",
    materialJobs.length
      ? `2. 第一屏和前两节正文优先覆盖这些素材任务：${materialJobs.join("、")}。至少让其中两类出现在前 200 字。`
      : "2. 第一屏必须有具体对象、场景、数字或代价，不能只给判断。",
    translationPairs.length
      ? `3. 抽象词必须先翻译再下笔：${translationPairs.map((item) => `${item.abstract}=>${item.concrete}`).join("；")}。`
      : "3. 避免把研究腔或评论腔直接写给读者，先翻译成现场话。",
    openingMicroScenes.length
      ? `4. 开头优先从这些微场景起手：${openingMicroScenes.join("；")}。`
      : "4. 开头先从一个读者能认出来的微场景起手，再补解释。",
    "5. 每 3-5 段至少落回一次读者熟悉的动作或情绪，不要连续用概念名词推进。",
    "6. 情绪不是喊口号，而是让读者看到自己已经付出的成本、误判和难受的反差。",
  ].join("\n");
}

export function buildExpressionExemplarGuide(input: {
  title: string;
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const writingStyleProfile = input.writingStyleProfile;
  const runtimeContext = buildExpressionExemplarRuntimeContext(input);
  const expressionFeedbackHints = buildExpressionFeedbackExemplarHints(input.authorOutcomeFeedbackLedger);
  const contextualHints = buildContextualExpressionHints(runtimeContext);
  const ledgerPositiveExamples = input.authorOutcomeFeedbackLedger?.expressionExemplarProfile?.positiveExamples ?? [];
  const ledgerNegativeExamples = input.authorOutcomeFeedbackLedger?.expressionExemplarProfile?.negativeExamples ?? [];

  const positiveExamples = pickExpressionExemplars(
    [
      ...((writingStyleProfile?.reusablePromptFragments ?? []).map((item) => ({ text: item, kind: "fragment" as const }))),
      ...((writingStyleProfile?.verbatimPhraseBanks?.judgementPhrases ?? []).map((item) => ({ text: `判断句：${item}`, kind: "judgement" as const }))),
      ...((writingStyleProfile?.verbatimPhraseBanks?.readerBridgePhrases ?? []).map((item) => ({ text: `读者桥接：${item}`, kind: "readerBridge" as const }))),
      ...((writingStyleProfile?.verbatimPhraseBanks?.emotionPhrases ?? []).map((item) => ({ text: `情绪手势：${item}`, kind: "emotion" as const }))),
      ...ledgerPositiveExamples.map((item) => ({ text: `历史正例${item.sampleCount > 1 ? `（${item.sampleCount} 次）` : ""}：${item.text}`, kind: item.kind })),
      ...contextualHints.positiveHints.map((item) => ({ text: item, kind: "contextPositive" as const })),
      ...expressionFeedbackHints.positiveHints.map((item) => ({ text: item, kind: "feedbackPositive" as const })),
      ...(input.humanSignals?.realSceneOrDialogue
        ? [{ text: `场景推进：${String(input.humanSignals.realSceneOrDialogue).trim()}`, kind: "scene" as const }]
        : []),
      ...((writingStyleProfile?.openingPatterns?.[0])
        ? [{ text: `开头方式：${writingStyleProfile?.openingPatterns?.[0]}`, kind: "opening" as const }]
        : []),
    ],
    6,
    input.authorOutcomeFeedbackLedger,
    runtimeContext,
  );
  const negativeExamples = pickExpressionExemplars(
    [
      ...((writingStyleProfile?.doNotWrite ?? []).map((item) => ({ text: item, kind: "negative" as const }))),
      ...((writingStyleProfile?.tabooPatterns ?? []).map((item) => ({ text: item, kind: "negative" as const }))),
      ...ledgerNegativeExamples.map((item) => ({ text: `历史反例${item.sampleCount > 1 ? `（${item.sampleCount} 次）` : ""}：${item.text}`, kind: "negative" as const })),
      ...expressionFeedbackHints.negativeHints.map((item) => ({ text: item, kind: "feedbackNegative" as const })),
      ...(input.persona?.toneConstraints?.some((item) => /克制|冷静|不煽情|不夸张/.test(String(item || "").trim()))
        ? [{ text: "不要用过度喊话、绝对化结论或连续感叹句把判断写炸。", kind: "negative" as const }]
        : []),
      ...(input.persona?.writingStyleTags?.some((item) => /评论|观点/.test(String(item || "").trim()))
        ? [{ text: "不要把正文写回教程、步骤清单或培训稿口吻。", kind: "negative" as const }]
        : []),
    ],
    4,
    input.authorOutcomeFeedbackLedger,
    runtimeContext,
  );

  if (positiveExamples.length === 0 && negativeExamples.length === 0) {
    return "";
  }

  const lines = [
    positiveExamples.length
      ? `正例片段（借推进方式，不要整句照抄）：${positiveExamples.join("；")}`
      : null,
    negativeExamples.length
      ? `反例片段（当前稿件尽量避开）：${negativeExamples.join("；")}`
      : null,
  ].filter(Boolean);

  return lines.length ? ["请参考以下正反例表达片段：", ...lines].join("\n") : "";
}

export function buildWritingStyleGuide(writingStyleProfile?: WritingStyleProfileContext | null) {
  if (!writingStyleProfile) {
    return "";
  }

  const multiSampleProfile = isMultiSampleStableStyleProfile(writingStyleProfile);
  const lines = [
    promptLine("当前绑定写作风格资产：", writingStyleProfile.name),
    writingStyleProfile.summary ? promptLine("风格摘要：", writingStyleProfile.summary) : null,
    multiSampleProfile
      ? promptLine(
          "稳定度说明：",
          formatPromptTemplate("该资产来自 {{sampleCount}} 篇样本交叉聚合；高稳定维度作为硬约束，波动较大的维度只作弱参考。", {
            sampleCount: Number(writingStyleProfile.sampleCount || 0),
          }),
        )
      : null,
    writingStyleProfile.toneKeywords.length && meetsHardStyleConfidence(writingStyleProfile, "toneKeywords")
      ? promptLine("语气关键词：", writingStyleProfile.toneKeywords.join("、"))
      : null,
    writingStyleProfile.sentenceLengthProfile && meetsHardStyleConfidence(writingStyleProfile, "sentenceLengthProfile")
      ? promptLine("句长分布：", writingStyleProfile.sentenceLengthProfile)
      : null,
    writingStyleProfile.paragraphBreathingPattern && meetsHardStyleConfidence(writingStyleProfile, "paragraphBreathingPattern")
      ? promptLine("段落呼吸：", writingStyleProfile.paragraphBreathingPattern)
      : null,
    writingStyleProfile.structurePatterns.length && meetsHardStyleConfidence(writingStyleProfile, "structurePatterns")
      ? promptLine("结构习惯：", writingStyleProfile.structurePatterns.join("；"))
      : null,
    writingStyleProfile.transitionPatterns?.length && meetsHardStyleConfidence(writingStyleProfile, "structurePatterns")
      ? promptLine("过渡习惯：", writingStyleProfile.transitionPatterns.join("；"))
      : null,
    writingStyleProfile.languageHabits.length && meetsHardStyleConfidence(writingStyleProfile, "languageHabits")
      ? promptLine("语言习惯：", writingStyleProfile.languageHabits.join("；"))
      : null,
    writingStyleProfile.openingPatterns.length && meetsHardStyleConfidence(writingStyleProfile, "openingPatterns")
      ? promptLine("开头习惯：", writingStyleProfile.openingPatterns.join("；"))
      : null,
    writingStyleProfile.endingPatterns.length && meetsHardStyleConfidence(writingStyleProfile, "endingPatterns")
      ? promptLine("结尾习惯：", writingStyleProfile.endingPatterns.join("；"))
      : null,
    writingStyleProfile.punctuationHabits?.length && meetsHardStyleConfidence(writingStyleProfile, "punctuationHabits")
      ? promptLine("标点习惯：", writingStyleProfile.punctuationHabits.join("；"))
      : null,
    writingStyleProfile.tangentPatterns?.length && meetsHardStyleConfidence(writingStyleProfile, "tangentPatterns")
      ? promptLine("跑题方式：", writingStyleProfile.tangentPatterns.join("；"))
      : null,
    writingStyleProfile.callbackPatterns?.length && meetsHardStyleConfidence(writingStyleProfile, "callbackPatterns")
      ? promptLine("回环方式：", writingStyleProfile.callbackPatterns.join("；"))
      : null,
    writingStyleProfile.factDensity ? promptLine("事实密度：", writingStyleProfile.factDensity) : null,
    writingStyleProfile.emotionalIntensity ? promptLine("情绪幅度：", writingStyleProfile.emotionalIntensity) : null,
    writingStyleProfile.suitableTopics?.length ? promptLine("适配题材：", writingStyleProfile.suitableTopics.join("；")) : null,
    writingStyleProfile.reusablePromptFragments?.length ? promptLine("可复用写法片段：", writingStyleProfile.reusablePromptFragments.join("；")) : null,
    writingStyleProfile.verbatimPhraseBanks?.transitionPhrases?.length && meetsHardStyleConfidence(writingStyleProfile, "verbatimPhraseBanks")
      ? promptLine("逐字转场短语：", writingStyleProfile.verbatimPhraseBanks.transitionPhrases.join(" / "))
      : null,
    writingStyleProfile.verbatimPhraseBanks?.judgementPhrases?.length && meetsHardStyleConfidence(writingStyleProfile, "verbatimPhraseBanks")
      ? promptLine("逐字判断短语：", writingStyleProfile.verbatimPhraseBanks.judgementPhrases.join(" / "))
      : null,
    writingStyleProfile.verbatimPhraseBanks?.selfDisclosurePhrases?.length && meetsHardStyleConfidence(writingStyleProfile, "verbatimPhraseBanks")
      ? promptLine("逐字自我暴露短语：", writingStyleProfile.verbatimPhraseBanks.selfDisclosurePhrases.join(" / "))
      : null,
    writingStyleProfile.verbatimPhraseBanks?.emotionPhrases?.length && meetsHardStyleConfidence(writingStyleProfile, "verbatimPhraseBanks")
      ? promptLine("逐字情绪短语：", writingStyleProfile.verbatimPhraseBanks.emotionPhrases.join(" / "))
      : null,
    writingStyleProfile.verbatimPhraseBanks?.readerBridgePhrases?.length && meetsHardStyleConfidence(writingStyleProfile, "verbatimPhraseBanks")
      ? promptLine("逐字读者桥接短语：", writingStyleProfile.verbatimPhraseBanks.readerBridgePhrases.join(" / "))
      : null,
    writingStyleProfile.statePresets?.length && meetsHardStyleConfidence(writingStyleProfile, "statePresets")
      ? promptLine("状态预设：", writingStyleProfile.statePresets.join("；"))
      : null,
    writingStyleProfile.antiOutlineRules?.length && meetsHardStyleConfidence(writingStyleProfile, "antiOutlineRules")
      ? promptLine("反结构规则：", writingStyleProfile.antiOutlineRules.join("；"))
      : null,
    writingStyleProfile.tabooPatterns?.length ? promptLine("禁忌写法：", writingStyleProfile.tabooPatterns.join("；")) : null,
    writingStyleProfile.doNotWrite.length ? promptLine("明确规避：", writingStyleProfile.doNotWrite.join("；")) : null,
    writingStyleProfile.imitationPrompt ? promptLine("模仿提示：", writingStyleProfile.imitationPrompt) : null,
    multiSampleProfile
      ? (() => {
          const softHints = [
            writingStyleProfile.toneKeywords.length
              && !meetsHardStyleConfidence(writingStyleProfile, "toneKeywords")
              && meetsSoftStyleConfidence(writingStyleProfile, "toneKeywords")
              ? buildSoftStyleHint("语气关键词", writingStyleProfile.toneKeywords.join("、"))
              : null,
            writingStyleProfile.structurePatterns.length
              && !meetsHardStyleConfidence(writingStyleProfile, "structurePatterns")
              && meetsSoftStyleConfidence(writingStyleProfile, "structurePatterns")
              ? buildSoftStyleHint("结构习惯", writingStyleProfile.structurePatterns.join("；"))
              : null,
            writingStyleProfile.languageHabits.length
              && !meetsHardStyleConfidence(writingStyleProfile, "languageHabits")
              && meetsSoftStyleConfidence(writingStyleProfile, "languageHabits")
              ? buildSoftStyleHint("语言习惯", writingStyleProfile.languageHabits.join("；"))
              : null,
            writingStyleProfile.openingPatterns.length
              && !meetsHardStyleConfidence(writingStyleProfile, "openingPatterns")
              && meetsSoftStyleConfidence(writingStyleProfile, "openingPatterns")
              ? buildSoftStyleHint("开头习惯", writingStyleProfile.openingPatterns.join("；"))
              : null,
            writingStyleProfile.endingPatterns.length
              && !meetsHardStyleConfidence(writingStyleProfile, "endingPatterns")
              && meetsSoftStyleConfidence(writingStyleProfile, "endingPatterns")
              ? buildSoftStyleHint("结尾习惯", writingStyleProfile.endingPatterns.join("；"))
              : null,
            writingStyleProfile.punctuationHabits?.length
              && !meetsHardStyleConfidence(writingStyleProfile, "punctuationHabits")
              && meetsSoftStyleConfidence(writingStyleProfile, "punctuationHabits")
              ? buildSoftStyleHint("标点习惯", writingStyleProfile.punctuationHabits.join("；"))
              : null,
            writingStyleProfile.statePresets?.length
              && !meetsHardStyleConfidence(writingStyleProfile, "statePresets")
              && meetsSoftStyleConfidence(writingStyleProfile, "statePresets")
              ? buildSoftStyleHint("状态预设", writingStyleProfile.statePresets.join("；"))
              : null,
            writingStyleProfile.antiOutlineRules?.length
              && !meetsHardStyleConfidence(writingStyleProfile, "antiOutlineRules")
              && meetsSoftStyleConfidence(writingStyleProfile, "antiOutlineRules")
              ? buildSoftStyleHint("反结构规则", writingStyleProfile.antiOutlineRules.join("；"))
              : null,
          ].filter(Boolean);
          return softHints.length ? promptLine("弱参考维度：", softHints.join("；")) : null;
        })()
      : null,
    "要求：吸收节奏、结构和语气，不要照抄源文句子；逐字短语库只能借口头连接和判断手势，不能机械拼贴成模板。",
  ].filter(Boolean);

  return ["请额外遵守以下文风资产约束：", ...lines].join("\n");
}

export function buildAuthorOutcomeFeedbackGuide(ledger?: AuthorOutcomeFeedbackLedgerContext | null) {
  if (!ledger || ledger.sampleCount <= 0) {
    return "";
  }

  const recommendationLines = [
    ledger.recommendations.prototype
      ? `原型优先：${ledger.recommendations.prototype.label}（历史 ${ledger.recommendations.prototype.sampleCount} 篇）`
      : null,
    ledger.recommendations.stateVariant
      ? `状态优先：${ledger.recommendations.stateVariant.label}（历史 ${ledger.recommendations.stateVariant.sampleCount} 篇）`
      : null,
    ledger.recommendations.openingPattern
      ? `开头优先：${ledger.recommendations.openingPattern.label}（历史 ${ledger.recommendations.openingPattern.sampleCount} 篇）`
      : null,
    ledger.recommendations.sectionRhythm
      ? `节奏优先：${ledger.recommendations.sectionRhythm.label}（历史 ${ledger.recommendations.sectionRhythm.sampleCount} 篇）`
      : null,
  ].filter(Boolean);
  if (recommendationLines.length === 0) {
    return "";
  }

  const summary = `当前作者侧已有 ${ledger.sampleCount} 篇结果样本，其中 ${ledger.positiveSampleCount} 篇呈现正向反馈。`;
  return [
    "请参考以下作者级结果反馈：",
    summary,
    ...recommendationLines,
    "要求：优先吸收这些高命中表达倾向，但如果与当前素材、人设或研究结论冲突，以当前稿件事实和人设稳定度为先，不要硬套。",
  ].join("\n");
}

export function buildGenerationSystemSegments(input: {
  basePrompt: string;
  personaGuide?: string;
  writingStyleGuide?: string;
  styleGuide?: string | null;
  cacheableBlocks?: Array<string | null | undefined>;
  contextualBlocks?: Array<string | null | undefined>;
}) {
  const cacheableBlocks = input.cacheableBlocks ?? [
    input.personaGuide,
    input.writingStyleGuide,
    input.styleGuide,
  ];
  return buildGatewaySystemSegments([
    { text: input.basePrompt, cacheable: true },
    ...cacheableBlocks.map((text) => ({ text, cacheable: true })),
    ...(input.contextualBlocks ?? []).map((text) => ({ text, cacheable: false })),
  ]);
}

function buildOutlineGuide(outlineNodes: OutlineNodeContext[] = []) {
  if (outlineNodes.length === 0) {
    return "";
  }

  return [
    "当前稿件大纲锚点：",
    ...outlineNodes.map((node, index) =>
      promptLine(
        String(index + 1) + ". ",
        formatPromptTemplate("{{title}}{{descriptionPart}}", {
          title: node.title,
          descriptionPart: node.description ? "：" + node.description : "",
        }),
      )),
  ].join("\n");
}

function buildKnowledgeGuide(knowledgeCards: KnowledgeCardContext[] = []) {
  if (knowledgeCards.length === 0) {
    return "";
  }

  return [
    "相关背景卡：",
    ...knowledgeCards.map((card, index) =>
      [
        promptLine(
          String(index + 1) + ". ",
          formatPromptTemplate("{{title}}（状态：{{status}}，置信度：{{confidence}}%{{matchedPart}}）", {
            title: card.title,
            status: card.status,
            confidence: Math.round(card.confidenceScore * 100),
            matchedPart: card.matchedFragmentCount ? "，命中挂载素材 " + String(card.matchedFragmentCount) + " 条" : "",
          }),
        ),
        card.summary ? promptLine("摘要：", card.summary) : null,
        card.latestChangeSummary ? promptLine("最近变化：", card.latestChangeSummary) : null,
        card.keyFacts.length ? promptLine("关键事实：", card.keyFacts.slice(0, 3).join("；")) : null,
        card.overturnedJudgements?.length ? promptLine("待重验旧判断：", card.overturnedJudgements.slice(0, 2).join("；")) : null,
        card.openQuestions?.length ? promptLine("待确认：", card.openQuestions.slice(0, 2).join("；")) : null,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
}

function buildImageGuide(imageFragments: ImageFragmentContext[] = []) {
  if (imageFragments.length === 0) {
    return "";
  }
  return [
    "截图素材必须自然插入正文，且原样使用，不要改写成伪引用：",
    ...imageFragments.map((item, index) =>
      promptLine(
        String(index + 1) + ". ",
        formatPromptTemplate("{{title}}：请在合适段落使用 Markdown 图片语法 ![{{alt}}]({{path}})", {
          title: item.title || "截图素材 " + String(index + 1),
          alt: item.title || "截图素材 " + String(index + 1),
          path: item.screenshotPath,
        }),
      )),
  ].join("\n");
}

function buildHistoryReferenceGuide(historyReferences: HistoryReferenceContext[] = []) {
  if (historyReferences.length === 0) {
    return "";
  }
  return [
    "历史文章只能自然引用，不允许生成文末相关阅读区块，也不要生成链接列表：",
    ...historyReferences.map((item, index) =>
      promptLine(
        String(index + 1) + ". ",
        formatPromptTemplate("《{{title}}》{{relationPart}}{{bridgePart}}", {
          title: item.title,
          relationPart: item.relationReason ? "：" + item.relationReason : "",
          bridgePart: item.bridgeSentence ? "；可用桥接句：" + item.bridgeSentence : "",
        }),
      )),
  ].join("\n");
}

function buildResearchPriorityFragments(
  researchBrief?: ResearchBriefContext | null,
  strategyCard?: StrategyCardContext | null,
) {
  if (!researchBrief) {
    return [];
  }
  const timelineLines = (researchBrief.timelineCards ?? [])
    .slice(0, 3)
    .map((item) => [String(item.phase || "").trim(), String(item.title || "").trim(), String(item.summary || "").trim()].filter(Boolean).join("："));
  const comparisonLines = (researchBrief.comparisonCards ?? [])
    .slice(0, 3)
    .map((item) =>
      [
        String(item.subject || "").trim(),
        String(item.position || "").trim(),
        Array.isArray(item.differences) ? item.differences.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 2).join("、") : "",
      ].filter(Boolean).join("："),
    );
  const insightLines = (researchBrief.intersectionInsights ?? [])
    .slice(0, 3)
    .map((item) => {
      const insight = String(item.insight || "").trim();
      const whyNow = String(item.whyNow || "").trim();
      return insight
        ? formatPromptTemplate("{{insight}}{{whyNowPart}}", {
            insight,
            whyNowPart: whyNow ? "（" + whyNow + "）" : "",
          })
        : "";
    });
  const preferredResearchSignals = resolveResearchStrategySignals({
    researchBrief,
    strategyCard,
  });

  return dedupeText(
    [
      researchBrief.coreQuestion ? promptLine("研究核心问题：", String(researchBrief.coreQuestion).trim()) : null,
      ...timelineLines.map((item) => promptLine("时间脉络：", item)),
      ...comparisonLines.map((item) => promptLine("横向比较：", item)),
      ...insightLines.map((item) => promptLine("交汇洞察：", item)),
      preferredResearchSignals.coreAssertion ? promptLine("主判断：", preferredResearchSignals.coreAssertion) : null,
      preferredResearchSignals.marketPositionInsight ? promptLine("市场位置判断：", preferredResearchSignals.marketPositionInsight) : null,
      preferredResearchSignals.historicalTurningPoint ? promptLine("历史转折点：", preferredResearchSignals.historicalTurningPoint) : null,
      preferredResearchSignals.researchHypothesis ? promptLine("研究假设：", preferredResearchSignals.researchHypothesis) : null,
    ],
    8,
  );
}

function buildResearchGuide(input: {
  researchBrief?: ResearchBriefContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
}) {
  if (!input.researchBrief && !input.seriesInsight) {
    return "";
  }
  const preferredResearchSignals = resolveResearchStrategySignals({
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
  });
  const lines = [
    input.researchBrief?.summary ? promptLine("研究摘要：", String(input.researchBrief.summary).trim()) : null,
    input.researchBrief?.coreQuestion ? promptLine("研究核心问题：", String(input.researchBrief.coreQuestion).trim()) : null,
    input.researchBrief?.mustCoverAngles?.length ? promptLine("必查维度：", input.researchBrief.mustCoverAngles.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5).join("；")) : null,
    input.researchBrief?.timelineCards?.length
      ? promptLine("时间脉络优先顺序：", input.researchBrief.timelineCards.slice(0, 3).map((item) => [String(item.phase || "").trim(), String(item.summary || "").trim()].filter(Boolean).join("：")).filter(Boolean).join("；"))
      : null,
    input.researchBrief?.comparisonCards?.length
      ? promptLine("横向比较优先顺序：", input.researchBrief.comparisonCards.slice(0, 3).map((item) => [String(item.subject || "").trim(), String(item.position || "").trim()].filter(Boolean).join("：")).filter(Boolean).join("；"))
      : null,
    input.researchBrief?.intersectionInsights?.length
      ? promptLine("交汇洞察：", input.researchBrief.intersectionInsights.slice(0, 3).map((item) => {
          const insight = String(item.insight || "").trim();
          const whyNow = String(item.whyNow || "").trim();
          return insight
            ? formatPromptTemplate("{{insight}}{{whyNowPart}}", {
                insight,
                whyNowPart: whyNow ? "（" + whyNow + "）" : "",
              })
            : "";
        }).filter(Boolean).join("；"))
      : null,
    preferredResearchSignals.coreAssertion ? promptLine("当前策略主判断：", preferredResearchSignals.coreAssertion) : null,
    preferredResearchSignals.whyNow ? promptLine("当前策略 why now：", preferredResearchSignals.whyNow) : null,
    preferredResearchSignals.marketPositionInsight ? promptLine("当前策略位置判断：", preferredResearchSignals.marketPositionInsight) : null,
    preferredResearchSignals.historicalTurningPoint ? promptLine("当前策略历史转折：", preferredResearchSignals.historicalTurningPoint) : null,
    preferredResearchSignals.researchHypothesis ? promptLine("当前策略研究假设：", preferredResearchSignals.researchHypothesis) : null,
    input.seriesInsight?.label ? promptLine("系列标签：", String(input.seriesInsight.label).trim()) : null,
    input.seriesInsight?.reason ? promptLine("系列主轴：", String(input.seriesInsight.reason).trim()) : null,
    input.seriesInsight?.coreStances?.length ? promptLine("系列核心立场：", input.seriesInsight.coreStances.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3).join("；")) : null,
    input.seriesInsight?.whyNow?.length ? promptLine("系列为什么现在值得写：", input.seriesInsight.whyNow.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3).join("；")) : null,
    "正文必须优先消化研究卡片里的时间节点、横向差异和交汇洞察，而不是把原始素材直接排成流水账。",
  ].filter(Boolean);

  return lines.length ? ["请优先遵守以下研究层约束：", ...lines].join("\n") : "";
}

function buildInformationGainGuide(input: {
  fragments?: string[];
  researchBrief?: ResearchBriefContext | null;
  knowledgeCards?: KnowledgeCardContext[];
  historyReferences?: HistoryReferenceContext[];
}) {
  const lines = [
    "正文至少要有 1 个事实锚点和 1 个判断锚点；有条件时再补 1 个反证/边界或 1 个场景锚点。",
    input.researchBrief?.timelineCards?.length
      ? "既然研究里有时间脉络，正文必须吸收至少 1 个阶段变化或时间节点，不要只重复结论。"
      : null,
    input.researchBrief?.comparisonCards?.length
      ? "既然研究里有横向比较，正文必须写出至少 1 组对照，不要把材料排成并列清单。"
      : null,
    input.researchBrief?.intersectionInsights?.length
      ? "既然研究里有交汇洞察，正文必须补一句“这意味着什么”，不要停在素材陈列。"
      : null,
    input.knowledgeCards?.some((card) => card.status === "conflicted" || (card.overturnedJudgements?.length ?? 0) > 0)
      ? "已有冲突卡或被推翻判断时，正文至少保留 1 句边界或反向材料，避免写成单边定论。"
      : null,
    input.historyReferences?.length
      ? "历史文章优先拿来补阶段变化、旧判断为何失效或为什么这次变量不同，不要只重复旧文结论。"
      : null,
    (input.fragments?.length ?? 0) > 0
      ? "如果素材里已有现场感细节，至少拿 1 个时间、动作、对话或屏幕/场景信号把判断压回现实处境。"
      : null,
  ].filter(Boolean);

  return lines.length ? ["请优先遵守以下信息增益约束：", ...lines].join("\n") : "";
}

function buildSeriesRuntimeGuide(seriesInsight?: SeriesInsightContext | null) {
  if (!seriesInsight) {
    return "";
  }
  const lines = [
    seriesInsight.preHook ? promptLine("系列前钩子：", String(seriesInsight.preHook).trim()) : null,
    seriesInsight.postHook ? promptLine("系列后钩子：", String(seriesInsight.postHook).trim()) : null,
    seriesInsight.platformPreference ? promptLine("平台偏好：", String(seriesInsight.platformPreference).trim()) : null,
    seriesInsight.targetPackHint ? promptLine("系列默认目标包：", String(seriesInsight.targetPackHint).trim()) : null,
    seriesInsight.defaultArchetype ? promptLine("系列默认原型：", String(seriesInsight.defaultArchetype).trim()) : null,
    seriesInsight.defaultLayoutTemplateId ? promptLine("系列默认排版模板：", String(seriesInsight.defaultLayoutTemplateId).trim()) : null,
  ].filter(Boolean);
  return lines.length ? ["如果不与当前正文冲突，请优先沿用以下系列运行时默认值：", ...lines].join("\n") : "";
}

function buildDeepWritingBehaviorGuide(deepWritingPayload?: Record<string, unknown> | null) {
  const payload = getRecord(deepWritingPayload);
  if (!payload) {
    return "";
  }
  const requiredOpeningLead = getRequiredOpeningLead(payload);
  const lines = [
    requiredOpeningLead
      ? [
          "开头硬约束：正文标题后的第一段必须直接采用或高度贴近以下开头，不得先铺背景、不得先解释主题、不得在审校阶段改弱。",
          requiredOpeningLead,
          "首段控制在 80 字以内；前 200 字必须兑现标题承诺的一部分价值。",
        ].join("\n")
      : null,
    getString(payload.articlePrototypeLabel)
      ? promptLine(
          "当前执行卡原型：",
          formatPromptTemplate("{{label}}{{prototypePart}}", {
            label: getString(payload.articlePrototypeLabel),
            prototypePart: getString(payload.articlePrototype) ? "（" + getString(payload.articlePrototype) + "）" : "",
          }),
        )
      : null,
    getString(payload.articlePrototypeReason) ? promptLine("原型切换原因：", getString(payload.articlePrototypeReason)) : null,
    getString(payload.stateVariantLabel) ? promptLine("当前执行卡状态：", getString(payload.stateVariantLabel)) : null,
    getString(payload.stateVariantReason) ? promptLine("状态切换原因：", getString(payload.stateVariantReason)) : null,
    getString(payload.progressiveRevealLabel) ? promptLine("节奏插件：", getString(payload.progressiveRevealLabel)) : null,
    getString(payload.progressiveRevealReason) ? promptLine("节奏插件原因：", getString(payload.progressiveRevealReason)) : null,
    getString(payload.climaxPlacement) ? promptLine("高潮位置：", getString(payload.climaxPlacement)) : null,
    getString(payload.escalationRule) ? promptLine("升级规则：", getString(payload.escalationRule)) : null,
    getStringArray(payload.stateChecklist, 5).length ? promptLine("状态自检：", getStringArray(payload.stateChecklist, 5).join("；")) : null,
    getStringArray(payload.voiceChecklist, 5).length ? promptLine("表达约束：", getStringArray(payload.voiceChecklist, 5).join("；")) : null,
    getStringArray(payload.diversitySuggestions, 3).length ? promptLine("去重动作：", getStringArray(payload.diversitySuggestions, 3).join("；")) : null,
    getStringArray(payload.mustUseFacts, 5).length ? promptLine("必须吃透的事实：", getStringArray(payload.mustUseFacts, 5).join("；")) : null,
    "优先执行上面的原型、状态、节奏和约束，再把结构当作主线提醒，不要逐节翻译执行卡。",
  ].filter(Boolean);
  return lines.length ? ["请优先遵守以下 deepWriting 行为约束：", ...lines].join("\n") : "";
}

function getRequiredOpeningLead(deepWritingPayload?: Record<string, unknown> | null) {
  const raw = getString(deepWritingPayload?.openingStrategy);
  if (!raw) {
    return "";
  }
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)[0]
    ?.replace(/\s+/g, " ")
    .trim() || "";
  if (!normalized || normalized.length < 16 || normalized.length > 220) {
    return "";
  }
  if (/^(开头|策略|起手|要求|请|建议|采用|使用|沿用|已确认|围绕|第一段|首段|默认)/.test(normalized)) {
    return "";
  }
  if (/(不要|不得|必须|需要|应该|候选|模式|策略|第一段|首段|前两句|再补|再给|先抛|先写|回写|正文生成器|匿名复盘现场起手|让读者看见|引出)/.test(normalized)) {
    return "";
  }
  return normalized;
}

function splitMarkdownTitleBlock(markdown: string) {
  const normalized = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { titleBlock: "", body: "" };
  }
  const lines = normalized.split("\n");
  if (!lines[0]?.startsWith("# ")) {
    return { titleBlock: "", body: normalized };
  }
  let cursor = 1;
  while (cursor < lines.length && !lines[cursor]?.trim()) {
    cursor += 1;
  }
  return {
    titleBlock: lines[0].trim(),
    body: lines.slice(cursor).join("\n").trimStart(),
  };
}

function applyRequiredOpeningLead(markdown: string, openingLead: string) {
  const requiredLead = getRequiredOpeningLead({ openingStrategy: openingLead });
  if (!requiredLead) {
    return markdown;
  }
  const { titleBlock, body } = splitMarkdownTitleBlock(markdown);
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const normalizedLead = requiredLead.replace(/\s+/g, " ").trim();
  const firstContentIndex = blocks.findIndex((block) => !/^#/.test(block) && !/^\s*[-*]\s+/.test(block));
  if (firstContentIndex >= 0) {
    const currentLead = blocks[firstContentIndex]!.replace(/\s+/g, " ").trim();
    if (currentLead.startsWith(normalizedLead.slice(0, 32)) || normalizedLead.startsWith(currentLead.slice(0, 32))) {
      return markdown;
    }
    blocks[firstContentIndex] = requiredLead;
  } else {
    blocks.unshift(requiredLead);
  }
  return [titleBlock, blocks.join("\n\n")].filter(Boolean).join("\n\n").trim();
}

function replaceFirstReaderFacingBlock(markdown: string, replacement: string) {
  const normalizedReplacement = String(replacement || "").trim();
  if (!normalizedReplacement) {
    return markdown;
  }
  const { titleBlock, body } = splitMarkdownTitleBlock(markdown);
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const firstContentIndex = blocks.findIndex((block) => !/^#/.test(block) && !/^\s*[-*]\s+/.test(block));
  if (firstContentIndex >= 0) {
    blocks[firstContentIndex] = normalizedReplacement;
  } else {
    blocks.unshift(normalizedReplacement);
  }
  return [titleBlock, blocks.join("\n\n")].filter(Boolean).join("\n\n").trim();
}

export async function buildGeneratedArticleDraft(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  promptContext?: {
    userId?: number | null;
    role?: string | null;
    planCode?: string | null;
  };
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  layoutStrategy?: LayoutStrategyConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  imageFragments?: ImageFragmentContext[];
  historyReferences?: HistoryReferenceContext[];
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
  deepWritingGuide?: string;
}): Promise<GenerationBuildResult> {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPromptWithMeta("article_write", input.promptContext),
    loadPromptWithMeta("language_guard_audit", input.promptContext),
  ]);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt.ref]);

  const prioritizedResearchFragments = buildResearchPriorityFragments(input.researchBrief, input.strategyCard);
  const mergedFragments = dedupeText([...prioritizedResearchFragments, ...input.fragments], 16);
  const fragmentText = mergedFragments.length > 0 ? mergedFragments.join("\n- ") : "当前没有素材，请根据标题先搭一版简洁骨架。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const authorOutcomeFeedbackGuide = buildAuthorOutcomeFeedbackGuide(input.authorOutcomeFeedbackLedger);
  const expressionExemplarGuide = buildExpressionExemplarGuide({
    title: input.title,
    persona: input.persona,
    writingStyleProfile: input.writingStyleProfile,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    humanSignals: input.humanSignals,
    authorOutcomeFeedbackLedger: input.authorOutcomeFeedbackLedger,
    deepWritingPayload: input.deepWritingPayload,
  });
  const preferredPrototypeCode = resolvePreferredPrototypeCodeFromRuntime(input);
  const preferredStateVariantCode = resolvePreferredStateVariantCodeFromRuntime(input);
  const archetypeRhythmHints = await resolveGenerationRhythmHints({
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const writingState = buildWritingStateKernel({
    title: input.title,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    archetypeRhythmHints,
    preferredPrototypeCode,
    preferredVariantCode: preferredStateVariantCode,
  });
  const humanSignalGuide = buildHumanSignalGuide(input.humanSignals ?? null);
  const writingStateGuide = buildWritingStateGuide(writingState);
  const deepWritingBehaviorGuide = buildDeepWritingBehaviorGuide(input.deepWritingPayload);
  const readerProximityGuide = buildReaderProximityGuide(input.deepWritingPayload);
  const styleGuide = buildStyleGuide(input.layoutStrategy);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const imageGuide = buildImageGuide(input.imageFragments);
  const historyGuide = buildHistoryReferenceGuide(input.historyReferences);
  const researchGuide = buildResearchGuide({
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const informationGainGuide = buildInformationGainGuide({
    fragments: mergedFragments,
    researchBrief: input.researchBrief,
    knowledgeCards: input.knowledgeCards,
    historyReferences: input.historyReferences,
  });
  const seriesRuntimeGuide = buildSeriesRuntimeGuide(input.seriesInsight);
  const deepWritingGuide = input.deepWritingGuide?.trim() ? input.deepWritingGuide.trim() : "";
  const writerSystemSegments = buildGenerationSystemSegments({
    basePrompt: writePrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, readerProximityGuide, researchGuide, expressionExemplarGuide, informationGainGuide, seriesRuntimeGuide, deepWritingGuide],
  });
  const auditSystemSegments = buildGenerationSystemSegments({
    basePrompt: auditPrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, readerProximityGuide, researchGuide, expressionExemplarGuide, informationGainGuide],
  });

  const writerUserPrompt = [
    promptLine("标题：", input.title),
    promptLine("禁用词：", bannedWordsText),
    outlineGuide ? promptBlock("松散大纲骨架（只作为主线提醒，不要写成编号施工图）：", outlineGuide) : "",
    knowledgeGuide,
    imageGuide,
    historyGuide,
    "请基于以下事实素材输出一篇中文 Markdown 正文。",
    "正文优先调用研究卡片里的时间节点、对比关系和交汇洞察，再决定怎么组织普通素材。",
    "优先遵守人类信号、写作状态和 deepWriting 行为约束，再参考大纲与执行卡主线。",
    "必须把抽象判断翻译成读者熟悉的账户现场、预算动作、复盘困惑和具体反差；不要连续用概念名词推进。",
    "如果需要引用历史已发布文章，只能自然写进相关段落，不要生成“相关文章”或“延伸阅读”区块。",
    "要求：先像作者本人在写，再像编辑在收束。不要写成结构模板、讲义或总结稿；不要解释你的过程；只返回正文 Markdown。",
    "",
    promptBlock("素材：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
  ].join("\n");

  try {
    const drafted = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "articleWrite",
        systemPrompt: "",
        systemSegments: writerSystemSegments,
        userPrompt: writerUserPrompt,
        temperature: 0.5,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      ARTICLE_WRITE_TIMEOUT_MS,
      "正文生成 AI 超时",
    );

    const auditUserPrompt = [
      promptBlock("原始事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
      "",
      promptBlock("待审校正文：", drafted.text),
      "",
      promptLine("禁用词：", bannedWordsText),
      "请输出净化后的最终 Markdown 正文，不要解释。除了禁用词，还要把研究腔、抽象腔和读者距离感改成更贴近公众号读者的现场表达。",
    ].join("\n");

    const audited = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "languageGuardAudit",
        systemPrompt: "",
        systemSegments: auditSystemSegments,
        userPrompt: auditUserPrompt,
        temperature: 0.2,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      LANGUAGE_GUARD_TIMEOUT_MS,
      "正文审校 AI 超时",
    );

    const sanitizedMarkdown = sanitizeGeneratedMarkdownForReader(sanitizeBannedWords(audited.text.trim(), input.bannedWords));
    const finalMarkdown = applyRequiredOpeningLead(sanitizedMarkdown, getRequiredOpeningLead(input.deepWritingPayload));
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: mergedFragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
        historyReferences: input.historyReferences,
      }),
    };
  } catch {
    const fallbackMarkdown = buildLocalDraft({
      title: input.title,
      fragments: mergedFragments,
      bannedWords: input.bannedWords,
      prompt: writePrompt.content,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
      imageGuide,
      historyGuide,
      researchGuide,
      deepWritingGuide,
      deepWritingPayload: input.deepWritingPayload,
    });
    const finalMarkdown = applyRequiredOpeningLead(fallbackMarkdown, getRequiredOpeningLead(input.deepWritingPayload));
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: mergedFragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
        historyReferences: input.historyReferences,
      }),
    };
  }
}

export async function buildGeneratedOpeningPreview(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  promptContext?: {
    userId?: number | null;
    role?: string | null;
    planCode?: string | null;
  };
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  layoutStrategy?: LayoutStrategyConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  imageFragments?: ImageFragmentContext[];
  historyReferences?: HistoryReferenceContext[];
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
  deepWritingGuide?: string;
}): Promise<GenerationBuildResult> {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPromptWithMeta("article_write", input.promptContext),
    loadPromptWithMeta("language_guard_audit", input.promptContext),
  ]);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt.ref]);

  const prioritizedResearchFragments = buildResearchPriorityFragments(input.researchBrief, input.strategyCard);
  const mergedFragments = dedupeText([...prioritizedResearchFragments, ...input.fragments], 8);
  const fragmentText = mergedFragments.length > 0 ? mergedFragments.join("\n- ") : "当前没有素材，请围绕标题先给一句结论和一个具体切口。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const authorOutcomeFeedbackGuide = buildAuthorOutcomeFeedbackGuide(input.authorOutcomeFeedbackLedger);
  const expressionExemplarGuide = buildExpressionExemplarGuide({
    title: input.title,
    persona: input.persona,
    writingStyleProfile: input.writingStyleProfile,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    humanSignals: input.humanSignals,
    authorOutcomeFeedbackLedger: input.authorOutcomeFeedbackLedger,
    deepWritingPayload: input.deepWritingPayload,
  });
  const preferredPrototypeCode = resolvePreferredPrototypeCodeFromRuntime(input);
  const preferredStateVariantCode = resolvePreferredStateVariantCodeFromRuntime(input);
  const archetypeRhythmHints = await resolveGenerationRhythmHints({
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const writingState = buildWritingStateKernel({
    title: input.title,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    archetypeRhythmHints,
    preferredPrototypeCode,
    preferredVariantCode: preferredStateVariantCode,
  });
  const humanSignalGuide = buildHumanSignalGuide(input.humanSignals ?? null);
  const writingStateGuide = buildWritingStateGuide(writingState);
  const deepWritingBehaviorGuide = buildDeepWritingBehaviorGuide(input.deepWritingPayload);
  const styleGuide = buildStyleGuide(input.layoutStrategy);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const imageGuide = buildImageGuide(input.imageFragments);
  const historyGuide = buildHistoryReferenceGuide(input.historyReferences);
  const researchGuide = buildResearchGuide({
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const informationGainGuide = buildInformationGainGuide({
    fragments: mergedFragments,
    researchBrief: input.researchBrief,
    knowledgeCards: input.knowledgeCards,
    historyReferences: input.historyReferences,
  });
  const seriesRuntimeGuide = buildSeriesRuntimeGuide(input.seriesInsight);
  const deepWritingGuide = input.deepWritingGuide?.trim() ? input.deepWritingGuide.trim() : "";
  const writerSystemSegments = buildGenerationSystemSegments({
    basePrompt: writePrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, expressionExemplarGuide, informationGainGuide, seriesRuntimeGuide, deepWritingGuide],
  });
  const auditSystemSegments = buildGenerationSystemSegments({
    basePrompt: auditPrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, expressionExemplarGuide, informationGainGuide],
  });

  const writerUserPrompt = [
    promptLine("标题：", input.title),
    promptLine("禁用词：", bannedWordsText),
    outlineGuide ? promptBlock("主线提醒（只作为主线提醒，不要写成编号施工图）：", outlineGuide) : "",
    knowledgeGuide,
    imageGuide,
    historyGuide,
    "请只输出这篇文章的开头预览，不要写完整正文。",
    "长度控制在 1-2 段、120-220 字。",
    "要求：第一句就进入具体现象、冲突、判断或场景；能明显看出当前原型 / 状态的差异；不要编号、不要总结、不要解释你的过程。",
    "",
    promptBlock("可用素材：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
  ].join("\n");

  try {
    const drafted = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "articleWrite",
        systemPrompt: "",
        systemSegments: writerSystemSegments,
        userPrompt: writerUserPrompt,
        temperature: 0.6,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      ARTICLE_WRITE_TIMEOUT_MS,
      "开头预览 AI 超时",
    );

    const auditUserPrompt = [
      promptBlock("原始事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
      "",
      promptBlock("待审校开头预览：", drafted.text),
      "",
      promptLine("禁用词：", bannedWordsText),
      "请输出净化后的最终开头预览，不要解释，不要补完整文。",
    ].join("\n");

    const audited = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "languageGuardAudit",
        systemPrompt: "",
        systemSegments: auditSystemSegments,
        userPrompt: auditUserPrompt,
        temperature: 0.2,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      LANGUAGE_GUARD_TIMEOUT_MS,
      "开头审校 AI 超时",
    );

    const finalMarkdown = sanitizeBannedWords(audited.text.trim(), input.bannedWords);
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: mergedFragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
        historyReferences: input.historyReferences,
        mode: "preview",
      }),
    };
  } catch {
    const finalMarkdown = buildLocalOpeningPreview({
        title: input.title,
        fragments: input.fragments,
        bannedWords: input.bannedWords,
        deepWritingPayload: input.deepWritingPayload,
      });
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: input.fragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
        historyReferences: input.historyReferences,
        mode: "preview",
      }),
    };
  }
}

function buildLocalRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
  personaGuide?: string;
  writingStyleGuide?: string;
  humanSignalGuide?: string;
  writingStateGuide?: string;
  deepWritingBehaviorGuide?: string;
  styleGuide?: string | null;
  outlineGuide?: string;
  knowledgeGuide?: string;
  researchGuide?: string;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const base = input.markdownContent.trim() || buildLocalDraft({
    title: input.title,
    fragments: input.fragments,
    bannedWords: input.bannedWords,
    prompt: "先根据当前命令生成一版可继续编辑的骨架。",
    personaGuide: input.personaGuide,
    writingStyleGuide: input.writingStyleGuide,
    humanSignalGuide: input.humanSignalGuide,
    writingStateGuide: input.writingStateGuide,
    deepWritingBehaviorGuide: input.deepWritingBehaviorGuide,
    styleGuide: input.styleGuide,
    outlineGuide: input.outlineGuide,
    knowledgeGuide: input.knowledgeGuide,
    researchGuide: input.researchGuide,
    deepWritingPayload: input.deepWritingPayload,
  });
  const researchSignalText = String(input.researchGuide || "")
    .split("\n")
    .map((line) => line.replace(/^.*?：/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !base.includes(line))
    .slice(0, 4)
    .join("；");
  const baseWithResearchSignals = researchSignalText ? base + "\n\n" + researchSignalText : base;

  if (/小标题/.test(input.command)) {
    return sanitizeBannedWords(
      baseWithResearchSignals + "\n\n## 小标题一\n围绕当前主题先把结论写硬。\n\n## 小标题二\n把事实和利益变化拆开。\n\n## 小标题三\n最后落回读者当下处境。",
      input.bannedWords,
    );
  }

  if (/扩写|补/.test(input.command)) {
    const extra = input.fragments.slice(0, 2).join("；") || "补一段更具体的事实锚点和判断转折。";
    return sanitizeBannedWords(baseWithResearchSignals + "\n\n" + extra, input.bannedWords);
  }

  if (/语言守卫|禁用表达|替换|净化/.test(input.command)) {
    return sanitizeBannedWords(baseWithResearchSignals, input.bannedWords);
  }

  return sanitizeBannedWords(baseWithResearchSignals, input.bannedWords);
}

export async function buildCommandRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
  skipAudit?: boolean;
  promptContext?: {
    userId?: number | null;
    role?: string | null;
    planCode?: string | null;
  };
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  layoutStrategy?: LayoutStrategyConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
}): Promise<GenerationBuildResult> {
  const writePrompt = await loadPromptWithMeta("article_write", input.promptContext);
  const auditPrompt = input.skipAudit ? null : await loadPromptWithMeta("language_guard_audit", input.promptContext);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt?.ref]);

  const compactFragments = compactPromptFragments(input.fragments, 14, 520);
  const fragmentText = compactFragments.length > 0 ? compactFragments.join("\n- ") : "当前没有额外素材，请尽量保留已有事实，不要空泛扩写。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const authorOutcomeFeedbackGuide = buildAuthorOutcomeFeedbackGuide(input.authorOutcomeFeedbackLedger);
  const expressionExemplarGuide = buildExpressionExemplarGuide({
    title: input.title,
    persona: input.persona,
    writingStyleProfile: input.writingStyleProfile,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    humanSignals: input.humanSignals,
    authorOutcomeFeedbackLedger: input.authorOutcomeFeedbackLedger,
    deepWritingPayload: input.deepWritingPayload,
  });
  const preferredPrototypeCode = resolvePreferredPrototypeCodeFromRuntime(input);
  const preferredStateVariantCode = resolvePreferredStateVariantCodeFromRuntime(input);
  const archetypeRhythmHints = await resolveGenerationRhythmHints({
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    archetypeRhythmHints,
    preferredPrototypeCode,
    preferredVariantCode: preferredStateVariantCode,
  });
  const humanSignalGuide = buildHumanSignalGuide(input.humanSignals ?? null);
  const writingStateGuide = buildWritingStateGuide(writingState);
  const deepWritingBehaviorGuide = buildDeepWritingBehaviorGuide(input.deepWritingPayload);
  const styleGuide = buildStyleGuide(input.layoutStrategy);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const researchGuide = buildResearchGuide({
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const informationGainGuide = buildInformationGainGuide({
    fragments: compactFragments,
    researchBrief: input.researchBrief,
    knowledgeCards: input.knowledgeCards,
    historyReferences: [],
  });
  const seriesRuntimeGuide = buildSeriesRuntimeGuide(input.seriesInsight);
  const writerSystemSegments = buildGenerationSystemSegments({
    basePrompt: writePrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, expressionExemplarGuide, informationGainGuide, seriesRuntimeGuide],
  });
  const auditSystemSegments = auditPrompt
    ? buildGenerationSystemSegments({
        basePrompt: auditPrompt.content,
        cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
        contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, expressionExemplarGuide, informationGainGuide],
      })
    : null;

  const writerUserPrompt = [
    promptLine("标题：", input.title),
    promptLine("编辑命令：", input.command),
    promptLine("禁用词：", bannedWordsText),
    outlineGuide ? promptBlock("主线提醒（只作为主线提醒，不要写成编号施工图）：", outlineGuide) : "",
    knowledgeGuide,
    "",
    "请基于当前正文执行改写命令，输出完整 Markdown 正文。",
    "优先遵守人类信号、写作状态和 deepWriting 行为约束，再参考大纲与知识卡。",
    "要求：不要解释，不要列步骤，直接返回改写后的整篇正文。不要把文章改写回模板腔、总结腔或施工图腔。",
    "",
    promptBlock("当前正文：", input.markdownContent || "(当前为空，请先生成骨架正文)"),
    "",
    promptBlock("可用素材：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
  ].join("\n");

  try {
    const drafted = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "articleWrite",
        systemPrompt: "",
        systemSegments: writerSystemSegments,
        userPrompt: writerUserPrompt,
        temperature: 0.4,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      ARTICLE_WRITE_TIMEOUT_MS,
      "文章改写 AI 超时",
    );

    if (input.skipAudit) {
      const sanitizedMarkdown = sanitizeBannedWords(drafted.text.trim(), input.bannedWords);
      const finalMarkdown = applyRequiredOpeningLead(sanitizedMarkdown, getRequiredOpeningLead(input.deepWritingPayload));
      return {
        markdown: finalMarkdown,
        promptVersionRefs,
        personaAudit: attachPersonaAudit({
          title: input.title,
          markdown: finalMarkdown,
          persona: input.persona,
          strategyCard: input.strategyCard,
        }),
        informationGainAudit: attachInformationGainAudit({
          title: input.title,
          markdown: finalMarkdown,
          fragments: compactFragments,
          researchBrief: input.researchBrief,
          knowledgeCards: input.knowledgeCards,
        }),
      };
    }

    const auditUserPrompt = [
      promptBlock("原始事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
      "",
      promptLine("编辑命令：", input.command),
      "",
      promptBlock("待审校正文：", drafted.text),
      "",
      promptLine("禁用词：", bannedWordsText),
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await withGenerationTimeout(
      generateSceneText({
        sceneCode: "languageGuardAudit",
        systemPrompt: "",
        systemSegments: auditSystemSegments ?? undefined,
        userPrompt: auditUserPrompt,
        temperature: 0.2,
        rolloutUserId: input.promptContext?.userId ?? null,
      }),
      LANGUAGE_GUARD_TIMEOUT_MS,
      "语言守卫 AI 超时",
    );

    const sanitizedMarkdown = sanitizeBannedWords(audited.text.trim(), input.bannedWords);
    const finalMarkdown = applyRequiredOpeningLead(sanitizedMarkdown, getRequiredOpeningLead(input.deepWritingPayload));
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: compactFragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
      }),
    };
  } catch {
    const fallbackMarkdown = buildLocalRewrite({
      title: input.title,
      markdownContent: input.markdownContent,
      fragments: input.fragments,
      bannedWords: input.bannedWords,
      command: input.command,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      outlineGuide,
      knowledgeGuide,
      researchGuide,
      deepWritingPayload: input.deepWritingPayload,
    });
    const finalMarkdown = applyRequiredOpeningLead(fallbackMarkdown, getRequiredOpeningLead(input.deepWritingPayload));
    return {
      markdown: finalMarkdown,
      promptVersionRefs,
      personaAudit: attachPersonaAudit({
        title: input.title,
        markdown: finalMarkdown,
        persona: input.persona,
        strategyCard: input.strategyCard,
      }),
      informationGainAudit: attachInformationGainAudit({
        title: input.title,
        markdown: finalMarkdown,
        fragments: input.fragments,
        researchBrief: input.researchBrief,
        knowledgeCards: input.knowledgeCards,
      }),
    };
  }
}

function buildLocalFactCheckRewrite(input: {
  markdownContent: string;
  checks: Array<{ claim: string; status: string; suggestion: string }>;
  claimDecisions?: Array<{ claim: string; action: string; note?: string }>;
  evidenceCards?: Array<{
    claim: string;
    supportLevel?: string;
    supportingEvidence?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
    counterEvidence?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
    evidenceItems?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
  }>;
  bannedWords: string[];
}) {
  let next = input.markdownContent.trim();
  const decisionMap = new Map(
    (input.claimDecisions ?? [])
      .map((item) => [String(item.claim || "").trim(), String(item.action || "").trim()] as const)
      .filter(([claim, action]) => Boolean(claim) && Boolean(action)),
  );
  for (const check of input.checks) {
    const claim = check.claim.trim();
    if (!claim || !next.includes(claim)) {
      continue;
    }
    const evidenceCard = input.evidenceCards?.find((item) => String(item.claim || "").trim() === claim) ?? null;
    const evidenceItems =
      (Array.isArray(evidenceCard?.supportingEvidence) ? evidenceCard.supportingEvidence : []).length
      || (Array.isArray(evidenceCard?.counterEvidence) ? evidenceCard.counterEvidence : []).length
        ? [
            ...(Array.isArray(evidenceCard?.supportingEvidence) ? evidenceCard.supportingEvidence : []),
            ...(Array.isArray(evidenceCard?.counterEvidence) ? evidenceCard.counterEvidence : []),
          ]
        : Array.isArray(evidenceCard?.evidenceItems)
          ? evidenceCard.evidenceItems
          : [];
    const evidenceTitle = String(evidenceItems[0]?.title || "").trim();
    const decision = decisionMap.get(claim) || (check.status === "needs_source" ? "source" : check.status === "risky" ? "soften" : "keep");
    const replacement = buildFactCheckFallbackReplacement({
      claim,
      decision,
      evidenceTitle,
      supportLevel: String(evidenceCard?.supportLevel || "").trim(),
    });
    if (replacement) {
      next = next.replace(claim, replacement);
    }
  }
  return sanitizeBannedWords(next, input.bannedWords);
}

function applyTargetedRewrites(markdownContent: string, rewrites: Array<{ original: string; revised: string }>) {
  let next = markdownContent;
  for (const rewrite of rewrites) {
    const original = String(rewrite.original || "").trim();
    const revised = String(rewrite.revised || "").trim();
    if (!original || !revised || original === revised) {
      continue;
    }
    next = next.replace(original, revised);
  }
  return next;
}

function buildLocalProsePolishRewrite(input: {
  markdownContent: string;
  rewrittenLead?: string;
  issues: Array<{ example: string; suggestion: string }>;
  punchlines?: string[];
  rhythmAdvice?: string[];
  bannedWords: string[];
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  let next = input.markdownContent.trim();
  const requiredLead = getRequiredOpeningLead(input.deepWritingPayload);
  const rewrittenLead = requiredLead || input.rewrittenLead?.trim() || "";
  if (rewrittenLead) {
    next = replaceFirstReaderFacingBlock(next, rewrittenLead);
  }

  for (const issue of input.issues) {
    const example = issue.example.trim();
    if (!example || !next.includes(example)) {
      continue;
    }
    const replacement = buildProseFallbackReplacement({
      example,
      suggestion: issue.suggestion,
      rewrittenLead: input.rewrittenLead,
      punchlines: input.punchlines,
      rhythmAdvice: input.rhythmAdvice,
    });
    if (replacement && replacement !== example) {
      next = next.replace(example, replacement);
    }
  }

  return sanitizeBannedWords(requiredLead ? applyRequiredOpeningLead(next, requiredLead) : next, input.bannedWords);
}

export async function buildFactCheckTargetedRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  promptContext?: {
    userId?: number | null;
    role?: string | null;
    planCode?: string | null;
  };
  checks: Array<{ claim: string; status: string; suggestion: string }>;
  claimDecisions?: Array<{ claim: string; action: string; note?: string }>;
  evidenceCards?: Array<{
    claim: string;
    supportLevel?: string;
    supportingEvidence?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
    counterEvidence?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
    evidenceItems?: Array<{ title?: string; excerpt?: string; sourceType?: string; sourceUrl?: string | null; rationale?: string }>;
  }>;
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  layoutStrategy?: LayoutStrategyConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
}): Promise<GenerationBuildResult> {
  const claimDecisionMap = new Map(
    (input.claimDecisions ?? [])
      .map((item) => {
        const claim = String(item.claim || "").trim();
        const action = String(item.action || "").trim();
        const note = String(item.note || "").trim();
        return claim ? [claim, { action, note }] as const : null;
      })
      .filter(Boolean) as Array<readonly [string, { action: string; note: string }]>,
  );
  const riskyChecks = input.checks
    .filter((check) => String(check.claim || "").trim())
    .map((check) => {
      const claim = String(check.claim || "").trim();
      const status = String(check.status || "").trim();
      const decision = claimDecisionMap.get(claim);
      const defaultAction = status === "needs_source" ? "source" : status === "risky" ? "soften" : "keep";
      return {
        ...check,
        claim,
        status,
        action: decision?.action || defaultAction,
        note: decision?.note || "",
      };
    })
    .filter((check) => check.action !== "keep")
    .slice(0, 8);

  if (riskyChecks.length === 0) {
    return {
      markdown: sanitizeBannedWords(input.markdownContent, input.bannedWords),
      promptVersionRefs: [],
    };
  }

  const [writePrompt, auditPrompt] = await Promise.all([
    loadPromptWithMeta("article_write", input.promptContext),
    loadPromptWithMeta("language_guard_audit", input.promptContext),
  ]);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt.ref]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "暂无补充素材，请只基于现有正文和核查建议做保守修订。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const authorOutcomeFeedbackGuide = buildAuthorOutcomeFeedbackGuide(input.authorOutcomeFeedbackLedger);
  const preferredPrototypeCode = resolvePreferredPrototypeCodeFromRuntime(input);
  const preferredStateVariantCode = resolvePreferredStateVariantCodeFromRuntime(input);
  const archetypeRhythmHints = await resolveGenerationRhythmHints({
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    archetypeRhythmHints,
    preferredPrototypeCode,
    preferredVariantCode: preferredStateVariantCode,
  });
  const humanSignalGuide = buildHumanSignalGuide(input.humanSignals ?? null);
  const writingStateGuide = buildWritingStateGuide(writingState);
  const deepWritingBehaviorGuide = buildDeepWritingBehaviorGuide(input.deepWritingPayload);
  const styleGuide = buildStyleGuide(input.layoutStrategy);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const researchGuide = buildResearchGuide({
    researchBrief: input.researchBrief,
    seriesInsight: input.seriesInsight,
  });
  const seriesRuntimeGuide = buildSeriesRuntimeGuide(input.seriesInsight);
  const writerSystemSegments = buildGenerationSystemSegments({
    basePrompt: writePrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, seriesRuntimeGuide],
  });
  const auditSystemSegments = buildGenerationSystemSegments({
    basePrompt: auditPrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide],
  });
  const evidenceGuide = riskyChecks
    .map((check, index) => {
      const evidenceCard = input.evidenceCards?.find((item) => String(item.claim || "").trim() === String(check.claim || "").trim());
      const evidenceItems =
        (Array.isArray(evidenceCard?.supportingEvidence) ? evidenceCard.supportingEvidence : []).length
        || (Array.isArray(evidenceCard?.counterEvidence) ? evidenceCard.counterEvidence : []).length
          ? [
              ...(Array.isArray(evidenceCard?.supportingEvidence) ? evidenceCard.supportingEvidence : []),
              ...(Array.isArray(evidenceCard?.counterEvidence) ? evidenceCard.counterEvidence : []),
            ]
          : Array.isArray(evidenceCard?.evidenceItems)
            ? evidenceCard.evidenceItems
            : [];
      const evidenceText = evidenceItems.length
        ? evidenceItems
            .slice(0, 3)
            .map((item) =>
              [
                promptLine("标题：", String(item.title || "").trim() || "未命名证据"),
                String(item.excerpt || "").trim() ? promptLine("摘要：", String(item.excerpt || "").trim()) : null,
                String(item.rationale || "").trim() ? promptLine("用途：", String(item.rationale || "").trim()) : null,
                String(item.sourceUrl || "").trim() ? promptLine("链接：", String(item.sourceUrl || "").trim()) : null,
              ].filter(Boolean).join("\n"),
            )
            .join("\n\n")
        : "暂无命中证据，请保守弱化表达。";
      return [
        promptLine(String(index + 1) + ". 对应表述：", check.claim),
        promptLine("当前状态：", check.status),
        promptLine("处理策略：", check.action),
        promptLine("补充备注：", check.note || "无"),
        promptLine("证据强度：", String(evidenceCard?.supportLevel || "missing")),
        promptBlock("可用证据：", evidenceText),
      ].join("\n");
    })
    .join("\n\n");

  const writerUserPrompt = [
    promptLine("标题：", input.title),
    promptLine("禁用词：", bannedWordsText),
    outlineGuide ? promptBlock("主线提醒（只作为主线提醒，不要写成编号施工图）：", outlineGuide) : "",
    knowledgeGuide,
    "请只针对下列高风险表述做最小必要修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原表述","revised":"修订后的句子"}]}',
    "要求：",
    "1. 只改高风险句子，不改其它句子。",
    "2. 优先把绝对判断改成更稳妥的表述，或补充“据现有材料/公开信息”等限定语。",
    "3. revised 必须是可以直接替换 original 的完整句子或完整表述。",
    "4. 如果已有命中证据，优先吸收证据摘要里的来源锚点；如果证据不足，只做保守弱化，不要编造来源。",
    "5. 改写时保持当前作者状态、语气温度和段落呼吸，不要为了求稳改回模板腔。",
    "",
    promptBlock("当前正文：", input.markdownContent || "(当前为空)"),
    "",
    promptBlock(
      "待处理表述：",
      riskyChecks.map((check, index) =>
        [
          promptLine(String(index + 1) + ". 原表述：", check.claim),
          promptLine("状态：", check.status),
          promptLine("建议：", check.suggestion),
          promptLine("处理策略：", check.action),
          promptLine("补充备注：", check.note || "无"),
        ].join("\n"),
      ).join("\n\n"),
    ),
    "",
    evidenceGuide ? promptBlock("对应证据摘要卡：", evidenceGuide) : null,
    "",
    promptBlock("可用事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: "",
      systemSegments: writerSystemSegments,
      userPrompt: writerUserPrompt,
      temperature: 0.2,
      rolloutUserId: input.promptContext?.userId ?? null,
    });

    const parsed = JSON.parse(
      drafted.text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || drafted.text.trim(),
    ) as { rewrites?: Array<{ original?: string; revised?: string }> };

    const rewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites
          .map((item) => ({
            original: String(item?.original || "").trim(),
            revised: String(item?.revised || "").trim(),
          }))
          .filter((item) => item.original && item.revised)
      : [];

    if (rewrites.length === 0) {
      return {
        markdown: buildLocalFactCheckRewrite({
        markdownContent: input.markdownContent,
        checks: riskyChecks,
        claimDecisions: riskyChecks.map((check) => ({ claim: check.claim, action: check.action, note: check.note })),
        evidenceCards: input.evidenceCards,
        bannedWords: input.bannedWords,
        }),
        promptVersionRefs,
      };
    }

    const patched = applyTargetedRewrites(input.markdownContent, rewrites);
    const auditUserPrompt = [
      promptBlock("原始事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
      "",
      promptBlock("待审校正文：", patched),
      "",
      promptLine("禁用词：", bannedWordsText),
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: "",
      systemSegments: auditSystemSegments,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
      rolloutUserId: input.promptContext?.userId ?? null,
    });

    return {
      markdown: sanitizeBannedWords(audited.text.trim(), input.bannedWords),
      promptVersionRefs,
    };
  } catch {
    return {
      markdown: buildLocalFactCheckRewrite({
      markdownContent: input.markdownContent,
      checks: riskyChecks,
      claimDecisions: riskyChecks.map((check) => ({ claim: check.claim, action: check.action, note: check.note })),
      evidenceCards: input.evidenceCards,
      bannedWords: input.bannedWords,
      }),
      promptVersionRefs,
    };
  }
}

export async function buildProsePolishTargetedRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  promptContext?: {
    userId?: number | null;
    role?: string | null;
    planCode?: string | null;
  };
  rewrittenLead?: string | null;
  issues: Array<{ type?: string; example: string; suggestion: string }>;
  punchlines?: string[];
  rhythmAdvice?: string[];
  persona?: PersonaContext | null;
  writingStyleProfile?: WritingStyleProfileContext | null;
  strategyCard?: StrategyCardContext | null;
  seriesInsight?: SeriesInsightContext | null;
  researchBrief?: ResearchBriefContext | null;
  humanSignals?: HumanSignalsContext | null;
  layoutStrategy?: LayoutStrategyConfig | null;
  outlineNodes?: OutlineNodeContext[];
  knowledgeCards?: KnowledgeCardContext[];
  authorOutcomeFeedbackLedger?: AuthorOutcomeFeedbackLedgerContext | null;
  deepWritingPayload?: Record<string, unknown> | null;
}): Promise<GenerationBuildResult> {
  const targetedIssues = input.issues
    .filter((issue) => String(issue.example || "").trim() || String(issue.suggestion || "").trim())
    .slice(0, 6);

  if (targetedIssues.length === 0 && !String(input.rewrittenLead || "").trim()) {
    return {
      markdown: sanitizeBannedWords(input.markdownContent, input.bannedWords),
      promptVersionRefs: [],
    };
  }

  const [writePrompt, auditPrompt] = await Promise.all([
    loadPromptWithMeta("article_write", input.promptContext),
    loadPromptWithMeta("language_guard_audit", input.promptContext),
  ]);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt.ref]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "暂无补充素材，请只基于现有正文和润色建议做局部调整。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const authorOutcomeFeedbackGuide = buildAuthorOutcomeFeedbackGuide(input.authorOutcomeFeedbackLedger);
  const preferredPrototypeCode = resolvePreferredPrototypeCodeFromRuntime(input);
  const preferredStateVariantCode = resolvePreferredStateVariantCodeFromRuntime(input);
  const archetypeRhythmHints = await resolveGenerationRhythmHints({
    strategyCard: input.strategyCard,
    seriesInsight: input.seriesInsight,
  });
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
    archetypeRhythmHints,
    preferredPrototypeCode,
    preferredVariantCode: preferredStateVariantCode,
  });
  const humanSignalGuide = buildHumanSignalGuide(input.humanSignals ?? null);
  const writingStateGuide = buildWritingStateGuide(writingState);
  const deepWritingBehaviorGuide = buildDeepWritingBehaviorGuide(input.deepWritingPayload);
  const styleGuide = buildStyleGuide(input.layoutStrategy);
  const outlineGuide = buildOutlineGuide(input.outlineNodes);
  const knowledgeGuide = buildKnowledgeGuide(input.knowledgeCards);
  const researchGuide = buildResearchGuide({
    researchBrief: input.researchBrief,
    seriesInsight: input.seriesInsight,
  });
  const seriesRuntimeGuide = buildSeriesRuntimeGuide(input.seriesInsight);
  const writerSystemSegments = buildGenerationSystemSegments({
    basePrompt: writePrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide, seriesRuntimeGuide],
  });
  const auditSystemSegments = buildGenerationSystemSegments({
    basePrompt: auditPrompt.content,
    cacheableBlocks: [personaGuide, writingStyleGuide, styleGuide],
    contextualBlocks: [humanSignalGuide, writingStateGuide, authorOutcomeFeedbackGuide, deepWritingBehaviorGuide, researchGuide],
  });
  const punchlineText = (input.punchlines || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  const rhythmAdviceText = (input.rhythmAdvice || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);

  const writerUserPrompt = [
    promptLine("标题：", input.title),
    promptLine("禁用词：", bannedWordsText),
    outlineGuide ? promptBlock("主线提醒（只作为主线提醒，不要写成编号施工图）：", outlineGuide) : "",
    knowledgeGuide,
    "请只针对下列文笔问题做局部修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原段","revised":"修订后的句子或段落"}]}',
    "要求：",
    "1. 只改命中的句子或段落，不改其它部分。",
    "2. 优先优化开头抓力、长句拆分、节奏和表达力度。",
    "3. 保留原文事实，不要新增不存在的数据、案例或判断。",
    "4. revised 必须能直接替换 original。",
    "5. 润色时保留当前原型、状态和情绪温度，不要把文章磨平到通用 AI 口吻。",
    "",
    promptBlock("当前正文：", input.markdownContent || "(当前为空)"),
    "",
    String(input.rewrittenLead || "").trim() ? promptLine("首段改写建议：", String(input.rewrittenLead).trim()) : null,
    punchlineText.length ? promptLine("金句候选：", punchlineText.join("；")) : null,
    rhythmAdviceText.length ? promptLine("节奏建议：", rhythmAdviceText.join("；")) : null,
    targetedIssues.length
      ? promptBlock(
          "重点问题：",
          targetedIssues.map((issue, index) =>
            [
              promptLine(String(index + 1) + ". 类型：", String(issue.type || "").trim() || "未命名问题"),
              promptLine("原文示例：", issue.example),
              promptLine("建议：", issue.suggestion),
            ].join("\n"),
          ).join("\n\n"),
        )
      : null,
    "",
    promptBlock("可用事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: "",
      systemSegments: writerSystemSegments,
      userPrompt: writerUserPrompt,
      temperature: 0.25,
      rolloutUserId: input.promptContext?.userId ?? null,
    });

    const parsed = JSON.parse(
      drafted.text.trim().match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() || drafted.text.trim(),
    ) as { rewrites?: Array<{ original?: string; revised?: string }> };

    const rewrites = Array.isArray(parsed.rewrites)
      ? parsed.rewrites
          .map((item) => ({
            original: String(item?.original || "").trim(),
            revised: String(item?.revised || "").trim(),
          }))
          .filter((item) => item.original && item.revised)
      : [];

    if (rewrites.length === 0) {
      return {
        markdown: buildLocalProsePolishRewrite({
        markdownContent: input.markdownContent,
        rewrittenLead: input.rewrittenLead || undefined,
        issues: targetedIssues.map((issue) => ({ example: issue.example, suggestion: issue.suggestion })),
        punchlines: punchlineText,
        rhythmAdvice: rhythmAdviceText,
        bannedWords: input.bannedWords,
        deepWritingPayload: input.deepWritingPayload,
        }),
        promptVersionRefs,
      };
    }

    const patched = applyTargetedRewrites(input.markdownContent, rewrites);
    const auditUserPrompt = [
      promptBlock("原始事实：", formatPromptTemplate("- {{fragmentText}}", { fragmentText })),
      "",
      promptBlock("待审校正文：", patched),
      "",
      promptLine("禁用词：", bannedWordsText),
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: "",
      systemSegments: auditSystemSegments,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
      rolloutUserId: input.promptContext?.userId ?? null,
    });

    return {
      markdown: applyRequiredOpeningLead(sanitizeBannedWords(audited.text.trim(), input.bannedWords), getRequiredOpeningLead(input.deepWritingPayload)),
      promptVersionRefs,
    };
  } catch {
    return {
      markdown: buildLocalProsePolishRewrite({
      markdownContent: input.markdownContent,
      rewrittenLead: input.rewrittenLead || undefined,
      issues: targetedIssues.map((issue) => ({ example: issue.example, suggestion: issue.suggestion })),
      punchlines: punchlineText,
      rhythmAdvice: rhythmAdviceText,
      bannedWords: input.bannedWords,
      deepWritingPayload: input.deepWritingPayload,
      }),
      promptVersionRefs,
    };
  }
}
