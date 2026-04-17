import { extractJsonObject, generateSceneText } from "./ai-gateway";
import { ensureBootstrapData } from "./repositories";
import { loadPrompt } from "./prompt-loader";
import { fetchWebpageArticle } from "./webpage-reader";

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
    styleName: `${input.sourceTitle.slice(0, 16) || "提取"}风格`,
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
    imitationPrompt: `请模仿这篇文章的节奏：${toneKeywords.join("、")}，先抛出现象和冲突，再给出判断，正文保持中文短句推进，不要空泛赞美。`,
    sourceExcerpt: text.slice(0, 220),
    model: "fallback-style-extract",
    provider: "local",
    degradedReason: "styleExtract failed",
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
    const systemPrompt = await loadPrompt("style_extract");
    const userPrompt = [
      "请分析下面这篇中文文章的写作风格。",
      "必须返回 JSON，不要解释，不要 markdown。",
      '字段要求：{"styleName":"字符串","summary":"字符串","toneKeywords":[""],"sentenceRhythm":"字符串","sentenceLengthProfile":"字符串","paragraphBreathingPattern":"字符串","structurePatterns":[""],"transitionPatterns":[""],"languageHabits":[""],"openingPatterns":[""],"endingPatterns":[""],"punctuationHabits":[""],"tangentPatterns":[""],"callbackPatterns":[""],"factDensity":"字符串","emotionalIntensity":"字符串","suitableTopics":[""],"reusablePromptFragments":[""],"doNotWrite":[""],"tabooPatterns":[""],"statePresets":[""],"antiOutlineRules":[""],"verbatimPhraseBanks":{"transitionPhrases":[""],"judgementPhrases":[""],"selfDisclosurePhrases":[""],"emotionPhrases":[""],"readerBridgePhrases":[""]},"imitationPrompt":"字符串"}',
      "toneKeywords / structurePatterns / transitionPatterns / languageHabits / openingPatterns / endingPatterns / punctuationHabits / tangentPatterns / callbackPatterns / suitableTopics / reusablePromptFragments / doNotWrite / tabooPatterns / statePresets / antiOutlineRules 各返回 2-5 条。",
      "verbatimPhraseBanks 尽量从原文逐字抽取，若样本里没有足够短语，返回少量高置信表达，不要编造作者没写过的话。",
      "必须基于正文内容，不要空泛夸赞，不要出现“该文风很好”这类废话。",
      `sourceTitle: ${article.sourceTitle || "未命名文章"}`,
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
    } satisfies WritingStyleAnalysis;
  } catch {
    return {
      ...fallback,
      sourceExcerpt: article.rawText.slice(0, 220),
    } satisfies WritingStyleAnalysis;
  }
}
