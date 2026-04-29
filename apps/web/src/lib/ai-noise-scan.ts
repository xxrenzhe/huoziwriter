const BANNED_PHRASES = ["赋能", "底层逻辑", "不可否认", "毋庸置疑", "瞬息万变", "颗粒度", "总而言之"];
const EMPTY_PHRASES = ["高质量发展", "抓手", "全方位", "体系化", "方法论", "价值闭环", "协同效率", "有效提升"];
const TRANSITION_PHRASES = ["与此同时", "换句话说", "从某种意义上说", "某种程度上", "归根结底", "首先", "其次", "最后"];
const PREANNOUNCE_PHRASES = ["让我们来看看", "接下来让我们", "下面我们来", "接下来我们将", "本文将"];
const SUMMARY_ENDING_PHRASES = ["综上所述", "总的来说", "总而言之", "最后我们可以看到", "由此可见"];
const DISTANT_EXPRESSION_PHRASES = [
  "损失感",
  "旧解释",
  "开始松动",
  "解释权",
  "价值分化",
  "终局解释",
  "搜索投放这些年的变化",
  "角色分化",
  "商业质量",
  "需求阶段浮上来",
  "判断顺序",
  "价值本身",
];
const DIDACTIC_PHRASES = [
  "你应该",
  "你需要",
  "你必须",
  "我们应该",
  "我们需要",
  "必须先",
  "不要先",
  "真正该问的是",
  "真正该做的是",
  "更合理的做法",
  "建议先",
  "第一步",
  "第二步",
  "方法是",
  "步骤是",
  "行动建议",
  "任务矩阵",
];

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

function countPattern(content: string, pattern: RegExp) {
  return (content.match(pattern) || []).length;
}

