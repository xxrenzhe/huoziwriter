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
import { AppBanner } from "@/components/app-feedback";
import { ArticleOutcomeQuickCaptureButton } from "@/components/article-outcome-quick-capture-button";
import { ArticleList, CreateArticleForm } from "@/components/dashboard-client";
import { formatOutcomeHitStatus } from "@/lib/article-workspace-formatters";
import { compareArticleStatuses, formatArticleStatusLabel, isPublishedArticleStatus, normalizeArticleStatus } from "@/lib/article-status-label";
import { requireWriterSession } from "@/lib/page-auth";
import { getArticleOutcomeBundlesByUser, getArticlesByUser, getWechatSyncLogs } from "@/lib/repositories";
import { getSeries } from "@/lib/series";

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatWindowSummary(windowCodes: string[]) {
  return windowCodes.length > 0 ? windowCodes.join(" / ") : "已补齐";
}

function getDaysSince(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const diff = Date.now() - timestamp;
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / 86_400_000);
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
const createFormWrapClassName = "mt-5";
const filterBarWrapClassName = cn(
  "mt-6 sticky top-20 z-20 border border-lineStrong bg-paper/95 p-4 backdrop-blur-sm",
  surfaceCardStyles({ padding: "sm" }),
  "shadow-none",
);
const filterBarHeaderClassName = "flex flex-wrap items-start justify-between gap-4";
const filterFormClassName = "mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]";
const filterActionsClassName = "flex items-end gap-3";
const filterResultsClassName = "text-sm text-inkSoft";
const articleListWrapClassName = "mt-6";
const pendingOutcomeGridClassName = "mt-6 grid gap-4 xl:grid-cols-2";
const pendingOutcomeCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-lineStrong bg-surface shadow-none");
const pendingOutcomeMetaRowClassName = "mt-3 flex flex-wrap gap-2";
const pendingOutcomeMetaChipClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 text-xs text-inkSoft shadow-none");
const pendingOutcomeWarningChipClassName = cn(surfaceCardStyles({ tone: "warning", padding: "sm" }), "px-3 py-1 text-xs text-warning shadow-none");
const pendingOutcomeEmptyClassName = cn(surfaceCardStyles({ tone: "success", padding: "md" }), "mt-6 text-sm leading-7 text-emerald-700 shadow-none");
const pendingOutcomeBodyClassName = "mt-4 text-sm leading-7 text-inkSoft";
const pendingOutcomeActionsClassName = "mt-5 flex flex-wrap gap-3";
const queueGridClassName = "mt-6 grid gap-4 xl:grid-cols-2";
const queueCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "flex h-full flex-col shadow-none");
const queueMetaChipClassName = cn(surfaceCardStyles({ padding: "sm" }), "px-3 py-1 text-xs text-inkSoft shadow-none");
const queueMutedChipClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-3 py-1 text-xs text-inkMuted shadow-none");

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
  const selectedSort = getSearchValue(searchParams?.sort) || "updated_desc";
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
  const collator = new Intl.Collator("zh-CN");
  const sortedArticles = [...filteredArticles].sort((left, right) => {
    const leftBundle = outcomeBundleMap.get(left.id);
    const rightBundle = outcomeBundleMap.get(right.id);
    const leftSeriesName = left.series_id ? seriesMap.get(left.series_id)?.name ?? "" : "";
    const rightSeriesName = right.series_id ? seriesMap.get(right.series_id)?.name ?? "" : "";
    const leftTargetPackage = String(leftBundle?.outcome?.targetPackage || "").trim();
    const rightTargetPackage = String(rightBundle?.outcome?.targetPackage || "").trim();
    if (selectedSort === "updated_asc") {
      return left.updated_at.localeCompare(right.updated_at, "zh-CN");
    }
    if (selectedSort === "status") {
      const statusDiff = compareArticleStatuses(left.status, right.status);
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return right.updated_at.localeCompare(left.updated_at, "zh-CN");
    }
    if (selectedSort === "series") {
      const seriesDiff = collator.compare(leftSeriesName || "未归属系列", rightSeriesName || "未归属系列");
      if (seriesDiff !== 0) {
        return seriesDiff;
      }
      return right.updated_at.localeCompare(left.updated_at, "zh-CN");
    }
    if (selectedSort === "target") {
      const targetDiff = collator.compare(leftTargetPackage || "未设置目标包", rightTargetPackage || "未设置目标包");
      if (targetDiff !== 0) {
        return targetDiff;
      }
      return right.updated_at.localeCompare(left.updated_at, "zh-CN");
    }
    return right.updated_at.localeCompare(left.updated_at, "zh-CN");
  });
  const articleCards = sortedArticles.map((article) => {
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
  const pendingOutcomeArticles = publishedArticles
    .map((article) => {
      const bundle = outcomeBundleMap.get(article.id);
      const missingWindowCodes = bundle?.missingWindowCodes ?? ["24h", "72h", "7d"];
      const completedWindowCodes = bundle?.completedWindowCodes ?? [];
      const hitStatus = bundle?.outcome?.hitStatus ?? "pending";
      const daysSinceUpdate = getDaysSince(article.updated_at);
      const isOverdue = daysSinceUpdate >= 7 && (missingWindowCodes.includes("7d") || hitStatus === "pending");
      return {
        articleId: article.id,
        articleTitle: article.title,
        seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
        updatedAt: article.updated_at,
        daysSinceUpdate,
        isOverdue,
        missingWindowCodes,
        completedWindowCodes,
        nextWindowCode: bundle?.nextWindowCode ?? null,
        targetPackage: bundle?.outcome?.targetPackage ?? null,
        hitStatus,
        reviewSummary: bundle?.outcome?.reviewSummary ?? null,
        nextAction: bundle?.outcome?.nextAction ?? null,
        playbookTags: bundle?.outcome?.playbookTags ?? [],
      };
    })
    .filter((item) => item.missingWindowCodes.length > 0 || item.hitStatus === "pending")
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) {
        return left.isOverdue ? -1 : 1;
      }
      if (left.daysSinceUpdate !== right.daysSinceUpdate) {
        return right.daysSinceUpdate - left.daysSinceUpdate;
      }
      return right.missingWindowCodes.length - left.missingWindowCodes.length;
    });
  const visiblePendingOutcomeArticles = pendingOutcomeArticles.slice(0, 6);
  const draftArticles = drafts
    .map((article) => {
      const daysSinceUpdate = getDaysSince(article.updated_at);
      return {
        articleId: article.id,
        articleTitle: article.title,
        seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
        updatedAt: article.updated_at,
        daysSinceUpdate,
        status: article.status,
        synced: recentlySyncedIds.has(article.id),
      };
    })
    .sort((left, right) => right.daysSinceUpdate - left.daysSinceUpdate || right.updatedAt.localeCompare(left.updatedAt, "zh-CN"));
  const staleDraftArticles = draftArticles.filter((item) => item.daysSinceUpdate >= 2).slice(0, 4);
  const failedSyncArticles = Array.from(
    new Map(
      syncLogs
        .filter((log) => log.status === "failed")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt, "zh-CN"))
        .map((log) => [log.articleId, log] as const),
    ).values(),
  )
    .map((log) => ({
      articleId: log.articleId,
      articleTitle: log.title || `未命名稿件 #${log.articleId}`,
      connectionName: log.connectionName,
      createdAt: log.createdAt,
      failureReason: log.failureReason,
      failureCode: log.failureCode,
      retryCount: log.retryCount,
    }))
    .slice(0, 4);
  const articleQueueCount =
    (draftArticles.length > 0 ? 1 : 0) +
    (staleDraftArticles.length > 0 ? 1 : 0) +
    (failedSyncArticles.length > 0 ? 1 : 0) +
    (pendingOutcomeArticles.length > 0 ? 1 : 0);
  const articleStats = [
    { label: "全部稿件", value: String(articles.length), note: "统一从这里进入稿件详情。" },
    { label: "在推稿件", value: String(drafts.length), note: "还没发布的稿件优先清空。" },
    { label: "已发布", value: String(publishedArticles.length), note: "结果回流、命中判定和复盘都从稿件详情继续推进。" },
    { label: "待回流", value: String(pendingOutcomeArticles.length), note: "优先补 24h / 72h / 7d，别让结果链路断掉。" },
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

      <section className={sectionCardClassName}>
        <div className={sectionHeaderClassName}>
          <div>
            <div className={sectionEyebrowClassName}>待处理稿件任务</div>
            <h2 className={sectionTitleClassName}>先决定该继续写哪篇、重试哪篇、回流哪篇。</h2>
          </div>
          <div className={filterResultsClassName}>当前 {articleQueueCount} 类任务入口</div>
        </div>
        <p className={heroDescriptionClassName}>
          稿件页不只负责列表筛选。这里把最容易卡主生产链路的稿件任务单独提出来，优先给出继续写、重新发布和补结果的入口。
        </p>
        <div className={queueGridClassName}>
          {draftArticles.length > 0 ? (
            <article className={queueCardClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={queueMetaChipClassName}>草稿待推进</span>
                <span className={queueMutedChipClassName}>当前 {draftArticles.length} 篇</span>
              </div>
              <div className="mt-4">
                <div className={sectionTitleClassName}>还有未发布稿件停在主链路中间</div>
              </div>
              <div className={pendingOutcomeBodyClassName}>
                这些稿件还没走完六步链路。优先继续现有草稿，通常比重复新建更能保持判断线和系列一致性。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {draftArticles.slice(0, 3).map((item) => (
                  <span key={`draft-${item.articleId}`} className={queueMutedChipClassName}>
                    {item.articleTitle || `稿件 #${item.articleId}`}
                  </span>
                ))}
              </div>
              <div className={pendingOutcomeActionsClassName}>
                <Link href="/articles?status=draft" className={secondaryActionLinkClassName}>
                  只看草稿
                </Link>
                <Link href={`/articles/${draftArticles[0].articleId}`} className={secondaryActionLinkClassName}>
                  打开最新草稿
                </Link>
              </div>
            </article>
          ) : null}

          {staleDraftArticles.length > 0 ? (
            <article className={queueCardClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={queueMetaChipClassName}>久未推进</span>
                <span className={queueMutedChipClassName}>待清理 {staleDraftArticles.length} 篇</span>
              </div>
              <div className="mt-4">
                <div className={sectionTitleClassName}>有些草稿已经搁置超过 2 天</div>
              </div>
              <div className={pendingOutcomeBodyClassName}>
                久未推进的草稿最容易造成系列漂移和重复起稿。先决定继续推进、合并判断，还是直接清理。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {staleDraftArticles.slice(0, 2).map((item) => (
                  <span key={`stale-${item.articleId}`} className={queueMetaChipClassName}>
                    {item.articleTitle || `稿件 #${item.articleId}`} · {item.daysSinceUpdate} 天未动
                  </span>
                ))}
              </div>
              <div className={pendingOutcomeActionsClassName}>
                <Link href={`/articles/${staleDraftArticles[0].articleId}`} className={secondaryActionLinkClassName}>
                  先处理最久未动草稿
                </Link>
              </div>
            </article>
          ) : null}

          {failedSyncArticles.length > 0 ? (
            <article className={queueCardClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={queueMetaChipClassName}>发布失败</span>
                <span className={queueMutedChipClassName}>待重试 {failedSyncArticles.length} 篇</span>
              </div>
              <div className="mt-4">
                <div className={sectionTitleClassName}>有些稿件在推送到公众号时失败了</div>
              </div>
              <div className={pendingOutcomeBodyClassName}>
                发布失败通常意味着连接、素材或内容格式出了问题。优先回到发布阶段修正，不要让结果链路卡在最后一步。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {failedSyncArticles.slice(0, 2).map((item) => (
                  <span key={`failed-${item.articleId}`} className={queueMetaChipClassName}>
                    {item.articleTitle} · {item.connectionName || "未命名公众号"}
                  </span>
                ))}
              </div>
              <div className={pendingOutcomeActionsClassName}>
                <Link href={`/articles/${failedSyncArticles[0].articleId}?step=publish`} className={secondaryActionLinkClassName}>
                  先处理最近失败稿件
                </Link>
                <Link href="/settings/publish#publishing-connections" className={secondaryActionLinkClassName}>
                  检查发布连接
                </Link>
              </div>
            </article>
          ) : null}

          {pendingOutcomeArticles.length > 0 ? (
            <article className={queueCardClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={queueMetaChipClassName}>待回流结果</span>
                <span className={queueMutedChipClassName}>当前 {pendingOutcomeArticles.length} 篇</span>
              </div>
              <div className="mt-4">
                <div className={sectionTitleClassName}>已发布稿件还在等待补 24h / 72h / 7d 结果</div>
              </div>
              <div className={pendingOutcomeBodyClassName}>
                结果窗口没补齐时，命中判定和复盘沉淀都不完整。先补最近时间窗，再把这批稿件送进复盘。
              </div>
              <div className={pendingOutcomeActionsClassName}>
                <Link href="#pending-outcomes" className={secondaryActionLinkClassName}>
                  去补结果
                </Link>
                <Link href="/reviews" className={secondaryActionLinkClassName}>
                  去复盘页
                </Link>
              </div>
            </article>
          ) : null}

          {articleQueueCount === 0 ? (
            <article className={queueCardClassName}>
              <div className="flex flex-wrap gap-2">
                <span className={queueMetaChipClassName}>稿件队列健康</span>
              </div>
              <div className="mt-4">
                <div className={sectionTitleClassName}>当前没有明显卡住的稿件任务</div>
              </div>
              <div className={pendingOutcomeBodyClassName}>
                草稿、发布和结果回流链路都处于可用状态。可以继续新建稿件，或回作战台选择下一条高价值选题。
              </div>
              <div className={pendingOutcomeActionsClassName}>
                <Link href="#create-article" className={secondaryActionLinkClassName}>
                  去新建稿件
                </Link>
                <Link href="/warroom" className={secondaryActionLinkClassName}>
                  回作战台
                </Link>
              </div>
            </article>
          ) : null}
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
          <AppBanner
            tone="warning"
            className="mt-5"
            eyebrow="入口迁移"
            description="历史采集入口已经并入「稿件 -> 证据」。当前还没有可接续的草稿，请先新建一篇稿件；创建后会在稿件详情里继续挂素材、补截图和做事实核查。"
          />
        ) : null}
        {hasClearedActiveQueue ? (
          <AppBanner
            tone="success"
            className="mt-5"
            eyebrow="当前状态"
            description="当前没有待推进稿件，已建稿件都已进入发布或结果回流阶段。接下来可以回复盘页补结果，也可以直接从作战台再开一篇新稿。"
          />
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

      <section id="pending-outcomes" className={sectionCardClassName}>
        <div className={sectionHeaderClassName}>
          <div>
            <div className={sectionEyebrowClassName}>待回流</div>
            <h2 className={sectionTitleClassName}>已发布稿件先在这里补 24h / 72h / 7d 结果。</h2>
          </div>
          <Link href="/reviews" className={secondaryActionLinkClassName}>
            去复盘页
          </Link>
        </div>
        <p className={heroDescriptionClassName}>
          不用再先钻进稿件详情。这里直接补结果快照，保存后会立刻刷新命中判定、结果归因和后续复盘所依赖的数据。
        </p>
        {visiblePendingOutcomeArticles.length > 0 ? (
          <div className={pendingOutcomeGridClassName}>
            {visiblePendingOutcomeArticles.map((item) => (
              <article key={item.articleId} className={pendingOutcomeCardClassName}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={sectionEyebrowClassName}>结果补录</div>
                    <h3 className="mt-2 font-serifCn text-2xl text-ink text-balance">{item.articleTitle}</h3>
                  </div>
                  <span className={item.isOverdue ? pendingOutcomeWarningChipClassName : pendingOutcomeMetaChipClassName}>
                    {item.isOverdue ? "已超期待补" : `已发布 ${Math.max(item.daysSinceUpdate, 0)} 天`}
                  </span>
                </div>
                <div className={pendingOutcomeMetaRowClassName}>
                  {item.seriesName ? (
                    <span className={pendingOutcomeMetaChipClassName}>系列：{item.seriesName}</span>
                  ) : null}
                  <span className={pendingOutcomeMetaChipClassName}>待补：{formatWindowSummary(item.missingWindowCodes)}</span>
                  <span className={pendingOutcomeMetaChipClassName}>当前判定：{formatOutcomeHitStatus(item.hitStatus)}</span>
                  {item.targetPackage ? (
                    <span className={pendingOutcomeMetaChipClassName}>目标包：{item.targetPackage}</span>
                  ) : null}
                </div>
                <div className={pendingOutcomeBodyClassName}>
                  {item.missingWindowCodes.length > 0
                    ? `当前还缺 ${formatWindowSummary(item.missingWindowCodes)} 快照。先补最近一个时间窗，后续复盘链路就能继续往下走。`
                    : item.nextAction || item.reviewSummary || "快照已经补齐，但命中判定和复盘结论还没完成。"}
                </div>
                <div className="mt-3 text-xs leading-6 text-inkMuted">
                  最近更新：{new Date(item.updatedAt).toLocaleString("zh-CN")}
                </div>
                <div className={pendingOutcomeActionsClassName}>
                  <ArticleOutcomeQuickCaptureButton
                    articleId={item.articleId}
                    articleTitle={item.articleTitle}
                    nextWindowCode={item.nextWindowCode}
                    completedWindowCodes={item.completedWindowCodes}
                    missingWindowCodes={item.missingWindowCodes}
                    currentTargetPackage={item.targetPackage}
                    currentHitStatus={item.hitStatus}
                    currentReviewSummary={item.reviewSummary}
                    currentNextAction={item.nextAction}
                    currentPlaybookTags={item.playbookTags}
                  />
                  <Link href={`/articles/${item.articleId}`} className={secondaryActionLinkClassName}>
                    打开稿件详情
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={pendingOutcomeEmptyClassName}>
            当前没有待补结果的已发布稿件。已发布稿件的 24h / 72h / 7d 快照和命中判定都已补齐后，这里会自动清空。
          </div>
        )}
      </section>

      <section className={sectionCardClassName}>
        <div className={sectionHeaderClassName}>
          <div>
            <div className={sectionEyebrowClassName}>全部稿件</div>
            <h2 className={sectionTitleClassName}>统一在这里按系列、状态、目标包、选题库和批次筛选，并按排序快速扫读。</h2>
          </div>
          <Link href="/articles" className={secondaryActionLinkClassName}>
            清空筛选
          </Link>
        </div>
        <div className={filterBarWrapClassName}>
          <div className={filterBarHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>Filter Bar</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">筛选条固定在顶部，滚动时也能继续切系列、状态和排序，不用反复回卷。</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className={filterResultsClassName}>当前 {filteredArticles.length} 篇稿件</div>
              <Link href="/articles#create-article" className={secondaryActionLinkClassName}>
                去新建稿件
              </Link>
            </div>
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
            <label className={fieldLabelClassName}>
              <div className={fieldEyebrowClassName}>排序</div>
              <Select aria-label="select control" name="sort" defaultValue={selectedSort}>
                <option value="updated_desc">最近更新优先</option>
                <option value="updated_asc">最早更新优先</option>
                <option value="status">按状态排序</option>
                <option value="series">按系列排序</option>
                <option value="target">按目标包排序</option>
              </Select>
            </label>
            <div className={filterActionsClassName}>
              <Button type="submit" variant="primary">应用筛选</Button>
            </div>
          </form>
        </div>
        <div className={articleListWrapClassName}>
          <ArticleList articles={articleCards} emptyState={articleListEmptyState} />
        </div>
      </section>
    </div>
  );
}
