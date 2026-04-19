import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { getReviewData } from "@/lib/article-outcomes";
import { requireWriterSession } from "@/lib/page-auth";

const pageClassName = "space-y-8";
const heroSectionClassName = surfaceCardStyles({ tone: "subtle", padding: "lg" });
const standardSurfaceClassName = surfaceCardStyles({ padding: "md" });
const sectionHeaderClassName = "flex flex-wrap items-end justify-between gap-4";
const accentEyebrowClassName = "text-xs uppercase text-cinnabar";
const heroEyebrowClassName = cn(accentEyebrowClassName, "tracking-[0.3em]");
const sectionEyebrowClassName = cn(accentEyebrowClassName, "tracking-[0.28em]");
const headingBaseClassName = "font-serifCn text-ink text-balance";
const heroTitleClassName = cn(headingBaseClassName, "mt-4 text-4xl font-semibold md:text-5xl");
const sectionTitleClassName = cn(headingBaseClassName, "mt-3 text-3xl");
const heroDescriptionClassName = "mt-4 max-w-3xl text-base leading-8 text-inkSoft";
const bodyCopyClassName = "text-sm leading-7 text-inkSoft";
const statsGridClassName = "mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4";
const statLabelClassName = "text-xs uppercase tracking-[0.24em] text-inkMuted";
const statValueClassName = cn(headingBaseClassName, "mt-3 text-4xl");
const statNoteClassName = cn("mt-3", bodyCopyClassName);
const cardTitleClassName = "font-serifCn text-2xl text-ink text-balance";
const cardMetaClassName = "text-xs leading-6 text-inkMuted";
const sectionSummaryClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "min-w-[8rem] px-3 py-2 text-right text-xs leading-6 text-inkMuted shadow-none",
);
const statCardClassName = "flex h-full flex-col";
const statCardToneClassName = {
  default: cn(surfaceCardStyles({ padding: "md" }), statCardClassName),
  subtle: cn(surfaceCardStyles({ tone: "subtle", padding: "md" }), statCardClassName),
  warm: cn(surfaceCardStyles({ tone: "warm", padding: "md" }), statCardClassName),
  highlight: cn(surfaceCardStyles({ tone: "highlight", padding: "md" }), statCardClassName),
} as const;
const reviewCardBaseClassName = "flex h-full flex-col";
const highlightSurfaceClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md", interactive: true }),
  reviewCardBaseClassName,
);
const warmSurfaceClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "md", interactive: true }),
  reviewCardBaseClassName,
);
const compactHighlightSurfaceClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  reviewCardBaseClassName,
);
const secondaryActionClassName = cn("mt-5 inline-flex self-start", buttonStyles({ variant: "secondary", size: "sm" }));
const metricChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs leading-6 text-inkSoft shadow-none",
);
const mutedMetricChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs leading-6 text-inkMuted shadow-none",
);
const emptyStateClassName = cn(
  compactHighlightSurfaceClassName,
  "border-dashed px-5 py-5",
);

function formatWindowSummary(windowCodes: string[] | undefined) {
  return windowCodes?.length ? windowCodes.join(" / ") : "待补";
}

function formatSectionSummary(total: number, visible: number, unit: string) {
  return total > visible ? `展示前 ${visible} / 共 ${total} ${unit}` : `当前 ${total} ${unit}`;
}

function SectionHeader({
  eyebrow,
  title,
  summary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
}) {
  return (
    <div className={sectionHeaderClassName}>
      <div>
        <div className={sectionEyebrowClassName}>{eyebrow}</div>
        <h2 className={sectionTitleClassName}>{title}</h2>
      </div>
      <div className={sectionSummaryClassName}>{summary}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: keyof typeof statCardToneClassName;
}) {
  return (
    <article className={statCardToneClassName[tone]}>
      <div className={statLabelClassName}>{label}</div>
      <div className={statValueClassName}>{value}</div>
      <div className={statNoteClassName}>{note}</div>
    </article>
  );
}

