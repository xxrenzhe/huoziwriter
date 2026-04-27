export const OPENING_OPTION_LIMIT = 3;
const HOOK_SCORE_MAX = 100;
const RECOMMENDED_MIN_HOOK_SCORE = 65;
const RECOMMENDED_MIN_QUALITY_CEILING: OpeningQualityCeiling = "B";

const QUALITY_CEILING_RANKS = {
  C: 0,
  "B-": 1,
  B: 2,
  "B+": 3,
  A: 4,
} as const;

const OPENING_PATTERN_LABELS = {
  scene_entry: "场景切入",
  conflict_entry: "冲突反差",
  judgement_first: "判断前置",
  question_hook: "问句钩子",
  phenomenon_signal: "现象信号",
  direct_entry: "直接入题",
} as const;

const OPENING_PATTERN_QUALITY_CEILINGS = {
  scene_entry: "A",
  conflict_entry: "A",
  judgement_first: "B+",
  question_hook: "B",
  phenomenon_signal: "B-",
  direct_entry: "C",
} as const;

const ABSTRACT_PATTERNS = [
  /时代/,
  /趋势/,
  /赛道/,
  /本质/,
  /价值/,
  /意义/,
  /认知/,
  /逻辑/,
  /方法论/,
  /叙事/,
  /生态/,
  /红利/,
  /内容创作/,
  /某种程度/,
  /不可否认/,
  /值得思考/,
  /深刻变化/,
] as const;

const CONCRETE_PATTERNS = [
  /\d/,
  /AI/i,
  /ChatGPT/i,
  /OpenAI/i,
  /微信/,
  /公众号/,
  /小红书/,
  /抖音/,
  /知乎/,
  /苹果/,
  /腾讯/,
  /字节/,
  /阿里/,
  /拼多多/,
  /特斯拉/,
  /英伟达/,
  /产品/,
  /用户/,
  /营收/,
  /利润/,
  /订单/,
  /成本/,
  /转化/,
  /团队/,
  /会议室/,
  /工位/,
  /评论区/,
  /后台/,
  /老板/,
  /客户/,
  /这周/,
  /上周/,
  /凌晨/,
  /晚上/,
  /截图/,
  /数据/,
] as const;

const HOOK_PATTERNS = [
  /为什么/,
  /怎么/,
  /问题是/,
  /真正/,
  /不是.+而是/,
  /别急着/,
  /先别急/,
  /关键是/,
  /结果是/,
  /麻烦在于/,
  /反而/,
  /却/,
  /如果你/,
  /你以为/,
  /先说结论/,
  /一句话说/,
  /[？?]/,
] as const;

const FRONTLOAD_PATTERNS = [
  /^(?:别急着|先别急|问题是|真正|先说结论|一句话说|如果你|你以为|很多人以为|看起来|不是)/,
  /^(?:这件事|这个变化|这波).{0,12}(?:真正|问题|麻烦)/,
] as const;

const PADDING_PATTERNS = [
  /^(?:最近|这几年|这些年|在.+时代|随着.+发展|众所周知|大家都知道|一直以来|不得不说|今天(?:想)?聊|先来聊聊|说到)/,
] as const;

const GRAND_BACKGROUND_PATTERNS = [
  /^(?:在当今|在这个|当下|新时代).{0,12}时代/,
  /^(?:随着|伴随).{0,12}(?:飞速)?发展/,
  /^(?:面临|迎来).{0,12}(?:前所未有|空前)/,
  /^(?:众所周知|不可否认|值得思考)/,
] as const;

const SELF_INTRO_PATTERNS = [
  /^(?:大家好|各位好|hi\s*大家|嗨(?:，|,)?大家|老规矩|继续上次).{0,30}(?:我是|这里是|今天聊聊|今天想聊|分享)/i,
  /^(?:大家好|各位好).{0,20}(?:今天聊聊|今天想聊|这一篇聊)/,
  /^(?:我是[^，。,：:\n]{1,12}[，,。 ]).{0,24}(?:今天聊聊|今天想聊|继续聊|先聊聊)/,
] as const;

const STRONG_SCENE_PATTERNS = [
  /^(?:上周|昨晚|前几天|那天|这次|刚开始|刚上手|第一次)/,
  /^(?:我帮|我试了|我后来|我当时|我把|我在)/,
] as const;

