"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";

type DatasetItem = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sampleCount: number;
  createdAt: string;
  updatedAt: string;
  readiness: {
    status: "ready" | "warning" | "blocked";
    enabledCaseCount: number;
    totalCaseCount: number;
    coverage: {
      readerProfile: number;
      targetEmotion: number;
      sourceFacts: number;
      knowledgeCards: number;
      historyReferences: number;
      titleGoal: number;
      hookGoal: number;
      shareTriggerGoal: number;
    };
    qualityTargets: {
      distinctTaskTypeCount: number;
      lightCount: number;
      mediumCount: number;
      hardCount: number;
      referenceGoodOutputCount: number;
      referenceBadPatternsCount: number;
      mustUseFactsCount: number;
    };
    blockers: string[];
    warnings: string[];
  };
};

type CaseItem = {
  id: number;
  datasetId: number;
  taskCode: string;
  taskType: string;
  topicTitle: string;
  inputPayload: Record<string, unknown>;
  expectedConstraints: Record<string, unknown>;
  viralTargets: Record<string, unknown>;
  stageArtifactPayloads: Record<string, unknown>;
  referenceGoodOutput: string | null;
  referenceBadPatterns: unknown[];
  difficultyLevel: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label}必须是 JSON 对象`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `${label}格式错误`);
  }
}

function parseJsonArray(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`${label}必须是 JSON 数组`);
    }
    return parsed;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `${label}格式错误`);
  }
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getArrayLength(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function buildCaseCoverage(caseItem: CaseItem) {
  const inputPayload = caseItem.inputPayload || {};
  const viralTargets = caseItem.viralTargets || {};
  return {
    readerProfile: Boolean(getTrimmedString(inputPayload.readerProfile)),
    targetEmotion: Boolean(getTrimmedString(inputPayload.targetEmotion)),
    sourceFacts: getArrayLength(inputPayload.sourceFacts) > 0,
    knowledgeCards: getArrayLength(inputPayload.knowledgeCards) > 0,
    historyReferences: getArrayLength(inputPayload.historyReferences) > 0,
    titleGoal: Boolean(getTrimmedString(viralTargets.titleGoal)),
    hookGoal: Boolean(getTrimmedString(viralTargets.hookGoal)),
    shareTriggerGoal: Boolean(getTrimmedString(viralTargets.shareTriggerGoal)),
  };
}

function getDatasetReadinessMeta(readiness: DatasetItem["readiness"] | null | undefined) {
  if (!readiness) {
    return {
      label: "unknown",
      tone: "border-stone-700 text-stone-400",
      summary: "还没有 readiness 数据。",
    };
  }
  if (readiness.status === "ready") {
    return {
      label: "ready",
      tone: "border-emerald-500/40 text-emerald-300",
      summary: `启用样本 ${readiness.enabledCaseCount} 条，题型与质量目标已达自动实验基线。`,
    };
  }
  if (readiness.status === "warning") {
    return {
      label: "warning",
      tone: "border-amber-400/40 text-amber-200",
      summary: readiness.warnings[0] || "当前仍有覆盖告警。",
    };
  }
  return {
    label: "blocked",
    tone: "border-cinnabar/40 text-cinnabar",
    summary: readiness.blockers[0] || "当前未达到自动实验最低门槛。",
  };
}

export function OpsWritingEvalDatasetsClient({
  initialDatasets,
  initialCases,
  initialSelectedDatasetId,
  initialSelectedCaseId,
  focusDataset,
  focusCase,
}: {
  initialDatasets: DatasetItem[];
  initialCases: CaseItem[];
  initialSelectedDatasetId?: number | null;
  initialSelectedCaseId?: number | null;
  focusDataset?: {
    datasetId: number;
    matchedCount: number;
    clearHref: string;
  } | null;
  focusCase?: {
    caseId: number;
    matchedCount: number;
    clearHref: string;
  } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [datasets, setDatasets] = useState(initialDatasets);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(initialSelectedDatasetId ?? initialDatasets[0]?.id ?? null);
  const [cases, setCases] = useState(initialCases);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(initialSelectedCaseId ?? initialCases[0]?.id ?? null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [datasetForm, setDatasetForm] = useState({
    code: "",
    name: "",
    description: "",
    status: "draft",
  });
  const [datasetEditorForm, setDatasetEditorForm] = useState({
    code: "",
    name: "",
    description: "",
    status: "draft",
  });
  const [caseForm, setCaseForm] = useState({
    taskCode: "",
    taskType: "tech_commentary",
    topicTitle: "",
    difficultyLevel: "medium",
    inputPayload: stringifyJson({
      readerProfile: "关心 AI 和商业变化的公众号读者",
      languageGuidance: "短句、克制、反机器腔",
      targetEmotion: "被说服并愿意转发",
    }),
    expectedConstraints: stringifyJson({
      mustUseFacts: [],
      bannedPatterns: [],
    }),
    viralTargets: stringifyJson({
      titleGoal: "标题要有明确冲突和读者收益",
      hookGoal: "开头三句内建立问题压强",
      shareTriggerGoal: "至少产出一个值得转发的判断句",
    }),
    stageArtifactPayloads: stringifyJson({
      deepWriting: {},
    }),
    referenceGoodOutput: "",
    referenceBadPatterns: stringifyJson(["空泛判断", "标题党", "前文很强后文掉速"]),
  });
  const [editorForm, setEditorForm] = useState({
    taskCode: "",
    taskType: "",
    topicTitle: "",
    difficultyLevel: "medium",
    inputPayload: "{}",
    expectedConstraints: "{}",
    viralTargets: "{}",
    stageArtifactPayloads: "{}",
    referenceGoodOutput: "",
    referenceBadPatterns: "[]",
    isEnabled: true,
  });

  const selectedDataset = datasets.find((item) => item.id === selectedDatasetId) ?? null;
  const selectedCase = cases.find((item) => item.id === selectedCaseId) ?? null;
  const selectedDatasetReadinessMeta = getDatasetReadinessMeta(selectedDataset?.readiness);
  const difficultyCounts = cases.reduce<Record<string, number>>((acc, item) => {
    acc[item.difficultyLevel] = (acc[item.difficultyLevel] ?? 0) + 1;
    return acc;
  }, {});
  const coverageSummary = cases.reduce(
    (acc, item) => {
      const coverage = buildCaseCoverage(item);
      Object.entries(coverage).forEach(([key, value]) => {
        if (value) {
          acc[key as keyof typeof coverage] += 1;
        }
      });
      return acc;
    },
    {
      readerProfile: 0,
      targetEmotion: 0,
      sourceFacts: 0,
      knowledgeCards: 0,
      historyReferences: 0,
      titleGoal: 0,
      hookGoal: 0,
      shareTriggerGoal: 0,
    },
  );
  const selectedCaseCoverage = selectedCase ? buildCaseCoverage(selectedCase) : null;
  const selectedCaseMissingFields = selectedCaseCoverage
    ? [
        selectedCaseCoverage.readerProfile ? null : "readerProfile",
        selectedCaseCoverage.targetEmotion ? null : "targetEmotion",
        selectedCaseCoverage.sourceFacts ? null : "sourceFacts",
        selectedCaseCoverage.knowledgeCards ? null : "knowledgeCards",
        selectedCaseCoverage.historyReferences ? null : "historyReferences",
        selectedCaseCoverage.titleGoal ? null : "titleGoal",
        selectedCaseCoverage.hookGoal ? null : "hookGoal",
        selectedCaseCoverage.shareTriggerGoal ? null : "shareTriggerGoal",
      ].filter(Boolean)
    : [];

  function replaceDatasetsUrl(nextDatasetId: number | null, nextCaseId?: number | null) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (nextDatasetId && nextDatasetId > 0) {
      params.set("datasetId", String(nextDatasetId));
    } else {
      params.delete("datasetId");
    }
    if (nextCaseId && nextCaseId > 0) {
      params.set("caseId", String(nextCaseId));
    } else {
      params.delete("caseId");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    replaceDatasetsUrl(selectedDatasetId, selectedCaseId);
  }, [pathname, selectedDatasetId, selectedCaseId]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setCases([]);
      setSelectedCaseId(null);
      return;
    }
    let cancelled = false;
    async function loadCases() {
      setLoadingCases(true);
      const response = await fetch(`/api/ops/writing-eval/datasets/${selectedDatasetId}/cases`);
      const json = await response.json().catch(() => ({}));
      if (cancelled) return;
      setLoadingCases(false);
      if (!response.ok || !json.success) {
        setMessage(json.error || "加载评测样本失败");
        return;
      }
      const nextCases = json.data as CaseItem[];
      setCases(nextCases);
      setSelectedCaseId((previous) => (previous && nextCases.some((item) => item.id === previous) ? previous : nextCases[0]?.id ?? null));
    }
    void loadCases();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  useEffect(() => {
    if (!selectedDataset) {
      setDatasetEditorForm({
        code: "",
        name: "",
        description: "",
        status: "draft",
      });
      return;
    }
    setDatasetEditorForm({
      code: selectedDataset.code,
      name: selectedDataset.name,
      description: selectedDataset.description || "",
      status: selectedDataset.status,
    });
  }, [selectedDataset]);

  useEffect(() => {
    if (!selectedCase) {
      setEditorForm({
        taskCode: "",
        taskType: "",
        topicTitle: "",
        difficultyLevel: "medium",
        inputPayload: "{}",
        expectedConstraints: "{}",
        viralTargets: "{}",
        stageArtifactPayloads: "{}",
        referenceGoodOutput: "",
        referenceBadPatterns: "[]",
        isEnabled: true,
      });
      return;
    }
    setEditorForm({
      taskCode: selectedCase.taskCode,
      taskType: selectedCase.taskType,
      topicTitle: selectedCase.topicTitle,
      difficultyLevel: selectedCase.difficultyLevel,
      inputPayload: stringifyJson(selectedCase.inputPayload),
      expectedConstraints: stringifyJson(selectedCase.expectedConstraints),
      viralTargets: stringifyJson(selectedCase.viralTargets),
      stageArtifactPayloads: stringifyJson(selectedCase.stageArtifactPayloads),
      referenceGoodOutput: selectedCase.referenceGoodOutput || "",
      referenceBadPatterns: stringifyJson(selectedCase.referenceBadPatterns),
      isEnabled: selectedCase.isEnabled,
    });
  }, [selectedCase]);

  async function handleCreateDataset(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/ops/writing-eval/datasets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datasetForm),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "创建评测集失败");
      return;
    }
    const created = json.data as DatasetItem;
    setDatasets((prev) => [created, ...prev]);
    setSelectedDatasetId(created.id);
    setSelectedCaseId(null);
    setDatasetForm({
      code: "",
      name: "",
      description: "",
      status: "draft",
    });
    setMessage(`已创建评测集 ${created.code}`);
    startTransition(() => router.refresh());
  }

  async function handleCreateCase(event: FormEvent) {
    event.preventDefault();
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    setMessage("");
    let inputPayload: Record<string, unknown>;
    let expectedConstraints: Record<string, unknown>;
    let viralTargets: Record<string, unknown>;
    let stageArtifactPayloads: Record<string, unknown>;
    let referenceBadPatterns: unknown[];
    try {
      inputPayload = parseJsonObject(caseForm.inputPayload, "输入上下文");
      expectedConstraints = parseJsonObject(caseForm.expectedConstraints, "固定约束");
      viralTargets = parseJsonObject(caseForm.viralTargets, "爆款目标");
      stageArtifactPayloads = parseJsonObject(caseForm.stageArtifactPayloads, "阶段产物 payloads");
      referenceBadPatterns = parseJsonArray(caseForm.referenceBadPatterns, "反例模式");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "样本内容格式错误");
      return;
    }
    const response = await fetch(`/api/ops/writing-eval/datasets/${selectedDatasetId}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskCode: caseForm.taskCode,
        taskType: caseForm.taskType,
        topicTitle: caseForm.topicTitle,
        difficultyLevel: caseForm.difficultyLevel,
        inputPayload,
        expectedConstraints,
        viralTargets,
        stageArtifactPayloads,
        referenceGoodOutput: caseForm.referenceGoodOutput,
        referenceBadPatterns,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "创建评测样本失败");
      return;
    }
    const created = json.data as CaseItem;
    setCases((prev) => [created, ...prev]);
    setSelectedCaseId(created.id);
    setDatasets((prev) => prev.map((item) => (item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + 1 } : item)));
    setCaseForm((prev) => ({
      ...prev,
      taskCode: "",
      topicTitle: "",
      stageArtifactPayloads: stringifyJson({
        deepWriting: {},
      }),
      referenceGoodOutput: "",
    }));
    setMessage(`已创建样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function handleSaveDataset(event: FormEvent) {
    event.preventDefault();
    if (!selectedDataset) {
      setMessage("请先选择一个评测集");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/datasets/${selectedDataset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datasetEditorForm),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "更新评测集失败");
      return;
    }
    const updated = json.data as DatasetItem;
    setDatasets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setMessage(`已更新评测集 ${updated.code}`);
    startTransition(() => router.refresh());
  }

  async function handleSaveCase(event: FormEvent) {
    event.preventDefault();
    if (!selectedCase) {
      setMessage("请先选择一个样本");
      return;
    }
    setMessage("");
    let inputPayload: Record<string, unknown>;
    let expectedConstraints: Record<string, unknown>;
    let viralTargets: Record<string, unknown>;
    let stageArtifactPayloads: Record<string, unknown>;
    let referenceBadPatterns: unknown[];
    try {
      inputPayload = parseJsonObject(editorForm.inputPayload, "输入上下文");
      expectedConstraints = parseJsonObject(editorForm.expectedConstraints, "固定约束");
      viralTargets = parseJsonObject(editorForm.viralTargets, "爆款目标");
      stageArtifactPayloads = parseJsonObject(editorForm.stageArtifactPayloads, "阶段产物 payloads");
      referenceBadPatterns = parseJsonArray(editorForm.referenceBadPatterns, "反例模式");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "样本内容格式错误");
      return;
    }
    const response = await fetch(`/api/ops/writing-eval/cases/${selectedCase.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskCode: editorForm.taskCode,
        taskType: editorForm.taskType,
        topicTitle: editorForm.topicTitle,
        difficultyLevel: editorForm.difficultyLevel,
        inputPayload,
        expectedConstraints,
        viralTargets,
        stageArtifactPayloads,
        referenceGoodOutput: editorForm.referenceGoodOutput,
        referenceBadPatterns,
        isEnabled: editorForm.isEnabled,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "更新评测样本失败");
      return;
    }
    const updated = json.data as CaseItem;
    setCases((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setMessage(`已更新样本 ${updated.taskCode}`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <section className={uiPrimitives.opsPanel + " p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval Datasets</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100">评测集与样本管理</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
              这里单独管理固定评测集、样本难度分布和样本编辑器，避免运行页同时承担实验编排与样本维护两种职责。
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/ops/writing-eval" className={uiPrimitives.opsSecondaryButton}>
              Overview
            </Link>
            <Link href="/ops/writing-eval/runs" className={uiPrimitives.opsSecondaryButton}>
              Runs
            </Link>
            <Link href="/ops/writing-eval/versions" className={uiPrimitives.opsSecondaryButton}>
              Versions
            </Link>
            <Link href="/ops/writing-eval/insights" className={uiPrimitives.opsSecondaryButton}>
              Insights
            </Link>
          </div>
        </div>
      </section>

      {focusDataset || focusCase ? (
        <section className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-3">
              {focusDataset ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">数据集聚焦模式</div>
                  <div className="mt-2 text-sm leading-7 text-stone-200">
                    当前通过深链聚焦 dataset #{focusDataset.datasetId}，匹配 {focusDataset.matchedCount} 条。
                  </div>
                </div>
              ) : null}
              {focusCase ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">样本聚焦模式</div>
                  <div className="mt-2 text-sm leading-7 text-stone-200">
                    当前通过深链聚焦 case #{focusCase.caseId}，匹配 {focusCase.matchedCount} 条。
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {focusCase ? (
                <Link href={focusCase.clearHref} className={uiPrimitives.opsSecondaryButton}>
                  返回数据集视图
                </Link>
              ) : null}
              <Link href="/ops/writing-eval/datasets" className={uiPrimitives.opsSecondaryButton}>
                返回全量数据集
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={handleCreateDataset} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建评测集</div>
          <input value={datasetForm.code} onChange={(event) => setDatasetForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="编码，例如 viral-mvp-v1" className={uiPrimitives.opsInput} />
          <input value={datasetForm.name} onChange={(event) => setDatasetForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" className={uiPrimitives.opsInput} />
          <textarea value={datasetForm.description} onChange={(event) => setDatasetForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明" className={`min-h-[120px] ${uiPrimitives.opsInput}`} />
          <select value={datasetForm.status} onChange={(event) => setDatasetForm((prev) => ({ ...prev, status: event.target.value }))} className={uiPrimitives.opsSelect}>
            <option value="draft">draft</option>
            <option value="active">active</option>
            <option value="archived">archived</option>
          </select>
          <button className={uiPrimitives.primaryButton}>创建评测集</button>
        </form>

        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">数据集列表</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">当前评测集</h2>
            </div>
            <div className="text-sm text-stone-500">{datasets.length} 个数据集</div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {datasets.map((dataset) => {
              const readinessMeta = getDatasetReadinessMeta(dataset.readiness);
              return (
                <button
                  key={dataset.id}
                  type="button"
                  onClick={() => {
                    setSelectedDatasetId(dataset.id);
                    setSelectedCaseId(null);
                  }}
                  className={`border px-4 py-4 text-left ${selectedDatasetId === dataset.id ? "border-cinnabar bg-[#1d1413]" : "border-stone-800 bg-stone-950"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{dataset.code}</div>
                      <div className="mt-2 text-lg text-stone-100">{dataset.name}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs text-stone-500">{dataset.status}</div>
                      <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${readinessMeta.tone}`}>{readinessMeta.label}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-stone-400">{dataset.description || "暂无说明"}</div>
                  <div className="mt-4 text-xs text-stone-500">
                    样本数 {dataset.sampleCount} · 更新于 {new Date(dataset.updatedAt).toLocaleString("zh-CN")}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-stone-500">{readinessMeta.summary}</div>
                </button>
              );
            })}
            {datasets.length === 0 ? <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">还没有评测集。</div> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div className={uiPrimitives.opsPanel + " p-5"}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">数据集详情</div>
                <h2 className="mt-3 font-serifCn text-2xl text-stone-100">{selectedDataset?.name || "选择一个评测集"}</h2>
              </div>
              <div className="text-sm text-stone-500">{loadingCases ? "加载样本中..." : `${cases.length} 条样本`}</div>
            </div>

            {selectedDataset ? (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">编码</div>
                    <div className="mt-3 text-stone-100">{selectedDataset.code}</div>
                  </div>
                  <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">状态</div>
                    <div className="mt-3 text-stone-100">{selectedDataset.status}</div>
                  </div>
                  <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">启用样本</div>
                    <div className="mt-3 text-stone-100">{cases.filter((item) => item.isEnabled).length}</div>
                  </div>
                  <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近更新</div>
                    <div className="mt-3 text-sm text-stone-100">{new Date(selectedDataset.updatedAt).toLocaleString("zh-CN")}</div>
                  </div>
                </div>

                <div className="mt-5 border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">执行就绪度</div>
                      <div className="mt-2 text-sm text-stone-400">这里直接反映 Runs / Schedules 页的自动实验守卫结果。</div>
                    </div>
                    <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${selectedDatasetReadinessMeta.tone}`}>
                      {selectedDatasetReadinessMeta.label}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-stone-400">
                    启用样本 {selectedDataset.readiness.enabledCaseCount}/{selectedDataset.readiness.totalCaseCount} ·
                    标题目标 {selectedDataset.readiness.coverage.titleGoal} · 开头目标 {selectedDataset.readiness.coverage.hookGoal} ·
                    传播目标 {selectedDataset.readiness.coverage.shareTriggerGoal} · 事实素材 {selectedDataset.readiness.coverage.sourceFacts}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-stone-500">
                    题型 {selectedDataset.readiness.qualityTargets.distinctTaskTypeCount}/4 ·
                    light {selectedDataset.readiness.qualityTargets.lightCount} ·
                    medium {selectedDataset.readiness.qualityTargets.mediumCount} ·
                    hard {selectedDataset.readiness.qualityTargets.hardCount} ·
                    好稿 {selectedDataset.readiness.qualityTargets.referenceGoodOutputCount} ·
                    反例 {selectedDataset.readiness.qualityTargets.referenceBadPatternsCount} ·
                    mustUseFacts {selectedDataset.readiness.qualityTargets.mustUseFactsCount}
                  </div>
                  {selectedDataset.readiness.blockers.length > 0 ? (
                    <div className="mt-2 text-xs leading-6 text-cinnabar">阻断项：{selectedDataset.readiness.blockers.join("；")}</div>
                  ) : null}
                  {selectedDataset.readiness.warnings.length > 0 ? (
                    <div className="mt-2 text-xs leading-6 text-amber-200">告警：{selectedDataset.readiness.warnings.join("；")}</div>
                  ) : null}
                </div>

                <div className="mt-5">
                  <Link href={`/ops/writing-eval/runs?datasetId=${selectedDataset.id}`} className={uiPrimitives.opsSecondaryButton}>
                    用当前评测集发起实验
                  </Link>
                </div>

                <div className="mt-5 border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">难度分布</div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    {Object.keys(difficultyCounts).length > 0 ? (
                      Object.entries(difficultyCounts).map(([level, count]) => (
                        <div key={level} className="border border-stone-700 px-3 py-2 text-stone-300">
                          {level} · {count}
                        </div>
                      ))
                    ) : (
                      <div className="text-stone-500">当前还没有样本。</div>
                    )}
                  </div>
                </div>

                <div className="mt-5 border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">样本覆盖度</div>
                      <div className="mt-2 text-sm text-stone-400">对齐方案要求，优先补齐标题目标、开头目标、传播目标和事实素材上下文。</div>
                    </div>
                    <div className="text-xs text-stone-500">{cases.length} 条样本</div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "标题目标", value: coverageSummary.titleGoal },
                      { label: "开头目标", value: coverageSummary.hookGoal },
                      { label: "传播目标", value: coverageSummary.shareTriggerGoal },
                      { label: "读者画像", value: coverageSummary.readerProfile },
                      { label: "目标情绪", value: coverageSummary.targetEmotion },
                      { label: "事实素材", value: coverageSummary.sourceFacts },
                      { label: "知识卡", value: coverageSummary.knowledgeCards },
                      { label: "历史参考", value: coverageSummary.historyReferences },
                    ].map((item) => (
                      <div key={item.label} className="border border-stone-700 bg-[#141414] px-4 py-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-stone-500">{item.label}</div>
                        <div className="mt-3 text-lg text-stone-100">
                          {item.value}/{cases.length}
                        </div>
                        <div className="mt-2 text-xs text-stone-500">
                          {cases.length === 0 ? "暂无样本" : `${Math.round((item.value / cases.length) * 100)}% 覆盖`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-5 border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">先创建或选择一个评测集。</div>
            )}
          </div>

          <form onSubmit={handleSaveDataset} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">数据集编辑器</div>
            {selectedDataset ? (
              <>
                <input value={datasetEditorForm.code} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, code: event.target.value }))} className={uiPrimitives.opsInput} />
                <input value={datasetEditorForm.name} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, name: event.target.value }))} className={uiPrimitives.opsInput} />
                <textarea value={datasetEditorForm.description} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, description: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} />
                <select value={datasetEditorForm.status} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, status: event.target.value }))} className={uiPrimitives.opsSelect}>
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
                <button className={uiPrimitives.primaryButton}>保存评测集</button>
              </>
            ) : (
              <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">先从上方列表选择一个评测集。</div>
            )}
          </form>

          <div className={uiPrimitives.opsPanel + " p-5"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">评测样本</div>
                <h2 className="mt-3 font-serifCn text-2xl text-stone-100">样本表格</h2>
              </div>
              <div className="text-sm text-stone-500">{cases.length} 条记录</div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="text-stone-500">
                  <tr>
                    {["样本", "类型", "标题", "难度", "启用", "参考好稿", "更新时间"].map((head) => (
                      <th key={head} className="pb-4 font-medium">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => (
                    <tr
                      key={item.id}
                      className={`cursor-pointer border-t border-stone-800 ${selectedCaseId === item.id ? "bg-[#1d1413]" : ""}`}
                      onClick={() => setSelectedCaseId(item.id)}
                    >
                      <td className="py-4 font-mono text-xs text-stone-300">{item.taskCode}</td>
                      <td className="py-4 text-stone-400">{item.taskType}</td>
                      <td className="py-4 text-stone-100">{item.topicTitle}</td>
                      <td className="py-4 text-stone-400">{item.difficultyLevel}</td>
                      <td className="py-4 text-stone-400">{item.isEnabled ? "enabled" : "disabled"}</td>
                      <td className="py-4 text-stone-400">{item.referenceGoodOutput ? "有" : "无"}</td>
                      <td className="py-4 text-stone-400">{new Date(item.updatedAt).toLocaleString("zh-CN")}</td>
                    </tr>
                  ))}
                  {cases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-stone-500">
                        当前评测集还没有样本。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <form onSubmit={handleCreateCase} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建样本</div>
            <input value={caseForm.taskCode} onChange={(event) => setCaseForm((prev) => ({ ...prev, taskCode: event.target.value }))} placeholder="taskCode" className={uiPrimitives.opsInput} />
            <input value={caseForm.topicTitle} onChange={(event) => setCaseForm((prev) => ({ ...prev, topicTitle: event.target.value }))} placeholder="topicTitle" className={uiPrimitives.opsInput} />
            <select value={caseForm.taskType} onChange={(event) => setCaseForm((prev) => ({ ...prev, taskType: event.target.value }))} className={uiPrimitives.opsSelect}>
              <option value="tech_commentary">tech_commentary</option>
              <option value="business_breakdown">business_breakdown</option>
              <option value="experience_recap">experience_recap</option>
              <option value="series_observation">series_observation</option>
            </select>
            <select value={caseForm.difficultyLevel} onChange={(event) => setCaseForm((prev) => ({ ...prev, difficultyLevel: event.target.value }))} className={uiPrimitives.opsSelect}>
              <option value="light">light</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
            <textarea value={caseForm.inputPayload} onChange={(event) => setCaseForm((prev) => ({ ...prev, inputPayload: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} placeholder="输入上下文 JSON" />
            <textarea value={caseForm.expectedConstraints} onChange={(event) => setCaseForm((prev) => ({ ...prev, expectedConstraints: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} placeholder="固定约束 JSON" />
            <textarea value={caseForm.viralTargets} onChange={(event) => setCaseForm((prev) => ({ ...prev, viralTargets: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} placeholder="爆款目标 JSON" />
            <textarea value={caseForm.stageArtifactPayloads} onChange={(event) => setCaseForm((prev) => ({ ...prev, stageArtifactPayloads: event.target.value }))} className={`min-h-[150px] ${uiPrimitives.opsInput}`} placeholder="阶段产物 payloads JSON，可选。例：{&quot;deepWriting&quot;:{...}}" />
            <textarea value={caseForm.referenceBadPatterns} onChange={(event) => setCaseForm((prev) => ({ ...prev, referenceBadPatterns: event.target.value }))} className={`min-h-[90px] ${uiPrimitives.opsInput}`} placeholder="反例模式 JSON 数组" />
            <textarea value={caseForm.referenceGoodOutput} onChange={(event) => setCaseForm((prev) => ({ ...prev, referenceGoodOutput: event.target.value }))} className={`min-h-[90px] ${uiPrimitives.opsInput}`} placeholder="参考好稿，可选" />
            <button className={uiPrimitives.primaryButton}>创建样本</button>
          </form>

          <form onSubmit={handleSaveCase} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">样本编辑器</div>
                <h2 className="mt-3 font-serifCn text-2xl text-stone-100">{selectedCase ? selectedCase.taskCode : "选择样本后编辑"}</h2>
              </div>
              <div className="flex items-center gap-3">
                {selectedDataset ? (
                  <Link href={`/ops/writing-eval/runs?datasetId=${selectedDataset.id}`} className={uiPrimitives.opsSecondaryButton}>
                    去 Runs 发起实验
                  </Link>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-stone-400">
                  <input type="checkbox" checked={editorForm.isEnabled} onChange={(event) => setEditorForm((prev) => ({ ...prev, isEnabled: event.target.checked }))} />
                  启用
                </label>
              </div>
            </div>
            {selectedCase ? (
              <>
                <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">样本完备度</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { label: "readerProfile", passed: selectedCaseCoverage?.readerProfile },
                      { label: "targetEmotion", passed: selectedCaseCoverage?.targetEmotion },
                      { label: "sourceFacts", passed: selectedCaseCoverage?.sourceFacts },
                      { label: "knowledgeCards", passed: selectedCaseCoverage?.knowledgeCards },
                      { label: "historyReferences", passed: selectedCaseCoverage?.historyReferences },
                      { label: "titleGoal", passed: selectedCaseCoverage?.titleGoal },
                      { label: "hookGoal", passed: selectedCaseCoverage?.hookGoal },
                      { label: "shareTriggerGoal", passed: selectedCaseCoverage?.shareTriggerGoal },
                    ].map((item) => (
                      <span
                        key={item.label}
                        className={`border px-3 py-1 ${item.passed ? "border-emerald-500/40 text-emerald-300" : "border-cinnabar/40 text-cinnabar"}`}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 text-xs leading-6 text-stone-500">
                    {selectedCaseMissingFields.length > 0
                      ? `当前缺项：${selectedCaseMissingFields.join("、")}。补齐这些字段后，再去 Runs 做离线实验更稳定。`
                      : "当前样本已补齐基础输入、爆款目标和事实上下文字段，可以直接参与离线实验。"}
                  </div>
                </div>
                <input value={editorForm.taskCode} onChange={(event) => setEditorForm((prev) => ({ ...prev, taskCode: event.target.value }))} className={uiPrimitives.opsInput} />
                <input value={editorForm.topicTitle} onChange={(event) => setEditorForm((prev) => ({ ...prev, topicTitle: event.target.value }))} className={uiPrimitives.opsInput} />
                <select value={editorForm.taskType} onChange={(event) => setEditorForm((prev) => ({ ...prev, taskType: event.target.value }))} className={uiPrimitives.opsSelect}>
                  <option value="tech_commentary">tech_commentary</option>
                  <option value="business_breakdown">business_breakdown</option>
                  <option value="experience_recap">experience_recap</option>
                  <option value="series_observation">series_observation</option>
                </select>
                <select value={editorForm.difficultyLevel} onChange={(event) => setEditorForm((prev) => ({ ...prev, difficultyLevel: event.target.value }))} className={uiPrimitives.opsSelect}>
                  <option value="light">light</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
                <textarea value={editorForm.inputPayload} onChange={(event) => setEditorForm((prev) => ({ ...prev, inputPayload: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} />
                <textarea value={editorForm.expectedConstraints} onChange={(event) => setEditorForm((prev) => ({ ...prev, expectedConstraints: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} />
                <textarea value={editorForm.viralTargets} onChange={(event) => setEditorForm((prev) => ({ ...prev, viralTargets: event.target.value }))} className={`min-h-[110px] ${uiPrimitives.opsInput}`} />
                <textarea value={editorForm.stageArtifactPayloads} onChange={(event) => setEditorForm((prev) => ({ ...prev, stageArtifactPayloads: event.target.value }))} className={`min-h-[150px] ${uiPrimitives.opsInput}`} />
                <textarea value={editorForm.referenceBadPatterns} onChange={(event) => setEditorForm((prev) => ({ ...prev, referenceBadPatterns: event.target.value }))} className={`min-h-[90px] ${uiPrimitives.opsInput}`} />
                <textarea value={editorForm.referenceGoodOutput} onChange={(event) => setEditorForm((prev) => ({ ...prev, referenceGoodOutput: event.target.value }))} className={`min-h-[90px] ${uiPrimitives.opsInput}`} />
                <button className={uiPrimitives.primaryButton}>保存样本</button>
              </>
            ) : (
              <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">先从左侧表格选择一个样本。</div>
            )}
          </form>
        </div>
      </section>

      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
