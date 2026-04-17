import Link from "next/link";
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
import { formatWritingEvalDateTime, formatWritingEvalMetric } from "@/lib/writing-eval-format";
import {
  getWritingEvalDatasetStats,
  getWritingEvalExecutionTone,
  getWritingEvalReadinessTone,
  getWritingEvalRunStats,
  getWritingEvalScheduleStats,
} from "@/lib/writing-eval-view";
import { getWritingEvalDatasets, getWritingEvalInsights, getWritingEvalRunSchedules, getWritingEvalScoringProfiles, getWritingEvalRuns, getWritingEvalVersions } from "@/lib/writing-eval";
import { uiPrimitives } from "@huoziwriter/ui";

function getStrategyActionLabel(item: { executionState: string | null | undefined; primaryExecutableScheduleId: number | null | undefined }) {
  if (item.primaryExecutableScheduleId) return "打开可执行调度";
  if (item.executionState === "blocked") return "修复阻断规则";
  if (item.executionState === "missing") return "创建或启用调度";
  return "打开对应调度";
}

export default async function AdminWritingEvalPage() {
  await requireAdminSession();
  const [datasets, runs, versions, insights, scoringProfiles, schedules, rolloutAudits] = await Promise.all([
    getWritingEvalDatasets(),
    getWritingEvalRuns(),
    getWritingEvalVersions(),
    getWritingEvalInsights(),
    getWritingEvalScoringProfiles(),
    getWritingEvalRunSchedules(),
    getWritingEvalRolloutAuditLogs(120),
  ]);
  const { combinedRolloutAuditLogs } = rolloutAudits;

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
  const autoRolloutActions = normalizeWritingEvalRolloutAuditLogs(combinedRolloutAuditLogs);
  const expandActionCount = autoRolloutActions.filter((item) => item.direction === "expand").length;
  const shrinkActionCount = autoRolloutActions.filter((item) => item.direction === "shrink").length;
  const highRiskActionCount = autoRolloutActions.filter((item) => item.riskLevel === "cinnabar").length;
  const latestAutoRolloutAction = autoRolloutActions[0] ?? null;
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
      <section className={uiPrimitives.adminPanel + " p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Overview</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100">写作评测总览</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
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
        ].map((item) => (
          <div key={item.label} className={uiPrimitives.adminPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
            <div className="mt-3 text-3xl text-stone-100">{item.value}</div>
            <div className="mt-3 text-sm text-stone-500">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模块导航</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">下一步去哪</h2>
            </div>
            <div className="text-sm text-stone-500">按任务拆分入口</div>
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
              <Link key={item.href} href={item.href} className="border border-stone-800 bg-stone-950 px-5 py-5 transition hover:border-cinnabar hover:bg-[#1d1413]">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{item.title}</div>
                <div className="mt-3 text-xl text-stone-100">{item.description}</div>
                <div className="mt-4 text-sm text-stone-500">{item.meta}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <section className={uiPrimitives.adminPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">当前重点</div>
            <div className="mt-4 space-y-4">
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">活跃评分画像</div>
                <div className="mt-3 text-stone-100">{activeScoringProfile ? `${activeScoringProfile.name} · ${activeScoringProfile.code}` : "暂无"}</div>
                <div className="mt-2 text-sm text-stone-500">{activeScoringProfile?.description || "还没有可用说明。"}</div>
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">评测集就绪度</div>
                <div className="mt-3 text-stone-100">
                  ready {datasetStats.readyCount} · warning {datasetStats.warningCount} · blocked {datasetStats.blockedCount}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {datasetStats.blockedCount > 0
                    ? "存在会阻断自动实验的数据集，建议优先回到 Datasets 补齐目标与事实素材。"
                    : datasetStats.warningCount > 0
                      ? "当前没有阻断项，但仍有覆盖告警，自动决议前建议继续补样本。"
                      : "当前评测集已经满足自动实验的最低守卫要求。"}
                </div>
                {datasetStats.prioritizedIssues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {datasetStats.prioritizedIssues.map((dataset) => (
                      <div key={dataset.id} className="text-xs leading-6 text-stone-400">
                        <Link
                          href={buildAdminWritingEvalDatasetsHref({ datasetId: dataset.id })}
                          className={`transition hover:text-cinnabar ${getWritingEvalReadinessTone(dataset.readiness.status)}`}
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
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最新运行</div>
                <div className="mt-3 text-stone-100">{latestRun ? `${latestRun.runCode} · ${latestRun.status}` : "暂无运行"}</div>
                <div className="mt-2 text-sm text-stone-500">
                  {latestRun
                    ? `候选 ${formatWritingEvalMetric(typeof latestRun.scoreSummary.totalScore === "number" ? latestRun.scoreSummary.totalScore : null)} · Delta ${formatWritingEvalMetric(typeof latestRun.scoreSummary.deltaTotalScore === "number" ? latestRun.scoreSummary.deltaTotalScore : null)}`
                    : "创建第一条运行后，这里会显示最新实验状态。"}
                </div>
                {latestRunHref || latestRunDatasetHref || latestRunBasePromptHref || latestRunCandidatePromptHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestRunHref ? (
                      <Link href={latestRunHref} className={uiPrimitives.adminSecondaryButton}>
                        打开对应 Run
                      </Link>
                    ) : null}
                    {latestRunDatasetHref ? (
                      <Link href={latestRunDatasetHref} className={uiPrimitives.adminSecondaryButton}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestRunBasePromptHref ? (
                      <Link href={latestRunBasePromptHref} className={uiPrimitives.adminSecondaryButton}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestRunCandidatePromptHref ? (
                      <Link href={latestRunCandidatePromptHref} className={uiPrimitives.adminSecondaryButton}>
                        候选 Prompt
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最新账本动作</div>
                <div className="mt-3 text-stone-100">{latestDecision ? `${latestDecision.decision} · ${latestDecision.targetKey}` : "暂无账本动作"}</div>
                <div className="mt-2 text-sm text-stone-500">{latestDecision?.decisionReason || "保留、discard 或 rollback 后会在这里出现。"}</div>
                {latestDecisionHref || latestDecisionPromptHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestDecisionHref ? (
                      <Link href={latestDecisionHref} className={uiPrimitives.adminSecondaryButton}>
                        打开聚焦账本
                      </Link>
                    ) : null}
                    {latestDecisionPromptHref ? (
                      <Link href={latestDecisionPromptHref} className={uiPrimitives.adminSecondaryButton}>
                        打开 Prompts 页
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">自动调度状态</div>
                <div className="mt-3 text-stone-100">
                  {latestSchedule ? (
                    <>
                      <Link href={runsSchedulesHref} className="transition hover:text-cinnabar">
                        {latestSchedule.name}
                      </Link>
                      {` · ${latestSchedule.isEnabled ? "enabled" : "disabled"}`}
                    </>
                  ) : (
                    "暂无调度规则"
                  )}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {latestSchedule ? (
                    <>
                      下次执行 {latestSchedule.nextRunAt ? formatWritingEvalDateTime(latestSchedule.nextRunAt) : "未设置"} · 最近 Run{" "}
                      {latestScheduleLastRunHref && latestSchedule.lastRunCode ? (
                        <Link href={latestScheduleLastRunHref} className="transition hover:text-cinnabar">
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
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                      <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getWritingEvalExecutionTone(latestSchedule.readiness.status)}`}>
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
                    <Link href={runsSchedulesHref} className={uiPrimitives.adminSecondaryButton}>
                      打开 Runs 调度面板
                    </Link>
                    {latestScheduleLastRunHref ? (
                      <Link href={latestScheduleLastRunHref} className={uiPrimitives.adminSecondaryButton}>
                        打开最近 Run
                      </Link>
                    ) : null}
                    {latestScheduleDatasetHref ? (
                      <Link href={latestScheduleDatasetHref} className={uiPrimitives.adminSecondaryButton}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestScheduleBasePromptHref ? (
                      <Link href={latestScheduleBasePromptHref} className={uiPrimitives.adminSecondaryButton}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestScheduleCandidatePromptHref ? (
                      <Link href={latestScheduleCandidatePromptHref} className={uiPrimitives.adminSecondaryButton}>
                        候选 Prompt
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">策略建议</div>
                <div className="mt-3 text-stone-100">
                  {topStrategyRecommendation
                    ? `${topStrategyRecommendation.label} · P${topStrategyRecommendation.recommendedPriority} · ${topStrategyRecommendation.recommendedCadenceHours}h`
                    : "暂无建议"}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {topStrategyRecommendation?.reason || "线上回流和近期趋势积累后，这里会显示最紧急的 agentStrategy 调整建议。"}
                </div>
                {topStrategyRecommendation ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
                      <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getWritingEvalExecutionTone(topStrategyRecommendation.executionState)}`}>
                        {topStrategyRecommendation.executionState}
                      </span>
                      <span>启用 {topStrategyRecommendation.enabledScheduleCount}</span>
                      <span>可执行 {topStrategyRecommendation.executableScheduleCount}</span>
                      {topStrategyRecommendation.blockedScheduleCount > 0 ? <span>阻断 {topStrategyRecommendation.blockedScheduleCount}</span> : null}
                    </div>
                    {topStrategyRecommendation.executionBlocker ? (
                      <div className={`mt-2 text-xs leading-6 ${topStrategyRecommendation.executionState === "blocked" ? "text-cinnabar" : "text-stone-500"}`}>
                        执行提示：{topStrategyRecommendation.executionBlocker}
                      </div>
                    ) : null}
                    <div className="mt-3">
                      <Link href={topStrategyHref} className={uiPrimitives.adminSecondaryButton}>
                        {getStrategyActionLabel(topStrategyRecommendation)}
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">自动放量状态</div>
                <div className="mt-3 text-stone-100">
                  {latestAutoRolloutAction
                    ? `${latestAutoRolloutAction.assetType || "asset"} · ${latestAutoRolloutAction.directionLabel}`
                    : "暂无自动动作"}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {latestAutoRolloutAction
                    ? `${formatWritingEvalDateTime(latestAutoRolloutAction.createdAt)} · 风险 ${latestAutoRolloutAction.riskLevel} · ${latestAutoRolloutAction.reason || "无原因"}`
                    : "scheduler 写入自动放量审计后，这里会显示最近一次自动收缩或扩量。"}
                </div>
                {latestAutoRolloutAction ? (
                  <>
                    <div className="mt-3 text-xs text-stone-500">
                      回流 {formatWritingEvalMetric(latestAutoRolloutAction.feedbackCount, 0)} · 用户 {formatWritingEvalMetric(latestAutoRolloutAction.uniqueUsers, 0)} ·
                      打开 {formatWritingEvalMetric(latestAutoRolloutAction.openRate, 1)}%
                    </div>
                    {latestAutoRolloutHref || latestAutoRolloutPromptHref ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {latestAutoRolloutHref ? (
                          <Link href={latestAutoRolloutHref} className={uiPrimitives.adminSecondaryButton}>
                            打开聚焦账本
                          </Link>
                        ) : null}
                        {latestAutoRolloutPromptHref ? (
                          <Link href={latestAutoRolloutPromptHref} className={uiPrimitives.adminSecondaryButton}>
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

          <section className={uiPrimitives.adminPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">最近趋势</div>
            <div className="mt-4 space-y-3">
              {insights.trend.slice(-5).reverse().map((item) => (
                <div key={item.runId} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={buildAdminWritingEvalRunsHref({ runId: item.runId })} className="font-mono text-xs text-stone-300 transition hover:text-cinnabar">
                      {item.runCode}
                    </Link>
                    <div className="text-xs text-stone-500">{formatWritingEvalDateTime(item.createdAt)}</div>
                  </div>
                  <div className="mt-3 text-sm text-stone-400">
                    质量 {formatWritingEvalMetric(item.qualityScore)} · 爆款 {formatWritingEvalMetric(item.viralScore)} · 总分 {formatWritingEvalMetric(item.totalScore)}
                  </div>
                  <div className={`mt-2 text-sm ${item.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                    Delta {item.deltaTotalScore >= 0 ? "+" : ""}
                    {item.deltaTotalScore.toFixed(2)} · 失败样本 {item.failedCaseCount}
                  </div>
                </div>
              ))}
              {insights.trend.length === 0 ? <div className="text-sm text-stone-500">还没有趋势记录。</div> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