const READER_PATTERNS = [
  /你/,
  /如果你/,
  /你会/,
  /你该/,
  /你真正/,
] as const;

export type OpeningDiagnoseLevel = "pass" | "warn" | "danger";

export type OpeningDiagnose = {
  abstractLevel: OpeningDiagnoseLevel;
  paddingLevel: OpeningDiagnoseLevel;
  hookDensity: OpeningDiagnoseLevel;
  informationFrontLoading: OpeningDiagnoseLevel;
};

export type OpeningPatternCode = keyof typeof OPENING_PATTERN_LABELS;
export type OpeningQualityCeiling = keyof typeof QUALITY_CEILING_RANKS;

export type OpeningOption = {
  opening: string;
  text?: string;
  value?: string;
  patternCode: OpeningPatternCode;
  patternLabel: string;
  qualityCeiling: OpeningQualityCeiling;
  hookScore: number;
  recommendReason: string;
  diagnose: OpeningDiagnose;
  forbiddenHits: string[];
  isRecommended: boolean;
};

export type OpeningGuardCheck = {
  key: "opening_confirmation" | "opening_forbidden" | "opening_strength" | "opening_audit";
  label: string;
  status: "passed" | "warning" | "blocked";
  severity: "blocking" | "warning" | "suggestion";
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

export type OpeningGuardEvaluation = {
  openingConfirmed: boolean;
  openingForbiddenHits: string[];
  openingQualityCeiling: string;
  openingHookScore: number;
  openingDiagnose: OpeningDiagnose;
  openingAuditOutdated: boolean;
  checks: OpeningGuardCheck[];
  blockers: string[];
  warnings: string[];
  suggestions: string[];
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function uniqueStrings(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function clampHookScore(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : fallback;
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(HOOK_SCORE_MAX, fallback));
  }
  return Math.max(0, Math.min(HOOK_SCORE_MAX, Math.round(parsed)));
}

function truncateText(text: string, limit = 72) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function parseIsoTimestamp(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeDiagnoseLevel(value: unknown, fallback: OpeningDiagnoseLevel): OpeningDiagnoseLevel {
  return value === "pass" || value === "warn" || value === "danger" ? value : fallback;
}

function normalizeQualityCeiling(value: unknown, fallback: OpeningQualityCeiling): OpeningQualityCeiling {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "A" || normalized === "A档") return "A";
  if (normalized === "B+" || normalized === "B＋") return "B+";
  if (normalized === "B" || normalized === "B档") return "B";
  if (normalized === "B-" || normalized === "B－") return "B-";
  if (normalized === "C" || normalized === "C档") return "C";
  return fallback;
}

function getOpeningText(value: Record<string, unknown> | null | undefined) {
  return String(value?.opening || value?.text || value?.content || value?.value || "").trim();
}

function inferOpeningPatternCode(opening: string): OpeningPatternCode {
  const normalized = String(opening || "").replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/[。！？!?]/)[0]?.trim() || normalized;
  if (countPatternHits(firstSentence, [/[？?]/, /为什么|怎么|是不是|到底|凭什么|要不要|该不该/]) > 0) return "question_hook";
  if (countPatternHits(firstSentence, [/那天|有次|这次|刚开始|刚上手|上周|昨晚|第一次|前几天|我试了|我后来/]) > 0) return "scene_entry";
  if (countPatternHits(firstSentence, [/先说结论|一句话说|我的判断|我先下个判断|直接说结论/]) > 0) return "judgement_first";
  if (countPatternHits(firstSentence, [/问题是|真正|不是.+而是|反而|却|但/]) > 0) return "conflict_entry";
  if (countPatternHits(firstSentence, [
    /最近|很多人|这几年|这两年|这波|刷屏|趋势|现象|信号/,
    /在这个.+时代|随着.+变化|正在发生|内容创作|行业里|平台上/,
    /深刻变化|结构性变化|集体焦虑|普遍困境|普遍误区/,
  ]) > 0) return "phenomenon_signal";
  return "direct_entry";
}

