import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { ensureBootstrapData } from "./repositories";
import { loadPrompt } from "./prompt-loader";
import { formatPromptTemplate } from "./prompt-template";
import { fetchWebpageArticle } from "./webpage-reader";

export type WritingStyleConfidenceProfile = Record<
  | "toneKeywords"
  | "structurePatterns"
  | "languageHabits"
  | "openingPatterns"
  | "endingPatterns"
  | "sentenceRhythm"
  | "sentenceLengthProfile"
  | "paragraphBreathingPattern"
  | "punctuationHabits"
  | "tangentPatterns"
  | "callbackPatterns"
  | "statePresets"
  | "antiOutlineRules"
  | "verbatimPhraseBanks",
  number
>;

export type WritingStyleSampleSource = {
  url: string;
  title: string;
  summary: string;
  degradedReason: string | null;
};

export type WritingStyleAnalysis = {
  sourceUrl: string;
  sourceTitle: string;
  styleName: string;
  summary: string;
  toneKeywords: string[];
  sentenceRhythm: string;
  structurePatterns: string[];
  transitionPatterns: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  factDensity: string;
  emotionalIntensity: string;
  suitableTopics: string[];
  reusablePromptFragments: string[];
  doNotWrite: string[];
  verbatimPhraseBanks: {
    transitionPhrases: string[];
    judgementPhrases: string[];
    selfDisclosurePhrases: string[];
    emotionPhrases: string[];
    readerBridgePhrases: string[];
  };
  sentenceLengthProfile: string;
  paragraphBreathingPattern: string;
  punctuationHabits: string[];
  tangentPatterns: string[];
  callbackPatterns: string[];
  tabooPatterns: string[];
  statePresets: string[];
  antiOutlineRules: string[];
  imitationPrompt: string;
  sourceExcerpt: string;
  model: string;
  provider: string;
  degradedReason: string | null;
  sampleCount?: number;
  sampleUrls?: string[];
  sampleTitles?: string[];
  sampleSources?: WritingStyleSampleSource[];
  confidenceProfile?: WritingStyleConfidenceProfile | null;
};

function uniqueTrimmed(values: unknown, limit = 5) {
  if (!Array.isArray(values)) return [] as string[];
  return Array.from(
    new Set(values.map((item) => String(item).trim()).filter(Boolean)),
  ).slice(0, limit);
}

