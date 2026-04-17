import Link from "next/link";
import { ArticleList, CreateArticleForm } from "@/components/dashboard-client";
import { requireWriterSession } from "@/lib/page-auth";
import { hasPersona } from "@/lib/personas";
import { getWarroomData } from "@/lib/warroom";

export default async function DashboardPage() {
  const { session } = await requireWriterSession();
  if (!(await hasPersona(session.userId))) {
    return null;
  }

  const warroom = await getWarroomData(session.userId);

  return (
    <div className="space-y-8">
      <section className="border border-stone-300/40 bg-[rgba(255,255,255,0.72)] p-6 shadow-ink md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">作战台</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">今天最值得写什么，先在这里定优先级。</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">
          作战台只保留四个判断面板：今日优先选题、待推进稿件、待回流稿件和本周有效打法。待回流面板按 24h / 72h / 7d 结果快照缺口与命中状态直接计算。
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            ["今日选题", String(warroom.summary.topicCount), warroom.summary.canStartRadar ? "优先从热点与系列匹配项起稿。" : "免费版先看系统给出的 1 个优先位。"] as const,
            ["待推进稿件", String(warroom.summary.draftCount), warroom.summary.draftCount > 0 ? "先清空正在写的稿件，再开新坑。" : "当前没有积压草稿。"] as const,
            ["待回流稿件", String(warroom.summary.pendingOutcomeCount), "按缺失的 24h / 72h / 7d 结果快照与命中判定计算。"] as const,
            ["素材库存", String(warroom.summary.fragmentCount), "所有证据与素材都会在稿件阶段被调用。"] as const,
          ].map(([label, value, note]) => (
            <article key={label} className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.26em] text-stone-500">{label}</div>
              <div className="mt-3 font-serifCn text-4xl text-ink">{value}</div>
              <p className="mt-3 text-sm leading-7 text-stone-700">{note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">今日优先选题</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">先选最值得写的，不先堆能力入口。</h2>
          </div>
          <Link href="/articles" className="border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-ink">
            进入稿件区
          </Link>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {warroom.topics.map((topic, index) => (
            <article key={topic.id} className="border border-stone-300/40 bg-[#fffdfa] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-stone-500">优先位 {index + 1}</div>
              <h3 className="mt-3 font-serifCn text-2xl text-ink">{topic.title}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-700">{topic.summary || topic.recommendationReason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600">
                <span className="border border-stone-300 bg-white px-3 py-1">{topic.sourceName}</span>
                <span className="border border-stone-300 bg-white px-3 py-1">{topic.recommendationType}</span>
                {topic.matchedPersonaName ? <span className="border border-stone-300 bg-white px-3 py-1">{topic.matchedPersonaName}</span> : null}
              </div>
            </article>
          ))}
          {warroom.topics.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 xl:col-span-3">
              当前还没有新的优先选题。系统信源会继续补货；如果你在付费套餐，可去设置补充自定义信源。
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">待推进稿件</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">把已经开头的稿件继续推完。</h2>
        <div className="mt-5">
          <CreateArticleForm
            seriesOptions={warroom.series}
          />
        </div>
        <div className="mt-6">
          <ArticleList articles={warroom.drafts} />
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">待回流稿件</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">已经发布的稿件，下一步是补结果，不是继续埋入口。</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {warroom.pendingOutcomeArticles.map(({ article, missingWindowCodes, hitStatus }) => (
            <article key={article.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-stone-500">待录结果</div>
              <div className="mt-3 font-serifCn text-2xl text-ink">{article.title}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                {missingWindowCodes.length > 0
                  ? `还缺 ${missingWindowCodes.join(" / ")} 结果快照。`
                  : hitStatus === "pending"
                    ? "快照已补齐，但还没完成命中判定和复盘结论。"
                    : "结果回流仍有待补项。"}
              </div>
              <Link href={`/articles/${article.id}`} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-ink">
                打开稿件
              </Link>
            </article>
          ))}
          {warroom.pendingOutcomeArticles.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 xl:col-span-3">
              当前没有待回流稿件。等稿件真正发布后，这里会承接结果录入和命中判定。
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">本周有效打法</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">先沉淀能复用的打法，再谈更多功能。</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {warroom.playbooks.map((item) => (
            <article key={item.label} className="border border-stone-300/40 bg-[#fffdfa] px-4 py-4">
              <div className="font-medium text-ink">{item.label}</div>
              <div className="mt-2 text-sm leading-7 text-stone-700">命中 {item.hitCount} 篇 · 差一点 {item.nearMissCount} 篇</div>
              <div className="mt-2 text-xs leading-6 text-stone-500">
                {item.latestArticleTitle ? `最近出现在《${item.latestArticleTitle}》` : "等待更多结果样本"}
              </div>
            </article>
          ))}
          {warroom.playbooks.length === 0 ? (
            <div className="border border-dashed border-stone-300 px-5 py-5 text-sm leading-7 text-stone-700 md:col-span-2 xl:col-span-4">
              当前还没有足够的真实打法数据。先补齐结果回流并写下打法标签，这里才会开始沉淀可复用经验。
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