function shortenOpeningSeed(text: string, fallback = "这件事") {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^[#>\-*0-9.\s]+/, "")
    .replace(/[。！？!?].*$/, "")
    .replace(/[：:]/g, " ")
    .trim();
  const seed = normalized || fallback;
  return seed.length > 18 ? seed.slice(0, 18).trim() : seed;
}

function countPatternHits(text: string, patterns: readonly RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function includesPattern(text: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function getFirstPatternIndex(text: string, patterns: readonly RegExp[]) {
  let minIndex = Number.POSITIVE_INFINITY;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || typeof match.index !== "number") continue;
    minIndex = Math.min(minIndex, match.index);
  }
  return Number.isFinite(minIndex) ? minIndex : null;
}

function countDiagnoseLevel(diagnose: OpeningDiagnose, level: OpeningDiagnoseLevel) {
  return Object.values(diagnose).filter((item) => item === level).length;
}

function buildOpeningDiagnose(opening: string): OpeningDiagnose {
  const normalized = String(opening || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      abstractLevel: "danger",
      paddingLevel: "danger",
      hookDensity: "danger",
      informationFrontLoading: "danger",
    };
  }

  const firstSentence = normalized.split(/[。！？!?]/)[0]?.trim() || normalized;
  const concreteHits = countPatternHits(normalized, CONCRETE_PATTERNS);
  const abstractHits = countPatternHits(normalized, ABSTRACT_PATTERNS);
  const hookHits = countPatternHits(normalized, HOOK_PATTERNS);
  const firstSentenceHookHits = countPatternHits(firstSentence, HOOK_PATTERNS);
  const firstHookIndex = getFirstPatternIndex(normalized, HOOK_PATTERNS);
  const startsWithPadding = includesPattern(firstSentence, PADDING_PATTERNS);
  const isGrandBackground = includesPattern(firstSentence, GRAND_BACKGROUND_PATTERNS);
  const isStrongScene = includesPattern(firstSentence, STRONG_SCENE_PATTERNS) && concreteHits >= 1;
  const frontLoaded = includesPattern(firstSentence, FRONTLOAD_PATTERNS) || firstSentenceHookHits > 0;

  const abstractLevel: OpeningDiagnoseLevel =
    isGrandBackground || ((abstractHits >= 2 && concreteHits === 0) || (/^(?:在|随着).+时代/.test(firstSentence) && concreteHits === 0))
      ? "danger"
      : abstractHits >= 1 && concreteHits <= 1
        ? "warn"
        : "pass";

  const paddingLevel: OpeningDiagnoseLevel =
    isStrongScene
      ? "pass"
      : startsWithPadding || (normalized.length >= 48 && (firstHookIndex === null || firstHookIndex > 28))
      ? "danger"
      : normalized.length >= 36 && (firstHookIndex === null || firstHookIndex > 18)
        ? "warn"
        : "pass";

  const hookDensity: OpeningDiagnoseLevel =
    isStrongScene
      ? "pass"
      : (isGrandBackground && hookHits === 0)
      ? "danger"
      : hookHits >= 2 || (hookHits >= 1 && concreteHits >= 1)
      ? "pass"
      : hookHits >= 1 || concreteHits >= 1
        ? "warn"
        : "danger";

  const informationFrontLoading: OpeningDiagnoseLevel =
    isStrongScene
      ? "pass"
      : frontLoaded || (firstHookIndex !== null && firstHookIndex <= 12)
      ? "pass"
      : (isGrandBackground ? false : (firstHookIndex !== null && firstHookIndex <= 24) || concreteHits >= 1)
        ? "warn"
        : "danger";

  return {
    abstractLevel,
    paddingLevel,
    hookDensity,
    informationFrontLoading,
  };
}

export function inferOpeningDiagnose(opening: string) {
  return buildOpeningDiagnose(opening);
}

function detectOpeningForbiddenHitsByDiagnose(diagnose: OpeningDiagnose) {
  const hits: string[] = [];
  if (diagnose.abstractLevel === "danger") {
    hits.push("D1 抽象空转");
  }
  if (diagnose.paddingLevel === "danger") {
    hits.push("D2 铺垫过长");
  }
  if (diagnose.hookDensity === "danger" || diagnose.informationFrontLoading === "danger") {
    hits.push("D3 钩子后置");
  }
  return hits;
}

export function detectOpeningForbiddenHits(opening: string, diagnoseInput?: OpeningDiagnose) {
  const normalized = String(opening || "").replace(/\s+/g, " ").trim();
  const hits = detectOpeningForbiddenHitsByDiagnose(diagnoseInput ?? inferOpeningDiagnose(normalized));
  if (normalized && includesPattern(normalized, SELF_INTRO_PATTERNS)) {
    hits.push("D2 自我介绍开场");
  }
  return Array.from(new Set(hits));
}

