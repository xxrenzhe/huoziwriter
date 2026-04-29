import { getDatabase } from "./db";
import { getArticleOutcomeBundlesByUser } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type AuthorOutcomeFeedbackSignal = {
  key: string;
  label: string;
  sampleCount: number;
  hitCount: number;
  nearMissCount: number;
  missCount: number;
  positiveSampleCount: number;
  followedRecommendationSampleCount: number;
  followedRecommendationPositiveCount: number;
  performanceScore: number;
  rankingAdjustment: number;
  reason: string;
};

export type AuthorOutcomeFeedbackRecommendation = {
  key: string;
  label: string;
  sampleCount: number;
  positiveSampleCount: number;
  rankingAdjustment: number;
  reason: string;
} | null;

export type PersonalEffectiveWritingFacet = {
  key: string;
  label: string;
  summary: string;
  sampleCount: number;
  positiveSampleCount: number;
  confidence: "early" | "medium" | "high";
  reason: string;
} | null;

export type PersonalEffectiveWritingProfile = {
  summary: string;
  prototype: PersonalEffectiveWritingFacet;
  opening: PersonalEffectiveWritingFacet;
  judgement: PersonalEffectiveWritingFacet;
  rhythm: PersonalEffectiveWritingFacet;
  updatedAt: string;
} | null;

export type AuthorExpressionFeedbackSummary = {
  feedbackSampleCount: number;
  likeMeCount: number;
  unlikeMeCount: number;
  tooHardCount: number;
  tooSoftCount: number;
  tooTutorialCount: number;
  tooCommentaryCount: number;
};

export type AuthorExpressionExemplar = {
  key: string;
  kind: "opening" | "judgement" | "readerBridge" | "scene" | "emotion" | "voice";
  text: string;
  sampleCount: number;
  score: number;
  reason: string;
};

export type AuthorExpressionExemplarProfile = {
  positiveExamples: AuthorExpressionExemplar[];
  negativeExamples: AuthorExpressionExemplar[];
} | null;

export type AuthorOutcomeFeedbackLedger = {
  sampleCount: number;
  positiveSampleCount: number;
  prototypeSignals: AuthorOutcomeFeedbackSignal[];
  stateVariantSignals: AuthorOutcomeFeedbackSignal[];
  openingPatternSignals: AuthorOutcomeFeedbackSignal[];
  sectionRhythmSignals: AuthorOutcomeFeedbackSignal[];
  recommendations: {
    prototype: AuthorOutcomeFeedbackRecommendation;
    stateVariant: AuthorOutcomeFeedbackRecommendation;
    openingPattern: AuthorOutcomeFeedbackRecommendation;
    sectionRhythm: AuthorOutcomeFeedbackRecommendation;
  };
  effectiveWritingProfile: PersonalEffectiveWritingProfile;
  expressionFeedbackSummary?: AuthorExpressionFeedbackSummary | null;
  expressionExemplarProfile?: AuthorExpressionExemplarProfile;
  updatedAt: string;
};

type SignalBucket = Omit<AuthorOutcomeFeedbackSignal, "rankingAdjustment" | "reason">;
type ExpressionExemplarBucket = Omit<AuthorExpressionExemplar, "score" | "reason"> & {
  performanceScore: number;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, limit);
}

function cleanExpressionExemplarText(value: unknown) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 8) {
    return "";
  }
  return text.length > 180 ? text.slice(0, 177).trimEnd() + "..." : text;
}

function parseJsonRecord(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return getRecord(parsed);
    } catch {
      return null;
    }
  }
  return getRecord(value);
}

function getOutcomeWindowRank(windowCode: "24h" | "72h" | "7d") {
  if (windowCode === "7d") return 3;
  if (windowCode === "72h") return 2;
  return 1;
}

function pickOutcomeSnapshot(
  snapshots: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"],
) {
  return snapshots
    .slice()
    .sort((left, right) => {
      const windowDelta = getOutcomeWindowRank(right.windowCode) - getOutcomeWindowRank(left.windowCode);
      if (windowDelta !== 0) {
        return windowDelta;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt.localeCompare(left.updatedAt);
      }
      return right.id - left.id;
    })[0] ?? null;
}

function getOutcomeSampleScore(input: {
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  snapshot: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"][number] | null;
}) {
  let score = 0;
  if (input.hitStatus === "hit") {
    score += 4;
  } else if (input.hitStatus === "near_miss") {
    score += 2;
  } else if (input.hitStatus === "miss") {
    score -= 3;
  }
  if (input.snapshot) {
    if (input.snapshot.readCount >= 500) {
      score += 1;
    }
    if (input.snapshot.shareCount >= 3) {
      score += 1;
    }
    if (input.snapshot.likeCount >= 10) {
      score += 1;
    }
  }
  return score;
}

