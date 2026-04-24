import Link from "next/link";
import { getAiCallObservationsDashboard } from "@/lib/ai-call-observations";
import { requireAdminSession } from "@/lib/page-auth";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const mutedPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted p-5 text-adminInk shadow-none");
const mobileListClassName = "mt-4 grid gap-3 md:hidden";
const mobileCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-adminLineStrong bg-adminSurfaceMuted text-adminInk shadow-none");
const actionClassName = buttonStyles({ variant: "secondary", size: "sm" });
const eyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const accentEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminAccent";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatLatency(value: number | null) {
  if (value == null) {
    return "--";
  }
  return `${value} ms`;
}

function formatPercent(value: number | null) {
  if (value == null) {
    return "--";
  }
  return `${(value * 100).toFixed(0)}%`;
}

function getStatusBadgeClassName(status: "success" | "retried" | "failed") {
  if (status === "success") {
    return "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "retried") {
    return "border border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border border-cinnabar/40 bg-cinnabar/10 text-cinnabar";
}

export default async function AdminAiRoutingObservationsPage() {
  await requireAdminSession();
  const dashboard = await getAiCallObservationsDashboard(24);

  return (
    <section className="space-y-6">
      <article className={cn(panelClassName, "grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end")}>
        <div>
          <div className={accentEyebrowClassName}>AI Call Observations</div>
          <h1 className="mt-4 font-serifCn text-4xl text-adminInk text-balance">AI 调用观测与缓存命中看板</h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-adminInkSoft">
            每次 `generateSceneText()` 调用都会异步写一条观测，按 scene / model 聚合展示调用量、失败率、重试占比、平均时延和缓存读命中率。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/ai-routing" className={actionClassName}>
            返回路由页
          </Link>
          <Link href="/admin/ai-routing/observations" className={actionClassName}>
            刷新看板
          </Link>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-4">
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>总调用量</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{dashboard.summary.callCount}</div>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>失败率</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{formatPercent(dashboard.summary.failureRate)}</div>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>重试占比</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{formatPercent(dashboard.summary.callCount > 0 ? dashboard.summary.retriedCount / dashboard.summary.callCount : null)}</div>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>缓存读命中率</div>
          <div className="mt-3 font-serifCn text-4xl text-adminInk">{formatPercent(dashboard.summary.cacheHitRate)}</div>
        </article>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <article className={panelClassName}>
          <div className={eyebrowClassName}>按 Scene 聚合</div>
          <div className={mobileListClassName}>
            {dashboard.byScene.map((item) => (
              <div key={item.label} className={mobileCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={eyebrowClassName}>Scene</div>
                    <div className="mt-2 text-base text-adminInk">{item.label}</div>
                  </div>
                  <div className="text-right">
                    <div className={eyebrowClassName}>调用</div>
                    <div className="mt-2 font-serifCn text-2xl text-adminInk">{item.callCount}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className={eyebrowClassName}>失败率</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatPercent(item.failureRate)}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>重试</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{item.retriedCount}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>缓存读</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatPercent(item.cacheHitRate)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-adminLineStrong text-adminInkMuted">
                <tr>
                  <th className="py-3 pr-4 font-medium">Scene</th>
                  <th className="py-3 pr-4 font-medium">调用</th>
                  <th className="py-3 pr-4 font-medium">失败率</th>
                  <th className="py-3 pr-4 font-medium">重试</th>
                  <th className="py-3 font-medium">缓存读</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byScene.map((item) => (
                  <tr key={item.label} className="border-b border-adminLineStrong/60 last:border-b-0">
                    <td className="py-3 pr-4 text-adminInk">{item.label}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{item.callCount}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{formatPercent(item.failureRate)}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{item.retriedCount}</td>
                    <td className="py-3 text-adminInkSoft">{formatPercent(item.cacheHitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={panelClassName}>
          <div className={eyebrowClassName}>按 Model 聚合</div>
          <div className={mobileListClassName}>
            {dashboard.byModel.map((item) => (
              <div key={`${item.provider || "na"}:${item.label}`} className={mobileCardClassName}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={eyebrowClassName}>Model</div>
                    <div className="mt-2 text-base text-adminInk">{item.label}</div>
                  </div>
                  <div className="text-right">
                    <div className={eyebrowClassName}>调用</div>
                    <div className="mt-2 font-serifCn text-2xl text-adminInk">{item.callCount}</div>
                  </div>
                </div>
                <div className="mt-3 text-sm leading-6 text-adminInkSoft">
                  {(item.provider || "--")} · {(item.callMode || "--")}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className={eyebrowClassName}>平均时延</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatLatency(item.averageLatencyMs)}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>缓存读</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatPercent(item.cacheHitRate)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-adminLineStrong text-adminInkMuted">
                <tr>
                  <th className="py-3 pr-4 font-medium">Model</th>
                  <th className="py-3 pr-4 font-medium">模式</th>
                  <th className="py-3 pr-4 font-medium">Provider</th>
                  <th className="py-3 pr-4 font-medium">调用</th>
                  <th className="py-3 pr-4 font-medium">平均时延</th>
                  <th className="py-3 font-medium">缓存读</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byModel.map((item) => (
                  <tr key={`${item.provider || "na"}:${item.label}`} className="border-b border-adminLineStrong/60 last:border-b-0">
                    <td className="py-3 pr-4 text-adminInk">{item.label}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{item.callMode || "--"}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{item.provider || "--"}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{item.callCount}</td>
                    <td className="py-3 pr-4 text-adminInkSoft">{formatLatency(item.averageLatencyMs)}</td>
                    <td className="py-3 text-adminInkSoft">{formatPercent(item.cacheHitRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <article className={panelClassName}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={eyebrowClassName}>最近调用</div>
            <div className="mt-2 text-sm leading-7 text-adminInkSoft">用于快速确认某个 scene 的最新调用是否写入了观测表。</div>
          </div>
          <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">最近 24 条</div>
        </div>
        <div className="mt-4 space-y-3">
          {dashboard.recentCalls.length === 0 ? (
            <div className="rounded-2xl border border-adminLineStrong bg-adminSurfaceMuted px-4 py-5 text-sm text-adminInkSoft">
              还没有任何调用观测。
            </div>
          ) : (
            dashboard.recentCalls.map((item) => (
              <div key={item.id} className="rounded-2xl border border-adminLineStrong bg-adminSurfaceMuted px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-adminInk">{item.sceneCode}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.18em] text-adminInkMuted">
                      {item.provider} · {item.model} · {item.callMode}
                      </div>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getStatusBadgeClassName(item.status))}>
                    {item.status}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  <div>
                    <div className={eyebrowClassName}>时间</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatDateTime(item.createdAt)}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>时延</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{formatLatency(item.latencyMs)}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>输入 / 输出</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{item.inputTokens ?? "--"} / {item.outputTokens ?? "--"}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>缓存写 / 读</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{item.cacheCreationTokens ?? "--"} / {item.cacheReadTokens ?? "--"}</div>
                  </div>
                  <div>
                    <div className={eyebrowClassName}>错误分类</div>
                    <div className="mt-1 text-sm text-adminInkSoft">{item.errorClass || "--"}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