function pickString(value: unknown, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function pickPhraseBanks(value: unknown, fallback: WritingStyleAnalysis["verbatimPhraseBanks"]) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  if (!record) return fallback;
  return {
    transitionPhrases: uniqueTrimmed(record.transitionPhrases, 6).length ? uniqueTrimmed(record.transitionPhrases, 6) : fallback.transitionPhrases,
    judgementPhrases: uniqueTrimmed(record.judgementPhrases, 6).length ? uniqueTrimmed(record.judgementPhrases, 6) : fallback.judgementPhrases,
    selfDisclosurePhrases: uniqueTrimmed(record.selfDisclosurePhrases, 6).length ? uniqueTrimmed(record.selfDisclosurePhrases, 6) : fallback.selfDisclosurePhrases,
    emotionPhrases: uniqueTrimmed(record.emotionPhrases, 6).length ? uniqueTrimmed(record.emotionPhrases, 6) : fallback.emotionPhrases,
    readerBridgePhrases: uniqueTrimmed(record.readerBridgePhrases, 6).length ? uniqueTrimmed(record.readerBridgePhrases, 6) : fallback.readerBridgePhrases,
  };
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeComparisonText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function aggregateStringField(
  analyses: WritingStyleAnalysis[],
  selector: (item: WritingStyleAnalysis) => string,
  fallback: string,
) {
  const counts = new Map<string, { value: string; count: number }>();
  for (const analysis of analyses) {
    const value = selector(analysis).trim();
    if (!value) continue;
    const normalized = normalizeComparisonText(value);
    const current = counts.get(normalized);
    if (current) {
      current.count += 1;
    } else {
      counts.set(normalized, { value, count: 1 });
    }
  }
  const dominant = Array.from(counts.values()).sort((left, right) => right.count - left.count || right.value.length - left.value.length)[0];
  return {
    value: dominant?.value || fallback,
    confidence: clampConfidence((dominant?.count || 1) / Math.max(analyses.length, 1)),
  };
}

function aggregateArrayField(
  analyses: WritingStyleAnalysis[],
  selector: (item: WritingStyleAnalysis) => string[],
  limit = 5,
) {
  const counts = new Map<string, { value: string; count: number }>();
  for (const analysis of analyses) {
    const uniqueValues = Array.from(new Set(selector(analysis).map((item) => String(item || "").trim()).filter(Boolean)));
    for (const value of uniqueValues) {
      const normalized = normalizeComparisonText(value);
      const current = counts.get(normalized);
      if (current) {
        current.count += 1;
      } else {
        counts.set(normalized, { value, count: 1 });
      }
    }
  }
  const sorted = Array.from(counts.values()).sort((left, right) => right.count - left.count || right.value.length - left.value.length);
  const values = sorted.slice(0, limit).map((item) => item.value);
  const dominantCount = sorted[0]?.count || 0;
  return {
    values,
    confidence: clampConfidence(dominantCount / Math.max(analyses.length, 1)),
  };
}

function aggregatePhraseBanks(analyses: WritingStyleAnalysis[]) {
  const transitionPhrases = aggregateArrayField(analyses, (item) => item.verbatimPhraseBanks.transitionPhrases, 6);
  const judgementPhrases = aggregateArrayField(analyses, (item) => item.verbatimPhraseBanks.judgementPhrases, 6);
  const selfDisclosurePhrases = aggregateArrayField(analyses, (item) => item.verbatimPhraseBanks.selfDisclosurePhrases, 6);
  const emotionPhrases = aggregateArrayField(analyses, (item) => item.verbatimPhraseBanks.emotionPhrases, 6);
  const readerBridgePhrases = aggregateArrayField(analyses, (item) => item.verbatimPhraseBanks.readerBridgePhrases, 6);
  return {
    value: {
      transitionPhrases: transitionPhrases.values,
      judgementPhrases: judgementPhrases.values,
      selfDisclosurePhrases: selfDisclosurePhrases.values,
      emotionPhrases: emotionPhrases.values,
      readerBridgePhrases: readerBridgePhrases.values,
    },
    confidence: clampConfidence(
      (transitionPhrases.confidence + judgementPhrases.confidence + selfDisclosurePhrases.confidence + emotionPhrases.confidence + readerBridgePhrases.confidence) / 5,
    ),
  };
}

function deriveCrosscheckSummary(input: {
  sampleCount: number;
  toneKeywords: string[];
  structurePatterns: string[];
  languageHabits: string[];
  confidenceProfile: WritingStyleConfidenceProfile;
}) {
  const stable = Object.entries(input.confidenceProfile)
    .filter(([, score]) => score >= 0.7)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label]) => label);
  const variable = Object.entries(input.confidenceProfile)
    .filter(([, score]) => score < 0.55)
    .sort((left, right) => left[1] - right[1])
    .slice(0, 2)
    .map(([label]) => label);

  const stableLabelMap: Record<string, string> = {
    toneKeywords: "语气关键词",
    structurePatterns: "结构习惯",
    languageHabits: "语言习惯",
    openingPatterns: "开头动作",
    endingPatterns: "结尾动作",
    sentenceRhythm: "句长节奏",
    sentenceLengthProfile: "句长分布",
    paragraphBreathingPattern: "段落呼吸",
    punctuationHabits: "标点习惯",
    tangentPatterns: "跑题方式",
    callbackPatterns: "回环方式",
    statePresets: "状态预设",
    antiOutlineRules: "反结构规则",
    verbatimPhraseBanks: "逐字词组",
  };

  const stableText = stable.length > 0 ? stable.map((item) => stableLabelMap[item] || item).join("、") : "整体语感";
  const variableText = variable.length > 0
    ? formatPromptTemplate("；波动相对更大的维度是 {{variableLabels}}", {
      variableLabels: variable.map((item) => stableLabelMap[item] || item).join("、"),
    })
    : "";
  return formatPromptTemplate(
    "基于 {{sampleCount}} 篇样本交叉聚合，这套文风最稳定的特征集中在 {{stableText}}。常见语气是 {{toneKeywords}}，常见推进方式偏向 {{structurePatterns}}，语言习惯多为 {{languageHabits}}{{variableText}}。",
    {
      sampleCount: input.sampleCount,
      stableText,
      toneKeywords: input.toneKeywords.slice(0, 3).join("、") || "判断先行",
      structurePatterns: input.structurePatterns.slice(0, 2).join("、") || "短段推进",
      languageHabits: input.languageHabits.slice(0, 2).join("、") || "判断驱动",
      variableText,
    },
  );
}

