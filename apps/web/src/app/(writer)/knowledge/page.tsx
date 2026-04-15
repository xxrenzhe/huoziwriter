import Link from "next/link";
import { WriterOverview } from "@/components/writer-views";
import { hasAuthorPersona } from "@/lib/author-personas";
import { getKnowledgeCardDetail, getKnowledgeCards } from "@/lib/knowledge";
import { requireWriterSession } from "@/lib/page-auth";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "暂未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStatus(value: string) {
  if (value === "active") return "稳定";
  if (value === "conflicted") return "冲突待处理";
  if (value === "stale") return "可能过期";
  if (value === "draft") return "草稿";
  return value || "未知";
}

type KnowledgePageProps = {
  searchParams?: {
    cardId?: string;
  };
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const { session } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }

  const cards = await getKnowledgeCards(session.userId);
  const selectedCardId = Number(searchParams?.cardId || cards[0]?.id || 0);
  const selectedCard = Number.isInteger(selectedCardId) && selectedCardId > 0
    ? await getKnowledgeCardDetail(session.userId, selectedCardId)
    : null;
  const conflictedCount = cards.filter((card) => card.status === "conflicted").length;
  const staleCount = cards.filter((card) => card.status === "stale").length;

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="主题档案"
        title="把碎片编译成可复用判断，而不是每次从零再想一遍。"
        description="这里集中查看个人空间沉淀的主题档案。每张卡都应该能回答三件事：现在知道什么、哪些判断变了、接下来还缺什么证据。"
        metrics={[
          { label: "主题档案", value: String(cards.length), note: "所有档案都来自你的碎片、写作和刷新动作。" },
          { label: "冲突待处理", value: String(conflictedCount), note: conflictedCount > 0 ? "这些卡片建议优先复查，避免后续写作继承旧判断。" : "当前没有高风险冲突卡片。" },
          { label: "可能过期", value: String(staleCount), note: staleCount > 0 ? "这些卡片需要补最近变化或重新编译。" : "当前没有明显过期卡片。" },
        ]}
        cards={[
          { title: "先看变化", description: "最近变化摘要和被推翻判断，应该优先影响你今天的选题与论证。", meta: "Change" },
          { title: "再看证据", description: "每张卡都要能回到来源碎片，避免结论漂浮在空气里。", meta: "Evidence" },
          { title: "最后看关联", description: "相关主题卡能帮助你在写作时做交叉验证，而不是孤立地解释一个事件。", meta: "Links" },
        ]}
      />

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-5 shadow-ink">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">档案列表</div>
              <div className="mt-2 text-sm text-stone-700">按最近更新时间排序。</div>
            </div>
            <Link href="/dashboard" className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
              去工作台编译
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {cards.length > 0 ? cards.map((card) => {
              const isSelected = selectedCard?.id === card.id;
              return (
                <Link
                  key={card.id}
                  href={`/knowledge?cardId=${card.id}`}
                  className={`block border px-4 py-4 ${
                    isSelected ? "border-cinnabar bg-white shadow-ink" : "border-stone-300/40 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                    <span>{card.card_type}</span>
                    <span className="border border-stone-300 bg-[#faf7f0] px-2 py-1">{formatStatus(card.status)}</span>
                    <span>置信度 {Math.round((card.confidence_score ?? 0) * 100)}%</span>
                  </div>
                  <div className="mt-3 font-serifCn text-2xl text-ink">{card.title}</div>
                  <div className="mt-3 text-sm leading-7 text-stone-700">{card.summary || "暂无摘要。"}</div>
                  <div className="mt-3 text-xs text-stone-500">
                    来源碎片 {card.source_fragment_count} 条 · 最近编译 {formatDateTime(card.last_compiled_at)}
                  </div>
                </Link>
              );
            }) : (
              <div className="border border-dashed border-stone-300 bg-white px-4 py-5 text-sm leading-7 text-stone-600">
                还没有主题档案。先去采集页补素材，再到工作台执行一次“从最近碎片编译主题档案”。
              </div>
            )}
          </div>
        </aside>

        <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
          {selectedCard ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前选中</div>
                  <h2 className="mt-3 font-serifCn text-4xl text-ink">{selectedCard.title}</h2>
                  <div className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">{selectedCard.summary || "暂无摘要。"}</div>
                </div>
                <div className="space-y-2 text-sm text-stone-600">
                  <div>状态：{formatStatus(selectedCard.status)}</div>
                  <div>最近编译：{formatDateTime(selectedCard.lastCompiledAt)}</div>
                  <div>最近校验：{formatDateTime(selectedCard.lastVerifiedAt)}</div>
                  <div>置信度：{Math.round((selectedCard.confidenceScore ?? 0) * 100)}%</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">关键事实</div>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
                    {selectedCard.keyFacts.length > 0 ? selectedCard.keyFacts.map((fact) => (
                      <div key={fact} className="border border-stone-300/40 bg-white px-4 py-3">{fact}</div>
                    )) : <div className="border border-dashed border-stone-300 bg-white px-4 py-3">当前还没有固化关键事实。</div>}
                  </div>
                </article>
                <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">开放问题</div>
                  <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
                    {selectedCard.openQuestions.length > 0 ? selectedCard.openQuestions.map((question) => (
                      <div key={question} className="border border-stone-300/40 bg-white px-4 py-3">{question}</div>
                    )) : <div className="border border-dashed border-stone-300 bg-white px-4 py-3">当前没有悬而未决的问题。</div>}
                  </div>
                </article>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <article className="border border-stone-300/40 bg-[#fff3f3] p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">最近变化与被推翻判断</div>
                  <div className="mt-4 text-sm leading-7 text-stone-700">
                    {selectedCard.latestChangeSummary || "当前没有记录到显著变化摘要。"}
                  </div>
                  <div className="mt-4 space-y-2 text-sm leading-7 text-stone-700">
                    {selectedCard.overturnedJudgements.length > 0 ? selectedCard.overturnedJudgements.map((item) => (
                      <div key={item} className="border border-[#e7c3c4] bg-white px-4 py-3">{item}</div>
                    )) : <div className="border border-dashed border-[#e7c3c4] bg-white px-4 py-3">当前没有被推翻的旧判断。</div>}
                  </div>
                </article>
                <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                  <div className="text-xs uppercase tracking-[0.22em] text-stone-500">来源碎片与关联档案</div>
                  <div className="mt-4 space-y-2 text-sm leading-7 text-stone-700">
                    {selectedCard.sourceFragments.length > 0 ? selectedCard.sourceFragments.slice(0, 6).map((fragment) => (
                      <div key={fragment.id} className="border border-stone-300/40 bg-white px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Fragment #{fragment.id}</div>
                        <div className="mt-2">{fragment.distilledContent}</div>
                      </div>
                    )) : <div className="border border-dashed border-stone-300 bg-white px-4 py-3">当前没有关联来源碎片。</div>}
                    {selectedCard.relatedCards.length > 0 ? selectedCard.relatedCards.slice(0, 4).map((card) => (
                      <div key={card.id} className="border border-stone-300/40 bg-white px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{card.linkType} · {formatStatus(card.status)}</div>
                        <div className="mt-2 font-medium text-ink">{card.title}</div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">{card.summary || "暂无摘要。"}</div>
                      </div>
                    )) : null}
                  </div>
                </article>
              </div>

              <article className="border border-stone-300/40 bg-white p-5">
                <div className="text-xs uppercase tracking-[0.22em] text-stone-500">修订记录</div>
                <div className="mt-4 space-y-3">
                  {selectedCard.revisions.length > 0 ? selectedCard.revisions.slice(0, 6).map((revision) => (
                    <div key={revision.id} className="border border-stone-300/40 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Revision {revision.revisionNo} · {formatDateTime(revision.createdAt)}</div>
                      <div className="mt-2">{revision.changeSummary || "本次没有额外摘要。"}</div>
                    </div>
                  )) : <div className="border border-dashed border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-stone-600">当前没有修订记录。</div>}
                </div>
              </article>
            </div>
          ) : (
            <div className="border border-dashed border-stone-300 bg-[#faf7f0] px-5 py-6 text-sm leading-7 text-stone-600">
              还没有可查看的主题档案。先去采集页补素材，再到工作台编译。
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