function getExpressionFeedbackAdjustment(feedback: {
  likeMe: boolean;
  unlikeMe: boolean;
  tooHard: boolean;
  tooSoft: boolean;
  tooTutorial: boolean;
  tooCommentary: boolean;
} | null) {
  if (!feedback) {
    return 0;
  }
  let adjustment = 0;
  if (feedback.likeMe) adjustment += 3;
  if (feedback.unlikeMe) adjustment -= 4;
  if (feedback.tooHard) adjustment -= 2;
  if (feedback.tooSoft) adjustment -= 2;
  if (feedback.tooTutorial) adjustment -= 3;
  if (feedback.tooCommentary) adjustment -= 2;
  return adjustment;
}

function shouldCountOutcomeSample(input: {
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  snapshot: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>[number]["snapshots"][number] | null;
}) {
  if (input.hitStatus && input.hitStatus !== "pending") {
    return true;
  }
  return Boolean(
    input.snapshot
    && (
      input.snapshot.readCount >= 500
      || input.snapshot.shareCount >= 3
      || input.snapshot.likeCount >= 10
    ),
  );
}

function getOutcomeRankingAdjustment(performanceScore: number, sampleCount: number) {
  if (sampleCount <= 0) {
    return 0;
  }
  const averageScore = performanceScore / sampleCount;
  let adjustment = 0;
  if (averageScore >= 4) {
    adjustment = -8;
  } else if (averageScore >= 2.5) {
    adjustment = -5;
  } else if (averageScore >= 1) {
    adjustment = -3;
  } else if (averageScore <= -2) {
    adjustment = 7;
  } else if (averageScore < 0) {
    adjustment = 4;
  }
  if (sampleCount === 1 && adjustment !== 0) {
    adjustment = adjustment > 0
      ? Math.max(1, Math.round(adjustment * 0.6))
      : Math.min(-1, Math.round(adjustment * 0.6));
  } else if (sampleCount >= 3 && adjustment !== 0) {
    adjustment += adjustment > 0 ? 1 : -1;
  }
  return adjustment;
}

function createSignalBucket(key: string, label: string): SignalBucket {
  return {
    key,
    label,
    sampleCount: 0,
    hitCount: 0,
    nearMissCount: 0,
    missCount: 0,
    positiveSampleCount: 0,
    followedRecommendationSampleCount: 0,
    followedRecommendationPositiveCount: 0,
    performanceScore: 0,
  };
}

function registerSignal(input: {
  map: Map<string, SignalBucket>;
  key: string;
  label: string;
  hitStatus: "pending" | "hit" | "near_miss" | "miss" | null;
  performanceScore: number;
  followedRecommendation?: boolean | null;
}) {
  const existing = input.map.get(input.key) ?? createSignalBucket(input.key, input.label);
  existing.label = input.label || existing.label || input.key;
  existing.sampleCount += 1;
  existing.performanceScore += input.performanceScore;
  if (input.performanceScore > 0) {
    existing.positiveSampleCount += 1;
  }
  if (input.hitStatus === "hit") {
    existing.hitCount += 1;
  } else if (input.hitStatus === "near_miss") {
    existing.nearMissCount += 1;
  } else if (input.hitStatus === "miss") {
    existing.missCount += 1;
  }
  if (input.followedRecommendation === true) {
    existing.followedRecommendationSampleCount += 1;
    if (input.performanceScore > 0) {
      existing.followedRecommendationPositiveCount += 1;
    }
  }
  input.map.set(input.key, existing);
}

function finalizeSignal(bucket: SignalBucket, kindLabel: string): AuthorOutcomeFeedbackSignal {
  const rankingAdjustment = getOutcomeRankingAdjustment(bucket.performanceScore, bucket.sampleCount);
  const historySummary =
    bucket.hitCount > 0 || bucket.nearMissCount > 0
      ? `历史 ${bucket.sampleCount} 篇同${kindLabel}里，命中 ${bucket.hitCount} 篇，接近命中 ${bucket.nearMissCount} 篇。`
      : bucket.missCount > 0
        ? `历史 ${bucket.sampleCount} 篇同${kindLabel}里，未达目标 ${bucket.missCount} 篇。`
        : `历史已有 ${bucket.sampleCount} 篇同${kindLabel}结果样本。`;
  const recommendationSummary =
    bucket.followedRecommendationSampleCount > 0
      ? bucket.followedRecommendationPositiveCount > 0
        ? "按系统推荐采用时表现更稳。"
        : "按系统推荐采用暂无明显优势。"
      : "";
  const weightingSummary =
    rankingAdjustment < 0
      ? "这次可优先采用。"
      : rankingAdjustment > 0
        ? "这次先降权观察。"
        : "";

  return {
    ...bucket,
    rankingAdjustment,
    reason: [historySummary, recommendationSummary, weightingSummary].filter(Boolean).join(" "),
  };
}

