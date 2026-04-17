import Link from "next/link";
import { getOpsAuditLogs } from "@/lib/audit";
import { requireOpsSession } from "@/lib/page-auth";
import { getWritingEvalInsights, getWritingEvalScoringProfiles } from "@/lib/writing-eval";
import { OpsWritingEvalInsightsClient } from "@/components/ops-writing-eval-insights-client";
import { uiPrimitives } from "@huoziwriter/ui";

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

function formatMetric(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRolloutDirection(payload: Record<string, unknown>) {
  const previousConfig = getRecord(payload.previousConfig);
  const nextConfig = getRecord(payload.nextConfig);
  const previousPercentage = getNumber(previousConfig.rolloutPercentage) ?? 0;
  const nextPercentage = getNumber(nextConfig.rolloutPercentage) ?? 0;
  const previousObserveOnly = Boolean(previousConfig.rolloutObserveOnly);
  const nextObserveOnly = Boolean(nextConfig.rolloutObserveOnly);
  if (nextObserveOnly && !previousObserveOnly) return "收缩";
  if (nextPercentage > previousPercentage) return "扩量";
  if (nextPercentage < previousPercentage || (!nextObserveOnly && previousObserveOnly)) return "收缩";
  return "维持";
}

function getRiskTone(value: string) {
  if (value === "emerald") return "text-emerald-400";
  if (value === "cinnabar") return "text-cinnabar";
  if (value === "amber") return "text-amber-300";
  return "text-stone-400";
}

function getRecentDateBuckets(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function averageValue(points: TrendPoint[], key: "qualityScore" | "viralScore" | "totalScore") {
  if (points.length === 0) return null;
  return points.reduce((sum, item) => sum + item[key], 0) / points.length;
}

function buildRunHref(runId: number | null | undefined, resultId?: number | null) {
  if (!runId) return "/ops/writing-eval/runs";
  const params = new URLSearchParams({ runId: String(runId) });
  if (resultId) params.set("resultId", String(resultId));
  return `/ops/writing-eval/runs?${params.toString()}`;
}

function buildDatasetHref(datasetId: number | null | undefined, caseId?: number | null) {
  if (!datasetId) return "/ops/writing-eval/datasets";
  const params = new URLSearchParams({ datasetId: String(datasetId) });
  if (caseId) params.set("caseId", String(caseId));
  return `/ops/writing-eval/datasets?${params.toString()}`;
}

function buildPromptHref(assetType: string, assetRef: string) {
  if (assetType !== "prompt_version") return null;
  const trimmed = String(assetRef || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  if (!promptId || !version) return null;
  const params = new URLSearchParams({
    promptId,
    version,
  });
  return `/ops/prompts?${params.toString()}`;
}

export default async function OpsWritingEvalInsightsPage() {
  await requireOpsSession();
  const [insights, scoringProfiles, rolloutAuditLogs, promptRolloutAuditLogs] = await Promise.all([
    getWritingEvalInsights(),
    getWritingEvalScoringProfiles(),
    getOpsAuditLogs({
      action: "writing_asset_rollout_auto_manage",
      targetType: "writing_asset_rollout",
      limit: 180,
    }),
    getOpsAuditLogs({
      action: "prompt_rollout_auto_manage",
      targetType: "prompt_version",
      limit: 180,
    }),
  ]);
  const onlineCalibration = insights.onlineCalibration;
  const strategyRecommendations = insights.strategyRecommendations;
  const trend = insights.trend as TrendPoint[];
  const latestTrend = trend[trend.length - 1] ?? null;
  const latestTrendRunHref = latestTrend ? `/ops/writing-eval/runs?runId=${latestTrend.runId}` : null;
  const combinedRolloutAuditLogs = [...promptRolloutAuditLogs, ...rolloutAuditLogs].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const autoRolloutTrend = combinedRolloutAuditLogs.map((item) => {
    const payload = getRecord(item.payload);
    const signals = getRecord(payload.signals);
    return {
      id: item.id,
      createdAt: item.createdAt,
      assetType:
        item.action === "prompt_rollout_auto_manage"
          ? "prompt_version"
          : String(payload.assetType || "").trim() || "asset",
      assetRef:
        item.action === "prompt_rollout_auto_manage"
          ? `${String(payload.promptId || "").trim()}@${String(payload.version || "").trim()}`
          : String(payload.assetRef || "").trim() || "--",
      reason: String(payload.reason || "").trim() || "无原因",
      riskLevel: String(payload.riskLevel || "").trim() || "stone",
      direction: getRolloutDirection(payload),
      feedbackCount: getNumber(signals.feedbackCount),
      uniqueUsers: getNumber(signals.uniqueUsers),
      totalHitCount: getNumber(signals.totalHitCount),
      observedViralScore: getNumber(signals.observedViralScore),
      openRate: getNumber(signals.openRate),
      readCompletionRate: getNumber(signals.readCompletionRate),
    };
  });
  const recentAutoRolloutTrend = autoRolloutTrend.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const autoExpandCount = recentAutoRolloutTrend.filter((item) => item.direction === "扩量").length;
  const autoShrinkCount = recentAutoRolloutTrend.filter((item) => item.direction === "收缩").length;
  const autoHighRiskCount = recentAutoRolloutTrend.filter((item) => item.riskLevel === "cinnabar").length;
  const autoRolloutDailyBuckets = getRecentDateBuckets(7).map((dateKey) => {
    const items = recentAutoRolloutTrend.filter((item) => item.createdAt.slice(0, 10) === dateKey);
    return {
      dateKey,
      total: items.length,
      expandCount: items.filter((item) => item.direction === "扩量").length,
      shrinkCount: items.filter((item) => item.direction === "收缩").length,
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
      if (item.direction === "扩量") current.expandCount += 1;
      if (item.direction === "收缩") current.shrinkCount += 1;
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
      <section className={uiPrimitives.opsPanel + " p-6"}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Insights</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100">长期趋势与退化原因</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/ops/writing-eval" className={uiPrimitives.opsSecondaryButton}>
              Overview
            </Link>
            <Link href="/ops/writing-eval/datasets" className={uiPrimitives.opsSecondaryButton}>
              Datasets
            </Link>
            <Link href="/ops/writing-eval/runs" className={uiPrimitives.opsSecondaryButton}>
              Runs
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className={uiPrimitives.opsPanel + " p-5 xl:col-span-2"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">趋势</div>
          {trend.length > 0 ? (
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
                const maxValue = Math.max(...trend.map((item) => item[metric.key]), 1);
                const average = averageValue(trend, metric.key);
                return (
                  <div key={metric.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{metric.label}</div>
                        <div className="mt-3 text-2xl text-stone-100">{formatMetric(metric.value)}</div>
                      </div>
                      <div className="text-right text-xs text-stone-500">
                        均值 {formatMetric(average)}
                        <br />
                        最新 Delta {formatMetric(latestTrend?.deltaTotalScore ?? null)}
                      </div>
                    </div>
                    {latestTrendRunHref ? (
                      <div className="mt-3">
                        <Link href={latestTrendRunHref} className={uiPrimitives.opsSecondaryButton}>
                          查看最新 Run
                        </Link>
                      </div>
                    ) : null}
                    <div className="mt-4 flex h-28 items-end gap-2">
                      {trend.map((item) => (
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
          <div className="mt-4 overflow-x-auto">
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
                {trend.map((item) => (
                  <tr key={item.runId} className="border-t border-stone-800">
                    <td className="py-4 font-mono text-xs text-stone-300">
                      <Link href={`/ops/writing-eval/runs?runId=${item.runId}`} className="transition hover:text-cinnabar">
                        {item.runCode}
                      </Link>
                    </td>
                    <td className="py-4 text-stone-400">{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
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
                {trend.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-stone-500">
                      还没有可展示的趋势记录。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <section className={uiPrimitives.opsPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动放量趋势</div>
            <div className="mt-4 grid gap-3">
              {[
                { label: "7 天自动动作", value: recentAutoRolloutTrend.length, tone: "text-stone-100" },
                { label: "扩量动作", value: autoExpandCount, tone: "text-emerald-400" },
                { label: "收缩动作", value: autoShrinkCount, tone: "text-cinnabar" },
                { label: "高风险动作", value: autoHighRiskCount, tone: "text-amber-300" },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                  <div className={`mt-2 text-2xl ${item.tone}`}>{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={uiPrimitives.opsPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">高频提分原因</div>
            <div className="mt-4 space-y-3 text-sm">
              {insights.topImprovementReasons.map((item: ReasonInsightItem) => (
                <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-3 text-stone-300">
                  <div>{item.label} · {item.count}</div>
                  <div className="mt-2 text-xs text-stone-500">
                    代表样本：{item.taskCode}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={buildRunHref(item.runId, item.resultId)} className={uiPrimitives.opsSecondaryButton}>
                      打开代表样本
                    </Link>
                    <Link href={buildDatasetHref(item.datasetId, item.caseId)} className={uiPrimitives.opsSecondaryButton}>
                      打开评测样本
                    </Link>
                  </div>
                </div>
              ))}
              {insights.topImprovementReasons.length === 0 ? <div className="text-stone-500">暂无数据</div> : null}
            </div>
          </section>

          <section className={uiPrimitives.opsPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">高频退化原因</div>
            <div className="mt-4 space-y-3 text-sm">
              {insights.topRegressionReasons.map((item: ReasonInsightItem) => (
                <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-3 text-stone-300">
                  <div>{item.label} · {item.count}</div>
                  <div className="mt-2 text-xs text-stone-500">
                    代表样本：{item.taskCode}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={buildRunHref(item.runId, item.resultId)} className={uiPrimitives.opsSecondaryButton}>
                      打开代表样本
                    </Link>
                    <Link href={buildDatasetHref(item.datasetId, item.caseId)} className={uiPrimitives.opsSecondaryButton}>
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

      <section className={uiPrimitives.opsPanel + " p-5"}>
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
          <div className="border border-stone-800 bg-stone-950 px-4 py-4">
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
              <span className="border border-stone-700 px-2 py-1">绿色：扩量</span>
              <span className="border border-stone-700 px-2 py-1">红色：收缩</span>
              <span className="border border-stone-700 px-2 py-1">黄色：高风险</span>
            </div>
          </div>
          <div className="border border-stone-800 bg-stone-950 px-4 py-4">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">日汇总表</div>
            <div className="mt-4 space-y-3">
              {autoRolloutDailyBuckets.map((item) => (
                <div key={`daily-${item.dateKey}`} className="border border-stone-800 bg-[#141414] px-4 py-3">
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

      <section className={uiPrimitives.opsPanel + " p-5"}>
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
                <article key={`${item.assetType}-${item.assetRef}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-stone-300">
                        {item.assetType} · {item.assetRef}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-stone-200">{item.latestReason}</div>
                    </div>
                    <div className={`text-sm ${getRiskTone(item.latestRiskLevel)}`}>
                      {item.latestRiskLevel}
                      <div className="mt-1 text-xs text-stone-500">{new Date(item.latestAt).toLocaleString("zh-CN")}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">总动作 {item.totalActions}</span>
                    <span className="border border-stone-700 px-3 py-1 text-emerald-400">扩量 {item.expandCount}</span>
                    <span className="border border-stone-700 px-3 py-1 text-cinnabar">收缩 {item.shrinkCount}</span>
                    <span className="border border-stone-700 px-3 py-1 text-amber-300">高风险 {item.highRiskCount}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={`/ops/writing-eval/versions?assetType=${encodeURIComponent(item.assetType)}&assetRef=${encodeURIComponent(item.assetRef)}`}
                      className={uiPrimitives.opsSecondaryButton}
                    >
                      查看对应版本
                    </Link>
                    {promptHref ? (
                      <Link href={promptHref} className={uiPrimitives.opsSecondaryButton}>
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

      <section className={uiPrimitives.opsPanel + " p-5"}>
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
                <article key={`auto-rollout-${item.id}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-stone-300">
                        {item.assetType} · {item.assetRef}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-stone-200">{item.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm ${getRiskTone(item.riskLevel)}`}>
                        {item.direction} · {item.riskLevel}
                      </div>
                      <div className="mt-1 text-xs text-stone-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">回流 {formatMetric(item.feedbackCount, 0)} 条</span>
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">用户 {formatMetric(item.uniqueUsers, 0)}</span>
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">命中 {formatMetric(item.totalHitCount, 0)}</span>
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">爆款 {formatMetric(item.observedViralScore)}</span>
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">打开 {formatMetric(item.openRate, 1)}%</span>
                    <span className="border border-stone-700 px-3 py-1 text-stone-400">读完 {formatMetric(item.readCompletionRate, 1)}%</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link
                      href={`/ops/writing-eval/versions?assetType=${encodeURIComponent(item.assetType)}&assetRef=${encodeURIComponent(item.assetRef)}`}
                      className={uiPrimitives.opsSecondaryButton}
                    >
                      查看对应版本
                    </Link>
                    {promptHref ? (
                      <Link href={promptHref} className={uiPrimitives.opsSecondaryButton}>
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

      <section className={uiPrimitives.opsPanel + " p-5"}>
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">失败样本</div>
        <div className="mt-4 space-y-3">
          {insights.failingCases.map((item: any) => (
            <div key={`${item.runCode}-${item.taskCode}`} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="font-mono text-xs text-stone-300">
                {item.runId ? (
                  <Link href={buildRunHref(item.runId, item.resultId)} className="transition hover:text-cinnabar">
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
                <Link href={buildDatasetHref(item.datasetId, item.caseId)} className={uiPrimitives.opsSecondaryButton}>
                  打开评测样本
                </Link>
              </div>
            </div>
          ))}
          {insights.failingCases.length === 0 ? <div className="text-sm text-stone-500">近期没有失败样本。</div> : null}
        </div>
      </section>

      <OpsWritingEvalInsightsClient
        onlineCalibration={onlineCalibration as any}
        strategyRecommendations={strategyRecommendations as any}
        scoringProfiles={scoringProfiles as any}
      />
    </div>
  );
}
