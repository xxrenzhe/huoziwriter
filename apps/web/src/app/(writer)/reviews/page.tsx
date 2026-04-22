import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { getReviewData } from "@/lib/article-outcomes";
import { formatOutcomeHitStatus } from "@/lib/article-workspace-formatters";
import { requireWriterSession } from "@/lib/page-auth";
import { isPlan17WritingEvalFocusKey } from "@/lib/writing-eval-plan17";
import { getWritingEvalCases, getWritingEvalCaseQualityLabels, getWritingEvalDatasets } from "@/lib/writing-eval";
import { ReviewPlan17QualityLabelingButton } from "@/components/review-plan17-quality-labeling-button";
import { ReviewOutcomeTaggingButton } from "@/components/review-outcome-tagging-button";
import { ReviewsTabShell } from "@/components/reviews-tab-shell";

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
const scrollTargetClassName = "scroll-mt-28";

type ReviewsSearchParams = Record<string, string | string[] | undefined>;

const reviewTabKeys = ["hits", "near-miss", "series", "global"] as const;
const reviewSectionIds = [
  "quality-labeling",
  "outcome-tagging",
  "review-tabs",
  "review-tab-hits",
  "review-tab-near-miss",
  "review-tab-series",
  "review-tab-global",
] as const;

type ReviewTabKey = (typeof reviewTabKeys)[number];
type ReviewSectionId = (typeof reviewSectionIds)[number];

const reviewSectionTabMap: Partial<Record<ReviewSectionId, ReviewTabKey>> = {
  "review-tab-hits": "hits",
  "review-tab-near-miss": "near-miss",
  "review-tab-series": "series",
  "review-tab-global": "global",
};

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function normalizeReviewTabKey(value: string | null) {
  if (!value) {
    return null;
  }
  return reviewTabKeys.find((item) => item === value) ?? null;
}

function normalizeReviewSectionId(value: string | null) {
  if (!value) {
    return null;
  }
  return reviewSectionIds.find((item) => item === value) ?? null;
}

function getInitialReviewTabKey({
  tab,
  section,
}: {
  tab: string | null;
  section: ReviewSectionId | null;
}) {
  const tabKey = normalizeReviewTabKey(tab);
  if (tabKey) {
    return tabKey;
  }
  if (section && reviewSectionTabMap[section]) {
    return reviewSectionTabMap[section];
  }
  return "hits";
}

function formatWindowSummary(windowCodes: string[] | undefined) {
  return windowCodes?.length ? windowCodes.join(" / ") : "待补";
}

function formatPlan17LabelSummary(input: {
  strategyManualScore: number | null;
  evidenceExpectedTags: string[];
  evidenceDetectedTags: string[];
  notes: string | null;
}) {
  if (input.notes) {
    return input.notes;
  }
  const segments = [
    input.strategyManualScore == null ? null : `策略人工分 ${input.strategyManualScore}`,
    input.evidenceExpectedTags.length > 0 ? `预期标签：${input.evidenceExpectedTags.join("，")}` : null,
    input.evidenceDetectedTags.length > 0 ? `实际标签：${input.evidenceDetectedTags.join("，")}` : null,
  ].filter(Boolean);
  return segments.length > 0 ? segments.join(" · ") : "这条样本已经补过人工标注，可继续回看是否需要重写标签。";
}

function getReviewOpeningPatternLabel(bundle: {
  snapshots: Array<{
    windowCode: "24h" | "72h" | "7d";
    writingStateFeedback: {
      adoptedOpeningPatternLabel: string | null;
      recommendedOpeningPatternLabel: string | null;
    } | null;
  }>;
}) {
  const priority = { "7d": 3, "72h": 2, "24h": 1 } as const;
  const snapshots = [...bundle.snapshots].sort((left, right) => priority[right.windowCode] - priority[left.windowCode]);
  for (const snapshot of snapshots) {
    const label =
      snapshot.writingStateFeedback?.adoptedOpeningPatternLabel
      || snapshot.writingStateFeedback?.recommendedOpeningPatternLabel
      || "";
    if (label) {
      return label;
    }
  }
  return null;
}

