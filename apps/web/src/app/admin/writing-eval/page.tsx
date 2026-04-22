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
import { getPlan17BusinessReport } from "@/lib/plan17-business";
import { getPlan17AcceptanceReport } from "@/lib/plan17-acceptance";
import { getWritingEvalDatasets, getWritingEvalInsights, getWritingEvalRunSchedules, getWritingEvalScoringProfiles, getWritingEvalRuns, getWritingEvalVersions } from "@/lib/writing-eval";
import { getPlan17QualityReport } from "@/lib/writing-eval";
import { getModelRoutes, getPromptVersions } from "@/lib/repositories";
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

function formatPlan17Percent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

export default async function AdminWritingEvalPage() {
  await requireAdminSession();
  const [datasets, runs, versions, insights, scoringProfiles, schedules, automationOverview, plan17Quality, plan17Business, plan17Acceptance, promptVersions, modelRoutes] = await Promise.all([
    getWritingEvalDatasets(),
    getWritingEvalRuns(),
    getWritingEvalVersions(),
    getWritingEvalInsights(),
    getWritingEvalScoringProfiles(),
    getWritingEvalRunSchedules(),
    getWritingEvalAutomationOverview(48),
    getPlan17QualityReport(),
    getPlan17BusinessReport(),
    getPlan17AcceptanceReport(),
    getPromptVersions(),
    getModelRoutes(),
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
  const optimizerOverviewItems = [
    {
      promptId: "title_optimizer",
      sceneCode: "titleOptimizer",
      label: "标题优化器",
      detail: "6 个标题候选、推荐项和禁词体检已进入写作主链路。",
      workspaceSummary: "标题候选与标题体检已接入大纲和发布守门。",
      focusKey: null,
    },
    {
      promptId: "opening_optimizer",
      sceneCode: "openingOptimizer",
      label: "开头优化器",
      detail: "3 个开头候选、推荐项和前三秒留存体检已经进入工作区主链路。",
      workspaceSummary: "outline openingOptions、deepWriting runtimeMeta 与发布守门都已接线。",
      focusKey: "opening_optimizer" as const,
    },
  ].map((item) => {
    const scenePromptVersions = promptVersions.filter((version) => version.prompt_id === item.promptId);
    const activePrompt = scenePromptVersions.find((version) => Boolean(version.is_active)) ?? scenePromptVersions[0] ?? null;
    const route = modelRoutes.find((routeItem) => routeItem.scene_code === item.sceneCode) ?? null;
    const focusDatasets = item.focusKey ? datasets.filter((dataset) => dataset.focus.key === item.focusKey) : [];
    const focusDatasetIds = new Set(focusDatasets.map((dataset) => dataset.id));
    const focusRuns = focusDatasetIds.size > 0 ? runs.filter((run) => focusDatasetIds.has(run.datasetId)) : [];
    const recommendedDataset =
      focusDatasets.find((dataset) => dataset.status === "active" && dataset.readiness.status === "ready")
      ?? focusDatasets.find((dataset) => dataset.status === "active")
      ?? focusDatasets[0]
      ?? null;
    return {
      ...item,
      versionCount: scenePromptVersions.length,
      activePrompt,
      route,
      promptHref: activePrompt ? buildAdminPromptVersionHref(`${activePrompt.prompt_id}@${activePrompt.version}`) : null,
      focusSummary: item.focusKey
        ? {
            datasetCount: focusDatasets.length,
            readyDatasetCount: focusDatasets.filter((dataset) => dataset.readiness.status === "ready").length,
            sampleCount: focusDatasets.reduce((sum, dataset) => sum + Number(dataset.sampleCount || 0), 0),
            runCount: focusRuns.length,
            recommendedDataset,
          }
        : null,
    };
  });

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
          <AdminWritingEvalNav sections={["datasets", "runs", "versions", "insights", "scoring", "schedules", "governance"]} className="flex flex-wrap gap-3" />
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

      <section className={adminSectionCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Headline Optimizers</div>
            <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">标题 / 开头专项优化器</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-adminInkMuted">
            <span>Prompt {optimizerOverviewItems.reduce((sum, item) => sum + item.versionCount, 0)} 个版本</span>
            <Link href="/admin/ai-routing" className={adminActionLinkClassName}>
              打开模型路由
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {optimizerOverviewItems.map((item) => (
            <div key={item.sceneCode} className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">{item.label}</div>
              <div className="mt-3 text-2xl text-adminInk">
                {item.activePrompt ? `${item.activePrompt.version} · ${item.activePrompt.name}` : "未发现激活 Prompt"}
              </div>
              <div className="mt-2 text-sm text-adminInkMuted">{item.detail}</div>
              <div className="mt-3 text-xs leading-6 text-adminInkMuted">
                Prompt 版本 {item.versionCount} · 当前路由 {item.route ? `${item.route.primary_model} / ${item.route.fallback_model || "无 fallback"}` : "未配置"}
              </div>
              <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                {item.route?.description || item.workspaceSummary}
              </div>
              <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                {item.focusSummary
                  ? `专项评测集 ${item.focusSummary.datasetCount} · ready ${item.focusSummary.readyDatasetCount} · 样本 ${item.focusSummary.sampleCount} · run ${item.focusSummary.runCount}`
                  : "当前仍复用通用全文评测集，尚未拆出独立专项评测桶。"}
              </div>
              <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                工作区接线：{item.workspaceSummary}
              </div>
              {item.promptHref || item.route || item.focusSummary ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  {item.promptHref ? (
                    <Link href={item.promptHref} className={adminActionLinkClassName}>
                      打开 Prompt
                    </Link>
                  ) : null}
                  {item.route ? (
                    <Link href="/admin/ai-routing" className={adminActionLinkClassName}>
                      查看路由
                    </Link>
                  ) : null}
                  {item.focusSummary ? (
                    <Link
                      href={item.focusSummary.recommendedDataset ? buildAdminWritingEvalDatasetsHref({ datasetId: item.focusSummary.recommendedDataset.id }) : buildAdminWritingEvalDatasetsHref()}
                      className={adminActionLinkClassName}
                    >
                      {item.focusSummary.recommendedDataset ? "打开专项评测集" : "去建专项评测集"}
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className={adminSectionCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Plan17 Acceptance</div>
            <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">Plan17 自动验收总览</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-adminInkMuted">
              overall {plan17Acceptance.overallStatus} · passed {plan17Acceptance.summary.passedCount}/{plan17Acceptance.summary.totalCount} · blocked {plan17Acceptance.summary.blockedCount}
            </div>
            <Link href="/admin/plan17/acceptance" className={adminActionLinkClassName}>
              打开验收总览
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {plan17Acceptance.sections.map((section) => (
            <div key={section.key} className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">{section.label}</div>
              <div className="mt-3 text-2xl text-adminInk">{section.passedCount}/{section.totalCount}</div>
              <div className="mt-2 text-sm text-adminInkMuted">
                status {section.status} · blocked {section.items.filter((item) => item.status === "blocked").length}
              </div>
              <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                {section.items
                  .filter((item) => item.status !== "passed")
                  .slice(0, 2)
                  .map((item) => item.label)
                  .join(" · ") || "当前章节已全部通过"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={adminSectionCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Plan17 Quality</div>
            <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">Plan17 质量验收桶</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-adminInkMuted">
              数据集 {plan17Quality.totalDatasetCount} · 样本 {plan17Quality.totalSampleCount} · 本次自动 seed {plan17Quality.seededDatasetCodes.length}
            </div>
            <Link href="/admin/plan17/quality" className={adminActionLinkClassName}>
              打开人工标注页
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {plan17Quality.focuses.map((focus) => (
            <div key={focus.key} className={adminInsetCardClassName}>
              <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">{focus.label}</div>
              <div className="mt-3 text-2xl text-adminInk">{focus.sampleCount}</div>
              <div className="mt-2 text-sm text-adminInkMuted">
                数据集 {focus.datasetCount} · active {focus.activeDatasetCount} · case {focus.enabledCaseCount}/{focus.enabledCaseCount + focus.disabledCaseCount}
              </div>
              <div className="mt-2 text-sm text-adminInkMuted">
                run {focus.runCount} · linked {focus.linkedFeedbackCount}
              </div>
              <div className="mt-3 text-xs leading-6 text-adminInkMuted">
                readiness: ready {focus.readiness.readyCount} / warning {focus.readiness.warningCount} / blocked {focus.readiness.blockedCount}
              </div>
              <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                {focus.key === "topic_fission"
                  ? focus.reporting.topicFissionSceneBreakdown.length > 0
                    ? focus.reporting.topicFissionSceneBreakdown
                        .map((item) => `${item.sceneKey} ${item.evaluatedCaseCount}/${item.stableHitRate != null ? `${(item.stableHitRate * 100).toFixed(1)}%` : "--"}`)
                        .join(" · ")
                    : `Prompt ${focus.promptIds.length} 个 · 最近运行 ${focus.latestRunAt ? formatWritingEvalDateTime(focus.latestRunAt) : "--"}`
                  : focus.key === "strategy_strength"
                  ? `代理 Spearman：${focus.reporting.proxyScoreVsObservedSpearman != null ? focus.reporting.proxyScoreVsObservedSpearman.toFixed(3) : "--"}（样本 ${focus.reporting.proxyScoreVsObservedSampleCount}）`
                  : focus.key === "rhythm_consistency"
                    ? `rhythmDeviation vs readCompletion：${focus.reporting.rhythmDeviationVsReadCompletionCorrelation != null ? focus.reporting.rhythmDeviationVsReadCompletionCorrelation.toFixed(3) : "--"}（样本 ${focus.reporting.rhythmDeviationVsReadCompletionSampleCount}）`
                    : `Prompt ${focus.promptIds.length} 个 · 最近运行 ${focus.latestRunAt ? formatWritingEvalDateTime(focus.latestRunAt) : "--"}`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={adminSectionCardClassName}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Plan17 Business</div>
            <h2 className="mt-3 font-serifCn text-2xl text-adminInk text-balance">Plan17 业务验收报表</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-adminInkMuted">
              启用作者 {plan17Business.authorLiftVsBaseline.activatedAuthorCount} · 矩阵作者 {plan17Business.matrixWeeklyOutput.matrixAuthorCount} · 累计真实风格使用 {plan17Business.styleHeatmapUsage.totalUsageEventCount}
            </div>
            <Link href="/admin/plan17/business" className={adminActionLinkClassName}>
              打开业务 drilldown
            </Link>
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          <div className={adminInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">7 天命中率抬升</div>
            <div className="mt-3 text-2xl text-adminInk">{formatPlan17Percent(plan17Business.authorLiftVsBaseline.averageLiftPp)}</div>
            <div className="mt-2 text-sm text-adminInkMuted">
              可比作者 {plan17Business.authorLiftVsBaseline.comparableAuthorCount}/{plan17Business.authorLiftVsBaseline.activatedAuthorCount}
            </div>
            <div className="mt-2 text-xs leading-6 text-adminInkMuted">
              baseline {formatPlan17Percent(plan17Business.authorLiftVsBaseline.baselineMedianHitRate)} · after {formatPlan17Percent(plan17Business.authorLiftVsBaseline.currentMedianHitRate)}
            </div>
          </div>
          <div className={adminInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">裂变 vs radar</div>
            <div className="mt-3 text-2xl text-adminInk">{formatPlan17Percent(plan17Business.fissionVsRadar.hitRateDeltaPp)}</div>
            <div className="mt-2 text-sm text-adminInkMuted">
              裂变 {plan17Business.fissionVsRadar.fissionReviewedCount} 篇 · radar {plan17Business.fissionVsRadar.radarReviewedCount} 篇
            </div>
            <div className="mt-2 text-xs leading-6 text-adminInkMuted">
              fission {formatPlan17Percent(plan17Business.fissionVsRadar.fissionHitRate)} · radar {formatPlan17Percent(plan17Business.fissionVsRadar.radarHitRate)}
            </div>
          </div>
          <div className={adminInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">矩阵号周产出</div>
            <div className="mt-3 text-2xl text-adminInk">{formatPlan17Percent(plan17Business.matrixWeeklyOutput.weeklyOutputGrowthPp)}</div>
            <div className="mt-2 text-sm text-adminInkMuted">
              周中位数 {plan17Business.matrixWeeklyOutput.weeklyOutputMedianBefore ?? "--"} → {plan17Business.matrixWeeklyOutput.weeklyOutputMedianAfter ?? "--"}
            </div>
            <div className="mt-2 text-xs leading-6 text-adminInkMuted">
              批次 {plan17Business.matrixWeeklyOutput.batchCount} · 质量回流 {formatPlan17Percent(plan17Business.matrixWeeklyOutput.observedQualityDeltaPp)}
            </div>
          </div>
          <div className={adminInsetCardClassName}>
            <div className="text-xs uppercase tracking-[0.16em] text-adminInkMuted">3+ 样本画像真实使用占比</div>
            <div className="mt-3 text-2xl text-adminInk">{formatPlan17Percent(plan17Business.styleHeatmapUsage.recent30dMultiSampleUsageShare)}</div>
            <div className="mt-2 text-sm text-adminInkMuted">
              近 30 天真实使用 {plan17Business.styleHeatmapUsage.recent30dMultiSampleUsageEventCount}/{plan17Business.styleHeatmapUsage.recent30dUsageEventCount}
            </div>
            <div className="mt-2 text-xs leading-6 text-adminInkMuted">
              累计真实使用 {plan17Business.styleHeatmapUsage.multiSampleUsageEventCount}/{plan17Business.styleHeatmapUsage.totalUsageEventCount}
            </div>
          </div>
        </div>
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
