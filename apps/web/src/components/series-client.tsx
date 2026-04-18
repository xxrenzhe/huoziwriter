"use client";

import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useMemo, useState } from "react";

type PersonaOption = {
  id: number;
  name: string;
};

type SeriesItem = {
  id: number;
  name: string;
  personaId: number;
  personaName: string;
  thesis: string | null;
  targetAudience: string | null;
  activeStatus: string;
  createdAt: string;
  updatedAt: string;
};

type SeriesDraft = {
  name: string;
  personaId: string;
  thesis: string;
  targetAudience: string;
  activeStatus: string;
};

function buildDraft(series: SeriesItem): SeriesDraft {
  return {
    name: series.name,
    personaId: String(series.personaId),
    thesis: series.thesis || "",
    targetAudience: series.targetAudience || "",
    activeStatus: series.activeStatus || "active",
  };
}

function formatSeriesStatus(value: string) {
  if (value === "paused") return "暂停经营";
  if (value === "archived") return "归档";
  return "经营中";
}

export function SeriesManager({
  initialSeries,
  personas,
}: {
  initialSeries: SeriesItem[];
  personas: PersonaOption[];
}) {
  const router = useRouter();
  const [series, setSeries] = useState(initialSeries);
  const [drafts, setDrafts] = useState<Record<number, SeriesDraft>>(
    Object.fromEntries(initialSeries.map((item) => [item.id, buildDraft(item)])),
  );
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState(personas[0] ? String(personas[0].id) : "");
  const [thesis, setThesis] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [activeStatus, setActiveStatus] = useState("active");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const canCreate = personas.length > 0;
  const activeSeriesCount = useMemo(
    () => series.filter((item) => item.activeStatus === "active").length,
    [series],
  );

  function syncDraft(next: SeriesItem) {
    setDrafts((prev) => ({
      ...prev,
      [next.id]: buildDraft(next),
    }));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!canCreate) {
      setMessage("先至少配置 1 个作者人设，系列才能绑定固定身份。");
      return;
    }
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        personaId: personaId ? Number(personaId) : null,
        thesis,
        targetAudience,
        activeStatus,
      }),
    });
    const json = await response.json();
    setSubmitting(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "系列创建失败");
      return;
    }

    const created = json.data as SeriesItem;
    const nextSeries = [created, ...series];
    setSeries(nextSeries);
    syncDraft(created);
    setName("");
    setThesis("");
    setTargetAudience("");
    setActiveStatus("active");
    setPersonaId(personas[0] ? String(personas[0].id) : "");
    setMessage("系列已创建。后续新稿件可以直接绑定到这个系列。");
    startTransition(() => router.refresh());
  }

  async function handleSave(seriesIdToSave: number) {
    const draft = drafts[seriesIdToSave];
    if (!draft) return;
    setUpdatingId(seriesIdToSave);
    setMessage("");
    const response = await fetch(`/api/series/${seriesIdToSave}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        personaId: draft.personaId ? Number(draft.personaId) : null,
        thesis: draft.thesis,
        targetAudience: draft.targetAudience,
        activeStatus: draft.activeStatus,
      }),
    });
    const json = await response.json();
    setUpdatingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "系列更新失败");
      return;
    }

    const updated = json.data as SeriesItem;
    setSeries((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    syncDraft(updated);
    setMessage(`系列「${updated.name}」已更新。`);
    startTransition(() => router.refresh());
  }

  async function handleDelete(seriesIdToDelete: number) {
    if (!window.confirm("确定要删除吗？")) return;

    setDeletingId(seriesIdToDelete);
    setMessage("");
    const response = await fetch(`/api/series/${seriesIdToDelete}`, {
      method: "DELETE",
    });
    const json = await response.json();
    setDeletingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "系列删除失败");
      return;
    }

    setSeries((prev) => prev.filter((item) => item.id !== seriesIdToDelete));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[seriesIdToDelete];
      return next;
    });
    setMessage("系列已删除。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["已建系列", String(series.length), "每篇稿件都应归属到一个长期经营的内容系列。"] as const,
          ["经营中", String(activeSeriesCount), "经营中的系列会优先进入稿件和作战台的默认视角。"] as const,
          ["绑定人设", String(new Set(series.map((item) => item.personaId)).size), "系列固定绑定作者身份，避免写到后期随手换口吻。"] as const,
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-300/40 bg-[#fffdfa] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{value}</div>
            <div className="mt-2 text-sm leading-6 text-stone-700">{note}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 border border-stone-300/40 bg-[#faf7f0] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">新建系列</div>
        <div className="grid gap-3 md:grid-cols-2">
          <input aria-label="系列名称，例如：AI 基础设施观察"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="系列名称，例如：AI 基础设施观察"
            className="border border-stone-300 bg-white px-4 py-3 text-sm"
          />
          <select aria-label="select control"
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
            disabled={!canCreate}
            className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100"
          >
            <option value="">{canCreate ? "选择绑定作者人设" : "先创建作者人设"}</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </select>
        </div>
        <textarea
          value={thesis}
          onChange={(event) => setThesis(event.target.value)}
          placeholder="核心判断：这个系列长期要反复打透什么问题？"
          className="min-h-[92px] border border-stone-300 bg-white px-4 py-3 text-sm leading-7"
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <input aria-label="目标读者：这组稿件主要写给谁"
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            placeholder="目标读者：这组稿件主要写给谁"
            className="border border-stone-300 bg-white px-4 py-3 text-sm"
          />
          <select aria-label="select control"
            value={activeStatus}
            onChange={(event) => setActiveStatus(event.target.value)}
            className="border border-stone-300 bg-white px-4 py-3 text-sm"
          >
            <option value="active">经营中</option>
            <option value="paused">暂停经营</option>
            <option value="archived">归档</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-stone-600">{canCreate ? "系列会固定绑定一个人设，稿件默认继承这个身份。" : "先创建作者人设后再创建系列。"}</div>
          <button
            type="submit"
            disabled={submitting || !canCreate}
            className="border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "创建中…" : "保存系列"}
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {series.map((item) => {
          const draft = drafts[item.id] || buildDraft(item);
          return (
            <article key={item.id} className="border border-stone-300/40 bg-white p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <input aria-label="input control"
                  value={draft.name}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: event.target.value } }))}
                  className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
                />
                <select aria-label="select control"
                  value={draft.personaId}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, personaId: event.target.value } }))}
                  className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
                >
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>{persona.name}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={draft.thesis}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, thesis: event.target.value } }))}
                className="mt-3 min-h-[88px] w-full border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm leading-7"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <input aria-label="input control"
                  value={draft.targetAudience}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, targetAudience: event.target.value } }))}
                  className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
                />
                <select aria-label="select control"
                  value={draft.activeStatus}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, activeStatus: event.target.value } }))}
                  className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
                >
                  <option value="active">经营中</option>
                  <option value="paused">暂停经营</option>
                  <option value="archived">归档</option>
                </select>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-stone-600">
                  当前状态：{formatSeriesStatus(item.activeStatus)} · 绑定人设：{item.personaName}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => handleSave(item.id)}
                    disabled={updatingId === item.id}
                    className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {updatingId === item.id ? "保存中…" : "保存修改"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === item.id ? "删除中…" : "删除系列"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {message ? <div className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm text-stone-700">{message}</div> : null}
    </div>
  );
}
