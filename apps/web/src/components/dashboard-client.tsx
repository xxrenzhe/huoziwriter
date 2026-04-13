"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

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

type KnowledgeCardSummary = {
  id: number;
  title: string;
  cardType: string;
  workspaceScope: string;
  summary: string | null;
  conflictFlags: string[];
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  sourceFragmentCount: number;
  shared?: boolean;
  ownerUsername?: string | null;
};

type KnowledgeCardDetail = {
  id: number;
  userId: number;
  ownerUsername: string | null;
  shared: boolean;
  workspaceScope: string;
  cardType: string;
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions: string[];
  conflictFlags: string[];
  sourceFragmentIds: number[];
  relatedCardIds: number[];
  relatedCards: Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number; summary: string | null; shared: boolean; ownerUsername: string | null; linkType: string }>;
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  lastVerifiedAt: string | null;
  revisions: Array<{ id: number; revisionNo: number; changeSummary: string | null; createdAt: string }>;
};

function formatKnowledgeStatus(status: string) {
  if (status === "active") return "可引用";
  if (status === "stale") return "待刷新";
  if (status === "conflicted") return "有冲突";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

async function parseResponseMessage(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text || "请求失败";
  }
}

export function KnowledgeCardsPanel({
  cards,
  canCompile,
  fragmentCount,
  isTeamShared = false,
  sharedFragmentCount = 0,
  sharedCardCount = 0,
  sharedMemberCount = 1,
}: {
  cards: KnowledgeCardSummary[];
  canCompile: boolean;
  fragmentCount: number;
  isTeamShared?: boolean;
  sharedFragmentCount?: number;
  sharedCardCount?: number;
  sharedMemberCount?: number;
}) {
  const router = useRouter();
  const [compiling, setCompiling] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<number | null>(cards[0]?.id ?? null);
  const [detail, setDetail] = useState<KnowledgeCardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedCardId((current) => {
      if (current && cards.some((card) => card.id === current)) {
        return current;
      }
      return cards[0]?.id ?? null;
    });
  }, [cards]);

  useEffect(() => {
    if (!selectedCardId) {
      setDetail(null);
      return;
    }
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/knowledge/cards/${selectedCardId}`);
        if (!response.ok) {
          throw new Error(await parseResponseMessage(response));
        }
        const json = (await response.json()) as { success: boolean; data: KnowledgeCardDetail };
        if (!cancelled) {
          setDetail(json.data);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "主题档案详情加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedCardId]);

  async function handleCompile() {
    setCompiling(true);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/compile", {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.error || "主题档案编译失败");
        return;
      }
      setMessage(`已从最近碎片编译主题档案：${json.data.title}`);
      setSelectedCardId(json.data.id);
      setDetail(json.data);
      router.refresh();
    } catch {
      setMessage("主题档案编译失败");
    } finally {
      setCompiling(false);
    }
  }

  async function handleRefresh(cardId: number) {
    setRefreshingId(cardId);
    setMessage("");
    try {
      const response = await fetch(`/api/knowledge/cards/${cardId}/refresh`, { method: "POST" });
      if (!response.ok) {
        setMessage(await parseResponseMessage(response));
        return;
      }
      const json = (await response.json()) as { success: boolean; data: KnowledgeCardDetail };
      setMessage(`已刷新主题档案：${json.data.title}`);
      setSelectedCardId(json.data.id);
      setDetail(json.data);
      router.refresh();
    } catch {
      setMessage("主题档案刷新失败");
    } finally {
      setRefreshingId(null);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">主题档案</div>
          <h2 className="mt-3 font-serifCn text-3xl text-ink">长期写作不要反复从零总结。</h2>
        </div>
        <div className="space-y-2 text-right">
          <div className="text-sm text-stone-600">系统会把近期高频碎片编译成只读档案，优先服务系列写作与热点追踪。</div>
          <button
            onClick={handleCompile}
            disabled={!canCompile || compiling}
            className={`px-4 py-3 text-sm ${canCompile ? "bg-cinnabar text-white" : "border border-stone-300 bg-white text-stone-400"} disabled:opacity-60`}
          >
            {canCompile ? (compiling ? "编译中..." : "从最近碎片编译主题档案") : "碎片不足，暂不可编译"}
          </button>
        </div>
      </div>
      {message ? <div className="border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">{message}</div> : null}
      {isTeamShared ? (
        <div className="border border-stone-300/40 bg-white px-4 py-4 text-sm leading-7 text-stone-700 shadow-ink">
          当前为团队共享主题档案模式。编译时会综合 {sharedMemberCount} 个团队账号可见碎片；当前可见共享碎片 {sharedFragmentCount} 条，共享主题档案 {sharedCardCount} 张。
        </div>
      ) : null}
      {!canCompile ? <div className="border border-dashed border-stone-300 px-4 py-4 text-sm leading-7 text-stone-600">当前只有 {fragmentCount} 条碎片，先去采集中心补充内容，再回来编译主题档案。</div> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 md:grid-cols-2">
          {cards.map((card) => {
            const selected = card.id === selectedCardId;
            return (
              <article key={card.id} className={`border bg-white p-5 shadow-ink ${selected ? "border-cinnabar" : "border-stone-300/40"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{card.cardType}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">{formatKnowledgeStatus(card.status)}</div>
                </div>
                {card.shared ? (
                  <div className="mt-3 inline-flex border border-stone-300 bg-[#faf7f0] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                    团队共享{card.ownerUsername ? ` · ${card.ownerUsername}` : ""}
                  </div>
                ) : null}
                <h3 className="mt-4 font-serifCn text-2xl text-ink">{card.title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-700">{card.summary || "当前档案仍在生成中，稍后会出现摘要。"}</p>
                <div className="mt-5 flex flex-wrap gap-3 text-xs text-stone-500">
                  <span>证据碎片 {card.sourceFragmentCount}</span>
                  <span>{card.workspaceScope === "team" ? "团队作用域" : "个人作用域"}</span>
                  <span>置信度 {Math.round(card.confidenceScore * 100)}%</span>
                  <span>{card.lastCompiledAt ? `更新于 ${new Date(card.lastCompiledAt).toLocaleString("zh-CN")}` : "待编译"}</span>
                </div>
                {card.conflictFlags.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {card.conflictFlags.map((flag) => (
                      <span key={`${card.id}-${flag}`} className="border border-[#d8b0b2] bg-[#fff3f3] px-2 py-1 text-[11px] text-[#8f3136]">
                        {flag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCardId(card.id)}
                    className={`px-3 py-2 text-sm ${selected ? "bg-cinnabar text-white" : "border border-stone-300 bg-[#faf7f0] text-stone-700"}`}
                  >
                    {selected ? "当前详情" : "查看详情"}
                  </button>
                  {(card.status === "stale" || card.status === "conflicted") ? (
                    <button
                      onClick={() => handleRefresh(card.id)}
                      disabled={refreshingId === card.id}
                      className="border border-cinnabar px-3 py-2 text-sm text-cinnabar disabled:opacity-60"
                    >
                      {refreshingId === card.id ? "刷新中..." : "刷新档案"}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
        <aside className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">详情面板</div>
              <div className="mt-2 text-sm leading-7 text-stone-600">这里真实消费 `GET /api/knowledge/cards/:id`，把摘要、证据、问题和修订历史拉平给用户。</div>
            </div>
            {detail ? <span className="border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600">{formatKnowledgeStatus(detail.status)}</span> : null}
          </div>
          {!selectedCardId ? (
            <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
              还没有可查看的主题档案。
            </div>
          ) : detailLoading ? (
            <div className="mt-4 border border-stone-300 bg-white px-4 py-4 text-sm text-stone-600">主题档案详情加载中...</div>
          ) : detail ? (
            <div className="mt-4 space-y-4">
              <div className="border border-stone-300 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{detail.cardType}</div>
                {detail.shared ? (
                  <div className="mt-3 inline-flex border border-stone-300 bg-[#faf7f0] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                    团队共享{detail.ownerUsername ? ` · ${detail.ownerUsername}` : ""}
                  </div>
                ) : null}
                <h3 className="mt-3 font-serifCn text-3xl text-ink">{detail.title}</h3>
                <p className="mt-3 text-sm leading-7 text-stone-700">{detail.summary || "暂无摘要"}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
                  <span>{detail.workspaceScope === "team" ? "团队作用域" : "个人作用域"}</span>
                  <span>置信度 {Math.round(detail.confidenceScore * 100)}%</span>
                  <span>{detail.lastCompiledAt ? `最近编译 ${new Date(detail.lastCompiledAt).toLocaleString("zh-CN")}` : "尚未编译"}</span>
                  <span>{detail.lastVerifiedAt ? `最近核验 ${new Date(detail.lastVerifiedAt).toLocaleString("zh-CN")}` : "待核验"}</span>
                </div>
              </div>
              {detail.conflictFlags.length ? (
                <div className="border border-[#d8b0b2] bg-[#fff3f3] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#8f3136]">冲突标记</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.conflictFlags.map((flag) => (
                      <span key={`${detail.id}-flag-${flag}`} className="border border-[#d8b0b2] bg-white px-3 py-2 text-xs text-[#8f3136]">
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.keyFacts.length ? (
                <div className="border border-stone-300 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">关键事实</div>
                  <div className="mt-3 space-y-2">
                    {detail.keyFacts.map((fact, index) => (
                      <div key={`${detail.id}-fact-${index}`} className="border border-[#dcc8a6] bg-[#fff8eb] px-3 py-3 text-sm leading-7 text-stone-700">
                        {fact}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.openQuestions.length ? (
                <div className="border border-stone-300 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">待确认问题</div>
                  <div className="mt-3 space-y-2">
                    {detail.openQuestions.map((question, index) => (
                      <div key={`${detail.id}-question-${index}`} className="text-sm leading-7 text-stone-700">
                        {question}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {detail.relatedCards.length ? (
                <div className="border border-stone-300 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">关联档案</div>
                  <div className="mt-3 space-y-3">
                    {detail.relatedCards.map((relatedCard) => (
                      <button
                        key={`${detail.id}-related-${relatedCard.id}`}
                        onClick={() => setSelectedCardId(relatedCard.id)}
                        className="block w-full border border-stone-200 bg-[#fcfbf7] px-4 py-3 text-left transition-colors hover:bg-[#fff7f2]"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                          <span>{relatedCard.cardType}</span>
                          <span>{relatedCard.linkType}</span>
                          <span>{formatKnowledgeStatus(relatedCard.status)}</span>
                          <span>置信度 {Math.round(relatedCard.confidenceScore * 100)}%</span>
                        </div>
                        <div className="mt-2 font-serifCn text-xl text-ink">{relatedCard.title}</div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">{relatedCard.summary || "暂无摘要"}</div>
                        {relatedCard.shared ? (
                          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                            团队共享{relatedCard.ownerUsername ? ` · ${relatedCard.ownerUsername}` : ""}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="border border-stone-300 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">来源证据</div>
                <div className="mt-3 space-y-2">
                  {detail.sourceFragments.map((fragment) => (
                    <div key={fragment.id} className="border border-stone-200 bg-[#fcfbf7] px-3 py-3 text-sm leading-7 text-stone-700">
                      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-500">Fragment #{fragment.id}</div>
                      {fragment.distilledContent}
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-stone-300 bg-white p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">修订历史</div>
                <div className="mt-3 space-y-2">
                  {detail.revisions.slice(0, 4).map((revision) => (
                    <div key={revision.id} className="border border-stone-200 px-3 py-3 text-sm leading-7 text-stone-700">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">Revision {revision.revisionNo}</div>
                      <div className="mt-2">{revision.changeSummary || "本次修订未填写摘要"}</div>
                      <div className="mt-2 text-xs text-stone-500">{new Date(revision.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
              当前档案详情暂不可用，请重新选择或稍后刷新。
            </div>
          )}
        </aside>
      </div>
      {cards.length === 0 ? <div className="border border-dashed border-stone-300 p-5 text-sm text-stone-600">还没有主题档案，先采集几条高质量碎片再编译。</div> : null}
    </section>
  );
}

export function TopicRadarStarter({
  topics,
  knowledgeMatches = {},
  canStart = true,
}: {
  topics: Array<{ id: number; title: string; sourceName: string; emotionLabels: string[]; angleOptions: string[]; judgementShift?: string | null }>;
  knowledgeMatches?: Record<number, Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number; summary?: string | null; shared?: boolean; ownerUsername?: string | null }>>;
  canStart?: boolean;
}) {
  const router = useRouter();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  async function handleStart(topicId: number, angleIndex: number, chosenAngle: string) {
    const key = `${topicId}-${angleIndex}`;
    setLoadingKey(key);
    const response = await fetch("/api/topic-radar/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, angleIndex, chosenAngle }),
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
          {!canStart ? (
            <div className="mt-4 border border-dashed border-stone-300 bg-[#faf7f0] px-4 py-4 text-sm leading-7 text-stone-600">
              当前套餐只开放热点榜单浏览。升级到 Pro 或更高套餐后，才会显示情绪切角，并可一键落笔生成大纲树。
            </div>
          ) : null}
          {knowledgeMatches[topic.id]?.length ? (
            <div className="mt-3 border border-[#eadfb9] bg-[#fdf6d7] px-3 py-3 text-sm text-stone-700">
              已命中 {knowledgeMatches[topic.id].length} 个主题档案：
              {" "}
              {knowledgeMatches[topic.id].map((item) => item.title).join(" / ")}
            </div>
          ) : null}
          {canStart ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {topic.emotionLabels.map((label) => (
                <span key={label} className="border border-cinnabar px-2 py-1 text-xs text-cinnabar">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          {canStart && topic.judgementShift ? (
            <div className="mt-4 border border-[#d9ceb3] bg-[#f7f0de] px-4 py-4 text-sm leading-7 text-stone-700">
              {topic.judgementShift}
            </div>
          ) : null}
          {canStart ? (
            <div className="mt-4 space-y-2">
              {topic.angleOptions.slice(0, 3).map((angle, index) => {
                const key = `${topic.id}-${index}`;
                return (
                  <button
                    key={angle}
                    onClick={() => handleStart(topic.id, index, angle)}
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
          ) : null}
          {canStart && knowledgeMatches[topic.id]?.length ? (
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-500">
              {knowledgeMatches[topic.id].map((item) => (
                <span key={item.id} className="border border-stone-300 px-2 py-1">
                  {item.cardType} · {Math.round(item.confidenceScore * 100)}%{item.shared ? ` · 团队共享${item.ownerUsername ? `/${item.ownerUsername}` : ""}` : ""}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
