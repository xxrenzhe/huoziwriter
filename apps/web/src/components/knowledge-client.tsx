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
  trackLabel: string | null;
  hookTags: string[];
  sampleParagraph: string | null;
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
const hookTagClassName = "border border-adminLineStrong bg-adminSurface px-2 py-1 text-[11px] text-adminInkSoft";
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
const detailsPanelClassName = cn(
  surfaceCardStyles({ padding: "md" }),
  "border-adminLineStrong bg-adminSurface text-adminInk shadow-none",
);
const drawerOverlayClassName = "fixed inset-0 z-50 bg-black/55 xl:hidden";
const drawerPanelClassName = cn(
  "fixed inset-y-0 right-0 z-[60] w-full max-w-[440px] overflow-y-auto border-l border-adminLineStrong bg-adminSurface p-5 text-adminInk shadow-2xl xl:hidden",
);
const checkboxClassName = "h-4 w-4 border border-adminLineStrong bg-adminBg align-middle accent-[var(--admin-accent)]";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackFilter, setTrackFilter] = useState("all");
  const [hookTagFilter, setHookTagFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [bulkStatus, setBulkStatus] = useState<string>(STATUS_OPTIONS[1]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

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

  async function handleBulkStatusUpdate() {
    if (selectedIds.length === 0) {
      setFeedback("先至少勾选 1 张知识卡，再执行批量状态切换。");
      return;
    }
    setBulkUpdating(true);
    setFeedback(null);
    try {
      await Promise.all(
        selectedIds.map((cardId) =>
          fetch(`/api/admin/knowledge/cards/${cardId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: bulkStatus }),
          }).then(async (response) => {
            if (!response.ok) {
              throw new Error(`状态更新失败: ${cardId}`);
            }
          }),
        ),
      );
      setFeedback(`已将 ${selectedIds.length} 张知识卡批量切换为 ${bulkStatus}。`);
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "批量状态切换失败。");
    } finally {
      setBulkUpdating(false);
    }
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
  const trackOptions = Array.from(new Set(cards.map((card) => card.trackLabel).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const hookTagOptions = Array.from(new Set(cards.flatMap((card) => card.hookTags))).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filteredCards = cards.filter((card) => {
    if (trackFilter !== "all" && card.trackLabel !== trackFilter) return false;
    if (hookTagFilter !== "all" && !card.hookTags.includes(hookTagFilter)) return false;
    if (query.trim()) {
      const haystack = `${card.title} ${card.summary || ""} ${card.sampleParagraph || ""}`.toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  });
  const selectedCard = filteredCards.find((card) => card.id === selectedId) ?? filteredCards[0] ?? null;
  const selectedCount = selectedIds.length;
  const allFilteredSelected = filteredCards.length > 0 && filteredCards.every((card) => selectedIds.includes(card.id));

  useEffect(() => {
    if (!selectedCard) {
      setSelectedId(null);
      return;
    }
    if (selectedId !== selectedCard.id) {
      setSelectedId(selectedCard.id);
    }
  }, [selectedCard?.id]);

  function toggleCardSelection(cardId: number) {
    setSelectedIds((current) => (current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((current) => current.filter((id) => !filteredCards.some((card) => card.id === id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...filteredCards.map((card) => card.id)])));
  }

  function openDetails(cardId: number) {
    setSelectedId(cardId);
    setDetailDrawerOpen(true);
  }

  function renderCardDetails(card: GovernanceCard) {
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Card Details</div>
            <h2 className="mt-3 font-serifCn text-3xl text-adminInk text-balance">{card.title}</h2>
          </div>
          <Button type="button" variant="secondary" size="sm" className="xl:hidden" onClick={() => setDetailDrawerOpen(false)}>
            关闭
          </Button>
        </div>

        <p className="mt-4 text-sm leading-7 text-adminInkSoft">
          {card.summary || "当前还没有摘要，建议先重编译补齐治理上下文。"}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="border border-adminLineStrong bg-adminSurfaceAlt p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">归属用户</div>
            <div className="mt-2 text-sm text-adminInk">{card.username || `user#${card.id}`}</div>
          </div>
          <div className="border border-adminLineStrong bg-adminSurfaceAlt p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">当前状态</div>
            <div className="mt-2 text-sm text-adminInk">{card.status}</div>
          </div>
          <div className="border border-adminLineStrong bg-adminSurfaceAlt p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">最近编译</div>
            <div className="mt-2 text-sm text-adminInk">
              {card.lastCompiledAt ? new Date(card.lastCompiledAt).toLocaleString("zh-CN") : "暂无记录"}
            </div>
          </div>
          <div className="border border-adminLineStrong bg-adminSurfaceAlt p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-adminInkMuted">治理负载</div>
            <div className="mt-2 text-sm text-adminInk">
              {card.sourceFragmentCount} 条证据 · {card.revisionCount} 次 revision
            </div>
          </div>
        </div>

        <div className="mt-5 border border-adminLineStrong bg-adminSurfaceAlt p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">索引摘要</div>
          <div className="mt-3 text-sm text-adminInk">赛道：{card.trackLabel || "未归类"}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {card.hookTags.length > 0 ? card.hookTags.map((tag) => (
              <span key={`details-${card.id}-${tag}`} className={hookTagClassName}>{tag}</span>
            )) : <span className="text-xs text-adminInkMuted">当前还没有爆点标签</span>}
          </div>
          <div className="mt-4 text-xs leading-6 text-adminInkMuted">{card.sampleParagraph || "当前还没有典型段落。"}</div>
          {card.conflictFlags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {card.conflictFlags.map((flag) => (
                <span key={`details-flag-${card.id}-${flag}`} className={conflictFlagClassName}>
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Select
            aria-label={`${card.title} 详情状态`}
            value={card.status}
            onChange={(event) => handleStatus(card.id, event.target.value)}
            className={statusSelectClassName}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={`${card.id}-${status}`} value={status}>
                {status}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" className={rebuildButtonClassName} onClick={() => void handleRebuild(card.id)}>
            重新编译
          </Button>
        </div>

        <div className="mt-6">
          <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Revision Timeline</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">
            每次重编译都保留 revision，确保结论可以回链，便于排查冲突和状态变更。
          </p>
          <div className="mt-4 space-y-3">
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
        </div>
      </>
    );
  }

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

      <section className={adminPanelClassName + " p-4"}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、摘要或典型段落"
            className="min-h-10 border border-adminLineStrong bg-adminBg px-3 py-2 text-sm text-adminInk outline-none focus-visible:ring-2 focus-visible:ring-adminAccent"
          />
          <Select value={trackFilter} onChange={(event) => setTrackFilter(event.target.value)} className={statusSelectClassName}>
            <option value="all">全部赛道</option>
            {trackOptions.map((track) => (
              <option key={track} value={track}>{track}</option>
            ))}
          </Select>
          <Select value={hookTagFilter} onChange={(event) => setHookTagFilter(event.target.value)} className={statusSelectClassName}>
            <option value="all">全部爆点标签</option>
            {hookTagOptions.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </Select>
        </div>
      </section>

      <section className={adminPanelClassName + " p-4"}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminInkMuted">Bulk Governance</div>
            <div className="mt-2 text-sm leading-7 text-adminInkSoft">
              勾选多张知识卡后，可统一切换状态；重编译仍保留单卡处理，避免误伤。
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-adminInkSoft">
              <input
                type="checkbox"
                className={checkboxClassName}
                checked={allFilteredSelected}
                onChange={toggleSelectAllFiltered}
              />
              当前筛选结果全选
            </label>
            <div className="text-sm text-adminInkSoft">已选 {selectedCount} 张</div>
            <Select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className={statusSelectClassName}>
              {STATUS_OPTIONS.map((status) => (
                <option key={`bulk-${status}`} value={status}>
                  批量切到 {status}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={() => void handleBulkStatusUpdate()} disabled={bulkUpdating || selectedCount === 0}>
              {bulkUpdating ? "批量切换中…" : "批量切换状态"}
            </Button>
            {selectedCount > 0 ? (
              <Button type="button" variant="secondary" onClick={() => setSelectedIds([])}>
                清空勾选
              </Button>
            ) : null}
          </div>
        </div>
        {feedback ? <div className="mt-3 text-sm text-adminInkSoft">{feedback}</div> : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_360px]">
        <div className={tableWrapperClassName}>
          <div className={tableMobileListClassName}>
            {filteredCards.map((card) => {
              const selected = selectedCard?.id === card.id;
              const checked = selectedIds.includes(card.id);
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
                      <label className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-adminInkMuted" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className={checkboxClassName}
                          checked={checked}
                          onChange={() => toggleCardSelection(card.id)}
                        />
                        选中
                      </label>
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
                  <div className="mt-4 flex flex-wrap gap-2">
                    {card.trackLabel ? <span className={hookTagClassName}>赛道 {card.trackLabel}</span> : null}
                    {card.hookTags.map((tag) => (
                      <span key={`${card.id}-${tag}`} className={hookTagClassName}>{tag}</span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-adminInkSoft">{card.summary || "暂无摘要"}</p>
                  {card.sampleParagraph ? (
                    <p className="mt-3 text-xs leading-6 text-adminInkMuted">典型段落：{card.sampleParagraph}</p>
                  ) : null}
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
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetails(card.id);
                      }}
                    >
                      查看详情
                    </Button>
                  </div>
                </article>
              );
            })}
            {filteredCards.length === 0 ? <div className="text-sm text-adminInkMuted">当前筛选条件下没有命中的背景卡。</div> : null}
          </div>
          <div className={tableDesktopShellClassName}>
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-adminBg text-adminInkMuted">
                <tr>
                  {["选择", "档案", "索引", "归属用户", "状态", "置信度", "证据", "Revision", "治理动作"].map((head) => (
                    <th key={head} className={tableHeadCellClassName}>{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => (
                  <tr
                    key={card.id}
                    onClick={() => setSelectedId(card.id)}
                    className={getCardRowClassName(selectedCard?.id === card.id)}
                  >
                    <td className={cn(tableBodyCellClassName, "align-top")}>
                      <input
                        aria-label={`选中 ${card.title}`}
                        type="checkbox"
                        className={checkboxClassName}
                        checked={selectedIds.includes(card.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleCardSelection(card.id)}
                      />
                    </td>
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
                    <td className={cn(tableBodyCellClassName, "align-top text-adminInkSoft")}>
                      <div>{card.trackLabel || "未归类"}</div>
                      <div className="mt-2 flex max-w-[220px] flex-wrap gap-2">
                        {card.hookTags.length > 0 ? card.hookTags.map((tag) => (
                          <span key={`${card.id}-desktop-${tag}`} className={hookTagClassName}>{tag}</span>
                        )) : <span className="text-xs text-adminInkMuted">无爆点标签</span>}
                      </div>
                      {card.sampleParagraph ? (
                        <p className="mt-3 max-w-[220px] text-xs leading-6 text-adminInkMuted">{card.sampleParagraph}</p>
                      ) : null}
                    </td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.username || `user#${card.id}`}</td>
                    <td className={tableBodyCellClassName}>
                      <Select
                        aria-label="select control"
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
                    </td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{Math.round(card.confidenceScore * 100)}%</td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.sourceFragmentCount}</td>
                    <td className={cn(tableBodyCellClassName, "text-adminInkSoft")}>{card.revisionCount}</td>
                    <td className={tableBodyCellClassName}>
                      <div className="flex gap-2">
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
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetails(card.id);
                          }}
                        >
                          详情
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCards.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={tableBodyCellClassName + " text-adminInkMuted"}>
                      当前筛选条件下没有命中的背景卡。
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <aside className={cn(detailsPanelClassName, "hidden xl:block")}>
          {selectedCard ? renderCardDetails(selectedCard) : <div className="text-sm text-adminInkMuted">当前没有可展示的知识卡详情。</div>}
        </aside>
      </section>

      {detailDrawerOpen && selectedCard ? (
        <>
          <button type="button" aria-label="关闭知识卡详情" className={drawerOverlayClassName} onClick={() => setDetailDrawerOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="知识卡详情" className={drawerPanelClassName}>
            {renderCardDetails(selectedCard)}
          </aside>
        </>
      ) : null}
    </div>
  );
}