function estimateOpeningHookScore(
  opening: string,
  diagnoseInput?: OpeningDiagnose,
  forbiddenHitsInput?: string[],
) {
  const normalized = String(opening || "").replace(/\s+/g, " ").trim();
  if (!normalized) return 0;

  const diagnose = diagnoseInput ?? inferOpeningDiagnose(normalized);
  const forbiddenHits = forbiddenHitsInput ?? detectOpeningForbiddenHits(normalized, diagnose);
  const concreteHits = countPatternHits(normalized, CONCRETE_PATTERNS);
  const hookHits = countPatternHits(normalized, HOOK_PATTERNS);
  const readerHits = countPatternHits(normalized, READER_PATTERNS);
  const firstSentence = normalized.split(/[。！？!?]/)[0]?.trim() || normalized;
  const frontLoaded = includesPattern(firstSentence, FRONTLOAD_PATTERNS) || countPatternHits(firstSentence, HOOK_PATTERNS) > 0;

  let score = 50;
  score += Math.min(16, concreteHits * 8);
  score += Math.min(16, hookHits * 8);
  score += Math.min(8, readerHits * 6);
  score += frontLoaded ? 8 : 0;
  score += normalized.length >= 28 && normalized.length <= 90 ? 4 : normalized.length < 18 || normalized.length > 120 ? -6 : 0;

  score -= diagnose.abstractLevel === "danger" ? 20 : diagnose.abstractLevel === "warn" ? 8 : 0;
  score -= diagnose.paddingLevel === "danger" ? 20 : diagnose.paddingLevel === "warn" ? 8 : 0;
  score -= diagnose.hookDensity === "danger" ? 18 : diagnose.hookDensity === "warn" ? 8 : 0;
  score -= diagnose.informationFrontLoading === "danger" ? 18 : diagnose.informationFrontLoading === "warn" ? 8 : 0;
  score -= forbiddenHits.length * 6;

  return clampHookScore(score, 0);
}

function inferQualityCeiling(patternCode: OpeningPatternCode) {
  return OPENING_PATTERN_QUALITY_CEILINGS[patternCode];
}

function getDefaultOpeningRecommendReason(input: {
  qualityCeiling: OpeningQualityCeiling;
  hookScore: number;
  forbiddenHits: string[];
  diagnose: OpeningDiagnose;
}) {
  if (input.forbiddenHits.length > 0) {
    return "命中开头禁区，不能作为默认推荐。";
  }
  if (input.qualityCeiling === "A") {
    return "判断和冲突前置较稳，适合作为默认起手。";
  }
  if (input.qualityCeiling === "B+") {
    return "判断已经顶到前面，强度接近一线开头，关键是正文尽快兑现。";
  }
  if (input.qualityCeiling === "B") {
    return input.hookScore >= 68
      ? "信息已经前置，属于稳妥可用的开头。"
      : "结构可用，但还可以继续压缩铺垫。";
  }
  if (input.qualityCeiling === "B-") {
    return "模式上限偏保守，最好补一个更具体的人、事件或冲突。";
  }
  if (input.diagnose.paddingLevel !== "pass") {
    return "铺垫偏长，建议把判断再往前提。";
  }
  return "开头可用性一般，建议补具体信息并加重冲突句。";
}

