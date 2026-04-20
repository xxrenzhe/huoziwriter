"use client";

import { Button, Input, Select, Textarea, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, startTransition, useMemo, useState } from "react";

type SeriesOption = {
  id: number;
  name: string;
  personaName: string;
  activeStatus: string;
};

type BacklogItem = {
  id: number;
  theme: string;
  archetype: string | null;
  targetAudience: string | null;
  readerSnapshotHint: string | null;
  strategyDraft: Record<string, unknown> | null;
  status: "draft" | "ready" | "queued" | "generated" | "discarded";
  generatedArticleId: number | null;
  generatedBatchId: string | null;
  generatedAt: string | null;
};

type Backlog = {
  id: number;
  seriesId: number | null;
  seriesName: string | null;
  name: string;
  description: string | null;
  itemCount: number;
  lastGeneratedAt: string | null;
  items: BacklogItem[];
};

type BacklogDraft = {
  name: string;
  description: string;
  seriesId: string;
};

type BulkImportDraft = {
  text: string;
  defaultStatus: string;
};

type SeedGenerateDraft = {
  seedTheme: string;
  targetAudience: string;
  seedContext: string;
  count: string;
  defaultStatus: string;
};

type BacklogItemDraft = {
  theme: string;
  archetype: string;
  targetAudience: string;
  readerSnapshotHint: string;
  coreAssertion: string;
  whyNow: string;
  status: string;
};

const statsCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surfaceWarm");
const createFormClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "grid gap-3");
const backlogCardClassName = cn(surfaceCardStyles({ padding: "md" }), "space-y-4");
const itemCardClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "border-lineStrong shadow-none");
const messageCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surfaceWarm text-sm text-inkSoft");

function buildBacklogDraft(backlog: Backlog): BacklogDraft {
  return {
    name: backlog.name,
    description: backlog.description || "",
    seriesId: backlog.seriesId ? String(backlog.seriesId) : "",
  };
}

function buildEmptyBulkImportDraft(): BulkImportDraft {
  return {
    text: "",
    defaultStatus: "draft",
  };
}

function buildEmptySeedGenerateDraft(): SeedGenerateDraft {
  return {
    seedTheme: "",
    targetAudience: "",
    seedContext: "",
    count: "5",
    defaultStatus: "draft",
  };
}

function getStrategyString(item: BacklogItem, key: string) {
  return String(item.strategyDraft?.[key] || "").trim();
}

function buildItemDraft(item: BacklogItem): BacklogItemDraft {
  return {
    theme: item.theme,
    archetype: item.archetype || "",
    targetAudience: item.targetAudience || "",
    readerSnapshotHint: item.readerSnapshotHint || "",
    coreAssertion: getStrategyString(item, "coreAssertion"),
    whyNow: getStrategyString(item, "whyNow"),
    status: item.status,
  };
}

function buildEmptyItemDraft(): BacklogItemDraft {
  return {
    theme: "",
    archetype: "",
    targetAudience: "",
    readerSnapshotHint: "",
    coreAssertion: "",
    whyNow: "",
    status: "draft",
  };
}

function formatStatusLabel(value: string) {
  if (value === "ready") return "就绪";
  if (value === "queued") return "排队中";
  if (value === "generated") return "已生成";
  if (value === "discarded") return "已丢弃";
  return "草稿";
}

