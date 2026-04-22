import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const AUTHOR_BASELINE_WINDOW_DAYS = 30;
const AUTHOR_BASELINE_MIN_REVIEWED_COUNT = 3;
const MATRIX_WINDOW_WEEKS = 4;
const MATRIX_WINDOW_DAYS = MATRIX_WINDOW_WEEKS * 7;
const STYLE_USAGE_WINDOW_DAYS = 30;
const LEGACY_STYLE_USAGE_SCOPE = "style-save-proxy";

export const PLAN17_BUSINESS_VIEW_OPTIONS = [
  "author-lift",
  "fission-vs-radar",
  "matrix-output",
  "style-usage",
  "batch-drilldown",
] as const;

export const PLAN17_BUSINESS_EXPORT_SCOPES = [
  "batch-drilldown",
  "author-lift",
  "fission-vs-radar",
  "matrix-output",
  "style-usage",
] as const;

export type Plan17BusinessView = (typeof PLAN17_BUSINESS_VIEW_OPTIONS)[number];
export type Plan17BusinessExportScope = (typeof PLAN17_BUSINESS_EXPORT_SCOPES)[number];

export type Plan17BusinessReviewedOutcomeFact = {
  userId: number;
  articleId: number;
  articleCreatedAt: string | null;
  hitStatus: "hit" | "near_miss" | "miss";
  topicSource: string | null;
  topicFissionMode: string | null;
};

export type Plan17BusinessGeneratedItemFact = {
  userId: number;
  generatedArticleId: number | null;
  batchId: string | null;
  backlogId: number | null;
  generatedAt: string | null;
  updatedAt: string | null;
};

export type Plan17BusinessArticleFact = {
  articleId: number;
  userId: number;
  createdAt: string | null;
  seriesId: number | null;
};

export type Plan17BusinessStyleUsageFact = {
  userId: number;
  profileId: number | null;
  articleId: number | null;
  usageSource: string | null;
  sampleCount: number;
  usedAt: string | null;
  usageToken?: string | null;
};

export type Plan17BusinessBatchDrilldownItem = {
  batchId: string;
  userId: number;
  backlogIds: number[];
  generatedItemCount: number;
  linkedArticleCount: number;
  reviewedArticleCount: number;
  pendingReviewArticleCount: number;
  hitArticleCount: number;
  nearMissArticleCount: number;
  missArticleCount: number;
  reviewCoverage: number | null;
  hitRate: number | null;
  firstGeneratedAt: string | null;
  lastGeneratedAt: string | null;
  latestLinkedArticleCreatedAt: string | null;
  fissionModeBreakdown: Array<{ key: string; reviewedCount: number; hitCount: number }>;
};

export type Plan17BusinessBatchDrilldown = {
  batchCount: number;
  linkedArticleCount: number;
  reviewedArticleCount: number;
  pendingReviewArticleCount: number;
  hitArticleCount: number;
  nearMissArticleCount: number;
  missArticleCount: number;
  reviewCoverage: number | null;
  hitRate: number | null;
  items: Plan17BusinessBatchDrilldownItem[];
};

export type Plan17BusinessAuthorLiftDrilldownItem = {
  userId: number;
  activationAt: string | null;
  baselineReviewedCount: number;
  currentReviewedCount: number;
  baselineHitRate: number | null;
  currentHitRate: number | null;
  liftPp: number | null;
  comparable: boolean;
};

export type Plan17BusinessMatrixAuthorDrilldownItem = {
  userId: number;
  activationAt: string | null;
  beforeArticleCount: number;
  afterArticleCount: number;
  beforeMedian: number | null;
  afterMedian: number | null;
  outputGrowthPp: number | null;
  beforeHitRate: number | null;
  afterHitRate: number | null;
  qualityDeltaPp: number | null;
  comparableOutput: boolean;
  comparableQuality: boolean;
};

export type Plan17BusinessStyleUsageDrilldownItem = {
  userId: number;
  profileId: number | null;
  articleId: number | null;
  usageSource: string | null;
  sampleCount: number;
  isMultiSample: boolean;
  isRecent30d: boolean;
  usedAt: string | null;
};

export type Plan17BusinessFissionVsRadarDrilldownItem = {
  userId: number;
  articleId: number;
  articleCreatedAt: string | null;
  topicSource: string | null;
  topicFissionMode: string | null;
  hitStatus: "hit" | "near_miss" | "miss";
};

export type Plan17BusinessReport = {
  generatedAt: string;
  authorLiftVsBaseline: {
    activatedAuthorCount: number;
    comparableAuthorCount: number;
    improvedAuthorCount: number;
    nonDegradedAuthorCount: number;
    averageLiftPp: number | null;
    medianLiftPp: number | null;
    baselineMedianHitRate: number | null;
    currentMedianHitRate: number | null;
    minimumReviewedCountPerWindow: number;
    windowDays: number;
  };
  fissionVsRadar: {
    fissionReviewedCount: number;
    fissionHitCount: number;
    fissionHitRate: number | null;
    radarReviewedCount: number;
    radarHitCount: number;
    radarHitRate: number | null;
    hitRateDeltaPp: number | null;
    fissionModeBreakdown: Array<{ key: string; reviewedCount: number; hitCount: number }>;
  };
  matrixWeeklyOutput: {
    matrixAuthorCount: number;
    comparableAuthorCount: number;
    qualityComparableAuthorCount: number;
    nonDegradedQualityAuthorCount: number;
    batchCount: number;
    batchLinkedArticleCount: number;
    weeklyOutputMedianBefore: number | null;
    weeklyOutputMedianAfter: number | null;
    weeklyOutputGrowthPp: number | null;
    hitRateMedianBefore: number | null;
    hitRateMedianAfter: number | null;
    observedQualityDeltaPp: number | null;
    windowWeeks: number;
  };
  styleHeatmapUsage: {
    totalUsageEventCount: number;
    multiSampleUsageEventCount: number;
    multiSampleUsageShare: number | null;
    recent30dUsageEventCount: number;
    recent30dMultiSampleUsageEventCount: number;
    recent30dMultiSampleUsageShare: number | null;
    profileCount: number;
    recent30dProfileCount: number;
    authorCount: number;
    recent30dAuthorCount: number;
  };
  batchDrilldown: Plan17BusinessBatchDrilldown;
  authorLiftDrilldown: Plan17BusinessAuthorLiftDrilldownItem[];
  matrixAuthorDrilldown: Plan17BusinessMatrixAuthorDrilldownItem[];
  styleUsageDrilldown: Plan17BusinessStyleUsageDrilldownItem[];
  fissionVsRadarDrilldown: Plan17BusinessFissionVsRadarDrilldownItem[];
};

