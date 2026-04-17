import Link from "next/link";
import { getReviewData } from "@/lib/article-outcomes";
import { requireWriterSession } from "@/lib/page-auth";
import { hasPersona } from "@/lib/personas";

export default async function ReviewPage() {
  const { session } = await requireWriterSession();
  if (!(await hasPersona(session.userId))) {
    return null;
  }

  const { hitCandidates, nearMisses, seriesPlaybooks, playbooks } = await getReviewData(session.userId);

  return (
    <div className="space-y-8">
      <section className="border border-stone-300/40 bg-[rgba(255,255,255,0.72)] p-6 shadow-ink md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">复盘</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">结果与经验沉淀，先从一个入口收口。</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">
          复盘页统一消费真实结果回流：24h / 72h / 7d 快照、命中判定和打法标签都从结果模型读取，只回答哪些命中了、哪些差一点、下一篇该复用什么。
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["命中结果", String(hitCandidates.length), "已完成回流并判定命中目标包的稿件。"] as const,
            ["差一点命中", String(nearMisses.length), "已回流但仍差一点命中的稿件。"] as const,
            ["系列打法", String(seriesPlaybooks.length), "按系列聚合真实回流后的打法沉淀。"] as const,
            ["全局打法", String(playbooks.length), "跨系列汇总可复用的打法标签。"] as const,
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
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">命中结果</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">先看哪些稿件已经完成命中判定。</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {hitCandidates.slice(0, 6).map(({ article, bundle }) => (
            <article key={article.id} className="border border-stone-300/40 bg-[#fffdfa] p-5">
              <div className="font-serifCn text-2xl text-ink">{article.title}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                {bundle?.outcome?.reviewSummary || "这篇稿件已经命中目标包，可继续沉淀可复用打法。"}
              </div>
              <div className="mt-3 text-xs leading-6 text-stone-500">
                {bundle?.outcome?.targetPackage ? `目标包：${bundle.outcome.targetPackage} · ` : ""}
                已补快照：{bundle?.completedWindowCodes.join(" / ") || "待补"}
              </div>
              <Link href={`/articles/${article.id}`} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-ink">
                打开稿件
              </Link>
            </article>
          ))}
          {hitCandidates.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 xl:col-span-2">
              当前还没有命中结果。先补齐已发布稿件的回流快照，并完成命中判定。
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">差一点命中</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">先看那些已经回流，但仍差一点的稿件。</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {nearMisses.slice(0, 6).map(({ article, bundle }) => (
            <article key={article.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="font-serifCn text-2xl text-ink">{article.title}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                {bundle?.outcome?.nextAction || bundle?.outcome?.reviewSummary || "已经形成结果回流，下一篇应针对这次差距重写打法。"}
              </div>
              <div className="mt-3 text-xs leading-6 text-stone-500">
                {bundle?.outcome?.targetPackage ? `目标包：${bundle.outcome.targetPackage} · ` : ""}
                已补快照：{bundle?.completedWindowCodes.join(" / ") || "待补"}
              </div>
              <Link href={`/articles/${article.id}`} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-ink">
                打开稿件
              </Link>
            </article>
          ))}
          {nearMisses.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 xl:col-span-2">
              当前没有“差一点命中”的稿件。
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">系列打法沉淀</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">先看每个系列，下一篇该继续放大哪套打法。</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {seriesPlaybooks.map((item) => (
            <article key={item.seriesId} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-serifCn text-2xl text-ink">{item.seriesName}</div>
                  <div className="mt-2 text-xs leading-6 text-stone-500">
                    绑定人设：{item.personaName} · 已沉淀 {item.articleCount} 篇结果样本
                  </div>
                </div>
                <div className="border border-stone-300 bg-white px-3 py-2 text-xs leading-6 text-stone-700">
                  命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇
                </div>
              </div>
              <div className="mt-4 text-sm leading-7 text-stone-700">
                {item.latestArticleTitle ? `最近一次沉淀来自《${item.latestArticleTitle}》` : "当前系列还没有可展示的最近样本。"}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.topLabels.slice(0, 3).map((label) => (
                  <span key={`${item.seriesId}-${label.label}`} className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                    {label.label} · 命中 {label.hitCount} / 差一点 {label.nearMissCount}
                  </span>
                ))}
                {item.topLabels.length === 0 ? (
                  <span className="border border-dashed border-stone-300 px-3 py-1 text-xs text-stone-500">
                    当前系列还没有打法标签，先补复盘结论或目标包。
                  </span>
                ) : null}
              </div>
              <Link href={`/articles?series=${item.seriesId}`} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-ink">
                查看该系列稿件
              </Link>
            </article>
          ))}
          {seriesPlaybooks.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 xl:col-span-2">
              当前还没有形成系列打法沉淀。先让已发布稿件补齐结果回流，再写清楚打法标签和复盘结论。
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">全局打法沉淀</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">跨系列看，下一篇该复用什么。</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playbooks.map((item) => (
            <article key={item.label} className="border border-stone-300/40 bg-[#fffdfa] px-4 py-4">
              <div className="font-medium text-ink">{item.label}</div>
              <div className="mt-2 text-sm leading-7 text-stone-700">命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇</div>
              <div className="mt-2 text-xs leading-6 text-stone-500">
                {item.latestArticleTitle ? `最近出现在《${item.latestArticleTitle}》` : "等待更多结果样本"}
              </div>
            </article>
          ))}
          {playbooks.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 md:col-span-2 xl:col-span-3">
              当前还没有足够的打法数据。先录入真实结果，再给稿件补打法标签和复盘结论。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
