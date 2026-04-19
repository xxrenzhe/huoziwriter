import Link from "next/link";
import type { ReactNode } from "react";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { getWritingEvalRolloutAuditLogs } from "@/lib/audit";
import {
  buildAdminPromptVersionHref,
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
  buildAdminWritingEvalVersionsHref,
} from "@/lib/admin-writing-eval-links";
import { normalizeWritingEvalRolloutAuditLogs } from "@/lib/admin-writing-eval-rollout-audits";
import { requireAdminSession } from "@/lib/page-auth";
import { formatWritingEvalDateTime, formatWritingEvalMetric, getRecentDateBuckets } from "@/lib/writing-eval-format";
import { buildWritingEvalInsightsRiskLedger, getWritingEvalInsights, getWritingEvalScoringProfiles } from "@/lib/writing-eval";
import { AdminWritingEvalRiskBatchActions } from "@/components/admin-writing-eval-risk-batch-actions";
import { AdminWritingEvalInsightsClient } from "@/components/admin-writing-eval-insights-client";
import { AdminWritingEvalRiskActionButton } from "@/components/admin-writing-eval-risk-action-button";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";

type TrendPoint = {
  runId: number;
  runCode: string;
  createdAt: string;
  qualityScore: number;
  viralScore: number;
  totalScore: number;
  deltaTotalScore: number;
  failedCaseCount: number;
};

type ReasonInsightItem = {
  label: string;
  count: number;
  runId: number;
  resultId: number;
  datasetId: number;
  caseId: number;
  taskCode: string;
};

type AutoRolloutTrendPoint = {
  createdAt: string;
  direction: string;
  riskLevel: string;
};

type ExecutionStageSummary = {
  stageKey: string;
  stageLabel: string;
  jobCount: number;
  failedJobCount: number;
  retryCount: number;
  averageDurationSeconds: number | null;
};

type ExecutionWindowSummary = {
  jobCount: number;
  failedJobCount: number;
  runningJobCount: number;
  queuedJobCount: number;
  retryCount: number;
  averageDurationSeconds: number | null;
  stageBreakdown: ExecutionStageSummary[];
};

type ExecutionWeeklyBucket = {
  label: string;
  jobCount: number;
  failedJobCount: number;
  retryCount: number;
  averageDurationSeconds: number | null;
  generationFailedCount: number;
  scoringFailedCount: number;
  promotionFailedCount: number;
};

type ExecutionRecentFailure = {
  jobId: number;
  runId: number | null;
  runCode: string | null;
  stageKey: string;
  stageLabel: string;
  failedAt: string;
  queuedAt: string;
  durationSeconds: number | null;
  lastError: string | null;
};

type ExecutionRecentRetry = {
  id: number;
  runId: number | null;
  runCode: string | null;
  username: string | null;
  createdAt: string;
  retriedAt: string;
};

const adminInsightsPanelBaseClassName = cn(
  surfaceCardStyles(),
  "border-stone-800 bg-[#171718] shadow-none",
);
const adminInsightsHeroClassName = cn(adminInsightsPanelBaseClassName, "p-6");
const adminInsightsSectionClassName = cn(adminInsightsPanelBaseClassName, "p-5");
const adminInsightsInsetCardClassName = cn(
  surfaceCardStyles(),
  "border-stone-800 bg-stone-950 px-4 py-4 shadow-none",
);
const adminInsightsSubcardClassName = cn(
  surfaceCardStyles(),
  "border-stone-800 bg-[#141414] px-4 py-4 shadow-none",
);
const adminInsightsSubcardCompactClassName = cn(
  surfaceCardStyles(),
  "border-stone-800 bg-[#141414] px-4 py-3 shadow-none",
);
const adminInsightsMutedNoticeClassName = cn(
  surfaceCardStyles(),
  "rounded border-stone-800 bg-[#141414] px-4 py-3 text-xs leading-6 text-stone-500 shadow-none",
);
const adminInsightsBadgeClassName = "border border-stone-700 px-2 py-1 text-xs";
const adminInsightsWideBadgeClassName = "border border-stone-700 px-3 py-1 text-xs";
const adminInsightsDesktopTableShellClassName = "mt-4 hidden overflow-x-auto md:block";
const adminInsightsMobileListClassName = "mt-4 grid gap-3 md:hidden";
const adminInsightsMobileTableCardClassName = cn(adminInsightsSubcardCompactClassName, "space-y-3");
const adminInsightsMobileMetricGridClassName = "grid gap-2 sm:grid-cols-2";

const DAY_MS = 24 * 60 * 60 * 1000;

function getRiskTone(value: string) {
  if (value === "emerald") return "text-emerald-400";
  if (value === "cinnabar") return "text-cinnabar";
  if (value === "amber") return "text-amber-300";
  return "text-stone-400";
}

function averageValue(points: TrendPoint[], key: "qualityScore" | "viralScore" | "totalScore") {
  if (points.length === 0) return null;
  return points.reduce((sum, item) => sum + item[key], 0) / points.length;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const safe = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (safe.length === 0) return null;
  return safe.reduce((sum, item) => sum + item, 0) / safe.length;
}

function getWindowRange(days: number, offsetDays = 0, now = new Date()) {
  const anchor = new Date(now);
  anchor.setHours(0, 0, 0, 0);
  const endMs = anchor.getTime() - offsetDays * DAY_MS + DAY_MS;
  const startMs = endMs - days * DAY_MS;
  return { startMs, endMs };
}

function isWithinWindow(value: string, startMs: number, endMs: number) {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && ts >= startMs && ts < endMs;
}

function buildTrendWindowSummary(points: TrendPoint[], days: number, offsetDays = 0, now = new Date()) {
  const { startMs, endMs } = getWindowRange(days, offsetDays, now);
  const items = points.filter((item) => isWithinWindow(item.createdAt, startMs, endMs));
  return {
    runCount: items.length,
    averageQualityScore: averageNumbers(items.map((item) => item.qualityScore)),
    averageViralScore: averageNumbers(items.map((item) => item.viralScore)),
    averageTotalScore: averageNumbers(items.map((item) => item.totalScore)),
    averageFailedCaseCount: averageNumbers(items.map((item) => item.failedCaseCount)),
    averageDeltaTotalScore: averageNumbers(items.map((item) => item.deltaTotalScore)),
    positiveDeltaCount: items.filter((item) => item.deltaTotalScore > 0).length,
    regressionCount: items.filter((item) => item.deltaTotalScore < 0).length,
  };
}

