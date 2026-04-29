export const TITLE_OPTION_LIMIT = 6;
const TITLE_SCORE_MAX = 50;
const RECOMMENDED_MIN_OPEN_RATE_SCORE = 35;
const RECOMMENDED_MIN_ELEMENTS_HIT_COUNT = 2;

export type TitleElementsHit = {
  specific: boolean;
  curiosityGap: boolean;
  readerView: boolean;
};

export type TitleOption = {
  title: string;
  styleLabel: string;
  angle: string;
  reason: string;
  riskHint: string;
  openRateScore: number;
  elementsHit: TitleElementsHit;
  forbiddenHits: string[];
  isRecommended: boolean;
  recommendReason: string;
};

export type TitleGuardCheck = {
  key: "title_confirmation" | "title_forbidden" | "title_elements" | "title_audit";
  label: string;
  status: "passed" | "warning" | "blocked";
  severity: "blocking" | "warning" | "suggestion";
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

export type TitleGuardEvaluation = {
  titleConfirmed: boolean;
  titleForbiddenHits: string[];
  titleElementsHit: TitleElementsHit;
  titleElementsHitCount: number;
  titleAuditOutdated: boolean;
  checks: TitleGuardCheck[];
  blockers: string[];
  warnings: string[];
  suggestions: string[];
};

const TITLE_FORBIDDEN_RULES = [
  { label: "震惊", pattern: /震惊/i },
  { label: "不看后悔", pattern: /不看后悔/i },
  { label: "99% 的人都", pattern: /99%\s*的?\s*人都/i },
  { label: "太可怕了", pattern: /太可怕了/i },
  { label: "抽象概念堆砌", pattern: /关于.+的思考|.+的一些感悟|.+时代的内容创作|关于.+的复盘/ },
  { label: "结论提前剧透", pattern: /(?:\d+\s*(?:个|条|种|步)|[一二三四五六七八九十]+\s*(?:个|条|种|步)).{0,8}(?:方法|要点|建议|步骤|技巧|原则|结论)/ },
  { label: "自我视角倾诉", pattern: /^(?:我|我的).*(?:复盘|总结|回顾|感悟)/ },
] as const;

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

function clampTitleScore(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : fallback;
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(TITLE_SCORE_MAX, fallback));
  }
  return Math.max(0, Math.min(TITLE_SCORE_MAX, Math.round(parsed)));
}

function normalizeBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function truncateText(text: string, limit = 160) {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function getTitleSeparatorCount(title: string) {
  return (title.match(/[：:]/g) ?? []).length;
}

function getTitleStructuralForbiddenHits(title: string) {
  const normalized = String(title || "").trim();
  const hits: string[] = [];
  const separatorCount = getTitleSeparatorCount(normalized);
  if (separatorCount >= 2) {
    hits.push("机械拼接");
  }
  if (/…\s*[：:,，]/.test(normalized)) {
    hits.push("截断标题拼接");
  }
  if (/[，,、；;]\s*[：:]/.test(normalized) || /[：:]\s*[，,、；;]/.test(normalized)) {
    hits.push("异常标点拼接");
  }
  if (/[^\s：:]{4,}[的地得]\s*[：:]/.test(normalized)) {
    hits.push("断裂助词拼接");
  }
  if (normalized.length > 38 && separatorCount >= 1) {
    hits.push("标题过长拼接");
  }
  return hits;
}

export function normalizeTitleSeed(baseTitle: string) {
  const normalized = String(baseTitle || "")
    .replace(/^#+\s*/, "")
    .replace(/[《》]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const firstPart = normalized
    .split(/[：:；;，,、。！？!?…\n]/)
    .map((item) => item.trim())
    .find((item) => item.length >= 4);
  const seed = truncateText(firstPart || normalized, 18).replace(/[：:；;，,、。！？!?…]+$/g, "").trim();
  return seed.length >= 8 ? seed.replace(/[的地得]$/g, "").trim() : seed;
}

export function buildTitleGenerationBrief(input: {
  articleTitle?: string | null;
  workingTitle?: string | null;
  centralThesis?: string | null;
  titleStrategyNotes?: string[] | null;
}) {
  const rawTitles = [input.workingTitle, input.articleTitle]
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const titleAxis = normalizeTitleSeed(input.centralThesis || input.workingTitle || input.articleTitle || "");
  const forbiddenPrefixes = Array.from(new Set([
    ...rawTitles,
    ...rawTitles.map((item) => normalizeTitleSeed(item)).filter(Boolean),
  ]))
    .map((item) => item.replace(/[：:；;，,、。！？!?…]+$/g, "").replace(/[的地得]$/g, "").trim())
    .filter((item) => item.length >= 6)
    .slice(0, 4);
  const strategyNotes = Array.isArray(input.titleStrategyNotes)
    ? input.titleStrategyNotes.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  return {
    titleAxis: titleAxis || normalizeTitleSeed(rawTitles[0] || "") || "这件事",
    forbiddenPrefixes,
    strategyNotes,
    rewriteRule: "标题必须围绕主轴重新成句，不得复制工作标题后再接冒号、后半句或万能模板。",
  };
}

function parseIsoTimestamp(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function detectTitleForbiddenHits(title: string) {
  return Array.from(new Set([
    ...TITLE_FORBIDDEN_RULES
    .filter((rule) => rule.pattern.test(title))
      .map((rule) => rule.label),
    ...getTitleStructuralForbiddenHits(title),
  ]));
}

export function inferTitleElementsHit(title: string): TitleElementsHit {
  const normalized = String(title || "").trim();
  const selfView = /^(?:我|我的|我们|咱们).*(?:复盘|总结|回顾|感悟)/.test(normalized);
  return {
    specific:
      /\d|%|19\d{2}|20\d{2}|AI|ChatGPT|OpenAI|微信|公众号|小红书|抖音|知乎|苹果|腾讯|字节|阿里|拼多多|特斯拉|英伟达|产品|用户|营收|利润|融资|草稿箱|封面|编辑|团队|会议室|地铁|凌晨|晚上/i.test(normalized),
    curiosityGap:
      /[？?]|为什么|怎么|到底|真正|误读|背后|却|反而|不是|而是|先受益|先承压|别只|别急|结果|之后/.test(normalized),
    readerView:
      !selfView
      && /(你|你的|你能|你会|如何|怎么做|该不该|要不要|值得|别|先别|需要|能不能|会不会)/.test(normalized),
  };
}

export function getTitleElementHitCount(elementsHit: TitleElementsHit) {
  return ["specific", "curiosityGap", "readerView"].filter((key) => elementsHit[key as keyof TitleElementsHit]).length;
}

function getDefaultTitleRecommendReason(input: {
  openRateScore: number;
  elementsHit: TitleElementsHit;
  forbiddenHits: string[];
}) {
  const hitCount = getTitleElementHitCount(input.elementsHit);
  if (input.forbiddenHits.length > 0) {
    return "命中禁止清单，不能作为推荐标题。";
  }
  if (hitCount >= 3) {
    return "三要素命中完整，打开率潜力更高。";
  }
  if (hitCount >= 2) {
    return input.openRateScore >= 40 ? "三要素命中稳定，且打开率分更高。" : "至少满足两项关键要素，适合作为保守推荐。";
  }
  return "当前标题信息差或读者视角还不够，建议继续优化。";
}

function isPublishableTitleOption(item: TitleOption) {
  return (
    item.forbiddenHits.length === 0
    && item.openRateScore >= RECOMMENDED_MIN_OPEN_RATE_SCORE
    && getTitleElementHitCount(item.elementsHit) >= RECOMMENDED_MIN_ELEMENTS_HIT_COUNT
  );
}

function normalizeTitleOptionRecord(
  value: Record<string, unknown> | null | undefined,
  fallback: Record<string, unknown> | null | undefined,
  index: number,
): TitleOption {
  const title = String(value?.title || fallback?.title || "").trim();
  const inferredElements = inferTitleElementsHit(title);
  const valueElements = getRecord(value?.elementsHit);
  const fallbackElements = getRecord(fallback?.elementsHit);
  const forbiddenHits = uniqueStrings(
    [
      ...getStringArray(value?.forbiddenHits, 6),
      ...getStringArray(fallback?.forbiddenHits, 6),
      ...detectTitleForbiddenHits(title),
    ],
    6,
  );
  const elementsHit = {
    specific: normalizeBoolean(valueElements?.specific, normalizeBoolean(fallbackElements?.specific, inferredElements.specific)),
    curiosityGap: normalizeBoolean(valueElements?.curiosityGap, normalizeBoolean(fallbackElements?.curiosityGap, inferredElements.curiosityGap)),
    readerView: normalizeBoolean(valueElements?.readerView, normalizeBoolean(fallbackElements?.readerView, inferredElements.readerView)),
  };
  const openRateScore = clampTitleScore(
    value?.openRateScore,
    clampTitleScore(fallback?.openRateScore, 34 - Math.min(index, 4) * 3),
  );
  const recommendReason = String(value?.recommendReason || "").trim();

  return {
    title,
    styleLabel: String(value?.styleLabel || fallback?.styleLabel || "").trim(),
    angle: String(value?.angle || fallback?.angle || "").trim(),
    reason: String(value?.reason || fallback?.reason || "").trim(),
    riskHint: String(value?.riskHint || fallback?.riskHint || "").trim(),
    openRateScore,
    elementsHit,
    forbiddenHits,
    isRecommended: normalizeBoolean(value?.isRecommended, normalizeBoolean(fallback?.isRecommended, index === 0)),
    recommendReason: recommendReason || getDefaultTitleRecommendReason({ openRateScore, elementsHit, forbiddenHits }),
  };
}

export function ensureSingleRecommendedTitleOption(options: TitleOption[]) {
  if (options.length === 0) {
    return options;
  }
  const explicitRecommendedIndex = options.findIndex((item) => item.isRecommended && isPublishableTitleOption(item));
  const recommendedIndex = explicitRecommendedIndex >= 0
    ? explicitRecommendedIndex
    : options.reduce((bestIndex, item, index, list) => {
        const best = list[bestIndex];
        const itemPublishable = isPublishableTitleOption(item);
        const bestPublishable = isPublishableTitleOption(best);
        const itemHitCount = getTitleElementHitCount(item.elementsHit);
        const bestHitCount = getTitleElementHitCount(best.elementsHit);
        if (itemPublishable && !bestPublishable) return index;
        if (!itemPublishable && bestPublishable) return bestIndex;
        if (item.forbiddenHits.length === 0 && best.forbiddenHits.length > 0) return index;
        if (item.forbiddenHits.length > 0 && best.forbiddenHits.length === 0) return bestIndex;
        if (item.openRateScore > best.openRateScore) return index;
        if (item.openRateScore === best.openRateScore && itemHitCount > bestHitCount) return index;
        return bestIndex;
      }, 0);

  return options.map((item, index) => ({
    ...item,
    isRecommended: index === recommendedIndex,
    recommendReason:
      item.recommendReason
      || (index === recommendedIndex ? getDefaultTitleRecommendReason(item) : item.recommendReason),
  }));
}

export function normalizeTitleOptions(
  value: unknown,
  fallback: Array<Record<string, unknown>>,
  limit = TITLE_OPTION_LIMIT,
) {
  const rawOptions = getRecordArray(value);
  const normalized = rawOptions
    .map((item, index) => normalizeTitleOptionRecord(item, fallback[index] ?? fallback[0] ?? null, index))
    .filter((item) => item.title);
  const fallbackNormalized = fallback
    .map((item, index) => normalizeTitleOptionRecord(item, null, index))
    .filter((item) => item.title);
  const merged = normalized.filter(isPublishableTitleOption);
  const appendUnique = (item: TitleOption) => {
    if (merged.length >= limit) return;
    if (merged.some((existing) => existing.title === item.title)) return;
    merged.push(item);
  };
  for (const fallbackItem of fallbackNormalized.filter(isPublishableTitleOption)) {
    appendUnique(fallbackItem);
  }
  for (const item of normalized.filter((option) => !isPublishableTitleOption(option))) {
    appendUnique(item);
  }
  for (const fallbackItem of fallbackNormalized.filter((option) => !isPublishableTitleOption(option))) {
    appendUnique(fallbackItem);
  }
  return ensureSingleRecommendedTitleOption((merged.length > 0 ? merged : fallbackNormalized).slice(0, limit));
}

export function buildFallbackTitleOptions(baseTitle: string) {
  const seed = normalizeTitleSeed(baseTitle) || "这件事";
  return normalizeTitleOptions(
    [
      {
        title: `${seed}：真正拖住结果的，不是表面这一步`,
        styleLabel: "观点判断型",
        angle: "先亮判断，再逼正文补证据",
        reason: "开头直接立判断，适合把读者拉进“原来问题不在表面”的信息差。",
        riskHint: "正文首段必须快速补上事实锚点，否则容易显得判断先行。",
        openRateScore: 46,
        elementsHit: { specific: true, curiosityGap: true, readerView: false },
      },
      {
        title: `为什么说${seed}，最容易被误读的不是结果`,
        styleLabel: "误读切口型",
        angle: "先抛误读，再拆真正矛盾",
        reason: "误读切口更容易制造信息差，适合承接“大家都看错了哪一层”。",
        riskHint: "后文必须明确指出误读点，否则疑问感会大于兑现感。",
        openRateScore: 44,
      },
      {
        title: `${seed}之后，谁会先受益，谁会先承压`,
        styleLabel: "结果反差型",
        angle: "把结果分化直接摆出来",
        reason: "结果分化天然有对比感，读者更容易带着立场继续往下读。",
        riskHint: "正文要真的展开受益与承压两端，不然会显得标题先行。",
        openRateScore: 42,
      },
      {
        title: `一个细节看懂${seed}：问题不在表面变化`,
        styleLabel: "细节切口型",
        angle: "用具体细节带出结构判断",
        reason: "细节切口有落点，适合把抽象议题压成一个更可点击的入口。",
        riskHint: "正文必须尽快给出那个细节，不能只写成概念判断。",
        openRateScore: 39,
      },
      {
        title: `${seed}这件事，读者真正该警惕的是什么`,
        styleLabel: "读者判断型",
        angle: "把问题翻译成读者该带走的判断",
        reason: "更强调读者收益，适合正文结尾会落到判断或动作建议的稿子。",
        riskHint: "如果正文没有明确的判断收束，标题会显得偏空。",
        openRateScore: 37,
      },
      {
        title: `如果你也在关注${seed}，先别急着只看表面结果`,
        styleLabel: "读者提醒型",
        angle: "先拦住惯性判断，再给新视角",
        reason: "更有对话感，适合把读者从已有成见里拉出来。",
        riskHint: "要在前两段给出“为什么别只看表面”的事实依据，否则会显得虚。",
        openRateScore: 35,
      },
    ],
    [],
  );
}

export function evaluateTitleGuardChecks(input: {
  selectedTitle?: string | null;
  selectedTitleOption?: Record<string, unknown> | null;
  titleAuditedAt?: unknown;
  outlineUpdatedAt?: unknown;
}): TitleGuardEvaluation {
  const selectedTitle = String(input.selectedTitle || "").trim();
  const titleConfirmed = selectedTitle.length > 0;
  const selectedTitleOption = getRecord(input.selectedTitleOption);
  const selectedTitleElements = getRecord(selectedTitleOption?.elementsHit);
  const inferredTitleElements = inferTitleElementsHit(selectedTitle);
  const titleElementsHit = {
    specific: typeof selectedTitleElements?.specific === "boolean" ? Boolean(selectedTitleElements.specific) : inferredTitleElements.specific,
    curiosityGap: typeof selectedTitleElements?.curiosityGap === "boolean" ? Boolean(selectedTitleElements.curiosityGap) : inferredTitleElements.curiosityGap,
    readerView: typeof selectedTitleElements?.readerView === "boolean" ? Boolean(selectedTitleElements.readerView) : inferredTitleElements.readerView,
  };
  const titleElementsHitCount = getTitleElementHitCount(titleElementsHit);
  const titleForbiddenHits = uniqueStrings(
    [
      ...getStringArray(selectedTitleOption?.forbiddenHits, 6),
      ...detectTitleForbiddenHits(selectedTitle),
    ],
    6,
  );
  const titleAuditedAt = parseIsoTimestamp(input.titleAuditedAt);
  const outlineUpdatedAt = parseIsoTimestamp(input.outlineUpdatedAt);
  const titleAuditOutdated = Boolean(outlineUpdatedAt && (!titleAuditedAt || titleAuditedAt < outlineUpdatedAt));

  const checks: TitleGuardCheck[] = [
    {
      key: "title_confirmation",
      label: "标题确认",
      status: titleConfirmed ? "passed" : "blocked",
      severity: titleConfirmed ? "suggestion" : "blocking",
      detail: titleConfirmed ? `已确认发布标题：${selectedTitle}` : "发布前需要先确认一个可落地标题。",
      targetStageCode: "outlinePlanning",
      actionLabel: titleConfirmed ? undefined : "去确认标题",
    },
    {
      key: "title_forbidden",
      label: "标题禁区",
      status: !titleConfirmed ? "warning" : titleForbiddenHits.length > 0 ? "blocked" : "passed",
      severity: !titleConfirmed ? "warning" : titleForbiddenHits.length > 0 ? "blocking" : "suggestion",
      detail:
        !titleConfirmed
          ? "标题还没确认，暂时无法做禁词体检。"
          : titleForbiddenHits.length > 0
            ? `标题命中禁止清单：${titleForbiddenHits.join("、")}，请重新选择或重生成。`
            : "标题未命中禁止清单。",
      targetStageCode: "outlinePlanning",
      actionLabel: !titleConfirmed || titleForbiddenHits.length === 0 ? undefined : "去重生成标题",
    },
    {
      key: "title_elements",
      label: "标题三要素",
      status: !titleConfirmed ? "warning" : titleElementsHitCount >= 2 ? "passed" : "warning",
      severity: !titleConfirmed || titleElementsHitCount < 2 ? "warning" : "suggestion",
      detail:
        !titleConfirmed
          ? "标题还没确认，暂时无法评估三要素命中。"
          : titleElementsHitCount >= 2
            ? `标题三要素命中 ${titleElementsHitCount}/3：${[
                titleElementsHit.specific ? "具体元素" : null,
                titleElementsHit.curiosityGap ? "好奇缺口" : null,
                titleElementsHit.readerView ? "读者视角" : null,
              ].filter(Boolean).join("、")}。`
            : "标题三要素命中不足 2 项，建议补强具体元素、信息差或读者视角后再发布。",
      targetStageCode: "outlinePlanning",
      actionLabel: !titleConfirmed || titleElementsHitCount >= 2 ? undefined : "去优化标题",
    },
  ];

  if (outlineUpdatedAt) {
    checks.push({
      key: "title_audit",
      label: "标题体检",
      status: titleAuditOutdated ? "warning" : "passed",
      severity: titleAuditOutdated ? "warning" : "suggestion",
      detail:
        titleAuditOutdated
          ? "标题还没有按最新大纲做体检，建议重新优化 6 个标题候选后再发布。"
          : "标题体检时间与当前大纲一致。",
      targetStageCode: "outlinePlanning",
      actionLabel: titleAuditOutdated ? "去重生成标题" : undefined,
    });
  }

  const blockers = checks.filter((item) => item.severity === "blocking" || item.status === "blocked").map((item) => item.detail);
  const warnings = checks.filter((item) => item.severity === "warning" || item.status === "warning").map((item) => item.detail);
  const suggestions = checks.filter((item) => item.severity === "suggestion" && item.status === "passed").map((item) => item.detail);

  return {
    titleConfirmed,
    titleForbiddenHits,
    titleElementsHit,
    titleElementsHitCount,
    titleAuditOutdated,
    checks,
    blockers,
    warnings,
    suggestions,
  };
}
