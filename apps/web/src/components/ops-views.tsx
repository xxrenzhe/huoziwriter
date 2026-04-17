type OpsMetric = {
  label: string;
  value: string;
  note: string;
};

export function OpsOverview({
  title,
  description,
  metrics,
  panels,
}: {
  title: string;
  description: string;
  metrics: OpsMetric[];
  panels: Array<{ title: string; description: string; meta?: string }>;
}) {
  return (
    <div className="space-y-8">
      <section className="border border-stone-800 bg-stone-950 p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Operations Console</div>
        <h1 className="mt-4 font-serifCn text-4xl text-stone-100 md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-400">{description}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="border border-stone-800 bg-[#161616] p-5">
            <div className="text-xs uppercase tracking-[0.26em] text-stone-500">{metric.label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{metric.value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{metric.note}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {panels.map((panel) => (
          <article key={panel.title} className="border border-stone-800 bg-[#171718] p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{panel.meta ?? "模块"}</div>
            <h2 className="mt-4 font-serifCn text-2xl text-stone-100">{panel.title}</h2>
            <p className="mt-4 text-sm leading-7 text-stone-400">{panel.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