function buildAutoRolloutWindowSummary(items: AutoRolloutTrendPoint[], days: number, offsetDays = 0, now = new Date()) {
  const { startMs, endMs } = getWindowRange(days, offsetDays, now);
  const windowItems = items.filter((item) => isWithinWindow(item.createdAt, startMs, endMs));
  return {
    totalCount: windowItems.length,
    expandCount: windowItems.filter((item) => item.direction === "expand").length,
    shrinkCount: windowItems.filter((item) => item.direction === "shrink").length,
    highRiskCount: windowItems.filter((item) => item.riskLevel === "cinnabar").length,
  };
}

function buildWeeklyOpsBuckets(trend: TrendPoint[], autoRolloutTrend: AutoRolloutTrendPoint[], weeks = 6, now = new Date()) {
  return Array.from({ length: weeks }, (_, index) => {
    const offsetDays = (weeks - index - 1) * 7;
    const { startMs, endMs } = getWindowRange(7, offsetDays, now);
    const trendItems = trend.filter((item) => isWithinWindow(item.createdAt, startMs, endMs));
    const rolloutItems = autoRolloutTrend.filter((item) => isWithinWindow(item.createdAt, startMs, endMs));
    const startKey = new Date(startMs).toISOString().slice(5, 10);
    const endKey = new Date(endMs - 1).toISOString().slice(5, 10);
    return {
      label: `${startKey} - ${endKey}`,
      runCount: trendItems.length,
      averageTotalScore: averageNumbers(trendItems.map((item) => item.totalScore)),
      averageFailedCaseCount: averageNumbers(trendItems.map((item) => item.failedCaseCount)),
      improvementRate:
        trendItems.length > 0 ? trendItems.filter((item) => item.deltaTotalScore > 0).length / trendItems.length : null,
      regressionRate:
        trendItems.length > 0 ? trendItems.filter((item) => item.deltaTotalScore < 0).length / trendItems.length : null,
      rolloutCount: rolloutItems.length,
      shrinkCount: rolloutItems.filter((item) => item.direction === "shrink").length,
      highRiskCount: rolloutItems.filter((item) => item.riskLevel === "cinnabar").length,
    };
  });
}

function getDeltaTone(value: number | null, smallerIsBetter = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) < 0.01) return "text-amber-300";
  const isGood = smallerIsBetter ? value < 0 : value > 0;
  return isGood ? "text-emerald-400" : "text-cinnabar";
}

