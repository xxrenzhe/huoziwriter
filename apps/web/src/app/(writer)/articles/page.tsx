import Link from "next/link";
import { ArticleList, CreateArticleForm } from "@/components/dashboard-client";
import { compareArticleStatuses, formatArticleStatusLabel, isPublishedArticleStatus, normalizeArticleStatus } from "@/lib/article-status-label";
import { requireWriterSession } from "@/lib/page-auth";
import { hasPersona } from "@/lib/personas";
import { getArticleOutcomeBundlesByUser, getArticlesByUser, getWechatSyncLogs } from "@/lib/repositories";
import { getSeries } from "@/lib/series";

function getSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { session } = await requireWriterSession();
  if (!(await hasPersona(session.userId))) {
    return null;
  }

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
  const redirectedFromCapture = getSearchValue(searchParams?.fromCapture) === "1";
  const drafts = normalizedArticles.filter((article) => !isPublishedArticleStatus(article.status));
  const publishedArticles = normalizedArticles.filter((article) => isPublishedArticleStatus(article.status));
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
  const statusOptions = Array.from(new Set(normalizedArticles.map((article) => article.status))).sort(compareArticleStatuses);
  const filteredArticles = normalizedArticles.filter((article) => {
    const bundle = outcomeBundleMap.get(article.id);
    const matchesSeries = !Number.isInteger(selectedSeriesId) || selectedSeriesId <= 0 || article.series_id === selectedSeriesId;
    const matchesStatus = !selectedStatus || article.status === selectedStatus;
    const matchesTargetPackage = !selectedTargetPackage || String(bundle?.outcome?.targetPackage || "").trim() === selectedTargetPackage;
    return matchesSeries && matchesStatus && matchesTargetPackage;
  });
  const articleCards = filteredArticles.map((article) => {
    const bundle = outcomeBundleMap.get(article.id);
    return {
      id: article.id,
      title: article.title,
      status: formatArticleStatusLabel(article.status),
      updatedAt: article.updated_at,
      seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
      targetPackage: bundle?.outcome?.targetPackage ?? null,
    };
  });

  return (
    <div className="space-y-8">
      <section className="border border-stone-300/40 bg-[rgba(255,255,255,0.72)] p-6 shadow-ink md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">稿件</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">稿件是唯一内容生产对象。</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">
          所有稿件都从这里进入，并统一落到机会、策略、证据、成稿、发布、结果六步主链路。
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            ["全部稿件", String(articles.length), "统一从这里进入稿件详情。"] as const,
            ["待推进", String(drafts.length), "还没发布的稿件优先清空。"] as const,
            ["已发布", String(publishedArticles.length), "结果回流、命中判定和复盘都从稿件详情继续推进。"] as const,
            ["已推送微信", String(recentlySyncedIds.size), "已形成成功草稿箱记录的稿件数。"] as const,
          ].map(([label, value, note]) => (
            <article key={label} className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
              <div className="mt-3 font-serifCn text-4xl text-ink">{value}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">{note}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">新建稿件</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">从一个题目开始，先把稿件对象立起来。</h2>
          </div>
          <Link href="/dashboard" className="border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-ink">
            回到作战台
          </Link>
        </div>
        {redirectedFromCapture ? (
          <div className="mt-5 border border-[#dfd2b0] bg-[#fff8e8] px-4 py-4 text-sm leading-7 text-[#7d6430]">
            历史采集入口已经并入「稿件 -&gt; 证据」。当前还没有可接续的草稿，请先新建一篇稿件；创建后会在稿件详情里继续挂素材、补截图和做事实核查。
          </div>
        ) : null}
        <div className="mt-5">
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

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">全部稿件</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">统一在这里按系列、状态和目标包筛选。</h2>
          </div>
          <Link href="/articles" className="border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-ink">
            清空筛选
          </Link>
        </div>
        <form className="mt-6 grid gap-3 xl:grid-cols-4" method="GET">
          <label className="block text-sm text-stone-700">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-stone-500">系列</div>
            <select name="series" defaultValue={Number.isInteger(selectedSeriesId) && selectedSeriesId > 0 ? String(selectedSeriesId) : ""} className="w-full border border-stone-300 bg-white px-4 py-3 text-sm">
              <option value="">全部系列</option>
              {series.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-stone-700">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-stone-500">状态</div>
            <select name="status" defaultValue={selectedStatus} className="w-full border border-stone-300 bg-white px-4 py-3 text-sm">
              <option value="">全部状态</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {formatArticleStatusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-stone-700">
            <div className="mb-2 text-xs uppercase tracking-[0.16em] text-stone-500">目标包</div>
            <select name="targetPackage" defaultValue={selectedTargetPackage} className="w-full border border-stone-300 bg-white px-4 py-3 text-sm">
              <option value="">全部目标包</option>
              {targetPackageOptions.map((targetPackage) => (
                <option key={targetPackage} value={targetPackage}>
                  {targetPackage}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button className="bg-cinnabar px-5 py-3 text-sm text-white">应用筛选</button>
            <div className="text-sm text-stone-600">当前命中 {filteredArticles.length} 篇稿件</div>
          </div>
        </form>
        <div className="mt-6">
          <ArticleList articles={articleCards} />
        </div>
      </section>
    </div>
  );
}
