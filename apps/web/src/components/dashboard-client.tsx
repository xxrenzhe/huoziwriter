"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function CreateDocumentForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "未命名文稿" }),
    });
    const json = await response.json();
    setLoading(false);
    if (response.ok && json.success) {
      router.push(`/editor/${json.data.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="输入文稿标题"
        className="min-w-[240px] flex-1 border border-stone-300 bg-white px-4 py-3 text-sm"
      />
      <button disabled={loading} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
        {loading ? "创建中..." : "新建文稿"}
      </button>
    </form>
  );
}

export function DocumentList({
  documents,
}: {
  documents: Array<{ id: number; title: string; status: string; updatedAt: string }>;
}) {
  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <Link
          key={document.id}
          href={`/editor/${document.id}`}
          className="block border border-stone-300/40 bg-white p-5 shadow-ink transition-colors hover:bg-[#fffdfa]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-serifCn text-2xl text-ink">{document.title}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{document.status}</div>
          </div>
          <div className="mt-3 text-sm text-stone-600">最后更新：{new Date(document.updatedAt).toLocaleString("zh-CN")}</div>
        </Link>
      ))}
      {documents.length === 0 ? <div className="border border-dashed border-stone-300 p-5 text-sm text-stone-600">还没有文稿，先创建一篇。</div> : null}
    </div>
  );
}

export function KnowledgeCardsPanel({
  cards,
}: {
  cards: Array<{
    id: number;
    title: string;
    cardType: string;
    summary: string | null;
    confidenceScore: number;
    status: string;
    lastCompiledAt: string | null;
    sourceFragmentCount: number;
  }>;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">主题档案</div>
          <h2 className="mt-3 font-serifCn text-3xl text-ink">长期写作不要反复从零总结。</h2>
        </div>
        <div className="text-sm text-stone-600">系统会把近期高频碎片编译成只读档案，优先服务系列写作与热点追踪。</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.id} className="border border-stone-300/40 bg-white p-5 shadow-ink">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{card.cardType}</div>
              <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">{card.status}</div>
            </div>
            <h3 className="mt-4 font-serifCn text-2xl text-ink">{card.title}</h3>
            <p className="mt-3 text-sm leading-7 text-stone-700">{card.summary || "当前档案仍在生成中，稍后会出现摘要。"}</p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-stone-500">
              <span>证据碎片 {card.sourceFragmentCount}</span>
              <span>置信度 {Math.round(card.confidenceScore * 100)}%</span>
              <span>{card.lastCompiledAt ? `更新于 ${new Date(card.lastCompiledAt).toLocaleString("zh-CN")}` : "待编译"}</span>
            </div>
          </article>
        ))}
      </div>
      {cards.length === 0 ? <div className="border border-dashed border-stone-300 p-5 text-sm text-stone-600">还没有主题档案，先采集几条高质量碎片再编译。</div> : null}
    </section>
  );
}

export function TopicRadarStarter({
  topics,
  knowledgeMatches = {},
}: {
  topics: Array<{ id: number; title: string; sourceName: string; emotionLabels: string[]; angleOptions: string[] }>;
  knowledgeMatches?: Record<number, Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number }>>;
}) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handleStart(topicId: number, angleIndex: number) {
    const key = `${topicId}-${angleIndex}`;
    setLoadingKey(key);
    const response = await fetch("/api/topic-radar/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, angleIndex }),
    });
    const json = await response.json();
    setLoadingKey(null);
    if (response.ok && json.success) {
      router.push(`/editor/${json.data.documentId}`);
      router.refresh();
    }
  }

  if (topics.length === 0) {
    return (
      <div className="border border-dashed border-stone-300 bg-white p-6 text-sm leading-7 text-stone-600 shadow-ink">
        当前还没有抓到新的热点。系统会在读取默认源和你的可见作用域信息源后自动补货；如果你是 `ultra/team`，也可以先在下方添加新的外部源。
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {topics.map((topic) => (
        <article key={topic.id} className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{topic.sourceName}</div>
          <h2 className="mt-4 font-serifCn text-2xl text-ink">{topic.title}</h2>
          {knowledgeMatches[topic.id]?.length ? (
            <div className="mt-3 border border-[#eadfb9] bg-[#fdf6d7] px-3 py-3 text-sm text-stone-700">
              已命中 {knowledgeMatches[topic.id].length} 个主题档案：
              {" "}
              {knowledgeMatches[topic.id].map((item) => item.title).join(" / ")}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {topic.emotionLabels.map((label) => (
              <span key={label} className="border border-cinnabar px-2 py-1 text-xs text-cinnabar">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {topic.angleOptions.slice(0, 3).map((angle, index) => {
              const key = `${topic.id}-${index}`;
              return (
                <button
                  key={angle}
                  onClick={() => handleStart(topic.id, index)}
                  disabled={loadingKey !== null}
                  className="flex w-full items-start justify-between gap-4 border border-stone-300 bg-[#faf7f0] px-4 py-4 text-left text-sm leading-7 text-stone-700 disabled:opacity-60"
                >
                  <span>{angle}</span>
                  <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-cinnabar">
                    {loadingKey === key ? "生成中" : "以此落笔"}
                  </span>
                </button>
              );
            })}
          </div>
          {knowledgeMatches[topic.id]?.length ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
              {knowledgeMatches[topic.id].map((item) => (
                <span key={item.id} className="border border-stone-300 px-2 py-1">
                  {item.cardType} · {Math.round(item.confidenceScore * 100)}%
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