function getReviewOpeningQualityCeiling(bundle: Parameters<typeof getReviewOpeningPatternLabel>[0]) {
  const label = getReviewOpeningPatternLabel(bundle);
  if (!label) {
    return null;
  }
  if (label.includes("场景")) return "A";
  if (label.includes("冲突")) return "A";
  if (label.includes("判断")) return "B+";
  if (label.includes("问句")) return "B";
  if (label.includes("现象")) return "B-";
  return "C";
}

function buildOpeningWorkspaceHref(articleId: number) {
  return `/articles/${articleId}?step=draft`;
}

function formatSectionSummary(total: number, visible: number, unit: string) {
  return total > visible ? `展示前 ${visible} / 共 ${total} ${unit}` : `当前 ${total} ${unit}`;
}

function getOutcomeStatusBadgeClassName(status: "pending" | "hit" | "near_miss" | "miss") {
  if (status === "hit") {
    return "border border-success/25 bg-surfaceSuccess text-success";
  }
  if (status === "near_miss") {
    return "border border-warning/40 bg-surfaceWarm text-warning";
  }
  if (status === "miss") {
    return "border border-danger/30 bg-danger/10 text-danger";
  }
  return "border border-lineStrong bg-surfaceAlt text-inkMuted";
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

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams?: Promise<ReviewsSearchParams> | ReviewsSearchParams;
}) {
  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : {};
  const initialSectionId = normalizeReviewSectionId(getSearchParamValue(resolvedSearchParams.section));
  const initialTabKey = getInitialReviewTabKey({
    tab: getSearchParamValue(resolvedSearchParams.tab),
    section: initialSectionId,
  });
  const { session } = await requireWriterSession();
  const [reviewData, datasets, qualityLabels] = await Promise.all([
    getReviewData(session.userId),
    getWritingEvalDatasets(),
    getWritingEvalCaseQualityLabels({ limit: 1000 }),
  ]);
  const { publishedArticles, outcomeArticles, hitCandidates, nearMisses, seriesPlaybooks, playbooks, attributionViews } = reviewData;
  const visibleHitCandidates = hitCandidates.slice(0, 6);
  const visibleNearMisses = nearMisses.slice(0, 6);
  const isFirstReviewState = publishedArticles.length === 0;
  const plan17Datasets = datasets.filter((item) => isPlan17WritingEvalFocusKey(item.focus.key));
  const qualityLabelsByCaseId = new Map(qualityLabels.map((item) => [item.caseId, item]));
  const plan17CasesByDataset = await Promise.all(
    plan17Datasets.map(async (dataset) => ({
      dataset,
      cases: await getWritingEvalCases(dataset.id),
    })),
  );
  const plan17QualityItems = plan17CasesByDataset.flatMap(({ dataset, cases }) =>
    cases.map((caseItem) => ({
      dataset,
      caseItem,
      label: qualityLabelsByCaseId.get(caseItem.id) ?? null,
    })),
  );
  const unlabeledPlan17Items = plan17QualityItems.filter((item) => item.label == null);
  const labeledPlan17Items = plan17QualityItems
    .filter((item) => item.label != null)
    .sort((left, right) => String(right.label?.updatedAt || "").localeCompare(String(left.label?.updatedAt || "")));
  const visiblePlan17QualityItems = (unlabeledPlan17Items.length > 0 ? unlabeledPlan17Items : labeledPlan17Items).slice(0, 6);
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

      <section id="quality-labeling" className={cn(standardSurfaceClassName, scrollTargetClassName)}>
        <SectionHeader
          eyebrow="质量补桶"
          title="把 plan17 人工标注也拉进复盘流。"
          summary={`待补 ${unlabeledPlan17Items.length} · 已补 ${plan17QualityItems.length - unlabeledPlan17Items.length} · 数据集 ${plan17Datasets.length}`}
        />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {visiblePlan17QualityItems.map(({ dataset, caseItem, label }) => (
            <article key={caseItem.id} className={label ? warmSurfaceClassName : highlightSurfaceClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={metricChipClassName}>{dataset.focus.label}</span>
                <span className={mutedMetricChipClassName}>{dataset.name}</span>
                <span className={mutedMetricChipClassName}>{caseItem.taskCode}</span>
                <span className={mutedMetricChipClassName}>难度：{caseItem.difficultyLevel}</span>
              </div>
              <div className="mt-4">
                <div className={cardTitleClassName}>{caseItem.topicTitle}</div>
                <div className={cn("mt-2", cardMetaClassName)}>
                  {caseItem.sourceLabel || caseItem.sourceRef || `来源类型：${caseItem.sourceType}`}
                </div>
              </div>
              <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                {label
                  ? formatPlan17LabelSummary({
                    strategyManualScore: label.strategyManualScore,
                    evidenceExpectedTags: label.evidenceExpectedTags,
                    evidenceDetectedTags: label.evidenceDetectedTags,
                    notes: label.notes,
                  })
                  : "这条样本还缺人工策略分和证据标签。先在这里补齐，plan17 的 strategy / evidence 观测样本才会继续长。"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {label?.evidenceExpectedTags.slice(0, 2).map((tag) => (
                  <span key={`${caseItem.id}-expected-${tag}`} className={metricChipClassName}>
                    预期：{tag}
                  </span>
                ))}
                {label?.evidenceDetectedTags.slice(0, 2).map((tag) => (
                  <span key={`${caseItem.id}-detected-${tag}`} className={mutedMetricChipClassName}>
                    实际：{tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ReviewPlan17QualityLabelingButton
                  caseId={caseItem.id}
                  topicTitle={caseItem.topicTitle}
                  datasetName={dataset.name}
                  focusLabel={dataset.focus.label}
                  taskCode={caseItem.taskCode}
                  currentStrategyManualScore={label?.strategyManualScore ?? null}
                  currentEvidenceExpectedTags={label?.evidenceExpectedTags ?? []}
                  currentEvidenceDetectedTags={label?.evidenceDetectedTags ?? []}
                  currentNotes={label?.notes ?? null}
                  buttonText={label ? "重写标注" : "补质量标注"}
                  buttonVariant={label ? "secondary" : "primary"}
                />
              </div>
            </article>
          ))}
          {visiblePlan17QualityItems.length === 0 ? (
            <EmptyState
              className="xl:col-span-2"
              eyebrow="质量补桶"
              title="当前没有可补的 plan17 质量样本。"
              detail="等质量桶数据集完成初始化或样本导入后，这里会直接出现待补人工分和证据标签的 case。"
              actionHref="/warroom"
              actionLabel="回作战台"
              secondaryHref="/reviews"
              secondaryLabel="刷新当前页"
            />
          ) : null}
        </div>
      </section>

      <section id="outcome-tagging" className={cn(standardSurfaceClassName, scrollTargetClassName)}>
        <SectionHeader
          eyebrow="快速打标签"
          title="不回稿件页，也能先把结果标签补完整。"
          summary={formatSectionSummary(outcomeArticles.length, outcomeArticles.length, "篇结果稿件")}
        />
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {outcomeArticles.map(({ article, bundle }) => (
            <article key={article.id} className={warmSurfaceClassName}>
              {(() => {
                const openingPatternLabel = getReviewOpeningPatternLabel(bundle);
                const openingQualityCeiling = getReviewOpeningQualityCeiling(bundle);
                return (
                  <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <span className={bundle.outcome.targetPackage ? metricChipClassName : mutedMetricChipClassName}>
                    {bundle.outcome.targetPackage ? `目标包：${bundle.outcome.targetPackage}` : "目标包待补"}
                  </span>
                  <span className={mutedMetricChipClassName}>已补快照：{formatWindowSummary(bundle.completedWindowCodes)}</span>
                  {openingPatternLabel ? (
                    <span className={metricChipClassName}>开头模式：{openingPatternLabel}</span>
                  ) : null}
                  {openingQualityCeiling ? (
                    <span className={metricChipClassName}>开头上限：{openingQualityCeiling}</span>
                  ) : null}
                  {bundle.missingWindowCodes.length > 0 ? (
                    <span className={mutedMetricChipClassName}>待补：{formatWindowSummary(bundle.missingWindowCodes)}</span>
                  ) : null}
                </div>
                <span className={cn("rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em]", getOutcomeStatusBadgeClassName(bundle.outcome.hitStatus))}>
                  {formatOutcomeHitStatus(bundle.outcome.hitStatus)}
                </span>
              </div>
              <div className="mt-4">
                <div className={cardTitleClassName}>{article.title}</div>
              </div>
              <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                {bundle.outcome.reviewSummary
                  || bundle.outcome.nextAction
                  || (bundle.outcome.playbookTags.length > 0
                    ? `已记录打法标签：${bundle.outcome.playbookTags.join("，")}`
                    : "这篇稿件已经有结果记录，但复盘标签还没补完整。")}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {bundle.outcome.playbookTags.slice(0, 3).map((tag) => (
                  <span key={`${article.id}-${tag}`} className={metricChipClassName}>
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <ReviewOutcomeTaggingButton
                  articleId={article.id}
                  articleTitle={article.title}
                  currentTargetPackage={bundle.outcome.targetPackage}
                  currentHitStatus={bundle.outcome.hitStatus}
                  currentReviewSummary={bundle.outcome.reviewSummary}
                  currentNextAction={bundle.outcome.nextAction}
                  currentPlaybookTags={bundle.outcome.playbookTags}
                  completedWindowCodes={bundle.completedWindowCodes}
                  missingWindowCodes={bundle.missingWindowCodes}
                  buttonVariant="primary"
                />
                <Link href={buildOpeningWorkspaceHref(article.id)} className={secondaryActionClassName}>
                  回工作区看开头
                </Link>
                <Link href={`/articles/${article.id}`} className={secondaryActionClassName}>
                  打开稿件
                </Link>
              </div>
                  </>
                );
              })()}
            </article>
          ))}
          {outcomeArticles.length === 0 ? (
            <EmptyState
              className="xl:col-span-2"
              eyebrow={isFirstReviewState ? "首次复盘" : "快速打标签"}
              title={isFirstReviewState ? "先形成第一批结果样本，再回来打标签。" : "当前还没有可打标签的结果稿件。"}
              detail={
                isFirstReviewState
                  ? "只有已发布且写入结果模型的稿件，才会出现在这里。先推进一篇稿件到发布并补首个结果快照。"
                  : "发布后的稿件一旦写入结果记录，这里就能直接补目标包、命中判定和打法标签。"
              }
              actionHref="/warroom"
              actionLabel="回作战台"
              secondaryHref="/articles"
              secondaryLabel="查看稿件区"
            />
          ) : null}
        </div>
      </section>

      <section id="review-tabs" className={cn(standardSurfaceClassName, scrollTargetClassName)}>
        <SectionHeader
          eyebrow="复盘分区"
          title="把命中、差一点和打法沉淀收口到一个切换区。"
          summary={`命中 ${hitCandidates.length} · 差一点 ${nearMisses.length} · 系列 ${seriesPlaybooks.length} · 全局 ${playbooks.length}`}
        />
        <div className="mt-6">
          <ReviewsTabShell
            defaultTabKey={initialTabKey}
            tabs={[
              {
                key: "hits",
                label: `命中 ${hitCandidates.length}`,
                content: (
                  <div id="review-tab-hits" className={cn(scrollTargetClassName, "space-y-6")}>
                    <SectionHeader
                      eyebrow="命中结果"
                      title="先看哪些稿件已经完成命中判定。"
                      summary={formatSectionSummary(hitCandidates.length, visibleHitCandidates.length, "篇稿件")}
                    />
                    <div className="grid gap-4 xl:grid-cols-2">
                      {visibleHitCandidates.map(({ article, bundle }) => (
                        <article key={article.id} className={highlightSurfaceClassName}>
                          {(() => {
                            const openingPatternLabel = bundle ? getReviewOpeningPatternLabel(bundle) : null;
                            const openingQualityCeiling = bundle ? getReviewOpeningQualityCeiling(bundle) : null;
                            return (
                              <>
                          <div className="flex flex-wrap gap-2">
                            {bundle?.outcome?.targetPackage ? (
                              <span className={metricChipClassName}>目标包：{bundle.outcome.targetPackage}</span>
                            ) : null}
                            <span className={mutedMetricChipClassName}>已补快照：{formatWindowSummary(bundle?.completedWindowCodes)}</span>
                            {openingPatternLabel ? (
                              <span className={metricChipClassName}>开头模式：{openingPatternLabel}</span>
                            ) : null}
                            {openingQualityCeiling ? (
                              <span className={metricChipClassName}>开头上限：{openingQualityCeiling}</span>
                            ) : null}
                          </div>
                          <div className="mt-4">
                            <div className={cardTitleClassName}>{article.title}</div>
                          </div>
                          <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                            {bundle?.outcome?.reviewSummary || "这篇稿件已经命中目标包，可继续沉淀可复用打法。"}
                          </div>
                          <div className="mt-5 flex flex-wrap gap-3">
                            {bundle?.outcome ? (
                              <ReviewOutcomeTaggingButton
                                articleId={article.id}
                                articleTitle={article.title}
                                currentTargetPackage={bundle.outcome.targetPackage}
                                currentHitStatus={bundle.outcome.hitStatus}
                                currentReviewSummary={bundle.outcome.reviewSummary}
                                currentNextAction={bundle.outcome.nextAction}
                                currentPlaybookTags={bundle.outcome.playbookTags}
                                completedWindowCodes={bundle.completedWindowCodes}
                                missingWindowCodes={bundle.missingWindowCodes}
                              />
                            ) : null}
                            <Link href={buildOpeningWorkspaceHref(article.id)} className={secondaryActionClassName}>
                              回工作区看开头
                            </Link>
                            <Link href={`/articles/${article.id}`} className={secondaryActionClassName}>
                              打开稿件
                            </Link>
                          </div>
                              </>
                            );
                          })()}
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
                  </div>
                ),
              },
              {
                key: "near-miss",
                label: `差一点 ${nearMisses.length}`,
                content: (
                  <div id="review-tab-near-miss" className={cn(scrollTargetClassName, "space-y-6")}>
                    <SectionHeader
                      eyebrow="差一点命中"
                      title="先看那些已经回流，但仍差一点的稿件。"
                      summary={formatSectionSummary(nearMisses.length, visibleNearMisses.length, "篇稿件")}
                    />
                    <div className="grid gap-4 xl:grid-cols-2">
                      {visibleNearMisses.map(({ article, bundle }) => (
                        <article key={article.id} className={warmSurfaceClassName}>
                          {(() => {
                            const openingPatternLabel = bundle ? getReviewOpeningPatternLabel(bundle) : null;
                            const openingQualityCeiling = bundle ? getReviewOpeningQualityCeiling(bundle) : null;
                            return (
                              <>
                          <div className="flex flex-wrap gap-2">
                            {bundle?.outcome?.targetPackage ? (
                              <span className={metricChipClassName}>目标包：{bundle.outcome.targetPackage}</span>
                            ) : null}
                            <span className={mutedMetricChipClassName}>已补快照：{formatWindowSummary(bundle?.completedWindowCodes)}</span>
                            {openingPatternLabel ? (
                              <span className={metricChipClassName}>开头模式：{openingPatternLabel}</span>
                            ) : null}
                            {openingQualityCeiling ? (
                              <span className={metricChipClassName}>开头上限：{openingQualityCeiling}</span>
                            ) : null}
                          </div>
                          <div className="mt-4">
                            <div className={cardTitleClassName}>{article.title}</div>
                          </div>
                          <div className={cn("mt-3 flex-1", bodyCopyClassName)}>
                            {bundle?.outcome?.nextAction || bundle?.outcome?.reviewSummary || "已经形成结果回流，下一篇应针对这次差距重写打法。"}
                          </div>
                          <div className="mt-5 flex flex-wrap gap-3">
                            {bundle?.outcome ? (
                              <ReviewOutcomeTaggingButton
                                articleId={article.id}
                                articleTitle={article.title}
                                currentTargetPackage={bundle.outcome.targetPackage}
                                currentHitStatus={bundle.outcome.hitStatus}
                                currentReviewSummary={bundle.outcome.reviewSummary}
                                currentNextAction={bundle.outcome.nextAction}
                                currentPlaybookTags={bundle.outcome.playbookTags}
                                completedWindowCodes={bundle.completedWindowCodes}
                                missingWindowCodes={bundle.missingWindowCodes}
                              />
                            ) : null}
                            <Link href={buildOpeningWorkspaceHref(article.id)} className={secondaryActionClassName}>
                              回工作区看开头
                            </Link>
                            <Link href={`/articles/${article.id}`} className={secondaryActionClassName}>
                              打开稿件
                            </Link>
                          </div>
                              </>
                            );
                          })()}
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
                  </div>
                ),
              },
              {
                key: "series",
                label: `系列打法 ${seriesPlaybooks.length}`,
                content: (
                  <div id="review-tab-series" className={cn(scrollTargetClassName, "space-y-6")}>
                    <SectionHeader
                      eyebrow="系列打法沉淀"
                      title="先看每个系列，下一篇该继续放大哪套打法。"
                      summary={formatSectionSummary(seriesPlaybooks.length, seriesPlaybooks.length, "组系列")}
                    />
                    <div className="grid gap-4 xl:grid-cols-2">
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
                          <div className="mt-5 flex flex-wrap gap-3">
                            <Link href={`/articles?series=${item.seriesId}`} className={secondaryActionClassName}>
                              查看该系列稿件
                            </Link>
                            <Link href="/articles#create-article" className={secondaryActionClassName}>
                              应用到新稿
                            </Link>
                          </div>
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
                  </div>
                ),
              },
              {
                key: "global",
                label: `全局打法 ${playbooks.length}`,
                content: (
                  <div id="review-tab-global" className={cn(scrollTargetClassName, "space-y-6")}>
                    <SectionHeader
                      eyebrow="全局打法沉淀"
                      title="跨系列看，下一篇该复用什么。"
                      summary={formatSectionSummary(playbooks.length, playbooks.length, "条打法")}
                    />
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                          <Link href="/articles#create-article" className={secondaryActionClassName}>
                            应用到新稿
                          </Link>
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
                  </div>
                ),
              },
            ]}
          />
        </div>
      </section>

      <section className={standardSurfaceClassName}>
        <SectionHeader
          eyebrow="高命中结构归因"
          title="把高命中样本拆回原型、强度和爆点组合。"
          summary={`原型 ${attributionViews.archetypes.length} · 强度 ${attributionViews.strategyStrengths.length} · 组合 ${attributionViews.hookCombos.length}`}
        />
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          {[
            {
              key: "archetypes",
              title: "原型分布",
              detail: "看哪些文章原型更容易打中。",
              items: attributionViews.archetypes,
            },
            {
              key: "strengths",
              title: "强度分布",
              detail: "看四元强度落在哪些区间更稳。",
              items: attributionViews.strategyStrengths,
            },
            {
              key: "hooks",
              title: "爆点组合",
              detail: "看哪些爆点标签组合最常命中。",
              items: attributionViews.hookCombos,
            },
          ].map((group) => (
            <div key={group.key} className="space-y-3">
              <div>
                <div className={sectionEyebrowClassName}>{group.title}</div>
                <div className={cn("mt-2", bodyCopyClassName)}>{group.detail}</div>
              </div>
              <div className="grid gap-3">
                {group.items.slice(0, 5).map((item) => (
                  <article key={`${group.key}-${item.label}`} className={compactHighlightSurfaceClassName}>
                    <div className={statLabelClassName}>{item.detail}</div>
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
                {group.items.length === 0 ? (
                  <EmptyState
                    eyebrow={group.title}
                    title={`当前还没有${group.title}样本。`}
                    detail="先补结果回流，系统才会把高命中样本拆成可复用的结构归因。"
                    className="border-dashed"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