function normalizeOpeningOptionRecord(
  value: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
  index: number,
): OpeningOption {
  const valueOpening = getOpeningText(value);
  const fallbackOpening = getOpeningText(fallback);
  const opening = valueOpening || fallbackOpening;
  const shouldUseFallbackMetrics = !valueOpening && Boolean(fallbackOpening);
  const inferredDiagnose = inferOpeningDiagnose(opening);
  const valueDiagnose = getRecord(value?.diagnose);
  const fallbackDiagnose = shouldUseFallbackMetrics ? getRecord(fallback?.diagnose) : null;
  const diagnose = {
    abstractLevel: normalizeDiagnoseLevel(
      valueDiagnose?.abstractLevel,
      normalizeDiagnoseLevel(fallbackDiagnose?.abstractLevel, inferredDiagnose.abstractLevel),
    ),
    paddingLevel: normalizeDiagnoseLevel(
      valueDiagnose?.paddingLevel,
      normalizeDiagnoseLevel(fallbackDiagnose?.paddingLevel, inferredDiagnose.paddingLevel),
    ),
    hookDensity: normalizeDiagnoseLevel(
      valueDiagnose?.hookDensity,
      normalizeDiagnoseLevel(fallbackDiagnose?.hookDensity, inferredDiagnose.hookDensity),
    ),
    informationFrontLoading: normalizeDiagnoseLevel(
      valueDiagnose?.informationFrontLoading,
      normalizeDiagnoseLevel(fallbackDiagnose?.informationFrontLoading, inferredDiagnose.informationFrontLoading),
    ),
  } satisfies OpeningDiagnose;
  const forbiddenHits = uniqueStrings(
    [
      ...getStringArray(value?.forbiddenHits, 6),
      ...getStringArray(shouldUseFallbackMetrics ? fallback?.forbiddenHits : [], 6),
      ...detectOpeningForbiddenHits(opening, diagnose),
    ],
    6,
  );
  const hookScore = clampHookScore(
    value?.hookScore,
    clampHookScore(
      shouldUseFallbackMetrics ? fallback?.hookScore : undefined,
      estimateOpeningHookScore(opening, diagnose, forbiddenHits),
    ),
  );
  const patternCode = (() => {
    const raw = String(value?.patternCode || (shouldUseFallbackMetrics ? fallback?.patternCode : "") || "").trim();
    if (raw in OPENING_PATTERN_LABELS) {
      return raw as OpeningPatternCode;
    }
    return inferOpeningPatternCode(opening);
  })();
  const qualityCeiling = normalizeQualityCeiling(
    value?.qualityCeiling || (shouldUseFallbackMetrics ? fallback?.qualityCeiling : undefined),
    inferQualityCeiling(patternCode),
  );
  const recommendReason = String(value?.recommendReason || "").trim();

  return {
    opening,
    text: opening,
    value: opening,
    patternCode,
    patternLabel: String(
      value?.patternLabel
      || (shouldUseFallbackMetrics ? fallback?.patternLabel : "")
      || OPENING_PATTERN_LABELS[patternCode]
      || value?.label
      || (shouldUseFallbackMetrics ? fallback?.label : "")
      || "",
    ).trim(),
    qualityCeiling,
    hookScore,
    recommendReason: recommendReason || getDefaultOpeningRecommendReason({ qualityCeiling, hookScore, forbiddenHits, diagnose }),
    diagnose,
    forbiddenHits,
    isRecommended: normalizeBoolean(value?.isRecommended, normalizeBoolean(fallback?.isRecommended, index === 0)),
  };
}

function getQualityCeilingRank(value: string) {
  return QUALITY_CEILING_RANKS[normalizeQualityCeiling(value, "C") as keyof typeof QUALITY_CEILING_RANKS] ?? 0;
}

function isPublishableRecommendedOpening(option: OpeningOption) {
  return (
    option.forbiddenHits.length === 0
    && countDiagnoseLevel(option.diagnose, "danger") === 0
    && option.hookScore >= RECOMMENDED_MIN_HOOK_SCORE
    && getQualityCeilingRank(option.qualityCeiling) >= getQualityCeilingRank(RECOMMENDED_MIN_QUALITY_CEILING)
  );
}

export function ensureSingleRecommendedOpeningOption(options: OpeningOption[]) {
  if (options.length === 0) {
    return options;
  }

  const explicitRecommendedIndex = options.findIndex((item) => item.isRecommended && isPublishableRecommendedOpening(item));
  const recommendedIndex = explicitRecommendedIndex >= 0
    ? explicitRecommendedIndex
    : options.reduce((bestIndex, item, index, list) => {
        const best = list[bestIndex];
        const itemDangerCount = countDiagnoseLevel(item.diagnose, "danger");
        const bestDangerCount = countDiagnoseLevel(best.diagnose, "danger");
        const itemPublishable = isPublishableRecommendedOpening(item);
        const bestPublishable = isPublishableRecommendedOpening(best);
        if (itemPublishable && !bestPublishable) return index;
        if (!itemPublishable && bestPublishable) return bestIndex;
        if (item.forbiddenHits.length === 0 && best.forbiddenHits.length > 0) return index;
        if (item.forbiddenHits.length > 0 && best.forbiddenHits.length === 0) return bestIndex;
        if (getQualityCeilingRank(item.qualityCeiling) > getQualityCeilingRank(best.qualityCeiling)) return index;
        if (getQualityCeilingRank(item.qualityCeiling) < getQualityCeilingRank(best.qualityCeiling)) return bestIndex;
        if (item.hookScore > best.hookScore) return index;
        if (item.hookScore < best.hookScore) return bestIndex;
        if (itemDangerCount < bestDangerCount) return index;
        return bestIndex;
      }, 0);

  return options.map((item, index) => ({
    ...item,
    isRecommended: index === recommendedIndex,
    recommendReason:
      item.recommendReason
      || (index === recommendedIndex ? getDefaultOpeningRecommendReason(item) : item.recommendReason),
  }));
}