function compareSignals(left: AuthorOutcomeFeedbackSignal, right: AuthorOutcomeFeedbackSignal) {
  if (left.rankingAdjustment !== right.rankingAdjustment) {
    return left.rankingAdjustment - right.rankingAdjustment;
  }
  if (right.positiveSampleCount !== left.positiveSampleCount) {
    return right.positiveSampleCount - left.positiveSampleCount;
  }
  if (right.hitCount !== left.hitCount) {
    return right.hitCount - left.hitCount;
  }
  if (right.nearMissCount !== left.nearMissCount) {
    return right.nearMissCount - left.nearMissCount;
  }
  if (right.sampleCount !== left.sampleCount) {
    return right.sampleCount - left.sampleCount;
  }
  return left.label.localeCompare(right.label, "zh-CN");
}

function selectRecommendation(signals: AuthorOutcomeFeedbackSignal[]): AuthorOutcomeFeedbackRecommendation {
  const candidate = signals
    .slice()
    .sort(compareSignals)
    .find((item) =>
      item.positiveSampleCount > 0
      || item.hitCount > 0
      || item.nearMissCount > 0
      || item.rankingAdjustment < 0,
    ) ?? null;
  if (!candidate) {
    return null;
  }
  return {
    key: candidate.key,
    label: candidate.label,
    sampleCount: candidate.sampleCount,
    positiveSampleCount: candidate.positiveSampleCount,
    rankingAdjustment: candidate.rankingAdjustment,
    reason: candidate.reason,
  };
}

async function getDeepWritingPayloadsByArticleIds(input: {
  userId: number;
  articleIds: number[];
}) {
  await ensureExtendedProductSchema();
  const uniqueArticleIds = Array.from(
    new Set(input.articleIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)),
  );
  if (uniqueArticleIds.length === 0) {
    return new Map<number, Record<string, unknown>>();
  }
  const placeholders = uniqueArticleIds.map(() => "?").join(", ");
  const rows = await getDatabase().query<{
    article_id: number;
    payload_json: string | Record<string, unknown> | null;
  }>(
    "SELECT dsa.article_id AS article_id, dsa.payload_json AS payload_json\n"
      + "FROM article_stage_artifacts dsa\n"
      + "INNER JOIN articles d ON d.id = dsa.article_id\n"
      + "WHERE d.user_id = ? AND dsa.stage_code = 'deepWriting' AND dsa.article_id IN (" + placeholders + ")",
    [input.userId, ...uniqueArticleIds],
  );
  return new Map(
    rows
      .map((row) => [row.article_id, parseJsonRecord(row.payload_json)] as const)
      .filter((entry): entry is readonly [number, Record<string, unknown>] => Boolean(entry[1])),
  );
}

function mapSignal(value: unknown): AuthorOutcomeFeedbackSignal | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  const key = getString(record.key);
  const label = getString(record.label) || key;
  if (!key || !label) {
    return null;
  }
  return {
    key,
    label,
    sampleCount: Math.max(0, Math.round(getNumber(record.sampleCount))),
    hitCount: Math.max(0, Math.round(getNumber(record.hitCount))),
    nearMissCount: Math.max(0, Math.round(getNumber(record.nearMissCount))),
    missCount: Math.max(0, Math.round(getNumber(record.missCount))),
    positiveSampleCount: Math.max(0, Math.round(getNumber(record.positiveSampleCount))),
    followedRecommendationSampleCount: Math.max(0, Math.round(getNumber(record.followedRecommendationSampleCount))),
    followedRecommendationPositiveCount: Math.max(0, Math.round(getNumber(record.followedRecommendationPositiveCount))),
    performanceScore: getNumber(record.performanceScore),
    rankingAdjustment: Math.round(getNumber(record.rankingAdjustment)),
    reason: getString(record.reason),
  };
}

