"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";

type Plan17QualityReport = {
  generatedAt: string;
  totalDatasetCount: number;
  totalSampleCount: number;
  seededDatasetCodes: string[];
  focuses: Array<{
    key: string;
    label: string;
    description: string;
    sampleCount: number;
    datasetCount: number;
    enabledCaseCount: number;
    disabledCaseCount: number;
    runCount: number;
    linkedFeedbackCount: number;
    latestRunAt: string | null;
    reporting: {
      topicFissionSceneBreakdown: Array<{
        sceneKey: string;
        promptId: string;
        label: string;
        activeVersion: string | null;
        evaluatedCaseCount: number;
        stableCaseCount: number;
        stableHitCaseCount: number;
        stableHitRate: number | null;
        runCount: number;
        latestRunAt: string | null;
      }>;
      proxyScoreVsObservedSpearman: number | null;
      proxyScoreVsObservedSampleCount: number;
      strategyManualScoreSpearman: number | null;
      strategyManualScoreSampleCount: number;
      evidenceLabelPrecision: number | null;
      evidenceLabelRecall: number | null;
      evidenceLabelSampleCount: number;
      rhythmDeviationVsReadCompletionCorrelation: number | null;
      rhythmDeviationVsReadCompletionSampleCount: number;
      rhythmDeviationVsReadCompletionPValue: number | null;
    };
    observationGaps: Array<{
      key: string;
      label: string;
      count: number;
    }>;
  }>;
};

type Plan17QualityQueue = {
  dataset: {
    id: number;
    code: string;
    name: string;
    status: string;
    sampleCount: number;
    focus: {
      key: string;
      label: string;
      description: string;
    };
    readiness: {
      status: "ready" | "warning" | "blocked";
    };
  };
  focus: Plan17QualityReport["focuses"][number] | null;
  cases: Array<{
    id: number;
    datasetId: number;
    taskCode: string;
    taskType: string;
    topicTitle: string;
    sourceType: string;
    sourceRef: string | null;
    sourceLabel: string | null;
    sourceUrl: string | null;
    inputPayload: Record<string, unknown>;
    expectedConstraints: Record<string, unknown>;
    viralTargets: Record<string, unknown>;
    stageArtifactPayloads: Record<string, unknown>;
    referenceGoodOutput: string | null;
    referenceBadPatterns: unknown[];
    difficultyLevel: string;
    isEnabled: boolean;
    updatedAt: string;
  }>;
};

type Plan17QualityLabel = {
  id: number;
  caseId: number;
  datasetId: number;
  focusKey: string;
  strategyManualScore: number | null;
  evidenceExpectedTags: string[];
  evidenceDetectedTags: string[];
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

type AdminPlan17QualityClientProps = {
  qualityReport: Plan17QualityReport;
  queues: Plan17QualityQueue[];
  initialLabels: Plan17QualityLabel[];
  initialFocusKey?: string | null;
  initialSelectedDatasetId?: number | null;
  initialSelectedCaseId?: number | null;
};

type LabelFormState = {
  strategyManualScore: string;
  evidenceExpectedTags: string;
  evidenceDetectedTags: string;
  notes: string;
};

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const mutedPanelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted p-5 text-adminInk shadow-none");
const insetCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-adminLineStrong bg-adminBg text-adminInk shadow-none");
const eyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const actionClassName = uiPrimitives.adminSecondaryButton;
const activeTabClassName = "border-adminAccent bg-adminSurfaceAlt text-adminAccent";
const valueClassName = "mt-3 font-serifCn text-4xl text-adminInk text-balance";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function formatMetric(value: number | null | undefined, digits = 3) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "--";
}