function deriveFallbackAnalysis(input: { sourceUrl: string; sourceTitle: string; rawText: string }) {
  const text = input.rawText.replace(/\s+/g, " ").trim();
  const paragraphs = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  const shortSentences = paragraphs.filter((item) => item.length <= 28).length;
  const longSentences = paragraphs.filter((item) => item.length >= 48).length;
  const toneKeywords = [
    /(模型|AI|芯片|技术|产品|平台)/i.test(text) ? "技术观察" : null,
    /(增长|利润|融资|市场|商业|估值)/.test(text) ? "商业评论" : null,
    /(经验|复盘|总结|方法|步骤)/.test(text) ? "经验拆解" : null,
    shortSentences >= longSentences ? "短句推进" : "长句论证",
  ].filter(Boolean) as string[];

  return {
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    styleName: formatPromptTemplate("{{styleLead}}风格", {
      styleLead: input.sourceTitle.slice(0, 16) || "提取",
    }),
    summary: "基于正文抓取结果生成的风格降级分析，建议后续再做人工确认。",
    toneKeywords,
    sentenceRhythm: shortSentences >= longSentences ? "短句为主，推进速度快" : "中长句较多，解释性更强",
    structurePatterns: [
      shortSentences >= longSentences ? "短句密集推进" : "长句带解释",
      "先抛事实再给判断",
      "段内用结论句收束",
    ],
    transitionPatterns: ["常用“但/不过/问题是”完成转折", "通过新旧判断对照推进段落"],
    languageHabits: [
      /(为什么|如何|不是|而是)/.test(text) ? "常用对照式判断" : "偏陈述式表达",
      /(数据|案例|事实|数字)/.test(text) ? "偏事实锚点驱动" : "偏观点先行",
    ],
    openingPatterns: ["开头先抛现象或问题", "前两句快速交代冲突"],
    endingPatterns: ["结尾回到判断或行动建议", "避免口号式收束"],
    factDensity: /(数据|案例|事实|数字|报告|财报)/.test(text) ? "高，习惯用事实锚点支撑判断" : "中，事实与观点相对均衡",
    emotionalIntensity: /(震惊|愤怒|离谱|荒诞|焦虑)/.test(text) ? "中高，带明显情绪牵引" : "中低，以冷静判断为主",
    suitableTopics: [
      /(模型|AI|芯片|技术|产品|平台)/i.test(text) ? "科技与 AI" : null,
      /(增长|利润|融资|市场|商业|估值)/.test(text) ? "商业与公司分析" : null,
      /(经验|复盘|总结|方法|步骤)/.test(text) ? "经验复盘与方法论" : null,
    ].filter(Boolean) as string[],
    verbatimPhraseBanks: {
      transitionPhrases: ["但", "不过", "问题是"],
      judgementPhrases: ["我更倾向于", "真正的问题是"],
      selfDisclosurePhrases: ["我自己的感觉是", "这件事我也踩过坑"],
      emotionPhrases: ["有点别扭", "真的会愣一下"],
      readerBridgePhrases: ["你如果也遇到过", "很多读者会卡在这里"],
    },
    sentenceLengthProfile: shortSentences >= longSentences ? "短句偏多，判断先行，少量长句用于补解释。" : "中长句偏多，但仍以判断句收束。",
    paragraphBreathingPattern: "常见短段落推进，关键判断适合独立成段，避免所有段落长度一致。",
    punctuationHabits: ["逗号推进", "问句用于转向", "减少预告式冒号"],
    tangentPatterns: ["允许短暂偏出主线补一个类比，再立刻拉回判断", "可以用一句口语打断论述的工整感"],
    callbackPatterns: ["开头抛出的现象适合在结尾回扣", "前文的小判断适合在后文变体重现"],
    tabooPatterns: ["不要写成编号提纲", "不要用总结腔收尾", "不要把知识写成讲义"],
    statePresets: ["像刚想明白一件事，急着和熟人讲清楚", "判断明确，但不端着教育别人"],
    antiOutlineRules: ["不要强行先讲背景再讲结论", "不要所有段落都按同样句法推进", "不要最后再单独升华总结"],
    reusablePromptFragments: [
      "先抛出现象或冲突，再给出核心判断。",
      "正文保持中文短句推进，每段只承担一个核心结论。",
      "结尾回到行动建议或判断更新，不要口号式收束。",
    ],
    doNotWrite: ["不要直接照抄作者句子", "不要只模仿词面，要保留事实密度"],
    imitationPrompt: formatPromptTemplate(
      "请模仿这篇文章的节奏：{{toneKeywords}}，先抛出现象和冲突，再给出判断，正文保持中文短句推进，不要空泛赞美。",
      {
        toneKeywords: toneKeywords.join("、"),
      },
    ),
    sourceExcerpt: text.slice(0, 220),
    model: "fallback-style-extract",
    provider: "local",
    degradedReason: "styleExtract failed",
    sampleCount: 1,
    sampleUrls: [input.sourceUrl],
    sampleTitles: [input.sourceTitle],
    sampleSources: [{
      url: input.sourceUrl,
      title: input.sourceTitle || "未命名文章",
      summary: "单篇降级分析样本",
      degradedReason: "styleExtract failed",
    }],
    confidenceProfile: null,
  } satisfies WritingStyleAnalysis;
}