function mapRecommendation(value: unknown): AuthorOutcomeFeedbackRecommendation {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  const safeRecord: Record<string, unknown> = record;
  const key = getString(safeRecord.key);
  const label = getString(safeRecord.label) || key;
  if (!key || !label) {
    return null;
  }
  return {
    key,
    label,
    sampleCount: Math.max(0, Math.round(getNumber(safeRecord.sampleCount))),
    positiveSampleCount: Math.max(0, Math.round(getNumber(safeRecord.positiveSampleCount))),
    rankingAdjustment: Math.round(getNumber(safeRecord.rankingAdjustment)),
    reason: getString(safeRecord.reason),
  };
}

function mapExpressionFeedbackSummary(value: unknown): AuthorExpressionFeedbackSummary | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  return {
    feedbackSampleCount: Math.max(0, Math.round(getNumber(record.feedbackSampleCount))),
    likeMeCount: Math.max(0, Math.round(getNumber(record.likeMeCount))),
    unlikeMeCount: Math.max(0, Math.round(getNumber(record.unlikeMeCount))),
    tooHardCount: Math.max(0, Math.round(getNumber(record.tooHardCount))),
    tooSoftCount: Math.max(0, Math.round(getNumber(record.tooSoftCount))),
    tooTutorialCount: Math.max(0, Math.round(getNumber(record.tooTutorialCount))),
    tooCommentaryCount: Math.max(0, Math.round(getNumber(record.tooCommentaryCount))),
  };
}

function mapExpressionExemplar(value: unknown): AuthorExpressionExemplar | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  const kind = getString(record.kind) as AuthorExpressionExemplar["kind"];
  const text = cleanExpressionExemplarText(record.text);
  if (!text || !["opening", "judgement", "readerBridge", "scene", "emotion", "voice"].includes(kind)) {
    return null;
  }
  return {
    key: getString(record.key) || `${kind}:${text}`,
    kind,
    text,
    sampleCount: Math.max(0, Math.round(getNumber(record.sampleCount))),
    score: getNumber(record.score),
    reason: getString(record.reason),
  };
}

function mapExpressionExemplarProfile(value: unknown): AuthorExpressionExemplarProfile {
  const record = getRecord(value);
  if (!record) {
    return null;
  }
  const positiveExamples = getRecordArray(record.positiveExamples).map(mapExpressionExemplar).filter(Boolean) as AuthorExpressionExemplar[];
  const negativeExamples = getRecordArray(record.negativeExamples).map(mapExpressionExemplar).filter(Boolean) as AuthorExpressionExemplar[];
  return positiveExamples.length || negativeExamples.length
    ? { positiveExamples, negativeExamples }
    : null;
}

function createExpressionExemplarBucket(
  kind: AuthorExpressionExemplar["kind"],
  text: string,
  performanceScore: number,
): ExpressionExemplarBucket {
  return {
    key: `${kind}:${text}`,
    kind,
    text,
    sampleCount: 0,
    performanceScore,
  };
}

function registerExpressionExemplar(input: {
  map: Map<string, ExpressionExemplarBucket>;
  kind: AuthorExpressionExemplar["kind"];
  text: unknown;
  performanceScore: number;
}) {
  const text = cleanExpressionExemplarText(input.text);
  if (!text) {
    return;
  }
  const key = `${input.kind}:${text}`;
  const existing = input.map.get(key) ?? createExpressionExemplarBucket(input.kind, text, 0);
  existing.sampleCount += 1;
  existing.performanceScore += input.performanceScore;
  input.map.set(key, existing);
}

function getViralGenomePack(payload: Record<string, unknown>) {
  return getRecord(payload.viralGenomePack) ?? getRecord(payload);
}

function collectExpressionExemplarCandidates(payload: Record<string, unknown>) {
  const viralGenomePack = getViralGenomePack(payload);
  return [
    { kind: "opening" as const, values: uniqueStrings([getString(payload.openingStrategy), getString(payload.openingPatternLabel)], 2) },
    { kind: "judgement" as const, values: uniqueStrings([getString(payload.articlePrototypeLabel), getString(payload.stateVariantLabel)], 2) },
    { kind: "voice" as const, values: getStringArray(payload.voiceChecklist, 5) },
    { kind: "scene" as const, values: uniqueStrings([
      ...getStringArray(viralGenomePack?.readerSceneAnchors, 4),
      ...getStringArray(viralGenomePack?.openingMicroScenes, 3),
      ...getStringArray(viralGenomePack?.materialJobs, 3),
    ], 6) },
    { kind: "emotion" as const, values: getStringArray(viralGenomePack?.emotionVectors, 4) },
    { kind: "readerBridge" as const, values: uniqueStrings([
      getString(viralGenomePack?.authorPosture),
      getString(viralGenomePack?.firstScreenPromise),
      getString(viralGenomePack?.shareTrigger),
    ], 3) },
  ];
}

