import { generateSceneText } from "./ai-gateway";
import { loadPromptWithMeta } from "./prompt-loader";
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
};

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

type StrategyCardContext = {
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

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function uniquePromptRefs(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
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

function buildTagText(tags: string[] = []) {
  return tags.map((item) => String(item || "").trim()).filter(Boolean).join("、");
}

function dedupeText(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
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
    return evidenceTitle ? `至少按${evidenceTitle}这条材料看，这句判断先收住。` : "按现有材料看，这句判断先收住。";
  }
  if (input.decision === "source") {
    return evidenceTitle ? `按${evidenceTitle}等现有材料，${claim}` : `按现有材料看，${claim}`;
  }
  if (input.decision === "mark_opinion") {
    return evidenceTitle ? `如果只按${evidenceTitle}这条材料看，${claim}` : `这更像当前阶段的判断：${claim}`;
  }
  if (input.decision === "soften") {
    if (evidenceTitle) {
      return `至少从${evidenceTitle}等现有材料看，${claim}`;
    }
    return input.supportLevel === "missing" ? `按现有材料看，${claim}` : `${claim}，但这里先不把话说满。`;
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
    return `${example.replace(/[。！？!?]+$/, "")}。\n\n${punchline}`;
  }
  const rhythmAdvice = (input.rhythmAdvice ?? []).map((item) => item.trim()).find(Boolean) || "";
  if (rhythmAdvice && /节奏|转场|重复/.test(suggestion) && !example.includes(rhythmAdvice)) {
    return `${splitParagraphForFallback(example)}\n\n${rhythmAdvice}`;
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
}) {
  const fragmentText = input.fragments.length > 0 ? input.fragments.join("；") : "当前没有素材，先根据标题生成一版骨架正文。";
  return sanitizeBannedWords(
    `# ${input.title}\n\n${input.prompt}\n\n${input.personaGuide ? `${input.personaGuide}\n\n` : ""}${input.writingStyleGuide ? `${input.writingStyleGuide}\n\n` : ""}${input.humanSignalGuide ? `${input.humanSignalGuide}\n\n` : ""}${input.writingStateGuide ? `${input.writingStateGuide}\n\n` : ""}${input.deepWritingBehaviorGuide ? `${input.deepWritingBehaviorGuide}\n\n` : ""}${input.styleGuide ? `${input.styleGuide}\n\n` : ""}${input.outlineGuide ? `${input.outlineGuide}\n\n` : ""}${input.knowledgeGuide ? `${input.knowledgeGuide}\n\n` : ""}${input.imageGuide ? `${input.imageGuide}\n\n` : ""}${input.historyGuide ? `${input.historyGuide}\n\n` : ""}${input.researchGuide ? `${input.researchGuide}\n\n` : ""}${input.deepWritingGuide ? `${input.deepWritingGuide}\n\n` : ""}先把现实摊开。\n\n${fragmentText}\n\n你不是在补空话，而是在把事实重新排成能击中人的结构。\n`,
    input.bannedWords,
  );
}

function buildLocalOpeningPreview(input: {
  title: string;
  fragments: string[];
  bannedWords: string[];
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const openingStrategy = getString(input.deepWritingPayload?.openingStrategy) || "第一段先抛现象或冲突，再给一句硬判断。";
  const openingMove = getString(input.deepWritingPayload?.openingMove);
  const stateVariantLabel = getString(input.deepWritingPayload?.stateVariantLabel);
  const articlePrototypeLabel = getString(input.deepWritingPayload?.articlePrototypeLabel) || getString(input.deepWritingPayload?.articlePrototype);
  const leadFact = input.fragments.find((item) => getString(item)) || `围绕“${input.title}”直接进入核心判断。`;
  return sanitizeBannedWords(
    [
      `先说结论，这篇更适合按「${[articlePrototypeLabel, stateVariantLabel].filter(Boolean).join(" / ") || "当前推荐写法"}」开。`,
      openingStrategy,
      openingMove,
      `我先抓住一个最具体的点：${leadFact}`,
    ].filter(Boolean).join("\n\n"),
    input.bannedWords,
  );
}

function buildStyleGuide(layoutStrategy?: LayoutStrategyConfig | null) {
  if (!layoutStrategy) {
    return "";
  }

  const lines = [
    layoutStrategy.name ? `当前启用写作风格资产：${layoutStrategy.name}` : null,
    layoutStrategy.tone ? `语气偏好：${layoutStrategy.tone}` : null,
    layoutStrategy.paragraphLength ? `段落呼吸：${layoutStrategy.paragraphLength}` : null,
    layoutStrategy.titleStyle ? `标题倾向：${layoutStrategy.titleStyle}` : null,
    layoutStrategy.bannedWords?.length ? `附加禁词：${layoutStrategy.bannedWords.join("、")}` : null,
    layoutStrategy.bannedPunctuation?.length ? `禁用标点：${layoutStrategy.bannedPunctuation.join(" ")}` : null,
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
    `当前默认作者人设：${persona.name}`,
    persona.summary ? `人设摘要：${persona.summary}` : null,
    identityText ? `身份维度：${identityText}` : null,
    writingStyleText ? `标签风格：${writingStyleText}` : null,
    persona.domainKeywords?.length ? `领域关键词：${persona.domainKeywords.join("、")}` : null,
    persona.argumentPreferences?.length ? `常用论证：${persona.argumentPreferences.join("；")}` : null,
    persona.toneConstraints?.length ? `语气约束：${persona.toneConstraints.join("；")}` : null,
    persona.audienceHints?.length ? `默认受众：${persona.audienceHints.join("；")}` : null,
    persona.sourceMode === "analyzed" ? "这个人设由用户资料分析得到，优先贴近其真实表达习惯。" : null,
    persona.boundWritingStyleProfileName ? `已绑定文风资产：${persona.boundWritingStyleProfileName}` : null,
    "写作时保持人设视角稳定，不要突然切换成通用 AI 口吻或旁观者口吻。",
  ].filter(Boolean);

  return ["请额外遵守以下作者人设约束：", ...lines].join("\n");
}

function buildWritingStyleGuide(writingStyleProfile?: WritingStyleProfileContext | null) {
  if (!writingStyleProfile) {
    return "";
  }

  const lines = [
    `当前绑定写作风格资产：${writingStyleProfile.name}`,
    writingStyleProfile.summary ? `风格摘要：${writingStyleProfile.summary}` : null,
    writingStyleProfile.toneKeywords.length ? `语气关键词：${writingStyleProfile.toneKeywords.join("、")}` : null,
    writingStyleProfile.sentenceLengthProfile ? `句长分布：${writingStyleProfile.sentenceLengthProfile}` : null,
    writingStyleProfile.paragraphBreathingPattern ? `段落呼吸：${writingStyleProfile.paragraphBreathingPattern}` : null,
    writingStyleProfile.structurePatterns.length ? `结构习惯：${writingStyleProfile.structurePatterns.join("；")}` : null,
    writingStyleProfile.transitionPatterns?.length ? `过渡习惯：${writingStyleProfile.transitionPatterns.join("；")}` : null,
    writingStyleProfile.languageHabits.length ? `语言习惯：${writingStyleProfile.languageHabits.join("；")}` : null,
    writingStyleProfile.openingPatterns.length ? `开头习惯：${writingStyleProfile.openingPatterns.join("；")}` : null,
    writingStyleProfile.endingPatterns.length ? `结尾习惯：${writingStyleProfile.endingPatterns.join("；")}` : null,
    writingStyleProfile.punctuationHabits?.length ? `标点习惯：${writingStyleProfile.punctuationHabits.join("；")}` : null,
    writingStyleProfile.tangentPatterns?.length ? `跑题方式：${writingStyleProfile.tangentPatterns.join("；")}` : null,
    writingStyleProfile.callbackPatterns?.length ? `回环方式：${writingStyleProfile.callbackPatterns.join("；")}` : null,
    writingStyleProfile.factDensity ? `事实密度：${writingStyleProfile.factDensity}` : null,
    writingStyleProfile.emotionalIntensity ? `情绪幅度：${writingStyleProfile.emotionalIntensity}` : null,
    writingStyleProfile.suitableTopics?.length ? `适配题材：${writingStyleProfile.suitableTopics.join("；")}` : null,
    writingStyleProfile.reusablePromptFragments?.length ? `可复用写法片段：${writingStyleProfile.reusablePromptFragments.join("；")}` : null,
    writingStyleProfile.verbatimPhraseBanks?.transitionPhrases?.length
      ? `逐字转场短语：${writingStyleProfile.verbatimPhraseBanks.transitionPhrases.join(" / ")}`
      : null,
    writingStyleProfile.verbatimPhraseBanks?.judgementPhrases?.length
      ? `逐字判断短语：${writingStyleProfile.verbatimPhraseBanks.judgementPhrases.join(" / ")}`
      : null,
    writingStyleProfile.verbatimPhraseBanks?.selfDisclosurePhrases?.length
      ? `逐字自我暴露短语：${writingStyleProfile.verbatimPhraseBanks.selfDisclosurePhrases.join(" / ")}`
      : null,
    writingStyleProfile.verbatimPhraseBanks?.emotionPhrases?.length
      ? `逐字情绪短语：${writingStyleProfile.verbatimPhraseBanks.emotionPhrases.join(" / ")}`
      : null,
    writingStyleProfile.verbatimPhraseBanks?.readerBridgePhrases?.length
      ? `逐字读者桥接短语：${writingStyleProfile.verbatimPhraseBanks.readerBridgePhrases.join(" / ")}`
      : null,
    writingStyleProfile.statePresets?.length ? `状态预设：${writingStyleProfile.statePresets.join("；")}` : null,
    writingStyleProfile.antiOutlineRules?.length ? `反结构规则：${writingStyleProfile.antiOutlineRules.join("；")}` : null,
    writingStyleProfile.tabooPatterns?.length ? `禁忌写法：${writingStyleProfile.tabooPatterns.join("；")}` : null,
    writingStyleProfile.doNotWrite.length ? `明确规避：${writingStyleProfile.doNotWrite.join("；")}` : null,
    writingStyleProfile.imitationPrompt ? `模仿提示：${writingStyleProfile.imitationPrompt}` : null,
    "要求：吸收节奏、结构和语气，不要照抄源文句子；逐字短语库只能借口头连接和判断手势，不能机械拼贴成模板。",
  ].filter(Boolean);

  return ["请额外遵守以下文风资产约束：", ...lines].join("\n");
}

function buildOutlineGuide(outlineNodes: OutlineNodeContext[] = []) {
  if (outlineNodes.length === 0) {
    return "";
  }

  return [
    "当前稿件大纲锚点：",
    ...outlineNodes.map((node, index) => `${index + 1}. ${node.title}${node.description ? `：${node.description}` : ""}`),
  ].join("\n");
}

function buildKnowledgeGuide(knowledgeCards: KnowledgeCardContext[] = []) {
  if (knowledgeCards.length === 0) {
    return "";
  }

  return [
    "相关主题档案：",
    ...knowledgeCards.map((card, index) =>
      [
        `${index + 1}. ${card.title}（状态：${card.status}，置信度：${Math.round(card.confidenceScore * 100)}%${card.matchedFragmentCount ? `，命中挂载素材 ${card.matchedFragmentCount} 条` : ""}）`,
        card.summary ? `摘要：${card.summary}` : null,
        card.latestChangeSummary ? `最近变化：${card.latestChangeSummary}` : null,
        card.keyFacts.length ? `关键事实：${card.keyFacts.slice(0, 3).join("；")}` : null,
        card.overturnedJudgements?.length ? `待重验旧判断：${card.overturnedJudgements.slice(0, 2).join("；")}` : null,
        card.openQuestions?.length ? `待确认：${card.openQuestions.slice(0, 2).join("；")}` : null,
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
    ...imageFragments.map((item, index) => `${index + 1}. ${item.title || `截图素材 ${index + 1}`}：请在合适段落使用 Markdown 图片语法 ![${item.title || `截图素材 ${index + 1}`}](${item.screenshotPath})`),
  ].join("\n");
}

function buildHistoryReferenceGuide(historyReferences: HistoryReferenceContext[] = []) {
  if (historyReferences.length === 0) {
    return "";
  }
  return [
    "历史文章只能自然引用，不允许生成文末相关阅读区块，也不要生成链接列表：",
    ...historyReferences.map((item, index) => `${index + 1}. 《${item.title}》${item.relationReason ? `：${item.relationReason}` : ""}${item.bridgeSentence ? `；可用桥接句：${item.bridgeSentence}` : ""}`),
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
      return insight ? `${insight}${whyNow ? `（${whyNow}）` : ""}` : "";
    });
  const preferredResearchSignals = resolveResearchStrategySignals({
    researchBrief,
    strategyCard,
  });

  return dedupeText(
    [
      researchBrief.coreQuestion ? `研究核心问题：${String(researchBrief.coreQuestion).trim()}` : null,
      ...timelineLines.map((item) => `时间脉络：${item}`),
      ...comparisonLines.map((item) => `横向比较：${item}`),
      ...insightLines.map((item) => `交汇洞察：${item}`),
      preferredResearchSignals.coreAssertion ? `主判断：${preferredResearchSignals.coreAssertion}` : null,
      preferredResearchSignals.marketPositionInsight ? `市场位置判断：${preferredResearchSignals.marketPositionInsight}` : null,
      preferredResearchSignals.historicalTurningPoint ? `历史转折点：${preferredResearchSignals.historicalTurningPoint}` : null,
      preferredResearchSignals.researchHypothesis ? `研究假设：${preferredResearchSignals.researchHypothesis}` : null,
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
    input.researchBrief?.summary ? `研究摘要：${String(input.researchBrief.summary).trim()}` : null,
    input.researchBrief?.coreQuestion ? `研究核心问题：${String(input.researchBrief.coreQuestion).trim()}` : null,
    input.researchBrief?.mustCoverAngles?.length ? `必查维度：${input.researchBrief.mustCoverAngles.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5).join("；")}` : null,
    input.researchBrief?.timelineCards?.length
      ? `时间脉络优先顺序：${input.researchBrief.timelineCards.slice(0, 3).map((item) => [String(item.phase || "").trim(), String(item.summary || "").trim()].filter(Boolean).join("：")).filter(Boolean).join("；")}`
      : null,
    input.researchBrief?.comparisonCards?.length
      ? `横向比较优先顺序：${input.researchBrief.comparisonCards.slice(0, 3).map((item) => [String(item.subject || "").trim(), String(item.position || "").trim()].filter(Boolean).join("：")).filter(Boolean).join("；")}`
      : null,
    input.researchBrief?.intersectionInsights?.length
      ? `交汇洞察：${input.researchBrief.intersectionInsights.slice(0, 3).map((item) => {
          const insight = String(item.insight || "").trim();
          const whyNow = String(item.whyNow || "").trim();
          return insight ? `${insight}${whyNow ? `（${whyNow}）` : ""}` : "";
        }).filter(Boolean).join("；")}`
      : null,
    preferredResearchSignals.coreAssertion ? `当前策略主判断：${preferredResearchSignals.coreAssertion}` : null,
    preferredResearchSignals.whyNow ? `当前策略 why now：${preferredResearchSignals.whyNow}` : null,
    preferredResearchSignals.marketPositionInsight ? `当前策略位置判断：${preferredResearchSignals.marketPositionInsight}` : null,
    preferredResearchSignals.historicalTurningPoint ? `当前策略历史转折：${preferredResearchSignals.historicalTurningPoint}` : null,
    preferredResearchSignals.researchHypothesis ? `当前策略研究假设：${preferredResearchSignals.researchHypothesis}` : null,
    input.seriesInsight?.label ? `系列标签：${String(input.seriesInsight.label).trim()}` : null,
    input.seriesInsight?.reason ? `系列主轴：${String(input.seriesInsight.reason).trim()}` : null,
    input.seriesInsight?.coreStances?.length ? `系列核心立场：${input.seriesInsight.coreStances.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3).join("；")}` : null,
    input.seriesInsight?.whyNow?.length ? `系列为什么现在值得写：${input.seriesInsight.whyNow.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3).join("；")}` : null,
    "正文必须优先消化研究卡片里的时间节点、横向差异和交汇洞察，而不是把原始素材直接排成流水账。",
  ].filter(Boolean);

  return lines.length ? ["请优先遵守以下研究层约束：", ...lines].join("\n") : "";
}

function buildDeepWritingBehaviorGuide(deepWritingPayload?: Record<string, unknown> | null) {
  const payload = getRecord(deepWritingPayload);
  if (!payload) {
    return "";
  }
  const lines = [
    getString(payload.articlePrototypeLabel) ? `当前执行卡原型：${getString(payload.articlePrototypeLabel)}${getString(payload.articlePrototype) ? `（${getString(payload.articlePrototype)}）` : ""}` : null,
    getString(payload.articlePrototypeReason) ? `原型切换原因：${getString(payload.articlePrototypeReason)}` : null,
    getString(payload.stateVariantLabel) ? `当前执行卡状态：${getString(payload.stateVariantLabel)}` : null,
    getString(payload.stateVariantReason) ? `状态切换原因：${getString(payload.stateVariantReason)}` : null,
    getString(payload.progressiveRevealLabel) ? `节奏插件：${getString(payload.progressiveRevealLabel)}` : null,
    getString(payload.progressiveRevealReason) ? `节奏插件原因：${getString(payload.progressiveRevealReason)}` : null,
    getString(payload.climaxPlacement) ? `高潮位置：${getString(payload.climaxPlacement)}` : null,
    getString(payload.escalationRule) ? `升级规则：${getString(payload.escalationRule)}` : null,
    getStringArray(payload.stateChecklist, 5).length ? `状态自检：${getStringArray(payload.stateChecklist, 5).join("；")}` : null,
    getStringArray(payload.voiceChecklist, 5).length ? `表达约束：${getStringArray(payload.voiceChecklist, 5).join("；")}` : null,
    getStringArray(payload.diversitySuggestions, 3).length ? `去重动作：${getStringArray(payload.diversitySuggestions, 3).join("；")}` : null,
    getStringArray(payload.mustUseFacts, 5).length ? `必须吃透的事实：${getStringArray(payload.mustUseFacts, 5).join("；")}` : null,
    "优先执行上面的原型、状态、节奏和约束，再把结构当作主线提醒，不要逐节翻译执行卡。",
  ].filter(Boolean);
  return lines.length ? ["请优先遵守以下 deepWriting 行为约束：", ...lines].join("\n") : "";
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
  const preferredPrototypeCode = (() => {
    const value = getString(input.deepWritingPayload?.articlePrototype);
    return ARTICLE_PROTOTYPE_CODES.includes(value as ArticlePrototypeCode) ? value as ArticlePrototypeCode : null;
  })();
  const preferredStateVariantCode = (() => {
    const value = getString(input.deepWritingPayload?.stateVariantCode);
    return WRITING_STATE_VARIANT_CODES.includes(value as WritingStateVariantCode) ? value as WritingStateVariantCode : null;
  })();
  const writingState = buildWritingStateKernel({
    title: input.title,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
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
  const deepWritingGuide = input.deepWritingGuide?.trim() ? input.deepWritingGuide.trim() : "";

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    personaGuide,
    writingStyleGuide,
    humanSignalGuide,
    writingStateGuide,
    deepWritingBehaviorGuide,
    styleGuide,
    outlineGuide ? `松散大纲骨架（只作为主线提醒，不要写成编号施工图）：\n${outlineGuide}` : "",
    knowledgeGuide,
    imageGuide,
    historyGuide,
    researchGuide,
    deepWritingGuide ? `执行卡主线提醒（不要机械照抄、不要逐节翻译）：\n${deepWritingGuide}` : "",
    "请基于以下事实素材输出一篇中文 Markdown 正文。",
    "正文优先调用研究卡片里的时间节点、对比关系和交汇洞察，再决定怎么组织普通素材。",
    "优先遵守人类信号、写作状态和 deepWriting 行为约束，再参考大纲与执行卡主线。",
    "如果需要引用历史已发布文章，只能自然写进相关段落，不要生成“相关文章”或“延伸阅读”区块。",
    "要求：先像作者本人在写，再像编辑在收束。不要写成结构模板、讲义或总结稿；不要解释你的过程；只返回正文 Markdown。",
    "",
    `素材：\n- ${fragmentText}`,
  ].join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: writePrompt.content,
      userPrompt: writerUserPrompt,
      temperature: 0.5,
    });

    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${drafted.text}`,
      "",
      `禁用词：${bannedWordsText}`,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: auditPrompt.content,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return {
      markdown: sanitizeBannedWords(audited.text.trim(), input.bannedWords),
      promptVersionRefs,
    };
  } catch {
    return {
      markdown: buildLocalDraft({
      title: input.title,
      fragments: input.fragments,
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
      }),
      promptVersionRefs,
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
  const preferredPrototypeCode = (() => {
    const value = getString(input.deepWritingPayload?.articlePrototype);
    return ARTICLE_PROTOTYPE_CODES.includes(value as ArticlePrototypeCode) ? value as ArticlePrototypeCode : null;
  })();
  const preferredStateVariantCode = (() => {
    const value = getString(input.deepWritingPayload?.stateVariantCode);
    return WRITING_STATE_VARIANT_CODES.includes(value as WritingStateVariantCode) ? value as WritingStateVariantCode : null;
  })();
  const writingState = buildWritingStateKernel({
    title: input.title,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
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
  const deepWritingGuide = input.deepWritingGuide?.trim() ? input.deepWritingGuide.trim() : "";

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    personaGuide,
    writingStyleGuide,
    humanSignalGuide,
    writingStateGuide,
    deepWritingBehaviorGuide,
    styleGuide,
    outlineGuide ? `主线提醒（只作为主线提醒，不要写成编号施工图）：\n${outlineGuide}` : "",
    knowledgeGuide,
    imageGuide,
    historyGuide,
    researchGuide,
    deepWritingGuide ? `执行卡提醒：\n${deepWritingGuide}` : "",
    "请只输出这篇文章的开头预览，不要写完整正文。",
    "长度控制在 1-2 段、120-220 字。",
    "要求：第一句就进入具体现象、冲突、判断或场景；能明显看出当前原型 / 状态的差异；不要编号、不要总结、不要解释你的过程。",
    "",
    `可用素材：\n- ${fragmentText}`,
  ].join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: writePrompt.content,
      userPrompt: writerUserPrompt,
      temperature: 0.6,
    });

    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校开头预览：\n${drafted.text}`,
      "",
      `禁用词：${bannedWordsText}`,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      "请输出净化后的最终开头预览，不要解释，不要补完整文。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: auditPrompt.content,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return {
      markdown: sanitizeBannedWords(audited.text.trim(), input.bannedWords),
      promptVersionRefs,
    };
  } catch {
    return {
      markdown: buildLocalOpeningPreview({
        title: input.title,
        fragments: input.fragments,
        bannedWords: input.bannedWords,
        deepWritingPayload: input.deepWritingPayload,
      }),
      promptVersionRefs,
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
  });

  if (/小标题/.test(input.command)) {
    return sanitizeBannedWords(
      `${base}\n\n## 小标题一\n围绕当前主题先把结论写硬。\n\n## 小标题二\n把事实和利益变化拆开。\n\n## 小标题三\n最后落回读者当下处境。`,
      input.bannedWords,
    );
  }

  if (/扩写|补/.test(input.command)) {
    const extra = input.fragments.slice(0, 2).join("；") || "补一段更具体的事实锚点和判断转折。";
    return sanitizeBannedWords(`${base}\n\n${extra}`, input.bannedWords);
  }

  if (/语言守卫|禁用表达|替换|净化/.test(input.command)) {
    return sanitizeBannedWords(base, input.bannedWords);
  }

  return sanitizeBannedWords(base, input.bannedWords);
}

export async function buildCommandRewrite(input: {
  title: string;
  markdownContent: string;
  fragments: string[];
  bannedWords: string[];
  command: string;
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
  deepWritingPayload?: Record<string, unknown> | null;
}): Promise<GenerationBuildResult> {
  const [writePrompt, auditPrompt] = await Promise.all([
    loadPromptWithMeta("article_write", input.promptContext),
    loadPromptWithMeta("language_guard_audit", input.promptContext),
  ]);
  const promptVersionRefs = uniquePromptRefs([writePrompt.ref, auditPrompt.ref]);

  const fragmentText = input.fragments.length > 0 ? input.fragments.join("\n- ") : "当前没有额外素材，请尽量保留已有事实，不要空泛扩写。";
  const bannedWordsText = input.bannedWords.length > 0 ? input.bannedWords.join("、") : "无";
  const personaGuide = buildPersonaGuide(input.persona);
  const writingStyleGuide = buildWritingStyleGuide(input.writingStyleProfile);
  const preferredPrototypeCode = (() => {
    const value = getString(input.deepWritingPayload?.articlePrototype);
    return ARTICLE_PROTOTYPE_CODES.includes(value as ArticlePrototypeCode) ? value as ArticlePrototypeCode : null;
  })();
  const preferredStateVariantCode = (() => {
    const value = getString(input.deepWritingPayload?.stateVariantCode);
    return WRITING_STATE_VARIANT_CODES.includes(value as WritingStateVariantCode) ? value as WritingStateVariantCode : null;
  })();
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
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

  const writerUserPrompt = [
    `标题：${input.title}`,
    `编辑命令：${input.command}`,
    `禁用词：${bannedWordsText}`,
    personaGuide,
    writingStyleGuide,
    humanSignalGuide,
    writingStateGuide,
    deepWritingBehaviorGuide,
    styleGuide,
    outlineGuide ? `主线提醒（只作为主线提醒，不要写成编号施工图）：\n${outlineGuide}` : "",
    knowledgeGuide,
    researchGuide,
    "",
    "请基于当前正文执行改写命令，输出完整 Markdown 正文。",
    "优先遵守人类信号、写作状态和 deepWriting 行为约束，再参考大纲与知识卡。",
    "要求：不要解释，不要列步骤，直接返回改写后的整篇正文。不要把文章改写回模板腔、总结腔或施工图腔。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空，请先生成骨架正文)"}`,
    "",
    `可用素材：\n- ${fragmentText}`,
  ].join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: writePrompt.content,
      userPrompt: writerUserPrompt,
      temperature: 0.4,
    });

    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `编辑命令：${input.command}`,
      "",
      `待审校正文：\n${drafted.text}`,
      "",
      `禁用词：${bannedWordsText}`,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      researchGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: auditPrompt.content,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return {
      markdown: sanitizeBannedWords(audited.text.trim(), input.bannedWords),
      promptVersionRefs,
    };
  } catch {
    return {
      markdown: buildLocalRewrite({
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
      }),
      promptVersionRefs,
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
}) {
  let next = input.markdownContent.trim();
  const firstLine = next.split("\n").find((line) => line.trim()) || "";
  if (input.rewrittenLead?.trim()) {
    if (firstLine) {
      next = next.replace(firstLine, input.rewrittenLead.trim());
    } else {
      next = input.rewrittenLead.trim();
    }
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

  return sanitizeBannedWords(next, input.bannedWords);
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
  const preferredPrototypeCode = (() => {
    const value = getString(input.deepWritingPayload?.articlePrototype);
    return ARTICLE_PROTOTYPE_CODES.includes(value as ArticlePrototypeCode) ? value as ArticlePrototypeCode : null;
  })();
  const preferredStateVariantCode = (() => {
    const value = getString(input.deepWritingPayload?.stateVariantCode);
    return WRITING_STATE_VARIANT_CODES.includes(value as WritingStateVariantCode) ? value as WritingStateVariantCode : null;
  })();
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
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
                `标题：${String(item.title || "").trim() || "未命名证据"}`,
                String(item.excerpt || "").trim() ? `摘要：${String(item.excerpt || "").trim()}` : null,
                String(item.rationale || "").trim() ? `用途：${String(item.rationale || "").trim()}` : null,
                String(item.sourceUrl || "").trim() ? `链接：${String(item.sourceUrl || "").trim()}` : null,
              ].filter(Boolean).join("；"),
            )
            .join(" | ")
        : "暂无命中证据，请保守弱化表达。";
      return `${index + 1}. 对应表述：${check.claim}\n当前状态：${check.status}\n处理策略：${check.action}\n补充备注：${check.note || "无"}\n证据强度：${String(evidenceCard?.supportLevel || "missing")}\n可用证据：${evidenceText}`;
    })
    .join("\n\n");

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    personaGuide,
    writingStyleGuide,
    humanSignalGuide,
    writingStateGuide,
    deepWritingBehaviorGuide,
    styleGuide,
    outlineGuide ? `主线提醒（只作为主线提醒，不要写成编号施工图）：\n${outlineGuide}` : "",
    knowledgeGuide,
    researchGuide,
    "请只针对下列高风险表述做最小必要修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原表述","revised":"修订后的句子"}]}',
    "要求：",
    "1. 只改高风险句子，不改其它句子。",
    "2. 优先把绝对判断改成更稳妥的表述，或补充“据现有材料/公开信息”等限定语。",
    "3. revised 必须是可以直接替换 original 的完整句子或完整表述。",
    "4. 如果已有命中证据，优先吸收证据摘要里的来源锚点；如果证据不足，只做保守弱化，不要编造来源。",
    "5. 改写时保持当前作者状态、语气温度和段落呼吸，不要为了求稳改回模板腔。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空)"}`,
    "",
    `待处理表述：\n${riskyChecks.map((check, index) => `${index + 1}. 原表述：${check.claim}\n状态：${check.status}\n建议：${check.suggestion}\n处理策略：${check.action}\n补充备注：${check.note || "无"}`).join("\n\n")}`,
    "",
    evidenceGuide ? `对应证据摘要卡：\n${evidenceGuide}` : null,
    "",
    `可用事实：\n- ${fragmentText}`,
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: writePrompt.content,
      userPrompt: writerUserPrompt,
      temperature: 0.2,
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
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${patched}`,
      "",
      `禁用词：${bannedWordsText}`,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      researchGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: auditPrompt.content,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
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
  const preferredPrototypeCode = (() => {
    const value = getString(input.deepWritingPayload?.articlePrototype);
    return ARTICLE_PROTOTYPE_CODES.includes(value as ArticlePrototypeCode) ? value as ArticlePrototypeCode : null;
  })();
  const preferredStateVariantCode = (() => {
    const value = getString(input.deepWritingPayload?.stateVariantCode);
    return WRITING_STATE_VARIANT_CODES.includes(value as WritingStateVariantCode) ? value as WritingStateVariantCode : null;
  })();
  const writingState = buildWritingStateKernel({
    title: input.title,
    markdownContent: input.markdownContent,
    humanSignals: input.humanSignals,
    writingStyleProfile: input.writingStyleProfile,
    seriesInsight: input.seriesInsight,
    researchBrief: input.researchBrief,
    strategyCard: input.strategyCard,
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
  const punchlineText = (input.punchlines || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
  const rhythmAdviceText = (input.rhythmAdvice || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);

  const writerUserPrompt = [
    `标题：${input.title}`,
    `禁用词：${bannedWordsText}`,
    personaGuide,
    writingStyleGuide,
    humanSignalGuide,
    writingStateGuide,
    deepWritingBehaviorGuide,
    styleGuide,
    outlineGuide ? `主线提醒（只作为主线提醒，不要写成编号施工图）：\n${outlineGuide}` : "",
    knowledgeGuide,
    researchGuide,
    "请只针对下列文笔问题做局部修订，返回 JSON，不要返回全文，不要解释。",
    '字段：{"rewrites":[{"original":"原句或原段","revised":"修订后的句子或段落"}]}',
    "要求：",
    "1. 只改命中的句子或段落，不改其它部分。",
    "2. 优先优化开头抓力、长句拆分、节奏和表达力度。",
    "3. 保留原文事实，不要新增不存在的数据、案例或判断。",
    "4. revised 必须能直接替换 original。",
    "5. 润色时保留当前原型、状态和情绪温度，不要把文章磨平到通用 AI 口吻。",
    "",
    `当前正文：\n${input.markdownContent || "(当前为空)"}`,
    "",
    String(input.rewrittenLead || "").trim() ? `首段改写建议：${String(input.rewrittenLead).trim()}` : null,
    punchlineText.length ? `金句候选：${punchlineText.join("；")}` : null,
    rhythmAdviceText.length ? `节奏建议：${rhythmAdviceText.join("；")}` : null,
    targetedIssues.length
      ? `重点问题：\n${targetedIssues.map((issue, index) => `${index + 1}. 类型：${String(issue.type || "").trim() || "未命名问题"}\n原文示例：${issue.example}\n建议：${issue.suggestion}`).join("\n\n")}`
      : null,
    "",
    `可用事实：\n- ${fragmentText}`,
  ].filter(Boolean).join("\n");

  try {
    const drafted = await generateSceneText({
      sceneCode: "articleWrite",
      systemPrompt: writePrompt.content,
      userPrompt: writerUserPrompt,
      temperature: 0.25,
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
        }),
        promptVersionRefs,
      };
    }

    const patched = applyTargetedRewrites(input.markdownContent, rewrites);
    const auditUserPrompt = [
      `原始事实：\n- ${fragmentText}`,
      "",
      `待审校正文：\n${patched}`,
      "",
      `禁用词：${bannedWordsText}`,
      personaGuide,
      writingStyleGuide,
      humanSignalGuide,
      writingStateGuide,
      deepWritingBehaviorGuide,
      styleGuide,
      researchGuide,
      "请输出净化后的最终 Markdown 正文，不要解释。",
    ].join("\n");

    const audited = await generateSceneText({
      sceneCode: "languageGuardAudit",
      systemPrompt: auditPrompt.content,
      userPrompt: auditUserPrompt,
      temperature: 0.2,
    });

    return {
      markdown: sanitizeBannedWords(audited.text.trim(), input.bannedWords),
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
      }),
      promptVersionRefs,
    };
  }
}
