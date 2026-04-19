"use client";

import { Button, Select, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useState } from "react";

type GovernanceCard = {
  id: number;
  username: string | null;
  title: string;
  cardType: string;
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

const GOVERNANCE_METRICS = [
  { label: "冲突档案", note: "需要后台优先审查证据冲突与更新时间线。" },
  { label: "过期档案", note: "优先触发 refresh 或人工复核。" },
  { label: "低置信度", note: "说明证据素材太少或互相支撑不足。" },
] as const;

const STATUS_OPTIONS = ["draft", "active", "conflicted", "stale", "archived"] as const;

const adminPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface text-adminInk shadow-none");
const statsCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-adminLineStrong bg-adminSurfaceAlt text-adminInk shadow-none");
const tableWrapperClassName = cn(adminPanelClassName, "overflow-hidden");
const tableDesktopShellClassName = "hidden overflow-x-auto md:block";
const tableMobileListClassName = "grid gap-3 p-4 md:hidden";
const timelinePanelClassName = cn(surfaceCardStyles({ padding: "md" }), "border-adminLineStrong bg-adminBg text-adminInk shadow-none");
const revisionCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-adminLineStrong bg-adminSurfaceAlt text-adminInk shadow-none");
const mobileCardClassName = cn(
  surfaceCardStyles({ padding: "md" }),
  "border-adminLineStrong bg-adminBg text-adminInk shadow-none transition-colors",
);
const tableHeadCellClassName = "px-6 py-4 font-medium";
const tableBodyCellClassName = "px-6 py-4";
const conflictFlagClassName = "border border-danger/30 bg-surface px-2 py-1 text-[11px] text-danger";
const statusSelectClassName = cn(
  "min-h-10 w-full min-w-[132px] px-3 py-2",
  "border-adminLineStrong bg-adminBg text-adminInk",
  "focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);
const rebuildButtonClassName = cn(
  "min-h-10 px-3 py-2 text-xs font-normal",
  "border-cinnabar bg-transparent text-cinnabar",
  "hover:border-adminAccent hover:bg-adminSurfaceAlt hover:text-adminAccent",
  "focus-visible:ring-adminAccent focus-visible:ring-offset-adminBg",
);

function getCardRowClassName(selected: boolean) {
  return cn(
    "cursor-pointer border-t border-adminLineStrong transition-colors",
    selected && "bg-adminSurfaceAlt",
  );
}

function getMobileCardClassName(selected: boolean) {
  return cn(
    mobileCardClassName,
    selected ? "border-adminAccent bg-adminSurfaceAlt" : "hover:border-adminLineStrong hover:bg-adminSurfaceAlt",
  );
}

function handleSelectableCardKeyDown(event: KeyboardEvent<HTMLElement>, onSelect: () => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onSelect();
}

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
          { ...GOVERNANCE_METRICS[0], value: String(conflictedCount) },
          { ...GOVERNANCE_METRICS[1], value: String(staleCount) },
          { ...GOVERNANCE_METRICS[2], value: String(lowConfidenceCount) },
        ].map(({ label, value, note }) => (
          <article key={label} className={statsCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-adminInk text-balance">{value}</div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className={tableWrapperClassName}>
          <div className={tableMobileListClassName}>
            {cards.map((card) => {
              const selected = selectedId === card.id;
              return (
                <article
                  key={card.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(card.id)}
                  onKeyDown={(event) => handleSelectableCardKeyDown(event, () => setSelectedId(card.id))}
                  className={getMobileCardClassName(selected)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-serifCn text-2xl text-adminInk text-balance">{card.title}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-adminInkMuted">{card.cardType}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">置信度</div>
                      <div className="mt-2 text-sm text-adminInkSoft">{Math.round(card.confidenceScore * 100)}%</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-adminInkSoft sm:grid-cols-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">归属用户</div>
                      <div className="mt-1">{card.username || `user#${card.id}`}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">证据</div>
                      <div className="mt-1">{card.sourceFragmentCount} 条</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">Revision</div>
                      <div className="mt-1">{card.revisionCount}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-adminInkSoft">{card.summary || "暂无摘要"}</p>
                  {card.conflictFlags.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {card.conflictFlags.map((flag) => (
                        <span key={`${card.id}-${flag}`} className={conflictFlagClassName}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3">
                    <Select
                      aria-label={`${card.title} 状态`}
                      value={card.status}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => handleStatus(card.id, event.target.value)}
                      className={statusSelectClassName}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={rebuildButtonClassName}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRebuild(card.id);
                      }}
                    >
                      重新编译
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={tableDesktopShellClassName}>
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-adminBg text-adminInkMuted">
                <tr>
                  {["档案", "归属用户", "状态", "置信度", "证据", "Revision", "治理动作"].map((head) => (
                    <th key={head} className={tableHeadCellClassName}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => (
                  <tr
                    key={card.id}
                    onClick={() => setSelectedId(card.id)}
                    className={getCardRowClassName(selectedId === card.id)}
                  >
                    <td className={cn(tableBodyCellClassName, "align-top")}>
                      <div className="font-serifCn text-xl text-adminInk">{card.title}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.2em] text-adminInkMuted">{card.cardType}</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">置信度 {Math.round(card.confidenceScore * 100)}%</div>
                      <p className="mt-3 max-w-[360px] text-sm leading-7 text-adminInkSoft">{card.summary || "暂无摘要"}</p>
                      {card.conflictFlags.length ? (
                        <div className="mt-3 flex max-w-[360px] flex-wrap gap-2">
                          {card.conflictFlags.map((flag) => (
                            <span key={`${card.id}-${flag}`} className={conflictFlagClassName}>
                              {flag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.username || `user#${card.id}`}</td>
                    <td className={tableBodyCellClassName}>
                      <Select
                        aria-label="select control"
                        value={card.status}
                        onChange={(event) => handleStatus(card.id, event.target.value)}
                        className={statusSelectClassName}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{Math.round(card.confidenceScore * 100)}%</td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.sourceFragmentCount}</td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.revisionCount}</td>
                    <td className={tableBodyCellClassName}>
                      <Button type="button" variant="secondary" size="sm" className={rebuildButtonClassName} onClick={() => handleRebuild(card.id)}>
                        重新编译
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className={timelinePanelClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Revision Timeline</div>
          <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">背景卡治理</h2>
          <p className="mt-4 text-sm leading-7 text-adminInkSoft">
            这里优先处理冲突、过期和低置信度档案。每次重编译都保留 revision，确保结论可以回链。
          </p>
          <div className="mt-6 space-y-3">
            {loading ? <div className="text-sm text-adminInkMuted">正在加载 revision…</div> : null}
            {!loading && revisions.length === 0 ? <div className="text-sm text-adminInkMuted">当前档案还没有 revision 记录。</div> : null}
            {revisions.map((revision) => (
              <div key={revision.id} className={revisionCardClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-adminInk">v{revision.revisionNo}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-adminInkMuted">
                    {new Date(revision.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-adminInkSoft">{revision.changeSummary || "无变更摘要"}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
