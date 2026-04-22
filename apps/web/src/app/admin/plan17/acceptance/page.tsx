import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { requireAdminSession } from "@/lib/page-auth";
import { getPlan17AcceptanceReport, type Plan17AcceptanceStatus } from "@/lib/plan17-acceptance";

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const mutedPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted p-5 text-adminInk shadow-none");
const metricValueClassName = "mt-3 font-serifCn text-4xl text-adminInk text-balance";
const eyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const accentEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminAccent";
const titleClassName = "mt-4 font-serifCn text-4xl text-adminInk text-balance";
const descriptionClassName = "mt-4 text-sm leading-7 text-adminInkSoft";
const actionClassName = "inline-flex items-center justify-center rounded-full border border-adminLineStrong bg-adminSurfaceAlt px-4 py-2 text-sm text-adminInk transition hover:border-adminAccent hover:text-adminAccent";
const tableCellClassName = "px-4 py-4 align-top";

function formatDateTime(value: string | null) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatMetricValue(value: number | string | null | undefined) {
  if (value == null) {
    return "--";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/\.?0+$/, "");
  }
  return value;
}

function getStatusBadgeClassName(status: Plan17AcceptanceStatus) {
  if (status === "passed") {
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "partial") {
    return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border border-cinnabar/40 bg-cinnabar/10 text-cinnabar";
}

function getStatusLabel(status: Plan17AcceptanceStatus) {
  if (status === "passed") return "已通过";
  if (status === "partial") return "部分通过";
  return "阻塞";
}

export default async function AdminPlan17AcceptancePage() {
  await requireAdminSession();
  const report = await getPlan17AcceptanceReport();

  return (
    <section className="space-y-6">
      <article className={cn(panelClassName, "grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end")}>
        <div>
          <div className={accentEyebrowClassName}>Plan 17 Acceptance</div>
          <h1 className={titleClassName}>自动验收总览</h1>
          <p className={descriptionClassName}>
            把 `11.1` 功能验收、`11.2` 质量验收、`11.3` 业务验收、`11.4` 非功能验收汇总到一个后台视图里，先看当前整体状态，再顺着 top gaps 去补阻塞项。
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-adminInkMuted">
            生成于 {formatDateTime(report.generatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a className={actionClassName} href="/api/admin/plan17/acceptance" target="_blank" rel="noreferrer">
            打开 JSON
          </a>
          <a className={actionClassName} href="/admin/plan17/quality">
            去质量页
          </a>
          <a className={actionClassName} href="/admin/plan17/business">
            去业务页
          </a>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>整体状态</div>
          <div className={metricValueClassName}>{getStatusLabel(report.overallStatus)}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">按四大验收章节自动聚合，任何一节 blocked 都会把整体压回 partial 或 blocked。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>已通过项</div>
          <div className={metricValueClassName}>{report.summary.passedCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">当前已通过 {report.summary.passedCount}/{report.summary.totalCount} 个验收子项。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>部分通过</div>
          <div className={metricValueClassName}>{report.summary.partialCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">这些项通常说明口径已接通，但样本量、显著性或观察窗还没到门槛。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>阻塞项</div>
          <div className={metricValueClassName}>{report.summary.blockedCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">优先处理这里，通常是缺事实源、缺样本或明确未达阈值。</p>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {report.sections.map((section) => (
          <article key={section.key} className={panelClassName}>
            <div className="flex items-center justify-between gap-3">
              <div className={eyebrowClassName}>{section.label}</div>
              <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(section.status))}>
                {getStatusLabel(section.status)}
              </span>
            </div>
            <div className="mt-4 font-serifCn text-3xl text-adminInk">
              {section.passedCount}/{section.totalCount}
            </div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">
              blocked {section.items.filter((item) => item.status === "blocked").length} · partial {section.items.filter((item) => item.status === "partial").length}
            </p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>Top Gaps</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">按阻塞优先级排序，先处理最能改变整体状态的缺口。</div>
            </div>
          </div>
          {report.topGaps.length === 0 ? (
            <div className="mt-6 text-sm leading-7 text-adminInkSoft">当前没有 top gap，说明所有章节都已通过。</div>
          ) : (
            <div className="mt-6 space-y-3">
              {report.topGaps.map((gap) => (
                <article key={`${gap.section}-${gap.key}`} className={mutedPanelClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={eyebrowClassName}>{gap.section}</div>
                      <div className="mt-2 text-lg text-adminInk">{gap.label}</div>
                    </div>
                    <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(gap.status))}>
                      {getStatusLabel(gap.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-adminInkSoft">{gap.detail}</p>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className={panelClassName}>
          <div className={eyebrowClassName}>页面跳转</div>
          <div className="mt-6 grid gap-3">
            <a className={actionClassName} href="/admin/plan17/quality">Plan17 质量验收桶</a>
            <a className={actionClassName} href="/admin/plan17/business">Plan17 业务验收报表</a>
            <a className={actionClassName} href="/admin/plan17/rhythm-templates">节奏模板管理</a>
            <a className={actionClassName} href="/admin/writing-eval">写作评测总览</a>
          </div>
        </article>
      </div>

      {report.sections.map((section) => (
        <article key={`detail-${section.key}`} className={panelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={eyebrowClassName}>{section.label}</div>
              <div className="mt-3 text-sm leading-7 text-adminInkSoft">
                当前状态 {getStatusLabel(section.status)}，已通过 {section.passedCount}/{section.totalCount}。
              </div>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(section.status))}>
              {getStatusLabel(section.status)}
            </span>
          </div>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-adminBg text-adminInkMuted">
                <tr>
                  {["子项", "状态", "说明", "关键指标"].map((head) => (
                    <th key={`${section.key}-${head}`} className="px-4 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => (
                  <tr key={`${section.key}-${item.key}`} className="border-t border-adminLineStrong">
                    <td className={tableCellClassName}>{item.label}</td>
                    <td className={tableCellClassName}>
                      <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(item.status))}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className={cn(tableCellClassName, "min-w-[360px] text-adminInkSoft")}>{item.detail}</td>
                    <td className={cn(tableCellClassName, "text-adminInkSoft")}>
                      {item.metrics && Object.keys(item.metrics).length > 0
                        ? Object.entries(item.metrics).map(([key, value]) => `${key}: ${formatMetricValue(value)}`).join(" · ")
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </section>
  );
}
