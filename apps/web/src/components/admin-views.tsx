import { cn, surfaceCardStyles } from "@huoziwriter/ui";

type AdminMetric = {
  label: string;
  value: string;
  note: string;
};

const adminOverviewPanelBaseClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface text-adminInk shadow-none");
const adminOverviewHeroClassName = cn(adminOverviewPanelBaseClassName, "bg-adminBg p-6 md:p-8");
const adminOverviewMetricCardClassName = cn(adminOverviewPanelBaseClassName, "bg-adminSurfaceAlt p-5");
const adminOverviewModuleCardClassName = cn(adminOverviewPanelBaseClassName, "p-6");

export function AdminOverview({
  title,
  description,
  metrics,
  panels,
}: {
  title: string;
  description: string;
  metrics: AdminMetric[];
  panels: Array<{ title: string; description: string; meta?: string }>;
}) {
  return (
    <div className="space-y-8">
      <section className={adminOverviewHeroClassName}>
        <div className="text-xs uppercase tracking-[0.3em] text-adminAccent">Admin Console</div>
        <h1 className="mt-4 font-serifCn text-4xl text-adminInk md:text-5xl text-balance">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-adminInkSoft">{description}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className={adminOverviewMetricCardClassName}>
            <div className="text-xs uppercase tracking-[0.26em] text-adminInkMuted">{metric.label}</div>
            <div className="mt-3 font-serifCn text-4xl text-adminInk text-balance">{metric.value}</div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">{metric.note}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {panels.map((panel) => (
          <article key={panel.title} className={adminOverviewModuleCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">{panel.meta ?? "模块"}</div>
            <h2 className="mt-4 font-serifCn text-2xl text-adminInk text-balance">{panel.title}</h2>
            <p className="mt-4 text-sm leading-7 text-adminInkSoft">{panel.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
