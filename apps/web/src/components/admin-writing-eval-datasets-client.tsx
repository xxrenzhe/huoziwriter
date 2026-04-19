"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn, surfaceCardStyles, uiPrimitives } from "@huoziwriter/ui";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import { buildAdminWritingEvalRunsHref, getAdminWritingEvalHref } from "@/lib/admin-writing-eval-links";
import { formatWritingEvalDateTime } from "@/lib/writing-eval-format";
import { getWritingEvalReadinessMeta as getDatasetReadinessMeta } from "@/lib/writing-eval-view";

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
  createdAt: string;
  updatedAt: string;
};

type ArticleImportOption = {
  id: number;
  title: string;
  status: string;
  seriesName: string | null;
  updatedAt: string;
  hasMarkdown: boolean;
  stageCodes: string[];
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  alreadyImportedDatasetIds: number[];
};

type KnowledgeCardImportOption = {
  id: number;
  title: string;
  cardType: string;
  status: string;
  ownerUsername: string | null;
  updatedAt: string;
  confidenceScore: number;
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  openQuestionCount: number;
  conflictFlagCount: number;
  alreadyImportedDatasetIds: number[];
};

type TopicImportOption = {
  id: number;
  title: string;
  sourceName: string;
  sourceType: string;
  sourcePriority: number | null;
  publishedAt: string | null;
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  emotionLabelCount: number;
  angleOptionCount: number;
  alreadyImportedDatasetIds: number[];
};

type FragmentImportOption = {
  id: number;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  alreadyImportedDatasetIds: number[];
};

type ImportRecommendationItem = {
  sourceType: "article" | "knowledge_card" | "topic_item" | "fragment";
  sourceId: number;
  title: string;
  subtitle: string | null;
  suggestedTaskType: string;
  suggestedDifficultyLevel: string;
  sourceFactCount: number;
  knowledgeCardCount: number;
  historyReferenceCount: number;
  referenceGoodOutput: boolean;
  reasonTags: string[];
  score: number;
};

type ImportRecommendationPayload = {
  datasetId: number;
  targetSummary: string[];
  recommendations: ImportRecommendationItem[];
};

type AutoFillAuditLogItem = {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

const DATASET_STATUS_OPTIONS = ["draft", "active", "archived"] as const;
const TASK_TYPE_OPTIONS = ["tech_commentary", "business_breakdown", "experience_recap", "series_observation"] as const;
const DIFFICULTY_LEVEL_OPTIONS = ["light", "medium", "hard"] as const;

const adminPanelBaseClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-paperStrong text-ink shadow-none",
);
const adminHeroPanelClassName = cn(adminPanelBaseClassName, "p-6");
const adminSectionPanelClassName = cn(adminPanelBaseClassName, "p-5");
const adminFormPanelClassName = cn(adminPanelBaseClassName, "space-y-3 p-5");
const adminStackPanelClassName = cn(adminPanelBaseClassName, "space-y-4 p-5");
const adminInsetCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface p-4 text-ink shadow-none",
);
const adminListCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-3 py-3 text-ink shadow-none",
);
const adminMetricCardClassName = cn(adminInsetCardClassName, "px-4 py-4");
const adminCoverageCardClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surfaceWarm px-4 py-4 text-ink shadow-none",
);
const adminTableDesktopShellClassName = "mt-5 hidden overflow-x-auto md:block";
const adminTableMobileListClassName = "mt-5 grid gap-3 md:hidden";
const adminEmptyStateClassName = cn(
  surfaceCardStyles(),
  "border-dashed border-lineStrong bg-surface px-4 py-6 text-sm text-inkMuted shadow-none",
);
const adminChipClassName = cn(
  surfaceCardStyles(),
  "border-lineStrong bg-surface px-2 py-1 text-xs text-inkSoft shadow-none",
);
const adminDarkChipClassName = cn(adminChipClassName, "bg-surfaceWarm");
const adminReasonChipClassName = cn(adminChipClassName, "border-lineStrong bg-surfaceWarm text-inkSoft");
const adminEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-inkMuted";
const adminAccentEyebrowClassName = "text-xs uppercase tracking-[0.28em] text-cinnabar";
const adminSubEyebrowClassName = "text-xs uppercase tracking-[0.18em] text-inkMuted";
const adminSubAccentEyebrowClassName = "text-xs uppercase tracking-[0.18em] text-cinnabar";
const adminSectionTitleClassName = "mt-3 font-serifCn text-2xl text-ink text-balance";
const adminHeroTitleClassName = "mt-4 font-serifCn text-4xl text-ink text-balance";
const adminDescriptionClassName = "mt-4 max-w-4xl text-sm leading-7 text-inkSoft";
const adminMutedCopyClassName = "text-sm leading-7 text-inkSoft";
const adminInputClassName = uiPrimitives.adminInput;
const adminSelectClassName = uiPrimitives.adminSelect;
const adminPrimaryButtonClassName = uiPrimitives.primaryButton;
const adminSecondaryButtonClassName = uiPrimitives.adminSecondaryButton;

function getAdminTextareaClassName(minHeightClassName: string) {
  return cn(minHeightClassName, adminInputClassName);
}

function getDatasetCardClassName(selected: boolean) {
  return cn(
    surfaceCardStyles(),
    "border-lineStrong px-4 py-4 text-left text-ink shadow-none",
    selected ? "border-cinnabar bg-surfaceWarm" : "bg-surface",
  );
}

function getCaseMobileCardClassName(selected: boolean) {
  return cn(
    adminListCardClassName,
    "w-full text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surfaceWarm",
    selected ? "border-cinnabar bg-surfaceWarm" : "hover:border-lineStrong hover:bg-surfaceHighlight",
  );
}

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

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getCaseSourceBadge(caseItem: CaseItem) {
  const sourceType = getTrimmedString(caseItem.sourceType) || "manual";
  const sourceLabel = getTrimmedString(caseItem.sourceLabel);
  const sourceRef = getTrimmedString(caseItem.sourceRef);
  if (sourceLabel) {
    return `${sourceType} · ${sourceLabel}`;
  }
  if (sourceRef) {
    return `${sourceType} · ${sourceRef}`;
  }
  return sourceType;
}

