type WritingDiversityArticleLike = {
  id: number;
  title: string;
  markdownContent: string;
};

type WritingPatternCode =
  | "question_hook"
  | "scene_entry"
  | "judgement_first"
  | "phenomenon_signal"
  | "conflict_entry"
  | "direct_entry"
  | "action_stop"
  | "judgement_stop"
  | "observation_stop"
  | "scene_stop"
  | "caution_stop"
  | "summary_stop"
  | "open_end";

type WritingSyntaxPatternCode =
  | "punchy_fragments"
  | "scene_narration"
  | "judgement_push"
  | "question_drive"
  | "contrast_turn"
  | "explanation_unfold"
  | "list_enumeration"
  | "mixed_balance";

export type WritingDiversityReport = {
  status: "balanced" | "needs_attention";
  summary: string;
  currentOpeningPatternCode: WritingPatternCode;
  currentOpeningPatternLabel: string;
  currentEndingPatternCode: WritingPatternCode;
  currentEndingPatternLabel: string;
  currentSyntaxPatternCode: WritingSyntaxPatternCode;
  currentSyntaxPatternLabel: string;
  currentPrototypeCode: string | null;
  currentPrototypeLabel: string | null;
  currentStateVariantCode: string | null;
  currentStateVariantLabel: string | null;
  openingRepeatCount: number;
  endingRepeatCount: number;
  syntaxRepeatCount: number;
  prototypeRepeatCount: number;
  stateVariantRepeatCount: number;
  openingMatches: string[];
  endingMatches: string[];
  syntaxMatches: string[];
  prototypeMatches: string[];
  stateVariantMatches: string[];
  issues: string[];
  suggestions: string[];
};

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getPatternLabel(code: WritingPatternCode) {
  const map: Record<WritingPatternCode, string> = {
    question_hook: "问题切口",
    scene_entry: "场景切入",
    judgement_first: "结论先放",
    phenomenon_signal: "现象起手",
    conflict_entry: "冲突开场",
    direct_entry: "直接入题",
    action_stop: "动作收束",
    judgement_stop: "判断收束",
    observation_stop: "观察留口",
    scene_stop: "画面收尾",
    caution_stop: "提醒式收尾",
    summary_stop: "总结式收尾",
    open_end: "开放式收尾",
  };
  return map[code];
}

function getSyntaxPatternLabel(code: WritingSyntaxPatternCode) {
  const map: Record<WritingSyntaxPatternCode, string> = {
    punchy_fragments: "短句碎击",
    scene_narration: "场景讲述",
    judgement_push: "判断推进",
    question_drive: "追问推进",
    contrast_turn: "转折对撞",
    explanation_unfold: "解释铺陈",
    list_enumeration: "列举推进",
    mixed_balance: "混合推进",
  };
  return map[code];
}