export function normalizeOpeningOptions(
  value: unknown,
  fallback: Array<Record<string, unknown>>,
  limit = OPENING_OPTION_LIMIT,
) {
  const rawOptions = getRecordArray(value);
  const normalized = rawOptions
    .map((item, index) => normalizeOpeningOptionRecord(item, fallback[index] ?? fallback[0] ?? null, index))
    .filter((item) => item.opening);
  const fallbackNormalized = fallback
    .map((item, index) => normalizeOpeningOptionRecord(item, null, index))
    .filter((item) => item.opening);
  const merged = [...normalized];
  for (const fallbackItem of fallbackNormalized) {
    if (merged.length >= limit) break;
    if (merged.some((item) => item.opening === fallbackItem.opening)) continue;
    merged.push(fallbackItem);
  }
  return ensureSingleRecommendedOpeningOption((merged.length > 0 ? merged : fallbackNormalized).slice(0, limit));
}

export function buildFallbackOpeningOptions(baseTitle: string) {
  const seed = shortenOpeningSeed(baseTitle);
  return normalizeOpeningOptions(
    [
      {
        opening: `${seed}看起来只是表面变化，真正卡住的是执行顺序、成本账本和判断口径。问题不是要不要跟上，而是谁先发现自己已经被旧流程拖住。`,
        patternCode: "judgement_first",
        patternLabel: OPENING_PATTERN_LABELS.judgement_first,
      },
      {
        opening: `问题是，${seed}最先改变的往往不是机会，而是执行层的压力。你以为大家在争一个新入口，实际先暴露出来的是成本、节奏和谁能持续交付。`,
        patternCode: "conflict_entry",
        patternLabel: OPENING_PATTERN_LABELS.conflict_entry,
      },
      {
        opening: `如果你也在盯着${seed}，先别急着站队。最值得拆开的不是立场，而是那个被忽略的关键细节。`,
        patternCode: "question_hook",
        patternLabel: OPENING_PATTERN_LABELS.question_hook,
      },
    ],
    [],
  );
}

function formatDiagnoseIssues(diagnose: OpeningDiagnose) {
  return [
    diagnose.abstractLevel === "danger"
      ? "抽象度过高"
      : diagnose.abstractLevel === "warn"
        ? "抽象度偏高"
        : null,
    diagnose.paddingLevel === "danger"
      ? "铺垫过长"
      : diagnose.paddingLevel === "warn"
        ? "铺垫偏长"
        : null,
    diagnose.hookDensity === "danger"
      ? "钩子浓度不足"
      : diagnose.hookDensity === "warn"
        ? "钩子浓度一般"
        : null,
    diagnose.informationFrontLoading === "danger"
      ? "信息前置不足"
      : diagnose.informationFrontLoading === "warn"
        ? "信息前置偏弱"
        : null,
  ].filter(Boolean) as string[];
}