function joinTags(values: string[] | null | undefined) {
  return Array.isArray(values) && values.length > 0 ? values.join("，") : "";
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function buildLabelMap(labels: Plan17QualityLabel[]) {
  return Object.fromEntries(labels.map((item) => [item.caseId, item])) as Record<number, Plan17QualityLabel>;
}

function buildFormState(label: Plan17QualityLabel | null | undefined): LabelFormState {
  return {
    strategyManualScore: label?.strategyManualScore == null ? "" : String(label.strategyManualScore),
    evidenceExpectedTags: joinTags(label?.evidenceExpectedTags),
    evidenceDetectedTags: joinTags(label?.evidenceDetectedTags),
    notes: label?.notes ?? "",
  };
}

function getStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getFocusMetricLine(focus: Plan17QualityReport["focuses"][number] | null) {
  if (!focus) return "暂无统计。";
  if (focus.key === "topic_fission") {
    return focus.reporting.topicFissionSceneBreakdown.length > 0
      ? focus.reporting.topicFissionSceneBreakdown
          .map((item) => `${item.sceneKey} ${item.evaluatedCaseCount}/${item.stableHitRate != null ? `${(item.stableHitRate * 100).toFixed(1)}%` : "--"}`)
          .join(" · ")
      : "三场景还没有运行样本。";
  }
  if (focus.key === "strategy_strength") {
    return `四元强度 vs 人工 Spearman ${formatMetric(focus.reporting.strategyManualScoreSpearman)} · 代理 Spearman ${formatMetric(focus.reporting.proxyScoreVsObservedSpearman)} · 样本 ${focus.reporting.strategyManualScoreSampleCount}`;
  }
  if (focus.key === "evidence_hook") {
    return `precision ${formatPercent(focus.reporting.evidenceLabelPrecision)} · recall ${formatPercent(focus.reporting.evidenceLabelRecall)} · 样本 ${focus.reporting.evidenceLabelSampleCount}`;
  }
  if (focus.key === "rhythm_consistency") {
    return `rhythmDeviation vs readCompletion ${formatMetric(focus.reporting.rhythmDeviationVsReadCompletionCorrelation)} · 样本 ${focus.reporting.rhythmDeviationVsReadCompletionSampleCount}`;
  }
  return `代理 Spearman ${formatMetric(focus.reporting.proxyScoreVsObservedSpearman)} · 样本 ${focus.reporting.proxyScoreVsObservedSampleCount}`;
}

function getFocusGapLine(focus: Plan17QualityReport["focuses"][number] | null) {
  if (!focus || focus.observationGaps.length === 0) {
    return "当前没有额外 gap。";
  }
  return focus.observationGaps
    .slice(0, 2)
    .map((item) => `${item.label} ${item.count}`)
    .join(" · ");
}

function pickFirstCaseId(queue: Plan17QualityQueue | null | undefined) {
  return queue?.cases[0]?.id ?? null;
}

export function AdminPlan17QualityClient({
  qualityReport,
  queues,
  initialLabels,
  initialFocusKey,
  initialSelectedDatasetId,
  initialSelectedCaseId,
}: AdminPlan17QualityClientProps) {
  const [labelsByCaseId, setLabelsByCaseId] = useState<Record<number, Plan17QualityLabel>>(() => buildLabelMap(initialLabels));
  const [selectedFocusKey, setSelectedFocusKey] = useState<string>(initialFocusKey || "all");
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(initialSelectedDatasetId ?? queues[0]?.dataset.id ?? null);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(initialSelectedCaseId ?? pickFirstCaseId(queues[0]));
  const [formState, setFormState] = useState<LabelFormState>({ strategyManualScore: "", evidenceExpectedTags: "", evidenceDetectedTags: "", notes: "" });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isAutoFilling, startAutoFill] = useTransition();

  const filteredQueues = selectedFocusKey === "all" ? queues : queues.filter((item) => item.dataset.focus.key === selectedFocusKey);
  const selectedQueue = filteredQueues.find((item) => item.dataset.id === selectedDatasetId) ?? filteredQueues[0] ?? null;
  const selectedCase = selectedQueue?.cases.find((item) => item.id === selectedCaseId) ?? selectedQueue?.cases[0] ?? null;
  const selectedLabel = selectedCase ? labelsByCaseId[selectedCase.id] ?? null : null;
  const selectedFocus = selectedQueue?.focus ?? null;
  const selectedInputPayload = getRecord(selectedCase?.inputPayload);
  const selectedExpectedConstraints = getRecord(selectedCase?.expectedConstraints);
  const selectedViralTargets = getRecord(selectedCase?.viralTargets);

  useEffect(() => {
    if (!selectedQueue) {
      if (selectedDatasetId !== null) setSelectedDatasetId(null);
      if (selectedCaseId !== null) setSelectedCaseId(null);
      return;
    }
    if (selectedDatasetId !== selectedQueue.dataset.id) {
      setSelectedDatasetId(selectedQueue.dataset.id);
    }
    const nextCaseId = selectedCase?.id ?? pickFirstCaseId(selectedQueue);
    if (selectedCaseId !== nextCaseId) {
      setSelectedCaseId(nextCaseId);
    }
  }, [selectedQueue, selectedCase, selectedDatasetId, selectedCaseId]);

  useEffect(() => {
    setFormState(buildFormState(selectedLabel));
  }, [selectedCase?.id, selectedLabel?.updatedAt]);

  const handleFocusChange = (focusKey: string) => {
    setSelectedFocusKey(focusKey);
    const nextQueues = focusKey === "all" ? queues : queues.filter((item) => item.dataset.focus.key === focusKey);
    const nextQueue =
      nextQueues.find((item) => item.dataset.id === selectedDatasetId)
      ?? nextQueues[0]
      ?? null;
    setSelectedDatasetId(nextQueue?.dataset.id ?? null);
    setSelectedCaseId(pickFirstCaseId(nextQueue));
    setFeedback(null);
    setError(null);
  };

  const handleDatasetChange = (datasetId: number) => {
    const nextQueue = filteredQueues.find((item) => item.dataset.id === datasetId) ?? null;
    setSelectedDatasetId(nextQueue?.dataset.id ?? null);
    setSelectedCaseId(pickFirstCaseId(nextQueue));
    setFeedback(null);
    setError(null);
  };

  const handleNextUnlabeled = () => {
    if (!selectedQueue || !selectedCase) return;
    const currentIndex = selectedQueue.cases.findIndex((item) => item.id === selectedCase.id);
    const next = selectedQueue.cases.find((item, index) => index > currentIndex && !labelsByCaseId[item.id]);
    if (next) {
      setSelectedCaseId(next.id);
      return;
    }
    const firstUnlabeled = selectedQueue.cases.find((item) => !labelsByCaseId[item.id]);
    if (firstUnlabeled) {
      setSelectedCaseId(firstUnlabeled.id);
      return;
    }
    setFeedback("当前队列已全部标注。");
  };

  const handleSave = () => {
    if (!selectedCase) return;
    setFeedback(null);
    setError(null);
    startSaving(async () => {
      try {
        const response = await fetch("/api/admin/plan17/quality/labels", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            caseId: selectedCase.id,
            strategyManualScore: formState.strategyManualScore === "" ? null : Number(formState.strategyManualScore),
            evidenceExpectedTags: splitTags(formState.evidenceExpectedTags),
            evidenceDetectedTags: splitTags(formState.evidenceDetectedTags),
            notes: formState.notes.trim() || null,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "保存人工标注失败");
        }
        const nextLabel = payload.data as Plan17QualityLabel;
        setLabelsByCaseId((current) => ({ ...current, [nextLabel.caseId]: nextLabel }));
        setFeedback(`样本 ${selectedCase.taskCode} 已保存。`);
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "保存人工标注失败");
      }
    });
  };

  const handleAutoFill = () => {
    setFeedback(null);
    setError(null);
    startAutoFill(async () => {
      try {
        const response = await fetch("/api/admin/plan17/quality/auto-fill", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "自动补样本失败");
        }
        window.location.reload();
      } catch (autoFillError) {
        setError(autoFillError instanceof Error ? autoFillError.message : "自动补样本失败");
      }
    });
  };

  return (
    <section className="space-y-6">
      <article className={cn(panelClassName, "grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end")}>
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-adminAccent">Plan 17 Quality</div>
          <h1 className="mt-4 font-serifCn text-4xl text-adminInk text-balance">人工标注与质量补桶</h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-adminInkSoft">
            这里直接面向 `plan17` 四个质量桶做人工录入，不再要求管理员手工拼 API。支持按 focus / dataset / case 逐条标注，也支持一键触发自动补样本。
          </p>
          <p className="mt-4 text-xs uppercase tracking-[0.24em] text-adminInkMuted">生成于 {formatDateTime(qualityReport.generatedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/writing-eval" className={actionClassName}>返回总览</Link>
          <Link href="/admin/plan17/business" className={actionClassName}>业务 drilldown</Link>
          <a href="/api/admin/plan17/quality" target="_blank" rel="noreferrer" className={actionClassName}>打开 JSON</a>
          <button type="button" className={uiPrimitives.primaryButton} disabled={isAutoFilling} onClick={() => handleAutoFill()}>
            {isAutoFilling ? "补样本中..." : "自动补样本"}
          </button>
        </div>
      </article>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>数据集</div>
          <div className={valueClassName}>{qualityReport.totalDatasetCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">当前 `plan17` 质量桶总数。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>样本</div>
          <div className={valueClassName}>{qualityReport.totalSampleCount}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">所有质量桶累计样本数。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>已标注</div>
          <div className={valueClassName}>{Object.keys(labelsByCaseId).length}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">当前已录入人工标签的 case 数量。</p>
        </article>
        <article className={mutedPanelClassName}>
          <div className={eyebrowClassName}>自动 Seed</div>
          <div className={valueClassName}>{qualityReport.seededDatasetCodes.length}</div>
          <p className="mt-3 text-sm leading-7 text-adminInkSoft">
            {qualityReport.seededDatasetCodes.length > 0 ? qualityReport.seededDatasetCodes.join(" · ") : "本次没有新增 preset"}
          </p>
        </article>
      </div>

      <article className={panelClassName}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className={eyebrowClassName}>Focus Filter</div>
            <p className="mt-3 text-sm leading-7 text-adminInkSoft">先按质量桶过滤，再进入具体 dataset 与 case。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleFocusChange("all")}
              className={cn(actionClassName, selectedFocusKey === "all" ? activeTabClassName : null)}
            >
              全部
            </button>
            {qualityReport.focuses.map((focus) => (
              <button
                key={focus.key}
                type="button"
                onClick={() => handleFocusChange(focus.key)}
                className={cn(actionClassName, selectedFocusKey === focus.key ? activeTabClassName : null)}
              >
                {focus.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-4">
          {qualityReport.focuses
            .filter((focus) => selectedFocusKey === "all" || focus.key === selectedFocusKey)
            .map((focus) => (
              <article key={focus.key} className={insetCardClassName}>
                <div className={eyebrowClassName}>{focus.label}</div>
                <div className="mt-3 text-2xl text-adminInk">{focus.sampleCount}</div>
                <div className="mt-2 text-sm text-adminInkSoft">
                  数据集 {focus.datasetCount} · case {focus.enabledCaseCount}/{focus.enabledCaseCount + focus.disabledCaseCount}
                </div>
                <div className="mt-2 text-sm text-adminInkSoft">
                  run {focus.runCount} · feedback {focus.linkedFeedbackCount}
                </div>
                <div className="mt-3 text-xs leading-6 text-adminInkMuted">{getFocusMetricLine(focus)}</div>
                <div className="mt-2 text-xs leading-6 text-adminAccent">{getFocusGapLine(focus)}</div>
                {focus.key === "topic_fission" && focus.reporting.topicFissionSceneBreakdown.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs leading-6 text-adminInkMuted">
                    {focus.reporting.topicFissionSceneBreakdown.map((item) => (
                      <div key={item.promptId}>
                        {item.label} · case {item.evaluatedCaseCount} · stable {item.stableCaseCount} · hit {item.stableHitRate != null ? `${(item.stableHitRate * 100).toFixed(1)}%` : "--"}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
        </div>
      </article>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <article className={panelClassName}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className={eyebrowClassName}>Case Queue</div>
              <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">标注队列</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                aria-label="选择 dataset"
                className={uiPrimitives.adminSelect}
                value={selectedQueue?.dataset.id ?? ""}
                onChange={(event) => handleDatasetChange(Number(event.target.value))}
              >
                {filteredQueues.map((item) => (
                  <option key={item.dataset.id} value={item.dataset.id}>
                    {item.dataset.name}
                  </option>
                ))}
              </select>
              <button type="button" className={actionClassName} disabled={!selectedQueue} onClick={() => handleNextUnlabeled()}>
                下一个未标注
              </button>
            </div>
          </div>
          {selectedQueue ? (
            <>
              <div className="mt-4 text-sm leading-7 text-adminInkSoft">
                {selectedQueue.dataset.code} · {selectedQueue.dataset.focus.label} · readiness {selectedQueue.dataset.readiness.status} · {getFocusMetricLine(selectedFocus)}
              </div>
              <div className="mt-2 text-sm leading-7 text-adminAccent">
                {getFocusGapLine(selectedFocus)}
              </div>
              <div className="mt-6 grid gap-3">
                {selectedQueue.cases.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-adminLineStrong bg-adminBg px-5 py-10 text-sm leading-7 text-adminInkSoft">
                    当前 dataset 还没有 case。可以先点上方“自动补样本”。
                  </div>
                ) : (
                  selectedQueue.cases.map((item) => {
                    const label = labelsByCaseId[item.id];
                    const isSelected = item.id === selectedCase?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedCaseId(item.id)}
                        className={cn(
                          mutedPanelClassName,
                          "text-left transition hover:border-adminAccent",
                          isSelected ? "border-adminAccent bg-adminSurfaceAlt" : null,
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-adminInkMuted">{item.taskCode}</div>
                          <div className={cn(
                            "rounded-full border px-3 py-1 text-xs",
                            label ? "border-emerald-500/40 text-emerald-300" : "border-adminLineStrong text-adminInkMuted",
                          )}>
                            {label ? "已标注" : "未标注"}
                          </div>
                        </div>
                        <div className="mt-3 text-lg text-adminInk text-balance">{item.topicTitle}</div>
                        <div className="mt-2 text-sm text-adminInkSoft">
                          {item.taskType} · {item.sourceType} · 难度 {item.difficultyLevel} · {item.isEnabled ? "enabled" : "disabled"}
                        </div>
                        <div className="mt-2 text-xs leading-6 text-adminInkMuted">
                          source {item.sourceLabel || item.sourceRef || "--"} · updated {formatDateTime(item.updatedAt)}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-adminLineStrong bg-adminBg px-5 py-10 text-sm leading-7 text-adminInkSoft">
              当前过滤条件下没有 plan17 dataset。
            </div>
          )}
        </article>

        <article className={panelClassName}>
          {selectedCase ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={eyebrowClassName}>Case Detail</div>
                  <h2 className="mt-4 font-serifCn text-3xl text-adminInk text-balance">{selectedCase.topicTitle}</h2>
                  <p className="mt-3 text-sm leading-7 text-adminInkSoft">
                    {selectedCase.taskCode} · {selectedCase.taskType} · {selectedCase.sourceType} · 最近更新 {formatDateTime(selectedCase.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {selectedCase.sourceUrl ? (
                    <a href={selectedCase.sourceUrl} target="_blank" rel="noreferrer" className={actionClassName}>打开来源</a>
                  ) : null}
                  <a href={`/api/admin/plan17/quality/labels?datasetId=${selectedCase.datasetId}`} target="_blank" rel="noreferrer" className={actionClassName}>
                    当前标签 JSON
                  </a>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2">
                <div className={insetCardClassName}>
                  <div className={eyebrowClassName}>输入上下文</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-adminInkSoft">
                    <p>readerProfile：{String(selectedInputPayload.readerProfile || "--")}</p>
                    <p>targetEmotion：{String(selectedInputPayload.targetEmotion || "--")}</p>
                    <p>languageGuidance：{String(selectedInputPayload.languageGuidance || "--")}</p>
                  </div>
                </div>
                <div className={insetCardClassName}>
                  <div className={eyebrowClassName}>固定约束</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-adminInkSoft">
                    <p>mustUseFacts：{getStringList(selectedExpectedConstraints.mustUseFacts).join("；") || "--"}</p>
                    <p>bannedPatterns：{getStringList(selectedExpectedConstraints.bannedPatterns).join("；") || "--"}</p>
                  </div>
                </div>
                <div className={insetCardClassName}>
                  <div className={eyebrowClassName}>爆款目标</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-adminInkSoft">
                    <p>titleGoal：{String(selectedViralTargets.titleGoal || "--")}</p>
                    <p>hookGoal：{String(selectedViralTargets.hookGoal || "--")}</p>
                    <p>shareTriggerGoal：{String(selectedViralTargets.shareTriggerGoal || "--")}</p>
                  </div>
                </div>
                <div className={insetCardClassName}>
                  <div className={eyebrowClassName}>参考样本</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-adminInkSoft">
                    <p>goodOutput：{selectedCase.referenceGoodOutput ? "已提供" : "无"}</p>
                    <p>badPatterns：{getStringList(selectedCase.referenceBadPatterns).join("；") || "--"}</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3">
                <div>
                  <div className={eyebrowClassName}>人工标注</div>
                  <p className="mt-3 text-sm leading-7 text-adminInkSoft">
                    strategy_strength 录人工分，evidence_hook 录期望/命中标签，其他桶可只写 notes。当前标签更新时间 {formatDateTime(selectedLabel?.updatedAt || null)}。
                  </p>
                </div>
                {selectedQueue?.dataset.focus.key === "strategy_strength" ? (
                  <label className="grid gap-2 text-sm text-adminInk">
                    <span>策略人工分</span>
                    <input
                      aria-label="策略人工分"
                      type="number"
                      min={1}
                      max={3}
                      step={1}
                      value={formState.strategyManualScore}
                      onChange={(event) => setFormState((current) => ({ ...current, strategyManualScore: event.target.value }))}
                      className={uiPrimitives.adminInput}
                      placeholder="1-3"
                    />
                  </label>
                ) : null}
                {selectedQueue?.dataset.focus.key === "evidence_hook" ? (
                  <>
                    <label className="grid gap-2 text-sm text-adminInk">
                      <span>期望标签</span>
                      <input
                        aria-label="期望标签"
                        value={formState.evidenceExpectedTags}
                        onChange={(event) => setFormState((current) => ({ ...current, evidenceExpectedTags: event.target.value }))}
                        className={uiPrimitives.adminInput}
                        placeholder="反常识，具身细节，身份标签，情绪造句"
                      />
                    </label>
                    <label className="grid gap-2 text-sm text-adminInk">
                      <span>命中标签</span>
                      <input
                        aria-label="命中标签"
                        value={formState.evidenceDetectedTags}
                        onChange={(event) => setFormState((current) => ({ ...current, evidenceDetectedTags: event.target.value }))}
                        className={uiPrimitives.adminInput}
                        placeholder="反常识，具身细节"
                      />
                    </label>
                  </>
                ) : null}
                <label className="grid gap-2 text-sm text-adminInk">
                  <span>备注</span>
                  <textarea
                    aria-label="备注"
                    value={formState.notes}
                    onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                    className={cn("min-h-[120px]", uiPrimitives.adminInput)}
                    placeholder="记录样本上下文、为什么这样判、或待补数据。"
                  />
                </label>
                {feedback ? <div className="text-sm text-emerald-300">{feedback}</div> : null}
                {error ? <div className="text-sm text-cinnabar">{error}</div> : null}
                <div className="flex flex-wrap gap-3">
                  <button type="button" className={uiPrimitives.primaryButton} disabled={isSaving} onClick={() => handleSave()}>
                    {isSaving ? "保存中..." : "保存标注"}
                  </button>
                  <button type="button" className={actionClassName} disabled={!selectedLabel} onClick={() => setFormState(buildFormState(selectedLabel))}>
                    重置表单
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-adminLineStrong bg-adminBg px-5 py-10 text-sm leading-7 text-adminInkSoft">
              当前没有可标注的 case。
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
