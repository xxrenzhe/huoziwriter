const BANNED_PHRASES = ["赋能", "底层逻辑", "不可否认", "毋庸置疑", "瞬息万变", "颗粒度", "总而言之", "闭环"];
const EMPTY_PHRASES = ["高质量发展", "抓手", "全方位", "体系化", "方法论", "价值闭环", "协同效率", "有效提升"];
const TRANSITION_PHRASES = ["与此同时", "换句话说", "从某种意义上说", "某种程度上", "归根结底", "首先", "其次", "最后"];
const PREANNOUNCE_PHRASES = ["让我们来看看", "接下来让我们", "下面我们来", "接下来我们将", "本文将"];
const SUMMARY_ENDING_PHRASES = ["综上所述", "总的来说", "总而言之", "最后我们可以看到", "由此可见"];

function countHits(content: string, phrases: string[]) {
  return phrases
    .map((phrase) => ({
      phrase,
      count: content.split(phrase).length - 1,
    }))
    .filter((item) => item.count > 0);
}

function splitSentences(content: string) {
  return content
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function analyzeAiNoise(content: string) {
  const text = content.trim();
  if (!text) {
    return {
      score: 0,
      level: "empty" as const,
      matchedBannedPhrases: [] as string[],
      matchedEmptyPhrases: [] as string[],
      matchedTransitions: [] as string[],
      matchedPreannouncePhrases: [] as string[],
      matchedSummaryEndingPhrases: [] as string[],
      longSentenceCount: 0,
      repeatedConnectorCount: 0,
      outlineRigidityRisk: "low" as const,
      summaryEndingRisk: "low" as const,
      preannounceRisk: "low" as const,
      findings: [] as string[],
      reasonDetails: [] as Array<{ label: string; reason: string; count: number; suggestion?: string }>,
      suggestions: ["先粘贴一段草稿，再开始扫描。"],
    };
  }

  const bannedHits = countHits(text, BANNED_PHRASES);
  const emptyHits = countHits(text, EMPTY_PHRASES);
  const transitionHits = countHits(text, TRANSITION_PHRASES);
  const preannounceHits = countHits(text, PREANNOUNCE_PHRASES);
  const summaryEndingHits = countHits(text, SUMMARY_ENDING_PHRASES);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const longSentences = sentences.filter((sentence) => sentence.length >= 38);
  const repeatedConnectorCount = (text.match(/我们需要|在这个|通过|进行/g) || []).length;
  const paragraphLengthBuckets = paragraphs.map((paragraph) => Math.min(6, Math.floor(paragraph.length / 40)));
  const repeatedParagraphBuckets = paragraphLengthBuckets.filter((bucket, index) => index > 0 && bucket === paragraphLengthBuckets[index - 1]).length;
  const outlineRigidityRaw = transitionHits.reduce((total, item) => total + item.count, 0) + repeatedParagraphBuckets + preannounceHits.reduce((total, item) => total + item.count, 0);

  const rawScore =
    bannedHits.reduce((total, item) => total + item.count * 14, 0) +
    emptyHits.reduce((total, item) => total + item.count * 9, 0) +
    transitionHits.reduce((total, item) => total + item.count * 6, 0) +
    preannounceHits.reduce((total, item) => total + item.count * 8, 0) +
    summaryEndingHits.reduce((total, item) => total + item.count * 10, 0) +
    longSentences.length * 8 +
    Math.max(0, repeatedConnectorCount - 2) * 4 +
    Math.max(0, repeatedParagraphBuckets - 1) * 5;

  const score = Math.min(100, rawScore);
  const level = score >= 80 ? "high" : score >= 45 ? "medium" : "low";
  const outlineRigidityRisk = outlineRigidityRaw >= 6 ? "high" : outlineRigidityRaw >= 3 ? "medium" : "low";
  const summaryEndingRisk = summaryEndingHits.length > 0 ? (summaryEndingHits.reduce((total, item) => total + item.count, 0) >= 2 ? "high" : "medium") : "low";
  const preannounceRisk = preannounceHits.length > 0 ? (preannounceHits.reduce((total, item) => total + item.count, 0) >= 2 ? "high" : "medium") : "low";
  const reasonDetails = [
    bannedHits.length
      ? {
          label: "禁用表达",
          reason: "这类抽象词会直接把句子推向机器腔，读者很难看到具体动作、对象和结果。",
          count: bannedHits.reduce((total, item) => total + item.count, 0),
          suggestion: "把抽象判断改成具体事实、动作关系或代价结果。",
        }
      : null,
    emptyHits.length
      ? {
          label: "空话短语",
          reason: "句子像正确但空泛的结论模板，没有事实锚点时会明显拉低信息密度。",
          count: emptyHits.reduce((total, item) => total + item.count, 0),
          suggestion: "空话后面必须补数字、案例、角色或证据，否则整句删除。",
        }
      : null,
    transitionHits.length
      ? {
          label: "过度转折",
          reason: "连接词太密时，文章会更像播音稿或汇报稿，而不是自然推进的论证。",
          count: transitionHits.reduce((total, item) => total + item.count, 0),
          suggestion: "删掉无效转折，直接让事实句或判断句接上下一句。",
        }
      : null,
    preannounceHits.length
      ? {
          label: "预告式句子",
          reason: "先告诉读者你要讲什么，再开始讲，会让文章更像说明书而不是自然叙述。",
          count: preannounceHits.reduce((total, item) => total + item.count, 0),
          suggestion: "删掉预告，直接从具体事实、场景或判断切入。",
        }
      : null,
    summaryEndingHits.length
      ? {
          label: "总结式收尾",
          reason: "结尾重新总结会把前面的呼吸感抹平，读者会更明显感到模板味。",
          count: summaryEndingHits.reduce((total, item) => total + item.count, 0),
          suggestion: "结尾停在动作、判断或画面上，不要另起一段做总结。",
        }
      : null,
    longSentences.length
      ? {
          label: "长句堆叠",
          reason: "一口气塞进多个动作和判断，会让段落显得模板化且不利于读者换气。",
          count: longSentences.length,
          suggestion: "把每句拆到只保留一个核心动作或判断。",
        }
      : null,
    repeatedConnectorCount > 2
      ? {
          label: "连接词重复",
          reason: "反复使用同一类起手式，会形成模型式重复句型。",
          count: repeatedConnectorCount,
          suggestion: "删掉高频起手式，直接进入事实、对象和结论。",
        }
      : null,
    outlineRigidityRisk !== "low"
      ? {
          label: "结构过于工整",
          reason: "段落长度、转场方式和推进节奏太整齐时，读者会明显感到结构味先于内容味。",
          count: outlineRigidityRaw,
          suggestion: "允许长短段混排，减少编号式推进和对称句法。",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; reason: string; count: number; suggestion?: string }>;
  const findings = [
    bannedHits.length ? `命中禁用表达：${bannedHits.map((item) => item.phrase).join(" / ")}` : null,
    emptyHits.length ? `命中空话短语：${emptyHits.map((item) => item.phrase).join(" / ")}` : null,
    transitionHits.length ? `命中过度转折：${transitionHits.map((item) => item.phrase).join(" / ")}` : null,
    preannounceHits.length ? `命中预告式句子：${preannounceHits.map((item) => item.phrase).join(" / ")}` : null,
    summaryEndingHits.length ? `命中总结式收尾：${summaryEndingHits.map((item) => item.phrase).join(" / ")}` : null,
    longSentences.length ? `检测到 ${longSentences.length} 句长句，容易出现播音腔和抽象铺垫。` : null,
    repeatedConnectorCount > 2 ? `连接词重复偏多，像“我们需要 / 通过 / 在这个”这类起手式过密。` : null,
    outlineRigidityRisk !== "low" ? "段落和转场过于整齐，像按施工图展开。" : null,
  ].filter(Boolean) as string[];

  const suggestions = [
    bannedHits.length ? "先删掉命中的禁用表达，把判断换成具体动作、数据或角色关系。" : null,
    emptyHits.length ? "空话短语后面补事实锚点，否则整句直接删除。" : null,
    longSentences.length ? "把超过 38 字的长句斩成两到三句，每句只保留一个动作。" : null,
    preannounceHits.length ? "删掉“接下来我们来看”这类预告，直接说事。" : null,
    summaryEndingHits.length ? "把结尾改成动作、判断或画面，不要重写一遍摘要。" : null,
    outlineRigidityRisk !== "low" ? "打破段落对称感，允许一句话成段或忽长忽短的呼吸变化。" : null,
    !bannedHits.length && !emptyHits.length && score < 45 ? "语言污染度不高，可以继续补事实密度，而不是再堆修辞。" : null,
  ].filter(Boolean) as string[];

  return {
    score,
    level,
    matchedBannedPhrases: bannedHits.map((item) => item.phrase),
    matchedEmptyPhrases: emptyHits.map((item) => item.phrase),
    matchedTransitions: transitionHits.map((item) => item.phrase),
    matchedPreannouncePhrases: preannounceHits.map((item) => item.phrase),
    matchedSummaryEndingPhrases: summaryEndingHits.map((item) => item.phrase),
    longSentenceCount: longSentences.length,
    repeatedConnectorCount,
    outlineRigidityRisk,
    summaryEndingRisk,
    preannounceRisk,
    findings,
    reasonDetails,
    suggestions,
  };
}
