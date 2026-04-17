import { analyzeAiNoise } from "./ai-noise-scan";
import type { WritingDiversityReport } from "./writing-diversity";

export type WritingQualityLayerStatus = "ready" | "needs_attention" | "blocked";

export type WritingQualityLayer = {
  code: "hard_rules" | "style_consistency" | "content_quality" | "humanity";
  title: string;
  status: WritingQualityLayerStatus;
  score: number;
  summary: string;
  issues: string[];
  suggestions: string[];
};

export type WritingQualityPanel = {
  overallScore: number;
  weakestLayerCode: WritingQualityLayer["code"] | null;
  layers: WritingQualityLayer[];
};

type MaterialReadinessLike = {
  attachedFragmentCount?: number | null;
  uniqueSourceTypeCount?: number | null;
  screenshotCount?: number | null;
} | null;

type EvidenceStatsLike = {
  ready?: boolean | null;
  itemCount?: number | null;
  flags?: string[] | null;
} | null;

type WritingQualityInput = {
  markdownContent?: string | null;
  aiNoise?: ReturnType<typeof analyzeAiNoise> | null;
  languageGuardHitsCount?: number | null;
  humanSignalScore?: number | null;
  hasRealScene?: boolean | null;
  hasNonDelegableTruth?: boolean | null;
  materialReadiness?: MaterialReadinessLike;
  evidenceStats?: EvidenceStatsLike;
  missingEvidenceCount?: number | null;
  deepWritingPayload?: Record<string, unknown> | null;
  researchBriefPayload?: Record<string, unknown> | null;
  diversityReport?: WritingDiversityReport | null;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string) {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function analyzeStyleConsistencySignals(markdownContent: string) {
  const content = String(markdownContent || "");
  const plain = stripMarkdown(content);
  const paragraphs = splitParagraphs(content);
  const sentences = splitSentences(plain);
  const sentenceLengths = sentences.map((item) => item.length);
  const shortSentenceCount = sentenceLengths.filter((length) => length > 0 && length <= 14).length;
  const longSentenceCount = sentenceLengths.filter((length) => length >= 28).length;
  const singleSentenceParagraphCount = paragraphs.filter((paragraph) => splitSentences(paragraph).length === 1).length;
  const callbackCount = (plain.match(/前面说过|说回|回到开头|回到前面|前文|前面提到|一开始那个|绕回来|再看开头/g) ?? []).length;
  const colloquialMarkerCount = (plain.match(/我觉得|我更倾向|说白了|说到底|但问题是|你会发现|你看|老实说|其实|真要说|有点|这事|这玩意|别急|先别/g) ?? []).length;
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;
  const sentenceVariationWeak = sentenceCount >= 6 && (shortSentenceCount === 0 || longSentenceCount === 0);
  const breakPatternWeak = paragraphCount >= 4 && singleSentenceParagraphCount === 0;
  const callbackWeak = paragraphCount >= 4 && callbackCount === 0;
  const colloquialDensityWeak = sentenceCount >= 6 && colloquialMarkerCount === 0;

  return {
    sentenceCount,
    paragraphCount,
    shortSentenceCount,
    longSentenceCount,
    singleSentenceParagraphCount,
    callbackCount,
    colloquialMarkerCount,
    sentenceVariationWeak,
    breakPatternWeak,
    callbackWeak,
    colloquialDensityWeak,
  };
}

function getHistorySignal(value: unknown) {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  return {
    sampleCount: Number(record.sampleCount || 0),
    hitCount: Number(record.hitCount || 0),
    nearMissCount: Number(record.nearMissCount || 0),
    missCount: Number(record.missCount || 0),
    rankingAdjustment: Number(record.rankingAdjustment || 0),
    reason: getString(record.reason),
  };
}

function buildHardRulesLayer(input: WritingQualityInput) {
  const aiNoise = input.aiNoise ?? analyzeAiNoise(input.markdownContent || "");
  const languageGuardHitsCount = Number(input.languageGuardHitsCount || 0);
  const score = clamp(
    100
      - aiNoise.score * 0.7
      - languageGuardHitsCount * 12
      - (aiNoise.preannounceRisk === "high" ? 8 : aiNoise.preannounceRisk === "medium" ? 4 : 0)
      - (aiNoise.summaryEndingRisk === "high" ? 8 : aiNoise.summaryEndingRisk === "medium" ? 4 : 0),
  );
  const issues = [
    languageGuardHitsCount > 0 ? `命中 ${languageGuardHitsCount} 条语言守卫规则。` : null,
    aiNoise.matchedBannedPhrases.length > 0 ? `禁用表达残留：${aiNoise.matchedBannedPhrases.join(" / ")}` : null,
    aiNoise.matchedPreannouncePhrases.length > 0 ? `仍有预告式起手：${aiNoise.matchedPreannouncePhrases.join(" / ")}` : null,
    aiNoise.matchedSummaryEndingPhrases.length > 0 ? `仍有总结式收尾：${aiNoise.matchedSummaryEndingPhrases.join(" / ")}` : null,
    aiNoise.outlineRigidityRisk === "high" ? "结构工整感过强，已经接近模板稿。" : null,
  ].filter(Boolean) as string[];
  const suggestions = [
    languageGuardHitsCount > 0 ? "先清掉语言守卫命中项，再谈节奏优化。" : null,
    ...aiNoise.suggestions.slice(0, 3),
  ].filter(Boolean) as string[];
  const status: WritingQualityLayerStatus =
    languageGuardHitsCount >= 3 || aiNoise.score >= 85
      ? "blocked"
      : issues.length > 0 || aiNoise.score >= 45
        ? "needs_attention"
        : "ready";

  return {
    code: "hard_rules" as const,
    title: "L1 硬规则",
    status,
    score,
    summary:
      status === "ready"
        ? "禁用表达、预告句和总结腔基本收住了。"
        : status === "blocked"
          ? "基础机器味还没清干净，继续润色前先处理硬伤。"
          : "硬规则层还有明显残留，先把最直观的机器味剔掉。",
    issues,
    suggestions,
  };
}

function buildStyleConsistencyLayer(input: WritingQualityInput) {
  const aiNoise = input.aiNoise ?? analyzeAiNoise(input.markdownContent || "");
  const deepWritingPayload = input.deepWritingPayload;
  const styleSignals = analyzeStyleConsistencySignals(input.markdownContent || "");
  const prototypeLabel = getString(deepWritingPayload?.articlePrototypeLabel) || getString(deepWritingPayload?.articlePrototype);
  const stateVariantLabel = getString(deepWritingPayload?.stateVariantLabel);
  const stateChecklistCount = getStringArray(deepWritingPayload?.stateChecklist, 6).length;
  const sectionBlueprint = getRecordArray(deepWritingPayload?.sectionBlueprint, 8);
  const progressiveRevealEnabled = Boolean(deepWritingPayload?.progressiveRevealEnabled);
  const progressiveRevealSteps = getRecordArray(deepWritingPayload?.progressiveRevealSteps, 6);
  const revealRoleCount = sectionBlueprint.filter((item) => getString(item.revealRole)).length;
  const diversityReport = input.diversityReport ?? null;
  const prototypeHistorySignal = getHistorySignal(deepWritingPayload?.prototypeHistorySignal);
  const stateHistorySignal = getHistorySignal(deepWritingPayload?.stateHistorySignal);
  const issues = [
    !prototypeLabel ? "执行卡里还没有明确文章原型。" : null,
    !stateVariantLabel ? "执行卡里还没有明确当前写作状态。" : null,
    stateChecklistCount === 0 ? "状态自检为空，正文更容易滑回模板推进。" : null,
    sectionBlueprint.length < 3 ? "执行卡章节偏薄，结构很难稳定承载节奏变化。" : null,
    progressiveRevealEnabled && progressiveRevealSteps.length === 0 ? "已启用升番，但没有逐层推进步骤。" : null,
    progressiveRevealEnabled && revealRoleCount < Math.min(sectionBlueprint.length, 2) ? "升番已启用，但章节还没标清铺垫 / 加码 / 最强发现。" : null,
    aiNoise.outlineRigidityRisk === "high" ? "正文实际段落仍过于工整，和状态设计不一致。" : null,
    styleSignals.sentenceVariationWeak
      ? `正文句长变化偏弱，当前仅识别到 ${styleSignals.shortSentenceCount} 句短句、${styleSignals.longSentenceCount} 句长句，呼吸变化不够。`
      : null,
    styleSignals.breakPatternWeak
      ? "正文几乎没有断裂段或一句话独段，段落呼吸还不够像人在现场推进。"
      : null,
    styleSignals.callbackWeak
      ? "正文还没有明显回扣动作，开头抛出的东西没有在后文接回来。"
      : null,
    styleSignals.colloquialDensityWeak
      ? "正文口语密度偏低，句子偏说明书，少了作者在当面说话的手感。"
      : null,
    prototypeHistorySignal && prototypeHistorySignal.sampleCount >= 2 && prototypeHistorySignal.rankingAdjustment > 0
      ? `历史回流显示当前原型最近 ${prototypeHistorySignal.sampleCount} 篇表现偏弱，建议重新评估题型骨架。`
      : null,
    stateHistorySignal && stateHistorySignal.sampleCount >= 2 && stateHistorySignal.rankingAdjustment > 0
      ? `历史回流显示当前状态最近 ${stateHistorySignal.sampleCount} 篇表现偏弱，建议重新评估写作状态。`
      : null,
    diversityReport?.syntaxRepeatCount && diversityReport.syntaxRepeatCount >= 3
      ? `最近几篇连续落在「${diversityReport.currentSyntaxPatternLabel}」句法，正文呼吸开始变窄。`
      : null,
    ...(diversityReport?.status === "needs_attention" ? diversityReport.issues : []),
  ].filter(Boolean) as string[];
  const suggestions = [
    !prototypeLabel || !stateVariantLabel ? "先让 deepWriting 执行卡把原型和状态定清楚，再继续改正文。" : null,
    stateChecklistCount === 0 ? "补 3-5 条状态自检，让生成时真的按状态而不是按套路走。" : null,
    progressiveRevealEnabled && progressiveRevealSteps.length === 0 ? "给升番插件补上逐层推进步骤和高潮位置。" : null,
    aiNoise.outlineRigidityRisk !== "low" ? "允许长短段混排，减少对称句法和编号式推进。" : null,
    styleSignals.sentenceVariationWeak ? "主动拉开句长，至少让短句、长句和半截断句混着出现。" : null,
    styleSignals.breakPatternWeak ? "关键判断尝试一句话独段，别把每段都写成同一口气。" : null,
    styleSignals.callbackWeak ? "把开头抛出的现象或动作在结尾前再接一次，形成回环。" : null,
    styleSignals.colloquialDensityWeak ? "补一两处作者真的会说的话，让句子像在跟熟人交代判断。" : null,
    prototypeHistorySignal && prototypeHistorySignal.sampleCount >= 2 && prototypeHistorySignal.rankingAdjustment > 0
      ? "对照历史结果回流，优先切换原型再重生执行卡。"
      : null,
    stateHistorySignal && stateHistorySignal.sampleCount >= 2 && stateHistorySignal.rankingAdjustment > 0
      ? "对照历史结果回流，优先切换状态再重生执行卡。"
      : null,
    diversityReport?.syntaxRepeatCount && diversityReport.syntaxRepeatCount >= 3
      ? "主动换掉当前句法模式，别再沿用同一种句子推进和段落呼吸。"
      : null,
    ...(diversityReport?.status === "needs_attention" ? diversityReport.suggestions.slice(0, 2) : []),
  ].filter(Boolean) as string[];
  const score = clamp(
    100
      - (!prototypeLabel ? 28 : 0)
      - (!stateVariantLabel ? 24 : 0)
      - (stateChecklistCount === 0 ? 15 : 0)
      - (sectionBlueprint.length < 3 ? 14 : 0)
      - (progressiveRevealEnabled && progressiveRevealSteps.length === 0 ? 12 : 0)
      - (progressiveRevealEnabled && revealRoleCount < Math.min(sectionBlueprint.length, 2) ? 10 : 0)
      - (styleSignals.sentenceVariationWeak ? 8 : 0)
      - (styleSignals.breakPatternWeak ? 7 : 0)
      - (styleSignals.callbackWeak ? 6 : 0)
      - (styleSignals.colloquialDensityWeak ? 6 : 0)
      - (prototypeHistorySignal && prototypeHistorySignal.sampleCount >= 2 && prototypeHistorySignal.rankingAdjustment > 0 ? 8 : 0)
      - (stateHistorySignal && stateHistorySignal.sampleCount >= 2 && stateHistorySignal.rankingAdjustment > 0 ? 10 : 0)
      - (diversityReport?.openingRepeatCount && diversityReport.openingRepeatCount >= 3 ? 10 : 0)
      - (diversityReport?.syntaxRepeatCount && diversityReport.syntaxRepeatCount >= 3 ? 9 : 0)
      - (diversityReport?.endingRepeatCount && diversityReport.endingRepeatCount >= 3 ? 8 : 0)
      - (diversityReport?.prototypeRepeatCount && diversityReport.prototypeRepeatCount >= 3 ? 10 : 0)
      - (diversityReport?.stateVariantRepeatCount && diversityReport.stateVariantRepeatCount >= 3 ? 12 : 0)
      - (aiNoise.outlineRigidityRisk === "high" ? 16 : aiNoise.outlineRigidityRisk === "medium" ? 8 : 0),
  );
  const status: WritingQualityLayerStatus =
    !prototypeLabel || !stateVariantLabel
      ? "blocked"
      : issues.length > 0
        ? "needs_attention"
        : "ready";

  return {
    code: "style_consistency" as const,
    title: "L2 风格一致性",
    status,
    score,
    summary:
      status === "ready"
        ? "执行卡里的原型、状态和正文节奏基本对齐。"
        : status === "blocked"
          ? "状态核还没真正落到执行卡，正文容易退回统一模板。"
          : "已经有状态设计，但正文和执行卡的节奏还没完全对齐。",
    issues,
    suggestions,
  };
}

function buildContentQualityLayer(input: WritingQualityInput) {
  const materialReadiness = input.materialReadiness ?? null;
  const evidenceStats = input.evidenceStats ?? null;
  const attachedFragmentCount = Number(materialReadiness?.attachedFragmentCount || 0);
  const uniqueSourceTypeCount = Number(materialReadiness?.uniqueSourceTypeCount || 0);
  const screenshotCount = Number(materialReadiness?.screenshotCount || 0);
  const evidenceReady = Boolean(evidenceStats?.ready);
  const evidenceItemCount = Number(evidenceStats?.itemCount || 0);
  const evidenceFlags = Array.isArray(evidenceStats?.flags) ? evidenceStats.flags.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const missingEvidenceCount = Number(input.missingEvidenceCount || 0);
  const mustUseFactsCount = getStringArray(input.deepWritingPayload?.mustUseFacts, 10).length;
  const intersectionInsightCount = getRecordArray(input.researchBriefPayload?.intersectionInsights, 6).length;
  const issues = [
    !evidenceReady ? `证据包还没达发布线：${evidenceFlags.join("；") || "至少补到 3 条可核对证据。"}`
      : null,
    attachedFragmentCount === 0 ? "正文没有挂载素材锚点。" : null,
    uniqueSourceTypeCount <= 1 && evidenceItemCount > 0 ? "信源类型过于单一，容易写成单口径判断。" : null,
    screenshotCount === 0 && attachedFragmentCount > 0 ? "缺截图或证据型素材，核查时会更脆弱。" : null,
    missingEvidenceCount > 0 ? `还有 ${missingEvidenceCount} 个核查缺口没补。` : null,
    mustUseFactsCount < 2 ? "执行卡里的必须事实太少，正文容易空转观点。" : null,
    input.researchBriefPayload && intersectionInsightCount === 0 ? "已有研究阶段，但还没有交汇洞察写回。" : null,
  ].filter(Boolean) as string[];
  const suggestions = [
    !evidenceReady ? "先补齐证据包，再追求更复杂的表达层优化。" : null,
    uniqueSourceTypeCount <= 1 && evidenceItemCount > 0 ? "至少再补一类外部来源或截图证据。" : null,
    mustUseFactsCount < 2 ? "把 2-4 条必须事实写回 deepWriting 执行卡。" : null,
    input.researchBriefPayload && intersectionInsightCount === 0 ? "补一条“为什么会走到今天”的交汇洞察，再推进正文主判断。" : null,
  ].filter(Boolean) as string[];
  const score = clamp(
    100
      - (!evidenceReady ? 35 : 0)
      - (attachedFragmentCount === 0 ? 22 : 0)
      - (uniqueSourceTypeCount <= 1 && evidenceItemCount > 0 ? 12 : 0)
      - (screenshotCount === 0 && attachedFragmentCount > 0 ? 6 : 0)
      - missingEvidenceCount * 8
      - (mustUseFactsCount < 2 ? 10 : 0)
      - (input.researchBriefPayload && intersectionInsightCount === 0 ? 10 : 0),
  );
  const status: WritingQualityLayerStatus =
    !evidenceReady || attachedFragmentCount === 0
      ? "blocked"
      : issues.length > 0
        ? "needs_attention"
        : "ready";

  return {
    code: "content_quality" as const,
    title: "L3 内容质量",
    status,
    score,
    summary:
      status === "ready"
        ? "证据、素材和关键事实足够支撑主判断。"
        : status === "blocked"
          ? "内容底座还不够，继续修辞只会把空洞感放大。"
          : "内容底座已经有了，但信源结构或事实密度还可以继续补强。",
    issues,
    suggestions,
  };
}

function buildHumanityLayer(input: WritingQualityInput) {
  const humanSignalScore = Number(input.humanSignalScore || 0);
  const hasRealScene = Boolean(input.hasRealScene);
  const hasNonDelegableTruth = Boolean(input.hasNonDelegableTruth);
  const stateVariantLabel = getString(input.deepWritingPayload?.stateVariantLabel);
  const progressiveRevealEnabled = Boolean(input.deepWritingPayload?.progressiveRevealEnabled);
  const issues = [
    humanSignalScore < 2 ? `当前只补了 ${humanSignalScore} / 6 条人类信号。` : null,
    humanSignalScore >= 2 && humanSignalScore < 3 ? `人类信号刚过最低线，但还不够厚。当前为 ${humanSignalScore} / 6。` : null,
    !hasRealScene ? "缺第一手观察或真实场景，句子容易只剩判断。" : null,
    !hasNonDelegableTruth ? "缺不能交给 AI 编的真话，作者存在感还不够稳。" : null,
    !stateVariantLabel ? "没有明确写作状态，活人感容易被模板节奏抹平。" : null,
    humanSignalScore >= 3 && !progressiveRevealEnabled ? "这篇已有足够人类信号，可以考虑用更有呼吸感的节奏插件。": null,
  ].filter(Boolean) as string[];
  const suggestions = [
    humanSignalScore < 3 ? "继续补第一手观察、体感瞬间和真实场景，优先补能直接写进正文的信号。" : null,
    !hasRealScene ? "至少补一处亲历场景或一句原话。" : null,
    !hasNonDelegableTruth ? "补一条宁可不漂亮也要真的作者真话。" : null,
    !stateVariantLabel ? "先定清当前写作状态，再决定句子该怎么呼吸。" : null,
  ].filter(Boolean) as string[];
  const score = clamp(
    100
      - (humanSignalScore < 2 ? 42 : humanSignalScore < 3 ? 18 : 0)
      - (!hasRealScene ? 18 : 0)
      - (!hasNonDelegableTruth ? 14 : 0)
      - (!stateVariantLabel ? 10 : 0),
  );
  const status: WritingQualityLayerStatus =
    humanSignalScore < 2
      ? "blocked"
      : issues.length > 0
        ? "needs_attention"
        : "ready";

  return {
    code: "humanity" as const,
    title: "L4 活人感",
    status,
    score,
    summary:
      status === "ready"
        ? "作者真实信号足够，正文更容易写得像一个人在认真表达。"
        : status === "blocked"
          ? "活人感的底层输入还不够，继续润色也很难真的像人。"
          : "已经有作者痕迹，但真实观察和个人判断还可以再压深一点。",
    issues,
    suggestions,
  };
}

export function buildWritingQualityPanel(input: WritingQualityInput): WritingQualityPanel {
  const layers = [
    buildHardRulesLayer(input),
    buildStyleConsistencyLayer(input),
    buildContentQualityLayer(input),
    buildHumanityLayer(input),
  ];
  const weakestLayer = [...layers].sort((left, right) => left.score - right.score)[0] ?? null;

  return {
    overallScore: Math.round(average(layers.map((item) => item.score))),
    weakestLayerCode: weakestLayer?.code ?? null,
    layers,
  };
}