type Plan17BusinessFacts = {
  generatedAt?: string;
  now?: string | Date;
  reviewedOutcomes: Plan17BusinessReviewedOutcomeFact[];
  generatedItems: Plan17BusinessGeneratedItemFact[];
  articles: Plan17BusinessArticleFact[];
  styleUsageEvents: Plan17BusinessStyleUsageFact[];
};

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function roundMetric(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middleIndex] ?? null;
  }
  const left = sorted[middleIndex - 1];
  const right = sorted[middleIndex];
  if (typeof left !== "number" || typeof right !== "number") {
    return null;
  }
  return (left + right) / 2;
}

function toIsoString(timestamp: number | null) {
  return timestamp == null ? null : new Date(timestamp).toISOString();
}

function uniqueSortedNumbers(values: Iterable<number>) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function escapeCsvValue(value: boolean | number | string | null | undefined) {
  if (value == null) return "";
  const normalized = String(value);
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, "\"\"")}"`;
}

function computeHitRate(items: Array<{ hitStatus: "hit" | "near_miss" | "miss" }>) {
  if (items.length === 0) return null;
  const hitCount = items.filter((item) => item.hitStatus === "hit").length;
  return hitCount / items.length;
}

function getWindowItemsByTimestamp<T>(items: T[], getTimestamp: (item: T) => number | null, startInclusive: number, endExclusive: number) {
  return items.filter((item) => {
    const timestamp = getTimestamp(item);
    return timestamp != null && timestamp >= startInclusive && timestamp < endExclusive;
  });
}

function buildWeeklyCounts(items: Plan17BusinessArticleFact[], startInclusive: number, weeks: number) {
  const counts = Array.from({ length: weeks }, () => 0);
  const endExclusive = startInclusive + weeks * 7 * DAY_IN_MS;
  for (const item of items) {
    const timestamp = toTimestamp(item.createdAt);
    if (timestamp == null || timestamp < startInclusive || timestamp >= endExclusive) {
      continue;
    }
    const weekIndex = Math.floor((timestamp - startInclusive) / (7 * DAY_IN_MS));
    if (weekIndex >= 0 && weekIndex < weeks) {
      counts[weekIndex] += 1;
    }
  }
  return counts;
}

function getActivationTimestamp(
  generatedItems: Plan17BusinessGeneratedItemFact[],
  reviewedOutcomes: Plan17BusinessReviewedOutcomeFact[],
  styleUsageEvents: Plan17BusinessStyleUsageFact[],
) {
  const activationTimestamps = new Map<number, number>();

  for (const item of generatedItems) {
    const eventTimestamp = toTimestamp(item.generatedAt) ?? toTimestamp(item.updatedAt);
    if (eventTimestamp == null) continue;
    const current = activationTimestamps.get(item.userId);
    if (current == null || eventTimestamp < current) {
      activationTimestamps.set(item.userId, eventTimestamp);
    }
  }

  for (const item of reviewedOutcomes) {
    if (item.topicSource !== "topicFission") continue;
    const eventTimestamp = toTimestamp(item.articleCreatedAt);
    if (eventTimestamp == null) continue;
    const current = activationTimestamps.get(item.userId);
    if (current == null || eventTimestamp < current) {
      activationTimestamps.set(item.userId, eventTimestamp);
    }
  }

  for (const item of styleUsageEvents) {
    const eventTimestamp = toTimestamp(item.usedAt);
    if (eventTimestamp == null) continue;
    const current = activationTimestamps.get(item.userId);
    if (current == null || eventTimestamp < current) {
      activationTimestamps.set(item.userId, eventTimestamp);
    }
  }

  return activationTimestamps;
}

function normalizeStyleUsageEvents(styleUsageEvents: Plan17BusinessStyleUsageFact[]) {
  const tokenDeduped = new Map<string, Plan17BusinessStyleUsageFact>();
  const passthrough: Plan17BusinessStyleUsageFact[] = [];

  for (const item of styleUsageEvents) {
    const usageToken = String(item.usageToken || "").trim();
    if (!usageToken) {
      passthrough.push(item);
      continue;
    }
    const key = `${item.userId}@@${usageToken}`;
    const current = tokenDeduped.get(key);
    const currentTimestamp = toTimestamp(current?.usedAt ?? null) ?? Number.NEGATIVE_INFINITY;
    const nextTimestamp = toTimestamp(item.usedAt) ?? Number.NEGATIVE_INFINITY;
    if (!current || nextTimestamp >= currentTimestamp) {
      tokenDeduped.set(key, item);
    }
  }

  return [...passthrough, ...tokenDeduped.values()];
}

function groupByUser<T extends { userId: number }>(items: T[]) {
  const grouped = new Map<number, T[]>();
  for (const item of items) {
    const current = grouped.get(item.userId) ?? [];
    current.push(item);
    grouped.set(item.userId, current);
  }
  return grouped;
}

