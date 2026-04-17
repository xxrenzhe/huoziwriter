export function SettingsOverviewCards({
  items,
}: {
  items: Array<{
    title: string;
    description: string;
    href: string;
    metric: string;
    note: string;
  }>;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => (
        <a
          key={item.title}
          href={item.href}
          className="block border border-stone-300/40 bg-white p-6 shadow-ink transition-colors hover:border-cinnabar hover:bg-[#fffdfa]"
        >
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{item.title}</div>
          <div className="mt-3 font-serifCn text-4xl text-ink">{item.metric}</div>
          <div className="mt-3 text-sm text-stone-500">{item.note}</div>
          <p className="mt-4 text-sm leading-7 text-stone-700">{item.description}</p>
        </a>
      ))}
    </section>
  );
}
