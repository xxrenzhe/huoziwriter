const BANNED_PHRASES = ["赋能", "底层逻辑", "不可否认", "毋庸置疑", "瞬息万变", "颗粒度", "总而言之", "闭环"];
const EMPTY_PHRASES = ["高质量发展", "抓手", "全方位", "体系化", "方法论", "价值闭环", "协同效率", "有效提升"];
const TRANSITION_PHRASES = ["与此同时", "换句话说", "从某种意义上说", "某种程度上", "归根结底", "首先", "其次", "最后"];

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

export function analyzeAiNoise(content: string) {
  const text = content.trim();
  if (!text) {
    return {
      score: 0,
      level: "empty" as const,
      matchedBannedPhrases: [] as string[],
      matchedEmptyPhrases: [] as string[],
      matchedTransitions: [] as string[],
      longSentenceCount: 0,
      repeatedConnectorCount: 0,
      findings: [] as string[],
      suggestions: ["先粘贴一段草稿，再开始扫描。"],
    };
  }

  const bannedHits = countHits(text, BANNED_PHRASES);
  const emptyHits = countHits(text, EMPTY_PHRASES);
  const transitionHits = countHits(text, TRANSITION_PHRASES);
  const sentences = splitSentences(text);
  const longSentences = sentences.filter((sentence) => sentence.length >= 38);
  const repeatedConnectorCount = (text.match(/我们需要|在这个|通过|进行/g) || []).length;

  const rawScore =
    bannedHits.reduce((total, item) => total + item.count * 14, 0) +
    emptyHits.reduce((total, item) => total + item.count * 9, 0) +
    transitionHits.reduce((total, item) => total + item.count * 6, 0) +
    longSentences.length * 8 +
    Math.max(0, repeatedConnectorCount - 2) * 4;

  const score = Math.min(100, rawScore);
  const level = score >= 80 ? "high" : score >= 45 ? "medium" : "low";
  const findings = [
    bannedHits.length ? `命中死刑词：${bannedHits.map((item) => item.phrase).join(" / ")}` : null,
    emptyHits.length ? `命中空话短语：${emptyHits.map((item) => item.phrase).join(" / ")}` : null,
    transitionHits.length ? `命中过度转折：${transitionHits.map((item) => item.phrase).join(" / ")}` : null,
    longSentences.length ? `检测到 ${longSentences.length} 句长句，容易出现播音腔和抽象铺垫。` : null,
    repeatedConnectorCount > 2 ? `连接词重复偏多，像“我们需要 / 通过 / 在这个”这类起手式过密。` : null,
  ].filter(Boolean) as string[];

  const suggestions = [
    bannedHits.length ? "先删掉命中的死刑词，把判断换成具体动作、数据或角色关系。" : null,
    emptyHits.length ? "空话短语后面补事实锚点，否则整句直接删除。" : null,
    longSentences.length ? "把超过 38 字的长句斩成两到三句，每句只保留一个动作。" : null,
    !bannedHits.length && !emptyHits.length && score < 45 ? "语言污染度不高，可以继续补事实密度，而不是再堆修辞。" : null,
  ].filter(Boolean) as string[];

  return {
    score,
    level,
    matchedBannedPhrases: bannedHits.map((item) => item.phrase),
    matchedEmptyPhrases: emptyHits.map((item) => item.phrase),
    matchedTransitions: transitionHits.map((item) => item.phrase),
    longSentenceCount: longSentences.length,
    repeatedConnectorCount,
    findings,
    suggestions,
  };
}