function buildPlan17BusinessBatchDrilldownFromFacts(input: {
  reviewedOutcomes: Plan17BusinessReviewedOutcomeFact[];
  generatedItems: Plan17BusinessGeneratedItemFact[];
  articles: Plan17BusinessArticleFact[];
}) {
  const reviewedByArticle = new Map(
    input.reviewedOutcomes.map((item) => [`${item.userId}@@${item.articleId}`, item] as const),
  );
  const articlesByKey = new Map(
    input.articles.map((item) => [`${item.userId}@@${item.articleId}`, item] as const),
  );
  const batches = input.generatedItems.reduce((bucket, item) => {
    const batchId = item.batchId?.trim();
    if (!batchId) {
      return bucket;
    }
    const batchKey = `${item.userId}@@${batchId}`;

    const current =
      bucket.get(batchKey) ?? {
        batchId,
        userId: item.userId,
        backlogIds: new Set<number>(),
        generatedItemCount: 0,
        linkedArticleIds: new Set<number>(),
        firstGeneratedTimestamp: null as number | null,
        lastGeneratedTimestamp: null as number | null,
      };
    current.generatedItemCount += 1;
    if (Number.isInteger(item.backlogId) && (item.backlogId ?? 0) > 0) {
      current.backlogIds.add(item.backlogId as number);
    }
    if (Number.isInteger(item.generatedArticleId) && (item.generatedArticleId ?? 0) > 0) {
      current.linkedArticleIds.add(item.generatedArticleId as number);
    }
    const eventTimestamp = toTimestamp(item.generatedAt) ?? toTimestamp(item.updatedAt);
    if (eventTimestamp != null) {
      if (current.firstGeneratedTimestamp == null || eventTimestamp < current.firstGeneratedTimestamp) {
        current.firstGeneratedTimestamp = eventTimestamp;
      }
      if (current.lastGeneratedTimestamp == null || eventTimestamp > current.lastGeneratedTimestamp) {
        current.lastGeneratedTimestamp = eventTimestamp;
      }
    }
    bucket.set(batchKey, current);
    return bucket;
  }, new Map<string, {
    batchId: string;
    userId: number;
    backlogIds: Set<number>;
    generatedItemCount: number;
    linkedArticleIds: Set<number>;
    firstGeneratedTimestamp: number | null;
    lastGeneratedTimestamp: number | null;
  }>());

  const items = [...batches.values()]
    .map((batch): Plan17BusinessBatchDrilldownItem => {
      let reviewedArticleCount = 0;
      let hitArticleCount = 0;
      let nearMissArticleCount = 0;
      let missArticleCount = 0;
      let latestLinkedArticleCreatedAt = null as number | null;
      const fissionModeBreakdown = new Map<string, { reviewedCount: number; hitCount: number }>();
      const linkedArticleIds = uniqueSortedNumbers(batch.linkedArticleIds);

      for (const articleId of linkedArticleIds) {
        const article = articlesByKey.get(`${batch.userId}@@${articleId}`);
        const articleCreatedTimestamp = toTimestamp(article?.createdAt);
        if (articleCreatedTimestamp != null && (latestLinkedArticleCreatedAt == null || articleCreatedTimestamp > latestLinkedArticleCreatedAt)) {
          latestLinkedArticleCreatedAt = articleCreatedTimestamp;
        }

        const reviewed = reviewedByArticle.get(`${batch.userId}@@${articleId}`);
        if (!reviewed) {
          continue;
        }
        reviewedArticleCount += 1;
        if (reviewed.hitStatus === "hit") {
          hitArticleCount += 1;
        } else if (reviewed.hitStatus === "near_miss") {
          nearMissArticleCount += 1;
        } else {
          missArticleCount += 1;
        }

        if (reviewed.topicSource === "topicFission") {
          const key = String(reviewed.topicFissionMode || "unknown").trim() || "unknown";
          const mode = fissionModeBreakdown.get(key) ?? { reviewedCount: 0, hitCount: 0 };
          mode.reviewedCount += 1;
          if (reviewed.hitStatus === "hit") {
            mode.hitCount += 1;
          }
          fissionModeBreakdown.set(key, mode);
        }
      }

      const linkedArticleCount = linkedArticleIds.length;
      return {
        batchId: batch.batchId,
        userId: batch.userId,
        backlogIds: uniqueSortedNumbers(batch.backlogIds),
        generatedItemCount: batch.generatedItemCount,
        linkedArticleCount,
        reviewedArticleCount,
        pendingReviewArticleCount: Math.max(linkedArticleCount - reviewedArticleCount, 0),
        hitArticleCount,
        nearMissArticleCount,
        missArticleCount,
        reviewCoverage: roundMetric(linkedArticleCount > 0 ? (reviewedArticleCount / linkedArticleCount) * 100 : null),
        hitRate: roundMetric(reviewedArticleCount > 0 ? (hitArticleCount / reviewedArticleCount) * 100 : null),
        firstGeneratedAt: toIsoString(batch.firstGeneratedTimestamp),
        lastGeneratedAt: toIsoString(batch.lastGeneratedTimestamp),
        latestLinkedArticleCreatedAt: toIsoString(latestLinkedArticleCreatedAt),
        fissionModeBreakdown: [...fissionModeBreakdown.entries()]
          .sort((left, right) => right[1].reviewedCount - left[1].reviewedCount || left[0].localeCompare(right[0]))
          .map(([key, value]) => ({ key, reviewedCount: value.reviewedCount, hitCount: value.hitCount })),
      };
    })
    .sort((left, right) => {
      const lastGeneratedDelta = (toTimestamp(right.lastGeneratedAt) ?? Number.NEGATIVE_INFINITY) - (toTimestamp(left.lastGeneratedAt) ?? Number.NEGATIVE_INFINITY);
      if (lastGeneratedDelta !== 0) {
        return lastGeneratedDelta;
      }
      if (right.reviewedArticleCount !== left.reviewedArticleCount) {
        return right.reviewedArticleCount - left.reviewedArticleCount;
      }
      if (right.linkedArticleCount !== left.linkedArticleCount) {
        return right.linkedArticleCount - left.linkedArticleCount;
      }
      return left.batchId.localeCompare(right.batchId);
    });

  const linkedArticleCount = items.reduce((sum, item) => sum + item.linkedArticleCount, 0);
  const reviewedArticleCount = items.reduce((sum, item) => sum + item.reviewedArticleCount, 0);
  const hitArticleCount = items.reduce((sum, item) => sum + item.hitArticleCount, 0);
  const nearMissArticleCount = items.reduce((sum, item) => sum + item.nearMissArticleCount, 0);
  const missArticleCount = items.reduce((sum, item) => sum + item.missArticleCount, 0);

  return {
    batchCount: items.length,
    linkedArticleCount,
    reviewedArticleCount,
    pendingReviewArticleCount: Math.max(linkedArticleCount - reviewedArticleCount, 0),
    hitArticleCount,
    nearMissArticleCount,
    missArticleCount,
    reviewCoverage: roundMetric(linkedArticleCount > 0 ? (reviewedArticleCount / linkedArticleCount) * 100 : null),
    hitRate: roundMetric(reviewedArticleCount > 0 ? (hitArticleCount / reviewedArticleCount) * 100 : null),
    items,
  } satisfies Plan17BusinessBatchDrilldown;
}

