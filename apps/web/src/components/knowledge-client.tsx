"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type GovernanceCard = {
  id: number;
  username: string | null;
  title: string;
  cardType: string;
  workspaceScope: string;
  summary: string | null;
  conflictFlags: string[];
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  sourceFragmentCount: number;
  revisionCount: number;
};

type RevisionItem = {
  id: number;
  revisionNo: number;
  changeSummary: string | null;
  createdAt: string;
};

export function KnowledgeGovernanceClient({
  cards,
}: {
  cards: GovernanceCard[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(cards[0]?.id ?? null);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setRevisions([]);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/admin/knowledge/cards/${selectedId}/revisions`)
      .then((response) => response.json())
      .then((json) => {
        if (!active) return;
        setRevisions(json.success ? json.data : []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  async function handleStatus(cardId: number, status: string) {
    await fetch(`/api/admin/knowledge/cards/${cardId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function handleRebuild(cardId: number) {
    await fetch(`/api/admin/knowledge/cards/${cardId}/rebuild`, {
      method: "POST",
    });
    router.refresh();
  }

  const conflictedCount = cards.filter((card) => card.status === "conflicted").length;
  const staleCount = cards.filter((card) => card.status === "stale").length;
  const lowConfidenceCount = cards.filter((card) => card.confidenceScore < 0.65).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["冲突档案", String(conflictedCount), "需要后台优先审查证据冲突与更新时间线。"],
          ["过期档案", String(staleCount), "优先触发 refresh 或人工复核。"],
          ["低置信度", String(lowConfidenceCount), "说明证据碎片太少或互相支撑不足。"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className="overflow-x-auto border border-stone-800 bg-[#171718]">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-stone-950 text-stone-500">
              <tr>
                {["档案", "归属用户", "状态", "置信度", "证据", "Revision", "治理动作"].map((head) => (
                  <th key={head} className="px-6 py-4 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr
                  key={card.id}
                  onClick={() => setSelectedId(card.id)}
                  className={`cursor-pointer border-t border-stone-800 ${selectedId === card.id ? "bg-stone-900/80" : ""}`}
                >
                  <td className="px-6 py-4 align-top">
                    <div className="font-serifCn text-xl text-stone-100">{card.title}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-500">{card.cardType}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-stone-500">{card.workspaceScope === "personal" ? "personal scope" : card.workspaceScope}</div>
                    <p className="mt-3 max-w-[360px] text-sm leading-7 text-stone-400">{card.summary || "暂无摘要"}</p>
                    {card.conflictFlags.length ? (
                      <div className="mt-3 flex max-w-[360px] flex-wrap gap-2">
                        {card.conflictFlags.map((flag) => (
                          <span key={`${card.id}-${flag}`} className="border border-[#744244] bg-[#2a1718] px-2 py-1 text-[11px] text-[#f0b7ba]">
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-stone-400">{card.username || `user#${card.id}`}</td>
                  <td className="px-6 py-4">
                    <select
                      value={card.status}
                      onChange={(event) => handleStatus(card.id, event.target.value)}
                      className="border border-stone-800 bg-stone-950 px-3 py-2 text-sm text-stone-100"
                    >
                      <option value="draft">draft</option>
                      <option value="active">active</option>
                      <option value="conflicted">conflicted</option>
                      <option value="stale">stale</option>
                      <option value="archived">archived</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-stone-400">{Math.round(card.confidenceScore * 100)}%</td>
                  <td className="px-6 py-4 text-stone-400">{card.sourceFragmentCount}</td>
                  <td className="px-6 py-4 text-stone-400">{card.revisionCount}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleRebuild(card.id)} className="border border-cinnabar px-3 py-2 text-xs text-cinnabar">
                      重新编译
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="border border-stone-800 bg-stone-950 p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">Revision Timeline</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">主题档案治理</h2>
          <p className="mt-4 text-sm leading-7 text-stone-400">
            这里优先处理冲突、过期和低置信度档案。每次重编译都保留 revision，确保结论可以回链。
          </p>
          <div className="mt-6 space-y-3">
            {loading ? <div className="text-sm text-stone-500">正在加载 revision...</div> : null}
            {!loading && revisions.length === 0 ? <div className="text-sm text-stone-500">当前档案还没有 revision 记录。</div> : null}
            {revisions.map((revision) => (
              <div key={revision.id} className="border border-stone-800 bg-[#151516] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-stone-100">v{revision.revisionNo}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                    {new Date(revision.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-stone-400">{revision.changeSummary || "无变更摘要"}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