function registerExpressionExemplarsFromPayload(input: {
  positiveMap: Map<string, ExpressionExemplarBucket>;
  negativeMap: Map<string, ExpressionExemplarBucket>;
  payload: Record<string, unknown>;
  performanceScore: number;
  feedback: {
    likeMe: boolean;
    unlikeMe: boolean;
    tooHard: boolean;
    tooSoft: boolean;
    tooTutorial: boolean;
    tooCommentary: boolean;
  } | null;
}) {
  const shouldRegisterPositive = input.performanceScore > 0 || Boolean(input.feedback?.likeMe);
  const shouldRegisterNegative =
    input.performanceScore < 0
    || Boolean(input.feedback?.unlikeMe)
    || Boolean(input.feedback?.tooTutorial)
    || Boolean(input.feedback?.tooCommentary);
  if (!shouldRegisterPositive && !shouldRegisterNegative) {
    return;
  }
  for (const candidate of collectExpressionExemplarCandidates(input.payload)) {
    for (const value of candidate.values) {
      if (shouldRegisterPositive) {
        registerExpressionExemplar({
          map: input.positiveMap,
          kind: candidate.kind,
          text: value,
          performanceScore: input.performanceScore,
        });
      }
      if (shouldRegisterNegative) {
        registerExpressionExemplar({
          map: input.negativeMap,
          kind: candidate.kind,
          text: value,
          performanceScore: -Math.abs(input.performanceScore || 1),
        });
      }
    }
  }
}

function finalizeExpressionExemplar(bucket: ExpressionExemplarBucket, polarity: "positive" | "negative"): AuthorExpressionExemplar {
  const averageScore = bucket.sampleCount > 0 ? bucket.performanceScore / bucket.sampleCount : 0;
  const score = polarity === "positive" ? averageScore : Math.abs(averageScore);
  return {
    key: bucket.key,
    kind: bucket.kind,
    text: bucket.text,
    sampleCount: bucket.sampleCount,
    score,
    reason:
      polarity === "positive"
        ? `历史 ${bucket.sampleCount} 篇正向样本复用过这个表达信号。`
        : `历史 ${bucket.sampleCount} 篇低效或不像作者的样本出现过这个表达信号。`,
  };
}

function compareExpressionExemplars(left: AuthorExpressionExemplar, right: AuthorExpressionExemplar) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.sampleCount !== left.sampleCount) {
    return right.sampleCount - left.sampleCount;
  }
  return left.text.localeCompare(right.text, "zh-CN");
}

function buildExpressionExemplarProfile(input: {
  positiveMap: Map<string, ExpressionExemplarBucket>;
  negativeMap: Map<string, ExpressionExemplarBucket>;
}): AuthorExpressionExemplarProfile {
  const positiveExamples = Array.from(input.positiveMap.values())
    .map((bucket) => finalizeExpressionExemplar(bucket, "positive"))
    .sort(compareExpressionExemplars)
    .slice(0, 8);
  const negativeExamples = Array.from(input.negativeMap.values())
    .map((bucket) => finalizeExpressionExemplar(bucket, "negative"))
    .sort(compareExpressionExemplars)
    .slice(0, 8);
  return positiveExamples.length || negativeExamples.length
    ? { positiveExamples, negativeExamples }
    : null;
}

function normalizeConfidence(sampleCount: number, positiveSampleCount: number): "early" | "medium" | "high" {
  if (sampleCount >= 4 && positiveSampleCount >= 2) {
    return "high";
  }
  if (sampleCount >= 2 && positiveSampleCount >= 1) {
    return "medium";
  }
  return "early";
}

function toEffectiveWritingFacet(input: {
  recommendation: AuthorOutcomeFeedbackRecommendation;
  summaryTemplate: string;
}): PersonalEffectiveWritingFacet {
  if (!input.recommendation) {
    return null;
  }
  return {
    key: input.recommendation.key,
    label: input.recommendation.label,
    summary: input.summaryTemplate.replace("{{label}}", input.recommendation.label),
    sampleCount: input.recommendation.sampleCount,
    positiveSampleCount: input.recommendation.positiveSampleCount,
    confidence: normalizeConfidence(input.recommendation.sampleCount, input.recommendation.positiveSampleCount),
    reason: input.recommendation.reason,
  };
}