export function TopicBacklogManager({
  initialBacklogs,
  seriesOptions,
}: {
  initialBacklogs: Backlog[];
  seriesOptions: SeriesOption[];
}) {
  const router = useRouter();
  const [backlogs, setBacklogs] = useState(initialBacklogs);
  const [backlogDrafts, setBacklogDrafts] = useState<Record<number, BacklogDraft>>(
    Object.fromEntries(initialBacklogs.map((item) => [item.id, buildBacklogDraft(item)])),
  );
  const [itemDrafts, setItemDrafts] = useState<Record<number, BacklogItemDraft>>(
    Object.fromEntries(initialBacklogs.flatMap((backlog) => backlog.items.map((item) => [item.id, buildItemDraft(item)]))),
  );
  const [newItemDrafts, setNewItemDrafts] = useState<Record<number, BacklogItemDraft>>(
    Object.fromEntries(initialBacklogs.map((item) => [item.id, buildEmptyItemDraft()])),
  );
  const [bulkImportDrafts, setBulkImportDrafts] = useState<Record<number, BulkImportDraft>>(
    Object.fromEntries(initialBacklogs.map((item) => [item.id, buildEmptyBulkImportDraft()])),
  );
  const [seedGenerateDrafts, setSeedGenerateDrafts] = useState<Record<number, SeedGenerateDraft>>(
    Object.fromEntries(initialBacklogs.map((item) => [item.id, buildEmptySeedGenerateDraft()])),
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Record<number, number[]>>({});
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [message, setMessage] = useState("");
  const [messageAction, setMessageAction] = useState<{ href: string; label: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingBacklogId, setSavingBacklogId] = useState<number | null>(null);
  const [deletingBacklogId, setDeletingBacklogId] = useState<number | null>(null);
  const [savingItemId, setSavingItemId] = useState<number | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [creatingItemBacklogId, setCreatingItemBacklogId] = useState<number | null>(null);
  const [bulkImportingBacklogId, setBulkImportingBacklogId] = useState<number | null>(null);
  const [readingImportFileBacklogId, setReadingImportFileBacklogId] = useState<number | null>(null);
  const [seedGeneratingBacklogId, setSeedGeneratingBacklogId] = useState<number | null>(null);
  const [generatingBacklogId, setGeneratingBacklogId] = useState<number | null>(null);

  const readyItemCount = useMemo(
    () => backlogs.reduce((sum, backlog) => sum + backlog.items.filter((item) => item.status === "ready").length, 0),
    [backlogs],
  );
  const generatedItemCount = useMemo(
    () => backlogs.reduce((sum, backlog) => sum + backlog.items.filter((item) => item.status === "generated").length, 0),
    [backlogs],
  );

  function clearMessageFeedback() {
    setMessage("");
    setMessageAction(null);
  }

  function showMessageFeedback(text: string, action?: { href: string; label: string } | null) {
    setMessage(text);
    setMessageAction(action ?? null);
  }

  function syncBacklog(backlog: Backlog) {
    setBacklogDrafts((prev) => ({ ...prev, [backlog.id]: buildBacklogDraft(backlog) }));
    setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: prev[backlog.id] ?? buildEmptyItemDraft() }));
    setBulkImportDrafts((prev) => ({ ...prev, [backlog.id]: prev[backlog.id] ?? buildEmptyBulkImportDraft() }));
    setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: prev[backlog.id] ?? buildEmptySeedGenerateDraft() }));
    setItemDrafts((prev) => ({
      ...prev,
      ...Object.fromEntries(backlog.items.map((item) => [item.id, buildItemDraft(item)])),
    }));
  }

  function updateBacklog(backlog: Backlog) {
    setBacklogs((prev) => prev.map((item) => (item.id === backlog.id ? backlog : item)));
    syncBacklog(backlog);
  }

  async function handleCreateBacklog(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    clearMessageFeedback();
    const response = await fetch("/api/topic-backlogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, seriesId: seriesId ? Number(seriesId) : null }),
    });
    const json = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题库创建失败");
      return;
    }
    const created = json.data as Backlog;
    setBacklogs((prev) => [created, ...prev]);
    syncBacklog(created);
    setName("");
    setDescription("");
    setSeriesId("");
    showMessageFeedback("选题库已创建。现在可以继续往里加选题条目。");
    startTransition(() => router.refresh());
  }

  async function handleSaveBacklog(backlogId: number) {
    const draft = backlogDrafts[backlogId];
    if (!draft) return;
    setSavingBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        seriesId: draft.seriesId ? Number(draft.seriesId) : null,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSavingBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题库更新失败");
      return;
    }
    updateBacklog(json.data as Backlog);
    showMessageFeedback(`选题库「${json.data.name}」已更新。`);
    startTransition(() => router.refresh());
  }

  async function handleDeleteBacklog(backlogId: number) {
    if (!window.confirm("确定要删除这个选题库吗？")) return;
    setDeletingBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}`, { method: "DELETE" });
    const json = await response.json().catch(() => ({}));
    setDeletingBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题库删除失败");
      return;
    }
    setBacklogs((prev) => prev.filter((item) => item.id !== backlogId));
    setSelectedItemIds((prev) => {
      const next = { ...prev };
      delete next[backlogId];
      return next;
    });
    showMessageFeedback("选题库已删除。");
    startTransition(() => router.refresh());
  }

  async function handleCreateItem(backlogId: number) {
    const draft = newItemDrafts[backlogId];
    if (!draft) return;
    setCreatingItemBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: draft.theme,
        archetype: draft.archetype || null,
        targetAudience: draft.targetAudience,
        readerSnapshotHint: draft.readerSnapshotHint,
        coreAssertion: draft.coreAssertion,
        whyNow: draft.whyNow,
        status: draft.status,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setCreatingItemBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题条目创建失败");
      return;
    }
    const created = json.data as BacklogItem;
    setBacklogs((prev) =>
      prev.map((item) => item.id === backlogId ? { ...item, itemCount: item.itemCount + 1, items: [created, ...item.items] } : item),
    );
    setItemDrafts((prev) => ({ ...prev, [created.id]: buildItemDraft(created) }));
    setNewItemDrafts((prev) => ({ ...prev, [backlogId]: buildEmptyItemDraft() }));
    showMessageFeedback("选题条目已加入选题库。");
    startTransition(() => router.refresh());
  }

  async function handleSaveItem(backlogId: number, itemId: number) {
    const draft = itemDrafts[itemId];
    if (!draft) return;
    setSavingItemId(itemId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theme: draft.theme,
        archetype: draft.archetype || null,
        targetAudience: draft.targetAudience,
        readerSnapshotHint: draft.readerSnapshotHint,
        coreAssertion: draft.coreAssertion,
        whyNow: draft.whyNow,
        status: draft.status,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSavingItemId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题条目更新失败");
      return;
    }
    const updated = json.data as BacklogItem;
    setBacklogs((prev) =>
      prev.map((backlog) =>
        backlog.id === backlogId
          ? { ...backlog, items: backlog.items.map((item) => (item.id === updated.id ? updated : item)) }
          : backlog,
      ),
    );
    setItemDrafts((prev) => ({ ...prev, [updated.id]: buildItemDraft(updated) }));
    showMessageFeedback(`选题《${updated.theme}》已更新。`);
    startTransition(() => router.refresh());
  }

  async function handleDeleteItem(backlogId: number, itemId: number) {
    if (!window.confirm("确定要删除这个选题条目吗？")) return;
    setDeletingItemId(itemId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/items/${itemId}`, {
      method: "DELETE",
    });
    const json = await response.json().catch(() => ({}));
    setDeletingItemId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "选题条目删除失败");
      return;
    }
    setBacklogs((prev) =>
      prev.map((backlog) =>
        backlog.id === backlogId
          ? { ...backlog, itemCount: Math.max(0, backlog.itemCount - 1), items: backlog.items.filter((item) => item.id !== itemId) }
          : backlog,
      ),
    );
    setSelectedItemIds((prev) => ({
      ...prev,
      [backlogId]: (prev[backlogId] || []).filter((id) => id !== itemId),
    }));
    showMessageFeedback("选题条目已删除。");
    startTransition(() => router.refresh());
  }

  async function handleGenerate(backlogId: number) {
    const selected = selectedItemIds[backlogId] || [];
    const draft = backlogDrafts[backlogId];
    if (selected.length === 0) {
      showMessageFeedback("先至少勾选 1 条选题，再执行批量生成。");
      return;
    }
    setGeneratingBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemIds: selected,
        seriesId: draft?.seriesId ? Number(draft.seriesId) : null,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setGeneratingBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "批量生成失败");
      return;
    }
    const nextBacklog = json.data.backlog as Backlog | null;
    const jobs = Array.isArray(json.data.jobs) ? json.data.jobs as Array<{ jobId: number }> : [];
    const batchId = String(json.data.batchId || "").trim();
    if (nextBacklog) {
      updateBacklog(nextBacklog);
    }
    setSelectedItemIds((prev) => ({ ...prev, [backlogId]: [] }));
    showMessageFeedback(
      `已将 ${jobs.length} 条选题加入生成队列${batchId ? `，批次 ${batchId}` : ""}。`,
      {
        href: `/articles?backlog=${backlogId}${batchId ? `&batch=${encodeURIComponent(batchId)}` : ""}`,
        label: batchId ? "查看这批稿件" : "查看选题库稿件",
      },
    );
    startTransition(() => router.refresh());
  }

  async function handleBulkImport(backlogId: number) {
    const draft = bulkImportDrafts[backlogId];
    if (!draft || !draft.text.trim()) {
      showMessageFeedback("先粘贴 Excel/CSV 行，或直接贴 AI 生成的选题列表。");
      return;
    }
    setBulkImportingBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/items/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: draft.text,
        defaultSourceType: "excel",
        defaultStatus: draft.defaultStatus,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBulkImportingBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "批量导入失败");
      return;
    }
    const createdItems = Array.isArray(json.data.createdItems) ? json.data.createdItems as BacklogItem[] : [];
    const nextBacklog = json.data.backlog as Backlog | null;
    if (nextBacklog) {
      updateBacklog(nextBacklog);
    } else if (createdItems.length > 0) {
      setBacklogs((prev) =>
        prev.map((backlog) =>
          backlog.id === backlogId
            ? { ...backlog, itemCount: backlog.itemCount + createdItems.length, items: [...createdItems, ...backlog.items] }
            : backlog,
        ),
      );
    }
    setBulkImportDrafts((prev) => ({ ...prev, [backlogId]: buildEmptyBulkImportDraft() }));
    showMessageFeedback(`已导入 ${createdItems.length} 条选题。`);
    startTransition(() => router.refresh());
  }

  async function handleGenerateFromSeed(backlogId: number) {
    const draft = seedGenerateDrafts[backlogId];
    if (!draft || !draft.seedTheme.trim()) {
      showMessageFeedback("先输入一个种子主题，再批量生题。");
      return;
    }
    setSeedGeneratingBacklogId(backlogId);
    clearMessageFeedback();
    const response = await fetch(`/api/topic-backlogs/${backlogId}/items/seed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seedTheme: draft.seedTheme,
        targetAudience: draft.targetAudience,
        seedContext: draft.seedContext,
        count: Number(draft.count || 5),
        defaultStatus: draft.defaultStatus,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSeedGeneratingBacklogId(null);
    if (!response.ok || !json.success) {
      showMessageFeedback(json.error || "AI 批量生题失败");
      return;
    }
    const createdItems = Array.isArray(json.data.createdItems) ? json.data.createdItems as BacklogItem[] : [];
    const nextBacklog = json.data.backlog as Backlog | null;
    if (nextBacklog) {
      updateBacklog(nextBacklog);
    } else if (createdItems.length > 0) {
      setBacklogs((prev) =>
        prev.map((backlog) =>
          backlog.id === backlogId
            ? { ...backlog, itemCount: backlog.itemCount + createdItems.length, items: [...createdItems, ...backlog.items] }
            : backlog,
        ),
      );
    }
    setSeedGenerateDrafts((prev) => ({
      ...prev,
      [backlogId]: { ...buildEmptySeedGenerateDraft(), targetAudience: draft.targetAudience },
    }));
    const degradedReason = String(json.data.degradedReason || "").trim();
    showMessageFeedback(
      degradedReason
        ? `已基于《${draft.seedTheme}》生成 ${createdItems.length} 条选题。${degradedReason}`
        : `已基于《${draft.seedTheme}》生成 ${createdItems.length} 条选题。`,
    );
    startTransition(() => router.refresh());
  }

  async function handleImportFile(backlogId: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    setReadingImportFileBacklogId(backlogId);
    clearMessageFeedback();
    try {
      const text = await file.text();
      if (!text.trim()) {
        showMessageFeedback("导入文件是空的，请换一个 CSV / TSV 文件。");
        return;
      }
      setBulkImportDrafts((prev) => ({
        ...prev,
        [backlogId]: {
          ...(prev[backlogId] ?? buildEmptyBulkImportDraft()),
          text,
        },
      }));
      showMessageFeedback(`已载入文件《${file.name}》，确认内容后可直接批量导入。`);
    } catch {
      showMessageFeedback("读取导入文件失败，请改用 CSV / TSV 或直接粘贴文本。");
    } finally {
      setReadingImportFileBacklogId(null);
    }
  }

  function toggleItem(backlogId: number, itemId: number, checked: boolean) {
    setSelectedItemIds((prev) => {
      const current = prev[backlogId] || [];
      return {
        ...prev,
        [backlogId]: checked ? Array.from(new Set([...current, itemId])) : current.filter((id) => id !== itemId),
      };
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["选题库", String(backlogs.length), "把周末准备好的题沉淀成稳定库存，而不是每天临时找灵感。"] as const,
          ["就绪条目", String(readyItemCount), "先把 ready 条目挑出来，再成批转成稿件。"] as const,
          ["已生成", String(generatedItemCount), "生成后的条目会回填到稿件区，方便继续补策略和证据。"] as const,
        ].map(([label, value, note]) => (
          <article key={label} className={statsCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{label}</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{value}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">{note}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleCreateBacklog} className={createFormClassName}>
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">新建选题库</div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
          <Input
            aria-label="选题库名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="选题库名称，例如：五月 AI 评论储备"
            className="bg-surface"
          />
          <Select
            aria-label="绑定系列"
            value={seriesId}
            onChange={(event) => setSeriesId(event.target.value)}
            className="bg-surface"
          >
            <option value="">不绑定系列（生成时再选）</option>
            {seriesOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="这个选题库存哪类题、准备给谁用、适合什么节奏。"
          className="min-h-[88px] bg-surface"
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={submitting} variant="primary">
            {submitting ? "创建中…" : "新建选题库"}
          </Button>
        </div>
      </form>

      {backlogs.length === 0 ? (
        <div className={messageCardClassName}>
          还没有选题库。先建一个库存，把平时想到但来不及写的题先沉淀下来，再用批量生成把它们转成稿件。
        </div>
      ) : null}

      <div className="space-y-4">
        {backlogs.map((backlog) => {
          const draft = backlogDrafts[backlog.id] ?? buildBacklogDraft(backlog);
          const selected = selectedItemIds[backlog.id] || [];
          const newDraft = newItemDrafts[backlog.id] ?? buildEmptyItemDraft();
          const bulkDraft = bulkImportDrafts[backlog.id] ?? buildEmptyBulkImportDraft();
          const seedDraft = seedGenerateDrafts[backlog.id] ?? buildEmptySeedGenerateDraft();
          return (
            <section key={backlog.id} className={backlogCardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">选题库 #{backlog.id}</div>
                  <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{backlog.name}</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    {backlog.description || "这个库还没写用途说明。"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkMuted">
                    <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">条目 {backlog.itemCount}</span>
                    <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">
                      系列 {backlog.seriesName || "生成时再选"}
                    </span>
                    {backlog.lastGeneratedAt ? (
                      <span className="border border-lineStrong bg-surfaceWarm px-2 py-1">
                        最近生成 {new Date(backlog.lastGeneratedAt).toLocaleString("zh-CN")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handleSaveBacklog(backlog.id)} disabled={savingBacklogId === backlog.id} variant="secondary">
                    {savingBacklogId === backlog.id ? "保存中…" : "保存选题库"}
                  </Button>
                  <Button onClick={() => handleDeleteBacklog(backlog.id)} disabled={deletingBacklogId === backlog.id} variant="secondary">
                    {deletingBacklogId === backlog.id ? "删除中…" : "删除选题库"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <Input
                  aria-label="选题库名称"
                  value={draft.name}
                  onChange={(event) => setBacklogDrafts((prev) => ({ ...prev, [backlog.id]: { ...draft, name: event.target.value } }))}
                  placeholder="选题库名称"
                  className="bg-surface"
                />
                <Select
                  aria-label="绑定系列"
                  value={draft.seriesId}
                  onChange={(event) => setBacklogDrafts((prev) => ({ ...prev, [backlog.id]: { ...draft, seriesId: event.target.value } }))}
                  className="bg-surface"
                >
                  <option value="">不绑定系列（生成时再选）</option>
                  {seriesOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <Textarea
                value={draft.description}
                onChange={(event) => setBacklogDrafts((prev) => ({ ...prev, [backlog.id]: { ...draft, description: event.target.value } }))}
                placeholder="说明这个选题库存什么、适合谁、什么时候批量转稿。"
                className="min-h-[88px] bg-surface"
              />

              <div className={itemCardClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">新增条目</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    aria-label="选题主题"
                    value={newDraft.theme}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, theme: event.target.value } }))}
                    placeholder="选题主题"
                    className="bg-surface"
                  />
                  <Select
                    aria-label="主题原型"
                    value={newDraft.archetype}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, archetype: event.target.value } }))}
                    className="bg-surface"
                  >
                    <option value="">暂不指定原型</option>
                    <option value="opinion">观点评论</option>
                    <option value="case">案例故事</option>
                    <option value="howto">教程指南</option>
                    <option value="hotTake">热点评论</option>
                    <option value="phenomenon">现象解读</option>
                  </Select>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    aria-label="目标读者"
                    value={newDraft.targetAudience}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, targetAudience: event.target.value } }))}
                    placeholder="目标读者"
                    className="bg-surface"
                  />
                  <Select
                    aria-label="条目状态"
                    value={newDraft.status}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, status: event.target.value } }))}
                    className="bg-surface"
                  >
                    <option value="draft">草稿</option>
                    <option value="ready">就绪</option>
                    <option value="discarded">丢弃</option>
                  </Select>
                </div>
                <Textarea
                  value={newDraft.coreAssertion}
                  onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, coreAssertion: event.target.value } }))}
                  placeholder="核心判断：这条题目真正想打透什么判断？"
                  className="min-h-[82px] bg-surface"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Textarea
                    value={newDraft.readerSnapshotHint}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, readerSnapshotHint: event.target.value } }))}
                    placeholder="读者快照：谁会在哪个场景下被这条题打中？"
                    className="min-h-[82px] bg-surface"
                  />
                  <Textarea
                    value={newDraft.whyNow}
                    onChange={(event) => setNewItemDrafts((prev) => ({ ...prev, [backlog.id]: { ...newDraft, whyNow: event.target.value } }))}
                    placeholder="为何现在值得写"
                    className="min-h-[82px] bg-surface"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button onClick={() => handleCreateItem(backlog.id)} disabled={creatingItemBacklogId === backlog.id} variant="primary">
                    {creatingItemBacklogId === backlog.id ? "加入中…" : "加入选题库"}
                  </Button>
                </div>
              </div>

              <div className={itemCardClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">AI 批量生题</div>
                <div className="mt-3 text-sm leading-6 text-inkSoft">
                  围绕一个种子主题，直接生成一批可入库的备选条目。适合先把赛道、判断线或一个正在发酵的变化收成库存。
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Input
                    aria-label="种子主题"
                    value={seedDraft.seedTheme}
                    onChange={(event) => setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: { ...seedDraft, seedTheme: event.target.value } }))}
                    placeholder="种子主题，例如：AI 产品团队从提效转向盈利"
                    className="bg-surface"
                  />
                  <Input
                    aria-label="优先目标读者"
                    value={seedDraft.targetAudience}
                    onChange={(event) => setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: { ...seedDraft, targetAudience: event.target.value } }))}
                    placeholder="优先目标读者，例如：第一次带团队的 AI 产品负责人"
                    className="bg-surface"
                  />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_180px]">
                  <Textarea
                    value={seedDraft.seedContext}
                    onChange={(event) => setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: { ...seedDraft, seedContext: event.target.value } }))}
                    placeholder="补充背景：这批题想偏观点、案例还是方法？有什么边界、不要写什么？"
                    className="min-h-[88px] bg-surface"
                  />
                  <Select
                    aria-label="生成条数"
                    value={seedDraft.count}
                    onChange={(event) => setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: { ...seedDraft, count: event.target.value } }))}
                    className="bg-surface"
                  >
                    <option value="3">生成 3 条</option>
                    <option value="5">生成 5 条</option>
                    <option value="8">生成 8 条</option>
                    <option value="10">生成 10 条</option>
                  </Select>
                  <div className="space-y-3">
                    <Select
                      aria-label="生成后默认状态"
                      value={seedDraft.defaultStatus}
                      onChange={(event) => setSeedGenerateDrafts((prev) => ({ ...prev, [backlog.id]: { ...seedDraft, defaultStatus: event.target.value } }))}
                      className="bg-surface"
                    >
                      <option value="draft">生成后为草稿</option>
                      <option value="ready">生成后为就绪</option>
                    </Select>
                    <Button onClick={() => handleGenerateFromSeed(backlog.id)} disabled={seedGeneratingBacklogId === backlog.id} variant="secondary">
                      {seedGeneratingBacklogId === backlog.id ? "生成中…" : "AI 生成条目"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className={itemCardClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">批量导入</div>
                <div className="mt-3 text-sm leading-6 text-inkSoft">
                  支持直接粘贴 Excel/CSV 行，也支持上传 Excel 导出的 CSV / TSV 文件。首行可用「主题 / 目标读者 / 选题描述 / 核心判断 / 为何现在值得写」这些列名。
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 border border-lineStrong bg-surface px-3 py-2 text-sm text-inkSoft hover:border-cinnabar/40">
                    <span>{readingImportFileBacklogId === backlog.id ? "读取文件…" : "载入 CSV / TSV 文件"}</span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                      onChange={(event) => void handleImportFile(backlog.id, event)}
                      disabled={readingImportFileBacklogId === backlog.id}
                      className="sr-only"
                    />
                  </label>
                  <div className="text-xs leading-6 text-inkMuted">
                    推荐先从 Excel 导出为 CSV / TSV；如果只有少量条目，直接粘贴也可以。
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                  <Textarea
                    value={bulkDraft.text}
                    onChange={(event) => setBulkImportDrafts((prev) => ({ ...prev, [backlog.id]: { ...bulkDraft, text: event.target.value } }))}
                    placeholder={"主题\t目标读者\t选题描述\nAI 产品经理转管理后最容易踩的坑\t第一次带 5 人团队的产品经理\t最容易忽略的是判断口径切换"}
                    className="min-h-[132px] bg-surface"
                  />
                  <div className="space-y-3">
                    <Select
                      aria-label="导入后默认状态"
                      value={bulkDraft.defaultStatus}
                      onChange={(event) => setBulkImportDrafts((prev) => ({ ...prev, [backlog.id]: { ...bulkDraft, defaultStatus: event.target.value } }))}
                      className="bg-surface"
                    >
                      <option value="draft">导入为草稿</option>
                      <option value="ready">导入为就绪</option>
                    </Select>
                    <Button onClick={() => handleBulkImport(backlog.id)} disabled={bulkImportingBacklogId === backlog.id} variant="secondary">
                      {bulkImportingBacklogId === backlog.id ? "导入中…" : "批量导入条目"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-inkSoft">已选 {selected.length} 条，可直接批量转成稿件。</div>
                <Button onClick={() => handleGenerate(backlog.id)} disabled={generatingBacklogId === backlog.id || selected.length === 0} variant="primary">
                  {generatingBacklogId === backlog.id ? "生成中…" : "批量生成稿件"}
                </Button>
              </div>

              <div className="space-y-3">
                {backlog.items.map((item) => {
                  const itemDraft = itemDrafts[item.id] ?? buildItemDraft(item);
                  const checked = selected.includes(item.id);
                  const selectable = item.status !== "generated" && item.status !== "discarded" && item.status !== "queued";
                  return (
                    <article key={item.id} className={itemCardClassName}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => toggleItem(backlog.id, item.id, event.target.checked)}
                            disabled={!selectable}
                            className="mt-1 h-4 w-4"
                          />
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                              条目 #{item.id} · {formatStatusLabel(item.status)}
                            </div>
                            {item.generatedArticleId ? (
                              <div className="mt-2 text-sm text-inkSoft">
                                已生成稿件：
                                <Link href={`/articles/${item.generatedArticleId}`} className="ml-1 text-cinnabar underline-offset-2 hover:underline">
                                  打开文章 #{item.generatedArticleId}
                                </Link>
                              </div>
                            ) : null}
                            {item.generatedBatchId ? (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-inkSoft">
                                <span>生成批次：{item.generatedBatchId}</span>
                                <Link
                                  href={`/articles?backlog=${backlog.id}&batch=${encodeURIComponent(item.generatedBatchId)}`}
                                  className="text-cinnabar underline-offset-2 hover:underline"
                                >
                                  查看同批稿件
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => handleSaveItem(backlog.id, item.id)} disabled={savingItemId === item.id} variant="secondary">
                            {savingItemId === item.id ? "保存中…" : "保存条目"}
                          </Button>
                          <Button onClick={() => handleDeleteItem(backlog.id, item.id)} disabled={deletingItemId === item.id} variant="secondary">
                            {deletingItemId === item.id ? "删除中…" : "删除条目"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Input
                          aria-label="选题主题"
                          value={itemDraft.theme}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, theme: event.target.value } }))}
                          placeholder="选题主题"
                          className="bg-surface"
                        />
                        <Select
                          aria-label="主题原型"
                          value={itemDraft.archetype}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, archetype: event.target.value } }))}
                          className="bg-surface"
                        >
                          <option value="">暂不指定原型</option>
                          <option value="opinion">观点评论</option>
                          <option value="case">案例故事</option>
                          <option value="howto">教程指南</option>
                          <option value="hotTake">热点评论</option>
                          <option value="phenomenon">现象解读</option>
                        </Select>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Input
                          aria-label="目标读者"
                          value={itemDraft.targetAudience}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, targetAudience: event.target.value } }))}
                          placeholder="目标读者"
                          className="bg-surface"
                        />
                        <Select
                          aria-label="条目状态"
                          value={itemDraft.status}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, status: event.target.value } }))}
                          className="bg-surface"
                        >
                          <option value="draft">草稿</option>
                          <option value="ready">就绪</option>
                          <option value="generated">已生成</option>
                          <option value="discarded">丢弃</option>
                        </Select>
                      </div>
                      <Textarea
                        value={itemDraft.coreAssertion}
                        onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, coreAssertion: event.target.value } }))}
                        placeholder="核心判断"
                        className="mt-3 min-h-[82px] bg-surface"
                      />
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Textarea
                          value={itemDraft.readerSnapshotHint}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, readerSnapshotHint: event.target.value } }))}
                          placeholder="读者快照"
                          className="min-h-[82px] bg-surface"
                        />
                        <Textarea
                          value={itemDraft.whyNow}
                          onChange={(event) => setItemDrafts((prev) => ({ ...prev, [item.id]: { ...itemDraft, whyNow: event.target.value } }))}
                          placeholder="为何现在值得写"
                          className="min-h-[82px] bg-surface"
                        />
                      </div>
                    </article>
                  );
                })}
                {backlog.items.length === 0 ? (
                  <div className={messageCardClassName}>
                    这个选题库还没有条目。先补 3-5 条 ready 题，再用批量生成把它们转成初稿。
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {message ? (
        <div className={cn(messageCardClassName, "flex flex-wrap items-center justify-between gap-3")}>
          <div>{message}</div>
          {messageAction ? (
            <Link href={messageAction.href} className="text-cinnabar underline-offset-2 hover:underline">
              {messageAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
