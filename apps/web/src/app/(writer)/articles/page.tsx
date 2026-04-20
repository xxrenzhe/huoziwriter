import {
  Button,
  Select,
  buttonStyles,
  cn,
  fieldEyebrowClassName,
  fieldLabelClassName,
  surfaceCardStyles,
} from "@huoziwriter/ui";
import Link from "next/link";
import { ArticleList, CreateArticleForm } from "@/components/dashboard-client";
import { compareArticleStatuses, formatArticleStatusLabel, isPublishedArticleStatus, normalizeArticleStatus } from "@/lib/article-status-label";
import { requireWriterSession } from "@/lib/page-auth";
import { getArticleOutcomeBundlesByUser, getArticlesByUser, getWechatSyncLogs } from "@/lib/repositories";
import { getSeries } from "@/lib/series";

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

const pageClassName = "space-y-8";
const heroCardClassName = surfaceCardStyles({ tone: "subtle", padding: "lg" });
const sectionCardClassName = surfaceCardStyles({ padding: "md" });
const sectionHeaderClassName = "flex flex-wrap items-end justify-between gap-4";
const accentEyebrowClassName = "text-xs uppercase text-cinnabar";
const heroEyebrowClassName = cn(accentEyebrowClassName, "tracking-[0.3em]");
const sectionEyebrowClassName = cn(accentEyebrowClassName, "tracking-[0.28em]");
const headingBaseClassName = "font-serifCn text-ink text-balance";
const heroTitleClassName = cn(headingBaseClassName, "mt-4 text-4xl font-semibold md:text-5xl");
const sectionTitleClassName = cn(headingBaseClassName, "mt-3 text-3xl");
const bodyCopyClassName = "text-sm leading-7 text-inkSoft";
const heroDescriptionClassName = cn("mt-4 max-w-3xl text-base leading-8", "text-inkSoft");
const statsGridClassName = "mt-6 grid gap-4 md:grid-cols-4";
const statCardClassName = surfaceCardStyles({ padding: "md" });
const statLabelClassName = "text-xs uppercase tracking-[0.24em] text-inkMuted";
const statValueClassName = cn(headingBaseClassName, "mt-3 text-4xl");
const statNoteClassName = cn("mt-3", bodyCopyClassName);
const secondaryActionLinkClassName = buttonStyles({ variant: "secondary" });
const redirectedBannerClassName = cn(
  "mt-5",
  surfaceCardStyles({ tone: "warning", padding: "sm" }),
  "shadow-none text-sm leading-7 text-warning",
);
const completionBannerClassName = cn(
  "mt-5",
  surfaceCardStyles({ tone: "success", padding: "sm" }),
  "shadow-none text-sm leading-7 text-emerald-700",
);
const createFormWrapClassName = "mt-5";
const filterFormClassName = "mt-6 grid gap-3 xl:grid-cols-6";
const filterActionsClassName = "flex items-end gap-3";
const filterResultsClassName = "text-sm text-inkSoft";
const articleListWrapClassName = "mt-6";

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { session } = await requireWriterSession();
  const [articles, syncLogs, outcomeBundles, series] = await Promise.all([
    getArticlesByUser(session.userId),
    getWechatSyncLogs(session.userId),
    getArticleOutcomeBundlesByUser(session.userId),
    getSeries(session.userId),
  ]);
  const normalizedArticles = articles.map((article) => ({
    ...article,
    status: normalizeArticleStatus(article.status),
  }));
  const selectedSeriesId = Number(getSearchValue(searchParams?.series));
  const selectedStatus = getSearchValue(searchParams?.status);
  const selectedTargetPackage = getSearchValue(searchParams?.targetPackage);
  const selectedBacklogId = Number(getSearchValue(searchParams?.backlog));
  const selectedBatchId = getSearchValue(searchParams?.batch);
  const redirectedFromCapture = getSearchValue(searchParams?.fromCapture) === "1";
  const hasActiveFilters =
    (Number.isInteger(selectedSeriesId) && selectedSeriesId > 0)
    || Boolean(selectedStatus)
    || Boolean(selectedTargetPackage)
    || (Number.isInteger(selectedBacklogId) && selectedBacklogId > 0)
    || Boolean(selectedBatchId);
  const drafts = normalizedArticles.filter((article) => !isPublishedArticleStatus(article.status));
  const publishedArticles = normalizedArticles.filter((article) => isPublishedArticleStatus(article.status));
  const hasClearedActiveQueue = normalizedArticles.length > 0 && drafts.length === 0;
  const recentlySyncedIds = new Set(
    syncLogs.filter((log) => log.status === "success").map((log) => log.articleId),
  );
  const seriesMap = new Map(series.map((item) => [item.id, item] as const));
  const outcomeBundleMap = new Map(outcomeBundles.map((bundle) => [bundle.outcome?.articleId, bundle] as const));
  const targetPackageOptions = Array.from(
    new Set(
      outcomeBundles
        .map((bundle) => String(bundle.outcome?.targetPackage || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, "zh-CN"));
  const backlogOptions = Array.from(
    new Map(
      normalizedArticles
        .filter((article) => Number.isInteger(article.topic_backlog_id) && article.topic_backlog_id && article.topic_backlog_name)
        .map((article) => [article.topic_backlog_id as number, article.topic_backlog_name as string] as const),
    ).entries(),
  ).sort((left, right) => left[1].localeCompare(right[1], "zh-CN"));
  const batchOptions = Array.from(
    new Set(
      normalizedArticles
        .map((article) => String(article.topic_backlog_batch_id || "").trim())
        .filter(Boolean),
    ),
  ).sort((left, right) => right.localeCompare(left, "zh-CN"));
  const statusOptions = Array.from(new Set(normalizedArticles.map((article) => article.status))).sort(compareArticleStatuses);
  const filteredArticles = normalizedArticles.filter((article) => {
    const bundle = outcomeBundleMap.get(article.id);
    const matchesSeries = !Number.isInteger(selectedSeriesId) || selectedSeriesId <= 0 || article.series_id === selectedSeriesId;
    const matchesStatus = !selectedStatus || article.status === selectedStatus;
    const matchesTargetPackage = !selectedTargetPackage || String(bundle?.outcome?.targetPackage || "").trim() === selectedTargetPackage;
    const matchesBacklog = !Number.isInteger(selectedBacklogId) || selectedBacklogId <= 0 || article.topic_backlog_id === selectedBacklogId;
    const matchesBatch = !selectedBatchId || String(article.topic_backlog_batch_id || "").trim() === selectedBatchId;
    return matchesSeries && matchesStatus && matchesTargetPackage && matchesBacklog && matchesBatch;
  });
  const articleCards = filteredArticles.map((article) => {
    const bundle = outcomeBundleMap.get(article.id);
    return {
      id: article.id,
      title: article.title,
      status: article.status,
      updatedAt: article.updated_at,
      seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
      targetPackage: bundle?.outcome?.targetPackage ?? null,
      topicBacklogName: article.topic_backlog_name ?? null,
      topicBacklogBatchId: article.topic_backlog_batch_id ?? null,
    };
  });
  const articleListEmptyState = hasActiveFilters
    ? {
        eyebrow: "筛选结果",
        title: "这组筛选条件下，还没有翻到合适稿件。",
        detail: "稿夹里可能还有别的稿件，只是它们被系列、状态、目标包、选题库或批次条件拦在外面了。先放宽筛选，再决定继续推进哪一篇。",
        prompts: [
          "先清空筛选，看全量稿件再决定优先级。",
          "目标包为空时，说明这篇稿还没进入结果管理层。",
          "选题库和批次筛选更适合回看同一轮批量生产。",
        ],
        actionHref: "/articles",
        actionLabel: "清空筛选",
        secondaryHref: "/articles#create-article",
        secondaryLabel: "去新建稿件",
      }
    : {
        eyebrow: "稿件案头",
        title: "先把第一篇稿件立起来，链路才会开始运转。",
        detail: "稿件页不是冷冰冰的列表，而是所有机会、策略、证据、成稿和发布结果的总入口。先起一篇稿，后面的每一步才有地方安放。",
        prompts: [
          "先写一个能代表问题域的题目，不必一开始就完美。",
          "题目先落进系列，后续证据和结果回流才不会散。",
          "如果刚从采集入口回来，先把最值得继续追的一条线立成稿件。",
        ],
        actionHref: "#create-article",
        actionLabel: "去新建稿件",
        secondaryHref: "/warroom",
        secondaryLabel: "回作战台",
      };
  const articleStats = [
    { label: "全部稿件", value: String(articles.length), note: "统一从这里进入稿件详情。" },
    { label: "待推进", value: String(drafts.length), note: "还没发布的稿件优先清空。" },
    { label: "已发布", value: String(publishedArticles.length), note: "结果回流、命中判定和复盘都从稿件详情继续推进。" },
    { label: "已推送微信", value: String(recentlySyncedIds.size), note: "已形成成功草稿箱记录的稿件数。" },
  ] as const;

  return (
    <div className={pageClassName}>
      <section className={heroCardClassName}>
        <div className={heroEyebrowClassName}>稿件</div>
        <h1 className={heroTitleClassName}>稿件是唯一内容生产对象。</h1>
        <p className={heroDescriptionClassName}>
          所有稿件都从这里进入，并统一落到机会、策略、证据、成稿、发布、结果六步主链路。
        </p>
        <div className={statsGridClassName}>
          {articleStats.map((stat) => (
            <article key={stat.label} className={statCardClassName}>
              <div className={statLabelClassName}>{stat.label}</div>
              <div className={statValueClassName}>{stat.value}</div>
              <div className={statNoteClassName}>{stat.note}</div>
            </article>
          ))}
        </div>
      </section>

      <section id="create-article" className={sectionCardClassName}>
        <div className={sectionHeaderClassName}>
          <div>
            <div className={sectionEyebrowClassName}>新建稿件</div>
            <h2 className={sectionTitleClassName}>从一个题目开始，先把稿件对象立起来。</h2>
          </div>
          <Link href="/warroom" className={secondaryActionLinkClassName}>
            回到作战台
          </Link>
        </div>
        {redirectedFromCapture ? (
          <div className={redirectedBannerClassName}>
            历史采集入口已经并入「稿件 -&gt; 证据」。当前还没有可接续的草稿，请先新建一篇稿件；创建后会在稿件详情里继续挂素材、补截图和做事实核查。
          </div>
        ) : null}
        {hasClearedActiveQueue ? (
          <div className={completionBannerClassName}>
            当前没有待推进稿件，已建稿件都已进入发布或结果回流阶段。接下来可以回复盘页补结果，也可以直接从作战台再开一篇新稿。
          </div>
        ) : null}
        <div className={createFormWrapClassName}>
          <CreateArticleForm
            seriesOptions={series.map((item) => ({
              id: item.id,
              name: item.name,
              personaName: item.personaName,
              activeStatus: item.activeStatus,
            }))}
          />
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className={sectionHeaderClassName}>
          <div>
            <div className={sectionEyebrowClassName}>全部稿件</div>
            <h2 className={sectionTitleClassName}>统一在这里按系列、状态、目标包、选题库和批次筛选。</h2>
          </div>
          <Link href="/articles" className={secondaryActionLinkClassName}>
            清空筛选
          </Link>
        </div>
        <form className={filterFormClassName} method="GET">
          <label className={fieldLabelClassName}>
            <div className={fieldEyebrowClassName}>系列</div>
            <Select aria-label="select control" name="series" defaultValue={Number.isInteger(selectedSeriesId) && selectedSeriesId > 0 ? String(selectedSeriesId) : ""}>
              <option value="">全部系列</option>
              {series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
          <label className={fieldLabelClassName}>
            <div className={fieldEyebrowClassName}>状态</div>
            <Select aria-label="select control" name="status" defaultValue={selectedStatus}>
              <option value="">全部状态</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatArticleStatusLabel(status)}
                </option>
              ))}
            </Select>
          </label>
          <label className={fieldLabelClassName}>
            <div className={fieldEyebrowClassName}>目标包</div>
            <Select aria-label="select control" name="targetPackage" defaultValue={selectedTargetPackage}>
              <option value="">全部目标包</option>
              {targetPackageOptions.map((targetPackage) => (
                <option key={targetPackage} value={targetPackage}>
                  {targetPackage}
                </option>
              ))}
            </Select>
          </label>
          <label className={fieldLabelClassName}>
            <div className={fieldEyebrowClassName}>选题库</div>
            <Select aria-label="select control" name="backlog" defaultValue={Number.isInteger(selectedBacklogId) && selectedBacklogId > 0 ? String(selectedBacklogId) : ""}>
              <option value="">全部选题库</option>
              {backlogOptions.map(([backlogId, backlogName]) => (
                <option key={backlogId} value={backlogId}>
                  {backlogName}
                </option>
              ))}
            </Select>
          </label>
          <label className={fieldLabelClassName}>
            <div className={fieldEyebrowClassName}>批次</div>
            <Select aria-label="select control" name="batch" defaultValue={selectedBatchId}>
              <option value="">全部批次</option>
              {batchOptions.map((batchId) => (
                <option key={batchId} value={batchId}>
                  {batchId}
                </option>
              ))}
            </Select>
          </label>
          <div className={filterActionsClassName}>
            <Button type="submit" variant="primary">应用筛选</Button>
            <div className={filterResultsClassName}>当前命中 {filteredArticles.length} 篇稿件</div>
          </div>
        </form>
        <div className={articleListWrapClassName}>
          <ArticleList articles={articleCards} emptyState={articleListEmptyState} />
        </div>
      </section>
    </div>
  );
}