export function buildPersonalEffectiveWritingProfile(input: {
  sampleCount: number;
  positiveSampleCount: number;
  recommendations: AuthorOutcomeFeedbackLedger["recommendations"];
  updatedAt: string;
}): PersonalEffectiveWritingProfile {
  const prototype = toEffectiveWritingFacet({
    recommendation: input.recommendations.prototype,
    summaryTemplate: "这个作者更适合用「{{label}}」这类文章原型推进。",
  });
  const opening = toEffectiveWritingFacet({
    recommendation: input.recommendations.openingPattern,
    summaryTemplate: "这个作者更适合用「{{label}}」起手。",
  });
  const judgement = toEffectiveWritingFacet({
    recommendation: input.recommendations.stateVariant,
    summaryTemplate: "这个作者在「{{label}}」下的判断更可信。",
  });
  const rhythm = toEffectiveWritingFacet({
    recommendation: input.recommendations.sectionRhythm,
    summaryTemplate: "这个作者更适合「{{label}}」的段落节奏。",
  });
  if (!prototype && !opening && !judgement && !rhythm) {
    return null;
  }
  return {
    summary: `当前已累计 ${input.sampleCount} 篇结果样本，其中 ${input.positiveSampleCount} 篇呈现正向反馈；这些推荐优先用于形成作者自己的高命中写法。`,
    prototype,
    opening,
    judgement,
    rhythm,
    updatedAt: input.updatedAt,
  };
}

function mapLedgerRow(row: {
  sample_count: number;
  positive_sample_count: number;
  payload_json: string | Record<string, unknown> | null;
  updated_at: string;
}): AuthorOutcomeFeedbackLedger | null {
  const payload = parseJsonRecord(row.payload_json);
  if (!payload) {
    return null;
  }
  const recommendations = {
    prototype: mapRecommendation(getRecord(payload.recommendations)?.prototype),
    stateVariant: mapRecommendation(getRecord(payload.recommendations)?.stateVariant),
    openingPattern: mapRecommendation(getRecord(payload.recommendations)?.openingPattern),
    sectionRhythm: mapRecommendation(getRecord(payload.recommendations)?.sectionRhythm),
  };
  const sampleCount = Math.max(0, Math.round(getNumber(payload.sampleCount) || row.sample_count));
  const positiveSampleCount = Math.max(0, Math.round(getNumber(payload.positiveSampleCount) || row.positive_sample_count));
  const updatedAt = getString(payload.updatedAt) || row.updated_at;
  return {
    sampleCount,
    positiveSampleCount,
    prototypeSignals: getRecordArray(payload.prototypeSignals).map(mapSignal).filter(Boolean) as AuthorOutcomeFeedbackSignal[],
    stateVariantSignals: getRecordArray(payload.stateVariantSignals).map(mapSignal).filter(Boolean) as AuthorOutcomeFeedbackSignal[],
    openingPatternSignals: getRecordArray(payload.openingPatternSignals).map(mapSignal).filter(Boolean) as AuthorOutcomeFeedbackSignal[],
    sectionRhythmSignals: getRecordArray(payload.sectionRhythmSignals).map(mapSignal).filter(Boolean) as AuthorOutcomeFeedbackSignal[],
    recommendations,
    effectiveWritingProfile: buildPersonalEffectiveWritingProfile({
      sampleCount,
      positiveSampleCount,
      recommendations,
      updatedAt,
    }),
    expressionFeedbackSummary: mapExpressionFeedbackSummary(payload.expressionFeedbackSummary),
    expressionExemplarProfile: mapExpressionExemplarProfile(payload.expressionExemplarProfile),
    updatedAt,
  };
}

function createExpressionFeedbackSummary(): AuthorExpressionFeedbackSummary {
  return {
    feedbackSampleCount: 0,
    likeMeCount: 0,
    unlikeMeCount: 0,
    tooHardCount: 0,
    tooSoftCount: 0,
    tooTutorialCount: 0,
    tooCommentaryCount: 0,
  };
}