export async function extractWritingStyleFromUrl(url: string) {
  await ensureBootstrapData();
  const article = await fetchWebpageArticle(url);
  const fallback = deriveFallbackAnalysis({
    sourceUrl: url,
    sourceTitle: article.sourceTitle,
    rawText: article.rawText,
  });

  try {
    const systemPrompt = await loadPrompt("writing_style_analysis");
    const userPrompt = [
      "请分析下面这篇中文文章的写作风格。",
      "必须返回 JSON，不要解释，不要 markdown。",
      '字段要求：{"styleName":"字符串","summary":"字符串","toneKeywords":[""],"sentenceRhythm":"字符串","sentenceLengthProfile":"字符串","paragraphBreathingPattern":"字符串","structurePatterns":[""],"transitionPatterns":[""],"languageHabits":[""],"openingPatterns":[""],"endingPatterns":[""],"punctuationHabits":[""],"tangentPatterns":[""],"callbackPatterns":[""],"factDensity":"字符串","emotionalIntensity":"字符串","suitableTopics":[""],"reusablePromptFragments":[""],"doNotWrite":[""],"tabooPatterns":[""],"statePresets":[""],"antiOutlineRules":[""],"verbatimPhraseBanks":{"transitionPhrases":[""],"judgementPhrases":[""],"selfDisclosurePhrases":[""],"emotionPhrases":[""],"readerBridgePhrases":[""]},"imitationPrompt":"字符串"}',
      "toneKeywords / structurePatterns / transitionPatterns / languageHabits / openingPatterns / endingPatterns / punctuationHabits / tangentPatterns / callbackPatterns / suitableTopics / reusablePromptFragments / doNotWrite / tabooPatterns / statePresets / antiOutlineRules 各返回 2-5 条。",
      "verbatimPhraseBanks 尽量从原文逐字抽取，若样本里没有足够短语，返回少量高置信表达，不要编造作者没写过的话。",
      "必须基于正文内容，不要空泛夸赞，不要出现“该文风很好”这类废话。",
      formatPromptTemplate("sourceTitle: {{sourceTitle}}", {
        sourceTitle: article.sourceTitle || "未命名文章",
      }),
      "",
      article.rawText,
    ].join("\n");

    const result = await generateSceneText({
      sceneCode: "styleExtract",
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });
    const payload = extractJsonObject(result.text) as Record<string, unknown>;

    return {
      sourceUrl: url,
      sourceTitle: article.sourceTitle,
      styleName: String(payload.styleName || fallback.styleName).trim(),
      summary: String(payload.summary || fallback.summary).trim(),
      toneKeywords: uniqueTrimmed(payload.toneKeywords, 5).length ? uniqueTrimmed(payload.toneKeywords, 5) : fallback.toneKeywords,
      sentenceRhythm: pickString(payload.sentenceRhythm, fallback.sentenceRhythm),
      sentenceLengthProfile: pickString(payload.sentenceLengthProfile, fallback.sentenceLengthProfile),
      paragraphBreathingPattern: pickString(payload.paragraphBreathingPattern, fallback.paragraphBreathingPattern),
      structurePatterns: uniqueTrimmed(payload.structurePatterns, 5).length ? uniqueTrimmed(payload.structurePatterns, 5) : fallback.structurePatterns,
      transitionPatterns: uniqueTrimmed(payload.transitionPatterns, 5).length ? uniqueTrimmed(payload.transitionPatterns, 5) : fallback.transitionPatterns,
      languageHabits: uniqueTrimmed(payload.languageHabits, 5).length ? uniqueTrimmed(payload.languageHabits, 5) : fallback.languageHabits,
      openingPatterns: uniqueTrimmed(payload.openingPatterns, 5).length ? uniqueTrimmed(payload.openingPatterns, 5) : fallback.openingPatterns,
      endingPatterns: uniqueTrimmed(payload.endingPatterns, 5).length ? uniqueTrimmed(payload.endingPatterns, 5) : fallback.endingPatterns,
      punctuationHabits: uniqueTrimmed(payload.punctuationHabits, 5).length ? uniqueTrimmed(payload.punctuationHabits, 5) : fallback.punctuationHabits,
      tangentPatterns: uniqueTrimmed(payload.tangentPatterns, 5).length ? uniqueTrimmed(payload.tangentPatterns, 5) : fallback.tangentPatterns,
      callbackPatterns: uniqueTrimmed(payload.callbackPatterns, 5).length ? uniqueTrimmed(payload.callbackPatterns, 5) : fallback.callbackPatterns,
      factDensity: pickString(payload.factDensity, fallback.factDensity),
      emotionalIntensity: pickString(payload.emotionalIntensity, fallback.emotionalIntensity),
      suitableTopics: uniqueTrimmed(payload.suitableTopics, 5).length ? uniqueTrimmed(payload.suitableTopics, 5) : fallback.suitableTopics,
      reusablePromptFragments: uniqueTrimmed(payload.reusablePromptFragments, 5).length
        ? uniqueTrimmed(payload.reusablePromptFragments, 5)
        : fallback.reusablePromptFragments,
      doNotWrite: uniqueTrimmed(payload.doNotWrite, 5).length ? uniqueTrimmed(payload.doNotWrite, 5) : fallback.doNotWrite,
      verbatimPhraseBanks: pickPhraseBanks(payload.verbatimPhraseBanks, fallback.verbatimPhraseBanks),
      tabooPatterns: uniqueTrimmed(payload.tabooPatterns, 5).length ? uniqueTrimmed(payload.tabooPatterns, 5) : fallback.tabooPatterns,
      statePresets: uniqueTrimmed(payload.statePresets, 5).length ? uniqueTrimmed(payload.statePresets, 5) : fallback.statePresets,
      antiOutlineRules: uniqueTrimmed(payload.antiOutlineRules, 5).length ? uniqueTrimmed(payload.antiOutlineRules, 5) : fallback.antiOutlineRules,
      imitationPrompt: String(payload.imitationPrompt || fallback.imitationPrompt).trim(),
      sourceExcerpt: article.rawText.slice(0, 220),
      model: result.model,
      provider: result.provider,
      degradedReason: null,
      sampleCount: 1,
      sampleUrls: [url],
      sampleTitles: [article.sourceTitle],
      sampleSources: [{
        url,
        title: article.sourceTitle || "未命名文章",
        summary: String(payload.summary || fallback.summary).trim(),
        degradedReason: null,
      }],
      confidenceProfile: null,
    } satisfies WritingStyleAnalysis;
  } catch {
    return {
      ...fallback,
      sourceExcerpt: article.rawText.slice(0, 220),
    } satisfies WritingStyleAnalysis;
  }
}

