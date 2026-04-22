"use client";

import { useMemo, useState, useTransition } from "react";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";

type ArchetypeKey = "opinion" | "case" | "howto" | "hotTake" | "phenomenon";

type RhythmTemplate = {
  archetypeKey: ArchetypeKey;
  version: string;
  name: string;
  description: string | null;
  hints: {
    narrativeStance: string;
    energyCurve: string;
    discoveryMode: string;
    offTopicTolerance: "low" | "med" | "high";
    closureMode: string;
    judgmentStrength: "low" | "med" | "high";
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  initialTemplates: RhythmTemplate[];
};

type FormState = {
  archetypeKey: ArchetypeKey;
  version: string;
  name: string;
  description: string;
  narrativeStance: string;
  energyCurve: string;
  discoveryMode: string;
  offTopicTolerance: "low" | "med" | "high";
  closureMode: string;
  judgmentStrength: "low" | "med" | "high";
  activate: boolean;
};

const ARCHETYPE_LABELS: Record<ArchetypeKey, string> = {
  opinion: "观点评论",
  case: "案例故事",
  howto: "教程指南",
  hotTake: "热点评论",
  phenomenon: "现象解读",
};

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const insetCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-adminLineStrong bg-adminSurfaceMuted text-adminInk shadow-none");
const labelClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const inputClassName = "w-full rounded-xl border border-adminLineStrong bg-adminSurface px-3 py-2 text-sm text-adminInk outline-none transition focus:border-adminAccent";
const actionClassName = uiPrimitives.adminSecondaryButton;
const primaryActionClassName = uiPrimitives.primaryButton;

function buildInitialForm(): FormState {
  return {
    archetypeKey: "opinion",
    version: "",
    name: "",
    description: "",
    narrativeStance: "",
    energyCurve: "",
    discoveryMode: "",
    offTopicTolerance: "med",
    closureMode: "",
    judgmentStrength: "med",
    activate: true,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function AdminPlan17RhythmTemplatesClient({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState<RhythmTemplate[]>(initialTemplates);
  const [form, setForm] = useState<FormState>(buildInitialForm());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isActivating, startActivating] = useTransition();

  const groupedTemplates = useMemo(() => {
    return (Object.keys(ARCHETYPE_LABELS) as ArchetypeKey[]).map((key) => ({
      key,
      label: ARCHETYPE_LABELS[key],
      items: templates.filter((item) => item.archetypeKey === key),
    }));
  }, [templates]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleCreate = () => {
    setFeedback(null);
    setError(null);
    startSaving(async () => {
      try {
        const response = await fetch("/api/admin/plan17/rhythm-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            archetypeKey: form.archetypeKey,
            version: form.version,
            name: form.name,
            description: form.description,
            activate: form.activate,
            hints: {
              narrativeStance: form.narrativeStance,
              energyCurve: form.energyCurve,
              discoveryMode: form.discoveryMode,
              offTopicTolerance: form.offTopicTolerance,
              closureMode: form.closureMode,
              judgmentStrength: form.judgmentStrength,
            },
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "创建节奏模板失败");
        }
        const created = payload.data as RhythmTemplate;
        setTemplates((current) => {
          const next = current.filter((item) => !(item.archetypeKey === created.archetypeKey && item.version === created.version));
          next.push(created);
          return next.sort((left, right) =>
            left.archetypeKey.localeCompare(right.archetypeKey, "zh-CN")
            || Number(right.isActive) - Number(left.isActive)
            || right.updatedAt.localeCompare(left.updatedAt, "zh-CN"));
        });
        setForm(buildInitialForm());
        setFeedback(`已创建 ${ARCHETYPE_LABELS[created.archetypeKey]} · ${created.version}`);
      } catch (createError) {
        setError(createError instanceof Error ? createError.message : "创建节奏模板失败");
      }
    });
  };

  const handleActivate = (template: RhythmTemplate) => {
    setFeedback(null);
    setError(null);
    startActivating(async () => {
      try {
        const response = await fetch("/api/admin/plan17/rhythm-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "activate",
            archetypeKey: template.archetypeKey,
            version: template.version,
          }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "激活节奏模板失败");
        }
        const activated = payload.data as RhythmTemplate;
        setTemplates((current) =>
          current.map((item) =>
            item.archetypeKey === activated.archetypeKey
              ? { ...item, isActive: item.version === activated.version, updatedAt: item.version === activated.version ? activated.updatedAt : item.updatedAt }
              : item,
          ),
        );
        setFeedback(`已切换 ${ARCHETYPE_LABELS[activated.archetypeKey]} 的 active 版本到 ${activated.version}`);
      } catch (activateError) {
        setError(activateError instanceof Error ? activateError.message : "激活节奏模板失败");
      }
    });
  };

  return (
    <div className="space-y-8">
      <section className={panelClassName}>
        <div className={labelClassName}>Plan17 Rhythm</div>
        <h1 className="mt-3 font-serifCn text-3xl text-adminInk">原型节奏模板管理</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-adminInkMuted">
          这里管理 `ArchetypeRhythmTemplate` 的持久化版本。生产链路会按原型读取 active 模板，再叠加 `series.rhythmOverride`。
        </p>
        {feedback ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</div> : null}
        {error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
      </section>

      <section className={panelClassName}>
        <div className={labelClassName}>Create Version</div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <div className={labelClassName}>原型</div>
            <select className={inputClassName} value={form.archetypeKey} onChange={(event) => updateForm("archetypeKey", event.target.value as ArchetypeKey)}>
              {(Object.keys(ARCHETYPE_LABELS) as ArchetypeKey[]).map((key) => <option key={key} value={key}>{ARCHETYPE_LABELS[key]}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>版本号</div>
            <input className={inputClassName} value={form.version} onChange={(event) => updateForm("version", event.target.value)} placeholder="例如 v2" />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>名称</div>
            <input className={inputClassName} value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="例如 opinion tuned rhythm" />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>描述</div>
            <input className={inputClassName} value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="可选" />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>叙事姿态</div>
            <input className={inputClassName} value={form.narrativeStance} onChange={(event) => updateForm("narrativeStance", event.target.value)} />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>能量曲线</div>
            <input className={inputClassName} value={form.energyCurve} onChange={(event) => updateForm("energyCurve", event.target.value)} />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>发现模式</div>
            <input className={inputClassName} value={form.discoveryMode} onChange={(event) => updateForm("discoveryMode", event.target.value)} />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>收束方式</div>
            <input className={inputClassName} value={form.closureMode} onChange={(event) => updateForm("closureMode", event.target.value)} />
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>跑题容忍度</div>
            <select className={inputClassName} value={form.offTopicTolerance} onChange={(event) => updateForm("offTopicTolerance", event.target.value as "low" | "med" | "high")}>
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="space-y-2">
            <div className={labelClassName}>判断强度</div>
            <select className={inputClassName} value={form.judgmentStrength} onChange={(event) => updateForm("judgmentStrength", event.target.value as "low" | "med" | "high")}>
              <option value="low">low</option>
              <option value="med">med</option>
              <option value="high">high</option>
            </select>
          </label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-adminInkMuted">
          <input type="checkbox" checked={form.activate} onChange={(event) => updateForm("activate", event.target.checked)} />
          创建后直接设为 active
        </label>
        <div className="mt-5">
          <button type="button" className={primaryActionClassName} onClick={handleCreate} disabled={isSaving}>
            {isSaving ? "保存中…" : "创建模板版本"}
          </button>
        </div>
      </section>

      <section className={panelClassName}>
        <div className={labelClassName}>Active Versions</div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {groupedTemplates.map((group) => (
            <article key={group.key} className={insetCardClassName}>
              <div className={labelClassName}>{group.label}</div>
              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <div key={`${item.archetypeKey}-${item.version}`} className="rounded-xl border border-adminLineStrong bg-adminSurface px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-adminInk">{item.name}</div>
                        <div className="mt-1 text-sm text-adminInkMuted">{item.version}{item.isActive ? " · active" : ""}</div>
                        {item.description ? <div className="mt-2 text-sm text-adminInkMuted">{item.description}</div> : null}
                      </div>
                      {!item.isActive ? (
                        <button type="button" className={actionClassName} onClick={() => handleActivate(item)} disabled={isActivating}>
                          {isActivating ? "切换中…" : "设为 Active"}
                        </button>
                      ) : (
                        <span className="rounded-full border border-adminAccent/30 bg-adminAccent/10 px-3 py-1 text-xs text-adminAccent">当前生产版本</span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-adminInkMuted">
                      <div>叙事姿态：{item.hints.narrativeStance}</div>
                      <div>能量曲线：{item.hints.energyCurve}</div>
                      <div>发现模式：{item.hints.discoveryMode}</div>
                      <div>跑题容忍度：{item.hints.offTopicTolerance}</div>
                      <div>收束方式：{item.hints.closureMode}</div>
                      <div>判断强度：{item.hints.judgmentStrength}</div>
                      <div>更新时间：{formatDateTime(item.updatedAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