function EmptyState({
  eyebrow = "当前为空",
  title,
  detail,
  className,
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
}: {
  eyebrow?: string;
  title: string;
  detail: string;
  className?: string;
  actionHref?: string;
  actionLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className={cn(emptyStateClassName, className)}>
      <div className={sectionEyebrowClassName}>{eyebrow}</div>
      <h3 className="mt-3 font-serifCn text-2xl text-ink text-balance">{title}</h3>
      <p className={cn("mt-3", bodyCopyClassName)}>{detail}</p>
      {actionHref || secondaryHref ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {actionHref && actionLabel ? (
            <Link href={actionHref} className={secondaryActionClassName}>
              {actionLabel}
            </Link>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Link href={secondaryHref} className={secondaryActionClassName}>
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default async function ReviewsPage() {
  const { session } = await requireWriterSession();
  const { publishedArticles, hitCandidates, nearMisses, seriesPlaybooks, playbooks } = await getReviewData(session.userId);
  const visibleHitCandidates = hitCandidates.slice(0, 6);
  const visibleNearMisses = nearMisses.slice(0, 6);
  const isFirstReviewState = publishedArticles.length === 0;
  const reviewStats = [
    {
      label: "命中结果",
      value: String(hitCandidates.length),
      note: "已完成回流并判定命中目标包的稿件。",
      tone: "highlight",
    },
    {
      label: "差一点命中",
      value: String(nearMisses.length),
      note: "已回流但仍差一点命中的稿件。",
      tone: "warm",
    },
    {
      label: "系列打法",
      value: String(seriesPlaybooks.length),
      note: "按系列聚合真实回流后的打法沉淀。",
      tone: "subtle",
    },
    {
      label: "全局打法",
      value: String(playbooks.length),
      note: "跨系列汇总可复用的打法标签。",
      tone: "default",
    },
  ] as const;

  return (
    <div className={pageClassName}>
      <section className={heroSectionClassName}>
        <div className={heroEyebrowClassName}>复盘</div>
        <h1 className={heroTitleClassName}>结果与经验沉淀，先从一个入口收口。</h1>
        <p className={heroDescriptionClassName}>
          复盘页统一消费真实结果回流：24h / 72h / 7d 快照、命中判定和打法标签都从结果模型读取，只回答哪些命中了、哪些差一点、下一篇该复用什么。
        </p>
        <div className={statsGridClassName}>
          {reviewStats.map((stat) => (
            <StatCard
              key={stat.label}
              label={stat.label}
              value={stat.value}
              note={stat.note}
              tone={stat.tone}
            />
          ))}
        </div>
      </section>

      <section className={standardSurfaceClassName}>
        <SectionHeader
          eyebrow="命中结果"
          title="先看哪些稿件已经完成命中判定。"
          summary={formatSectionSummary(hitCandidates.length, visibleHitCandidates.length, "篇稿件")}
        />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visibleHitCandidates.map(({ article, bundle }) => (
            <article key={article.id} className={highlightSurfaceClassName}>
              <div className="flex flex-wrap gap-2">
                {bundle?.outcome?.targetPackage ? (
                  <span className={metricChipClassName}>目标包：{bundle.outcome.targetPackage}</span>
                ) : null}
                <span className={mutedMetricChipClassName}>已补快照：{formatWindowSummary(bundle?.completedWindowCodes)}</span>
              </div>
              <div className="mt-4">
                <div className={cardTitleClassName}>{article.title}</div>
              </div>
              <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                {bundle?.outcome?.reviewSummary || "这篇稿件已经命中目标包，可继续沉淀可复用打法。"}
              </div>
              <Link href={`/articles/${article.id}`} className={secondaryActionClassName}>
                打开稿件
              </Link>
            </article>
          ))}
          {hitCandidates.length === 0 ? (
            <EmptyState
              className="xl:col-span-2"
              eyebrow={isFirstReviewState ? "首次复盘" : "命中结果"}
              title={isFirstReviewState ? "先让第一篇已发布稿件进入结果回流。" : "当前还没有命中结果。"}
              detail={
                isFirstReviewState
                  ? "复盘页只消费已发布稿件的真实回流。先推进一篇稿件到发布，再补 24h / 72h / 7d 快照，这里才会出现第一批命中结果。"
                  : "已经进入结果回流的稿件暂时还没有命中目标包，继续补快照并完成命中判定。"
              }
              actionHref="/articles"
              actionLabel={isFirstReviewState ? "去稿件区" : "继续推进稿件"}
              secondaryHref="/warroom"
              secondaryLabel="回作战台"
            />
          ) : null}
        </div>
      </section>

      <section className={standardSurfaceClassName}>
        <SectionHeader
          eyebrow="差一点命中"
          title="先看那些已经回流，但仍差一点的稿件。"
          summary={formatSectionSummary(nearMisses.length, visibleNearMisses.length, "篇稿件")}
        />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visibleNearMisses.map(({ article, bundle }) => (
            <article key={article.id} className={warmSurfaceClassName}>
              <div className="flex flex-wrap gap-2">
                {bundle?.outcome?.targetPackage ? (
                  <span className={metricChipClassName}>目标包：{bundle.outcome.targetPackage}</span>
                ) : null}
                <span className={mutedMetricChipClassName}>已补快照：{formatWindowSummary(bundle?.completedWindowCodes)}</span>
              </div>
              <div className="mt-4">
                <div className={cardTitleClassName}>{article.title}</div>
              </div>
              <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                {bundle?.outcome?.nextAction || bundle?.outcome?.reviewSummary || "已经形成结果回流，下一篇应针对这次差距重写打法。"}
              </div>
              <Link href={`/articles/${article.id}`} className={secondaryActionClassName}>
                打开稿件
              </Link>
            </article>
          ))}
          {nearMisses.length === 0 ? (
            <EmptyState
              className="xl:col-span-2"
              eyebrow={isFirstReviewState ? "首次复盘" : "差一点命中"}
              title={isFirstReviewState ? "先形成第一批结果样本，再看哪些稿件差一点命中。" : "当前没有“差一点命中”的稿件。"}
              detail={
                isFirstReviewState
                  ? "这里会集中展示已经回流、但仍差一点的稿件。先把第一篇已发布稿件的结果录完整，再回来对比差距。"
                  : "已回流的稿件目前没有落在“差一点”区间，说明要么已经命中，要么还没进入结果判断。"
              }
            />
          ) : null}
        </div>
      </section>

      <section className={standardSurfaceClassName}>
        <SectionHeader
          eyebrow="系列打法沉淀"
          title="先看每个系列，下一篇该继续放大哪套打法。"
          summary={formatSectionSummary(seriesPlaybooks.length, seriesPlaybooks.length, "组系列")}
        />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {seriesPlaybooks.map((item) => (
            <article key={item.seriesId} className={warmSurfaceClassName}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={cardTitleClassName}>{item.seriesName}</div>
                  <div className={cn("mt-2", cardMetaClassName)}>
                    绑定人设：{item.personaName} · 已沉淀 {item.articleCount} 篇结果样本
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={metricChipClassName}>命中 {item.hitCount} 篇</span>
                  <span className={mutedMetricChipClassName}>差一点 {item.nearMissCount} 篇</span>
                </div>
              </div>
              <div className={cn("mt-4", bodyCopyClassName)}>
                {item.latestArticleTitle ? `最近一次沉淀来自《${item.latestArticleTitle}》` : "当前系列还没有可展示的最近样本。"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.topLabels.slice(0, 3).map((label) => (
                  <span key={`${item.seriesId}-${label.label}`} className={metricChipClassName}>
                    {label.label} · 命中 {label.hitCount} / 差一点 {label.nearMissCount}
                  </span>
                ))}
                {item.topLabels.length === 0 ? (
                  <span className={cn(mutedMetricChipClassName, "border-dashed")}>
                    当前系列还没有打法标签，先补复盘结论或目标包。
                  </span>
                ) : null}
              </div>
              <Link href={`/articles?series=${item.seriesId}`} className={secondaryActionClassName}>
                查看该系列稿件
              </Link>
            </article>
          ))}
          {seriesPlaybooks.length === 0 ? (
            <EmptyState
              className="xl:col-span-2"
              eyebrow={isFirstReviewState ? "首次复盘" : "系列打法"}
              title={isFirstReviewState ? "先让一个系列跑完第一轮结果回流。" : "当前还没有形成系列打法沉淀。"}
              detail={
                isFirstReviewState
                  ? "系列打法要建立在已发布稿件的真实结果上。先让同一系列至少出现一篇进入回流的稿件，这里才会开始沉淀长期判断线。"
                  : "已发布稿件还不足以沉淀为系列打法，继续补目标包、标签和复盘结论。"
              }
            />
          ) : null}
        </div>
      </section>

      <section className={standardSurfaceClassName}>
        <SectionHeader
          eyebrow="全局打法沉淀"
          title="跨系列看，下一篇该复用什么。"
          summary={formatSectionSummary(playbooks.length, playbooks.length, "条打法")}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playbooks.map((item) => (
            <article key={item.label} className={compactHighlightSurfaceClassName}>
              <div className={statLabelClassName}>跨系列打法</div>
              <div className="mt-2 font-medium text-ink">{item.label}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metricChipClassName}>命中 {item.hitCount} 篇</span>
                <span className={mutedMetricChipClassName}>差一点 {item.nearMissCount} 篇</span>
              </div>
              <div className={cn("mt-3", cardMetaClassName)}>
                {item.latestArticleTitle ? `最近出现在《${item.latestArticleTitle}》` : "等待更多结果样本"}
              </div>
            </article>
          ))}
          {playbooks.length === 0 ? (
            <EmptyState
              className="md:col-span-2 xl:col-span-3"
              eyebrow={isFirstReviewState ? "首次复盘" : "全局打法"}
              title={isFirstReviewState ? "先让真实结果积累起来，再看跨系列打法。" : "当前还没有足够的打法数据。"}
              detail={
                isFirstReviewState
                  ? "跨系列打法不会在空白状态下生成。先让至少一篇已发布稿件进入结果回流，再给它补目标包和复盘标签。"
                  : "跨系列打法仍在积累中，继续补结果快照、打法标签和复盘结论。"
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