export async function extractWritingStyleFromUrls(urls: string[]) {
  await ensureBootstrapData();
  const normalizedUrls = Array.from(new Set(urls.map((item) => String(item || "").trim()).filter(Boolean)));
  if (normalizedUrls.length === 0) {
    throw new Error("至少提供 1 篇文章链接");
  }

  const analyses = await Promise.all(normalizedUrls.map((url) => extractWritingStyleFromUrl(url)));
  if (analyses.length === 1) {
    return analyses[0]!;
  }

  const toneKeywords = aggregateArrayField(analyses, (item) => item.toneKeywords, 5);
  const structurePatterns = aggregateArrayField(analyses, (item) => item.structurePatterns, 5);
  const languageHabits = aggregateArrayField(analyses, (item) => item.languageHabits, 5);
  const openingPatterns = aggregateArrayField(analyses, (item) => item.openingPatterns, 5);
  const endingPatterns = aggregateArrayField(analyses, (item) => item.endingPatterns, 5);
  const punctuationHabits = aggregateArrayField(analyses, (item) => item.punctuationHabits, 5);
  const tangentPatterns = aggregateArrayField(analyses, (item) => item.tangentPatterns, 5);
  const callbackPatterns = aggregateArrayField(analyses, (item) => item.callbackPatterns, 5);
  const suitableTopics = aggregateArrayField(analyses, (item) => item.suitableTopics, 5);
  const reusablePromptFragments = aggregateArrayField(analyses, (item) => item.reusablePromptFragments, 5);
  const doNotWrite = aggregateArrayField(analyses, (item) => item.doNotWrite, 5);
  const tabooPatterns = aggregateArrayField(analyses, (item) => item.tabooPatterns, 5);
  const statePresets = aggregateArrayField(analyses, (item) => item.statePresets, 5);
  const antiOutlineRules = aggregateArrayField(analyses, (item) => item.antiOutlineRules, 5);
  const sentenceRhythm = aggregateStringField(analyses, (item) => item.sentenceRhythm, analyses[0]!.sentenceRhythm);
  const sentenceLengthProfile = aggregateStringField(analyses, (item) => item.sentenceLengthProfile, analyses[0]!.sentenceLengthProfile);
  const paragraphBreathingPattern = aggregateStringField(analyses, (item) => item.paragraphBreathingPattern, analyses[0]!.paragraphBreathingPattern);
  const factDensity = aggregateStringField(analyses, (item) => item.factDensity, analyses[0]!.factDensity);
  const emotionalIntensity = aggregateStringField(analyses, (item) => item.emotionalIntensity, analyses[0]!.emotionalIntensity);
  const phraseBanks = aggregatePhraseBanks(analyses);

  const confidenceProfile: WritingStyleConfidenceProfile = {
    toneKeywords: toneKeywords.confidence,
    structurePatterns: structurePatterns.confidence,
    languageHabits: languageHabits.confidence,
    openingPatterns: openingPatterns.confidence,
    endingPatterns: endingPatterns.confidence,
    sentenceRhythm: sentenceRhythm.confidence,
    sentenceLengthProfile: sentenceLengthProfile.confidence,
    paragraphBreathingPattern: paragraphBreathingPattern.confidence,
    punctuationHabits: punctuationHabits.confidence,
    tangentPatterns: tangentPatterns.confidence,
    callbackPatterns: callbackPatterns.confidence,
    statePresets: statePresets.confidence,
    antiOutlineRules: antiOutlineRules.confidence,
    verbatimPhraseBanks: phraseBanks.confidence,
  };

  const degradedCount = analyses.filter((item) => item.degradedReason).length;
  const sourceTitles = analyses.map((item) => item.sourceTitle).filter(Boolean);
  const styleNameLead = sourceTitles[0] || analyses[0]!.styleName || "交叉样本";
  const sourceTitle = analyses.length === 2
    ? formatPromptTemplate("{{styleNameLead}} 等 2 篇样本", {
      styleNameLead,
    })
    : formatPromptTemplate("{{styleNameLead}} 等 {{sampleCount}} 篇样本", {
      styleNameLead,
      sampleCount: analyses.length,
    });
  const summary = deriveCrosscheckSummary({
    sampleCount: analyses.length,
    toneKeywords: toneKeywords.values,
    structurePatterns: structurePatterns.values,
    languageHabits: languageHabits.values,
    confidenceProfile,
  });

  return {
    sourceUrl: analyses[0]!.sourceUrl,
    sourceTitle,
    styleName: formatPromptTemplate("{{styleLead}}交叉风格", {
      styleLead: styleNameLead.slice(0, 18),
    }),
    summary,
    toneKeywords: toneKeywords.values,
    sentenceRhythm: sentenceRhythm.value,
    structurePatterns: structurePatterns.values,
    transitionPatterns: aggregateArrayField(analyses, (item) => item.transitionPatterns, 5).values,
    languageHabits: languageHabits.values,
    openingPatterns: openingPatterns.values,
    endingPatterns: endingPatterns.values,
    factDensity: factDensity.value,
    emotionalIntensity: emotionalIntensity.value,
    suitableTopics: suitableTopics.values,
    reusablePromptFragments: reusablePromptFragments.values,
    doNotWrite: doNotWrite.values,
    verbatimPhraseBanks: phraseBanks.value,
    sentenceLengthProfile: sentenceLengthProfile.value,
    paragraphBreathingPattern: paragraphBreathingPattern.value,
    punctuationHabits: punctuationHabits.values,
    tangentPatterns: tangentPatterns.values,
    callbackPatterns: callbackPatterns.values,
    tabooPatterns: tabooPatterns.values,
    statePresets: statePresets.values,
    antiOutlineRules: antiOutlineRules.values,
    imitationPrompt: formatPromptTemplate(
      "请参考这组样本的稳定共性来写：语气偏 {{toneKeywords}}，结构上优先 {{structurePatterns}}，句长节奏遵守“{{sentenceLengthProfile}}”，并尽量沿用这些逐字短语：{{transitionPhrases}}。",
      {
        toneKeywords: toneKeywords.values.slice(0, 3).join("、") || "判断先行",
        structurePatterns: structurePatterns.values.slice(0, 2).join("、") || "短段推进",
        sentenceLengthProfile: sentenceLengthProfile.value,
        transitionPhrases: phraseBanks.value.transitionPhrases.slice(0, 2).join(" / ") || "但 / 问题是",
      },
    ),
    sourceExcerpt: analyses.map((item) => item.sourceExcerpt).filter(Boolean).slice(0, 3).join("\n\n---\n\n").slice(0, 660),
    model: analyses.map((item) => item.model).filter(Boolean).join(" + "),
    provider: analyses.map((item) => item.provider).filter(Boolean).join(" + "),
    degradedReason: degradedCount > 0
      ? formatPromptTemplate("共 {{degradedCount}} 篇样本走了降级分析。", {
        degradedCount,
      })
      : null,
    sampleCount: analyses.length,
    sampleUrls: analyses.map((item) => item.sourceUrl).filter(Boolean),
    sampleTitles: sourceTitles,
    sampleSources: analyses.map((item) => ({
      url: item.sourceUrl,
      title: item.sourceTitle || "未命名文章",
      summary: item.summary,
      degradedReason: item.degradedReason,
    })),
    confidenceProfile,
  } satisfies WritingStyleAnalysis;
}