export function evaluateOpeningGuardChecks(input: {
  selectedOpening?: string | null;
  selectedOpeningHook?: string | null;
  selectedOpeningOption?: Record<string, unknown> | null;
  openingAuditedAt?: unknown;
  outlineUpdatedAt?: unknown;
}): OpeningGuardEvaluation {
  const selectedOpeningOption = getRecord(input.selectedOpeningOption);
  const selectedOpening = String(
    input.selectedOpening
    || input.selectedOpeningHook
    || getOpeningText(selectedOpeningOption),
  ).trim();
  const openingConfirmed = selectedOpening.length > 0;
  const normalizedSelectedOption = openingConfirmed
    ? normalizeOpeningOptionRecord(selectedOpeningOption, { opening: selectedOpening }, 0)
    : null;
  const openingForbiddenHits = normalizedSelectedOption?.forbiddenHits ?? [];
  const openingQualityCeiling = normalizedSelectedOption?.qualityCeiling ?? "";
  const openingHookScore = normalizedSelectedOption?.hookScore ?? 0;
  const openingDiagnose = normalizedSelectedOption?.diagnose ?? inferOpeningDiagnose("");
  const openingAuditedAt = parseIsoTimestamp(input.openingAuditedAt);
  const outlineUpdatedAt = parseIsoTimestamp(input.outlineUpdatedAt);
  const openingAuditOutdated = Boolean(outlineUpdatedAt && (!openingAuditedAt || openingAuditedAt < outlineUpdatedAt));
  const diagnoseIssues = formatDiagnoseIssues(openingDiagnose);
  const openingQualityRank = getQualityCeilingRank(openingQualityCeiling);
  const strengthNeedsAttention =
    openingConfirmed
    && (openingQualityRank <= QUALITY_CEILING_RANKS["B-"] || openingHookScore < 60 || diagnoseIssues.length > 0);

  const checks: OpeningGuardCheck[] = [
    {
      key: "opening_confirmation",
      label: "开头确认",
      status: openingConfirmed ? "passed" : "blocked",
      severity: openingConfirmed ? "suggestion" : "blocking",
      detail: openingConfirmed ? `已确认发布开头：${truncateText(selectedOpening)}` : "发布前需要先确认一个可落地开头。",
      targetStageCode: "outlinePlanning",
      actionLabel: openingConfirmed ? undefined : "去确认开头",
    },
    {
      key: "opening_forbidden",
      label: "开头禁区",
      status: !openingConfirmed ? "warning" : openingForbiddenHits.length > 0 ? "blocked" : "passed",
      severity: !openingConfirmed ? "warning" : openingForbiddenHits.length > 0 ? "blocking" : "suggestion",
      detail:
        !openingConfirmed
          ? "开头还没确认，暂时无法做禁区体检。"
          : openingForbiddenHits.length > 0
            ? `开头命中禁止清单：${openingForbiddenHits.join("、")}，请重新选择或重生成。`
            : "开头未命中 D1/D2/D3 禁区。",
      targetStageCode: "outlinePlanning",
      actionLabel: !openingConfirmed || openingForbiddenHits.length === 0 ? undefined : "去重生成开头",
    },
    {
      key: "opening_strength",
      label: "开头强度",
      status: !openingConfirmed ? "warning" : strengthNeedsAttention ? "warning" : "passed",
      severity: !openingConfirmed || strengthNeedsAttention ? "warning" : "suggestion",
      detail:
        !openingConfirmed
          ? "开头还没确认，暂时无法评估钩子强度。"
          : strengthNeedsAttention
            ? `开头钩子分 ${openingHookScore}，${diagnoseIssues.join("；")}。建议把判断或冲突放进前两句。`
            : `开头钩子分 ${openingHookScore}，信息前置和钩子浓度处于可用区间。`,
      targetStageCode: "outlinePlanning",
      actionLabel: !openingConfirmed || !strengthNeedsAttention ? undefined : "去优化开头",
    },
  ];

  if (outlineUpdatedAt) {
    checks.push({
      key: "opening_audit",
      label: "开头体检",
      status: openingAuditOutdated ? "warning" : "passed",
      severity: openingAuditOutdated ? "warning" : "suggestion",
      detail:
        openingAuditOutdated
          ? "开头还没有按最新大纲做体检，建议重新生成 3 个开头候选后再发布。"
          : "开头体检时间与当前大纲一致。",
      targetStageCode: "outlinePlanning",
      actionLabel: openingAuditOutdated ? "去重生成开头" : undefined,
    });
  }

  const blockers = checks.filter((item) => item.severity === "blocking" || item.status === "blocked").map((item) => item.detail);
  const warnings = checks.filter((item) => item.severity === "warning" || item.status === "warning").map((item) => item.detail);
  const suggestions = checks.filter((item) => item.severity === "suggestion" && item.status === "passed").map((item) => item.detail);

  return {
    openingConfirmed,
    openingForbiddenHits,
    openingQualityCeiling,
    openingHookScore,
    openingDiagnose,
    openingAuditOutdated,
    checks,
    blockers,
    warnings,
    suggestions,
  };
}