function getCaseSourceDetail(caseItem: CaseItem) {
  const parts = [getTrimmedString(caseItem.sourceRef), getTrimmedString(caseItem.sourceUrl)].filter(Boolean);
  return parts.join(" · ");
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

export function AdminWritingEvalDatasetsClient({
  initialDatasets,
  initialCases,
  articleImportOptions,
  knowledgeCardImportOptions,
  topicImportOptions,
  fragmentImportOptions,
  initialAutoFillAuditLogs,
  initialSelectedDatasetId,
  initialSelectedCaseId,
  focusDataset,
  focusCase,
}: {
  initialDatasets: DatasetItem[];
  initialCases: CaseItem[];
  articleImportOptions: ArticleImportOption[];
  knowledgeCardImportOptions: KnowledgeCardImportOption[];
  topicImportOptions: TopicImportOption[];
  fragmentImportOptions: FragmentImportOption[];
  initialAutoFillAuditLogs: AutoFillAuditLogItem[];
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
  const [articleImportCandidates, setArticleImportCandidates] = useState(articleImportOptions);
  const [knowledgeCardImportCandidates, setKnowledgeCardImportCandidates] = useState(knowledgeCardImportOptions);
  const [topicImportCandidates, setTopicImportCandidates] = useState(topicImportOptions);
  const [fragmentImportCandidates, setFragmentImportCandidates] = useState(fragmentImportOptions);
  const [autoFillAuditLogs, setAutoFillAuditLogs] = useState(initialAutoFillAuditLogs);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(initialSelectedDatasetId ?? initialDatasets[0]?.id ?? null);
  const [cases, setCases] = useState(initialCases);
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(initialSelectedCaseId ?? initialCases[0]?.id ?? null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [importingBatchArticles, setImportingBatchArticles] = useState(false);
  const [importingBatchKnowledgeCards, setImportingBatchKnowledgeCards] = useState(false);
  const [importingBatchTopics, setImportingBatchTopics] = useState(false);
  const [importingBatchFragments, setImportingBatchFragments] = useState(false);
  const [loadingImportRecommendations, setLoadingImportRecommendations] = useState(false);
  const [autoFillingImports, setAutoFillingImports] = useState(false);
  const [importRecommendationTargets, setImportRecommendationTargets] = useState<string[]>([]);
  const [importRecommendations, setImportRecommendations] = useState<ImportRecommendationItem[]>([]);
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
  const [articleImportForm, setArticleImportForm] = useState({
    articleId: "",
  });
  const [knowledgeCardImportForm, setKnowledgeCardImportForm] = useState({
    knowledgeCardId: "",
  });
  const [topicImportForm, setTopicImportForm] = useState({
    topicItemId: "",
  });
  const [fragmentImportForm, setFragmentImportForm] = useState({
    fragmentId: "",
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
  const selectedDatasetAutoFillLogs = selectedDataset
    ? autoFillAuditLogs.filter((item) => item.targetId === String(selectedDataset.id)).slice(0, 6)
    : [];
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
  const recentArticleOptions = articleImportCandidates.slice(0, 12);
  const importableRecentArticleIds = selectedDataset
    ? recentArticleOptions
      .filter((article) => !article.alreadyImportedDatasetIds.includes(selectedDataset.id))
      .map((article) => article.id)
    : [];
  const recentKnowledgeCardOptions = knowledgeCardImportCandidates.slice(0, 12);
  const importableRecentKnowledgeCardIds = selectedDataset
    ? recentKnowledgeCardOptions
      .filter((card) => !card.alreadyImportedDatasetIds.includes(selectedDataset.id))
      .map((card) => card.id)
    : [];
  const recentTopicOptions = topicImportCandidates.slice(0, 12);
  const importableRecentTopicIds = selectedDataset
    ? recentTopicOptions
      .filter((topic) => !topic.alreadyImportedDatasetIds.includes(selectedDataset.id))
      .map((topic) => topic.id)
    : [];
  const recentFragmentOptions = fragmentImportCandidates.slice(0, 12);
  const importableRecentFragmentIds = selectedDataset
    ? recentFragmentOptions
      .filter((fragment) => !fragment.alreadyImportedDatasetIds.includes(selectedDataset.id))
      .map((fragment) => fragment.id)
    : [];
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
    setAutoFillAuditLogs(initialAutoFillAuditLogs);
  }, [initialAutoFillAuditLogs]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setCases([]);
      setSelectedCaseId(null);
      return;
    }
    let cancelled = false;
    async function loadCases() {
      setLoadingCases(true);
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/cases`);
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

  async function loadImportRecommendations(datasetId: number) {
    setLoadingImportRecommendations(true);
    const response = await fetch(`/api/admin/writing-eval/datasets/${datasetId}/import-recommendations?limit=8`);
    const json = await response.json().catch(() => ({}));
    setLoadingImportRecommendations(false);
    if (!response.ok || !json.success) {
      setImportRecommendationTargets([]);
      setImportRecommendations([]);
      setMessage(json.error || "加载补桶推荐失败");
      return;
    }
    const payload = json.data as ImportRecommendationPayload;
    setImportRecommendationTargets(Array.isArray(payload.targetSummary) ? payload.targetSummary : []);
    setImportRecommendations(Array.isArray(payload.recommendations) ? payload.recommendations : []);
  }

  useEffect(() => {
    if (!selectedDatasetId) {
      setImportRecommendationTargets([]);
      setImportRecommendations([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoadingImportRecommendations(true);
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-recommendations?limit=8`);
      const json = await response.json().catch(() => ({}));
      if (cancelled) return;
      setLoadingImportRecommendations(false);
      if (!response.ok || !json.success) {
        setImportRecommendationTargets([]);
        setImportRecommendations([]);
        return;
      }
      const payload = json.data as ImportRecommendationPayload;
      setImportRecommendationTargets(Array.isArray(payload.targetSummary) ? payload.targetSummary : []);
      setImportRecommendations(Array.isArray(payload.recommendations) ? payload.recommendations : []);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  function markImportedSources(importedItems: Array<{ sourceType: ImportRecommendationItem["sourceType"]; sourceId: number }>) {
    if (!selectedDatasetId || importedItems.length === 0) return;
    const importedByType = new Map<ImportRecommendationItem["sourceType"], Set<number>>();
    for (const item of importedItems) {
      const current = importedByType.get(item.sourceType) ?? new Set<number>();
      current.add(item.sourceId);
      importedByType.set(item.sourceType, current);
    }
    setArticleImportCandidates((prev) => prev.map((item) => (
      importedByType.get("article")?.has(item.id)
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setKnowledgeCardImportCandidates((prev) => prev.map((item) => (
      importedByType.get("knowledge_card")?.has(item.id)
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setTopicImportCandidates((prev) => prev.map((item) => (
      importedByType.get("topic_item")?.has(item.id)
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setFragmentImportCandidates((prev) => prev.map((item) => (
      importedByType.get("fragment")?.has(item.id)
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
  }

  async function handleAutoFillImports(limit: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    setAutoFillingImports(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/auto-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxImports: limit }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.error || "自动补桶失败");
        return;
      }
      const payload = json.data as {
        createdCases: CaseItem[];
        importedItems: Array<{ sourceType: ImportRecommendationItem["sourceType"]; sourceId: number }>;
        skipped: Array<{ sourceType: string; sourceId: number; reason: string }>;
      };
      const createdCases = Array.isArray(payload.createdCases) ? payload.createdCases : [];
      const importedItems = Array.isArray(payload.importedItems) ? payload.importedItems : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (createdCases.length > 0) {
        const createdCaseIds = new Set(createdCases.map((item) => item.id));
        setCases((prev) => [...createdCases, ...prev.filter((item) => !createdCaseIds.has(item.id))]);
        setSelectedCaseId(createdCases[0]?.id ?? null);
        setDatasets((prev) => prev.map((item) => (
          item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + createdCases.length } : item
        )));
        markImportedSources(importedItems);
      }
      await loadImportRecommendations(selectedDatasetId);
      setMessage(
        createdCases.length > 0
          ? `已自动补桶导入 ${createdCases.length} 条样本${skipped.length > 0 ? `，跳过 ${skipped.length} 条` : ""}`
          : skipped.length > 0
            ? `没有新增样本，已跳过 ${skipped.length} 条候选`
            : "当前没有可自动补入的新样本",
      );
      startTransition(() => router.refresh());
    } finally {
      setAutoFillingImports(false);
    }
  }

  async function importRecommendedItem(item: ImportRecommendationItem) {
    if (item.sourceType === "article") {
      await importArticleById(item.sourceId);
      return;
    }
    if (item.sourceType === "knowledge_card") {
      await importKnowledgeCardById(item.sourceId);
      return;
    }
    if (item.sourceType === "topic_item") {
      await importTopicById(item.sourceId);
      return;
    }
    await importFragmentById(item.sourceId);
  }

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
    const response = await fetch("/api/admin/writing-eval/datasets", {
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
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/cases`, {
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
    await loadImportRecommendations(selectedDatasetId);
    setMessage(`已创建样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function importArticleById(articleId: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    if (!Number.isInteger(articleId) || articleId <= 0) {
      setMessage("请输入有效的历史稿件 ID");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-article`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "导入历史稿件失败");
      return;
    }
    const created = json.data as CaseItem;
    setCases((prev) => [created, ...prev]);
    setSelectedCaseId(created.id);
    setDatasets((prev) => prev.map((item) => (item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + 1 } : item)));
    setArticleImportCandidates((prev) => prev.map((item) => (
      item.id === articleId
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setArticleImportForm({ articleId: "" });
    await loadImportRecommendations(selectedDatasetId);
    setMessage(`已从历史稿件 ${articleId} 导入样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function handleImportArticle(event: FormEvent) {
    event.preventDefault();
    await importArticleById(Number(articleImportForm.articleId));
  }

  async function handleImportRecentArticles(limit: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    const articleIds = importableRecentArticleIds.slice(0, limit);
    if (articleIds.length === 0) {
      setMessage("最近文章里没有可导入的新稿件");
      return;
    }
    setImportingBatchArticles(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-articles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.error || "批量导入历史稿件失败");
        return;
      }
      const payload = json.data as {
        createdCases: CaseItem[];
        skipped: Array<{ articleId: number; reason: string }>;
      };
      const createdCases = Array.isArray(payload.createdCases) ? payload.createdCases : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (createdCases.length > 0) {
        const createdCaseIds = new Set(createdCases.map((item) => item.id));
        setCases((prev) => [...createdCases, ...prev.filter((item) => !createdCaseIds.has(item.id))]);
        setSelectedCaseId(createdCases[0]?.id ?? null);
        setDatasets((prev) => prev.map((item) => (
          item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + createdCases.length } : item
        )));
        const importedArticleIds = new Set(articleIds.filter((articleId) => !skipped.some((item) => item.articleId === articleId)));
        setArticleImportCandidates((prev) => prev.map((item) => (
          importedArticleIds.has(item.id)
            ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
            : item
        )));
      }
      await loadImportRecommendations(selectedDatasetId);
      setMessage(
        createdCases.length > 0
          ? `已批量导入 ${createdCases.length} 篇历史稿件${skipped.length > 0 ? `，跳过 ${skipped.length} 篇` : ""}`
          : skipped.length > 0
            ? `没有新增样本，已跳过 ${skipped.length} 篇历史稿件`
            : "没有新增样本",
      );
      startTransition(() => router.refresh());
    } finally {
      setImportingBatchArticles(false);
    }
  }

  async function importKnowledgeCardById(knowledgeCardId: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    if (!Number.isInteger(knowledgeCardId) || knowledgeCardId <= 0) {
      setMessage("请输入有效的知识卡 ID");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-knowledge-card`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ knowledgeCardId }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "导入知识卡失败");
      return;
    }
    const created = json.data as CaseItem;
    setCases((prev) => [created, ...prev]);
    setSelectedCaseId(created.id);
    setDatasets((prev) => prev.map((item) => (item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + 1 } : item)));
    setKnowledgeCardImportCandidates((prev) => prev.map((item) => (
      item.id === knowledgeCardId
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setKnowledgeCardImportForm({ knowledgeCardId: "" });
    await loadImportRecommendations(selectedDatasetId);
    setMessage(`已从知识卡 ${knowledgeCardId} 导入样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function handleImportKnowledgeCard(event: FormEvent) {
    event.preventDefault();
    await importKnowledgeCardById(Number(knowledgeCardImportForm.knowledgeCardId));
  }

  async function handleImportRecentKnowledgeCards(limit: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    const knowledgeCardIds = importableRecentKnowledgeCardIds.slice(0, limit);
    if (knowledgeCardIds.length === 0) {
      setMessage("最近知识卡里没有可导入的新条目");
      return;
    }
    setImportingBatchKnowledgeCards(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-knowledge-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeCardIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.error || "批量导入知识卡失败");
        return;
      }
      const payload = json.data as {
        createdCases: CaseItem[];
        skipped: Array<{ knowledgeCardId: number; reason: string }>;
      };
      const createdCases = Array.isArray(payload.createdCases) ? payload.createdCases : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (createdCases.length > 0) {
        const createdCaseIds = new Set(createdCases.map((item) => item.id));
        setCases((prev) => [...createdCases, ...prev.filter((item) => !createdCaseIds.has(item.id))]);
        setSelectedCaseId(createdCases[0]?.id ?? null);
        setDatasets((prev) => prev.map((item) => (
          item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + createdCases.length } : item
        )));
        const importedKnowledgeCardIds = new Set(knowledgeCardIds.filter((knowledgeCardId) => !skipped.some((item) => item.knowledgeCardId === knowledgeCardId)));
        setKnowledgeCardImportCandidates((prev) => prev.map((item) => (
          importedKnowledgeCardIds.has(item.id)
            ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
            : item
        )));
      }
      await loadImportRecommendations(selectedDatasetId);
      setMessage(
        createdCases.length > 0
          ? `已批量导入 ${createdCases.length} 张知识卡${skipped.length > 0 ? `，跳过 ${skipped.length} 张` : ""}`
          : skipped.length > 0
            ? `没有新增样本，已跳过 ${skipped.length} 张知识卡`
            : "没有新增样本",
      );
      startTransition(() => router.refresh());
    } finally {
      setImportingBatchKnowledgeCards(false);
    }
  }

  async function importTopicById(topicItemId: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    if (!Number.isInteger(topicItemId) || topicItemId <= 0) {
      setMessage("请输入有效的主题档案 ID");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-topic`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicItemId }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "导入主题档案失败");
      return;
    }
    const created = json.data as CaseItem;
    setCases((prev) => [created, ...prev]);
    setSelectedCaseId(created.id);
    setDatasets((prev) => prev.map((item) => (item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + 1 } : item)));
    setTopicImportCandidates((prev) => prev.map((item) => (
      item.id === topicItemId
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setTopicImportForm({ topicItemId: "" });
    await loadImportRecommendations(selectedDatasetId);
    setMessage(`已从主题档案 ${topicItemId} 导入样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function handleImportTopic(event: FormEvent) {
    event.preventDefault();
    await importTopicById(Number(topicImportForm.topicItemId));
  }

  async function handleImportRecentTopics(limit: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    const topicItemIds = importableRecentTopicIds.slice(0, limit);
    if (topicItemIds.length === 0) {
      setMessage("最近主题档案里没有可导入的新条目");
      return;
    }
    setImportingBatchTopics(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicItemIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.error || "批量导入主题档案失败");
        return;
      }
      const payload = json.data as {
        createdCases: CaseItem[];
        skipped: Array<{ topicItemId: number; reason: string }>;
      };
      const createdCases = Array.isArray(payload.createdCases) ? payload.createdCases : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (createdCases.length > 0) {
        const createdCaseIds = new Set(createdCases.map((item) => item.id));
        setCases((prev) => [...createdCases, ...prev.filter((item) => !createdCaseIds.has(item.id))]);
        setSelectedCaseId(createdCases[0]?.id ?? null);
        setDatasets((prev) => prev.map((item) => (
          item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + createdCases.length } : item
        )));
        const importedTopicItemIds = new Set(topicItemIds.filter((topicItemId) => !skipped.some((item) => item.topicItemId === topicItemId)));
        setTopicImportCandidates((prev) => prev.map((item) => (
          importedTopicItemIds.has(item.id)
            ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
            : item
        )));
      }
      await loadImportRecommendations(selectedDatasetId);
      setMessage(
        createdCases.length > 0
          ? `已批量导入 ${createdCases.length} 条主题档案${skipped.length > 0 ? `，跳过 ${skipped.length} 条` : ""}`
          : skipped.length > 0
            ? `没有新增样本，已跳过 ${skipped.length} 条主题档案`
            : "没有新增样本",
      );
      startTransition(() => router.refresh());
    } finally {
      setImportingBatchTopics(false);
    }
  }

  async function importFragmentById(fragmentId: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    if (!Number.isInteger(fragmentId) || fragmentId <= 0) {
      setMessage("请输入有效的素材 ID");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-fragment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fragmentId }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.success) {
      setMessage(json.error || "导入素材失败");
      return;
    }
    const created = json.data as CaseItem;
    setCases((prev) => [created, ...prev]);
    setSelectedCaseId(created.id);
    setDatasets((prev) => prev.map((item) => (item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + 1 } : item)));
    setFragmentImportCandidates((prev) => prev.map((item) => (
      item.id === fragmentId
        ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
        : item
    )));
    setFragmentImportForm({ fragmentId: "" });
    await loadImportRecommendations(selectedDatasetId);
    setMessage(`已从素材 ${fragmentId} 导入样本 ${created.taskCode}`);
    startTransition(() => router.refresh());
  }

  async function handleImportFragment(event: FormEvent) {
    event.preventDefault();
    await importFragmentById(Number(fragmentImportForm.fragmentId));
  }

  async function handleImportRecentFragments(limit: number) {
    if (!selectedDatasetId) {
      setMessage("请先选择一个评测集");
      return;
    }
    const fragmentIds = importableRecentFragmentIds.slice(0, limit);
    if (fragmentIds.length === 0) {
      setMessage("最近素材里没有可导入的新条目");
      return;
    }
    setImportingBatchFragments(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/import-fragments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fragmentIds }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        setMessage(json.error || "批量导入素材失败");
        return;
      }
      const payload = json.data as {
        createdCases: CaseItem[];
        skipped: Array<{ fragmentId: number; reason: string }>;
      };
      const createdCases = Array.isArray(payload.createdCases) ? payload.createdCases : [];
      const skipped = Array.isArray(payload.skipped) ? payload.skipped : [];
      if (createdCases.length > 0) {
        const createdCaseIds = new Set(createdCases.map((item) => item.id));
        setCases((prev) => [...createdCases, ...prev.filter((item) => !createdCaseIds.has(item.id))]);
        setSelectedCaseId(createdCases[0]?.id ?? null);
        setDatasets((prev) => prev.map((item) => (
          item.id === selectedDatasetId ? { ...item, sampleCount: item.sampleCount + createdCases.length } : item
        )));
        const importedFragmentIds = new Set(fragmentIds.filter((fragmentId) => !skipped.some((item) => item.fragmentId === fragmentId)));
        setFragmentImportCandidates((prev) => prev.map((item) => (
          importedFragmentIds.has(item.id)
            ? { ...item, alreadyImportedDatasetIds: item.alreadyImportedDatasetIds.includes(selectedDatasetId) ? item.alreadyImportedDatasetIds : [...item.alreadyImportedDatasetIds, selectedDatasetId] }
            : item
        )));
      }
      await loadImportRecommendations(selectedDatasetId);
      setMessage(
        createdCases.length > 0
          ? `已批量导入 ${createdCases.length} 条素材${skipped.length > 0 ? `，跳过 ${skipped.length} 条` : ""}`
          : skipped.length > 0
            ? `没有新增样本，已跳过 ${skipped.length} 条素材`
            : "没有新增样本",
      );
      startTransition(() => router.refresh());
    } finally {
      setImportingBatchFragments(false);
    }
  }

  async function handleSaveDataset(event: FormEvent) {
    event.preventDefault();
    if (!selectedDataset) {
      setMessage("请先选择一个评测集");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDataset.id}`, {
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
    const response = await fetch(`/api/admin/writing-eval/cases/${selectedCase.id}`, {
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
    if (selectedDatasetId) {
      await loadImportRecommendations(selectedDatasetId);
    }
    setMessage(`已更新样本 ${updated.taskCode}`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8">
      <section className={adminHeroPanelClassName}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className={adminAccentEyebrowClassName}>Writing Eval Datasets</div>
            <h1 className={adminHeroTitleClassName}>评测集与样本管理</h1>
            <p className={adminDescriptionClassName}>
              这里单独管理固定评测集、样本难度分布和样本编辑器，避免运行页同时承担实验编排与样本维护两种职责。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "runs", "versions", "insights", "scoring", "schedules", "governance"]} className="flex flex-wrap gap-3" />
        </div>
      </section>

      {focusDataset || focusCase ? (
        <section className={adminSectionPanelClassName}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-3">
              {focusDataset ? (
                <div>
                  <div className={adminSubAccentEyebrowClassName}>数据集聚焦模式</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    当前通过深链聚焦 dataset #{focusDataset.datasetId}，匹配 {focusDataset.matchedCount} 条。
                  </div>
                </div>
              ) : null}
              {focusCase ? (
                <div>
                  <div className={adminSubAccentEyebrowClassName}>样本聚焦模式</div>
                  <div className="mt-2 text-sm leading-7 text-inkSoft">
                    当前通过深链聚焦 case #{focusCase.caseId}，匹配 {focusCase.matchedCount} 条。
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {focusCase ? (
                <Link href={focusCase.clearHref} className={adminSecondaryButtonClassName}>
                  返回数据集视图
                </Link>
              ) : null}
              <Link href={getAdminWritingEvalHref("datasets")} className={adminSecondaryButtonClassName}>
                返回全量数据集
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <form onSubmit={handleCreateDataset} className={adminFormPanelClassName}>
          <div className={adminEyebrowClassName}>新建评测集</div>
          <input aria-label="编码，例如 viral-mvp-v1" value={datasetForm.code} onChange={(event) => setDatasetForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="编码，例如 viral-mvp-v1" className={adminInputClassName} />
          <input aria-label="名称" value={datasetForm.name} onChange={(event) => setDatasetForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" className={adminInputClassName} />
          <textarea aria-label="说明" value={datasetForm.description} onChange={(event) => setDatasetForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明" className={getAdminTextareaClassName("min-h-[120px]")} />
          <select aria-label="select control" value={datasetForm.status} onChange={(event) => setDatasetForm((prev) => ({ ...prev, status: event.target.value }))} className={adminSelectClassName}>
            {DATASET_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button className={adminPrimaryButtonClassName}>创建评测集</button>
        </form>

        <div className={adminSectionPanelClassName}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={adminEyebrowClassName}>数据集列表</div>
              <h2 className={adminSectionTitleClassName}>当前评测集</h2>
            </div>
            <div className="text-sm text-inkMuted">{datasets.length} 个数据集</div>
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
                  className={getDatasetCardClassName(selectedDatasetId === dataset.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>{dataset.code}</div>
                      <div className="mt-2 text-lg text-ink">{dataset.name}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs text-inkMuted">{dataset.status}</div>
                      <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${readinessMeta.tone}`}>{readinessMeta.label}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-inkSoft">{dataset.description || "暂无说明"}</div>
                  <div className="mt-4 text-xs text-inkMuted">
                    样本数 {dataset.sampleCount} · 更新于 {formatWritingEvalDateTime(dataset.updatedAt)}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-inkMuted">{readinessMeta.summary}</div>
                </button>
              );
            })}
            {datasets.length === 0 ? <div className={adminEmptyStateClassName}>还没有评测集。</div> : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <div className={adminSectionPanelClassName}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={adminEyebrowClassName}>数据集详情</div>
                <h2 className={adminSectionTitleClassName}>{selectedDataset?.name || "选择一个评测集"}</h2>
              </div>
              <div className="text-sm text-inkMuted">{loadingCases ? "加载样本中…" : `${cases.length} 条样本`}</div>
            </div>

            {selectedDataset ? (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <div className={adminMetricCardClassName}>
                    <div className={adminSubEyebrowClassName}>编码</div>
                    <div className="mt-3 text-ink">{selectedDataset.code}</div>
                  </div>
                  <div className={adminMetricCardClassName}>
                    <div className={adminSubEyebrowClassName}>状态</div>
                    <div className="mt-3 text-ink">{selectedDataset.status}</div>
                  </div>
                  <div className={adminMetricCardClassName}>
                    <div className={adminSubEyebrowClassName}>启用样本</div>
                    <div className="mt-3 text-ink">{cases.filter((item) => item.isEnabled).length}</div>
                  </div>
                  <div className={adminMetricCardClassName}>
                    <div className={adminSubEyebrowClassName}>最近更新</div>
                    <div className="mt-3 text-sm text-ink">{formatWritingEvalDateTime(selectedDataset.updatedAt)}</div>
                  </div>
                </div>

                <div className={cn("mt-5", adminInsetCardClassName)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>执行就绪度</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>这里直接反映 Runs / Schedules 页的自动实验守卫结果。</div>
                    </div>
                    <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${selectedDatasetReadinessMeta.tone}`}>
                      {selectedDatasetReadinessMeta.label}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-inkSoft">
                    启用样本 {selectedDataset.readiness.enabledCaseCount}/{selectedDataset.readiness.totalCaseCount} ·
                    标题目标 {selectedDataset.readiness.coverage.titleGoal} · 开头目标 {selectedDataset.readiness.coverage.hookGoal} ·
                    传播目标 {selectedDataset.readiness.coverage.shareTriggerGoal} · 事实素材 {selectedDataset.readiness.coverage.sourceFacts}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-inkMuted">
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
                  <Link href={buildAdminWritingEvalRunsHref({ datasetId: selectedDataset.id })} className={adminSecondaryButtonClassName}>
                    用当前评测集发起实验
                  </Link>
                </div>

                <div className={cn("mt-5", adminInsetCardClassName)}>
                  <div className={adminSubEyebrowClassName}>难度分布</div>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    {Object.keys(difficultyCounts).length > 0 ? (
                      Object.entries(difficultyCounts).map(([level, count]) => (
                        <div key={level} className="border border-lineStrong px-3 py-2 text-inkSoft">
                          {level} · {count}
                        </div>
                      ))
                    ) : (
                      <div className="text-inkMuted">当前还没有样本。</div>
                    )}
                  </div>
                </div>

                <div className={cn("mt-5", adminInsetCardClassName)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>样本覆盖度</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>对齐方案要求，优先补齐标题目标、开头目标、传播目标和事实素材上下文。</div>
                    </div>
                    <div className="text-xs text-inkMuted">{cases.length} 条样本</div>
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
                      <div key={item.label} className={adminCoverageCardClassName}>
                        <div className="text-xs uppercase tracking-[0.16em] text-inkMuted">{item.label}</div>
                        <div className="mt-3 text-lg text-ink">
                          {item.value}/{cases.length}
                        </div>
                        <div className="mt-2 text-xs text-inkMuted">
                          {cases.length === 0 ? "暂无样本" : `${Math.round((item.value / cases.length) * 100)}% 覆盖`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className={cn("mt-5", adminEmptyStateClassName)}>先创建或选择一个评测集。</div>
            )}
          </div>

          <form onSubmit={handleSaveDataset} className={adminFormPanelClassName}>
            <div className={adminEyebrowClassName}>数据集编辑器</div>
            {selectedDataset ? (
              <>
                <input aria-label="input control" value={datasetEditorForm.code} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, code: event.target.value }))} className={adminInputClassName} />
                <input aria-label="input control" value={datasetEditorForm.name} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, name: event.target.value }))} className={adminInputClassName} />
                <textarea aria-label="textarea control" value={datasetEditorForm.description} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, description: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} />
                <select aria-label="select control" value={datasetEditorForm.status} onChange={(event) => setDatasetEditorForm((prev) => ({ ...prev, status: event.target.value }))} className={adminSelectClassName}>
                  {DATASET_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <button className={adminPrimaryButtonClassName}>保存评测集</button>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从上方列表选择一个评测集。</div>
            )}
          </form>

          <div className={adminSectionPanelClassName}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>评测样本</div>
                <h2 className={adminSectionTitleClassName}>样本表格</h2>
              </div>
              <div className="text-sm text-inkMuted">{cases.length} 条记录</div>
            </div>
            <div className={adminTableMobileListClassName}>
              {cases.map((item) => {
                const selected = selectedCaseId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedCaseId(item.id)}
                    className={getCaseMobileCardClassName(selected)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-inkSoft">{item.taskCode}</div>
                        <div className="mt-2 text-base text-ink text-balance">{item.topicTitle}</div>
                      </div>
                      <span
                        className={`shrink-0 border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${
                          selected ? "border-cinnabar/50 text-cinnabar" : "border-lineStrong text-inkMuted"
                        }`}
                      >
                        {selected ? "已选中" : "点击编辑"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 text-sm text-inkSoft sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">类型</div>
                        <div className="mt-1">{item.taskType}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">来源</div>
                        <div className="mt-1 text-xs leading-6 text-inkSoft">{getCaseSourceBadge(item)}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">难度</div>
                        <div className="mt-1">{item.difficultyLevel}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">启用</div>
                        <div className="mt-1">{item.isEnabled ? "enabled" : "disabled"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">参考好稿</div>
                        <div className="mt-1">{item.referenceGoodOutput ? "有" : "无"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">更新时间</div>
                        <div className="mt-1">{formatWritingEvalDateTime(item.updatedAt)}</div>
                      </div>
                    </div>
                    {getCaseSourceDetail(item) ? (
                      <div className="mt-4 border-t border-lineStrong pt-4 text-xs leading-6 text-inkMuted">
                        {getCaseSourceDetail(item)}
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {cases.length === 0 ? <div className={adminEmptyStateClassName}>当前评测集还没有样本。</div> : null}
            </div>
            <div className={adminTableDesktopShellClassName}>
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="text-inkMuted">
                  <tr>
                    {["样本", "类型", "来源", "标题", "难度", "启用", "参考好稿", "更新时间"].map((head) => (
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
                      className={`cursor-pointer border-t border-lineStrong ${selectedCaseId === item.id ? "bg-surfaceWarm" : ""}`}
                      onClick={() => setSelectedCaseId(item.id)}
                    >
                      <td className="py-4 font-mono text-xs text-inkSoft">{item.taskCode}</td>
                      <td className="py-4 text-inkSoft">{item.taskType}</td>
                      <td className="py-4 text-xs text-inkMuted">{getCaseSourceBadge(item)}</td>
                      <td className="py-4 text-ink">{item.topicTitle}</td>
                      <td className="py-4 text-inkSoft">{item.difficultyLevel}</td>
                      <td className="py-4 text-inkSoft">{item.isEnabled ? "enabled" : "disabled"}</td>
                      <td className="py-4 text-inkSoft">{item.referenceGoodOutput ? "有" : "无"}</td>
                      <td className="py-4 text-inkSoft">{formatWritingEvalDateTime(item.updatedAt)}</td>
                    </tr>
                  ))}
                  {cases.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-inkMuted">
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
          <div className={adminStackPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>自动补桶</div>
                <h2 className={adminSectionTitleClassName}>按 readiness 缺口推荐样本</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                先推荐，再支持一键自动补入 4 条
              </div>
            </div>
            {selectedDataset ? (
              <>
                <div className={cn(adminInsetCardClassName, adminMutedCopyClassName)}>
                  当前围绕评测集 <span className="text-ink">{selectedDataset.code}</span> 的题型、难度和 coverage 缺口生成推荐。
                  会优先补样本总量、缺失题型、缺失难度，以及 `sourceFacts / knowledgeCards / historyReferences / referenceGoodOutput` 等薄弱项。
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadImportRecommendations(selectedDataset.id)}
                    className={adminSecondaryButtonClassName}
                    disabled={loadingImportRecommendations}
                  >
                    {loadingImportRecommendations ? "刷新推荐中…" : "刷新推荐"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAutoFillImports(4)}
                    className={adminPrimaryButtonClassName}
                    disabled={autoFillingImports || loadingImportRecommendations || importRecommendations.length === 0}
                  >
                    {autoFillingImports ? "自动补桶中…" : "自动补入 4 条"}
                  </button>
                </div>
                {importRecommendationTargets.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {importRecommendationTargets.map((item) => (
                      <span key={`import-target-${item}`} className={adminDarkChipClassName}>
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-3">
                  {importRecommendations.length > 0 ? (
                    importRecommendations.map((item) => (
                      <div key={`${item.sourceType}-${item.sourceId}`} className={adminListCardClassName}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-ink">{item.title}</div>
                            <div className="mt-1 text-xs text-inkMuted">
                              {item.sourceType} · #{item.sourceId}
                              {item.subtitle ? ` · ${item.subtitle}` : ""}
                              {` · score ${item.score}`}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void importRecommendedItem(item)}
                            className={adminSecondaryButtonClassName}
                          >
                            一键导入
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className={adminChipClassName}>{item.suggestedTaskType}</span>
                          <span className={adminChipClassName}>{item.suggestedDifficultyLevel}</span>
                          <span className={adminChipClassName}>facts {item.sourceFactCount}</span>
                          <span className={adminChipClassName}>knowledge {item.knowledgeCardCount}</span>
                          <span className={adminChipClassName}>history {item.historyReferenceCount}</span>
                          <span className={adminChipClassName}>
                            {item.referenceGoodOutput ? "with good output" : "no good output"}
                          </span>
                        </div>
                        {item.reasonTags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {item.reasonTags.map((reason) => (
                              <span key={`${item.sourceType}-${item.sourceId}-${reason}`} className={adminReasonChipClassName}>
                                {reason}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className={adminEmptyStateClassName}>
                      {loadingImportRecommendations ? "正在分析当前数据集缺口…" : "当前没有额外推荐样本，可能该数据集已经比较完整，或候选池里没有更合适的条目。"}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再生成补桶推荐。</div>
            )}
          </div>

          <div className={adminStackPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>补桶台账</div>
                <h2 className={adminSectionTitleClassName}>最近自动补桶记录</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                展示最近写入 audit 的自动补桶结果
              </div>
            </div>
            {selectedDataset ? (
              selectedDatasetAutoFillLogs.length > 0 ? (
                <div className="space-y-3">
                  {selectedDatasetAutoFillLogs.map((log) => {
                    const payload = log.payload || {};
                    const importedCount = getNumberValue(payload.importedCount);
                    const targetSummary = getStringArray(payload.targetSummary).slice(0, 4);
                    const readinessStatus = getTrimmedString(payload.readinessStatus) || "unknown";
                    const importedItems = Array.isArray(payload.importedItems) ? payload.importedItems.length : 0;
                    const skippedCount = Array.isArray(payload.skipped) ? payload.skipped.length : 0;
                    return (
                      <div key={log.id} className={cn(adminListCardClassName, "px-4 py-4")}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm text-ink">
                              {formatWritingEvalDateTime(log.createdAt)} · 导入 {importedCount} 条样本
                            </div>
                            <div className="mt-1 text-xs text-inkMuted">
                              readiness {readinessStatus} · importedItems {importedItems} · skipped {skippedCount}
                              {log.username ? ` · by ${log.username}` : " · by scheduler/service"}
                            </div>
                          </div>
                          <Link
                            href={buildAdminWritingEvalRunsHref({ datasetId: selectedDataset.id })}
                            className={adminSecondaryButtonClassName}
                          >
                            去 Runs
                          </Link>
                        </div>
                        {targetSummary.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {targetSummary.map((item) => (
                              <span key={`${log.id}-${item}`} className={adminDarkChipClassName}>
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={adminEmptyStateClassName}>
                  当前评测集还没有自动补桶记录。后续由 scheduler/service 或管理员触发自动补桶后，会在这里沉淀最近台账。
                </div>
              )
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再查看补桶台账。</div>
            )}
          </div>

          <form onSubmit={handleImportArticle} className={adminFormPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>历史文章导入</div>
                <h2 className={adminSectionTitleClassName}>从已发布稿件沉淀样本</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                自动带入 stage artifacts、历史参考和好稿正文
              </div>
            </div>
            {selectedDataset ? (
              <>
                <div className={cn(adminInsetCardClassName, adminMutedCopyClassName)}>
                  向当前评测集 <span className="text-ink">{selectedDataset.code}</span> 导入历史稿件后，会自动生成
                  <span className="mx-1 font-mono text-inkSoft">taskCode=article-&lt;id&gt;</span>
                  的 case 草稿，并预填 reference good output、阶段产物与 history references。
                </div>
                <input
                  aria-label="历史稿件 ID"
                  value={articleImportForm.articleId}
                  onChange={(event) => setArticleImportForm({ articleId: event.target.value })}
                  placeholder="历史稿件 ID，例如 123"
                  className={adminInputClassName}
                />
                <button className={adminPrimaryButtonClassName}>导入历史稿件</button>
                <div className={adminInsetCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>最近可导入文章</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>优先挑带阶段产物、事实素材、历史参考的稿件，减少手工补样本。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-inkMuted">{recentArticleOptions.length} 条</div>
                      <button
                        type="button"
                        onClick={() => void handleImportRecentArticles(5)}
                        className={adminSecondaryButtonClassName}
                        disabled={importingBatchArticles || importableRecentArticleIds.length === 0}
                      >
                        {importingBatchArticles ? "批量导入中…" : `导入最近 5 篇未导入文章${importableRecentArticleIds.length > 0 ? `（${Math.min(importableRecentArticleIds.length, 5)} 篇）` : ""}`}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentArticleOptions.length > 0 ? (
                      recentArticleOptions.map((article) => {
                        const alreadyImported = selectedDataset ? article.alreadyImportedDatasetIds.includes(selectedDataset.id) : false;
                        return (
                          <div key={`article-import-option-${article.id}`} className={adminListCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-ink">{article.title || `article-${article.id}`}</div>
                                <div className="mt-1 text-xs text-inkMuted">
                                  #{article.id} · {article.status}
                                  {article.seriesName ? ` · ${article.seriesName}` : ""}
                                  {` · ${formatWritingEvalDateTime(article.updatedAt)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setArticleImportForm({ articleId: String(article.id) });
                                  void importArticleById(article.id);
                                }}
                                className={adminSecondaryButtonClassName}
                                disabled={alreadyImported}
                              >
                                {alreadyImported ? "当前数据集已导入" : "一键导入"}
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={adminChipClassName}>{article.suggestedTaskType}</span>
                              <span className={adminChipClassName}>{article.suggestedDifficultyLevel}</span>
                              <span className={adminChipClassName}>facts {article.sourceFactCount}</span>
                              <span className={adminChipClassName}>knowledge {article.knowledgeCardCount}</span>
                              <span className={adminChipClassName}>history {article.historyReferenceCount}</span>
                              <span className={adminChipClassName}>
                                stages {article.stageCodes.length > 0 ? article.stageCodes.join(", ") : "none"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-inkMuted">当前没有可用于导入的历史稿件。</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再导入历史稿件。</div>
            )}
          </form>

          <form onSubmit={handleImportKnowledgeCard} className={adminFormPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>知识卡导入</div>
                <h2 className={adminSectionTitleClassName}>从背景卡沉淀 case 草稿</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                自动带入 key facts、open questions、related cards
              </div>
            </div>
            {selectedDataset ? (
              <>
                <div className={cn(adminInsetCardClassName, adminMutedCopyClassName)}>
                  向当前评测集 <span className="text-ink">{selectedDataset.code}</span> 导入知识卡后，会自动生成
                  <span className="mx-1 font-mono text-inkSoft">taskCode=knowledge-card-&lt;id&gt;</span>
                  的 case 草稿，并预填 source facts、开放问题、冲突信号和关联背景卡。
                </div>
                <input
                  aria-label="知识卡 ID"
                  value={knowledgeCardImportForm.knowledgeCardId}
                  onChange={(event) => setKnowledgeCardImportForm({ knowledgeCardId: event.target.value })}
                  placeholder="知识卡 ID，例如 42"
                  className={adminInputClassName}
                />
                <button className={adminPrimaryButtonClassName}>导入知识卡</button>
                <div className={adminInsetCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>最近可导入知识卡</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>优先挑事实密度高、带开放问题和关联卡的背景卡，能更快补齐中高难样本。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-inkMuted">{recentKnowledgeCardOptions.length} 条</div>
                      <button
                        type="button"
                        onClick={() => void handleImportRecentKnowledgeCards(5)}
                        className={adminSecondaryButtonClassName}
                        disabled={importingBatchKnowledgeCards || importableRecentKnowledgeCardIds.length === 0}
                      >
                        {importingBatchKnowledgeCards ? "批量导入中…" : `导入最近 5 张未导入知识卡${importableRecentKnowledgeCardIds.length > 0 ? `（${Math.min(importableRecentKnowledgeCardIds.length, 5)} 张）` : ""}`}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentKnowledgeCardOptions.length > 0 ? (
                      recentKnowledgeCardOptions.map((card) => {
                        const alreadyImported = selectedDataset ? card.alreadyImportedDatasetIds.includes(selectedDataset.id) : false;
                        return (
                          <div key={`knowledge-card-import-option-${card.id}`} className={adminListCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-ink">{card.title || `knowledge-card-${card.id}`}</div>
                                <div className="mt-1 text-xs text-inkMuted">
                                  #{card.id} · {card.cardType} · {card.status}
                                  {card.ownerUsername ? ` · ${card.ownerUsername}` : ""}
                                  {` · ${formatWritingEvalDateTime(card.updatedAt)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setKnowledgeCardImportForm({ knowledgeCardId: String(card.id) });
                                  void importKnowledgeCardById(card.id);
                                }}
                                className={adminSecondaryButtonClassName}
                                disabled={alreadyImported}
                              >
                                {alreadyImported ? "当前数据集已导入" : "一键导入"}
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={adminChipClassName}>{card.suggestedTaskType}</span>
                              <span className={adminChipClassName}>{card.suggestedDifficultyLevel}</span>
                              <span className={adminChipClassName}>confidence {Math.round(card.confidenceScore * 100)}%</span>
                              <span className={adminChipClassName}>facts {card.sourceFactCount}</span>
                              <span className={adminChipClassName}>related {card.knowledgeCardCount}</span>
                              <span className={adminChipClassName}>history {card.historyReferenceCount}</span>
                              <span className={adminChipClassName}>questions {card.openQuestionCount}</span>
                              <span className={adminChipClassName}>conflicts {card.conflictFlagCount}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-inkMuted">当前没有可用于导入的知识卡。</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再导入知识卡。</div>
            )}
          </form>

          <form onSubmit={handleImportTopic} className={adminFormPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>主题档案导入</div>
                <h2 className={adminSectionTitleClassName}>从热点/选题池沉淀 case 草稿</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                自动带入 topic summary、angle options、匹配背景卡
              </div>
            </div>
            {selectedDataset ? (
              <>
                <div className={cn(adminInsetCardClassName, adminMutedCopyClassName)}>
                  向当前评测集 <span className="text-ink">{selectedDataset.code}</span> 导入主题档案后，会自动生成
                  <span className="mx-1 font-mono text-inkSoft">taskCode=topic-item-&lt;id&gt;</span>
                  的 case 草稿，并预填热点摘要、切角建议与可复用背景卡。
                </div>
                <input
                  aria-label="主题档案 ID"
                  value={topicImportForm.topicItemId}
                  onChange={(event) => setTopicImportForm({ topicItemId: event.target.value })}
                  placeholder="主题档案 ID，例如 88"
                  className={adminInputClassName}
                />
                <button className={adminPrimaryButtonClassName}>导入主题档案</button>
                <div className={adminInsetCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>最近可导入主题档案</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>优先挑摘要完整、切角充足、能匹配到背景卡的热点条目，适合快速补足观察类样本。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-inkMuted">{recentTopicOptions.length} 条</div>
                      <button
                        type="button"
                        onClick={() => void handleImportRecentTopics(5)}
                        className={adminSecondaryButtonClassName}
                        disabled={importingBatchTopics || importableRecentTopicIds.length === 0}
                      >
                        {importingBatchTopics ? "批量导入中…" : `导入最近 5 条未导入主题${importableRecentTopicIds.length > 0 ? `（${Math.min(importableRecentTopicIds.length, 5)} 条）` : ""}`}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentTopicOptions.length > 0 ? (
                      recentTopicOptions.map((topic) => {
                        const alreadyImported = selectedDataset ? topic.alreadyImportedDatasetIds.includes(selectedDataset.id) : false;
                        return (
                          <div key={`topic-import-option-${topic.id}`} className={adminListCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-ink">{topic.title || `topic-item-${topic.id}`}</div>
                                <div className="mt-1 text-xs text-inkMuted">
                                  #{topic.id} · {topic.sourceName} · {topic.sourceType}
                                  {topic.publishedAt ? ` · ${formatWritingEvalDateTime(topic.publishedAt)}` : ""}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setTopicImportForm({ topicItemId: String(topic.id) });
                                  void importTopicById(topic.id);
                                }}
                                className={adminSecondaryButtonClassName}
                                disabled={alreadyImported}
                              >
                                {alreadyImported ? "当前数据集已导入" : "一键导入"}
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={adminChipClassName}>{topic.suggestedTaskType}</span>
                              <span className={adminChipClassName}>{topic.suggestedDifficultyLevel}</span>
                              <span className={adminChipClassName}>facts {topic.sourceFactCount}</span>
                              <span className={adminChipClassName}>knowledge {topic.knowledgeCardCount}</span>
                              <span className={adminChipClassName}>history {topic.historyReferenceCount}</span>
                              <span className={adminChipClassName}>emotions {topic.emotionLabelCount}</span>
                              <span className={adminChipClassName}>angles {topic.angleOptionCount}</span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-inkMuted">当前没有可用于导入的主题档案。</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再导入主题档案。</div>
            )}
          </form>

          <form onSubmit={handleImportFragment} className={adminFormPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>素材包导入</div>
                <h2 className={adminSectionTitleClassName}>从素材碎片沉淀 case 草稿</h2>
              </div>
              <div className="text-xs leading-6 text-inkMuted">
                自动带入 material bundle、来源边界、关联背景卡
              </div>
            </div>
            {selectedDataset ? (
              <>
                <div className={cn(adminInsetCardClassName, adminMutedCopyClassName)}>
                  向当前评测集 <span className="text-ink">{selectedDataset.code}</span> 导入素材后，会自动生成
                  <span className="mx-1 font-mono text-inkSoft">taskCode=fragment-&lt;id&gt;</span>
                  的 case 草稿，并预填素材包、来源边界和关联背景卡。
                </div>
                <input
                  aria-label="素材 ID"
                  value={fragmentImportForm.fragmentId}
                  onChange={(event) => setFragmentImportForm({ fragmentId: event.target.value })}
                  placeholder="素材 ID，例如 315"
                  className={adminInputClassName}
                />
                <button className={adminPrimaryButtonClassName}>导入素材</button>
                <div className={adminInsetCardClassName}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={adminSubEyebrowClassName}>最近可导入素材</div>
                      <div className={cn("mt-2", adminMutedCopyClassName)}>优先挑带外链、截图或已沉淀背景卡的素材，能更快补足 fact/density 维度。</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-inkMuted">{recentFragmentOptions.length} 条</div>
                      <button
                        type="button"
                        onClick={() => void handleImportRecentFragments(5)}
                        className={adminSecondaryButtonClassName}
                        disabled={importingBatchFragments || importableRecentFragmentIds.length === 0}
                      >
                        {importingBatchFragments ? "批量导入中…" : `导入最近 5 条未导入素材${importableRecentFragmentIds.length > 0 ? `（${Math.min(importableRecentFragmentIds.length, 5)} 条）` : ""}`}
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentFragmentOptions.length > 0 ? (
                      recentFragmentOptions.map((fragment) => {
                        const alreadyImported = selectedDataset ? fragment.alreadyImportedDatasetIds.includes(selectedDataset.id) : false;
                        return (
                          <div key={`fragment-import-option-${fragment.id}`} className={adminListCardClassName}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-ink">{fragment.title || `fragment-${fragment.id}`}</div>
                                <div className="mt-1 text-xs text-inkMuted">
                                  #{fragment.id} · {fragment.sourceType}
                                  {fragment.hasScreenshot ? " · screenshot" : ""}
                                  {` · ${formatWritingEvalDateTime(fragment.createdAt)}`}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setFragmentImportForm({ fragmentId: String(fragment.id) });
                                  void importFragmentById(fragment.id);
                                }}
                                className={adminSecondaryButtonClassName}
                                disabled={alreadyImported}
                              >
                                {alreadyImported ? "当前数据集已导入" : "一键导入"}
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={adminChipClassName}>{fragment.suggestedTaskType}</span>
                              <span className={adminChipClassName}>{fragment.suggestedDifficultyLevel}</span>
                              <span className={adminChipClassName}>facts {fragment.sourceFactCount}</span>
                              <span className={adminChipClassName}>knowledge {fragment.knowledgeCardCount}</span>
                              <span className={adminChipClassName}>history {fragment.historyReferenceCount}</span>
                              <span className={adminChipClassName}>
                                {fragment.sourceUrl ? "with url" : "no url"}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-inkMuted">当前没有可用于导入的素材。</div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧选择一个评测集，再导入素材。</div>
            )}
          </form>

          <form onSubmit={handleCreateCase} className={adminFormPanelClassName}>
            <div className={adminEyebrowClassName}>新建样本</div>
            <input aria-label="taskCode" value={caseForm.taskCode} onChange={(event) => setCaseForm((prev) => ({ ...prev, taskCode: event.target.value }))} placeholder="taskCode" className={adminInputClassName} />
            <input aria-label="topicTitle" value={caseForm.topicTitle} onChange={(event) => setCaseForm((prev) => ({ ...prev, topicTitle: event.target.value }))} placeholder="topicTitle" className={adminInputClassName} />
            <select aria-label="select control" value={caseForm.taskType} onChange={(event) => setCaseForm((prev) => ({ ...prev, taskType: event.target.value }))} className={adminSelectClassName}>
              {TASK_TYPE_OPTIONS.map((taskType) => (
                <option key={taskType} value={taskType}>{taskType}</option>
              ))}
            </select>
            <select value={caseForm.difficultyLevel} onChange={(event) => setCaseForm((prev) => ({ ...prev, difficultyLevel: event.target.value }))} className={adminSelectClassName}>
              {DIFFICULTY_LEVEL_OPTIONS.map((difficultyLevel) => (
                <option key={difficultyLevel} value={difficultyLevel}>{difficultyLevel}</option>
              ))}
            </select>
            <textarea aria-label="输入上下文 JSON" value={caseForm.inputPayload} onChange={(event) => setCaseForm((prev) => ({ ...prev, inputPayload: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} placeholder="输入上下文 JSON" />
            <textarea aria-label="固定约束 JSON" value={caseForm.expectedConstraints} onChange={(event) => setCaseForm((prev) => ({ ...prev, expectedConstraints: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} placeholder="固定约束 JSON" />
            <textarea aria-label="爆款目标 JSON" value={caseForm.viralTargets} onChange={(event) => setCaseForm((prev) => ({ ...prev, viralTargets: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} placeholder="爆款目标 JSON" />
            <textarea aria-label="阶段产物 payloads JSON，可选。例：{&quot;deepWriting&quot;:{...}}" value={caseForm.stageArtifactPayloads} onChange={(event) => setCaseForm((prev) => ({ ...prev, stageArtifactPayloads: event.target.value }))} className={getAdminTextareaClassName("min-h-[150px]")} placeholder="阶段产物 payloads JSON，可选。例：{&quot;deepWriting&quot;:{...}}" />
            <textarea aria-label="反例模式 JSON 数组" value={caseForm.referenceBadPatterns} onChange={(event) => setCaseForm((prev) => ({ ...prev, referenceBadPatterns: event.target.value }))} className={getAdminTextareaClassName("min-h-[90px]")} placeholder="反例模式 JSON 数组" />
            <textarea aria-label="参考好稿，可选" value={caseForm.referenceGoodOutput} onChange={(event) => setCaseForm((prev) => ({ ...prev, referenceGoodOutput: event.target.value }))} className={getAdminTextareaClassName("min-h-[90px]")} placeholder="参考好稿，可选" />
            <button className={adminPrimaryButtonClassName}>创建样本</button>
          </form>

          <form onSubmit={handleSaveCase} className={adminFormPanelClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={adminEyebrowClassName}>样本编辑器</div>
                <h2 className={adminSectionTitleClassName}>{selectedCase ? selectedCase.taskCode : "选择样本后编辑"}</h2>
              </div>
              <div className="flex items-center gap-3">
                {selectedDataset ? (
                  <Link href={buildAdminWritingEvalRunsHref({ datasetId: selectedDataset.id })} className={adminSecondaryButtonClassName}>
                    去 Runs 发起实验
                  </Link>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-inkSoft">
                  <input aria-label="input control" type="checkbox" checked={editorForm.isEnabled} onChange={(event) => setEditorForm((prev) => ({ ...prev, isEnabled: event.target.checked }))} />
                  启用
                </label>
              </div>
            </div>
            {selectedCase ? (
              <>
                <div className={cn(adminInsetCardClassName, "text-sm text-inkSoft")}>
                  <div className={adminSubEyebrowClassName}>样本来源</div>
                  <div className="mt-3 text-ink">{getCaseSourceBadge(selectedCase)}</div>
                  {getCaseSourceDetail(selectedCase) ? (
                    <div className="mt-2 text-xs leading-6 text-inkMuted">{getCaseSourceDetail(selectedCase)}</div>
                  ) : null}
                  {selectedCase.sourceUrl ? (
                    <div className="mt-3">
                      <Link href={selectedCase.sourceUrl} target="_blank" rel="noreferrer" className={adminSecondaryButtonClassName}>
                        打开原始来源
                      </Link>
                    </div>
                  ) : null}
                </div>
                <div className={cn(adminInsetCardClassName, "text-sm text-inkSoft")}>
                  <div className={adminSubEyebrowClassName}>样本完备度</div>
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
                  <div className="mt-3 text-xs leading-6 text-inkMuted">
                    {selectedCaseMissingFields.length > 0
                      ? `当前缺项：${selectedCaseMissingFields.join("、")}。补齐这些字段后，再去 Runs 做离线实验更稳定。`
                      : "当前样本已补齐基础输入、爆款目标和事实上下文字段，可以直接参与离线实验。"}
                  </div>
                </div>
                <input aria-label="input control" value={editorForm.taskCode} onChange={(event) => setEditorForm((prev) => ({ ...prev, taskCode: event.target.value }))} className={adminInputClassName} />
                <input aria-label="input control" value={editorForm.topicTitle} onChange={(event) => setEditorForm((prev) => ({ ...prev, topicTitle: event.target.value }))} className={adminInputClassName} />
                <select aria-label="select control" value={editorForm.taskType} onChange={(event) => setEditorForm((prev) => ({ ...prev, taskType: event.target.value }))} className={adminSelectClassName}>
                  {TASK_TYPE_OPTIONS.map((taskType) => (
                    <option key={taskType} value={taskType}>{taskType}</option>
                  ))}
                </select>
                <select value={editorForm.difficultyLevel} onChange={(event) => setEditorForm((prev) => ({ ...prev, difficultyLevel: event.target.value }))} className={adminSelectClassName}>
                  {DIFFICULTY_LEVEL_OPTIONS.map((difficultyLevel) => (
                    <option key={difficultyLevel} value={difficultyLevel}>{difficultyLevel}</option>
                  ))}
                </select>
                <textarea aria-label="textarea control" value={editorForm.inputPayload} onChange={(event) => setEditorForm((prev) => ({ ...prev, inputPayload: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} />
                <textarea aria-label="textarea control" value={editorForm.expectedConstraints} onChange={(event) => setEditorForm((prev) => ({ ...prev, expectedConstraints: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} />
                <textarea aria-label="textarea control" value={editorForm.viralTargets} onChange={(event) => setEditorForm((prev) => ({ ...prev, viralTargets: event.target.value }))} className={getAdminTextareaClassName("min-h-[110px]")} />
                <textarea aria-label="textarea control" value={editorForm.stageArtifactPayloads} onChange={(event) => setEditorForm((prev) => ({ ...prev, stageArtifactPayloads: event.target.value }))} className={getAdminTextareaClassName("min-h-[150px]")} />
                <textarea aria-label="textarea control" value={editorForm.referenceBadPatterns} onChange={(event) => setEditorForm((prev) => ({ ...prev, referenceBadPatterns: event.target.value }))} className={getAdminTextareaClassName("min-h-[90px]")} />
                <textarea aria-label="textarea control" value={editorForm.referenceGoodOutput} onChange={(event) => setEditorForm((prev) => ({ ...prev, referenceGoodOutput: event.target.value }))} className={getAdminTextareaClassName("min-h-[90px]")} />
                <button className={adminPrimaryButtonClassName}>保存样本</button>
              </>
            ) : (
              <div className={adminEmptyStateClassName}>先从左侧表格选择一个样本。</div>
            )}
          </form>
        </div>
      </section>

      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
