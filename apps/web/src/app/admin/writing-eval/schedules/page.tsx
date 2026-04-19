import Link from "next/link";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import {
  buildAdminPromptVersionHref,
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
} from "@/lib/admin-writing-eval-links";
import { requireAdminSession } from "@/lib/page-auth";
import { formatWritingEvalDateTime } from "@/lib/writing-eval-format";
import { getWritingEvalScheduleStats, isWritingEvalScheduleExecutable } from "@/lib/writing-eval-view";
import { getWritingEvalRunSchedules } from "@/lib/writing-eval";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const pagePanelClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surface shadow-none");
const heroPanelClassName = cn(pagePanelClassName, "bg-paperStrong p-6 md:p-8");
const metricCardClassName = cn(pagePanelClassName, "p-5");
const sectionCardClassName = cn(pagePanelClassName, "p-5");
const insetCardClassName = cn(surfaceCardStyles(), "border-lineStrong bg-surfaceWarm px-4 py-4 shadow-none");
const actionLinkClassName = buttonStyles({ variant: "secondary", size: "sm" });

export default async function AdminWritingEvalSchedulesPage() {
  await requireAdminSession();
  const schedules = await getWritingEvalRunSchedules();
  const stats = getWritingEvalScheduleStats(schedules);
  const disabledCount = schedules.length - stats.enabledCount;
  const latestSchedule = schedules[0] ?? null;
  const dueSchedules = schedules
    .filter((item) => item.isEnabled && item.nextRunAt && new Date(item.nextRunAt).getTime() <= Date.now())
    .sort((left, right) => new Date(left.nextRunAt || 0).getTime() - new Date(right.nextRunAt || 0).getTime())
    .slice(0, 5);
  const blockedSchedules = schedules.filter((item) => item.isEnabled && !isWritingEvalScheduleExecutable(item)).slice(0, 5);
  const erroredSchedules = schedules.filter((item) => item.isEnabled && item.lastError).slice(0, 5);

  return (
    <div className="space-y-6">
      <section className={heroPanelClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Schedules</div>
            <h1 className="mt-4 font-serifCn text-4xl text-ink text-balance">自动调度与执行守卫</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-inkSoft">
              这里单独查看调度规则、执行阻断和最近派发窗口。实验运行仍在 Runs 页完成，但调度健康度和可执行性在这里集中判断。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "runs", "versions", "insights", "scoring", "governance"]} className="flex flex-wrap gap-3" />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "调度总数",
            value: String(schedules.length),
            detail: `启用 ${stats.enabledCount} · 禁用 ${disabledCount}`,
          },
          {
            label: "可执行",
            value: String(stats.executableCount),
            detail: `阻断 ${stats.blockedEnabledCount} · due ${stats.dueCount}`,
          },
          {
            label: "异常调度",
            value: String(erroredSchedules.length),
            detail: erroredSchedules[0]?.name || "当前没有最近错误",
          },
          {
            label: "最近规则",
            value: latestSchedule?.name || "暂无",
            detail: latestSchedule?.nextRunAt ? `下次 ${formatWritingEvalDateTime(latestSchedule.nextRunAt)}` : "尚未设置下次执行",
          },
        ].map((item) => (
          <article key={item.label} className={metricCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
            <div className="mt-3 text-3xl text-ink text-balance">{item.value}</div>
            <div className="mt-3 text-sm text-inkSoft">{item.detail}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className={sectionCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">到期待派发</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">当前已到执行窗口</h2>
          <div className="mt-4 space-y-3">
            {dueSchedules.map((item) => (
              <article key={item.id} className={insetCardClassName}>
                <div className="text-sm text-ink">{item.name}</div>
                <div className="mt-2 text-xs leading-6 text-inkMuted">
                  {item.nextRunAt ? `下次 ${formatWritingEvalDateTime(item.nextRunAt)}` : "未设置下次执行"} · {item.datasetName || "未绑定数据集"}
                </div>
                <div className="mt-3">
                  <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={actionLinkClassName}>
                    打开对应调度
                  </Link>
                </div>
              </article>
            ))}
            {dueSchedules.length === 0 ? <div className="text-sm text-inkMuted">当前没有到期待派发的规则。</div> : null}
          </div>
        </div>

        <div className={sectionCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">阻断规则</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">需要先修守卫再运行</h2>
          <div className="mt-4 space-y-3">
            {blockedSchedules.map((item) => (
              <article key={item.id} className={insetCardClassName}>
                <div className="text-sm text-ink">{item.name}</div>
                <div className="mt-2 text-xs leading-6 text-cinnabar">
                  {item.readiness.blockers.length > 0 ? item.readiness.blockers.join("；") : "当前调度不满足执行条件"}
                </div>
                <div className="mt-3">
                  <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={actionLinkClassName}>
                    去修这条调度
                  </Link>
                </div>
              </article>
            ))}
            {blockedSchedules.length === 0 ? <div className="text-sm text-inkMuted">当前没有被守卫阻断的启用调度。</div> : null}
          </div>
        </div>

        <div className={sectionCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近错误</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">执行异常与最后错误</h2>
          <div className="mt-4 space-y-3">
            {erroredSchedules.map((item) => (
              <article key={item.id} className={insetCardClassName}>
                <div className="text-sm text-ink">{item.name}</div>
                <div className="mt-2 text-xs leading-6 text-warning">{item.lastError || "未记录错误"}</div>
                <div className="mt-3">
                  <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.id })} className={actionLinkClassName}>
                    打开排查
                  </Link>
                </div>
              </article>
            ))}
            {erroredSchedules.length === 0 ? <div className="text-sm text-inkMuted">当前没有最近执行报错的调度。</div> : null}
          </div>
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">全部调度</div>
            <h2 className="mt-3 font-serifCn text-2xl text-ink text-balance">规则、数据集、版本与最近运行一起看</h2>
          </div>
          <div className="text-sm text-inkMuted">{schedules.length} 条规则</div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {schedules.map((item) => {
            const datasetHref = buildAdminWritingEvalDatasetsHref({ datasetId: item.datasetId });
            const runHref = buildAdminWritingEvalRunsHref({ scheduleId: item.id });
            const basePromptHref = item.baseVersionType === "prompt_version" ? buildAdminPromptVersionHref(item.baseVersionRef) : null;
            const candidatePromptHref = item.candidateVersionType === "prompt_version" ? buildAdminPromptVersionHref(item.candidateVersionRef) : null;

            return (
              <article key={item.id} className={insetCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                      #{item.id} · {item.isEnabled ? "enabled" : "disabled"}
                    </div>
                    <div className="mt-2 font-serifCn text-xl text-ink text-balance">{item.name}</div>
                    <div className="mt-2 text-sm leading-7 text-inkSoft">{item.summary || "当前未填写调度摘要。"} </div>
                  </div>
                  <div className={`border px-2 py-1 text-xs ${
                    item.readiness.status === "ready"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : item.readiness.status === "blocked"
                        ? "border-danger/30 bg-surface text-danger"
                        : "border-warning/40 bg-surfaceWarning text-warning"
                  }`}>
                    {item.readiness.status}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-inkMuted sm:grid-cols-2">
                  <div>优先级 P{item.priority} · {item.cadenceHours}h cadence</div>
                  <div>{item.agentStrategy} · {item.decisionMode}</div>
                  <div>数据集：{item.datasetName || item.datasetId}</div>
                  <div>启用样本 {item.readiness.enabledCaseCount} / {item.readiness.totalCaseCount}</div>
                </div>
                {item.readiness.blockers.length > 0 ? (
                  <div className="mt-3 text-xs leading-6 text-cinnabar">阻断：{item.readiness.blockers.join("；")}</div>
                ) : null}
                {item.readiness.warnings.length > 0 ? (
                  <div className="mt-2 text-xs leading-6 text-warning">告警：{item.readiness.warnings.slice(0, 2).join("；")}</div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href={runHref} className={actionLinkClassName}>打开调度</Link>
                  <Link href={datasetHref} className={actionLinkClassName}>评测集</Link>
                  {basePromptHref ? <Link href={basePromptHref} className={actionLinkClassName}>基线 Prompt</Link> : null}
                  {candidatePromptHref ? <Link href={candidatePromptHref} className={actionLinkClassName}>候选 Prompt</Link> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