function splitSentences(text: string) {
  return text
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function inferOpeningPattern(input: {
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const lead = stripMarkdown(getString(input.markdownContent)).slice(0, 140);
  const openingHint = `${getString(input.deepWritingPayload?.openingStrategy)} ${getString(input.deepWritingPayload?.openingMove)} ${lead}`;
  if (/(为什么|怎么|是不是|到底|凭什么|要不要|该不该|\?|\？)/.test(openingHint)) return "question_hook" as const;
  if (/(那天|有次|这次|刚开始|刚上手|打开|上手|我试了|我后来|前几天|上周|昨晚|第一次)/.test(openingHint)) return "scene_entry" as const;
  if (/(先说结论|直接说结论|结论先放|我的判断|我先下个判断|一句话说|核心判断)/.test(openingHint)) return "judgement_first" as const;
  if (/(最近|这两年|这一波|刷屏|很多人|大家都|行业里|平台上|现象|信号)/.test(openingHint)) return "phenomenon_signal" as const;
  if (/(但问题是|真正的问题|反常识|误读|吊诡|奇怪的是|但|却|反而)/.test(openingHint)) return "conflict_entry" as const;
  return "direct_entry" as const;
}

function inferEndingPattern(input: {
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const plain = stripMarkdown(getString(input.markdownContent));
  const tail = plain.slice(Math.max(0, plain.length - 180));
  const endingHint = `${getString(input.deepWritingPayload?.endingStrategy)} ${tail}`;
  if (/(综上|总之|所以你看|所以说|最后总结|一句话总结)/.test(endingHint)) return "summary_stop" as const;
  if (/(别|不要|先别|小心|代价|风险|别急着)/.test(endingHint)) return "caution_stop" as const;
  if (/(去试|去做|先做|继续做|记住|把.*做完|下一步|现在就)/.test(endingHint)) return "action_stop" as const;
  if (/(我判断|我的判断|本质是|问题不在|真正重要的是|结论是|说到底)/.test(endingHint)) return "judgement_stop" as const;
  if (/(接下来|继续看|值得观察|还会|后面会|往后看|后续再看)/.test(endingHint)) return "observation_stop" as const;
  if (/(停在|画面|场景|那一刻|那个动作|那句话|看着)/.test(endingHint)) return "scene_stop" as const;
  return "open_end" as const;
}

function inferSyntaxPattern(input: {
  markdownContent?: string | null;
  deepWritingPayload?: Record<string, unknown> | null;
}) {
  const plain = stripMarkdown(getString(input.markdownContent));
  const lead = plain.slice(0, 260);
  const hint = `${getString(input.deepWritingPayload?.sectionRhythm)} ${getString(input.deepWritingPayload?.openingMove)} ${lead}`.trim();
  const sentences = splitSentences(hint);
  const averageLength = sentences.length > 0 ? sentences.reduce((sum, item) => sum + item.length, 0) / sentences.length : hint.length;
  const shortSentenceCount = sentences.filter((item) => item.length > 0 && item.length <= 16).length;
  const questionCount = (hint.match(/[？?]/g) ?? []).length;
  const contrastCount = (hint.match(/但|可是|不过|反而|却|问题是|真正的问题|奇怪的是/g) ?? []).length;
  const judgementCount = (hint.match(/先说结论|直接说结论|我的判断|我判断|本质是|说白了|说到底|结论是|一句话说/g) ?? []).length;
  const sceneCount = (hint.match(/那天|有次|后来|当时|刚开始|上手|我试了|我后来|前几天|昨晚|第一次|我记得/g) ?? []).length;
  const enumerationCount = (hint.match(/首先|其次|最后|第一|第二|第三|一是|二是|三是/g) ?? []).length;
  const explanationCount = (hint.match(/因为|所以|不是.*而是|意味着|本质上|背后是|换句话说/g) ?? []).length;

  if (enumerationCount >= 2) return "list_enumeration" as const;
  if (questionCount >= 2 || /为什么|怎么|凭什么|到底|该不该|是不是/.test(hint)) return "question_drive" as const;
  if (contrastCount >= 2) return "contrast_turn" as const;
  if (judgementCount >= 2) return "judgement_push" as const;
  if (sceneCount >= 2) return "scene_narration" as const;
  if (shortSentenceCount >= 3 || (sentences.length >= 3 && averageLength <= 16)) return "punchy_fragments" as const;
  if (averageLength >= 28 || explanationCount >= 2) return "explanation_unfold" as const;
  return "mixed_balance" as const;
}

function getAlternativePatternLabels(code: WritingPatternCode) {
  const map: Partial<Record<WritingPatternCode, string[]>> = {
    question_hook: ["场景切入", "结论先放"],
    scene_entry: ["结论先放", "现象起手"],
    judgement_first: ["场景切入", "冲突开场"],
    phenomenon_signal: ["场景切入", "问题切口"],
    conflict_entry: ["结论先放", "现象起手"],
    direct_entry: ["场景切入", "问题切口"],
    action_stop: ["判断收束", "观察留口"],
    judgement_stop: ["动作收束", "观察留口"],
    observation_stop: ["判断收束", "动作收束"],
    scene_stop: ["判断收束", "动作收束"],
    caution_stop: ["动作收束", "判断收束"],
    summary_stop: ["动作收束", "画面收尾"],
    open_end: ["判断收束", "动作收束"],
  };
  return map[code] ?? ["场景切入", "判断收束"];
}

function getAlternativeSyntaxLabels(code: WritingSyntaxPatternCode) {
  const map: Partial<Record<WritingSyntaxPatternCode, string[]>> = {
    punchy_fragments: ["场景讲述", "解释铺陈"],
    scene_narration: ["判断推进", "转折对撞"],
    judgement_push: ["场景讲述", "追问推进"],
    question_drive: ["判断推进", "场景讲述"],
    contrast_turn: ["解释铺陈", "场景讲述"],
    explanation_unfold: ["短句碎击", "转折对撞"],
    list_enumeration: ["场景讲述", "判断推进"],
    mixed_balance: ["场景讲述", "判断推进"],
  };
  return map[code] ?? ["场景讲述", "判断推进"];
}

function getAlternativeStateVariantLabels(input: {
  deepWritingPayload?: Record<string, unknown> | null;
  currentStateVariantCode: string | null;
}) {
  const currentStateVariantCode = getString(input.currentStateVariantCode);
  const stateOptions = Array.isArray(input.deepWritingPayload?.stateOptions)
    ? input.deepWritingPayload?.stateOptions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          code: getString(item.code),
          label: getString(item.label),
        }))
        .filter((item) => item.label)
    : [];
  return stateOptions
    .filter((item) => item.code !== currentStateVariantCode)
    .map((item) => item.label)
    .slice(0, 2);
}