function registerExpressionFeedbackSummary(
  summary: AuthorExpressionFeedbackSummary,
  feedback: {
    likeMe: boolean;
    unlikeMe: boolean;
    tooHard: boolean;
    tooSoft: boolean;
    tooTutorial: boolean;
    tooCommentary: boolean;
  } | null,
) {
  if (!feedback) {
    return;
  }
  const hasAnySignal =
    feedback.likeMe
    || feedback.unlikeMe
    || feedback.tooHard
    || feedback.tooSoft
    || feedback.tooTutorial
    || feedback.tooCommentary;
  if (!hasAnySignal) {
    return;
  }
  summary.feedbackSampleCount += 1;
  if (feedback.likeMe) summary.likeMeCount += 1;
  if (feedback.unlikeMe) summary.unlikeMeCount += 1;
  if (feedback.tooHard) summary.tooHardCount += 1;
  if (feedback.tooSoft) summary.tooSoftCount += 1;
  if (feedback.tooTutorial) summary.tooTutorialCount += 1;
  if (feedback.tooCommentary) summary.tooCommentaryCount += 1;
}

export async function computeAuthorOutcomeFeedbackLedger(input: {
  userId: number;
  excludeArticleId?: number | null;
}) {
  const outcomeBundles = await getArticleOutcomeBundlesByUser(input.userId);
  const articleIds = outcomeBundles
    .map((bundle) => bundle.outcome?.articleId ?? 0)
    .filter((articleId) => articleId > 0 && articleId !== input.excludeArticleId);
  const payloadByArticleId = await getDeepWritingPayloadsByArticleIds({
    userId: input.userId,
    articleIds,
  });
  const prototypeBuckets = new Map<string, SignalBucket>();
  const stateVariantBuckets = new Map<string, SignalBucket>();
  const openingPatternBuckets = new Map<string, SignalBucket>();
  const sectionRhythmBuckets = new Map<string, SignalBucket>();
  const expressionFeedbackSummary = createExpressionFeedbackSummary();
  const positiveExpressionExemplarBuckets = new Map<string, ExpressionExemplarBucket>();
  const negativeExpressionExemplarBuckets = new Map<string, ExpressionExemplarBucket>();
  let sampleCount = 0;
  let positiveSampleCount = 0;

  for (const bundle of outcomeBundles) {
    const articleId = bundle.outcome?.articleId ?? 0;
    if (!articleId || articleId === input.excludeArticleId) {
      continue;
    }
    const payload = payloadByArticleId.get(articleId) ?? null;
    if (!payload) {
      continue;
    }
    const hitStatus = bundle.outcome?.hitStatus ?? null;
    const snapshot = pickOutcomeSnapshot(bundle.snapshots);
    if (!shouldCountOutcomeSample({ hitStatus, snapshot })) {
      continue;
    }
    const performanceScore =
      getOutcomeSampleScore({ hitStatus, snapshot })
      + getExpressionFeedbackAdjustment(bundle.outcome?.expressionFeedback ?? null);
    const prototypeCode = getString(payload.articlePrototype);
    const prototypeLabel = getString(payload.articlePrototypeLabel) || prototypeCode;
    const stateVariantCode = getString(payload.stateVariantCode);
    const stateVariantLabel = getString(payload.stateVariantLabel) || stateVariantCode;
    const adoptedOpeningPatternLabel =
      getString(snapshot?.writingStateFeedback?.adoptedOpeningPatternLabel)
      || getString(payload.openingPatternLabel);
    const recommendedOpeningPatternLabel = getString(snapshot?.writingStateFeedback?.recommendedOpeningPatternLabel);
    const sectionRhythm = getString(payload.sectionRhythm);

    sampleCount += 1;
    if (performanceScore > 0) {
      positiveSampleCount += 1;
    }
    registerExpressionFeedbackSummary(expressionFeedbackSummary, bundle.outcome?.expressionFeedback ?? null);
    registerExpressionExemplarsFromPayload({
      positiveMap: positiveExpressionExemplarBuckets,
      negativeMap: negativeExpressionExemplarBuckets,
      payload,
      performanceScore,
      feedback: bundle.outcome?.expressionFeedback ?? null,
    });

    if (prototypeCode) {
      registerSignal({
        map: prototypeBuckets,
        key: prototypeCode,
        label: prototypeLabel || prototypeCode,
        hitStatus,
        performanceScore,
        followedRecommendation: snapshot?.writingStateFeedback?.followedPrototypeRecommendation ?? null,
      });
    }
    if (stateVariantCode) {
      registerSignal({
        map: stateVariantBuckets,
        key: stateVariantCode,
        label: stateVariantLabel || stateVariantCode,
        hitStatus,
        performanceScore,
        followedRecommendation: snapshot?.writingStateFeedback?.followedRecommendation ?? null,
      });
    }
    if (adoptedOpeningPatternLabel) {
      registerSignal({
        map: openingPatternBuckets,
        key: adoptedOpeningPatternLabel,
        label: adoptedOpeningPatternLabel,
        hitStatus,
        performanceScore,
        followedRecommendation:
          adoptedOpeningPatternLabel && recommendedOpeningPatternLabel
            ? adoptedOpeningPatternLabel === recommendedOpeningPatternLabel
            : null,
      });
    }
    if (sectionRhythm) {
      registerSignal({
        map: sectionRhythmBuckets,
        key: sectionRhythm,
        label: sectionRhythm,
        hitStatus,
        performanceScore,
      });
    }
  }

  if (sampleCount === 0) {
    return null;
  }

  const prototypeSignals = Array.from(prototypeBuckets.values()).map((item) => finalizeSignal(item, "原型")).sort(compareSignals);
  const stateVariantSignals = Array.from(stateVariantBuckets.values()).map((item) => finalizeSignal(item, "状态")).sort(compareSignals);
  const openingPatternSignals = Array.from(openingPatternBuckets.values()).map((item) => finalizeSignal(item, "开头方式")).sort(compareSignals);
  const sectionRhythmSignals = Array.from(sectionRhythmBuckets.values()).map((item) => finalizeSignal(item, "段落节奏")).sort(compareSignals);
  const updatedAt = new Date().toISOString();
  const recommendations = {
    prototype: selectRecommendation(prototypeSignals),
    stateVariant: selectRecommendation(stateVariantSignals),
    openingPattern: selectRecommendation(openingPatternSignals),
    sectionRhythm: selectRecommendation(sectionRhythmSignals),
  };

  return {
    sampleCount,
    positiveSampleCount,
    prototypeSignals,
    stateVariantSignals,
    openingPatternSignals,
    sectionRhythmSignals,
    recommendations,
    effectiveWritingProfile: buildPersonalEffectiveWritingProfile({
      sampleCount,
      positiveSampleCount,
      recommendations,
      updatedAt,
    }),
    expressionFeedbackSummary:
      expressionFeedbackSummary.feedbackSampleCount > 0
        ? expressionFeedbackSummary
        : null,
    expressionExemplarProfile: buildExpressionExemplarProfile({
      positiveMap: positiveExpressionExemplarBuckets,
      negativeMap: negativeExpressionExemplarBuckets,
    }),
    updatedAt,
  } satisfies AuthorOutcomeFeedbackLedger;
}

