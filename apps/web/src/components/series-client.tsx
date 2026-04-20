"use client";

import { Button, Input, Select, Textarea, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useMemo, useState } from "react";

type PersonaOption = {
  id: number;
  name: string;
};

type WritingStyleOption = {
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
  preHook: string | null;
  postHook: string | null;
  defaultLayoutTemplateId: string | null;
  platformPreference: string | null;
  targetPackHint: string | null;
  defaultArchetype: string | null;
  defaultDnaId: number | null;
  rhythmOverride: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type SeriesDraft = {
  name: string;
  personaId: string;
  thesis: string;
  targetAudience: string;
  activeStatus: string;
  preHook: string;
  postHook: string;
  defaultLayoutTemplateId: string;
  platformPreference: string;
  targetPackHint: string;
  defaultArchetype: string;
  defaultDnaId: string;
  rhythmNarrativeStance: string;
  rhythmEnergyCurve: string;
  rhythmDiscoveryMode: string;
  rhythmOffTopicTolerance: string;
  rhythmClosureMode: string;
  rhythmJudgmentStrength: string;
};

function readRhythmOverrideValue(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value : "";
}

function buildDraft(series: SeriesItem): SeriesDraft {
  return {
    name: series.name,
    personaId: String(series.personaId),
    thesis: series.thesis || "",
    targetAudience: series.targetAudience || "",
    activeStatus: series.activeStatus || "active",
    preHook: series.preHook || "",
    postHook: series.postHook || "",
    defaultLayoutTemplateId: series.defaultLayoutTemplateId || "",
    platformPreference: series.platformPreference || "wechat",
    targetPackHint: series.targetPackHint || "",
    defaultArchetype: series.defaultArchetype || "",
    defaultDnaId: series.defaultDnaId ? String(series.defaultDnaId) : "",
    rhythmNarrativeStance: readRhythmOverrideValue(series.rhythmOverride, "narrativeStance"),
    rhythmEnergyCurve: readRhythmOverrideValue(series.rhythmOverride, "energyCurve"),
    rhythmDiscoveryMode: readRhythmOverrideValue(series.rhythmOverride, "discoveryMode"),
    rhythmOffTopicTolerance: readRhythmOverrideValue(series.rhythmOverride, "offTopicTolerance"),
    rhythmClosureMode: readRhythmOverrideValue(series.rhythmOverride, "closureMode"),
    rhythmJudgmentStrength: readRhythmOverrideValue(series.rhythmOverride, "judgmentStrength"),
  };
}

function buildRhythmOverrideFromDraft(draft: SeriesDraft) {
  const next = {
    narrativeStance: draft.rhythmNarrativeStance.trim(),
    energyCurve: draft.rhythmEnergyCurve.trim(),
    discoveryMode: draft.rhythmDiscoveryMode.trim(),
    offTopicTolerance: draft.rhythmOffTopicTolerance.trim(),
    closureMode: draft.rhythmClosureMode.trim(),
    judgmentStrength: draft.rhythmJudgmentStrength.trim(),
  };
  const entries = Object.entries(next).filter(([, value]) => value);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function formatSeriesStatus(value: string) {
  if (value === "paused") return "暂停经营";
  if (value === "archived") return "归档";
  return "经营中";
}

const statsCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surfaceWarm");
const createFormClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "grid gap-3");
const editorCardClassName = surfaceCardStyles({ padding: "md" });
const messageCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surfaceWarm text-sm text-inkSoft");
const draftFieldClassName = "bg-paperStrong";

export function SeriesManager({
  initialSeries,
  personas,
  availableWritingStyles,
}: {
  initialSeries: SeriesItem[];
  personas: PersonaOption[];
  availableWritingStyles: WritingStyleOption[];
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
  const [preHook, setPreHook] = useState("");
  const [postHook, setPostHook] = useState("");
  const [defaultLayoutTemplateId, setDefaultLayoutTemplateId] = useState("");
  const [platformPreference, setPlatformPreference] = useState("wechat");
  const [targetPackHint, setTargetPackHint] = useState("");
  const [defaultArchetype, setDefaultArchetype] = useState("");
  const [defaultDnaId, setDefaultDnaId] = useState("");
  const [rhythmNarrativeStance, setRhythmNarrativeStance] = useState("");
  const [rhythmEnergyCurve, setRhythmEnergyCurve] = useState("");
  const [rhythmDiscoveryMode, setRhythmDiscoveryMode] = useState("");
  const [rhythmOffTopicTolerance, setRhythmOffTopicTolerance] = useState("");
  const [rhythmClosureMode, setRhythmClosureMode] = useState("");
  const [rhythmJudgmentStrength, setRhythmJudgmentStrength] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const canCreate = personas.length > 0;
  const activeSeriesCount = useMemo(
    () => series.filter((item) => item.activeStatus === "active").length,
    [series],
  );
  const writingStyleNameMap = useMemo(
    () => new Map(availableWritingStyles.map((item) => [item.id, item.name] as const)),
    [availableWritingStyles],
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
        preHook,
        postHook,
        defaultLayoutTemplateId,
        platformPreference,
        targetPackHint,
        defaultArchetype,
        defaultDnaId: defaultDnaId ? Number(defaultDnaId) : null,
        rhythmOverride: buildRhythmOverrideFromDraft({
          name: "",
          personaId: "",
          thesis: "",
          targetAudience: "",
          activeStatus: "",
          preHook: "",
          postHook: "",
          defaultLayoutTemplateId: "",
          platformPreference: "",
          targetPackHint: "",
          defaultArchetype: "",
          defaultDnaId,
          rhythmNarrativeStance,
          rhythmEnergyCurve,
          rhythmDiscoveryMode,
          rhythmOffTopicTolerance,
          rhythmClosureMode,
          rhythmJudgmentStrength,
        }),
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
    setPreHook("");
    setPostHook("");
    setDefaultLayoutTemplateId("");
    setPlatformPreference("wechat");
    setTargetPackHint("");
    setDefaultArchetype("");
    setDefaultDnaId("");
    setRhythmNarrativeStance("");
    setRhythmEnergyCurve("");
    setRhythmDiscoveryMode("");
    setRhythmOffTopicTolerance("");
    setRhythmClosureMode("");
    setRhythmJudgmentStrength("");
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
        preHook: draft.preHook,
        postHook: draft.postHook,
        defaultLayoutTemplateId: draft.defaultLayoutTemplateId,
        platformPreference: draft.platformPreference,
        targetPackHint: draft.targetPackHint,
        defaultArchetype: draft.defaultArchetype,
        defaultDnaId: draft.defaultDnaId ? Number(draft.defaultDnaId) : null,
        rhythmOverride: buildRhythmOverrideFromDraft(draft),
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
          <article key={label} className={statsCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{label}</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{value}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">{note}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleCreate} className={createFormClassName}>
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">新建系列</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            aria-label="系列名称，例如：AI 基础设施观察"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="系列名称，例如：AI 基础设施观察"
            className="bg-surface"
          />
          <Select
            aria-label="select control"
            value={personaId}
            onChange={(event) => setPersonaId(event.target.value)}
            disabled={!canCreate}
            className="bg-surface disabled:bg-surfaceMuted"
          >
            <option value="">{canCreate ? "选择绑定作者人设" : "先创建作者人设"}</option>
            {personas.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.name}</option>
            ))}
          </Select>
        </div>
        <Textarea
          value={thesis}
          onChange={(event) => setThesis(event.target.value)}
          placeholder="核心判断：这个系列长期要反复打透什么问题？"
          className="min-h-[92px] bg-surface"
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <Input
            aria-label="目标读者：这组稿件主要写给谁"
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            placeholder="目标读者：这组稿件主要写给谁"
            className="bg-surface"
          />
          <Select
            aria-label="select control"
            value={activeStatus}
            onChange={(event) => setActiveStatus(event.target.value)}
            className="bg-surface"
          >
            <option value="active">经营中</option>
            <option value="paused">暂停经营</option>
            <option value="archived">归档</option>
          </Select>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={preHook}
            onChange={(event) => setPreHook(event.target.value)}
            placeholder="前钩子：这个系列文章开头经常固定出现的一句定位或引子。"
            className="min-h-[92px] bg-surface"
          />
          <Textarea
            value={postHook}
            onChange={(event) => setPostHook(event.target.value)}
            placeholder="后钩子：结尾固定动作，例如关注、转发、加入下一篇连载。"
            className="min-h-[92px] bg-surface"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            aria-label="默认排版模板 ID"
            value={defaultLayoutTemplateId}
            onChange={(event) => setDefaultLayoutTemplateId(event.target.value)}
            placeholder="默认排版模板 ID"
            className="bg-surface"
          />
          <Select
            aria-label="平台偏好"
            value={platformPreference}
            onChange={(event) => setPlatformPreference(event.target.value)}
            className="bg-surface"
          >
            <option value="wechat">微信公众号</option>
            <option value="toutiao">头条</option>
            <option value="xiaohongshu">小红书</option>
            <option value="other">其他</option>
          </Select>
          <Input
            aria-label="目标包提示"
            value={targetPackHint}
            onChange={(event) => setTargetPackHint(event.target.value)}
            placeholder="目标包：100k / 50k / 10k"
            className="bg-surface"
          />
        </div>
        <Select
          aria-label="默认原型"
          value={defaultArchetype}
          onChange={(event) => setDefaultArchetype(event.target.value)}
          className="bg-surface"
        >
          <option value="">默认原型（可选）</option>
          <option value="opinion">观点评论</option>
          <option value="case">案例故事</option>
          <option value="howto">教程指南</option>
          <option value="hotTake">热点评论</option>
          <option value="phenomenon">现象解读</option>
        </Select>
        <div className="grid gap-3 md:grid-cols-2">
          <Select
            aria-label="默认文风资产"
            value={defaultDnaId}
            onChange={(event) => setDefaultDnaId(event.target.value)}
            className="bg-surface"
          >
            <option value="">默认文风资产（可选）</option>
            {availableWritingStyles.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
          <Input
            aria-label="叙事站位"
            value={rhythmNarrativeStance}
            onChange={(event) => setRhythmNarrativeStance(event.target.value)}
            placeholder="叙事站位：观察者 / 当事人 / 导师"
            className="bg-surface"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            aria-label="能量曲线"
            value={rhythmEnergyCurve}
            onChange={(event) => setRhythmEnergyCurve(event.target.value)}
            placeholder="能量曲线：平稳 / 递进 / 爆发"
            className="bg-surface"
          />
          <Input
            aria-label="展开方式"
            value={rhythmDiscoveryMode}
            onChange={(event) => setRhythmDiscoveryMode(event.target.value)}
            placeholder="展开方式：线性 / 递归 / 对照"
            className="bg-surface"
          />
          <Input
            aria-label="跑题容忍度"
            value={rhythmOffTopicTolerance}
            onChange={(event) => setRhythmOffTopicTolerance(event.target.value)}
            placeholder="跑题容忍度：低 / 中 / 高"
            className="bg-surface"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            aria-label="收束方式"
            value={rhythmClosureMode}
            onChange={(event) => setRhythmClosureMode(event.target.value)}
            placeholder="收束方式：结论 / 提问 / 行动"
            className="bg-surface"
          />
          <Input
            aria-label="判断强度"
            value={rhythmJudgmentStrength}
            onChange={(event) => setRhythmJudgmentStrength(event.target.value)}
            placeholder="判断强度：克制 / 明确 / 强判断"
            className="bg-surface"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-inkSoft">{canCreate ? "系列会固定绑定一个人设，稿件默认继承这个身份。" : "先创建作者人设后再创建系列。"}</div>
          <Button
            type="submit"
            disabled={submitting || !canCreate}
            variant="primary"
            className="disabled:opacity-50"
          >
            {submitting ? "创建中…" : "保存系列"}
          </Button>
        </div>
      </form>

      <div className="space-y-4">
        {series.map((item) => {
          const draft = drafts[item.id] || buildDraft(item);
          return (
            <article key={item.id} className={editorCardClassName}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="input control"
                  value={draft.name}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, name: event.target.value } }))}
                  className={draftFieldClassName}
                />
                <Select
                  aria-label="select control"
                  value={draft.personaId}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, personaId: event.target.value } }))}
                  className={draftFieldClassName}
                >
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>{persona.name}</option>
                  ))}
                </Select>
              </div>
              <Textarea
                value={draft.thesis}
                onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, thesis: event.target.value } }))}
                className="mt-3 min-h-[88px] bg-paperStrong"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <Input
                  aria-label="input control"
                  value={draft.targetAudience}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, targetAudience: event.target.value } }))}
                  className={draftFieldClassName}
                />
                <Select
                  aria-label="select control"
                  value={draft.activeStatus}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, activeStatus: event.target.value } }))}
                  className={draftFieldClassName}
                >
                  <option value="active">经营中</option>
                  <option value="paused">暂停经营</option>
                  <option value="archived">归档</option>
                </Select>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Textarea
                  value={draft.preHook}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, preHook: event.target.value } }))}
                  placeholder="前钩子"
                  className="min-h-[88px] bg-paperStrong"
                />
                <Textarea
                  value={draft.postHook}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, postHook: event.target.value } }))}
                  placeholder="后钩子"
                  className="min-h-[88px] bg-paperStrong"
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Input
                  aria-label="input control"
                  value={draft.defaultLayoutTemplateId}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, defaultLayoutTemplateId: event.target.value } }))}
                  placeholder="默认排版模板 ID"
                  className={draftFieldClassName}
                />
                <Select
                  aria-label="select control"
                  value={draft.platformPreference}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, platformPreference: event.target.value } }))}
                  className={draftFieldClassName}
                >
                  <option value="wechat">微信公众号</option>
                  <option value="toutiao">头条</option>
                  <option value="xiaohongshu">小红书</option>
                  <option value="other">其他</option>
                </Select>
                <Input
                  aria-label="input control"
                  value={draft.targetPackHint}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, targetPackHint: event.target.value } }))}
                  placeholder="目标包：100k / 50k / 10k"
                  className={draftFieldClassName}
                />
              </div>
              <div className="mt-3">
                <Select
                  aria-label="select control"
                  value={draft.defaultArchetype}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, defaultArchetype: event.target.value } }))}
                  className={draftFieldClassName}
                >
                  <option value="">默认原型（可选）</option>
                  <option value="opinion">观点评论</option>
                  <option value="case">案例故事</option>
                  <option value="howto">教程指南</option>
                  <option value="hotTake">热点评论</option>
                  <option value="phenomenon">现象解读</option>
                </Select>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Select
                  aria-label="select control"
                  value={draft.defaultDnaId}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, defaultDnaId: event.target.value } }))}
                  className={draftFieldClassName}
                >
                  <option value="">默认文风资产（可选）</option>
                  {availableWritingStyles.map((style) => (
                    <option key={style.id} value={style.id}>{style.name}</option>
                  ))}
                </Select>
                <Input
                  aria-label="input control"
                  value={draft.rhythmNarrativeStance}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmNarrativeStance: event.target.value } }))
                  }
                  placeholder="叙事站位"
                  className={draftFieldClassName}
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <Input
                  aria-label="input control"
                  value={draft.rhythmEnergyCurve}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmEnergyCurve: event.target.value } }))
                  }
                  placeholder="能量曲线"
                  className={draftFieldClassName}
                />
                <Input
                  aria-label="input control"
                  value={draft.rhythmDiscoveryMode}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmDiscoveryMode: event.target.value } }))
                  }
                  placeholder="展开方式"
                  className={draftFieldClassName}
                />
                <Input
                  aria-label="input control"
                  value={draft.rhythmOffTopicTolerance}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmOffTopicTolerance: event.target.value } }))
                  }
                  placeholder="跑题容忍度"
                  className={draftFieldClassName}
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input
                  aria-label="input control"
                  value={draft.rhythmClosureMode}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmClosureMode: event.target.value } }))
                  }
                  placeholder="收束方式"
                  className={draftFieldClassName}
                />
                <Input
                  aria-label="input control"
                  value={draft.rhythmJudgmentStrength}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.id]: { ...draft, rhythmJudgmentStrength: event.target.value } }))
                  }
                  placeholder="判断强度"
                  className={draftFieldClassName}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-inkSoft">
                  当前状态：{formatSeriesStatus(item.activeStatus)} · 绑定人设：{item.personaName}
                  {item.defaultDnaId
                    ? ` · 默认文风：${writingStyleNameMap.get(item.defaultDnaId) || `#${item.defaultDnaId}`}`
                    : ""}
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => handleSave(item.id)}
                    disabled={updatingId === item.id}
                    variant="secondary"
                    className="py-2 disabled:opacity-50"
                  >
                    {updatingId === item.id ? "保存中…" : "保存修改"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    disabled={deletingId === item.id}
                    variant="secondary"
                    className="py-2 disabled:opacity-50"
                  >
                    {deletingId === item.id ? "删除中…" : "删除系列"}
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {message ? <div className={messageCardClassName}>{message}</div> : null}
    </div>
  );
}