export function buildPlan17BusinessBatchDrilldownCsv(drilldown: Plan17BusinessBatchDrilldown) {
  const header = [
    "batch_id",
    "user_id",
    "generated_item_count",
    "linked_article_count",
    "reviewed_article_count",
    "pending_review_article_count",
    "review_coverage_pct",
    "hit_article_count",
    "near_miss_article_count",
    "miss_article_count",
    "hit_rate_pct",
    "backlog_ids",
    "fission_modes",
    "first_generated_at",
    "last_generated_at",
    "latest_linked_article_created_at",
  ];
  const rows = drilldown.items.map((item) => [
    item.batchId,
    item.userId,
    item.generatedItemCount,
    item.linkedArticleCount,
    item.reviewedArticleCount,
    item.pendingReviewArticleCount,
    item.reviewCoverage,
    item.hitArticleCount,
    item.nearMissArticleCount,
    item.missArticleCount,
    item.hitRate,
    item.backlogIds.join("|"),
    item.fissionModeBreakdown.map((mode) => `${mode.key}:${mode.hitCount}/${mode.reviewedCount}`).join("; "),
    item.firstGeneratedAt,
    item.lastGeneratedAt,
    item.latestLinkedArticleCreatedAt,
  ]);

  return [header, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

export function normalizePlan17BusinessView(view: string | null | undefined): Plan17BusinessView | null {
  const normalized = String(view || "").trim();
  if (!normalized) return null;
  if (normalized === LEGACY_STYLE_USAGE_SCOPE) {
    return "style-usage";
  }
  return PLAN17_BUSINESS_VIEW_OPTIONS.includes(normalized as Plan17BusinessView)
    ? (normalized as Plan17BusinessView)
    : null;
}

export function normalizePlan17BusinessExportScope(scope: string | null | undefined): Plan17BusinessExportScope | null {
  const normalized = String(scope || "").trim();
  if (!normalized) return "batch-drilldown";
  if (normalized === LEGACY_STYLE_USAGE_SCOPE) {
    return "style-usage";
  }
  return PLAN17_BUSINESS_EXPORT_SCOPES.includes(normalized as Plan17BusinessExportScope)
    ? (normalized as Plan17BusinessExportScope)
    : null;
}

export function buildPlan17BusinessViewPayload(report: Plan17BusinessReport, view: string | null | undefined) {
  const normalizedView = normalizePlan17BusinessView(view);
  if (normalizedView === "batch-drilldown") {
    return {
      generatedAt: report.generatedAt,
      batchDrilldown: report.batchDrilldown,
    };
  }
  if (normalizedView === "author-lift") {
    return {
      generatedAt: report.generatedAt,
      authorLiftVsBaseline: report.authorLiftVsBaseline,
      authorLiftDrilldown: report.authorLiftDrilldown,
    };
  }
  if (normalizedView === "fission-vs-radar") {
    return {
      generatedAt: report.generatedAt,
      fissionVsRadar: report.fissionVsRadar,
      fissionVsRadarDrilldown: report.fissionVsRadarDrilldown,
    };
  }
  if (normalizedView === "matrix-output") {
    return {
      generatedAt: report.generatedAt,
      matrixWeeklyOutput: report.matrixWeeklyOutput,
      matrixAuthorDrilldown: report.matrixAuthorDrilldown,
    };
  }
  if (normalizedView === "style-usage") {
    return {
      generatedAt: report.generatedAt,
      styleHeatmapUsage: report.styleHeatmapUsage,
      styleUsageDrilldown: report.styleUsageDrilldown,
    };
  }
  return report;
}

export function buildPlan17BusinessAuthorLiftCsv(items: Plan17BusinessAuthorLiftDrilldownItem[]) {
  const header = [
    "user_id",
    "activation_at",
    "baseline_reviewed_count",
    "current_reviewed_count",
    "baseline_hit_rate_pct",
    "current_hit_rate_pct",
    "lift_pp",
    "comparable",
  ];
  const rows = items.map((item) => [
    item.userId,
    item.activationAt,
    item.baselineReviewedCount,
    item.currentReviewedCount,
    item.baselineHitRate,
    item.currentHitRate,
    item.liftPp,
    item.comparable,
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

export function buildPlan17BusinessMatrixAuthorCsv(items: Plan17BusinessMatrixAuthorDrilldownItem[]) {
  const header = [
    "user_id",
    "activation_at",
    "before_article_count",
    "after_article_count",
    "before_weekly_median",
    "after_weekly_median",
    "output_growth_pct",
    "before_hit_rate_pct",
    "after_hit_rate_pct",
    "quality_delta_pp",
    "comparable_output",
    "comparable_quality",
  ];
  const rows = items.map((item) => [
    item.userId,
    item.activationAt,
    item.beforeArticleCount,
    item.afterArticleCount,
    item.beforeMedian,
    item.afterMedian,
    item.outputGrowthPp,
    item.beforeHitRate,
    item.afterHitRate,
    item.qualityDeltaPp,
    item.comparableOutput,
    item.comparableQuality,
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

export function buildPlan17BusinessStyleUsageCsv(items: Plan17BusinessStyleUsageDrilldownItem[]) {
  const header = [
    "user_id",
    "profile_id",
    "article_id",
    "usage_source",
    "sample_count",
    "is_multi_sample",
    "is_recent_30d",
    "used_at",
  ];
  const rows = items.map((item) => [
    item.userId,
    item.profileId,
    item.articleId,
    item.usageSource,
    item.sampleCount,
    item.isMultiSample,
    item.isRecent30d,
    item.usedAt,
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

export const buildPlan17BusinessStyleProfileCsv = buildPlan17BusinessStyleUsageCsv;

export function buildPlan17BusinessFissionVsRadarCsv(items: Plan17BusinessFissionVsRadarDrilldownItem[]) {
  const header = [
    "user_id",
    "article_id",
    "article_created_at",
    "topic_source",
    "topic_fission_mode",
    "hit_status",
  ];
  const rows = items.map((item) => [
    item.userId,
    item.articleId,
    item.articleCreatedAt,
    item.topicSource,
    item.topicFissionMode,
    item.hitStatus,
  ]);
  return [header, ...rows].map((row) => row.map((cell) => escapeCsvValue(cell)).join(",")).join("\n");
}

export function buildPlan17BusinessExportCsv(report: Plan17BusinessReport, scope: string | null | undefined) {
  const normalizedScope = normalizePlan17BusinessExportScope(scope);
  if (!normalizedScope) {
    throw new Error("不支持的 plan17 业务导出范围");
  }
  if (normalizedScope === "author-lift") {
    return buildPlan17BusinessAuthorLiftCsv(report.authorLiftDrilldown);
  }
  if (normalizedScope === "fission-vs-radar") {
    return buildPlan17BusinessFissionVsRadarCsv(report.fissionVsRadarDrilldown);
  }
  if (normalizedScope === "matrix-output") {
    return buildPlan17BusinessMatrixAuthorCsv(report.matrixAuthorDrilldown);
  }
  if (normalizedScope === "style-usage") {
    return buildPlan17BusinessStyleUsageCsv(report.styleUsageDrilldown);
  }
  return buildPlan17BusinessBatchDrilldownCsv(report.batchDrilldown);
}

export function buildPlan17BusinessReportFromFacts(input: Plan17BusinessFacts): Plan17BusinessReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const nowTimestamp =
    input.now instanceof Date ? input.now.getTime() : toTimestamp(typeof input.now === "string" ? input.now : generatedAt) ?? Date.now();

  const reviewedDeduped = Array.from(
    input.reviewedOutcomes.reduce((bucket, item) => {
      bucket.set(`${item.userId}@@${item.articleId}`, item);
      return bucket;
    }, new Map<string, Plan17BusinessReviewedOutcomeFact>()),
  ).map(([, item]) => item);
  const articlesDeduped = Array.from(
    input.articles.reduce((bucket, item) => {
      bucket.set(`${item.userId}@@${item.articleId}`, item);
      return bucket;
    }, new Map<string, Plan17BusinessArticleFact>()),
  ).map(([, item]) => item);

  const reviewedByUser = groupByUser(reviewedDeduped);
  const articlesByUser = groupByUser(articlesDeduped);
  const styleUsageEvents = normalizeStyleUsageEvents(input.styleUsageEvents);
  const activationTimestamps = getActivationTimestamp(input.generatedItems, reviewedDeduped, styleUsageEvents);

  const authorLiftPairs = [...activationTimestamps.entries()].map(([userId, activationTimestamp]) => {
    const baselineStart = activationTimestamp - AUTHOR_BASELINE_WINDOW_DAYS * DAY_IN_MS;
    const currentEnd = activationTimestamp + AUTHOR_BASELINE_WINDOW_DAYS * DAY_IN_MS;
    const reviewedItems = reviewedByUser.get(userId) ?? [];
    const baselineItems = getWindowItemsByTimestamp(reviewedItems, (item) => toTimestamp(item.articleCreatedAt), baselineStart, activationTimestamp);
    const currentItems = getWindowItemsByTimestamp(reviewedItems, (item) => toTimestamp(item.articleCreatedAt), activationTimestamp, currentEnd);
    const baselineHitRate = computeHitRate(baselineItems);
    const currentHitRate = computeHitRate(currentItems);
    const liftPp =
      baselineHitRate != null && currentHitRate != null ? (currentHitRate - baselineHitRate) * 100 : null;

    return {
      userId,
      activationTimestamp,
      baselineReviewedCount: baselineItems.length,
      currentReviewedCount: currentItems.length,
      baselineHitRate,
      currentHitRate,
      liftPp,
    };
  });
  const comparableAuthorLiftPairs = authorLiftPairs.filter(
    (item) =>
      item.baselineReviewedCount >= AUTHOR_BASELINE_MIN_REVIEWED_COUNT
      && item.currentReviewedCount >= AUTHOR_BASELINE_MIN_REVIEWED_COUNT
      && item.liftPp != null,
  );

  const fissionItems = reviewedDeduped.filter((item) => item.topicSource === "topicFission");
  const radarItems = reviewedDeduped.filter((item) => item.topicSource === "radar");
  const fissionHitRate = computeHitRate(fissionItems);
  const radarHitRate = computeHitRate(radarItems);
  const fissionModeBreakdown = Array.from(
    fissionItems.reduce((bucket, item) => {
      const key = String(item.topicFissionMode || "unknown").trim() || "unknown";
      const current = bucket.get(key) ?? { reviewedCount: 0, hitCount: 0 };
      current.reviewedCount += 1;
      if (item.hitStatus === "hit") {
        current.hitCount += 1;
      }
      bucket.set(key, current);
      return bucket;
    }, new Map<string, { reviewedCount: number; hitCount: number }>()),
  )
    .sort((left, right) => right[1].reviewedCount - left[1].reviewedCount || left[0].localeCompare(right[0]))
    .map(([key, value]) => ({ key, reviewedCount: value.reviewedCount, hitCount: value.hitCount }));

  const matrixActivationTimestamps = new Map<number, number>();
  for (const item of input.generatedItems) {
    if (!item.batchId) continue;
    const eventTimestamp = toTimestamp(item.generatedAt) ?? toTimestamp(item.updatedAt);
    if (eventTimestamp == null) continue;
    const current = matrixActivationTimestamps.get(item.userId);
    if (current == null || eventTimestamp < current) {
      matrixActivationTimestamps.set(item.userId, eventTimestamp);
    }
  }
  const matrixPairs = [...matrixActivationTimestamps.entries()].map(([userId, activationTimestamp]) => {
    const beforeStart = activationTimestamp - MATRIX_WINDOW_DAYS * DAY_IN_MS;
    const afterEnd = activationTimestamp + MATRIX_WINDOW_DAYS * DAY_IN_MS;
    const userArticles = articlesByUser.get(userId) ?? [];
    const userReviewedItems = reviewedByUser.get(userId) ?? [];
    const beforeWeeklyCounts = buildWeeklyCounts(userArticles, beforeStart, MATRIX_WINDOW_WEEKS);
    const afterWeeklyCounts = buildWeeklyCounts(userArticles, activationTimestamp, MATRIX_WINDOW_WEEKS);
    const beforeMedian = median(beforeWeeklyCounts);
    const afterMedian = median(afterWeeklyCounts);
    const reviewedBefore = getWindowItemsByTimestamp(userReviewedItems, (item) => toTimestamp(item.articleCreatedAt), beforeStart, activationTimestamp);
    const reviewedAfter = getWindowItemsByTimestamp(userReviewedItems, (item) => toTimestamp(item.articleCreatedAt), activationTimestamp, afterEnd);
    const beforeHitRate = computeHitRate(reviewedBefore);
    const afterHitRate = computeHitRate(reviewedAfter);
    const outputGrowthPp =
      typeof beforeMedian === "number" && beforeMedian > 0 && typeof afterMedian === "number"
        ? ((afterMedian - beforeMedian) / beforeMedian) * 100
        : null;
    const qualityDeltaPp =
      beforeHitRate != null && afterHitRate != null ? (afterHitRate - beforeHitRate) * 100 : null;

    return {
      userId,
      activationTimestamp,
      beforeMedian,
      afterMedian,
      beforeHitRate,
      afterHitRate,
      outputGrowthPp,
      qualityDeltaPp,
      beforeArticleCount: beforeWeeklyCounts.reduce((sum, item) => sum + item, 0),
      afterArticleCount: afterWeeklyCounts.reduce((sum, item) => sum + item, 0),
    };
  });
  const comparableMatrixPairs = matrixPairs.filter(
    (item) =>
      typeof item.beforeMedian === "number"
      && typeof item.afterMedian === "number"
      && item.beforeMedian > 0
      && item.afterArticleCount > 0,
  );
  const qualityComparableMatrixPairs = comparableMatrixPairs.filter(
    (item) => item.beforeHitRate != null && item.afterHitRate != null,
  );

  const recentStyleUsageEvents = styleUsageEvents.filter((item) => {
    const timestamp = toTimestamp(item.usedAt);
    return timestamp != null && timestamp >= nowTimestamp - STYLE_USAGE_WINDOW_DAYS * DAY_IN_MS;
  });
  const multiSampleUsageEvents = styleUsageEvents.filter((item) => item.sampleCount >= 3);
  const recentMultiSampleUsageEvents = recentStyleUsageEvents.filter((item) => item.sampleCount >= 3);
  const fissionVsRadarDrilldown = reviewedDeduped
    .filter((item) => item.topicSource === "topicFission" || item.topicSource === "radar")
    .sort((left, right) => (toTimestamp(right.articleCreatedAt) ?? Number.NEGATIVE_INFINITY) - (toTimestamp(left.articleCreatedAt) ?? Number.NEGATIVE_INFINITY))
    .map((item) => ({
      userId: item.userId,
      articleId: item.articleId,
      articleCreatedAt: item.articleCreatedAt,
      topicSource: item.topicSource,
      topicFissionMode: item.topicFissionMode,
      hitStatus: item.hitStatus,
    } satisfies Plan17BusinessFissionVsRadarDrilldownItem));
  const authorLiftDrilldown = authorLiftPairs
    .map((item) => ({
      userId: item.userId,
      activationAt: toIsoString(item.activationTimestamp),
      baselineReviewedCount: item.baselineReviewedCount,
      currentReviewedCount: item.currentReviewedCount,
      baselineHitRate: roundMetric(item.baselineHitRate != null ? item.baselineHitRate * 100 : null),
      currentHitRate: roundMetric(item.currentHitRate != null ? item.currentHitRate * 100 : null),
      liftPp: roundMetric(item.liftPp),
      comparable:
        item.baselineReviewedCount >= AUTHOR_BASELINE_MIN_REVIEWED_COUNT
        && item.currentReviewedCount >= AUTHOR_BASELINE_MIN_REVIEWED_COUNT
        && item.liftPp != null,
    } satisfies Plan17BusinessAuthorLiftDrilldownItem))
    .sort((left, right) => {
      const activationDelta = (toTimestamp(right.activationAt) ?? Number.NEGATIVE_INFINITY) - (toTimestamp(left.activationAt) ?? Number.NEGATIVE_INFINITY);
      if (activationDelta !== 0) return activationDelta;
      return left.userId - right.userId;
    });
  const matrixAuthorDrilldown = matrixPairs
    .map((item) => ({
      userId: item.userId,
      activationAt: toIsoString(item.activationTimestamp),
      beforeArticleCount: item.beforeArticleCount,
      afterArticleCount: item.afterArticleCount,
      beforeMedian: roundMetric(item.beforeMedian),
      afterMedian: roundMetric(item.afterMedian),
      outputGrowthPp: roundMetric(item.outputGrowthPp),
      beforeHitRate: roundMetric(item.beforeHitRate != null ? item.beforeHitRate * 100 : null),
      afterHitRate: roundMetric(item.afterHitRate != null ? item.afterHitRate * 100 : null),
      qualityDeltaPp: roundMetric(item.qualityDeltaPp),
      comparableOutput:
        typeof item.beforeMedian === "number"
        && typeof item.afterMedian === "number"
        && item.beforeMedian > 0
        && item.afterArticleCount > 0,
      comparableQuality: item.beforeHitRate != null && item.afterHitRate != null,
    } satisfies Plan17BusinessMatrixAuthorDrilldownItem))
    .sort((left, right) => {
      const activationDelta = (toTimestamp(right.activationAt) ?? Number.NEGATIVE_INFINITY) - (toTimestamp(left.activationAt) ?? Number.NEGATIVE_INFINITY);
      if (activationDelta !== 0) return activationDelta;
      return left.userId - right.userId;
    });
  const styleUsageDrilldown = styleUsageEvents
    .map((item) => {
      const usedTimestamp = toTimestamp(item.usedAt);
      return {
        userId: item.userId,
        profileId: item.profileId,
        articleId: item.articleId,
        usageSource: item.usageSource,
        sampleCount: item.sampleCount,
        isMultiSample: item.sampleCount >= 3,
        isRecent30d: usedTimestamp != null && usedTimestamp >= nowTimestamp - STYLE_USAGE_WINDOW_DAYS * DAY_IN_MS,
        usedAt: item.usedAt,
      } satisfies Plan17BusinessStyleUsageDrilldownItem;
    })
    .sort((left, right) => {
      const recentDelta = Number(right.isRecent30d) - Number(left.isRecent30d);
      if (recentDelta !== 0) return recentDelta;
      const multiDelta = Number(right.isMultiSample) - Number(left.isMultiSample);
      if (multiDelta !== 0) return multiDelta;
      const usedAtDelta = (toTimestamp(right.usedAt) ?? Number.NEGATIVE_INFINITY) - (toTimestamp(left.usedAt) ?? Number.NEGATIVE_INFINITY);
      if (usedAtDelta !== 0) return usedAtDelta;
      return left.userId - right.userId;
    });
  const batchDrilldown = buildPlan17BusinessBatchDrilldownFromFacts({
    reviewedOutcomes: reviewedDeduped,
    generatedItems: input.generatedItems,
    articles: articlesDeduped,
  });

  return {
    generatedAt,
    authorLiftVsBaseline: {
      activatedAuthorCount: activationTimestamps.size,
      comparableAuthorCount: comparableAuthorLiftPairs.length,
      improvedAuthorCount: comparableAuthorLiftPairs.filter((item) => (item.liftPp ?? Number.NEGATIVE_INFINITY) >= 5).length,
      nonDegradedAuthorCount: comparableAuthorLiftPairs.filter((item) => (item.liftPp ?? Number.NEGATIVE_INFINITY) >= 0).length,
      averageLiftPp: roundMetric(
        comparableAuthorLiftPairs.length > 0
          ? comparableAuthorLiftPairs.reduce((sum, item) => sum + (item.liftPp ?? 0), 0) / comparableAuthorLiftPairs.length
          : null,
      ),
      medianLiftPp: roundMetric(
        median(comparableAuthorLiftPairs.map((item) => item.liftPp ?? 0)),
      ),
      baselineMedianHitRate: roundMetric(
        median(comparableAuthorLiftPairs.map((item) => (item.baselineHitRate ?? 0) * 100)),
      ),
      currentMedianHitRate: roundMetric(
        median(comparableAuthorLiftPairs.map((item) => (item.currentHitRate ?? 0) * 100)),
      ),
      minimumReviewedCountPerWindow: AUTHOR_BASELINE_MIN_REVIEWED_COUNT,
      windowDays: AUTHOR_BASELINE_WINDOW_DAYS,
    },
    fissionVsRadar: {
      fissionReviewedCount: fissionItems.length,
      fissionHitCount: fissionItems.filter((item) => item.hitStatus === "hit").length,
      fissionHitRate: roundMetric(fissionHitRate != null ? fissionHitRate * 100 : null),
      radarReviewedCount: radarItems.length,
      radarHitCount: radarItems.filter((item) => item.hitStatus === "hit").length,
      radarHitRate: roundMetric(radarHitRate != null ? radarHitRate * 100 : null),
      hitRateDeltaPp:
        fissionHitRate != null && radarHitRate != null ? roundMetric((fissionHitRate - radarHitRate) * 100) : null,
      fissionModeBreakdown,
    },
    matrixWeeklyOutput: {
      matrixAuthorCount: matrixActivationTimestamps.size,
      comparableAuthorCount: comparableMatrixPairs.length,
      qualityComparableAuthorCount: qualityComparableMatrixPairs.length,
      nonDegradedQualityAuthorCount: qualityComparableMatrixPairs.filter(
        (item) => (item.qualityDeltaPp ?? Number.NEGATIVE_INFINITY) >= 0,
      ).length,
      batchCount: new Set(
        input.generatedItems
          .map((item) => item.batchId)
          .filter((item): item is string => Boolean(item)),
      ).size,
      batchLinkedArticleCount: new Set(
        input.generatedItems
          .map((item) => item.generatedArticleId)
          .filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item > 0),
      ).size,
      weeklyOutputMedianBefore: roundMetric(median(comparableMatrixPairs.map((item) => item.beforeMedian ?? 0))),
      weeklyOutputMedianAfter: roundMetric(median(comparableMatrixPairs.map((item) => item.afterMedian ?? 0))),
      weeklyOutputGrowthPp: roundMetric(
        (() => {
          const beforeMedian = median(comparableMatrixPairs.map((item) => item.beforeMedian ?? 0));
          const afterMedian = median(comparableMatrixPairs.map((item) => item.afterMedian ?? 0));
          if (beforeMedian == null || beforeMedian <= 0 || afterMedian == null) {
            return null;
          }
          return ((afterMedian - beforeMedian) / beforeMedian) * 100;
        })(),
      ),
      hitRateMedianBefore: roundMetric(
        median(qualityComparableMatrixPairs.map((item) => (item.beforeHitRate ?? 0) * 100)),
      ),
      hitRateMedianAfter: roundMetric(
        median(qualityComparableMatrixPairs.map((item) => (item.afterHitRate ?? 0) * 100)),
      ),
      observedQualityDeltaPp: roundMetric(
        (() => {
          const beforeMedian = median(qualityComparableMatrixPairs.map((item) => (item.beforeHitRate ?? 0) * 100));
          const afterMedian = median(qualityComparableMatrixPairs.map((item) => (item.afterHitRate ?? 0) * 100));
          if (beforeMedian == null || afterMedian == null) {
            return null;
          }
          return afterMedian - beforeMedian;
        })(),
      ),
      windowWeeks: MATRIX_WINDOW_WEEKS,
    },
    styleHeatmapUsage: {
      totalUsageEventCount: styleUsageEvents.length,
      multiSampleUsageEventCount: multiSampleUsageEvents.length,
      multiSampleUsageShare: roundMetric(
        styleUsageEvents.length > 0 ? (multiSampleUsageEvents.length / styleUsageEvents.length) * 100 : null,
      ),
      recent30dUsageEventCount: recentStyleUsageEvents.length,
      recent30dMultiSampleUsageEventCount: recentMultiSampleUsageEvents.length,
      recent30dMultiSampleUsageShare: roundMetric(
        recentStyleUsageEvents.length > 0 ? (recentMultiSampleUsageEvents.length / recentStyleUsageEvents.length) * 100 : null,
      ),
      profileCount: new Set(styleUsageEvents.map((item) => `${item.userId}@@${item.profileId ?? "none"}`)).size,
      recent30dProfileCount: new Set(recentStyleUsageEvents.map((item) => `${item.userId}@@${item.profileId ?? "none"}`)).size,
      authorCount: new Set(styleUsageEvents.map((item) => item.userId)).size,
      recent30dAuthorCount: new Set(recentStyleUsageEvents.map((item) => item.userId)).size,
    },
    batchDrilldown,
    authorLiftDrilldown,
    matrixAuthorDrilldown,
    styleUsageDrilldown,
    fissionVsRadarDrilldown,
  };
}

async function getPlan17BusinessFacts(): Promise<Plan17BusinessFacts> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [reviewedOutcomeRows, generatedItemRows, articleRows, styleUsageRows] = await Promise.all([
    db.query<{
      user_id: number;
      article_id: number;
      hit_status: string;
      attribution_json: string | Record<string, unknown> | null;
      article_created_at: string | null;
    }>(
      `SELECT ao.user_id,
              ao.article_id AS article_id,
              ao.hit_status,
              ao.attribution_json,
              a.created_at AS article_created_at
       FROM article_outcomes ao
       INNER JOIN article_outcome_snapshots snap
         ON snap.article_id = ao.article_id
        AND snap.user_id = ao.user_id
        AND snap.window_code = ?
       LEFT JOIN articles a
         ON a.id = ao.article_id
        AND a.user_id = ao.user_id
       WHERE ao.hit_status IN ('hit', 'near_miss', 'miss')
       ORDER BY ao.updated_at DESC, ao.id DESC`,
      ["7d"],
    ),
    db.query<{
      user_id: number;
      generated_article_id: number | null;
      generated_batch_id: string | null;
      backlog_id: number | null;
      generated_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT user_id,
              generated_article_id,
              generated_batch_id,
              backlog_id,
              generated_at,
              updated_at
       FROM topic_backlog_items
       WHERE generated_article_id IS NOT NULL OR generated_batch_id IS NOT NULL
       ORDER BY updated_at DESC, id DESC`,
    ),
    db.query<{
      id: number;
      user_id: number;
      created_at: string | null;
      series_id: number | null;
    }>(
      `SELECT id, user_id, created_at, series_id
       FROM articles
       ORDER BY created_at DESC, id DESC`,
    ),
    db.query<{
      user_id: number | null;
      target_id: string | null;
      payload_json: string | Record<string, unknown> | null;
      created_at: string | null;
    }>(
      `SELECT user_id, target_id, payload_json, created_at
       FROM audit_logs
       WHERE action = ? AND target_type = ?
       ORDER BY created_at DESC, id DESC`,
      ["writing_style_profile_used_in_authoring", "writing_style_profile"],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    reviewedOutcomes: reviewedOutcomeRows
      .filter(
        (row): row is typeof row & { hit_status: "hit" | "near_miss" | "miss" } =>
          row.hit_status === "hit" || row.hit_status === "near_miss" || row.hit_status === "miss",
      )
      .map((row) => {
        const attribution = parseJsonObject(row.attribution_json);
        const topic =
          attribution && typeof attribution.topic === "object" && !Array.isArray(attribution.topic)
            ? (attribution.topic as Record<string, unknown>)
            : null;
        return {
          userId: row.user_id,
          articleId: row.article_id,
          articleCreatedAt: row.article_created_at,
          hitStatus: row.hit_status,
          topicSource: typeof topic?.source === "string" ? topic.source : null,
          topicFissionMode: typeof topic?.fissionMode === "string" ? topic.fissionMode : null,
        } satisfies Plan17BusinessReviewedOutcomeFact;
      }),
    generatedItems: generatedItemRows.map((row) => ({
      userId: row.user_id,
      generatedArticleId: row.generated_article_id,
      batchId: row.generated_batch_id,
      backlogId: row.backlog_id,
      generatedAt: row.generated_at,
      updatedAt: row.updated_at,
    })),
    articles: articleRows.map((row) => ({
      articleId: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      seriesId: row.series_id,
    })),
    styleUsageEvents: styleUsageRows
      .filter((row): row is typeof row & { user_id: number } => typeof row.user_id === "number" && row.user_id > 0)
      .map((row) => {
      const payload = parseJsonObject(row.payload_json);
      const profileId = Number(row.target_id ?? payload?.profileId ?? 0);
        return {
          userId: row.user_id,
          profileId: Number.isInteger(profileId) && profileId > 0 ? profileId : null,
          articleId: Number.isInteger(Number(payload?.articleId || 0)) && Number(payload?.articleId || 0) > 0 ? Number(payload?.articleId || 0) : null,
          usageSource: typeof payload?.usageSource === "string" ? payload.usageSource : null,
          sampleCount: Math.max(Number(payload?.sampleCount || 0), 0),
          usedAt: typeof payload?.usedAt === "string" ? payload.usedAt : row.created_at,
          usageToken: typeof payload?.usageToken === "string" ? payload.usageToken : null,
        } satisfies Plan17BusinessStyleUsageFact;
      }),
  };
}

export async function getPlan17BusinessReport(): Promise<Plan17BusinessReport> {
  return buildPlan17BusinessReportFromFacts(await getPlan17BusinessFacts());
}
