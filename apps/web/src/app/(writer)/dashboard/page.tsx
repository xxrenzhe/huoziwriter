import Link from "next/link";
import { ArticleList, CreateArticleForm, WriterPaperEmptyState } from "@/components/dashboard-client";
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
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl text-balance">今天最值得写什么，先在这里定优先级。</h1>
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
              <div className="mt-3 font-serifCn text-4xl text-ink text-balance">{value}</div>
              <p className="mt-3 text-sm leading-7 text-stone-700">{note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">今日优先选题</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">先选最值得写的，不先堆能力入口。</h2>
          </div>
          <Link href="/articles" className="border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-ink">
            进入稿件区
          </Link>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {warroom.topics.map((topic, index) => (
            <article key={topic.id} className="border border-stone-300/40 bg-[#fffdfa] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-stone-500">优先位 {index + 1}</div>
              <h3 className="mt-3 font-serifCn text-2xl text-ink text-balance">{topic.title}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-700">{topic.summary || topic.recommendationReason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600">
                <span className="border border-stone-300 bg-white px-3 py-1">{topic.sourceName}</span>
                <span className="border border-stone-300 bg-white px-3 py-1">{topic.recommendationType}</span>
                {topic.matchedPersonaName ? <span className="border border-stone-300 bg-white px-3 py-1">{topic.matchedPersonaName}</span> : null}
              </div>
            </article>
          ))}
          {warroom.topics.length === 0 ? (
            <div className="xl:col-span-3">
              <WriterPaperEmptyState
                eyebrow="今日优先选题"
                title="今天暂时没有新的高优先题。"
                detail="这不代表系统停了，而是说明当前信源里还没有足够强的新机会。先继续推进现有稿件，或去设置补充更贴近你问题域的信源。"
                prompts={[
                  "优先清掉已经开头的稿件，再回来等新题。",
                  "自定义信源越贴近系列，优先位越准。",
                  "没有新题时，结果回流往往比继续扩入口更值钱。",
                ]}
                actionHref="/articles"
                actionLabel="进入稿件区"
                secondaryHref="/settings"
                secondaryLabel="去补信源"
                compact
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">待推进稿件</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">把已经开头的稿件继续推完。</h2>
        <div className="mt-5">
          <CreateArticleForm
            seriesOptions={warroom.series}
          />
        </div>
        <div className="mt-6">
          <ArticleList
            articles={warroom.drafts}
            emptyState={{
              eyebrow: "待推进稿件",
              title: "案头暂时没有半截稿。",
              detail: "这意味着当前没有需要续写的稿件。你可以直接立一篇新稿，或者先去结果区补齐已经发布稿件的回流。",
              prompts: [
                "先新建一篇最值得写的稿件，不必同时开多坑。",
                "如果已有发布稿还没补结果，优先把回流补完整。",
                "草稿区越干净，作战台的判断越不容易失真。",
              ],
              actionHref: "/articles#create-article",
              actionLabel: "去新建稿件",
              secondaryHref: "/articles",
              secondaryLabel: "进入稿件区",
            }}
          />
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">待回流稿件</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">已经发布的稿件，下一步是补结果，不是继续埋入口。</h2>
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {warroom.pendingOutcomeArticles.map(({ article, missingWindowCodes, hitStatus }) => (
            <article key={article.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-stone-500">待录结果</div>
              <div className="mt-3 font-serifCn text-2xl text-ink text-balance">{article.title}</div>
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
            <div className="xl:col-span-3">
              <WriterPaperEmptyState
                eyebrow="待回流稿件"
                title="结果区暂时没有待补回流。"
                detail="要么当前还没有发布稿件，要么已发布稿件的 24h / 72h / 7d 快照与命中判定已经补齐。这里空着，不是坏事。"
                prompts={[
                  "新稿发布后，记得按时间窗回来补快照。",
                  "结果回流补得越完整，打法沉淀越可靠。",
                  "没有待补项时，可以回去继续推进新稿。",
                ]}
                actionHref="/articles"
                actionLabel="查看全部稿件"
                compact
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">本周有效打法</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">先沉淀能复用的打法，再谈更多功能。</h2>
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
            <div className="md:col-span-2 xl:col-span-4">
              <WriterPaperEmptyState
                eyebrow="本周有效打法"
                title="经验库还没攒到能复用的程度。"
                detail="打法区需要真实回流样本，而不是空想模板。先补结果快照、命中判定和打法标签，这里才会慢慢长出可复用经验。"
                prompts={[
                  "每篇稿至少补一次明确的复盘结论。",
                  "打法标签写得越具体，后续沉淀越有用。",
                  "先求真实样本，再谈泛化模板。",
                ]}
                actionHref="/articles"
                actionLabel="去补结果回流"
                compact
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