function riskFromScore(score: number) {
  return score >= 55 ? "high" as const : score >= 28 ? "medium" as const : "low" as const;
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
      didacticToneRisk: "low" as const,
      distantToneRisk: "low" as const,
      didacticToneScore: 0,
      didacticCueCount: 0,
      distantToneScore: 0,
      distantExpressionCount: 0,
      readerClosenessCueCount: 0,
      findings: [] as string[],
      reasonDetails: [] as Array<{ label: string; reason: string; count: number; suggestion?: string }>,
      suggestions: ["先粘贴一段草稿，再开始扫描。"],
      matchedDistantExpressionPhrases: [] as string[],
    };
  }

  const bannedHits = countHits(text, BANNED_PHRASES);
  const emptyHits = countHits(text, EMPTY_PHRASES);
  const transitionHits = countHits(text, TRANSITION_PHRASES);
  const preannounceHits = countHits(text, PREANNOUNCE_PHRASES);
  const summaryEndingHits = countHits(text, SUMMARY_ENDING_PHRASES);
  const distantExpressionHits = countHits(text, DISTANT_EXPRESSION_PHRASES);
  const didacticHits = countHits(text, DIDACTIC_PHRASES);
  const sentences = splitSentences(text);
  const paragraphs = splitParagraphs(text);
  const longSentences = sentences.filter((sentence) => sentence.length >= 38);
  const repeatedConnectorCount = (text.match(/我们需要|在这个|通过|进行/g) || []).length;
  const imperativeSentenceCount = sentences.filter((sentence) =>
    /(应该|需要|必须|不要|要先|先.*再|建议|可以把|可以先|不该|该问|该做|更该|评估方式|页面也要|流程也要)/.test(sentence),
  ).length;
  const frameworkNounCount = countPattern(text, /方法论|框架|流程|步骤|动作|清单|矩阵|路径|评估方式|执行|排产|重构/g);
  const readerLossCueCount = countPattern(text, /代价|亏|错|疼|刺眼|难受|焦虑|失望|冲突|误判|复盘|看完就走|没有下一步|消耗|不出结果/g);
  const readerClosenessCueCount = countPattern(text, /你|你的|账户|钱|预算|单|出单|客户|老板|同事|复盘会|广告后台|词表|出价|文案|落地页|点进来/g);
  const abstractNounCount = countPattern(text, /解释|变量|价值|阶段|边界|体系|机制|结构|判断|分化|变化|现象|层面|本质|逻辑/g);
  const distantExpressionCount = distantExpressionHits.reduce((total, item) => total + item.count, 0);
  const distantToneScore = Math.min(
    100,
    distantExpressionCount * 13
      + Math.max(0, abstractNounCount - Math.max(10, Math.ceil(sentences.length * 0.35))) * 3
      + (readerClosenessCueCount < Math.max(4, Math.ceil(paragraphs.length * 0.22)) ? 14 : 0)
      + (readerLossCueCount <= 2 && distantExpressionCount >= 2 ? 12 : 0),
  );
  const distantToneRisk = riskFromScore(distantToneScore);
  const didacticCueCount =
    didacticHits.reduce((total, item) => total + item.count, 0)
    + imperativeSentenceCount
    + Math.max(0, frameworkNounCount - 5);
  const didacticToneScore = Math.min(
    100,
    didacticCueCount * 8
      + Math.max(0, imperativeSentenceCount - Math.max(3, Math.ceil(sentences.length * 0.12))) * 7
      + (readerLossCueCount <= 2 && didacticCueCount >= 5 ? 16 : 0),
  );
  const didacticToneRisk = riskFromScore(didacticToneScore);
  const paragraphLengthBuckets = paragraphs.map((paragraph) => Math.min(6, Math.floor(paragraph.length / 40)));
  const repeatedParagraphBuckets = paragraphLengthBuckets.filter((bucket, index) => index > 0 && bucket === paragraphLengthBuckets[index - 1]).length;
  const transitionCount = transitionHits.reduce((total, item) => total + item.count, 0);
  const transitionOveruseCount = Math.max(0, transitionCount - 2);
  const longSentenceLimit = Math.max(4, Math.ceil(sentences.length * 0.24));
  const longSentenceOveruseCount = Math.max(0, longSentences.length - longSentenceLimit);
  const repeatedParagraphLimit = Math.max(3, Math.ceil(paragraphs.length * 0.28));
  const repeatedParagraphOveruseCount = Math.max(0, repeatedParagraphBuckets - repeatedParagraphLimit);
  const outlineRigidityRaw =
    transitionOveruseCount
    + repeatedParagraphOveruseCount
    + preannounceHits.reduce((total, item) => total + item.count, 0);

  const rawScore =
    bannedHits.reduce((total, item) => total + item.count * 14, 0) +
    emptyHits.reduce((total, item) => total + item.count * 9, 0) +
    transitionOveruseCount * 5 +
    preannounceHits.reduce((total, item) => total + item.count * 8, 0) +
    summaryEndingHits.reduce((total, item) => total + item.count * 10, 0) +
    longSentenceOveruseCount * 6 +
    Math.max(0, repeatedConnectorCount - 2) * 4 +
    (didacticToneRisk === "high" ? 18 : didacticToneRisk === "medium" ? 8 : 0) +
    (distantToneRisk === "high" ? 16 : distantToneRisk === "medium" ? 7 : 0) +
    Math.min(12, repeatedParagraphOveruseCount * 2);

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
    transitionOveruseCount > 0
      ? {
          label: "过度转折",
          reason: "连接词太密时，文章会更像播音稿或汇报稿，而不是自然推进的论证。",
          count: transitionCount,
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
    longSentenceOveruseCount > 0
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
    didacticToneRisk !== "low"
      ? {
          label: "说教姿态",
          reason: "命令句、步骤词和框架名词过密时，文章会像作者在培训读者，而不是带读者识别一场真实误判。",
          count: didacticCueCount,
          suggestion: "把建议改成读者正在付出的代价、复盘现场和可转发判断句，再少量保留方法。",
        }
      : null,
    distantToneRisk !== "low"
      ? {
          label: "读者距离感",
          reason: "抽象判断词过密、现场锚点不足时，句子会像评论稿或研究摘要，读者很难把它和自己的账户、预算、复盘会联系起来。",
          count: distantExpressionCount + Math.max(0, abstractNounCount - 10),
          suggestion: "把“损失感/旧解释松动/解释权/价值分化”这类说法，改成读者熟悉的动作、钱、后台指标、复盘会对话或具体反差。",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; reason: string; count: number; suggestion?: string }>;
  const findings = [
    bannedHits.length ? `命中禁用表达：${bannedHits.map((item) => item.phrase).join(" / ")}` : null,
    emptyHits.length ? `命中空话短语：${emptyHits.map((item) => item.phrase).join(" / ")}` : null,
    transitionOveruseCount > 0 ? `命中过度转折：${transitionHits.map((item) => item.phrase).join(" / ")}` : null,
    preannounceHits.length ? `命中预告式句子：${preannounceHits.map((item) => item.phrase).join(" / ")}` : null,
    summaryEndingHits.length ? `命中总结式收尾：${summaryEndingHits.map((item) => item.phrase).join(" / ")}` : null,
    longSentenceOveruseCount > 0 ? `检测到 ${longSentences.length} 句长句，超过当前篇幅建议上限 ${longSentenceLimit} 句。` : null,
    repeatedConnectorCount > 2 ? `连接词重复偏多，像“我们需要 / 通过 / 在这个”这类起手式过密。` : null,
    outlineRigidityRisk !== "low" ? "段落和转场过于整齐，像按施工图展开。" : null,
    didacticToneRisk !== "low" ? `说教姿态偏重：检测到 ${didacticCueCount} 个命令、步骤或框架化提示。` : null,
    distantToneRisk !== "low" ? `读者距离感偏重：抽象表达 ${distantExpressionCount} 处，读者现场锚点 ${readerClosenessCueCount} 处。` : null,
  ].filter(Boolean) as string[];

  const suggestions = [
    bannedHits.length ? "先删掉命中的禁用表达，把判断换成具体动作、数据或角色关系。" : null,
    emptyHits.length ? "空话短语后面补事实锚点，否则整句直接删除。" : null,
    longSentenceOveruseCount > 0 ? "优先拆掉最影响换气的长句，每句只保留一个动作或判断。" : null,
    preannounceHits.length ? "删掉“接下来我们来看”这类预告，直接说事。" : null,
    summaryEndingHits.length ? "把结尾改成动作、判断或画面，不要重写一遍摘要。" : null,
    outlineRigidityRisk !== "low" ? "打破段落对称感，允许一句话成段或忽长忽短的呼吸变化。" : null,
    didacticToneRisk !== "low" ? "减少“应该/必须/先/再/步骤/框架”主节奏，把段落入口改成损失、冲突、复盘或误判现场。" : null,
    distantToneRisk !== "low" ? "把抽象词翻译成读者听得懂的现场话：钱花出去了、词表改过了、后台有点击但没有单、复盘会上解释不动。" : null,
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
    matchedDistantExpressionPhrases: distantExpressionHits.map((item) => item.phrase),
    longSentenceCount: longSentences.length,
    repeatedConnectorCount,
    outlineRigidityRisk,
    summaryEndingRisk,
    preannounceRisk,
    didacticToneRisk,
    distantToneRisk,
    didacticToneScore,
    didacticCueCount,
    distantToneScore,
    distantExpressionCount,
    readerClosenessCueCount,
    findings,
    reasonDetails,
    suggestions,
  };
}
