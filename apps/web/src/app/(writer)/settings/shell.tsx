import type { ReactNode } from "react";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { settingsSections, type SettingsSectionKey } from "./sections";

export function SettingsSubpageShell({
  current,
  eyebrow,
  title,
  description,
  stats = [],
  actions,
  children,
}: {
  current: SettingsSectionKey;
  eyebrow?: string;
  title?: string;
  description?: string;
  stats?: Array<{ label: string; value: string; note: string }>;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const currentSection = settingsSections.find((section) => section.key === current) ?? settingsSections[0];

  return (
    <div className="space-y-8">
      <section className={surfaceCardStyles({ tone: "warm", padding: "lg" })}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-inkMuted transition-colors hover:text-cinnabar"
            >
              <ChevronLeft className="h-4 w-4" />
              返回设置总览
            </Link>
            <div className="mt-5 text-xs uppercase tracking-[0.24em] text-cinnabar">
              {eyebrow || currentSection.eyebrow}
            </div>
            <h1 className="mt-3 font-serifCn text-4xl text-ink text-balance">
              {title || currentSection.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-inkSoft">
              {description || currentSection.description}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
        {stats.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((item) => (
              <article key={item.label} className={surfaceCardStyles({ padding: "sm" })}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                  {item.label}
                </div>
                <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
                  {item.value}
                </div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <nav className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {settingsSections.map((section) => {
          const active = section.key === current;
          return (
            <Link
              key={section.key}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                surfaceCardStyles({ padding: "sm" }),
                active
                  ? "border-cinnabar bg-surfaceWarning"
                  : "border-lineStrong bg-surface hover:border-cinnabar hover:bg-surfaceHighlight",
              )}
            >
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                {section.eyebrow}
              </div>
              <div className="mt-2 font-medium text-ink">{section.title}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">
                {section.description}
              </div>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