function formatSignedMetric(value: number | null, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatDurationHours(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (value < 60) return `${value.toFixed(0)} 秒`;
  if (value < 3600) return `${(value / 60).toFixed(1)} 分`;
  return `${(value / 3600).toFixed(1)} 小时`;
}

function getRiskPanelTone(value: "cinnabar" | "amber") {
  return value === "cinnabar" ? "text-cinnabar" : "text-amber-300";
}

function buildPromptHref(assetType: string, assetRef: string) {
  return assetType === "prompt_version" ? buildAdminPromptVersionHref(assetRef) : null;
}

function AdminInsightsMobileMetricGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: ReactNode;
    tone?: string;
  }>;
}) {
  return (
    <div className={adminInsightsMobileMetricGridClassName}>
      {items.map((item) => (
        <div key={item.label} className="rounded border border-stone-800 bg-[#101012] px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
          <div className={cn("mt-2 text-sm", item.tone || "text-stone-200")}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminWritingEvalInsightsPage() {
  await requireAdminSession();
  const [insights, scoringProfiles, rolloutAudits] = await Promise.all([
    getWritingEvalInsights(60),
    getWritingEvalScoringProfiles(),
    getWritingEvalRolloutAuditLogs(180),
  ]);
  const { combinedRolloutAuditLogs } = rolloutAudits;
  const onlineCalibration = insights.onlineCalibration;
  const strategyRecommendations = insights.strategyRecommendations;
  const executionInsights = insights.executionInsights as {
    currentWindow: ExecutionWindowSummary;
    previousWindow: ExecutionWindowSummary;
    weeklyBuckets: ExecutionWeeklyBucket[];
    recentFailures: ExecutionRecentFailure[];
    recentRetries: ExecutionRecentRetry[];
  };
  const trend = insights.trend as TrendPoint[];
  const displayTrend = trend.slice(-24);
  const latestTrend = trend[trend.length - 1] ?? null;
  const latestTrendRunHref = latestTrend ? buildAdminWritingEvalRunsHref({ runId: latestTrend.runId }) : null;
  const autoRolloutTrend = normalizeWritingEvalRolloutAuditLogs(combinedRolloutAuditLogs).map((item) => ({
    ...item,
    assetType: item.assetType || "asset",
    assetRef: item.assetRef || "--",
    reason: item.reason || "无原因",
  }));
  const currentTrendWindow = buildTrendWindowSummary(trend, 7);
  const previousTrendWindow = buildTrendWindowSummary(trend, 7, 7);
  const currentAutoWindow = buildAutoRolloutWindowSummary(autoRolloutTrend, 7);
  const previousAutoWindow = buildAutoRolloutWindowSummary(autoRolloutTrend, 7, 7);
  const weeklyOpsBuckets = buildWeeklyOpsBuckets(trend, autoRolloutTrend, 6);
  const recentAutoRolloutTrend = autoRolloutTrend.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const autoExpandCount = recentAutoRolloutTrend.filter((item) => item.direction === "expand").length;
  const autoShrinkCount = recentAutoRolloutTrend.filter((item) => item.direction === "shrink").length;
  const autoHighRiskCount = recentAutoRolloutTrend.filter((item) => item.riskLevel === "cinnabar").length;
  const topRegressionReason = insights.topRegressionReasons[0] as ReasonInsightItem | undefined;
  const topImprovementReason = insights.topImprovementReasons[0] as ReasonInsightItem | undefined;
  const primaryStrategyRecommendation = strategyRecommendations[0] ?? null;
  const riskLedger = buildWritingEvalInsightsRiskLedger({
    insights,
    combinedRolloutAuditLogs,
    recentWindowDays: 7,
    maxItems: 12,
  });
  const riskLedgerItems = riskLedger.items.map((item) => {
    const href =
      item.runId
        ? buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId ?? undefined })
        : item.assetType && item.assetRef
          ? buildAdminWritingEvalVersionsHref({ assetType: item.assetType, assetRef: item.assetRef })
          : null;
    const hrefLabel =
      item.runId ? "打开对应 Run" : item.assetType && item.assetRef ? "打开对应版本" : null;
    const secondaryHref =
      item.datasetId
        ? buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId ?? undefined })
        : item.assetType && item.assetRef
          ? buildPromptHref(item.assetType, item.assetRef)
          : null;
    const secondaryHrefLabel =
      item.datasetId ? "打开评测样本" : secondaryHref ? "打开 Prompt" : null;
    return {
      ...item,
      href,
      hrefLabel,
      secondaryHref,
      secondaryHrefLabel,
    };
  });
  const riskSourceBreakdown = riskLedger.sourceBreakdown.map((item) => ({
    label: item.label,
    value: item.value,
    tone: item.tone === "cinnabar" ? "text-cinnabar" : "text-amber-300",
  }));
  const recommendedBatchActions = riskLedgerItems
    .map((item) => (item.tone === "cinnabar" ? item.recommendedAction : null))
    .filter((item): item is NonNullable<(typeof riskLedgerItems)[number]["recommendedAction"]> => Boolean(item));
  const riskSummaryCards = [
    {
      label: "当前风险事项",
      value: riskLedger.totalCount,
      tone: "text-stone-100",
      note: `${riskLedger.highPriorityCount} 个高优先级`,
    },
    {
      label: "执行失败",
      value: riskLedger.summary.failedJobCount,
      tone: "text-cinnabar",
      note: `${riskLedger.summary.retryCount} 次人工重试`,
    },
    {
      label: "高风险放量",
      value: riskLedger.summary.highRiskRolloutCount,
      tone: "text-amber-300",
      note: `${riskLedger.summary.shrinkActionCount} 次收缩动作`,
    },
    {
      label: "线上误判样本",
      value: riskLedger.summary.falsePositiveCount,
      tone: "text-amber-300",
      note: `${riskLedger.summary.linkedFeedbackCount} 条已绑定回流`,
    },
  ];
  const executionKpis = [
    {
      label: "近 7 天 stage job",
      current: executionInsights.currentWindow.jobCount,
      previous: executionInsights.previousWindow.jobCount,
      delta: executionInsights.currentWindow.jobCount - executionInsights.previousWindow.jobCount,
      smallerIsBetter: false,
      note: `${executionInsights.currentWindow.runningJobCount} 运行中 · ${executionInsights.currentWindow.queuedJobCount} 排队中`,
    },
    {
      label: "近 7 天失败 job",
      current: executionInsights.currentWindow.failedJobCount,
      previous: executionInsights.previousWindow.failedJobCount,
      delta: executionInsights.currentWindow.failedJobCount - executionInsights.previousWindow.failedJobCount,
      smallerIsBetter: true,
      note: `${executionInsights.currentWindow.retryCount} 次人工重试`,
    },
    {
      label: "近 7 天平均阶段耗时",
      current: executionInsights.currentWindow.averageDurationSeconds,
      previous: executionInsights.previousWindow.averageDurationSeconds,
      delta:
        typeof executionInsights.currentWindow.averageDurationSeconds === "number"
        && typeof executionInsights.previousWindow.averageDurationSeconds === "number"
          ? executionInsights.currentWindow.averageDurationSeconds - executionInsights.previousWindow.averageDurationSeconds
          : null,
      smallerIsBetter: true,
      note: "按 job 实际执行时长聚合",
      format: "duration" as const,
    },
    {
      label: "近 7 天人工 retry",
      current: executionInsights.currentWindow.retryCount,
      previous: executionInsights.previousWindow.retryCount,
      delta: executionInsights.currentWindow.retryCount - executionInsights.previousWindow.retryCount,
      smallerIsBetter: true,
      note: "来自 writing_eval_retry 审计",
    },
  ];
  const stageCards = executionInsights.currentWindow.stageBreakdown.map((item) => {
    const previous = executionInsights.previousWindow.stageBreakdown.find((stage) => stage.stageKey === item.stageKey);
    const failedDelta = item.failedJobCount - (previous?.failedJobCount ?? 0);
    return {
      ...item,
      previousFailedJobCount: previous?.failedJobCount ?? 0,
      failedDelta,
    };
  });
  const operationsKpis = [
    {
      label: "近 7 天平均总分",
      current: currentTrendWindow.averageTotalScore,
      previous: previousTrendWindow.averageTotalScore,
      delta:
        typeof currentTrendWindow.averageTotalScore === "number" && typeof previousTrendWindow.averageTotalScore === "number"
          ? currentTrendWindow.averageTotalScore - previousTrendWindow.averageTotalScore
          : null,
      smallerIsBetter: false,
      digits: 2,
      note: `${currentTrendWindow.runCount} 次运行`,
    },
    {
      label: "近 7 天平均失败样本",
      current: currentTrendWindow.averageFailedCaseCount,
      previous: previousTrendWindow.averageFailedCaseCount,
      delta:
        typeof currentTrendWindow.averageFailedCaseCount === "number" && typeof previousTrendWindow.averageFailedCaseCount === "number"
          ? currentTrendWindow.averageFailedCaseCount - previousTrendWindow.averageFailedCaseCount
          : null,
      smallerIsBetter: true,
      digits: 1,
      note: `${currentTrendWindow.regressionCount} 次回归 run`,
    },
    {
      label: "近 7 天自动收缩",
      current: currentAutoWindow.shrinkCount,
      previous: previousAutoWindow.shrinkCount,
      delta: currentAutoWindow.shrinkCount - previousAutoWindow.shrinkCount,
      smallerIsBetter: true,
      digits: 0,
      note: `${currentAutoWindow.totalCount} 次自动动作`,
    },
    {
      label: "近 7 天高风险动作",
      current: currentAutoWindow.highRiskCount,
      previous: previousAutoWindow.highRiskCount,
      delta: currentAutoWindow.highRiskCount - previousAutoWindow.highRiskCount,
      smallerIsBetter: true,
      digits: 0,
      note: `${currentAutoWindow.expandCount} 次扩量`,
    },
  ];
  const operationsHighlights = [
    {
      title: "质量走向",
      tone: getDeltaTone(
        typeof currentTrendWindow.averageTotalScore === "number" && typeof previousTrendWindow.averageTotalScore === "number"
          ? currentTrendWindow.averageTotalScore - previousTrendWindow.averageTotalScore
          : null,
      ),
      summary:
        currentTrendWindow.runCount > 0
          ? `近 7 天均分 ${formatWritingEvalMetric(currentTrendWindow.averageTotalScore)}，相较前 7 天 ${formatSignedMetric(
              typeof currentTrendWindow.averageTotalScore === "number" && typeof previousTrendWindow.averageTotalScore === "number"
                ? currentTrendWindow.averageTotalScore - previousTrendWindow.averageTotalScore
                : null,
            )}。`
          : "近 7 天还没有足够的 run 数据。",
      detail:
        currentTrendWindow.runCount > 0
          ? `本窗口内 ${currentTrendWindow.positiveDeltaCount} 次 run 提分、${currentTrendWindow.regressionCount} 次 run 回归。`
          : "建议先保证调度持续产出 run，再观察趋势。",
    },
    {
      title: "回归焦点",
      tone: getDeltaTone(
        typeof currentTrendWindow.averageFailedCaseCount === "number" && typeof previousTrendWindow.averageFailedCaseCount === "number"
          ? currentTrendWindow.averageFailedCaseCount - previousTrendWindow.averageFailedCaseCount
          : null,
        true,
      ),
      summary: topRegressionReason
        ? `当前最常见退化信号是“${topRegressionReason.label}”，近窗口失败样本均值 ${formatWritingEvalMetric(currentTrendWindow.averageFailedCaseCount, 1)}。`
        : "最近窗口还没有稳定的退化模式。",
      detail: insights.failingCases[0]
        ? `代表失败样本 ${insights.failingCases[0].taskCode}，问题为“${insights.failingCases[0].reason}”。`
        : "最近窗口没有新增失败样本。",
    },
    {
      title: "提分抓手",
      tone: "text-emerald-400",
      summary: topImprovementReason
        ? `当前最稳定的提分原因是“${topImprovementReason.label}”。`
        : "暂时还没有稳定的提分模式沉淀。",
      detail: topImprovementReason
        ? `优先复用这类改写策略，减少在同一批 case 上重复试错。`
        : "建议先增加候选试验密度，形成可复用的提分模式。",
    },
    {
      title: "运营动作",
      tone: getDeltaTone(currentAutoWindow.highRiskCount - previousAutoWindow.highRiskCount, true),
      summary: primaryStrategyRecommendation
        ? primaryStrategyRecommendation.recommendation
        : "当前没有额外的 agentStrategy 调度建议。",
      detail: primaryStrategyRecommendation
        ? `建议聚焦 ${primaryStrategyRecommendation.label}，紧急度 ${(primaryStrategyRecommendation.urgencyScore * 100).toFixed(0)}%，置信度 ${(primaryStrategyRecommendation.confidence * 100).toFixed(0)}%。`
        : `近 7 天自动收缩 ${currentAutoWindow.shrinkCount} 次，高风险动作 ${currentAutoWindow.highRiskCount} 次。`,
    },
  ];
  const autoRolloutDailyBuckets = getRecentDateBuckets(7).map((dateKey) => {
    const items = recentAutoRolloutTrend.filter((item) => item.createdAt.slice(0, 10) === dateKey);
    return {
      dateKey,
      total: items.length,
      expandCount: items.filter((item) => item.direction === "expand").length,
      shrinkCount: items.filter((item) => item.direction === "shrink").length,
      highRiskCount: items.filter((item) => item.riskLevel === "cinnabar").length,
    };
  });
  const maxDailyAutoRolloutCount = Math.max(1, ...autoRolloutDailyBuckets.map((item) => item.total));
  const autoRolloutAssetLeaders = Array.from(
    recentAutoRolloutTrend.reduce((map, item) => {
      const key = `${item.assetType}@@${item.assetRef}`;
      const current =
        map.get(key) ?? {
          assetType: item.assetType,
          assetRef: item.assetRef,
          totalActions: 0,
          expandCount: 0,
          shrinkCount: 0,
          highRiskCount: 0,
          latestRiskLevel: item.riskLevel,
          latestReason: item.reason,
          latestAt: item.createdAt,
        };
      current.totalActions += 1;
      if (item.direction === "expand") current.expandCount += 1;
      if (item.direction === "shrink") current.shrinkCount += 1;
      if (item.riskLevel === "cinnabar") current.highRiskCount += 1;
      if (new Date(item.createdAt).getTime() >= new Date(current.latestAt).getTime()) {
        current.latestRiskLevel = item.riskLevel;
        current.latestReason = item.reason;
        current.latestAt = item.createdAt;
      }
      map.set(key, current);
      return map;
    }, new Map<string, {
      assetType: string;
      assetRef: string;
      totalActions: number;
      expandCount: number;
      shrinkCount: number;
      highRiskCount: number;
      latestRiskLevel: string;
      latestReason: string;
      latestAt: string;
    }>()),
  )
    .map(([, value]) => value)
    .sort((left, right) => {
      if (right.shrinkCount !== left.shrinkCount) return right.shrinkCount - left.shrinkCount;
      if (right.totalActions !== left.totalActions) return right.totalActions - left.totalActions;
      return new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime();
    });

  return (
    <div className="space-y-6">
      <section className={adminInsightsHeroClassName}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Insights</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100 text-balance">长期趋势与退化原因</h1>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "runs"]} className="flex gap-3" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className={cn(adminInsightsSectionClassName, "xl:col-span-3")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">风险台账</div>
              <div className="mt-2 text-sm leading-7 text-stone-500">
                把执行失败、高风险 rollout、线上误判和失败样本拉成统一风险视图，减少运营在 Runs / Versions / Insights 多处来回跳转排查。
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="text-sm text-stone-500">risk ledger</div>
              {recommendedBatchActions.length > 0 ? <AdminWritingEvalRiskBatchActions actions={recommendedBatchActions} /> : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {riskSummaryCards.map((item) => (
              <div key={item.label} className={adminInsightsInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                <div className="mt-2 text-xs text-stone-500">{item.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <section className={adminInsightsInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">风险来源分布</div>
              <div className="mt-4 space-y-3">
                {riskSourceBreakdown.map((item) => (
                  <div key={item.label} className={adminInsightsSubcardCompactClassName}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-stone-300">{item.label}</div>
                      <div className={`text-lg ${item.tone}`}>{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className={cn("mt-4", adminInsightsMutedNoticeClassName)}>
                红色优先处理执行失败和高风险放量；黄色优先用于校准和样本侧复盘，避免风险长期沉淀成误判或重复 retry。
              </div>
            </section>

            <section className={adminInsightsInsetCardClassName}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">统一风险列表</div>
                  <div className="mt-2 text-sm leading-7 text-stone-500">
                    按优先级和最近发生时间拉平，先处理 `cinnabar`，再处理校准与失败样本类风险。
                  </div>
                </div>
                <div className="text-xs text-stone-500">Top {riskLedgerItems.length}</div>
              </div>
              <div className="mt-4 space-y-3">
                {riskLedgerItems.map((item) => (
                  <article key={item.key} className={adminInsightsSubcardClassName}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className={`text-xs uppercase tracking-[0.16em] ${getRiskPanelTone(item.tone)}`}>{item.source}</div>
                        <div className="mt-2 text-sm text-stone-100">{item.title}</div>
                      </div>
                      <div className={`text-xs uppercase tracking-[0.16em] ${getRiskPanelTone(item.tone)}`}>{item.tone}</div>
                    </div>
                    <div className={`mt-3 text-sm leading-7 ${getRiskPanelTone(item.tone)}`}>{item.detail}</div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">{item.meta}</div>
                    {item.href || item.secondaryHref || item.recommendedAction ? (
                      <div className="mt-3 flex flex-wrap items-start gap-3">
                        {item.href ? (
                          <Link href={item.href} className={uiPrimitives.adminSecondaryButton}>
                            {item.hrefLabel || "打开详情"}
                          </Link>
                        ) : null}
                        {item.secondaryHref ? (
                          <Link href={item.secondaryHref} className={uiPrimitives.adminSecondaryButton}>
                            {item.secondaryHrefLabel || "打开关联对象"}
                          </Link>
                        ) : null}
                        {item.recommendedAction ? <AdminWritingEvalRiskActionButton action={item.recommendedAction} /> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
                {riskLedgerItems.length === 0 ? <div className="text-sm text-stone-500">当前没有需要重点关注的风险事项。</div> : null}
              </div>
            </section>
          </div>
        </div>

        <div className={cn(adminInsightsSectionClassName, "xl:col-span-3")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">执行监控</div>
              <div className="mt-2 text-sm leading-7 text-stone-500">
                这里聚合所有 `writingEvalRun / writingEvalScore / writingEvalPromote` stage job，直接看跨 run 的失败趋势、重试压力和阶段耗时，不再只靠单条 run 详情排查。
              </div>
            </div>
            <div className="text-sm text-stone-500">cross-run stage jobs</div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {executionKpis.map((item) => (
              <div key={item.label} className={adminInsightsInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                <div className="mt-3 text-2xl text-stone-100">
                  {item.format === "duration"
                    ? formatDurationHours(typeof item.current === "number" ? item.current : null)
                    : item.current}
                </div>
                <div className="mt-2 text-xs text-stone-500">
                  前 7 天{" "}
                  {item.format === "duration"
                    ? formatDurationHours(typeof item.previous === "number" ? item.previous : null)
                    : item.previous}
                </div>
                <div className={`mt-3 text-sm ${getDeltaTone(item.delta, item.smallerIsBetter)}`}>
                  Delta {item.format === "duration" ? formatDurationHours(item.delta) : formatSignedMetric(item.delta, 0)}
                </div>
                <div className="mt-2 text-xs text-stone-500">{item.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className={adminInsightsInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">6 周 stage job 趋势</div>
              <div className="mt-2 text-sm leading-7 text-stone-500">
                看 job 总量、失败数、retry 和三段阶段的失败分布，判断问题主要卡在生成、评分还是决议。
              </div>
              <div className={adminInsightsDesktopTableShellClassName}>
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="text-stone-500">
                    <tr>
                      {["窗口", "Job 数", "失败", "Retry", "均耗时", "生成失败", "评分失败", "决议失败"].map((head) => (
                        <th key={head} className="pb-4 font-medium">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {executionInsights.weeklyBuckets.map((item) => (
                      <tr key={item.label} className="border-t border-stone-800">
                        <td className="py-4 text-stone-300">{item.label}</td>
                        <td className="py-4 text-stone-100">{item.jobCount}</td>
                        <td className="py-4 text-cinnabar">{item.failedJobCount}</td>
                        <td className="py-4 text-amber-300">{item.retryCount}</td>
                        <td className="py-4 text-stone-400">{formatDurationHours(item.averageDurationSeconds)}</td>
                        <td className="py-4 text-stone-400">{item.generationFailedCount}</td>
                        <td className="py-4 text-stone-400">{item.scoringFailedCount}</td>
                        <td className="py-4 text-stone-400">{item.promotionFailedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={adminInsightsMobileListClassName}>
                {executionInsights.weeklyBuckets.map((item) => (
                  <article key={`mobile-${item.label}`} className={adminInsightsMobileTableCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-mono text-xs text-stone-300">{item.label}</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={cn(adminInsightsBadgeClassName, "text-cinnabar")}>失败 {item.failedJobCount}</span>
                        <span className={cn(adminInsightsBadgeClassName, "text-amber-300")}>Retry {item.retryCount}</span>
                      </div>
                    </div>
                    <AdminInsightsMobileMetricGrid
                      items={[
                        { label: "Job 数", value: item.jobCount },
                        { label: "均耗时", value: formatDurationHours(item.averageDurationSeconds), tone: "text-stone-400" },
                        { label: "生成失败", value: item.generationFailedCount, tone: "text-stone-400" },
                        { label: "评分失败", value: item.scoringFailedCount, tone: "text-stone-400" },
                        { label: "决议失败", value: item.promotionFailedCount, tone: "text-stone-400" },
                      ]}
                    />
                  </article>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              {stageCards.map((item) => (
                <article key={item.stageKey} className={adminInsightsInsetCardClassName}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm uppercase tracking-[0.18em] text-stone-500">{item.stageLabel}</div>
                      <div className="mt-2 text-xl text-stone-100">{item.jobCount} 个 job</div>
                    </div>
                    <div className={`text-sm ${getDeltaTone(item.failedDelta, true)}`}>
                      失败 {item.failedJobCount}
                      <div className="mt-1 text-xs text-stone-500">前 7 天 {item.previousFailedJobCount}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={cn(adminInsightsBadgeClassName, "text-cinnabar")}>失败 {item.failedJobCount}</span>
                    <span className={cn(adminInsightsBadgeClassName, "text-amber-300")}>内部重试 {item.retryCount}</span>
                    <span className={cn(adminInsightsBadgeClassName, "text-stone-400")}>
                      均耗时 {formatDurationHours(item.averageDurationSeconds)}
                    </span>
                  </div>
                </article>
              ))}
            </section>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <section className={adminInsightsInsetCardClassName}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近失败 stage job</div>
                  <div className="mt-2 text-sm leading-7 text-stone-500">
                    优先拉出最近失败的生成 / 评分 / 决议任务，快速定位当前最值得排查的 run。
                  </div>
                </div>
                <div className="text-xs text-stone-500">Top {executionInsights.recentFailures.length}</div>
              </div>
              <div className="mt-4 space-y-3">
                {executionInsights.recentFailures.map((item) => (
                  <article key={`failed-job-${item.jobId}`} className={adminInsightsSubcardCompactClassName}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-stone-300">
                          {item.stageLabel} · job #{item.jobId}
                          {item.runCode ? ` · ${item.runCode}` : ""}
                        </div>
                        <div className="mt-2 text-xs text-stone-500">
                          失败于 {formatWritingEvalDateTime(item.failedAt)} · 入队 {formatWritingEvalDateTime(item.queuedAt)}
                          {item.durationSeconds !== null ? ` · 耗时 ${formatDurationHours(item.durationSeconds)}` : ""}
                        </div>
                      </div>
                      {item.runId ? (
                        <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId })} className={uiPrimitives.adminSecondaryButton}>
                          打开对应 Run
                        </Link>
                      ) : null}
                    </div>
                    {item.lastError ? <div className="mt-2 text-sm leading-7 text-cinnabar">{item.lastError}</div> : null}
                  </article>
                ))}
                {executionInsights.recentFailures.length === 0 ? <div className="text-sm text-stone-500">最近没有失败 stage job。</div> : null}
              </div>
            </section>

            <section className={adminInsightsInsetCardClassName}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近人工重试</div>
                  <div className="mt-2 text-sm leading-7 text-stone-500">
                    看哪些 run 在被重复人工拉起，避免问题长期靠 retry 掩盖，而没有进入真正修复。
                  </div>
                </div>
                <div className="text-xs text-stone-500">Top {executionInsights.recentRetries.length}</div>
              </div>
              <div className="mt-4 space-y-3">
                {executionInsights.recentRetries.map((item) => (
                  <article key={`retry-${item.id}`} className={adminInsightsSubcardCompactClassName}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-xs text-stone-300">
                          {item.runCode || `run#${item.runId ?? "--"}`}
                        </div>
                        <div className="mt-2 text-xs text-stone-500">
                          {item.username || "system"} · {formatWritingEvalDateTime(item.retriedAt)}
                        </div>
                      </div>
                      {item.runId ? (
                        <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId })} className={uiPrimitives.adminSecondaryButton}>
                          打开对应 Run
                        </Link>
                      ) : null}
                    </div>
                  </article>
                ))}
                {executionInsights.recentRetries.length === 0 ? <div className="text-sm text-stone-500">最近没有人工 retry。</div> : null}
              </div>
            </section>
          </div>
        </div>

        <div className={cn(adminInsightsSectionClassName, "xl:col-span-3")}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">运营总览</div>
              <div className="mt-2 text-sm leading-7 text-stone-500">
                把近 7 天与前 7 天拉平对比，再叠加 6 周滚动视角，快速判断当前是在持续提分、局部回归，还是自动放量风险在升高。
              </div>
            </div>
            <div className="text-sm text-stone-500">7d vs previous 7d</div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {operationsKpis.map((item) => (
              <div key={item.label} className={adminInsightsInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                <div className="mt-3 text-2xl text-stone-100">{formatWritingEvalMetric(item.current, item.digits)}</div>
                <div className="mt-2 text-xs text-stone-500">
                  前 7 天 {formatWritingEvalMetric(item.previous, item.digits)}
                </div>
                <div className={`mt-3 text-sm ${getDeltaTone(item.delta, item.smallerIsBetter)}`}>
                  Delta {formatSignedMetric(item.delta, item.digits)}
                </div>
                <div className="mt-2 text-xs text-stone-500">{item.note}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <section className={adminInsightsInsetCardClassName}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">6 周运营趋势</div>
                  <div className="mt-2 text-sm leading-7 text-stone-500">
                    用周桶观察 run 均分、失败样本和自动收缩/高风险动作，避免只看最近一两次 run 的短噪声。
                  </div>
                </div>
                <div className="text-xs text-stone-500">Weekly buckets</div>
              </div>
              <div className={adminInsightsDesktopTableShellClassName}>
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-stone-500">
                    <tr>
                      {["窗口", "Run 数", "均分", "失败样本", "提分占比", "收缩", "高风险"].map((head) => (
                        <th key={head} className="pb-4 font-medium">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyOpsBuckets.map((bucket) => (
                      <tr key={bucket.label} className="border-t border-stone-800">
                        <td className="py-4 text-stone-300">{bucket.label}</td>
                        <td className="py-4 text-stone-400">{bucket.runCount}</td>
                        <td className="py-4 text-stone-100">{formatWritingEvalMetric(bucket.averageTotalScore)}</td>
                        <td className="py-4 text-stone-400">{formatWritingEvalMetric(bucket.averageFailedCaseCount, 1)}</td>
                        <td className="py-4 text-emerald-400">
                          {typeof bucket.improvementRate === "number" ? `${(bucket.improvementRate * 100).toFixed(0)}%` : "--"}
                        </td>
                        <td className="py-4 text-cinnabar">{bucket.shrinkCount}</td>
                        <td className="py-4 text-amber-300">{bucket.highRiskCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={adminInsightsMobileListClassName}>
                {weeklyOpsBuckets.map((bucket) => (
                  <article key={`mobile-${bucket.label}`} className={adminInsightsMobileTableCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-mono text-xs text-stone-300">{bucket.label}</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={cn(adminInsightsBadgeClassName, "text-cinnabar")}>收缩 {bucket.shrinkCount}</span>
                        <span className={cn(adminInsightsBadgeClassName, "text-amber-300")}>高风险 {bucket.highRiskCount}</span>
                      </div>
                    </div>
                    <AdminInsightsMobileMetricGrid
                      items={[
                        { label: "Run 数", value: bucket.runCount, tone: "text-stone-400" },
                        { label: "均分", value: formatWritingEvalMetric(bucket.averageTotalScore) },
                        { label: "失败样本", value: formatWritingEvalMetric(bucket.averageFailedCaseCount, 1), tone: "text-stone-400" },
                        {
                          label: "提分占比",
                          value: typeof bucket.improvementRate === "number" ? `${(bucket.improvementRate * 100).toFixed(0)}%` : "--",
                          tone: "text-emerald-400",
                        },
                      ]}
                    />
                  </article>
                ))}
              </div>
            </section>

            <section className="space-y-3">
              {operationsHighlights.map((item) => (
                <article key={item.title} className={adminInsightsInsetCardClassName}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm uppercase tracking-[0.18em] text-stone-500">{item.title}</div>
                    <div className={`text-xs uppercase tracking-[0.18em] ${item.tone}`}>ops</div>
                  </div>
                  <div className={`mt-3 text-sm leading-7 ${item.tone}`}>{item.summary}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-400">{item.detail}</div>
                </article>
              ))}
            </section>
          </div>
        </div>

        <div className={cn(adminInsightsSectionClassName, "xl:col-span-2")}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">趋势</div>
          {displayTrend.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "质量分",
                  key: "qualityScore" as const,
                  tone: "bg-emerald-500/80",
                  value: latestTrend?.qualityScore ?? null,
                },
                {
                  label: "爆款分",
                  key: "viralScore" as const,
                  tone: "bg-cinnabar/80",
                  value: latestTrend?.viralScore ?? null,
                },
                {
                  label: "总分",
                  key: "totalScore" as const,
                  tone: "bg-stone-200/80",
                  value: latestTrend?.totalScore ?? null,
                },
              ].map((metric) => {
                const maxValue = Math.max(...displayTrend.map((item) => item[metric.key]), 1);
                const average = averageValue(trend, metric.key);
                return (
                  <div key={metric.label} className={adminInsightsInsetCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{metric.label}</div>
                        <div className="mt-3 text-2xl text-stone-100 text-balance">{formatWritingEvalMetric(metric.value)}</div>
                      </div>
                      <div className="text-right text-xs text-stone-500">
                        均值 {formatWritingEvalMetric(average)}
                        <br />
                        最新 Delta {formatWritingEvalMetric(latestTrend?.deltaTotalScore ?? null)}
                      </div>
                    </div>
                    {latestTrendRunHref ? (
                      <div className="mt-3">
                        <Link href={latestTrendRunHref} className={uiPrimitives.adminSecondaryButton}>
                          查看最新 Run
                        </Link>
                      </div>
                    ) : null}
                    <div className="mt-4 flex h-28 items-end gap-2">
                      {displayTrend.map((item) => (
                        <div key={`${metric.label}-${item.runId}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                          <div
                            className={`w-full rounded-sm ${metric.tone}`}
                            style={{
                              height: `${Math.max(10, Math.round((item[metric.key] / maxValue) * 100))}%`,
                            }}
                          />
                          <div className="line-clamp-1 text-[10px] text-stone-600">{item.runCode}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className={adminInsightsDesktopTableShellClassName}>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  {["Run", "时间", "质量", "爆款", "总分", "Delta", "失败样本"].map((head) => (
                    <th key={head} className="pb-4 font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayTrend.map((item) => (
                  <tr key={item.runId} className="border-t border-stone-800">
                    <td className="py-4 font-mono text-xs text-stone-300">
                      <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId })} className="transition hover:text-cinnabar">
                        {item.runCode}
                      </Link>
                    </td>
                    <td className="py-4 text-stone-400">{formatWritingEvalDateTime(item.createdAt)}</td>
                    <td className="py-4 text-stone-400">{item.qualityScore.toFixed(2)}</td>
                    <td className="py-4 text-stone-400">{item.viralScore.toFixed(2)}</td>
                    <td className="py-4 text-stone-100">{item.totalScore.toFixed(2)}</td>
                    <td className={`py-4 ${item.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                      {item.deltaTotalScore >= 0 ? "+" : ""}
                      {item.deltaTotalScore.toFixed(2)}
                    </td>
                    <td className="py-4 text-stone-400">{item.failedCaseCount}</td>
                  </tr>
                ))}
                {displayTrend.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-stone-500">
                      还没有可展示的趋势记录。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className={adminInsightsMobileListClassName}>
            {displayTrend.map((item) => (
              <article key={`mobile-run-${item.runId}`} className={adminInsightsMobileTableCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={buildAdminWritingEvalRunsHref({ runId: item.runId })}
                      className="font-mono text-xs text-stone-300 transition hover:text-cinnabar"
                    >
                      {item.runCode}
                    </Link>
                    <div className="mt-2 text-xs text-stone-500">{formatWritingEvalDateTime(item.createdAt)}</div>
                  </div>
                  <div className={cn("text-sm", item.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar")}>
                    {item.deltaTotalScore >= 0 ? "+" : ""}
                    {item.deltaTotalScore.toFixed(2)}
                  </div>
                </div>
                <AdminInsightsMobileMetricGrid
                  items={[
                    { label: "质量", value: item.qualityScore.toFixed(2), tone: "text-stone-400" },
                    { label: "爆款", value: item.viralScore.toFixed(2), tone: "text-stone-400" },
                    { label: "总分", value: item.totalScore.toFixed(2) },
                    { label: "失败样本", value: item.failedCaseCount, tone: "text-stone-400" },
                  ]}
                />
              </article>
            ))}
            {displayTrend.length === 0 ? (
              <div className={adminInsightsMutedNoticeClassName}>还没有可展示的趋势记录。</div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <section className={adminInsightsSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动放量趋势</div>
            <div className="mt-4 grid gap-3">
              {[
                { label: "7 天自动动作", value: recentAutoRolloutTrend.length, tone: "text-stone-100" },
                { label: "扩量动作", value: autoExpandCount, tone: "text-emerald-400" },
                { label: "收缩动作", value: autoShrinkCount, tone: "text-cinnabar" },
                { label: "高风险动作", value: autoHighRiskCount, tone: "text-amber-300" },
              ].map((item) => (
                <div key={item.label} className={cn(adminInsightsInsetCardClassName, "px-4 py-3")}>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                  <div className={`mt-2 text-2xl ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={adminInsightsSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">高频提分原因</div>
            <div className="mt-4 space-y-3 text-sm">
              {insights.topImprovementReasons.map((item: ReasonInsightItem) => (
                <div key={item.label} className={cn(adminInsightsInsetCardClassName, "px-4 py-3 text-stone-300")}>
                  <div>{item.label} · {item.count}</div>
                  <div className="mt-2 text-xs text-stone-500">
                    代表样本：{item.taskCode}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId })} className={uiPrimitives.adminSecondaryButton}>
                      打开代表样本
                    </Link>
                    <Link href={buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId })} className={uiPrimitives.adminSecondaryButton}>
                      打开评测样本
                    </Link>
                  </div>
                </div>
              ))}
              {insights.topImprovementReasons.length === 0 ? <div className="text-stone-500">暂无数据</div> : null}
            </div>
          </section>

          <section className={adminInsightsSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">高频退化原因</div>
            <div className="mt-4 space-y-3 text-sm">
              {insights.topRegressionReasons.map((item: ReasonInsightItem) => (
                <div key={item.label} className={cn(adminInsightsInsetCardClassName, "px-4 py-3 text-stone-300")}>
                  <div>{item.label} · {item.count}</div>
                  <div className="mt-2 text-xs text-stone-500">
                    代表样本：{item.taskCode}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId })} className={uiPrimitives.adminSecondaryButton}>
                      打开代表样本
                    </Link>
                    <Link href={buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId })} className={uiPrimitives.adminSecondaryButton}>
                      打开评测样本
                    </Link>
                  </div>
                </div>
              ))}
              {insights.topRegressionReasons.length === 0 ? <div className="text-stone-500">暂无数据</div> : null}
            </div>
          </section>
        </div>
      </section>

      <section className={adminInsightsSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动放量按天趋势</div>
            <div className="mt-2 text-sm leading-7 text-stone-500">
              观察近 7 天自动放量的日节奏，判断 scheduler 是否连续收缩、是否出现扩量停滞，或是否在短时间内集中触发高风险动作。
            </div>
          </div>
          <div className="text-sm text-stone-500">最近 7 天</div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className={adminInsightsInsetCardClassName}>
            <div className="flex h-40 items-end gap-3">
              {autoRolloutDailyBuckets.map((item) => (
                <div key={item.dateKey} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-full w-full items-end gap-1">
                    <div
                      className="w-1/3 rounded-t-sm bg-emerald-500/80"
                      style={{ height: `${Math.max(item.expandCount > 0 ? 16 : 6, Math.round((item.expandCount / maxDailyAutoRolloutCount) * 100))}%` }}
                    />
                    <div
                      className="w-1/3 rounded-t-sm bg-cinnabar/80"
                      style={{ height: `${Math.max(item.shrinkCount > 0 ? 16 : 6, Math.round((item.shrinkCount / maxDailyAutoRolloutCount) * 100))}%` }}
                    />
                    <div
                      className="w-1/3 rounded-t-sm bg-amber-500/80"
                      style={{ height: `${Math.max(item.highRiskCount > 0 ? 16 : 6, Math.round((item.highRiskCount / maxDailyAutoRolloutCount) * 100))}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-stone-600">{item.dateKey.slice(5)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-stone-500">
              <span className={adminInsightsBadgeClassName}>绿色：扩量</span>
              <span className={adminInsightsBadgeClassName}>红色：收缩</span>
              <span className={adminInsightsBadgeClassName}>黄色：高风险</span>
            </div>
          </div>
          <div className={adminInsightsInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">日汇总表</div>
            <div className="mt-4 space-y-3">
              {autoRolloutDailyBuckets.map((item) => (
                <div key={`daily-${item.dateKey}`} className={adminInsightsSubcardCompactClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-stone-200">{item.dateKey}</div>
                    <div className="text-xs text-stone-500">总动作 {item.total}</div>
                  </div>
                  <div className="mt-2 text-xs text-stone-500">
                    扩量 {item.expandCount} · 收缩 {item.shrinkCount} · 高风险 {item.highRiskCount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={adminInsightsSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动放量资产榜</div>
            <div className="mt-2 text-sm leading-7 text-stone-500">
              近 7 天按对象聚合自动放量动作，优先把“反复收缩”或“动作过密”的对象拉出来，便于运营优先复盘。
            </div>
          </div>
          <div className="text-sm text-stone-500">Top {Math.min(8, autoRolloutAssetLeaders.length)}</div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {autoRolloutAssetLeaders.slice(0, 8).map((item) => (
            (() => {
              const promptHref = buildPromptHref(item.assetType, item.assetRef);
              return (
                <article key={`${item.assetType}-${item.assetRef}`} className={adminInsightsInsetCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-stone-300">
                        {item.assetType} · {item.assetRef}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-stone-200">{item.latestReason}</div>
                    </div>
                    <div className={`text-sm ${getRiskTone(item.latestRiskLevel)}`}>
                      {item.latestRiskLevel}
                      <div className="mt-1 text-xs text-stone-500">{formatWritingEvalDateTime(item.latestAt)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>总动作 {item.totalActions}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-emerald-400")}>扩量 {item.expandCount}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-cinnabar")}>收缩 {item.shrinkCount}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-amber-300")}>高风险 {item.highRiskCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={buildAdminWritingEvalVersionsHref({ assetType: item.assetType, assetRef: item.assetRef })}
                      className={uiPrimitives.adminSecondaryButton}
                    >
                      查看对应版本
                    </Link>
                    {promptHref ? (
                      <Link href={promptHref} className={uiPrimitives.adminSecondaryButton}>
                        打开 Prompts 页
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })()
          ))}
          {autoRolloutAssetLeaders.length === 0 ? <div className="text-sm text-stone-500">近 7 天没有可展示的自动放量资产波动。</div> : null}
        </div>
      </section>

      <section className={adminInsightsSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动放量动作明细</div>
            <div className="mt-2 text-sm leading-7 text-stone-500">
              这里聚合 scheduler 产生的 `writing_asset_rollout_auto_manage` 与 `prompt_rollout_auto_manage` 审计，帮助运营从长期视角判断自动扩量是否过快、自动收缩是否过于频繁。
            </div>
          </div>
          <div className="text-sm text-stone-500">最近 7 天 {recentAutoRolloutTrend.length} 条</div>
        </div>
        <div className="mt-4 space-y-3">
          {recentAutoRolloutTrend.length ? (
            recentAutoRolloutTrend.slice(0, 12).map((item) => {
              const promptHref = buildPromptHref(item.assetType, item.assetRef);
              return (
                <article key={`auto-rollout-${item.id}`} className={adminInsightsInsetCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-stone-300">
                        {item.assetType} · {item.assetRef}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-stone-200">{item.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm ${getRiskTone(item.riskLevel)}`}>
                        {item.directionLabel} · {item.riskLevel}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">{formatWritingEvalDateTime(item.createdAt)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>回流 {formatWritingEvalMetric(item.feedbackCount, 0)} 条</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>用户 {formatWritingEvalMetric(item.uniqueUsers, 0)}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>命中 {formatWritingEvalMetric(item.totalHitCount, 0)}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>爆款 {formatWritingEvalMetric(item.observedViralScore)}</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>打开 {formatWritingEvalMetric(item.openRate, 1)}%</span>
                    <span className={cn(adminInsightsWideBadgeClassName, "text-stone-400")}>读完 {formatWritingEvalMetric(item.readCompletionRate, 1)}%</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={buildAdminWritingEvalVersionsHref({ assetType: item.assetType, assetRef: item.assetRef })}
                      className={uiPrimitives.adminSecondaryButton}
                    >
                      查看对应版本
                    </Link>
                    {promptHref ? (
                      <Link href={promptHref} className={uiPrimitives.adminSecondaryButton}>
                        打开 Prompts 页
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="text-sm text-stone-500">最近 7 天还没有自动放量动作。</div>
          )}
        </div>
      </section>

      <section className={adminInsightsSectionClassName}>
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">失败样本</div>
        <div className="mt-4 space-y-3">
          {insights.failingCases.map((item: any) => (
            <div key={`${item.runCode}-${item.taskCode}`} className={adminInsightsInsetCardClassName}>
                <div className="font-mono text-xs text-stone-300">
                {item.runId ? (
                  <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId, resultId: item.resultId })} className="transition hover:text-cinnabar">
                    {item.runCode}
                  </Link>
                ) : (
                  item.runCode
                )}
                {" · "}
                {item.taskCode}
              </div>
              <div className="mt-2 text-sm leading-7 text-cinnabar">{item.reason}</div>
              <div className="mt-3">
                <Link href={buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId, caseId: item.caseId })} className={uiPrimitives.adminSecondaryButton}>
                  打开评测样本
                </Link>
              </div>
            </div>
          ))}
          {insights.failingCases.length === 0 ? <div className="text-sm text-stone-500">近期没有失败样本。</div> : null}
        </div>
      </section>

      <AdminWritingEvalInsightsClient
        onlineCalibration={onlineCalibration as any}
        strategyRecommendations={strategyRecommendations as any}
        scoringProfiles={scoringProfiles as any}
      />
    </div>
  );
}
