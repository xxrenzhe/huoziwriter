import type { ReactNode } from "react";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const overviewCardClassName = cn(
  "group scroll-mt-8",
  surfaceCardStyles({ interactive: true }),
);
const overviewCardBodyClassName = cn(
  "flex h-full flex-col gap-5 p-6",
);
const overviewIconClassName = cn(
  "flex h-12 w-12 shrink-0 items-center justify-center border border-line bg-surfaceWarm text-cinnabar",
  "transition-colors group-hover:border-cinnabar/40 group-hover:bg-surface",
);
const overviewCtaClassName = "mt-auto flex items-center justify-between gap-3 border-t border-line pt-4 text-sm font-medium text-cinnabar";

export function SettingsOverviewCards({
  items,
}: {
  items: Array<{
    anchorId?: string;
    eyebrow?: string;
    title: string;
    description: string;
    href: string;
    metric: string;
    note: string;
    ctaLabel?: string;
    icon?: ReactNode;
  }>;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} id={item.anchorId} className={overviewCardClassName}>
          <Link href={item.href} className={overviewCardBodyClassName}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-inkFaint">
                  {item.eyebrow || item.title}
                </div>
                <div className="mt-3 font-serifCn text-4xl text-ink text-balance">
                  {item.metric}
                </div>
                <div className="mt-3 text-sm text-inkMuted">{item.note}</div>
              </div>
              {item.icon ? (
                <div className={overviewIconClassName}>
                  {item.icon}
                </div>
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-medium text-ink">{item.title}</h2>
              <p className="mt-3 text-sm leading-7 text-inkSoft">{item.description}</p>
            </div>
            <div className={overviewCtaClassName}>
              <span>{item.ctaLabel || "进入分区"}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </article>
      ))}
    </section>
  );
}
