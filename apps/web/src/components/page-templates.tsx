import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className={`font-sansCn text-xs uppercase tracking-[0.28em] ${dark ? "text-stone-500" : "text-cinnabar"}`}>
        {eyebrow}
      </div>
      <h1 className={`max-w-4xl font-serifCn text-4xl font-semibold leading-tight md:text-6xl ${dark ? "text-stone-100" : "text-ink"}`}>
        {title}
      </h1>
      <p className={`max-w-3xl text-base leading-8 md:text-lg ${dark ? "text-stone-400" : "text-stone-700"}`}>
        {description}
      </p>
    </section>
  );
}

export function PaperGrid({
  items,
  dark = false,
}: {
  items: Array<{ title: string; description: string }>;
  dark?: boolean;
}) {
  return (
    <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article
          key={item.title}
          className={`p-6 shadow-ink ${
            dark ? "bg-[#1A1A1A]" : "bg-white"
          }`}
        >
          <h2 className={`font-serifCn text-2xl font-semibold ${dark ? "text-stone-100" : "text-ink"}`}>
            {item.title}
          </h2>
          <p className={`mt-3 text-sm leading-7 ${dark ? "text-stone-400" : "text-stone-700"}`}>
            {item.description}
          </p>
        </article>
      ))}
    </section>
  );
}

export function SplitPanel({
  left,
  right,
}: {
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <section className="mt-10 grid gap-6 lg:grid-cols-2">
      <div className="bg-white p-6 shadow-ink">{left}</div>
      <div className="bg-panel p-6">{right}</div>
    </section>
  );
}
