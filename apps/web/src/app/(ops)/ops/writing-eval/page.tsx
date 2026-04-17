import Link from "next/link";
import { getOpsAuditLogs } from "@/lib/audit";
import { requireOpsSession } from "@/lib/page-auth";
import { getWritingEvalDatasets, getWritingEvalInsights, getWritingEvalRunSchedules, getWritingEvalScoringProfiles, getWritingEvalRuns, getWritingEvalVersions } from "@/lib/writing-eval";
import { uiPrimitives } from "@huoziwriter/ui";

function formatMetric(value: number | null | undefined, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPromptHref(assetType: string | null | undefined, assetRef: string | null | undefined) {
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

function getReadinessTone(status: string | null | undefined) {
  if (status === "ready") return "text-emerald-300";
  if (status === "warning") return "text-amber-200";
  if (status === "blocked") return "text-cinnabar";
  return "text-stone-400";
}

function getExecutionTone(state: string | null | undefined) {
  if (state === "executable") return "text-emerald-300 border-emerald-500/40";
  if (state === "blocked") return "text-cinnabar border-cinnabar/40";
  return "text-stone-400 border-stone-700";
}

function getStrategyActionLabel(item: { executionState: string | null | undefined; primaryExecutableScheduleId: number | null | undefined }) {
  if (item.primaryExecutableScheduleId) return "打开可执行调度";
  if (item.executionState === "blocked") return "修复阻断规则";
  if (item.executionState === "missing") return "创建或启用调度";
  return "打开对应调度";
}

export default async function OpsWritingEvalPage() {
  await requireOpsSession();
  const [datasets, runs, versions, insights, scoringProfiles, schedules, rolloutAuditLogs, promptRolloutAuditLogs] = await Promise.all([
    getWritingEvalDatasets(),
    getWritingEvalRuns(),
    getWritingEvalVersions(),
    getWritingEvalInsights(),
    getWritingEvalScoringProfiles(),
    getWritingEvalRunSchedules(),
    getOpsAuditLogs({
      action: "writing_asset_rollout_auto_manage",
      targetType: "writing_asset_rollout",
      limit: 120,
    }),
    getOpsAuditLogs({
      action: "prompt_rollout_auto_manage",
      targetType: "prompt_version",
      limit: 120,
    }),
  ]);

  const totalSampleCount = datasets.reduce((sum, item) => sum + item.sampleCount, 0);
  const activeDatasetCount = datasets.filter((item) => item.status === "active").length;
  const readyDatasetCount = datasets.filter((item) => item.readiness.status === "ready").length;
  const warningDatasetCount = datasets.filter((item) => item.readiness.status === "warning").length;
  const blockedDatasetCount = datasets.filter((item) => item.readiness.status === "blocked").length;
  const prioritizedDatasetIssues = datasets
    .filter((item) => item.readiness.status !== "ready")
    .sort((left, right) => {
      const rank = { blocked: 0, warning: 1, ready: 2 } as const;
      return rank[left.readiness.status] - rank[right.readiness.status];
    })
    .slice(0, 3);
  const succeededRunCount = runs.filter((item) => item.status === "succeeded").length;
  const processingRunCount = runs.filter((item) => ["queued", "running", "scoring", "promoting"].includes(item.status)).length;
  const keepCount = versions.filter((item) => item.decision === "keep").length;
  const rollbackCount = versions.filter((item) => item.decision === "rollback").length;
  const latestRun = runs[0] ?? null;
  const latestDecision = versions[0] ?? null;
  const enabledScheduleCount = schedules.filter((item) => item.isEnabled).length;
  const executableScheduleCount = schedules.filter(
    (item) => item.isEnabled && item.datasetStatus === "active" && item.readiness.status !== "blocked" && (item.decisionMode === "manual_review" || item.readiness.status === "ready"),
  ).length;
  const blockedEnabledScheduleCount = schedules.filter(
    (item) => item.isEnabled && (item.datasetStatus !== "active" || item.readiness.status === "blocked" || (item.decisionMode !== "manual_review" && item.readiness.status !== "ready")),
  ).length;
  const dueScheduleCount = schedules.filter((item) => item.isEnabled && item.nextRunAt && new Date(item.nextRunAt).getTime() <= Date.now()).length;
  const latestSchedule = schedules[0] ?? null;
  const activeScoringProfile = scoringProfiles.find((item) => item.isActive) ?? null;
  const onlineCalibration = insights.onlineCalibration;
  const topStrategyRecommendation = insights.strategyRecommendations?.[0] ?? null;
  const combinedRolloutAuditLogs = [...promptRolloutAuditLogs, ...rolloutAuditLogs].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const recentRolloutAuditLogs = combinedRolloutAuditLogs.filter((item) => Date.now() - new Date(item.createdAt).getTime() <= 24 * 60 * 60 * 1000);
  const autoRolloutActions = combinedRolloutAuditLogs.map((item) => {
    const payload = getRecord(item.payload);
    const previousConfig = getRecord(payload.previousConfig);
    const nextConfig = getRecord(payload.nextConfig);
    const previousPercentage = getNumber(previousConfig.rolloutPercentage) ?? 0;
    const nextPercentage = getNumber(nextConfig.rolloutPercentage) ?? 0;
    const previousObserveOnly = Boolean(previousConfig.rolloutObserveOnly);
    const nextObserveOnly = Boolean(nextConfig.rolloutObserveOnly);
    let direction: "expand" | "shrink" | "hold" = "hold";
    if (nextObserveOnly && !previousObserveOnly) {
      direction = "shrink";
    } else if (nextPercentage > previousPercentage) {
      direction = "expand";
    } else if (nextPercentage < previousPercentage || (!nextObserveOnly && previousObserveOnly)) {
      direction = "shrink";
    }
    return {
      createdAt: item.createdAt,
      direction,
      reason: String(payload.reason || "").trim() || null,
      riskLevel: String(payload.riskLevel || "").trim() || "stone",
      assetType:
        item.action === "prompt_rollout_auto_manage"
          ? "prompt_version"
          : String(payload.assetType || "").trim() || null,
      assetRef:
        item.action === "prompt_rollout_auto_manage"
          ? `${String(payload.promptId || "").trim()}@${String(payload.version || "").trim()}`
          : String(payload.assetRef || "").trim() || null,
      signals: getRecord(payload.signals),
    };
  });
  const expandActionCount = autoRolloutActions.filter((item) => item.direction === "expand").length;
  const shrinkActionCount = autoRolloutActions.filter((item) => item.direction === "shrink").length;
  const highRiskActionCount = autoRolloutActions.filter((item) => item.riskLevel === "cinnabar").length;
  const latestAutoRolloutAction = autoRolloutActions[0] ?? null;
  const latestRunHref = latestRun ? `/ops/writing-eval/runs?runId=${latestRun.id}` : null;
  const latestRunDatasetHref = latestRun?.datasetId ? `/ops/writing-eval/datasets?datasetId=${latestRun.datasetId}` : null;
  const latestRunBasePromptHref = latestRun ? buildPromptHref(latestRun.baseVersionType, latestRun.baseVersionRef) : null;
  const latestRunCandidatePromptHref = latestRun ? buildPromptHref(latestRun.candidateVersionType, latestRun.candidateVersionRef) : null;
  const runsSchedulesHref = latestSchedule ? `/ops/writing-eval/runs?scheduleId=${latestSchedule.id}` : "/ops/writing-eval/runs";
  const latestScheduleLastRunHref = latestSchedule?.lastRunId ? `/ops/writing-eval/runs?runId=${latestSchedule.lastRunId}` : null;
  const latestScheduleDatasetHref = latestSchedule?.datasetId ? `/ops/writing-eval/datasets?datasetId=${latestSchedule.datasetId}` : null;
  const latestScheduleBasePromptHref = latestSchedule ? buildPromptHref(latestSchedule.baseVersionType, latestSchedule.baseVersionRef) : null;
  const latestScheduleCandidatePromptHref = latestSchedule ? buildPromptHref(latestSchedule.candidateVersionType, latestSchedule.candidateVersionRef) : null;
  const topStrategyTargetScheduleId = topStrategyRecommendation?.primaryExecutableScheduleId ?? topStrategyRecommendation?.primaryScheduleId ?? null;
  const topStrategyHref = topStrategyTargetScheduleId
    ? `/ops/writing-eval/runs?scheduleId=${topStrategyTargetScheduleId}`
    : "/ops/writing-eval/runs";
  const latestDecisionHref = latestDecision
    ? `/ops/writing-eval/versions?assetType=${encodeURIComponent(latestDecision.versionType)}&assetRef=${encodeURIComponent(latestDecision.candidateContent)}&versionId=${latestDecision.id}`
    : null;
  const latestDecisionPromptHref = latestDecision
    ? buildPromptHref(latestDecision.versionType, latestDecision.candidateContent)
    : null;
  const latestAutoRolloutHref =
    latestAutoRolloutAction?.assetType && latestAutoRolloutAction.assetRef
      ? `/ops/writing-eval/versions?assetType=${encodeURIComponent(latestAutoRolloutAction.assetType)}&assetRef=${encodeURIComponent(latestAutoRolloutAction.assetRef)}`
      : null;
  const latestAutoRolloutPromptHref = buildPromptHref(latestAutoRolloutAction?.assetType, latestAutoRolloutAction?.assetRef);

  return (
    <div className="space-y-6">
      <section className={uiPrimitives.opsPanel + " p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Overview</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100">写作评测总览</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
              这里作为写作版 autoresearch 的总入口，统一查看评测集、实验运行、版本账本和长期校准状态，再决定该去哪个子页继续操作。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/ops/writing-eval/datasets" className={uiPrimitives.opsSecondaryButton}>
              Datasets
            </Link>
            <Link href="/ops/writing-eval/runs" className={uiPrimitives.opsSecondaryButton}>
              Runs
            </Link>
            <Link href="/ops/writing-eval/versions" className={uiPrimitives.opsSecondaryButton}>
              Versions
            </Link>
            <Link href="/ops/writing-eval/insights" className={uiPrimitives.opsSecondaryButton}>
              Insights
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "评测集", value: datasets.length, detail: `active ${activeDatasetCount} · 样本 ${totalSampleCount}` },
          { label: "就绪评测集", value: readyDatasetCount, detail: `warning ${warningDatasetCount} · blocked ${blockedDatasetCount}` },
          { label: "实验运行", value: runs.length, detail: `成功 ${succeededRunCount} · 处理中 ${processingRunCount}` },
          { label: "自动调度", value: schedules.length, detail: `启用 ${enabledScheduleCount} · 可执行 ${executableScheduleCount} · 阻断 ${blockedEnabledScheduleCount}` },
          { label: "版本账本", value: versions.length, detail: `keep ${keepCount} · rollback ${rollbackCount}` },
          {
            label: "线上回流",
            value: onlineCalibration.feedbackCount,
            detail: `观察爆款 ${formatMetric(onlineCalibration.averageObservedViralScore)} · 偏差 ${formatMetric(onlineCalibration.averageCalibrationGap)}`,
          },
          {
            label: "自动放量",
            value: combinedRolloutAuditLogs.length,
            detail: `24h ${recentRolloutAuditLogs.length} · 扩量 ${expandActionCount} · 收缩 ${shrinkActionCount}`,
          },
        ].map((item) => (
          <div key={item.label} className={uiPrimitives.opsPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
            <div className="mt-3 text-3xl text-stone-100">{item.value}</div>
            <div className="mt-3 text-sm text-stone-500">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className={uiPrimitives.opsPanel + " p-5"}>
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
                href: "/ops/writing-eval/datasets",
                title: "Datasets",
                description: "管理评测集、难度分布、样本表格和样本编辑器。",
                meta: `${datasets.length} 个数据集 · ${totalSampleCount} 条样本`,
              },
              {
                href: "/ops/writing-eval/runs",
                title: "Runs",
                description: "发起实验、配置自动调度、查看运行状态并对比候选与基线输出。",
                meta: `${runs.length} 条运行 · 调度 ${enabledScheduleCount}/${schedules.length} · 最近 ${latestRun?.runCode || "暂无"}`,
              },
              {
                href: "/ops/writing-eval/versions",
                title: "Versions",
                description: "查看 keep / discard / rollback 账本，并从 keep 记录直接回滚。",
                meta: `${versions.length} 条账本 · 最新 ${latestDecision?.decision || "暂无"} · 自动放量 ${combinedRolloutAuditLogs.length} 条`,
              },
              {
                href: "/ops/writing-eval/insights",
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
          <section className={uiPrimitives.opsPanel + " p-5"}>
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
                  ready {readyDatasetCount} · warning {warningDatasetCount} · blocked {blockedDatasetCount}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {blockedDatasetCount > 0
                    ? "存在会阻断自动实验的数据集，建议优先回到 Datasets 补齐目标与事实素材。"
                    : warningDatasetCount > 0
                      ? "当前没有阻断项，但仍有覆盖告警，自动决议前建议继续补样本。"
                      : "当前评测集已经满足自动实验的最低守卫要求。"}
                </div>
                {prioritizedDatasetIssues.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {prioritizedDatasetIssues.map((dataset) => (
                      <div key={dataset.id} className="text-xs leading-6 text-stone-400">
                        <Link
                          href={`/ops/writing-eval/datasets?datasetId=${dataset.id}`}
                          className={`transition hover:text-cinnabar ${getReadinessTone(dataset.readiness.status)}`}
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
                    ? `候选 ${formatMetric(typeof latestRun.scoreSummary.totalScore === "number" ? latestRun.scoreSummary.totalScore : null)} · Delta ${formatMetric(typeof latestRun.scoreSummary.deltaTotalScore === "number" ? latestRun.scoreSummary.deltaTotalScore : null)}`
                    : "创建第一条运行后，这里会显示最新实验状态。"}
                </div>
                {latestRunHref || latestRunDatasetHref || latestRunBasePromptHref || latestRunCandidatePromptHref ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {latestRunHref ? (
                      <Link href={latestRunHref} className={uiPrimitives.opsSecondaryButton}>
                        打开对应 Run
                      </Link>
                    ) : null}
                    {latestRunDatasetHref ? (
                      <Link href={latestRunDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestRunBasePromptHref ? (
                      <Link href={latestRunBasePromptHref} className={uiPrimitives.opsSecondaryButton}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestRunCandidatePromptHref ? (
                      <Link href={latestRunCandidatePromptHref} className={uiPrimitives.opsSecondaryButton}>
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
                      <Link href={latestDecisionHref} className={uiPrimitives.opsSecondaryButton}>
                        打开聚焦账本
                      </Link>
                    ) : null}
                    {latestDecisionPromptHref ? (
                      <Link href={latestDecisionPromptHref} className={uiPrimitives.opsSecondaryButton}>
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
                      下次执行 {latestSchedule.nextRunAt ? new Date(latestSchedule.nextRunAt).toLocaleString("zh-CN") : "未设置"} · 最近 Run{" "}
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
                      <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getExecutionTone(latestSchedule.readiness.status)}`}>
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
                    <Link href={runsSchedulesHref} className={uiPrimitives.opsSecondaryButton}>
                      打开 Runs 调度面板
                    </Link>
                    {latestScheduleLastRunHref ? (
                      <Link href={latestScheduleLastRunHref} className={uiPrimitives.opsSecondaryButton}>
                        打开最近 Run
                      </Link>
                    ) : null}
                    {latestScheduleDatasetHref ? (
                      <Link href={latestScheduleDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                        打开评测集
                      </Link>
                    ) : null}
                    {latestScheduleBasePromptHref ? (
                      <Link href={latestScheduleBasePromptHref} className={uiPrimitives.opsSecondaryButton}>
                        基线 Prompt
                      </Link>
                    ) : null}
                    {latestScheduleCandidatePromptHref ? (
                      <Link href={latestScheduleCandidatePromptHref} className={uiPrimitives.opsSecondaryButton}>
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
                      <span className={`border px-2 py-1 uppercase tracking-[0.16em] ${getExecutionTone(topStrategyRecommendation.executionState)}`}>
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
                      <Link href={topStrategyHref} className={uiPrimitives.opsSecondaryButton}>
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
                    ? `${latestAutoRolloutAction.assetType || "asset"} · ${latestAutoRolloutAction.direction === "expand" ? "扩量" : latestAutoRolloutAction.direction === "shrink" ? "收缩" : "维持"}`
                    : "暂无自动动作"}
                </div>
                <div className="mt-2 text-sm text-stone-500">
                  {latestAutoRolloutAction
                    ? `${new Date(latestAutoRolloutAction.createdAt).toLocaleString("zh-CN")} · 风险 ${latestAutoRolloutAction.riskLevel} · ${latestAutoRolloutAction.reason || "无原因"}`
                    : "scheduler 写入自动放量审计后，这里会显示最近一次自动收缩或扩量。"}
                </div>
                {latestAutoRolloutAction ? (
                  <>
                    <div className="mt-3 text-xs text-stone-500">
                      回流 {formatMetric(getNumber(latestAutoRolloutAction.signals.feedbackCount), 0)} · 用户 {formatMetric(getNumber(latestAutoRolloutAction.signals.uniqueUsers), 0)} ·
                      打开 {formatMetric(getNumber(latestAutoRolloutAction.signals.openRate), 1)}%
                    </div>
                    {latestAutoRolloutHref || latestAutoRolloutPromptHref ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {latestAutoRolloutHref ? (
                          <Link href={latestAutoRolloutHref} className={uiPrimitives.opsSecondaryButton}>
                            打开聚焦账本
                          </Link>
                        ) : null}
                        {latestAutoRolloutPromptHref ? (
                          <Link href={latestAutoRolloutPromptHref} className={uiPrimitives.opsSecondaryButton}>
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

          <section className={uiPrimitives.opsPanel + " p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">最近趋势</div>
            <div className="mt-4 space-y-3">
              {insights.trend.slice(-5).reverse().map((item) => (
                <div key={item.runId} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/ops/writing-eval/runs?runId=${item.runId}`} className="font-mono text-xs text-stone-300 transition hover:text-cinnabar">
                      {item.runCode}
                    </Link>
                    <div className="text-xs text-stone-500">{new Date(item.createdAt).toLocaleString("zh-CN")}</div>
                  </div>
                  <div className="mt-3 text-sm text-stone-400">
                    质量 {formatMetric(item.qualityScore)} · 爆款 {formatMetric(item.viralScore)} · 总分 {formatMetric(item.totalScore)}
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
