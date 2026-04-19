import Link from "next/link";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { getWritingEvalAutomationOverview } from "@/lib/admin-writing-eval-automation-overview";
import {
  buildAdminPromptVersionHref,
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
  buildAdminWritingEvalVersionsHref,
} from "@/lib/admin-writing-eval-links";
import { requireAdminSession } from "@/lib/page-auth";
import { formatWritingEvalDateTime, formatWritingEvalMetric } from "@/lib/writing-eval-format";
import {
  getWritingEvalDatasetStats,
  getWritingEvalExecutionTone,
  getWritingEvalReadinessTone,
  getWritingEvalRunStats,
  getWritingEvalScheduleStats,
  isWritingEvalScheduleExecutable,
} from "@/lib/writing-eval-view";
import { getWritingEvalDatasets, getWritingEvalInsights, getWritingEvalRunSchedules, getWritingEvalScoringProfiles, getWritingEvalRuns, getWritingEvalVersions } from "@/lib/writing-eval";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const adminOverviewPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface shadow-none");
const adminHeroSectionClassName = cn(adminOverviewPanelClassName, "p-6");
const adminMetricCardClassName = cn(adminOverviewPanelClassName, "bg-adminSurfaceAlt p-5");
const adminSectionCardClassName = cn(adminOverviewPanelClassName, "p-5");
const adminInsetCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-adminLineStrong bg-adminSurfaceMuted shadow-none");
const adminActionLinkClassName = cn(
  buttonStyles({ variant: "secondary", size: "sm" }),
  "min-h-0 border-adminLineStrong bg-adminSurfaceMuted text-adminInk hover:border-adminLineStrong hover:bg-adminSurfaceAlt hover:text-adminInk focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);
const adminModuleLinkClassName = cn(
  surfaceCardStyles({ padding: "md" }),
  "border-adminLineStrong bg-adminSurfaceMuted shadow-none transition hover:border-adminAccent hover:bg-adminSurfaceAlt",
);
const adminInlineLinkClassName = "transition hover:text-adminAccent";
const adminStatusChipClassName = "border px-2 py-1 uppercase tracking-[0.16em]";

function getAutomationItemToneClassName(tone: string | null | undefined) {
  if (tone === "cinnabar") return "text-cinnabar";
  if (tone === "amber") return "text-amber-200";
  if (tone === "emerald") return "text-emerald-400";
  return "text-adminInkSoft";
}

function getExecutionBadgeClassName(status: string | null | undefined) {
  return cn(adminStatusChipClassName, getWritingEvalExecutionTone(status));
}

function getStrategyActionLabel(item: { executionState: string | null | undefined; primaryExecutableScheduleId: number | null | undefined }) {
  if (item.primaryExecutableScheduleId) return "打开可执行调度";
  if (item.executionState === "blocked") return "修复阻断规则";
  if (item.executionState === "missing") return "创建或启用调度";
  return "打开对应调度";
}

export default async function AdminWritingEvalPage() {
  await requireAdminSession();
  const [datasets, runs, versions, insights, scoringProfiles, schedules, automationOverview] = await Promise.all([
    getWritingEvalDatasets(),
    getWritingEvalRuns(),
    getWritingEvalVersions(),
    getWritingEvalInsights(),
    getWritingEvalScoringProfiles(),
    getWritingEvalRunSchedules(),
    getWritingEvalAutomationOverview(48),
  ]);
  const { combinedRolloutAuditLogs, rolloutActions, counts24h: automationCounts24h } = automationOverview;

  const datasetStats = getWritingEvalDatasetStats(datasets);
  const runStats = getWritingEvalRunStats(runs);
  const scheduleStats = getWritingEvalScheduleStats(schedules);
  const keepCount = versions.filter((item) => item.decision === "keep").length;
  const rollbackCount = versions.filter((item) => item.decision === "rollback").length;
  const latestRun = runs[0] ?? null;
  const latestDecision = versions[0] ?? null;
  const latestSchedule = schedules[0] ?? null;
  const activeScoringProfile = scoringProfiles.find((item) => item.isActive) ?? null;
  const onlineCalibration = insights.onlineCalibration;
  const topStrategyRecommendation = insights.strategyRecommendations?.[0] ?? null;
  const recentRolloutAuditLogs = combinedRolloutAuditLogs.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 24 * 60 * 60 * 1000);
  const expandActionCount = rolloutActions.filter((item) => item.direction === "expand").length;
  const shrinkActionCount = rolloutActions.filter((item) => item.direction === "shrink").length;
  const highRiskActionCount = rolloutActions.filter((item) => item.riskLevel === "cinnabar").length;
  const latestAutoRolloutAction = rolloutActions[0] ?? null;
  const dueSchedules = schedules
    .filter((item) => item.isEnabled && item.nextRunAt && new Date(item.nextRunAt).getTime() <= Date.now())
    .sort((left, right) => new Date(left.nextRunAt || 0).getTime() - new Date(right.nextRunAt || 0).getTime())
    .slice(0, 3);
  const blockedSchedules = schedules.filter((item) => item.isEnabled && !isWritingEvalScheduleExecutable(item)).slice(0, 3);
  const erroredSchedules = schedules.filter((item) => item.isEnabled && item.lastError).slice(0, 3);
  const automationAlertCount = scheduleStats.blockedEnabledCount + scheduleStats.dueCount + erroredSchedules.length + highRiskActionCount;
  const latestRunHref = latestRun ? buildAdminWritingEvalRunsHref({ runId: latestRun.id }) : null;
  const latestRunDatasetHref = latestRun?.datasetId ? buildAdminWritingEvalDatasetsHref({ datasetId: latestRun.datasetId }) : null;
  const latestRunBasePromptHref =
    latestRun?.baseVersionType === "prompt_version" ? buildAdminPromptVersionHref(latestRun.baseVersionRef) : null;
  const latestRunCandidatePromptHref =
    latestRun?.candidateVersionType === "prompt_version" ? buildAdminPromptVersionHref(latestRun.candidateVersionRef) : null;
  const runsSchedulesHref = latestSchedule ? buildAdminWritingEvalRunsHref({ scheduleId: latestSchedule.id }) : buildAdminWritingEvalRunsHref();
  const latestScheduleLastRunHref = latestSchedule?.lastRunId ? buildAdminWritingEvalRunsHref({ runId: latestSchedule.lastRunId }) : null;
  const latestScheduleDatasetHref = latestSchedule?.datasetId ? buildAdminWritingEvalDatasetsHref({ datasetId: latestSchedule.datasetId }) : null;
  const latestScheduleBasePromptHref =
    latestSchedule?.baseVersionType === "prompt_version" ? buildAdminPromptVersionHref(latestSchedule.baseVersionRef) : null;
  const latestScheduleCandidatePromptHref =
    latestSchedule?.candidateVersionType === "prompt_version" ? buildAdminPromptVersionHref(latestSchedule.candidateVersionRef) : null;
  const topStrategyTargetScheduleId = topStrategyRecommendation?.primaryExecutableScheduleId ?? topStrategyRecommendation?.primaryScheduleId ?? null;
  const topStrategyHref = buildAdminWritingEvalRunsHref({ scheduleId: topStrategyTargetScheduleId });
  const latestDecisionHref = latestDecision
    ? buildAdminWritingEvalVersionsHref({
        assetType: latestDecision.versionType,
        assetRef: latestDecision.candidateContent,
        versionId: latestDecision.id,
      })
    : null;
  const latestDecisionPromptHref = latestDecision
    ? latestDecision.versionType === "prompt_version"
      ? buildAdminPromptVersionHref(latestDecision.candidateContent)
      : null
    : null;
  const latestAutoRolloutHref =
    latestAutoRolloutAction?.assetType && latestAutoRolloutAction.assetRef
      ? buildAdminWritingEvalVersionsHref({
          assetType: latestAutoRolloutAction.assetType,
          assetRef: latestAutoRolloutAction.assetRef,
        })
      : null;
  const latestAutoRolloutPromptHref =
    latestAutoRolloutAction?.assetType === "prompt_version"
      ? buildAdminPromptVersionHref(latestAutoRolloutAction.assetRef)
      : null;

  return (
    <div className="space-y-6">
      <section className={adminHeroSectionClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Overview</div>
            <h1 className="mt-4 font-serifCn text-4xl text-adminInk text-balance">写作评测总览</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-adminInkSoft">
              这里作为写作版 autoresearch 的总入口，统一查看评测集、实验运行、版本账本和长期校准状态，再决定该去哪个子页继续操作。
            </p>
          </div>
          <AdminWritingEvalNav sections={["datasets", "runs", "versions", "insights"]} className="flex flex-wrap gap-3" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "评测集", value: datasets.length, detail: `active ${datasetStats.activeCount} · 样本 ${datasetStats.totalSampleCount}` },
          { label: "就绪评测集", value: datasetStats.readyCount, detail: `warning ${datasetStats.warningCount} · blocked ${datasetStats.blockedCount}` },
          { label: "实验运行", value: runs.length, detail: `成功 ${runStats.succeededCount} · 处理中 ${runStats.processingCount}` },
          { label: "自动调度", value: schedules.length, detail: `启用 ${scheduleStats.enabledCount} · 可执行 ${scheduleStats.executableCount} · 阻断 ${scheduleStats.blockedEnabledCount}` },
          { label: "自动候选", value: automationCounts24h.autoCandidate, detail: `24h 提案 · 派发 ${automationCounts24h.scheduleDispatch} · 补桶 ${automationCounts24h.autoFill}` },
          { label: "自动决议", value: automationCounts24h.autoResolve, detail: `治理 ${automationCounts24h.autoGovern} · 放量 ${automationCounts24h.autoRollout}` },
          { label: "版本账本", value: versions.length, detail: `keep ${keepCount} · rollback ${rollbackCount}` },
          {
            label: "线上回流",
            value: onlineCalibration.feedbackCount,
            detail: `观察爆款 ${formatWritingEvalMetric(onlineCalibration.averageObservedViralScore)} · 偏差 ${formatWritingEvalMetric(onlineCalibration.averageCalibrationGap)}`,
          },
          {
            label: "自动放量",
            value: combinedRolloutAuditLogs.length,
            detail: `24h ${recentRolloutAuditLogs.length} · 扩量 ${expandActionCount} · 收缩 ${shrinkActionCount}`,
          },
          {
            label: "调度告警",
            value: automationAlertCount,
            detail: `due ${scheduleStats.dueCount} · error ${erroredSchedules.length} · 高风险动作 ${highRiskActionCount}`,
          },
        ].map((item) => (
          <div key={item.label} className={adminMetricCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">{item.label}</div>
            <div className="mt-3 text-3xl text-adminInk text-balance">{item.value}</div>
            <div className="mt-3 text-sm text-adminInkMuted">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={adminSectionCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">自动运营时间线</div>
              <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">Scheduler 最近做了什么</h2>
            </div>
            <div className="text-sm text-adminInkMuted">
              24h 提案 {automationCounts24h.autoCandidate} · 决议 {automationCounts24h.autoResolve} · 治理 {automationCounts24h.autoGovern} · 放量 {automationCounts24h.autoRollout} · 校准 {automationCounts24h.autoCalibrate}
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {automationOverview.items.slice(0, 10).map((item) => (
              <div key={`automation-feed-${item.kind}-${item.id}`} className={adminInsetCardClassName}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">{item.kind}</div>
                    <div className="mt-2 text-sm text-adminInk">{item.title}</div>
                  </div>
                  <div className="text-xs text-adminInkMuted">{formatWritingEvalDateTime(item.createdAt)}</div>
                </div>
                <div className={cn("mt-3 text-sm", getAutomationItemToneClassName(item.tone))}>
                  {item.summary}
                </div>
                {item.detail ? <div className="mt-2 text-xs leading-6 text-adminInkMuted">{item.detail}</div> : null}
                {item.href || item.secondaryHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.href && item.hrefLabel ? (
                      <Link href={item.href} className={adminActionLinkClassName}>
                        {item.hrefLabel}
                      </Link>
                    ) : null}
                    {item.secondaryHref && item.secondaryHrefLabel ? (
                      <Link href={item.secondaryHref} className={adminActionLinkClassName}>
                        {item.secondaryHrefLabel}
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {automationOverview.items.length === 0 ? <div className="text-sm text-adminInkMuted">最近还没有写作评测自动运营轨迹。</div> : null}
          </div>
        </div>

        <div className={adminSectionCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">当前告警</div>
              <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">先处理这些异常</h2>
            </div>
            <div className="text-sm text-adminInkMuted">{automationAlertCount} 项</div>
          </div>
          <div className="mt-5 space-y-4">
            <div className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">调度阻断</div>
              <div className="mt-3 text-adminInk">{scheduleStats.blockedEnabledCount} 条启用中的 schedule 当前不可执行</div>
              <div className="mt-2 text-sm text-adminInkMuted">通常是评测集 readiness 不满足，或自动决议模式要求更高的样本守卫。</div>
              {blockedSchedules.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {blockedSchedules.map((item) => (
                    <div key={`blocked-schedule-${item.id}`} className="text-xs leading-6 text-adminInkSoft">
                      <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={adminInlineLinkClassName}>
                        {item.name}
                      </Link>
                      {` · ${item.readiness.status} · ${(item.readiness.blockers[0] || item.readiness.warnings[0] || "待补样本覆盖").trim()}`}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">到点未处理</div>
              <div className="mt-3 text-adminInk">{scheduleStats.dueCount} 条启用中的 schedule 已到派发时间</div>
              <div className="mt-2 text-sm text-adminInkMuted">如果这个数字持续累积，优先排查 scheduler 心跳和 service token。</div>
              {dueSchedules.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {dueSchedules.map((item) => (
                    <div key={`due-schedule-${item.id}`} className="text-xs leading-6 text-adminInkSoft">
                      <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={adminInlineLinkClassName}>
                        {item.name}
                      </Link>
                      {` · next ${item.nextRunAt ? formatWritingEvalDateTime(item.nextRunAt) : "--"} · 上次派发 ${item.lastDispatchedAt ? formatWritingEvalDateTime(item.lastDispatchedAt) : "暂无"}`}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">派发报错与高风险动作</div>
              <div className="mt-3 text-adminInk">error {erroredSchedules.length} · 高风险自动动作 {highRiskActionCount}</div>
              <div className="mt-2 text-sm text-adminInkMuted">调度报错看 Runs 调度面板，高风险自动放量动作建议回到 Versions / Runs 复核。</div>
              {erroredSchedules.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {erroredSchedules.map((item) => (
                    <div key={`errored-schedule-${item.id}`} className="text-xs leading-6 text-cinnabar">
                      <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={adminInlineLinkClassName}>
                        {item.name}
                      </Link>
                      {` · ${item.lastError}`}
                    </div>
                  ))}
                </div>
              ) : null}
              {latestAutoRolloutAction ? (
                <div className="mt-3 text-xs leading-6 text-adminInkSoft">
                  最近自动放量：{latestAutoRolloutAction.assetRef || latestAutoRolloutAction.assetType} · {latestAutoRolloutAction.directionLabel} · 风险 {latestAutoRolloutAction.riskLevel}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={adminSectionCardClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">模块导航</div>
              <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">下一步去哪</h2>
            </div>
            <div className="text-sm text-adminInkMuted">按任务拆分入口</div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[
              {
                href: "/admin/writing-eval/datasets",
                title: "Datasets",
                description: "管理评测集、难度分布、样本表格和样本编辑器。",
                meta: `${datasets.length} 个数据集 · ${datasetStats.totalSampleCount} 条样本`,
              },
              {
                href: "/admin/writing-eval/runs",
                title: "Runs",
                description: "发起实验、配置自动调度、查看运行状态并对比候选与基线输出。",
                meta: `${runs.length} 条运行 · 调度 ${scheduleStats.enabledCount}/${schedules.length} · 最近 ${latestRun?.runCode || "暂无"}`,
              },
              {
                href: "/admin/writing-eval/versions",
                title: "Versions",
                description: "查看 keep / discard / rollback 账本，并从 keep 记录直接回滚。",
                meta: `${versions.length} 条账本 · 最新 ${latestDecision?.decision || "暂无"} · 自动放量 ${combinedRolloutAuditLogs.length} 条`,
              },
              {
                href: "/admin/writing-eval/insights",
                title: "Insights",
                description: "查看长期趋势、退化原因和线上回流校准结果。",
                meta: `${insights.trend.length} 条趋势点 · 回流 ${onlineCalibration.feedbackCount} 条 · 高风险自动动作 ${highRiskActionCount} 条`,
              },
            ].map((item) => (
              <Link key={item.href} href={item.href} className={adminModuleLinkClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">{item.title}</div>
                <div className="mt-3 text-xl text-adminInk">{item.description}</div>
                <div className="mt-4 text-sm text-adminInkMuted">{item.meta}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className={adminSectionCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">当前重点</div>
            <div className="mt-4 space-y-4">
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">活跃评分画像</div>
                <div className="mt-3 text-adminInk">{activeScoringProfile ? `${activeScoringProfile.name} · ${activeScoringProfile.code}` : "暂无"}</div>
                <div className="mt-2 text-sm text-adminInkMuted">{activeScoringProfile?.description || "还没有可用说明。"}</div>
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">评测集就绪度</div>
                <div className="mt-3 text-adminInk">
                  ready {datasetStats.readyCount} · warning {datasetStats.warningCount} · blocked {datasetStats.blockedCount}
                </div>
                <div className="mt-2 text-sm text-adminInkMuted">
                  {datasetStats.blockedCount > 0
                    ? "存在会阻断自动实验的数据集，建议优先回到 Datasets 补齐目标与事实素材。"
                    : datasetStats.warningCount > 0
                      ? "当前没有阻断项，但仍有覆盖告警，自动决议前建议继续补样本。"
                      : "当前评测集已经满足自动实验的最低守卫要求。"}
                </div>
                {datasetStats.prioritizedIssues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {datasetStats.prioritizedIssues.map((dataset) => (
                      <div key={dataset.id} className="text-xs leading-6 text-adminInkSoft">
                        <Link
                          href={buildAdminWritingEvalDatasetsHref({ datasetId: dataset.id })}
                          className={cn(adminInlineLinkClassName, getWritingEvalReadinessTone(dataset.readiness.status))}
                        >
                          {dataset.name}
                        </Link>
                        {` · ${dataset.readiness.status} · `}
                        {(dataset.readiness.blockers[0] || dataset.readiness.warnings[0] || "待补样本覆盖").trim()}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">最新运行</div>
                <div className="mt-3 text-adminInk">{latestRun ? `${latestRun.runCode} · ${latestRun.status}` : "暂无运行"}</div>
                <div className="mt-2 text-sm text-adminInkMuted">
                  {latestRun
                    ? `候选 ${formatWritingEvalMetric(typeof latestRun.scoreSummary.totalScore === "number" ? latestRun.scoreSummary.totalScore : null)} · Delta ${formatWritingEvalMetric(typeof latestRun.scoreSummary.deltaTotalScore === "number" ? latestRun.scoreSummary.deltaTotalScore : null)}`
                    : "创建第一条运行后，这里会显示最新实验状态。"}
                </div>
                {latestRunHref || latestRunDatasetHref || latestRunBasePromptHref || latestRunCandidatePromptHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestRunHref ? (
                      <Link href={latestRunHref} className={adminActionLinkClassName}>
                        打开对应 Run
                      </Link>
                    ) : null}
                    {latestRunDatasetHref ? (
                      <Link href={latestRunDatasetHref} className={adminActionLinkClassName}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestRunBasePromptHref ? (
                      <Link href={latestRunBasePromptHref} className={adminActionLinkClassName}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestRunCandidatePromptHref ? (
                      <Link href={latestRunCandidatePromptHref} className={adminActionLinkClassName}>
                        候选 Prompt
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">最新账本动作</div>
                <div className="mt-3 text-adminInk">{latestDecision ? `${latestDecision.decision} · ${latestDecision.targetKey}` : "暂无账本动作"}</div>
                <div className="mt-2 text-sm text-adminInkMuted">{latestDecision?.decisionReason || "保留、discard 或 rollback 后会在这里出现。"}</div>
                {latestDecisionHref || latestDecisionPromptHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestDecisionHref ? (
                      <Link href={latestDecisionHref} className={adminActionLinkClassName}>
                        打开聚焦账本
                      </Link>
                    ) : null}
                    {latestDecisionPromptHref ? (
                      <Link href={latestDecisionPromptHref} className={adminActionLinkClassName}>
                        打开 Prompts 页
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">自动调度状态</div>
                <div className="mt-3 text-adminInk">
                  {latestSchedule ? (
                    <>
                      <Link href={runsSchedulesHref} className={adminInlineLinkClassName}>
                        {latestSchedule.name}
                      </Link>
                      {` · ${latestSchedule.isEnabled ? "enabled" : "disabled"}`}
                    </>
                  ) : (
                    "暂无调度规则"
                  )}
                </div>
                <div className="mt-2 text-sm text-adminInkMuted">
                  {latestSchedule ? (
                    <>
                      下次执行 {latestSchedule.nextRunAt ? formatWritingEvalDateTime(latestSchedule.nextRunAt) : "未设置"} · 最近 Run{" "}
                      {latestScheduleLastRunHref && latestSchedule.lastRunCode ? (
                        <Link href={latestScheduleLastRunHref} className={adminInlineLinkClassName}>
                          {latestSchedule.lastRunCode}
                        </Link>
                      ) : (
                        latestSchedule.lastRunCode || "暂无"
                      )}
                    </>
                  ) : (
                    "创建第一条调度规则后，这里会显示最近的自动实验状态。"
                  )}
                </div>
                {latestSchedule ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-adminInkMuted">
                      <span className={getExecutionBadgeClassName(latestSchedule.readiness.status)}>
                        {latestSchedule.readiness.status}
                      </span>
                      <span>{latestSchedule.datasetStatus}</span>
                      <span>启用样本 {latestSchedule.readiness.enabledCaseCount}</span>
                      <span>{latestSchedule.isEnabled ? "enabled" : "disabled"}</span>
                    </div>
                    {latestSchedule.readiness.blockers.length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-cinnabar">阻断项：{latestSchedule.readiness.blockers.join("；")}</div>
                    ) : null}
                    {latestSchedule.readiness.warnings.length > 0 ? (
                      <div className="mt-2 text-xs leading-6 text-amber-200">告警：{latestSchedule.readiness.warnings.slice(0, 2).join("；")}</div>
                    ) : null}
                  </>
                ) : null}
                {latestSchedule ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Link href={runsSchedulesHref} className={adminActionLinkClassName}>
                      打开 Runs 调度面板
                    </Link>
                    {latestScheduleLastRunHref ? (
                      <Link href={latestScheduleLastRunHref} className={adminActionLinkClassName}>
                        打开最近 Run
                      </Link>
                    ) : null}
                    {latestScheduleDatasetHref ? (
                      <Link href={latestScheduleDatasetHref} className={adminActionLinkClassName}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestScheduleBasePromptHref ? (
                      <Link href={latestScheduleBasePromptHref} className={adminActionLinkClassName}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestScheduleCandidatePromptHref ? (
                      <Link href={latestScheduleCandidatePromptHref} className={adminActionLinkClassName}>
                        候选 Prompt
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">策略建议</div>
                <div className="mt-3 text-adminInk">
                  {topStrategyRecommendation
                    ? `${topStrategyRecommendation.label} · P${topStrategyRecommendation.recommendedPriority} · ${topStrategyRecommendation.recommendedCadenceHours}h`
                    : "暂无建议"}
                </div>
                <div className="mt-2 text-sm text-adminInkMuted">
                  {topStrategyRecommendation?.reason || "线上回流和近期趋势积累后，这里会显示最紧急的 agentStrategy 调整建议。"}
                </div>
                {topStrategyRecommendation ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-adminInkMuted">
                      <span className={getExecutionBadgeClassName(topStrategyRecommendation.executionState)}>
                        {topStrategyRecommendation.executionState}
                      </span>
                      <span>启用 {topStrategyRecommendation.enabledScheduleCount}</span>
                      <span>可执行 {topStrategyRecommendation.executableScheduleCount}</span>
                      {topStrategyRecommendation.blockedScheduleCount > 0 ? <span>阻断 {topStrategyRecommendation.blockedScheduleCount}</span> : null}
                    </div>
                    {topStrategyRecommendation.executionBlocker ? (
                      <div className={`mt-2 text-xs leading-6 ${topStrategyRecommendation.executionState === "blocked" ? "text-cinnabar" : "text-adminInkMuted"}`}>
                        执行提示：{topStrategyRecommendation.executionBlocker}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Link href={topStrategyHref} className={adminActionLinkClassName}>
                        {getStrategyActionLabel(topStrategyRecommendation)}
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
              <div className={adminInsetCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">自动放量状态</div>
                <div className="mt-3 text-adminInk">
                  {latestAutoRolloutAction
                    ? `${latestAutoRolloutAction.assetType || "asset"} · ${latestAutoRolloutAction.directionLabel}`
                    : "暂无自动动作"}
                </div>
                <div className="mt-2 text-sm text-adminInkMuted">
                  {latestAutoRolloutAction
                    ? `${formatWritingEvalDateTime(latestAutoRolloutAction.createdAt)} · 风险 ${latestAutoRolloutAction.riskLevel} · ${latestAutoRolloutAction.reason || "无原因"}`
                    : "scheduler 写入自动放量审计后，这里会显示最近一次自动收缩或扩量。"}
                </div>
                {latestAutoRolloutAction ? (
                  <>
                    <div className="mt-3 text-xs text-adminInkMuted">
                      回流 {formatWritingEvalMetric(latestAutoRolloutAction.feedbackCount, 0)} · 用户 {formatWritingEvalMetric(latestAutoRolloutAction.uniqueUsers, 0)} ·
                      打开 {formatWritingEvalMetric(latestAutoRolloutAction.openRate, 1)}%
                    </div>
                    {latestAutoRolloutHref || latestAutoRolloutPromptHref ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {latestAutoRolloutHref ? (
                          <Link href={latestAutoRolloutHref} className={adminActionLinkClassName}>
                            打开聚焦账本
                          </Link>
                        ) : null}
                        {latestAutoRolloutPromptHref ? (
                          <Link href={latestAutoRolloutPromptHref} className={adminActionLinkClassName}>
                            打开 Prompts 页
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section className={adminSectionCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">最近趋势</div>
            <div className="mt-4 space-y-3">
              {insights.trend.slice(-5).reverse().map((item) => (
                <div key={item.runId} className={adminInsetCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId })} className={cn("font-mono text-xs text-adminInk", adminInlineLinkClassName)}>
                      {item.runCode}
                    </Link>
                    <div className="text-xs text-adminInkMuted">{formatWritingEvalDateTime(item.createdAt)}</div>
                  </div>
                  <div className="mt-3 text-sm text-adminInkSoft">
                    质量 {formatWritingEvalMetric(item.qualityScore)} · 爆款 {formatWritingEvalMetric(item.viralScore)} · 总分 {formatWritingEvalMetric(item.totalScore)}
                  </div>
                  <div className={`mt-2 text-sm ${item.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                    Delta {item.deltaTotalScore >= 0 ? "+" : ""}
                    {item.deltaTotalScore.toFixed(2)} · 失败样本 {item.failedCaseCount}
                  </div>
                </div>
              ))}
              {insights.trend.length === 0 ? <div className="text-sm text-adminInkMuted">还没有趋势记录。</div> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