async function persistAuthorOutcomeFeedbackLedger(input: {
  userId: number;
  ledger: AuthorOutcomeFeedbackLedger | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  if (!input.ledger) {
    await db.exec(
      "DELETE FROM author_outcome_feedback_ledgers WHERE user_id = ?",
      [input.userId],
    );
    return null;
  }
  const now = input.ledger.updatedAt || new Date().toISOString();
  await db.exec(
    `INSERT INTO author_outcome_feedback_ledgers (
      user_id, sample_count, positive_sample_count, payload_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      sample_count = excluded.sample_count,
      positive_sample_count = excluded.positive_sample_count,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at`,
    [
      input.userId,
      input.ledger.sampleCount,
      input.ledger.positiveSampleCount,
      JSON.stringify(input.ledger),
      now,
      now,
    ],
  );
  return input.ledger;
}

export async function refreshAuthorOutcomeFeedbackLedger(input: {
  userId: number;
}) {
  const ledger = await computeAuthorOutcomeFeedbackLedger({ userId: input.userId });
  return persistAuthorOutcomeFeedbackLedger({
    userId: input.userId,
    ledger,
  });
}

export async function getAuthorOutcomeFeedbackLedger(input: {
  userId: number;
  excludeArticleId?: number | null;
  refreshIfMissing?: boolean;
}) {
  if (input.excludeArticleId) {
    return computeAuthorOutcomeFeedbackLedger({
      userId: input.userId,
      excludeArticleId: input.excludeArticleId,
    });
  }
  await ensureExtendedProductSchema();
  const row = await getDatabase().queryOne<{
    sample_count: number;
    positive_sample_count: number;
    payload_json: string | Record<string, unknown> | null;
    updated_at: string;
  }>(
    `SELECT sample_count, positive_sample_count, payload_json, updated_at
     FROM author_outcome_feedback_ledgers
     WHERE user_id = ?`,
    [input.userId],
  );
  if (row) {
    return mapLedgerRow(row);
  }
  if (input.refreshIfMissing) {
    return refreshAuthorOutcomeFeedbackLedger({ userId: input.userId });
  }
  return null;
}