function getAlternativePrototypeLabels(input: {
  deepWritingPayload?: Record<string, unknown> | null;
  currentPrototypeCode: string | null;
}) {
  const currentPrototypeCode = getString(input.currentPrototypeCode);
  const prototypeOptions = Array.isArray(input.deepWritingPayload?.prototypeOptions)
    ? input.deepWritingPayload?.prototypeOptions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          code: getString(item.code),
          label: getString(item.label),
        }))
        .filter((item) => item.label)
    : [];
  return prototypeOptions
    .filter((item) => item.code !== currentPrototypeCode)
    .map((item) => item.label)
    .slice(0, 2);
}

export function buildWritingDiversityReport(input: {
  currentArticle: {
    id?: number | null;
    title?: string | null;
    markdownContent?: string | null;
  };
  deepWritingPayload?: Record<string, unknown> | null;
  recentArticles?: WritingDiversityArticleLike[] | null;
  recentDeepWritingStates?: Array<{
    id: number;
    title: string;
    payload?: Record<string, unknown> | null;
  }> | null;
}): WritingDiversityReport {
  const currentArticleId = Number(input.currentArticle.id || 0);
  const recentArticles = (input.recentArticles ?? [])
    .filter((item) => item.id !== currentArticleId)
    .slice(0, 5);
  const recentDeepWritingStates = (input.recentDeepWritingStates ?? [])
    .filter((item) => item.id !== currentArticleId)
    .slice(0, 5);
  const currentOpeningPatternCode = inferOpeningPattern({
    markdownContent: input.currentArticle.markdownContent,
    deepWritingPayload: input.deepWritingPayload,
  });
  const currentEndingPatternCode = inferEndingPattern({
    markdownContent: input.currentArticle.markdownContent,
    deepWritingPayload: input.deepWritingPayload,
  });
  const currentSyntaxPatternCode = inferSyntaxPattern({
    markdownContent: input.currentArticle.markdownContent,
    deepWritingPayload: input.deepWritingPayload,
  });
  const currentPrototypeCode = getString(input.deepWritingPayload?.articlePrototype) || null;
  const currentPrototypeLabel = getString(input.deepWritingPayload?.articlePrototypeLabel) || currentPrototypeCode;
  const currentStateVariantCode = getString(input.deepWritingPayload?.stateVariantCode) || null;
  const currentStateVariantLabel = getString(input.deepWritingPayload?.stateVariantLabel) || currentStateVariantCode;
  const openingMatches = recentArticles
    .filter((item) => inferOpeningPattern({ markdownContent: item.markdownContent }) === currentOpeningPatternCode)
    .map((item) => item.title)
    .slice(0, 3);
  const endingMatches = recentArticles
    .filter((item) => inferEndingPattern({ markdownContent: item.markdownContent }) === currentEndingPatternCode)
    .map((item) => item.title)
    .slice(0, 3);
  const syntaxMatches = recentArticles
    .filter((item) => inferSyntaxPattern({ markdownContent: item.markdownContent }) === currentSyntaxPatternCode)
    .map((item) => item.title)
    .slice(0, 3);
  const stateVariantMatches =
    currentStateVariantCode
      ? recentDeepWritingStates
          .filter((item) => getString(item.payload?.stateVariantCode) === currentStateVariantCode)
          .map((item) => item.title)
          .slice(0, 3)
      : [];
  const prototypeMatches =
    currentPrototypeCode
      ? recentDeepWritingStates
          .filter((item) => getString(item.payload?.articlePrototype) === currentPrototypeCode)
          .map((item) => item.title)
          .slice(0, 3)
      : [];
  const openingRepeatCount = openingMatches.length;
  const endingRepeatCount = endingMatches.length;
  const syntaxRepeatCount = syntaxMatches.length;
  const prototypeRepeatCount = prototypeMatches.length;
  const stateVariantRepeatCount = stateVariantMatches.length;
  const needsOpeningAttention = openingRepeatCount >= 3;
  const needsEndingAttention = endingRepeatCount >= 3;
  const needsSyntaxAttention = syntaxRepeatCount >= 3;
  const needsPrototypeAttention = prototypeRepeatCount >= 3;
  const needsStateVariantAttention = stateVariantRepeatCount >= 3;
  const alternativePrototypeLabels = getAlternativePrototypeLabels({
    deepWritingPayload: input.deepWritingPayload,
    currentPrototypeCode,
  });
  const alternativeStateVariantLabels = getAlternativeStateVariantLabels({
    deepWritingPayload: input.deepWritingPayload,
    currentStateVariantCode,
  });
  const issues = [
    needsOpeningAttention
      ? `最近 ${openingRepeatCount} 篇都沿用了「${getPatternLabel(currentOpeningPatternCode)}」开头：${openingMatches.join("、")}。`
      : null,
    needsEndingAttention
      ? `最近 ${endingRepeatCount} 篇都停在「${getPatternLabel(currentEndingPatternCode)}」收尾：${endingMatches.join("、")}。`
      : null,
    needsSyntaxAttention
      ? `最近 ${syntaxRepeatCount} 篇都沿用了「${getSyntaxPatternLabel(currentSyntaxPatternCode)}」句法推进：${syntaxMatches.join("、")}。`
      : null,
    needsPrototypeAttention && currentPrototypeLabel
      ? `最近 ${prototypeRepeatCount} 篇都写成了「${currentPrototypeLabel}」原型：${prototypeMatches.join("、")}。`
      : null,
    needsStateVariantAttention && currentStateVariantLabel
      ? `最近 ${stateVariantRepeatCount} 篇都沿用了「${currentStateVariantLabel}」状态：${stateVariantMatches.join("、")}。`
      : null,
  ].filter(Boolean) as string[];
  const suggestions = [
    needsOpeningAttention
      ? `这次开头别再走「${getPatternLabel(currentOpeningPatternCode)}」，优先试「${getAlternativePatternLabels(currentOpeningPatternCode).slice(0, 2).join("」或「")}」。`
      : null,
    needsEndingAttention
      ? `这次结尾别再停在「${getPatternLabel(currentEndingPatternCode)}」，优先试「${getAlternativePatternLabels(currentEndingPatternCode).slice(0, 2).join("」或「")}」。`
      : null,
    needsSyntaxAttention
      ? `这次句法别再连续写成「${getSyntaxPatternLabel(currentSyntaxPatternCode)}」，优先改成「${getAlternativeSyntaxLabels(currentSyntaxPatternCode).slice(0, 2).join("」或「")}」。`
      : null,
    needsPrototypeAttention && currentPrototypeLabel
      ? `这次别再连续写成「${currentPrototypeLabel}」，优先切到「${(alternativePrototypeLabels.length ? alternativePrototypeLabels : ["另一种文章原型", "另一种推进方式"]).join("」或「")}」。`
      : null,
    needsStateVariantAttention && currentStateVariantLabel
      ? `这次别再连续沿用「${currentStateVariantLabel}」，优先切到「${(alternativeStateVariantLabels.length ? alternativeStateVariantLabels : ["另一种叙事姿态", "另一种判断强度"]).join("」或「")}」。`
      : null,
  ].filter(Boolean) as string[];

  return {
    status: issues.length > 0 ? "needs_attention" : "balanced",
    summary:
      issues.length > 0
        ? "最近几篇稿件的开头、句法、收尾、文章原型或写作状态正在收敛成固定套路，这篇建议主动错开。"
        : recentArticles.length >= 3
          ? "最近几篇稿件的开头、句法、收尾、文章原型和写作状态没有明显撞车，当前写法多样性还算健康。"
          : "当前可用近作样本不多，暂未发现明显的写法撞车。",
    currentOpeningPatternCode,
    currentOpeningPatternLabel: getPatternLabel(currentOpeningPatternCode),
    currentEndingPatternCode,
    currentEndingPatternLabel: getPatternLabel(currentEndingPatternCode),
    currentSyntaxPatternCode,
    currentSyntaxPatternLabel: getSyntaxPatternLabel(currentSyntaxPatternCode),
    currentPrototypeCode,
    currentPrototypeLabel,
    currentStateVariantCode,
    currentStateVariantLabel,
    openingRepeatCount,
    endingRepeatCount,
    syntaxRepeatCount,
    prototypeRepeatCount,
    stateVariantRepeatCount,
    openingMatches: openingMatches.map((item) => truncate(item, 20)),
    endingMatches: endingMatches.map((item) => truncate(item, 20)),
    syntaxMatches: syntaxMatches.map((item) => truncate(item, 20)),
    prototypeMatches: prototypeMatches.map((item) => truncate(item, 20)),
    stateVariantMatches: stateVariantMatches.map((item) => truncate(item, 20)),
    issues,
    suggestions,
  };
}
