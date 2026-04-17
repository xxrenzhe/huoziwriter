"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";
import {
  WRITING_EVAL_AGENT_STRATEGY_PRESETS,
  getWritingEvalAgentStrategyLabel,
  getWritingEvalAgentStrategyPreset,
} from "@/lib/writing-eval-config";

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
  referenceGoodOutput: string | null;
  referenceBadPatterns: unknown[];
  difficultyLevel: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type RunItem = {
  id: number;
  runCode: string;
  datasetId: number;
  datasetName: string | null;
  baseVersionType: string;
  baseVersionRef: string;
  candidateVersionType: string;
  candidateVersionRef: string;
  experimentMode: string;
  triggerMode: string;
  decisionMode: string;
  resolutionStatus: string;
  status: string;
  summary: string | null;
  scoreSummary: Record<string, unknown>;
  recommendation: string;
  recommendationReason: string;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

type RunResultItem = {
  id: number;
  runId: number;
  caseId: number;
  taskCode: string | null;
  taskType: string | null;
  topicTitle: string | null;
  difficultyLevel: string | null;
  generatedTitle: string | null;
  generatedLead: string | null;
  generatedMarkdown: string;
  styleScore: number;
  languageScore: number;
  densityScore: number;
  emotionScore: number;
  structureScore: number;
  topicMomentumScore: number;
  headlineScore: number;
  hookScore: number;
  shareabilityScore: number;
  readerValueScore: number;
  noveltyScore: number;
  platformFitScore: number;
  qualityScore: number;
  viralScore: number;
  factualRiskPenalty: number;
  aiNoisePenalty: number;
  totalScore: number;
  judgePayload: Record<string, unknown>;
  createdAt: string;
};

type RunDetailItem = RunItem & {
  results: RunResultItem[];
};

type RunScheduleItem = {
  id: number;
  name: string;
  datasetId: number;
  datasetName: string | null;
  datasetStatus: string;
  baseVersionType: string;
  baseVersionRef: string;
  candidateVersionType: string;
  candidateVersionRef: string;
  experimentMode: string;
  triggerMode: string;
  agentStrategy: string;
  decisionMode: string;
  priority: number;
  cadenceHours: number;
  nextRunAt: string | null;
  lastDispatchedAt: string | null;
  lastRunId: number | null;
  lastRunCode: string | null;
  lastRunStatus: string | null;
  lastError: string | null;
  isEnabled: boolean;
  summary: string | null;
  createdBy: number | null;
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

type ScoreMetricField =
  | "qualityScore"
  | "viralScore"
  | "styleScore"
  | "languageScore"
  | "densityScore"
  | "emotionScore"
  | "structureScore"
  | "headlineScore"
  | "hookScore"
  | "readerValueScore"
  | "shareabilityScore";

type FeedbackItem = {
  id: number;
  runId: number | null;
  resultId: number | null;
  caseId: number | null;
  articleId: number | null;
  wechatSyncLogId: number | null;
  sourceType: string;
  sourceLabel: string | null;
  openRate: number | null;
  readCompletionRate: number | null;
  shareRate: number | null;
  favoriteRate: number | null;
  readCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  notes: string | null;
  payload: Record<string, unknown>;
  createdBy: number | null;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  taskCode: string | null;
  topicTitle: string | null;
  articleTitle: string | null;
  syncStatus: string | null;
  mediaId: string | null;
  predictedViralScore: number | null;
  predictedTotalScore: number | null;
  signalScores?: {
    topicMomentumScore: number | null;
    headlineScore: number | null;
    hookScore: number | null;
    shareabilityScore: number | null;
    readerValueScore: number | null;
    noveltyScore: number | null;
    platformFitScore: number | null;
  };
  observedViralScore: number | null;
  calibrationGap: number | null;
};

type FeedbackState = {
  items: FeedbackItem[];
  summary: {
    feedbackCount: number;
    linkedResultCount: number;
    averageObservedViralScore: number | null;
    averagePredictedViralScore: number | null;
    averageCalibrationGap: number | null;
    averageOpenRate: number | null;
    averageReadCompletionRate: number | null;
    averageShareRate: number | null;
    averageFavoriteRate: number | null;
  };
  options: {
    results: Array<{
      id: number;
      caseId: number;
      taskCode: string;
      topicTitle: string;
      viralScore: number;
      totalScore: number;
    }>;
    articles: Array<{
      id: number;
      userId: number;
      title: string;
      status: string;
      updatedAt: string;
    }>;
    syncLogs: Array<{
      id: number;
      articleId: number;
      title: string | null;
      status: string;
      mediaId: string | null;
      createdAt: string;
    }>;
  };
  realOutcome: {
    supported: boolean;
    versionType: string;
    candidateContent: string;
    summary: {
      feedbackCount: number;
      averageObservedViralScore: number | null;
      averagePredictedViralScore: number | null;
      averageCalibrationGap: number | null;
      averageOpenRate: number | null;
      averageReadCompletionRate: number | null;
      averageShareRate: number | null;
      averageFavoriteRate: number | null;
    };
    items: FeedbackItem[];
  };
};

type ScoringProfileItem = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getStringList(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function getResultDeltaTotal(result: RunResultItem) {
  return getNumber(getRecord(getRecord(result.judgePayload.comparison).delta).total_score);
}

function getResultCaseError(result: RunResultItem) {
  const caseError = getRecord(result.judgePayload).caseError;
  return typeof caseError === "string" && caseError.trim() ? caseError.trim() : null;
}

function averageNumbers(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toSnakeCaseScoreField(field: ScoreMetricField) {
  return field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function getBaselineScore(result: RunResultItem, field: ScoreMetricField) {
  return getNumber(getRecord(getRecord(result.judgePayload.baseline).scores)[toSnakeCaseScoreField(field)]);
}

function truncateText(value: string | null | undefined, limit: number) {
  const text = String(value || "").trim();
  if (!text) return "暂无内容";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function formatMetric(value: number | null | undefined, suffix = "", digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(digits)}${suffix}`;
}

function getDatasetReadinessMeta(readiness: DatasetItem["readiness"] | null | undefined) {
  if (!readiness) {
    return {
      label: "unknown",
      tone: "border-stone-700 text-stone-400",
      summary: "还没有就绪度数据。",
    };
  }
  if (readiness.status === "ready") {
    return {
      label: "ready",
      tone: "border-emerald-500/40 text-emerald-300",
      summary: `启用样本 ${readiness.enabledCaseCount} 条，样本质量目标已满足自动决议与长期调度。`,
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
    summary: readiness.blockers[0] || "当前未达到自动实验最小门槛。",
  };
}

function getRunCreationBlockedMessage(input: {
  dataset: DatasetItem | null;
  readiness: DatasetItem["readiness"] | null;
  triggerMode: string;
  decisionMode: string;
}) {
  if (!input.dataset) return "请先选择评测集。";
  if (input.dataset.status === "archived") return "archived 数据集不能继续用于实验或调度。";
  if (input.dataset.status !== "active" && (input.triggerMode !== "manual" || input.decisionMode !== "manual_review")) {
    return "draft 数据集仅允许手动 + 人工审核实验。";
  }
  if (input.decisionMode !== "manual_review") {
    return "自动 keep/discard 仅允许用于 ready 且 active 的数据集。";
  }
  return "当前 triggerMode 不是 manual，且评测集仍未达到自动实验最低门槛。";
}

function getScheduleCreationBlockedMessage(input: {
  dataset: DatasetItem | null;
  readiness: DatasetItem["readiness"] | null;
  decisionMode: string;
}) {
  if (!input.dataset) return "请先选择评测集。";
  if (input.dataset.status === "archived") return "archived 数据集不能进入自动调度。";
  if (input.dataset.status !== "active") return "draft 数据集不能进入自动调度，请先转为 active。";
  if (input.decisionMode !== "manual_review") return "自动决议调度仅允许用于 ready 且 active 的数据集。";
  return "当前评测集仍是 blocked，不能进入自动派发。";
}

function isExecutableSchedule(schedule: RunScheduleItem) {
  if (!schedule.isEnabled) return false;
  if (schedule.datasetStatus !== "active") return false;
  if (schedule.readiness.status === "blocked") return false;
  if (schedule.decisionMode !== "manual_review" && schedule.readiness.status !== "ready") return false;
  return true;
}

function formatDeltaMetric(value: number | null | undefined, suffix = "", digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function getDeltaTone(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-stone-400";
  return value >= 0 ? "text-emerald-400" : "text-cinnabar";
}

function getFeedbackSourceLabel(item: FeedbackItem) {
  const labels = [item.sourceType, item.sourceLabel, item.taskCode].filter(Boolean);
  return labels.join(" · ") || "unknown";
}

function getFeedbackSignalHighlights(item: FeedbackItem) {
  if (!item.signalScores) return [];
  return [
    { label: "标题", value: item.signalScores.headlineScore },
    { label: "开头", value: item.signalScores.hookScore },
    { label: "传播", value: item.signalScores.shareabilityScore },
    { label: "收益", value: item.signalScores.readerValueScore },
  ].filter((entry) => typeof entry.value === "number" && Number.isFinite(entry.value));
}

function getSchedulePriorityValue(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 100;
  return Math.min(999, Math.max(0, Math.round(numeric)));
}

function sortSchedules(items: RunScheduleItem[]) {
  return [...items].sort((left, right) => {
    if (left.isEnabled !== right.isEnabled) return left.isEnabled ? -1 : 1;
    if (left.priority !== right.priority) return right.priority - left.priority;
    const leftNextRun = left.nextRunAt ? new Date(left.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightNextRun = right.nextRunAt ? new Date(right.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftNextRun !== rightNextRun) return leftNextRun - rightNextRun;
    return right.id - left.id;
  });
}

function applyAgentStrategyPresetToForm<T extends { agentStrategy: string; priority: string }>(
  previous: T,
  nextStrategy: string,
) {
  const preset = getWritingEvalAgentStrategyPreset(nextStrategy);
  if (!preset) {
    return { ...previous, agentStrategy: nextStrategy };
  }
  return {
    ...previous,
    agentStrategy: preset.code,
    priority: String(preset.recommendedPriority),
  };
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseJsonInput(value: string, fieldLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel}必须是 JSON 对象`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : `${fieldLabel}格式错误`);
  }
}

function getVersionOptionsByType(
  versionType: string,
  promptOptions: Array<{ promptId: string; name: string; value: string; label: string }>,
  scoringProfileOptions: Array<{ value: string; label: string }>,
  layoutStrategyOptions: Array<{ value: string; label: string }>,
  applyCommandTemplateOptions: Array<{ value: string; label: string }>,
  promptTargetId: string,
) {
  if (versionType === "scoring_profile") {
    return scoringProfileOptions;
  }
  if (versionType === "layout_strategy") {
    return layoutStrategyOptions;
  }
  if (versionType === "apply_command_template") {
    return applyCommandTemplateOptions;
  }
  const filteredPromptOptions = promptOptions.filter((item) => item.promptId === promptTargetId);
  return filteredPromptOptions.length > 0 ? filteredPromptOptions : promptOptions;
}

function getPreferredPromptTargetId(promptOptions: Array<{ promptId: string }>) {
  return ["article_write", "outline_planning", "prose_polish", "deep_write"].find((promptId) =>
    promptOptions.some((item) => item.promptId === promptId),
  ) ?? promptOptions[0]?.promptId ?? "";
}

function parsePromptVersionRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  if (!promptId || !version) return null;
  return { promptId, version };
}

function buildVersionLedgerHref(versionType: string, versionRef: string) {
  const params = new URLSearchParams({
    assetType: versionType,
    assetRef: versionRef,
  });
  return `/ops/writing-eval/versions?${params.toString()}`;
}

function buildPromptFocusHref(value: string) {
  const parsed = parsePromptVersionRef(value);
  if (!parsed) return null;
  const params = new URLSearchParams({
    promptId: parsed.promptId,
    version: parsed.version,
  });
  return `/ops/prompts?${params.toString()}`;
}

function getRequiredPromptTargetIdForExperimentMode(experimentMode: string) {
  if (experimentMode === "title_only") return "outline_planning";
  if (experimentMode === "lead_only") return "prose_polish";
  return null;
}

function getExperimentModeLabel(experimentMode: string) {
  if (experimentMode === "title_only") return "只优化标题";
  if (experimentMode === "lead_only") return "只优化开头";
  return "全文实验";
}

function getVersionTypeLabel(versionType: string) {
  if (versionType === "layout_strategy") return "layout_strategy（写作风格资产）";
  return versionType;
}

function getDecisionModeLabel(decisionMode: string) {
  if (decisionMode === "auto_keep") return "自动 keep";
  if (decisionMode === "auto_keep_or_discard") return "自动 keep/discard";
  return "人工审核";
}

function getResolutionStatusLabel(resolutionStatus: string) {
  if (resolutionStatus === "keep") return "已 keep";
  if (resolutionStatus === "discard") return "已 discard";
  if (resolutionStatus === "rollback") return "已回滚";
  return "待决议";
}

function toDateTimeLocalValue(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function createScheduleEditorForm(schedule: RunScheduleItem) {
  return {
    name: schedule.name,
    datasetId: String(schedule.datasetId),
    baseVersionType: schedule.baseVersionType,
    baseVersionRef: schedule.baseVersionRef,
    candidateVersionType: schedule.candidateVersionType,
    candidateVersionRef: schedule.candidateVersionRef,
    experimentMode: schedule.experimentMode,
    triggerMode: schedule.triggerMode,
    agentStrategy: schedule.agentStrategy,
    decisionMode: schedule.decisionMode,
    priority: String(schedule.priority),
    cadenceHours: String(schedule.cadenceHours),
    nextRunAt: toDateTimeLocalValue(schedule.nextRunAt),
    isEnabled: schedule.isEnabled,
    summary: schedule.summary || "",
  };
}

export function OpsWritingEvalClient({
  initialDatasets,
  initialCases,
  initialSelectedDatasetId,
  initialRuns,
  initialRunDetail,
  initialResultId,
  initialSchedules,
  focusDataset,
  focusResult,
  focusSchedule,
  promptOptions,
  initialScoringProfiles,
  layoutStrategyOptions,
  applyCommandTemplateOptions,
}: {
  initialDatasets: DatasetItem[];
  initialCases: CaseItem[];
  initialSelectedDatasetId?: number | null;
  initialRuns: RunItem[];
  initialRunDetail: RunDetailItem | null;
  initialResultId?: number | null;
  initialSchedules: RunScheduleItem[];
  focusDataset?: {
    datasetId: number;
    matchedCount: number;
    clearHref: string;
  } | null;
  focusResult?: {
    resultId: number;
    matchedCount: number;
    clearHref: string;
  } | null;
  focusSchedule?: {
    scheduleId: number;
    matchedCount: number;
    clearHref: string;
  } | null;
  promptOptions: Array<{ promptId: string; name: string; value: string; label: string }>;
  initialScoringProfiles: ScoringProfileItem[];
  layoutStrategyOptions: Array<{ value: string; label: string }>;
  applyCommandTemplateOptions: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultPromptTargetId = getPreferredPromptTargetId(promptOptions);
  const defaultPromptVersionOptions = promptOptions.filter((item) => item.promptId === defaultPromptTargetId);
  const hasLayoutStrategyOptions = layoutStrategyOptions.length > 0;
  const hasApplyCommandTemplateOptions = applyCommandTemplateOptions.length > 0;
  const [datasets, setDatasets] = useState(initialDatasets);
  const [runs, setRuns] = useState(initialRuns);
  const [schedules, setSchedules] = useState(() => sortSchedules(initialSchedules));
  const [cases, setCases] = useState(initialCases);
  const [message, setMessage] = useState("");
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null);
  const [dispatchingScheduleId, setDispatchingScheduleId] = useState<number | null>(null);
  const [dispatchingDue, setDispatchingDue] = useState(false);
  const [lastDispatchDueSkipped, setLastDispatchDueSkipped] = useState<Array<{ scheduleId: number; scheduleName: string; reason: string }>>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(initialSelectedDatasetId ?? initialRunDetail?.datasetId ?? initialDatasets[0]?.id ?? null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(initialRunDetail?.id ?? null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunDetailItem | null>(initialRunDetail);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(initialResultId ?? initialRunDetail?.results[0]?.id ?? null);
  const [feedbackState, setFeedbackState] = useState<FeedbackState | null>(null);
  const [scoringProfiles, setScoringProfiles] = useState(initialScoringProfiles);
  const [selectedScoringProfileId, setSelectedScoringProfileId] = useState<number | null>(initialScoringProfiles[0]?.id ?? null);
  const [promptTargetId, setPromptTargetId] = useState<string>(defaultPromptTargetId);
  const [runForm, setRunForm] = useState({
    datasetId: String(initialSelectedDatasetId ?? initialRunDetail?.datasetId ?? initialDatasets[0]?.id ?? ""),
    baseVersionType: "prompt_version",
    baseVersionRef: defaultPromptVersionOptions[0]?.value ?? promptOptions[0]?.value ?? "",
    candidateVersionType: "prompt_version",
    candidateVersionRef: defaultPromptVersionOptions[0]?.value ?? promptOptions[0]?.value ?? "",
    experimentMode: "full_article",
    triggerMode: "manual",
    decisionMode: "manual_review",
    summary: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    triggerMode: "scheduled",
    agentStrategy: "default",
    decisionMode: "manual_review",
    priority: "100",
    cadenceHours: "24",
    nextRunAt: "",
    isEnabled: true,
    summary: "",
  });
  const [scheduleEditorForm, setScheduleEditorForm] = useState({
    name: "",
    datasetId: "",
    baseVersionType: "prompt_version",
    baseVersionRef: "",
    candidateVersionType: "prompt_version",
    candidateVersionRef: "",
    experimentMode: "full_article",
    triggerMode: "scheduled",
    agentStrategy: "default",
    decisionMode: "manual_review",
    priority: "100",
    cadenceHours: "24",
    nextRunAt: "",
    isEnabled: true,
    summary: "",
  });
  const [scoringProfileForm, setScoringProfileForm] = useState({
    code: "",
    name: "",
    description: "",
    isActive: true,
    config: stringifyJson({
      qualityWeights: {
        style: 1,
        language: 1,
        density: 1,
        emotion: 1,
        structure: 1,
      },
      viralWeights: {
        topicMomentum: 1,
        headline: 1,
        hook: 1,
        shareability: 1,
        readerValue: 1,
        novelty: 1,
        platformFit: 1,
      },
      totalWeights: {
        quality: 0.45,
        viral: 0.55,
      },
      penalties: {
        aiNoiseMultiplier: 0.6,
      },
    }),
  });
  const [feedbackForm, setFeedbackForm] = useState({
    resultId: "",
    articleId: "",
    wechatSyncLogId: "",
    sourceType: "manual",
    sourceLabel: "",
    openRate: "",
    readCompletionRate: "",
    shareRate: "",
    favoriteRate: "",
    readCount: "",
    likeCount: "",
    commentCount: "",
    notes: "",
    capturedAt: "",
  });
  const scoringProfileOptions = scoringProfiles.map((profile) => ({
    value: profile.code,
    label: `${profile.name} · ${profile.code}${profile.isActive ? " · active" : ""}`,
  }));
  const displayedSchedules = focusSchedule
    ? schedules.filter((item) => item.id === focusSchedule.scheduleId)
    : schedules;
  const enabledDisplayedScheduleCount = displayedSchedules.filter((item) => item.isEnabled).length;
  const executableDisplayedScheduleCount = displayedSchedules.filter((item) => isExecutableSchedule(item)).length;
  const blockedDisplayedSchedules = displayedSchedules.filter((item) => item.isEnabled && !isExecutableSchedule(item));
  const promptTargets = Array.from(
    new Map(promptOptions.map((item) => [item.promptId, { promptId: item.promptId, label: `${item.name} · ${item.promptId}` }])).values(),
  );
  const selectedScoringProfile = scoringProfiles.find((profile) => profile.id === selectedScoringProfileId) ?? null;
  const selectedRunSourceSchedule = selectedRunDetail
    ? schedules.find((schedule) => schedule.lastRunId === selectedRunDetail.id) ?? null
    : null;
  const selectedRunBaseLedgerHref = selectedRunDetail
    ? buildVersionLedgerHref(selectedRunDetail.baseVersionType, selectedRunDetail.baseVersionRef)
    : null;
  const selectedRunCandidateLedgerHref = selectedRunDetail
    ? buildVersionLedgerHref(selectedRunDetail.candidateVersionType, selectedRunDetail.candidateVersionRef)
    : null;
  const selectedRunBasePromptHref =
    selectedRunDetail?.baseVersionType === "prompt_version"
      ? buildPromptFocusHref(selectedRunDetail.baseVersionRef)
      : null;
  const selectedRunCandidatePromptHref =
    selectedRunDetail?.candidateVersionType === "prompt_version"
      ? buildPromptFocusHref(selectedRunDetail.candidateVersionRef)
      : null;
  const selectedRunBaseVersionHref = selectedRunBasePromptHref ?? selectedRunBaseLedgerHref;
  const selectedRunCandidateVersionHref = selectedRunCandidatePromptHref ?? selectedRunCandidateLedgerHref;
  const selectedRunSourceScheduleHref = selectedRunSourceSchedule ? `/ops/writing-eval/runs?scheduleId=${selectedRunSourceSchedule.id}` : null;
  const selectedRunResult = selectedRunDetail
    ? selectedRunDetail.results.find((result) => result.id === selectedResultId) ?? selectedRunDetail.results[0] ?? null
    : null;
  const selectedDatasetHref = selectedDatasetId ? `/ops/writing-eval/datasets?datasetId=${selectedDatasetId}` : "/ops/writing-eval/datasets";
  const selectedRunFormDataset = datasets.find((item) => String(item.id) === runForm.datasetId) ?? null;
  const selectedRunFormDatasetReadiness = selectedRunFormDataset?.readiness ?? null;
  const selectedRunFormDatasetReadinessMeta = getDatasetReadinessMeta(selectedRunFormDatasetReadiness);
  const selectedRunFormDatasetIsActive = selectedRunFormDataset?.status === "active";
  const canCreateRun =
    Boolean(runForm.datasetId)
    && Boolean(selectedRunFormDataset)
    && selectedRunFormDataset?.status !== "archived"
    && (
      (runForm.triggerMode === "manual" && runForm.decisionMode === "manual_review")
      || (selectedRunFormDatasetIsActive && selectedRunFormDatasetReadiness?.status !== "blocked" && runForm.decisionMode === "manual_review")
      || (selectedRunFormDatasetIsActive && selectedRunFormDatasetReadiness?.status === "ready")
    );
  const canCreateSchedule =
    Boolean(runForm.datasetId)
    && selectedRunFormDatasetIsActive
    && selectedRunFormDatasetReadiness?.status !== "blocked"
    && (scheduleForm.decisionMode === "manual_review" || selectedRunFormDatasetReadiness?.status === "ready");
  const selectedRunCaseHref =
    selectedRunResult && selectedRunDetail
      ? `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${selectedRunResult.caseId}`
      : null;
  const runFormDatasetHref = runForm.datasetId ? `/ops/writing-eval/datasets?datasetId=${runForm.datasetId}` : null;
  const runFormBasePromptHref = runForm.baseVersionType === "prompt_version" ? buildPromptFocusHref(runForm.baseVersionRef) : null;
  const runFormCandidatePromptHref = runForm.candidateVersionType === "prompt_version" ? buildPromptFocusHref(runForm.candidateVersionRef) : null;
  const scheduleEditorDatasetHref = scheduleEditorForm.datasetId ? `/ops/writing-eval/datasets?datasetId=${scheduleEditorForm.datasetId}` : null;
  const scheduleEditorBasePromptHref = scheduleEditorForm.baseVersionType === "prompt_version" ? buildPromptFocusHref(scheduleEditorForm.baseVersionRef) : null;
  const scheduleEditorCandidatePromptHref = scheduleEditorForm.candidateVersionType === "prompt_version" ? buildPromptFocusHref(scheduleEditorForm.candidateVersionRef) : null;

  useEffect(() => {
    if (!focusSchedule?.scheduleId) return;
    const matchedSchedule = schedules.find((item) => item.id === focusSchedule.scheduleId);
    if (!matchedSchedule) return;
    setEditingScheduleId(matchedSchedule.id);
    setScheduleEditorForm(createScheduleEditorForm(matchedSchedule));
  }, [focusSchedule?.scheduleId, schedules]);

  useEffect(() => {
    if (!selectedRunDetail) {
      setSelectedResultId(null);
      return;
    }
    if (selectedRunDetail.results.length === 0) {
      setSelectedResultId(null);
      return;
    }
    setSelectedResultId((previous) =>
      previous && selectedRunDetail.results.some((result) => result.id === previous)
        ? previous
        : selectedRunDetail.results[0]?.id ?? null,
    );
  }, [selectedRunDetail]);

  function replaceRunsUrl(nextRunId: number | null, nextResultId?: number | null, nextDatasetId?: number | null) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (nextRunId && nextRunId > 0) {
      params.set("runId", String(nextRunId));
    } else {
      params.delete("runId");
    }
    if (nextResultId && nextResultId > 0) {
      params.set("resultId", String(nextResultId));
    } else {
      params.delete("resultId");
    }
    if (nextDatasetId && nextDatasetId > 0) {
      params.set("datasetId", String(nextDatasetId));
    } else {
      params.delete("datasetId");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!selectedDatasetId) {
      setCases([]);
      return;
    }
    let cancelled = false;
    async function loadCases() {
      setLoadingCases(true);
      const response = await fetch(`/api/ops/writing-eval/datasets/${selectedDatasetId}/cases`);
      const json = await response.json();
      if (cancelled) return;
      setLoadingCases(false);
      if (!response.ok || !json.success) {
        setMessage(json.error || "加载评测样本失败");
        return;
      }
      setCases(json.data);
    }
    loadCases();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId]);

  async function refreshRuns() {
    const response = await fetch("/api/ops/writing-eval/runs");
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "刷新实验运行失败");
      return null;
    }
    const nextRuns = json.data as RunItem[];
    setRuns(nextRuns);
    return nextRuns;
  }

  async function refreshSchedules() {
    const response = await fetch("/api/ops/writing-eval/schedules");
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "刷新调度规则失败");
      return null;
    }
    const nextSchedules = sortSchedules(json.data as RunScheduleItem[]);
    setSchedules(nextSchedules);
    return nextSchedules;
  }

  async function loadRunDetail(runId: number) {
    setLoadingRunDetail(true);
    const response = await fetch(`/api/ops/writing-eval/runs/${runId}`);
    const json = await response.json();
    setLoadingRunDetail(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "加载实验详情失败");
      return;
    }
    const detail = json.data as RunDetailItem;
    setSelectedRunId(runId);
    setSelectedRunDetail(detail);
    setSelectedDatasetId(detail.datasetId);
    setRunForm((prev) => ({ ...prev, datasetId: String(detail.datasetId) }));
    replaceRunsUrl(runId, null, detail.datasetId);
  }

  async function loadFeedback(runId: number) {
    setLoadingFeedback(true);
    const response = await fetch(`/api/ops/writing-eval/runs/${runId}/feedback`);
    const json = await response.json();
    setLoadingFeedback(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "加载线上回流结果失败");
      return;
    }
    setFeedbackState(json.data as FeedbackState);
  }

  useEffect(() => {
    if (!selectedRunId) {
      setFeedbackState(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoadingFeedback(true);
      const response = await fetch(`/api/ops/writing-eval/runs/${selectedRunId}/feedback`);
      const json = await response.json();
      if (cancelled) return;
      setLoadingFeedback(false);
      if (!response.ok || !json.success) {
        setMessage(json.error || "加载线上回流结果失败");
        return;
      }
      setFeedbackState(json.data as FeedbackState);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedRunId]);

  useEffect(() => {
    if (!selectedScoringProfile) {
      setScoringProfileForm({
        code: "",
        name: "",
        description: "",
        isActive: true,
        config: stringifyJson({
          qualityWeights: {
            style: 1,
            language: 1,
            density: 1,
            emotion: 1,
            structure: 1,
          },
          viralWeights: {
            topicMomentum: 1,
            headline: 1,
            hook: 1,
            shareability: 1,
            readerValue: 1,
            novelty: 1,
            platformFit: 1,
          },
          totalWeights: {
            quality: 0.45,
            viral: 0.55,
          },
          penalties: {
            aiNoiseMultiplier: 0.6,
          },
        }),
      });
      return;
    }
    setScoringProfileForm({
      code: selectedScoringProfile.code,
      name: selectedScoringProfile.name,
      description: selectedScoringProfile.description || "",
      isActive: selectedScoringProfile.isActive,
      config: stringifyJson(selectedScoringProfile.config),
    });
  }, [selectedScoringProfile]);

  async function handleCreateRun(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/ops/writing-eval/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetId: Number(runForm.datasetId),
        baseVersionType: runForm.baseVersionType,
        baseVersionRef: runForm.baseVersionRef,
        candidateVersionType: runForm.candidateVersionType,
        candidateVersionRef: runForm.candidateVersionRef,
        experimentMode: runForm.experimentMode,
        triggerMode: runForm.triggerMode,
        decisionMode: runForm.decisionMode,
        summary: runForm.summary,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "创建实验运行失败");
      return;
    }
    const created = json.data as RunItem;
    const nextRuns = await refreshRuns();
    setSelectedRunId(created.id);
    await loadRunDetail(created.id);
    if (nextRuns && nextRuns.length > 0) {
      setRuns(nextRuns);
    }
    setRunForm((prev) => ({ ...prev, summary: "" }));
    startTransition(() => router.refresh());
  }

  async function handleCreateSchedule(event: FormEvent) {
    event.preventDefault();
    setSavingSchedule(true);
    setMessage("");
    try {
      const response = await fetch("/api/ops/writing-eval/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleForm.name,
          datasetId: Number(runForm.datasetId),
          baseVersionType: runForm.baseVersionType,
          baseVersionRef: runForm.baseVersionRef,
          candidateVersionType: runForm.candidateVersionType,
          candidateVersionRef: runForm.candidateVersionRef,
          experimentMode: runForm.experimentMode,
          triggerMode: scheduleForm.triggerMode,
          agentStrategy: scheduleForm.agentStrategy,
          decisionMode: scheduleForm.decisionMode,
          priority: getSchedulePriorityValue(scheduleForm.priority),
          cadenceHours: Number(scheduleForm.cadenceHours || 24),
          nextRunAt: scheduleForm.nextRunAt || null,
          isEnabled: scheduleForm.isEnabled,
          summary: scheduleForm.summary,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "创建调度规则失败");
      }
      const created = json.data as RunScheduleItem;
      setSchedules((prev) => sortSchedules([created, ...prev]));
      setScheduleForm((prev) => ({ ...prev, name: "", summary: "" }));
      setMessage(`已创建调度规则 ${created.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建调度规则失败");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleToggleSchedule(scheduleId: number, nextEnabled: boolean) {
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: nextEnabled }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "更新调度规则失败");
      return;
    }
    const updated = json.data as RunScheduleItem;
    setSchedules((prev) => sortSchedules(prev.map((item) => (item.id === updated.id ? updated : item))));
    if (editingScheduleId === updated.id) {
      setScheduleEditorForm((prev) => ({ ...prev, isEnabled: updated.isEnabled, priority: String(updated.priority) }));
    }
    setMessage(`${updated.name} 已${updated.isEnabled ? "启用" : "停用"}`);
  }

  function handleStartEditSchedule(schedule: RunScheduleItem) {
    setEditingScheduleId(schedule.id);
    setScheduleEditorForm(createScheduleEditorForm(schedule));
    setMessage("");
  }

  function handleCancelEditSchedule() {
    setEditingScheduleId(null);
    setMessage("");
  }

  function handleApplyCurrentRunToEditingSchedule() {
    setScheduleEditorForm((prev) => ({
      ...prev,
      datasetId: runForm.datasetId,
      baseVersionType: runForm.baseVersionType,
      baseVersionRef: runForm.baseVersionRef,
      candidateVersionType: runForm.candidateVersionType,
      candidateVersionRef: runForm.candidateVersionRef,
      experimentMode: runForm.experimentMode,
      decisionMode: runForm.decisionMode,
      summary: prev.summary || runForm.summary,
    }));
  }

  const currentCreateStrategyPreset = getWritingEvalAgentStrategyPreset(scheduleForm.agentStrategy);
  const currentEditorStrategyPreset = getWritingEvalAgentStrategyPreset(scheduleEditorForm.agentStrategy);

  async function handleSaveSchedule(scheduleId: number) {
    setSavingScheduleId(scheduleId);
    setMessage("");
    try {
      const response = await fetch(`/api/ops/writing-eval/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleEditorForm.name,
          datasetId: Number(scheduleEditorForm.datasetId),
          baseVersionType: scheduleEditorForm.baseVersionType,
          baseVersionRef: scheduleEditorForm.baseVersionRef,
          candidateVersionType: scheduleEditorForm.candidateVersionType,
          candidateVersionRef: scheduleEditorForm.candidateVersionRef,
          experimentMode: scheduleEditorForm.experimentMode,
          triggerMode: scheduleEditorForm.triggerMode,
          agentStrategy: scheduleEditorForm.agentStrategy,
          decisionMode: scheduleEditorForm.decisionMode,
          priority: getSchedulePriorityValue(scheduleEditorForm.priority),
          cadenceHours: Number(scheduleEditorForm.cadenceHours || 24),
          nextRunAt: scheduleEditorForm.nextRunAt || null,
          isEnabled: scheduleEditorForm.isEnabled,
          summary: scheduleEditorForm.summary,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存调度规则失败");
      }
      const updated = json.data as RunScheduleItem;
      setSchedules((prev) => sortSchedules(prev.map((item) => (item.id === updated.id ? updated : item))));
      setEditingScheduleId(null);
      setMessage(`已更新调度规则 ${updated.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存调度规则失败");
    } finally {
      setSavingScheduleId(null);
    }
  }

  async function handleDispatchSchedule(scheduleId: number) {
    setDispatchingScheduleId(scheduleId);
    setMessage("");
    setLastDispatchDueSkipped([]);
    try {
      const response = await fetch(`/api/ops/writing-eval/schedules/${scheduleId}/dispatch`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "派发调度规则失败");
      }
      const payload = json.data as { schedule: RunScheduleItem; run: RunItem };
      setSchedules((prev) => sortSchedules(prev.map((item) => (item.id === payload.schedule.id ? payload.schedule : item))));
      setRuns((prev) => [payload.run, ...prev.filter((item) => item.id !== payload.run.id)]);
      setSelectedRunId(payload.run.id);
      await loadRunDetail(payload.run.id);
      setMessage(`已派发调度规则 ${payload.schedule.name}`);
    } catch (error) {
      await refreshSchedules();
      setMessage(error instanceof Error ? error.message : "派发调度规则失败");
    } finally {
      setDispatchingScheduleId(null);
    }
  }

  async function handleDispatchDueSchedules() {
    setDispatchingDue(true);
    setMessage("");
    try {
      const response = await fetch("/api/ops/writing-eval/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch_due", limit: 10 }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "派发到期调度失败");
      }
      const payload = json.data as {
        dispatchedCount: number;
        skippedCount?: number;
        skipped?: Array<{ scheduleId: number; scheduleName: string; reason: string; schedule?: RunScheduleItem }>;
        items: Array<{ schedule: RunScheduleItem; run: RunItem }>;
      };
      setLastDispatchDueSkipped(payload.skipped ?? []);
      if (payload.items.length === 0) {
        if (payload.skipped?.length) {
          const skippedScheduleMap = new Map(
            payload.skipped
              .map((item) => item.schedule)
              .filter((item): item is RunScheduleItem => Boolean(item))
              .map((item) => [item.id, item]),
          );
          setSchedules((prev) => sortSchedules(prev.map((item) => skippedScheduleMap.get(item.id) ?? item)));
        }
        setMessage(payload.skippedCount ? `当前没有成功派发的到期规则，跳过 ${payload.skippedCount} 条。` : "当前没有到期调度规则");
        return;
      }
      const scheduleMap = new Map<number, RunScheduleItem>(payload.items.map((item) => [item.schedule.id, item.schedule]));
      for (const skippedItem of payload.skipped ?? []) {
        if (skippedItem.schedule) {
          scheduleMap.set(skippedItem.schedule.id, skippedItem.schedule);
        }
      }
      const dispatchedRuns = payload.items.map((item) => item.run);
      setSchedules((prev) => sortSchedules(prev.map((item) => scheduleMap.get(item.id) ?? item)));
      setRuns((prev) => {
        const merged = [...dispatchedRuns, ...prev];
        const deduped = new Map<number, RunItem>();
        for (const item of merged) {
          deduped.set(item.id, item);
        }
        return Array.from(deduped.values());
      });
      const latestRun = dispatchedRuns[0] ?? null;
      if (latestRun) {
        setSelectedRunId(latestRun.id);
        await loadRunDetail(latestRun.id);
      }
      setMessage(
        payload.skippedCount
          ? `已派发 ${payload.dispatchedCount} 条到期调度规则，跳过 ${payload.skippedCount} 条不满足守卫的规则`
          : `已派发 ${payload.dispatchedCount} 条到期调度规则`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "派发到期调度失败");
    } finally {
      setDispatchingDue(false);
    }
  }

  async function handleCreateScoringProfile(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    let config: Record<string, unknown>;
    try {
      config = parseJsonInput(scoringProfileForm.config, "评分画像配置");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分画像配置格式错误");
      return;
    }
    const response = await fetch("/api/ops/writing-eval/scoring-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: scoringProfileForm.code,
        name: scoringProfileForm.name,
        description: scoringProfileForm.description,
        config,
        isActive: scoringProfileForm.isActive,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "创建评分画像失败");
      return;
    }
    const created = json.data as ScoringProfileItem;
    setScoringProfiles((prev) => [created, ...prev]);
    setSelectedScoringProfileId(created.id);
    setRunForm((prev) => {
      const next = { ...prev };
      if (prev.baseVersionType === "scoring_profile" && !prev.baseVersionRef) next.baseVersionRef = created.code;
      if (prev.candidateVersionType === "scoring_profile" && !prev.candidateVersionRef) next.candidateVersionRef = created.code;
      return next;
    });
    setMessage(`已创建评分画像 ${created.code}`);
  }

  async function handleSaveScoringProfile() {
    if (!selectedScoringProfile) {
      setMessage("请先选择一个评分画像");
      return;
    }
    setMessage("");
    let config: Record<string, unknown>;
    try {
      config = parseJsonInput(scoringProfileForm.config, "评分画像配置");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "评分画像配置格式错误");
      return;
    }
    const response = await fetch(`/api/ops/writing-eval/scoring-profiles/${selectedScoringProfile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: scoringProfileForm.code,
        name: scoringProfileForm.name,
        description: scoringProfileForm.description,
        config,
        isActive: scoringProfileForm.isActive,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "更新评分画像失败");
      return;
    }
    const updated = json.data as ScoringProfileItem;
    setScoringProfiles((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setRunForm((prev) => {
      const next = { ...prev };
      if (prev.baseVersionRef === selectedScoringProfile.code) next.baseVersionRef = updated.code;
      if (prev.candidateVersionRef === selectedScoringProfile.code) next.candidateVersionRef = updated.code;
      return next;
    });
    setMessage(`已更新评分画像 ${updated.code}`);
  }

  async function handleCreateFeedback(event: FormEvent) {
    event.preventDefault();
    if (!selectedRunId) {
      setMessage("请先选择一个实验运行");
      return;
    }
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/runs/${selectedRunId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultId: feedbackForm.resultId || null,
        articleId: feedbackForm.articleId || null,
        wechatSyncLogId: feedbackForm.wechatSyncLogId || null,
        sourceType: feedbackForm.sourceType,
        sourceLabel: feedbackForm.sourceLabel,
        openRate: parseOptionalNumber(feedbackForm.openRate),
        readCompletionRate: parseOptionalNumber(feedbackForm.readCompletionRate),
        shareRate: parseOptionalNumber(feedbackForm.shareRate),
        favoriteRate: parseOptionalNumber(feedbackForm.favoriteRate),
        readCount: parseOptionalNumber(feedbackForm.readCount),
        likeCount: parseOptionalNumber(feedbackForm.likeCount),
        commentCount: parseOptionalNumber(feedbackForm.commentCount),
        notes: feedbackForm.notes,
        capturedAt: feedbackForm.capturedAt || null,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "写入线上回流结果失败");
      return;
    }
    setFeedbackForm({
      resultId: "",
      articleId: "",
      wechatSyncLogId: "",
      sourceType: "manual",
      sourceLabel: "",
      openRate: "",
      readCompletionRate: "",
      shareRate: "",
      favoriteRate: "",
      readCount: "",
      likeCount: "",
      commentCount: "",
      notes: "",
      capturedAt: "",
    });
    await loadFeedback(selectedRunId);
    setMessage("已写入线上回流结果");
  }

  function focusRunResult(resultId: number) {
    setSelectedResultId(resultId);
    replaceRunsUrl(selectedRunId, resultId, selectedDatasetId);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("run-result-comparator")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function handleRetryRun() {
    if (!selectedRunId) return;
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/runs/${selectedRunId}/retry`, {
      method: "POST",
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "重试实验运行失败");
      return;
    }
    await refreshRuns();
    setSelectedRunDetail(json.data as RunDetailItem);
  }

  async function handlePromoteRun() {
    if (!selectedRunId) return;
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/runs/${selectedRunId}/promote`, {
      method: "POST",
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "保留实验版本失败");
      return;
    }
    if (json.data.promotedPromptId && json.data.promotedVersion) {
      setMessage(`已保留候选版本 ${json.data.promotedPromptId}@${json.data.promotedVersion}`);
    } else if (json.data.promotedScoringProfileCode) {
      setMessage(`已激活评分画像 ${json.data.promotedScoringProfileCode}`);
    } else if (json.data.promotedLayoutStrategyId) {
      setMessage(`已激活写作风格资产 #${json.data.promotedLayoutStrategyId}`);
    } else if (json.data.promotedApplyCommandTemplateCode) {
      setMessage(`已激活 apply command 模板 ${json.data.promotedApplyCommandTemplateCode}`);
    } else {
      setMessage("已保留候选版本");
    }
    await refreshRuns();
    await loadRunDetail(selectedRunId);
    startTransition(() => router.refresh());
  }

  async function handleDiscardRun() {
    if (!selectedRunId) return;
    setMessage("");
    const response = await fetch(`/api/ops/writing-eval/runs/${selectedRunId}/discard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: selectedRunDetail?.recommendationReason || "" }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "丢弃实验版本失败");
      return;
    }
    setMessage("已记录 discard 决策");
    await refreshRuns();
    await loadRunDetail(selectedRunId);
    startTransition(() => router.refresh());
  }

  async function handleCreatePromptCandidateFromRun() {
    if (!selectedRunDetail) return;
    if (selectedRunDetail.baseVersionType !== "prompt_version" || selectedRunDetail.candidateVersionType !== "prompt_version") {
      setMessage("当前实验不是 Prompt 版本对比，无法直接生成下一版候选 Prompt");
      return;
    }
    const sourceRef =
      selectedRunDetail.recommendation === "keep" ? selectedRunDetail.candidateVersionRef : selectedRunDetail.baseVersionRef;
    const parsed = parsePromptVersionRef(sourceRef);
    if (!parsed) {
      setMessage("当前 Prompt 版本引用格式不正确，无法生成候选版");
      return;
    }
    setMessage("");
    const response = await fetch("/api/ops/prompts/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promptId: parsed.promptId,
        baseVersion: parsed.version,
        optimizationGoal: [
          `基于实验 ${selectedRunDetail.runCode} 的结果继续优化 ${parsed.promptId}。`,
          `当前系统建议：${selectedRunDetail.recommendation}。`,
          selectedRunDetail.recommendationReason || "",
          "要求延续已有输出契约，优先做小步、可归因、可回滚的 Prompt 调整。",
        ]
          .filter(Boolean)
          .join(" "),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { version?: string } };
    if (!response.ok || !json.success) {
      setMessage(json.error || "基于实验结果生成候选 Prompt 失败");
      return;
    }
    setMessage(`已基于 ${selectedRunDetail.runCode} 生成候选 Prompt 版本 ${json.data?.version || ""}，请到 Prompts 页查看。`);
  }

  const selectedRunHighlights = selectedRunDetail
    ? (() => {
        const rankedResults = selectedRunDetail.results.map((result) => ({
          result,
          deltaTotal: getResultDeltaTotal(result),
          caseError: getResultCaseError(result),
        }));
        const topImproved = rankedResults
          .filter((item) => (item.deltaTotal ?? -Infinity) > 0)
          .sort((left, right) => (right.deltaTotal ?? -Infinity) - (left.deltaTotal ?? -Infinity))
          .slice(0, 3);
        const topRegressed = rankedResults
          .filter((item) => (item.deltaTotal ?? Infinity) < 0)
          .sort((left, right) => (left.deltaTotal ?? Infinity) - (right.deltaTotal ?? Infinity))
          .slice(0, 3);
        const failingResults = rankedResults.filter((item) => item.caseError).slice(0, 3);
        const scoreComparisons = [
          { label: "质量分", field: "qualityScore" as const },
          { label: "爆款分", field: "viralScore" as const },
          { label: "标题点击力", field: "headlineScore" as const },
          { label: "开头留存力", field: "hookScore" as const },
          { label: "信息密度", field: "densityScore" as const },
          { label: "语言自然度", field: "languageScore" as const },
          { label: "读者收益感", field: "readerValueScore" as const },
          { label: "分享性", field: "shareabilityScore" as const },
        ].map((metric) => {
          const candidateAverage = averageNumbers(selectedRunDetail.results.map((result) => result[metric.field]));
          const baselineAverage = averageNumbers(selectedRunDetail.results.map((result) => getBaselineScore(result, metric.field)));
          return {
            ...metric,
            candidateAverage,
            baselineAverage,
            deltaAverage:
              candidateAverage !== null && baselineAverage !== null ? candidateAverage - baselineAverage : null,
          };
        });
        const scoreTrend = selectedRunDetail.results.map((result) => {
          const baselineTotal = getNumber(getRecord(getRecord(result.judgePayload.baseline).scores).total_score);
          return {
            id: result.id,
            caseId: result.caseId,
            taskCode: result.taskCode || `case-${result.caseId}`,
            topicTitle: result.topicTitle || "未命名选题",
            candidateTotal: result.totalScore,
            baselineTotal,
            deltaTotal: getResultDeltaTotal(result),
          };
        });
        return { topImproved, topRegressed, failingResults, scoreComparisons, scoreTrend };
      })()
    : null;

  return (
    <div className="space-y-8">
      <section className={uiPrimitives.opsPanel + " p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100">写作自动优化闭环</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
              Runs 页现在专注实验编排、结果对比和线上回流；评测集与样本维护已经迁到独立的 Datasets 页，避免一个页面承担两类职责。
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/ops/writing-eval" className={uiPrimitives.opsSecondaryButton}>
              Overview
            </Link>
            <Link href="/ops/writing-eval/datasets" className={uiPrimitives.opsSecondaryButton}>
              Datasets
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">实验上下文</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">当前可用评测集</h2>
            </div>
            <div className="text-sm text-stone-500">{datasets.length} 个数据集</div>
          </div>
          {focusDataset ? (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border border-cinnabar bg-[#1d1413] px-4 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">数据集预选模式</div>
                <div className="mt-2 text-sm leading-7 text-stone-200">
                  当前通过深链预选 dataset #{focusDataset.datasetId}，匹配 {focusDataset.matchedCount} 条。
                </div>
              </div>
              <Link href={focusDataset.clearHref} className={uiPrimitives.opsSecondaryButton}>
                返回默认 Runs 视图
              </Link>
            </div>
          ) : null}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {datasets.map((dataset) => {
              const datasetHref = `/ops/writing-eval/datasets?datasetId=${dataset.id}`;
              const readinessMeta = getDatasetReadinessMeta(dataset.readiness);
              return (
                <article
                  key={dataset.id}
                  className={`border px-4 py-4 ${selectedDatasetId === dataset.id ? "border-cinnabar bg-[#241312]" : "border-stone-800 bg-stone-950"}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDatasetId(dataset.id);
                      setRunForm((prev) => ({ ...prev, datasetId: String(dataset.id) }));
                      replaceRunsUrl(selectedRunId, selectedResultId, dataset.id);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="font-medium text-stone-100">{dataset.name}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-500">{dataset.code}</div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-xs text-stone-400">{dataset.status}</div>
                        <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${readinessMeta.tone}`}>{readinessMeta.label}</span>
                      </div>
                    </div>
                    <div className="mt-3 text-sm leading-6 text-stone-400">{dataset.description || "暂无说明"}</div>
                    <div className="mt-3 text-xs text-stone-500">样本数 {dataset.sampleCount} · 更新于 {new Date(dataset.updatedAt).toLocaleString("zh-CN")}</div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">{readinessMeta.summary}</div>
                  </button>
                  <div className="mt-4">
                    <Link href={datasetHref} className={uiPrimitives.opsSecondaryButton}>
                      打开评测集
                    </Link>
                  </div>
                </article>
              );
            })}
            {datasets.length === 0 ? <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-5 text-sm text-stone-400">还没有评测集。</div> : null}
          </div>
        </div>

        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">数据集职责</div>
          <h2 className="mt-3 font-serifCn text-2xl text-stone-100">样本维护已迁出</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-400">
            <div>当前 Runs 页只负责选择评测集并发起实验，不再直接维护样本。</div>
            <div>
              已选数据集：
              {selectedDatasetId ? (
                <Link href={selectedDatasetHref} className="ml-1 transition hover:text-cinnabar">
                  {datasets.find((item) => item.id === selectedDatasetId)?.name || `#${selectedDatasetId}`}
                </Link>
              ) : (
                <span className="ml-1">未选择</span>
              )}
              。
            </div>
            <div>当前样本数：{loadingCases ? "加载中..." : `${cases.length} 条`} · 启用样本 {cases.filter((item) => item.isEnabled).length}。</div>
          </div>
          <Link href={selectedDatasetHref} className={uiPrimitives.primaryButton + " mt-5 inline-flex"}>
            去 Datasets 管理评测集与样本
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">评分画像</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">评分权重实验对象</h2>
            </div>
            <div className="text-sm text-stone-500">{scoringProfiles.length} 个画像</div>
          </div>
          <div className="mt-5 grid gap-3">
            {scoringProfiles.length === 0 ? (
              <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-5 text-sm text-stone-400">还没有评分画像。</div>
            ) : (
              scoringProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedScoringProfileId(profile.id)}
                  className={`border px-4 py-4 text-left ${selectedScoringProfileId === profile.id ? "border-cinnabar bg-[#1d1413]" : "border-stone-800 bg-stone-950"}`}
                >
                  <div className="font-medium text-stone-100">
                    {profile.name} · {profile.code}
                    {profile.isActive ? " · active" : ""}
                  </div>
                  <div className="mt-2 text-sm text-stone-500">{profile.description || "暂无说明"}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleCreateScoringProfile} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建评分画像</div>
          <input value={scoringProfileForm.code} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="编码，例如 viral-55-default" className={uiPrimitives.opsInput} />
          <input value={scoringProfileForm.name} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" className={uiPrimitives.opsInput} />
          <textarea value={scoringProfileForm.description} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明" className={`min-h-[90px] ${uiPrimitives.opsInput}`} />
          <label className="flex items-center gap-2 text-sm text-stone-400">
            <input type="checkbox" checked={scoringProfileForm.isActive} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            设为 active
          </label>
          <textarea value={scoringProfileForm.config} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, config: event.target.value }))} className={`min-h-[220px] ${uiPrimitives.opsInput}`} placeholder="评分画像配置 JSON" />
          <div className="flex flex-wrap gap-3">
            <button className={uiPrimitives.primaryButton}>创建评分画像</button>
            <button type="button" onClick={() => void handleSaveScoringProfile()} className={uiPrimitives.opsSecondaryButton} disabled={!selectedScoringProfile}>
              保存当前画像
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={handleCreateRun} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发起实验</div>
          <select
            value={runForm.datasetId}
            onChange={(event) => {
              const nextDatasetId = Number(event.target.value);
              setRunForm((prev) => ({ ...prev, datasetId: event.target.value }));
              setSelectedDatasetId(Number.isInteger(nextDatasetId) && nextDatasetId > 0 ? nextDatasetId : null);
              replaceRunsUrl(selectedRunId, selectedResultId, Number.isInteger(nextDatasetId) && nextDatasetId > 0 ? nextDatasetId : null);
            }}
            className={uiPrimitives.opsSelect}
          >
            <option value="">选择评测集</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={String(dataset.id)}>{dataset.name}</option>
            ))}
          </select>
          {selectedRunFormDatasetReadiness ? (
            <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">评测集就绪度</div>
                <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${selectedRunFormDatasetReadinessMeta.tone}`}>
                  {selectedRunFormDatasetReadinessMeta.label}
                </span>
              </div>
              <div className="mt-3 leading-7">
                启用样本 {selectedRunFormDatasetReadiness.enabledCaseCount}/{selectedRunFormDatasetReadiness.totalCaseCount} ·
                标题目标 {selectedRunFormDatasetReadiness.coverage.titleGoal} · 开头目标 {selectedRunFormDatasetReadiness.coverage.hookGoal} ·
                传播目标 {selectedRunFormDatasetReadiness.coverage.shareTriggerGoal} · 事实素材 {selectedRunFormDatasetReadiness.coverage.sourceFacts}
              </div>
              <div className="mt-2 text-xs leading-6 text-stone-500">
                题型 {selectedRunFormDatasetReadiness.qualityTargets.distinctTaskTypeCount}/4 ·
                light {selectedRunFormDatasetReadiness.qualityTargets.lightCount} ·
                medium {selectedRunFormDatasetReadiness.qualityTargets.mediumCount} ·
                hard {selectedRunFormDatasetReadiness.qualityTargets.hardCount} ·
                好稿 {selectedRunFormDatasetReadiness.qualityTargets.referenceGoodOutputCount} ·
                反例 {selectedRunFormDatasetReadiness.qualityTargets.referenceBadPatternsCount} ·
                mustUseFacts {selectedRunFormDatasetReadiness.qualityTargets.mustUseFactsCount}
              </div>
              {selectedRunFormDatasetReadiness.blockers.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-cinnabar">阻断项：{selectedRunFormDatasetReadiness.blockers.join("；")}</div>
              ) : null}
              {selectedRunFormDatasetReadiness.warnings.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-amber-200">告警：{selectedRunFormDatasetReadiness.warnings.slice(0, 3).join("；")}</div>
              ) : null}
            </div>
          ) : null}
          <select
            value={runForm.experimentMode}
            onChange={(event) => {
              const nextExperimentMode = event.target.value;
              const requiredPromptTargetId = getRequiredPromptTargetIdForExperimentMode(nextExperimentMode);
              const nextPromptTargetId = requiredPromptTargetId ?? promptTargetId;
              const nextPromptOptions = getVersionOptionsByType("prompt_version", promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId);
              setPromptTargetId(nextPromptTargetId);
              setRunForm((prev) => ({
                ...prev,
                experimentMode: nextExperimentMode,
                baseVersionType: requiredPromptTargetId ? "prompt_version" : prev.baseVersionType,
                candidateVersionType: requiredPromptTargetId ? "prompt_version" : prev.candidateVersionType,
                baseVersionRef: requiredPromptTargetId
                  ? nextPromptOptions[0]?.value ?? ""
                  : prev.baseVersionType === "prompt_version"
                    ? getVersionOptionsByType(prev.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId)[0]?.value ?? prev.baseVersionRef
                    : prev.baseVersionRef,
                candidateVersionRef: requiredPromptTargetId
                  ? nextPromptOptions[0]?.value ?? ""
                  : prev.candidateVersionType === "prompt_version"
                    ? getVersionOptionsByType(prev.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId)[0]?.value ?? prev.candidateVersionRef
                    : prev.candidateVersionRef,
              }));
            }}
            className={uiPrimitives.opsSelect}
          >
            <option value="full_article">全文实验</option>
            <option value="title_only">只优化标题</option>
            <option value="lead_only">只优化开头</option>
          </select>
          <select
            value={promptTargetId}
            onChange={(event) => {
              const nextPromptTargetId = event.target.value;
              const nextBaseOptions = getVersionOptionsByType(runForm.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId);
              const nextCandidateOptions = getVersionOptionsByType(runForm.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId);
              setPromptTargetId(nextPromptTargetId);
              setRunForm((prev) => ({
                ...prev,
                baseVersionRef: prev.baseVersionType === "prompt_version" ? nextBaseOptions[0]?.value ?? "" : prev.baseVersionRef,
                candidateVersionRef: prev.candidateVersionType === "prompt_version" ? nextCandidateOptions[0]?.value ?? "" : prev.candidateVersionRef,
              }));
            }}
            className={uiPrimitives.opsSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            {promptTargets.map((target) => (
              <option key={target.promptId} value={target.promptId}>{target.label}</option>
            ))}
          </select>
          <div className="text-xs leading-6 text-stone-500">
            {runForm.experimentMode === "title_only"
              ? "标题专项实验会固定到 outline_planning，仅比较标题候选对点击力的影响。"
              : runForm.experimentMode === "lead_only"
                ? "开头专项实验会固定到 prose_polish，仅比较首段改写对留存力的影响。"
                : hasLayoutStrategyOptions
                  ? hasApplyCommandTemplateOptions
                    ? "全文实验可比较完整写作 Prompt、评分画像、写作风格资产与 apply command 模板。"
                    : "全文实验可比较完整写作 Prompt、评分画像或写作风格资产。"
                  : hasApplyCommandTemplateOptions
                    ? "全文实验可比较完整写作 Prompt、评分画像与 apply command 模板；当前还没有可用写作风格资产。"
                    : "全文实验可比较完整写作 Prompt 与评分画像；当前还没有可用写作风格资产。"}
          </div>
          <select
            value={runForm.baseVersionType}
            onChange={(event) =>
              setRunForm((prev) => ({
                ...prev,
                baseVersionType: event.target.value,
                baseVersionRef: getVersionOptionsByType(event.target.value, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId)[0]?.value ?? "",
              }))
            }
            className={uiPrimitives.opsSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            <option value="prompt_version">prompt_version</option>
            <option value="scoring_profile">scoring_profile</option>
            <option value="layout_strategy" disabled={!hasLayoutStrategyOptions}>{getVersionTypeLabel("layout_strategy")}</option>
            <option value="apply_command_template" disabled={!hasApplyCommandTemplateOptions}>apply_command_template</option>
          </select>
          <select value={runForm.baseVersionRef} onChange={(event) => setRunForm((prev) => ({ ...prev, baseVersionRef: event.target.value }))} className={uiPrimitives.opsSelect}>
            {getVersionOptionsByType(runForm.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).length > 0 ? (
              getVersionOptionsByType(runForm.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).map((option) => (
                <option key={`base-${option.value}`} value={option.value}>{option.label}</option>
              ))
            ) : (
              <option value="">暂无可用版本</option>
            )}
          </select>
          <select
            value={runForm.candidateVersionType}
            onChange={(event) =>
              setRunForm((prev) => ({
                ...prev,
                candidateVersionType: event.target.value,
                candidateVersionRef: getVersionOptionsByType(event.target.value, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId)[0]?.value ?? "",
              }))
            }
            className={uiPrimitives.opsSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            <option value="prompt_version">prompt_version</option>
            <option value="scoring_profile">scoring_profile</option>
            <option value="layout_strategy" disabled={!hasLayoutStrategyOptions}>{getVersionTypeLabel("layout_strategy")}</option>
            <option value="apply_command_template" disabled={!hasApplyCommandTemplateOptions}>apply_command_template</option>
          </select>
          <select value={runForm.candidateVersionRef} onChange={(event) => setRunForm((prev) => ({ ...prev, candidateVersionRef: event.target.value }))} className={uiPrimitives.opsSelect}>
            {getVersionOptionsByType(runForm.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).length > 0 ? (
              getVersionOptionsByType(runForm.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).map((option) => (
                <option key={`candidate-${option.value}`} value={option.value}>{option.label}</option>
              ))
            ) : (
              <option value="">暂无可用版本</option>
            )}
          </select>
          <select value={runForm.triggerMode} onChange={(event) => setRunForm((prev) => ({ ...prev, triggerMode: event.target.value }))} className={uiPrimitives.opsSelect}>
            <option value="manual">manual</option>
            <option value="scheduled">scheduled</option>
            <option value="agent">agent</option>
          </select>
          <select value={runForm.decisionMode} onChange={(event) => setRunForm((prev) => ({ ...prev, decisionMode: event.target.value }))} className={uiPrimitives.opsSelect}>
            <option value="manual_review">人工审核</option>
            <option value="auto_keep">自动 keep</option>
            <option value="auto_keep_or_discard">自动 keep/discard</option>
          </select>
          <textarea value={runForm.summary} onChange={(event) => setRunForm((prev) => ({ ...prev, summary: event.target.value }))} className={`min-h-[100px] ${uiPrimitives.opsInput}`} placeholder="实验摘要，可选" />
          <button className={uiPrimitives.primaryButton} disabled={!canCreateRun}>
            创建实验运行
          </button>
          {!canCreateRun ? (
            <div className="text-xs leading-6 text-cinnabar">
              {getRunCreationBlockedMessage({
                dataset: selectedRunFormDataset,
                readiness: selectedRunFormDatasetReadiness,
                triggerMode: runForm.triggerMode,
                decisionMode: runForm.decisionMode,
              })}
            </div>
          ) : null}
        </form>

        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">实验运行</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">当前队列与历史记录</h2>
            </div>
            <div className="text-sm text-stone-500">{runs.length} 条运行记录</div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-stone-500">
                <tr>
                  {["Run", "模式", "决议", "数据集", "基线", "候选", "状态", "质量分", "爆款分", "候选总分", "Delta", "创建时间"].map((head) => (
                    <th key={head} className="pb-4 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  (() => {
                    const runDatasetHref = `/ops/writing-eval/datasets?datasetId=${run.datasetId}`;
                    const runBasePromptHref = run.baseVersionType === "prompt_version" ? buildPromptFocusHref(run.baseVersionRef) : null;
                    const runCandidatePromptHref = run.candidateVersionType === "prompt_version" ? buildPromptFocusHref(run.candidateVersionRef) : null;
                    return (
                      <tr
                        key={run.id}
                        className={`cursor-pointer border-t border-stone-800 ${selectedRunId === run.id ? "bg-[#1d1413]" : ""}`}
                        onClick={() => {
                          void loadRunDetail(run.id);
                        }}
                      >
                        <td className="py-4 font-mono text-xs text-stone-300">{run.runCode}</td>
                        <td className="py-4 text-stone-400">{getExperimentModeLabel(run.experimentMode)}</td>
                        <td className="py-4 text-stone-400">
                          <div>{getDecisionModeLabel(run.decisionMode)}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {getResolutionStatusLabel(run.resolutionStatus)}
                            {run.resolvedAt ? ` · ${new Date(run.resolvedAt).toLocaleString("zh-CN")}` : ""}
                          </div>
                        </td>
                        <td className="py-4 text-stone-400">
                          <Link href={runDatasetHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                            {run.datasetName || `#${run.datasetId}`}
                          </Link>
                        </td>
                        <td className="py-4 text-stone-400">
                          {runBasePromptHref ? (
                            <Link href={runBasePromptHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                              {run.baseVersionRef}
                            </Link>
                          ) : (
                            run.baseVersionRef
                          )}
                        </td>
                        <td className="py-4 text-stone-400">
                          {runCandidatePromptHref ? (
                            <Link href={runCandidatePromptHref} onClick={(event) => event.stopPropagation()} className="transition hover:text-cinnabar">
                              {run.candidateVersionRef}
                            </Link>
                          ) : (
                            run.candidateVersionRef
                          )}
                        </td>
                        <td className="py-4 text-stone-100">{run.status}</td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.qualityScore === "number" ? run.scoreSummary.qualityScore.toFixed(2) : "--"}</td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.viralScore === "number" ? run.scoreSummary.viralScore.toFixed(2) : "--"}</td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.totalScore === "number" ? run.scoreSummary.totalScore.toFixed(2) : "--"}</td>
                        <td className={`py-4 ${typeof run.scoreSummary.deltaTotalScore === "number" && run.scoreSummary.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                          {typeof run.scoreSummary.deltaTotalScore === "number" ? `${run.scoreSummary.deltaTotalScore >= 0 ? "+" : ""}${run.scoreSummary.deltaTotalScore.toFixed(2)}` : "--"}
                        </td>
                        <td className="py-4 text-stone-400">{new Date(run.createdAt).toLocaleString("zh-CN")}</td>
                      </tr>
                    );
                  })()
                ))}
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-6 text-sm text-stone-500">还没有实验运行记录。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form onSubmit={handleCreateSchedule} className={uiPrimitives.opsPanel + " space-y-3 p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动触发</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">创建调度规则</h2>
            </div>
            <button
              type="button"
              className={uiPrimitives.opsSecondaryButton}
              onClick={() =>
                setScheduleForm((prev) => ({
                  ...prev,
                  name:
                    prev.name ||
                    `${datasets.find((item) => String(item.id) === runForm.datasetId)?.name || "未命名数据集"} · ${getExperimentModeLabel(runForm.experimentMode)}`,
                  summary: runForm.summary,
                }))
              }
            >
              用当前实验填充
            </button>
          </div>
          <input
            value={scheduleForm.name}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="规则名称，例如 每日标题实验"
            className={uiPrimitives.opsInput}
          />
          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm leading-7 text-stone-400">
            数据集：
            {runFormDatasetHref ? (
              <Link href={runFormDatasetHref} className="ml-1 transition hover:text-cinnabar">
                {datasets.find((item) => String(item.id) === runForm.datasetId)?.name || "未选择"}
              </Link>
            ) : (
              <span className="ml-1">{datasets.find((item) => String(item.id) === runForm.datasetId)?.name || "未选择"}</span>
            )}
            <br />
            模式：{getExperimentModeLabel(runForm.experimentMode)}
            <br />
            决议：{getDecisionModeLabel(runForm.decisionMode)}
            <br />
            基线：
            {runFormBasePromptHref ? (
              <Link href={runFormBasePromptHref} className="ml-1 transition hover:text-cinnabar">
                {runForm.baseVersionRef || "未选择"}
              </Link>
            ) : (
              <span className="ml-1">{runForm.baseVersionRef || "未选择"}</span>
            )}
            <br />
            候选：
            {runFormCandidatePromptHref ? (
              <Link href={runFormCandidatePromptHref} className="ml-1 transition hover:text-cinnabar">
                {runForm.candidateVersionRef || "未选择"}
              </Link>
            ) : (
              <span className="ml-1">{runForm.candidateVersionRef || "未选择"}</span>
            )}
          </div>
          {selectedRunFormDatasetReadiness ? (
            <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">调度前置守卫</div>
                <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${selectedRunFormDatasetReadinessMeta.tone}`}>
                  {selectedRunFormDatasetReadinessMeta.label}
                </span>
              </div>
              <div className="mt-3 leading-7">
                {scheduleForm.decisionMode === "manual_review"
                  ? "manual_review 调度允许 warning 数据集，但 blocked 数据集不会放行。"
                  : "自动决议调度仅允许 ready 数据集，避免低质量评测集直接驱动 keep/discard。"}
              </div>
              {selectedRunFormDatasetReadiness.blockers.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-cinnabar">阻断项：{selectedRunFormDatasetReadiness.blockers.join("；")}</div>
              ) : null}
              {selectedRunFormDatasetReadiness.warnings.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-amber-200">告警：{selectedRunFormDatasetReadiness.warnings.slice(0, 3).join("；")}</div>
              ) : null}
            </div>
          ) : null}
          <select
            value={scheduleForm.triggerMode}
            onChange={(event) =>
              setScheduleForm((prev) => ({
                ...prev,
                triggerMode: event.target.value,
                agentStrategy: event.target.value === "agent" ? prev.agentStrategy || "default" : "default",
              }))
            }
            className={uiPrimitives.opsSelect}
          >
            <option value="scheduled">scheduled</option>
            <option value="agent">agent</option>
          </select>
          <select
            value={scheduleForm.decisionMode}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, decisionMode: event.target.value }))}
            className={uiPrimitives.opsSelect}
          >
            <option value="manual_review">人工审核</option>
            <option value="auto_keep">自动 keep</option>
            <option value="auto_keep_or_discard">自动 keep/discard</option>
          </select>
          {scheduleForm.triggerMode === "agent" ? (
            <div className="space-y-3">
              <select
                value={currentCreateStrategyPreset?.code ?? "__custom__"}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "__custom__") return;
                  setScheduleForm((prev) => applyAgentStrategyPresetToForm(prev, nextValue));
                }}
                className={uiPrimitives.opsSelect}
              >
                {WRITING_EVAL_AGENT_STRATEGY_PRESETS.map((preset) => (
                  <option key={preset.code} value={preset.code}>
                    {preset.label} · {preset.code} · P{preset.recommendedPriority}
                  </option>
                ))}
                <option value="__custom__">自定义策略标签</option>
              </select>
              <input
                value={scheduleForm.agentStrategy}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, agentStrategy: event.target.value }))}
                placeholder="agent 策略标签，例如 default / calibration / title_lab"
                className={uiPrimitives.opsInput}
              />
              <div className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-500">
                {currentCreateStrategyPreset ? (
                  <>
                    {currentCreateStrategyPreset.label}：{currentCreateStrategyPreset.description}
                    <br />
                    推荐优先级：P{currentCreateStrategyPreset.recommendedPriority}
                  </>
                ) : (
                  "当前使用自定义策略标签；建议仅在已有运营约定时使用。"
                )}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <input
              value={scheduleForm.priority}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, priority: event.target.value }))}
              placeholder="优先级，越大越先派发"
              className={uiPrimitives.opsInput}
            />
            <input
              value={scheduleForm.cadenceHours}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, cadenceHours: event.target.value }))}
              placeholder="间隔小时数，例如 24"
              className={uiPrimitives.opsInput}
            />
            <input
              type="datetime-local"
              value={scheduleForm.nextRunAt}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, nextRunAt: event.target.value }))}
              className={uiPrimitives.opsInput}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-400">
            <input type="checkbox" checked={scheduleForm.isEnabled} onChange={(event) => setScheduleForm((prev) => ({ ...prev, isEnabled: event.target.checked }))} />
            创建后立即启用
          </label>
          <textarea
            value={scheduleForm.summary}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, summary: event.target.value }))}
            className={`min-h-[96px] ${uiPrimitives.opsInput}`}
            placeholder="规则说明，可选"
          />
          <button className={uiPrimitives.primaryButton} disabled={savingSchedule || !canCreateSchedule}>
            {savingSchedule ? "创建中..." : "创建调度规则"}
          </button>
          {!canCreateSchedule ? (
            <div className="text-xs leading-6 text-cinnabar">
              {getScheduleCreationBlockedMessage({
                dataset: selectedRunFormDataset,
                readiness: selectedRunFormDatasetReadiness,
                decisionMode: scheduleForm.decisionMode,
              })}
            </div>
          ) : null}
        </form>

        <div className={uiPrimitives.opsPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">调度编排</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100">自动实验规则</h2>
            </div>
            <button type="button" className={uiPrimitives.opsSecondaryButton} onClick={() => void handleDispatchDueSchedules()} disabled={dispatchingDue}>
              {dispatchingDue ? "派发中..." : "派发到期规则"}
            </button>
          </div>
          {focusSchedule ? (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border border-cinnabar bg-[#1d1413] px-4 py-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">调度聚焦模式</div>
                <div className="mt-2 text-sm leading-7 text-stone-200">
                  当前只展示 schedule #{focusSchedule.scheduleId}，共 {focusSchedule.matchedCount} 条。
                </div>
              </div>
              <Link href={focusSchedule.clearHref} className={uiPrimitives.opsSecondaryButton}>
                返回全量调度
              </Link>
            </div>
          ) : null}
          {lastDispatchDueSkipped.length > 0 ? (
            <div className="mt-4 border border-amber-400/40 bg-[#211913] px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-amber-200">最近一次批量跳过</div>
              <div className="mt-3 space-y-3">
                {lastDispatchDueSkipped.map((item) => {
                  const matchedSchedule = schedules.find((schedule) => schedule.id === item.scheduleId) ?? null;
                  const skippedDatasetHref = matchedSchedule ? `/ops/writing-eval/datasets?datasetId=${matchedSchedule.datasetId}` : null;
                  return (
                    <div key={`skipped-${item.scheduleId}`} className="border border-stone-800 bg-stone-950 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-stone-100">{item.scheduleName}</div>
                          <div className="mt-2 text-xs leading-6 text-amber-200">{item.reason}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/ops/writing-eval/runs?scheduleId=${item.scheduleId}`} className={uiPrimitives.opsSecondaryButton}>
                            打开规则
                          </Link>
                          {skippedDatasetHref ? (
                            <Link href={skippedDatasetHref} className={uiPrimitives.opsSecondaryButton}>
                              打开评测集
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="mt-4 border border-stone-800 bg-stone-950 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
              <span>总规则 {displayedSchedules.length}</span>
              <span>启用 {enabledDisplayedScheduleCount}</span>
              <span>可执行 {executableDisplayedScheduleCount}</span>
              {blockedDisplayedSchedules.length > 0 ? <span className="text-cinnabar">阻断 {blockedDisplayedSchedules.length}</span> : null}
            </div>
            {blockedDisplayedSchedules.length > 0 ? (
              <div className="mt-3 space-y-2">
                {blockedDisplayedSchedules.slice(0, 3).map((schedule) => (
                  <div key={`blocked-summary-${schedule.id}`} className="text-xs leading-6 text-stone-400">
                    <Link href={`/ops/writing-eval/runs?scheduleId=${schedule.id}`} className="transition hover:text-cinnabar">
                      {schedule.name}
                    </Link>
                    {` · ${schedule.datasetStatus} · `}
                    {(schedule.readiness.blockers[0] || schedule.readiness.warnings[0] || "当前规则不可执行").trim()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-stone-500">当前展示范围内的启用规则都可执行。</div>
            )}
          </div>
          <div className="mt-5 space-y-3">
            {displayedSchedules.map((schedule) => (
              <div key={schedule.id} className={`border bg-stone-950 px-4 py-4 ${focusSchedule?.scheduleId === schedule.id ? "border-cinnabar bg-[#1d1413]" : "border-stone-800"}`}>
                {(() => {
                  const isEditing = editingScheduleId === schedule.id;
                  const scheduleDatasetHref = `/ops/writing-eval/datasets?datasetId=${schedule.datasetId}`;
                  const scheduleReadinessMeta = getDatasetReadinessMeta(schedule.readiness);
                  const scheduleDispatchBlocked =
                    schedule.readiness.status === "blocked"
                    || (schedule.decisionMode !== "manual_review" && schedule.readiness.status !== "ready");
                  const scheduleBasePromptHref =
                    schedule.baseVersionType === "prompt_version" ? buildPromptFocusHref(schedule.baseVersionRef) : null;
                  const scheduleCandidatePromptHref =
                    schedule.candidateVersionType === "prompt_version" ? buildPromptFocusHref(schedule.candidateVersionRef) : null;
                  const scheduleLastRunHref = schedule.lastRunId ? `/ops/writing-eval/runs?runId=${schedule.lastRunId}` : null;
                  return (
                    <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-stone-100">{schedule.name}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                      P{schedule.priority} · {schedule.triggerMode} · {getDecisionModeLabel(schedule.decisionMode)} · 每 {schedule.cadenceHours} 小时 · {schedule.isEnabled ? "enabled" : "disabled"}
                    </div>
                    <div className="mt-2">
                      <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${scheduleReadinessMeta.tone}`}>{scheduleReadinessMeta.label}</span>
                    </div>
                    {schedule.triggerMode === "agent" ? (
                      <div className="mt-2 text-xs text-stone-500">
                        agentStrategy: {getWritingEvalAgentStrategyLabel(schedule.agentStrategy)} ({schedule.agentStrategy})
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-stone-500">
                      <input
                        type="checkbox"
                        checked={schedule.isEnabled}
                        onChange={(event) => void handleToggleSchedule(schedule.id, event.target.checked)}
                        disabled={savingScheduleId === schedule.id}
                      />
                      <span className="ml-2">{schedule.isEnabled ? "启用" : "停用"}</span>
                    </label>
                    <button
                      type="button"
                      className={uiPrimitives.opsSecondaryButton}
                      onClick={() => (isEditing ? handleCancelEditSchedule() : handleStartEditSchedule(schedule))}
                      disabled={savingScheduleId === schedule.id}
                    >
                      {isEditing ? "取消编辑" : "编辑"}
                    </button>
                    <button
                      type="button"
                      className={uiPrimitives.opsSecondaryButton}
                      onClick={() => void handleDispatchSchedule(schedule.id)}
                      disabled={dispatchingScheduleId === schedule.id || savingScheduleId === schedule.id || scheduleDispatchBlocked}
                    >
                      {dispatchingScheduleId === schedule.id ? "派发中..." : scheduleDispatchBlocked ? "守卫阻断" : "立即派发"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 text-sm leading-7 text-stone-400">
                  数据集：
                  <Link href={scheduleDatasetHref} className="ml-1 transition hover:text-cinnabar">
                    {schedule.datasetName || `#${schedule.datasetId}`}
                  </Link>
                  <br />
                  模式：{getExperimentModeLabel(schedule.experimentMode)}
                  <br />
                  基线：
                  {scheduleBasePromptHref ? (
                    <Link href={scheduleBasePromptHref} className="ml-1 transition hover:text-cinnabar">
                      {schedule.baseVersionRef}
                    </Link>
                  ) : (
                    <span className="ml-1">{schedule.baseVersionRef}</span>
                  )}
                  <br />
                  候选：
                  {scheduleCandidatePromptHref ? (
                    <Link href={scheduleCandidatePromptHref} className="ml-1 transition hover:text-cinnabar">
                      {schedule.candidateVersionRef}
                    </Link>
                  ) : (
                    <span className="ml-1">{schedule.candidateVersionRef}</span>
                  )}
                  <br />
                  优先级：{schedule.priority}（数值越大越先派发）
                  <br />
                  决议策略：{getDecisionModeLabel(schedule.decisionMode)}
                  <br />
                  下次执行：{schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString("zh-CN") : "未设置"}
                  <br />
                  最近派发：{schedule.lastDispatchedAt ? new Date(schedule.lastDispatchedAt).toLocaleString("zh-CN") : "暂无"}
                  <br />
                  最近 Run：
                  {schedule.lastRunCode && scheduleLastRunHref ? (
                    <Link href={scheduleLastRunHref} className="ml-1 transition hover:text-cinnabar">
                      {`${schedule.lastRunCode} · ${schedule.lastRunStatus || "--"}`}
                    </Link>
                  ) : (
                    <span className="ml-1">{schedule.lastRunCode ? `${schedule.lastRunCode} · ${schedule.lastRunStatus || "--"}` : "暂无"}</span>
                  )}
                </div>
                <div className="mt-3 text-xs leading-6 text-stone-500">
                  {scheduleReadinessMeta.summary}
                  {schedule.readiness.status === "warning" && schedule.decisionMode !== "manual_review"
                    ? " 当前规则使用自动决议，建议先补齐数据集覆盖后再继续。"
                    : ""}
                </div>
                {schedule.readiness.blockers.length > 0 ? (
                  <div className="mt-2 text-sm text-cinnabar">守卫阻断：{schedule.readiness.blockers.join("；")}</div>
                ) : null}
                {schedule.readiness.warnings.length > 0 ? (
                  <div className="mt-2 text-sm text-amber-200">覆盖告警：{schedule.readiness.warnings.slice(0, 3).join("；")}</div>
                ) : null}
                {schedule.summary ? <div className="mt-3 text-sm text-stone-500">{schedule.summary}</div> : null}
                {schedule.lastError ? <div className="mt-3 text-sm text-cinnabar">最近错误：{schedule.lastError}</div> : null}
                {isEditing ? (
                  <div className="mt-4 space-y-3 border-t border-stone-800 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">编辑规则</div>
                      <button type="button" className={uiPrimitives.opsSecondaryButton} onClick={handleApplyCurrentRunToEditingSchedule}>
                        用当前实验覆盖定义
                      </button>
                    </div>
                    <input
                      value={scheduleEditorForm.name}
                      onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, name: event.target.value }))}
                      className={uiPrimitives.opsInput}
                      placeholder="规则名称"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={scheduleEditorForm.triggerMode}
                        onChange={(event) =>
                          setScheduleEditorForm((prev) => ({
                            ...prev,
                            triggerMode: event.target.value,
                            agentStrategy: event.target.value === "agent" ? prev.agentStrategy || "default" : "default",
                          }))
                        }
                        className={uiPrimitives.opsSelect}
                      >
                        <option value="scheduled">scheduled</option>
                        <option value="agent">agent</option>
                      </select>
                      <select
                        value={scheduleEditorForm.decisionMode}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, decisionMode: event.target.value }))}
                        className={uiPrimitives.opsSelect}
                      >
                        <option value="manual_review">人工审核</option>
                        <option value="auto_keep">自动 keep</option>
                        <option value="auto_keep_or_discard">自动 keep/discard</option>
                      </select>
                      {scheduleEditorForm.triggerMode === "agent" ? (
                        <div className="space-y-3">
                          <select
                            value={currentEditorStrategyPreset?.code ?? "__custom__"}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "__custom__") return;
                              setScheduleEditorForm((prev) => applyAgentStrategyPresetToForm(prev, nextValue));
                            }}
                            className={uiPrimitives.opsSelect}
                          >
                            {WRITING_EVAL_AGENT_STRATEGY_PRESETS.map((preset) => (
                              <option key={preset.code} value={preset.code}>
                                {preset.label} · {preset.code} · P{preset.recommendedPriority}
                              </option>
                            ))}
                            <option value="__custom__">自定义策略标签</option>
                          </select>
                          <input
                            value={scheduleEditorForm.agentStrategy}
                            onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, agentStrategy: event.target.value }))}
                            className={uiPrimitives.opsInput}
                            placeholder="agent 策略标签"
                          />
                          <div className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm leading-6 text-stone-500">
                            {currentEditorStrategyPreset ? (
                              <>
                                {currentEditorStrategyPreset.label}：{currentEditorStrategyPreset.description}
                                <br />
                                推荐优先级：P{currentEditorStrategyPreset.recommendedPriority}
                              </>
                            ) : (
                              "当前使用自定义策略标签；请确保调度器已包含该 lane。"
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-500">当前为 scheduled 规则，不单独指定 agent 策略。</div>
                      )}
                      <input
                        value={scheduleEditorForm.priority}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, priority: event.target.value }))}
                        className={uiPrimitives.opsInput}
                        placeholder="优先级，越大越先派发"
                      />
                      <input
                        value={scheduleEditorForm.cadenceHours}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, cadenceHours: event.target.value }))}
                        className={uiPrimitives.opsInput}
                        placeholder="间隔小时数"
                      />
                      <input
                        type="datetime-local"
                        value={scheduleEditorForm.nextRunAt}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, nextRunAt: event.target.value }))}
                        className={uiPrimitives.opsInput}
                      />
                      <label className="flex items-center gap-2 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-400">
                        <input
                          type="checkbox"
                          checked={scheduleEditorForm.isEnabled}
                          onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                        />
                        保存后启用该规则
                      </label>
                    </div>
                    <div className="border border-stone-800 bg-[#140f0f] px-4 py-4 text-sm leading-7 text-stone-400">
                      数据集：
                      {scheduleEditorDatasetHref ? (
                        <Link href={scheduleEditorDatasetHref} className="ml-1 transition hover:text-cinnabar">
                          {datasets.find((item) => String(item.id) === scheduleEditorForm.datasetId)?.name || `#${scheduleEditorForm.datasetId || "未设置"}`}
                        </Link>
                      ) : (
                        <span className="ml-1">{datasets.find((item) => String(item.id) === scheduleEditorForm.datasetId)?.name || `#${scheduleEditorForm.datasetId || "未设置"}`}</span>
                      )}
                      <br />
                      模式：{getExperimentModeLabel(scheduleEditorForm.experimentMode)}
                      <br />
                      触发：{scheduleEditorForm.triggerMode}
                      {scheduleEditorForm.triggerMode === "agent" ? ` · strategy:${scheduleEditorForm.agentStrategy || "default"}` : ""}
                      {` · decision:${getDecisionModeLabel(scheduleEditorForm.decisionMode)}`}
                      {` · priority:${scheduleEditorForm.priority || "100"}`}
                      <br />
                      基线：
                      {scheduleEditorBasePromptHref ? (
                        <Link href={scheduleEditorBasePromptHref} className="ml-1 transition hover:text-cinnabar">
                          {scheduleEditorForm.baseVersionRef || "未设置"}
                        </Link>
                      ) : (
                        <span className="ml-1">{scheduleEditorForm.baseVersionRef || "未设置"}</span>
                      )}
                      <br />
                      候选：
                      {scheduleEditorCandidatePromptHref ? (
                        <Link href={scheduleEditorCandidatePromptHref} className="ml-1 transition hover:text-cinnabar">
                          {scheduleEditorForm.candidateVersionRef || "未设置"}
                        </Link>
                      ) : (
                        <span className="ml-1">{scheduleEditorForm.candidateVersionRef || "未设置"}</span>
                      )}
                    </div>
                    <textarea
                      value={scheduleEditorForm.summary}
                      onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, summary: event.target.value }))}
                      className={`min-h-[96px] ${uiPrimitives.opsInput}`}
                      placeholder="规则说明，可选"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className={uiPrimitives.primaryButton}
                        onClick={() => void handleSaveSchedule(schedule.id)}
                        disabled={savingScheduleId === schedule.id}
                      >
                        {savingScheduleId === schedule.id ? "保存中..." : "保存规则"}
                      </button>
                      <button type="button" className={uiPrimitives.opsSecondaryButton} onClick={handleCancelEditSchedule} disabled={savingScheduleId === schedule.id}>
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}
                    </>
                  );
                })()}
              </div>
            ))}
            {displayedSchedules.length === 0 ? (
              <div className="text-sm text-stone-500">
                {focusSchedule ? "当前聚焦的调度规则不存在或已被移除。" : "当前还没有调度规则。"}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className={uiPrimitives.opsPanel + " p-5"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">运行详情</div>
            <h2 className="mt-3 font-serifCn text-2xl text-stone-100">
              {selectedRunDetail ? `Run ${selectedRunDetail.runCode}` : "选择一条实验运行"}
            </h2>
          </div>
          <div className="text-sm text-stone-500">
            {loadingRunDetail ? "加载详情中..." : selectedRunDetail ? `${selectedRunDetail.results.length} 条样本结果` : "暂无详情"}
          </div>
        </div>

        {selectedRunDetail ? (
          <div className="mt-6 space-y-6">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                {
                  label: "候选总分",
                  value: getNumber(selectedRunDetail.scoreSummary.totalScore),
                  tone: "text-stone-100",
                },
                {
                  label: "基线总分",
                  value: getNumber(selectedRunDetail.scoreSummary.baseTotalScore),
                  tone: "text-stone-300",
                },
                {
                  label: "总分 Delta",
                  value: getNumber(selectedRunDetail.scoreSummary.deltaTotalScore),
                  tone:
                    (getNumber(selectedRunDetail.scoreSummary.deltaTotalScore) ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-cinnabar",
                },
                {
                  label: "候选质量",
                  value: getNumber(selectedRunDetail.scoreSummary.qualityScore),
                  tone: "text-stone-100",
                },
                {
                  label: "候选爆款",
                  value: getNumber(selectedRunDetail.scoreSummary.viralScore),
                  tone: "text-stone-100",
                },
                {
                  label: "提升样本",
                  value: getNumber(selectedRunDetail.scoreSummary.improvedCaseCount),
                  tone: "text-emerald-400",
                },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{item.label}</div>
                  <div className={`mt-3 text-2xl ${item.tone}`}>
                    {item.value === null ? "--" : Number.isInteger(item.value) ? item.value : item.value.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <section className="border border-stone-800 bg-stone-950 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">分项得分对比</div>
                  <h3 className="mt-3 text-lg text-stone-100">候选均值 vs 基线均值</h3>
                </div>
                <div className="text-xs text-stone-500">按当前运行全部样本聚合</div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {selectedRunHighlights?.scoreComparisons.map((item) => (
                  <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.16em] text-stone-600">候选</div>
                        <div className="mt-1 text-xl text-stone-100">{formatMetric(item.candidateAverage, "", 2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-stone-600">基线</div>
                        <div className="mt-1 text-lg text-stone-400">{formatMetric(item.baselineAverage, "", 2)}</div>
                      </div>
                    </div>
                    <div className={`mt-3 text-sm ${((item.deltaAverage ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar")}`}>
                      Delta {item.deltaAverage !== null ? `${item.deltaAverage >= 0 ? "+" : ""}${item.deltaAverage.toFixed(2)}` : "--"}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border border-stone-800 bg-stone-950 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">总分趋势</div>
                  <h3 className="mt-3 text-lg text-stone-100">按样本查看候选 vs 基线</h3>
                </div>
                <div className="text-xs text-stone-500">{selectedRunHighlights?.scoreTrend.length ?? 0} 条样本</div>
              </div>
              <div className="mt-4 space-y-3">
                {selectedRunHighlights?.scoreTrend.map((item) => {
                  const maxTotal = Math.max(item.candidateTotal, item.baselineTotal ?? 0, 1);
                  const trendCaseHref = `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${item.caseId}`;
                  return (
                    <article key={`trend-${item.id}`} className="border border-stone-800 bg-[#141414] px-4 py-4">
                      <button type="button" onClick={() => focusRunResult(item.id)} className="w-full text-left">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm text-stone-100">{item.topicTitle}</div>
                            <div className="mt-1 font-mono text-xs text-stone-500">{item.taskCode}</div>
                          </div>
                          <div className={`text-sm ${((item.deltaTotal ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar")}`}>
                            Delta {item.deltaTotal !== null ? `${item.deltaTotal >= 0 ? "+" : ""}${item.deltaTotal.toFixed(2)}` : "--"}
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <div>
                            <div className="flex items-center justify-between text-xs text-stone-500">
                              <span>候选</span>
                              <span>{item.candidateTotal.toFixed(2)}</span>
                            </div>
                            <div className="mt-1 h-2 rounded bg-stone-900">
                              <div className="h-2 rounded bg-emerald-500/80" style={{ width: `${Math.max(8, Math.round((item.candidateTotal / maxTotal) * 100))}%` }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between text-xs text-stone-500">
                              <span>基线</span>
                              <span>{item.baselineTotal !== null ? item.baselineTotal.toFixed(2) : "--"}</span>
                            </div>
                            <div className="mt-1 h-2 rounded bg-stone-900">
                              <div
                                className="h-2 rounded bg-stone-400/70"
                                style={{ width: `${Math.max(8, Math.round((((item.baselineTotal ?? 0) / maxTotal) * 100) || 0))}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </button>
                      <div className="mt-4">
                        <Link href={trendCaseHref} className={uiPrimitives.opsSecondaryButton}>
                          打开评测样本
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-3">
              <section className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">Top 提升样本</div>
                <div className="mt-4 space-y-3">
                  {selectedRunHighlights?.topImproved.length ? (
                    selectedRunHighlights.topImproved.map(({ result, deltaTotal }) => {
                      const improvedCaseHref = `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${result.caseId}`;
                      return (
                        <article key={`improved-${result.id}`} className="border border-stone-800 bg-[#141414] px-4 py-3">
                          <button type="button" onClick={() => focusRunResult(result.id)} className="w-full text-left">
                            <div className="text-sm text-stone-100">{result.topicTitle || result.taskCode || `case-${result.caseId}`}</div>
                            <div className="mt-2 text-xs text-stone-500">
                              {result.taskCode || `case-${result.caseId}`} · 候选 {result.totalScore.toFixed(2)} · Delta{" "}
                              {deltaTotal !== null ? `${deltaTotal >= 0 ? "+" : ""}${deltaTotal.toFixed(2)}` : "--"}
                            </div>
                          </button>
                          <div className="mt-3">
                            <Link href={improvedCaseHref} className={uiPrimitives.opsSecondaryButton}>
                              打开评测样本
                            </Link>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="text-sm text-stone-500">当前没有明显提分样本。</div>
                  )}
                </div>
              </section>

              <section className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-cinnabar">Top 退化样本</div>
                <div className="mt-4 space-y-3">
                  {selectedRunHighlights?.topRegressed.length ? (
                    selectedRunHighlights.topRegressed.map(({ result, deltaTotal }) => {
                      const regressedCaseHref = `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${result.caseId}`;
                      return (
                        <article key={`regressed-${result.id}`} className="border border-stone-800 bg-[#141414] px-4 py-3">
                          <button type="button" onClick={() => focusRunResult(result.id)} className="w-full text-left">
                            <div className="text-sm text-stone-100">{result.topicTitle || result.taskCode || `case-${result.caseId}`}</div>
                            <div className="mt-2 text-xs text-stone-500">
                              {result.taskCode || `case-${result.caseId}`} · 候选 {result.totalScore.toFixed(2)} · Delta{" "}
                              {deltaTotal !== null ? `${deltaTotal >= 0 ? "+" : ""}${deltaTotal.toFixed(2)}` : "--"}
                            </div>
                          </button>
                          <div className="mt-3">
                            <Link href={regressedCaseHref} className={uiPrimitives.opsSecondaryButton}>
                              打开评测样本
                            </Link>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="text-sm text-stone-500">当前没有明显退化样本。</div>
                  )}
                </div>
              </section>

              <section className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-300">失败样本</div>
                <div className="mt-4 space-y-3">
                  {selectedRunHighlights?.failingResults.length ? (
                    selectedRunHighlights.failingResults.map(({ result, caseError }) => {
                      const failedCaseHref = `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${result.caseId}`;
                      return (
                        <article key={`failed-${result.id}`} className="border border-stone-800 bg-[#141414] px-4 py-3">
                          <button type="button" onClick={() => focusRunResult(result.id)} className="w-full text-left">
                            <div className="text-sm text-stone-100">{result.topicTitle || result.taskCode || `case-${result.caseId}`}</div>
                            <div className="mt-2 text-xs leading-6 text-stone-500">{caseError}</div>
                          </button>
                          <div className="mt-3">
                            <Link href={failedCaseHref} className={uiPrimitives.opsSecondaryButton}>
                              打开评测样本
                            </Link>
                          </div>
                        </article>
                      );
                    })
                  ) : (
                    <div className="text-sm text-stone-500">当前没有失败样本。</div>
                  )}
                </div>
              </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">版本信息</div>
                <div className="mt-3 leading-7">
                  模式：{getExperimentModeLabel(selectedRunDetail.experimentMode)}
                  <br />
                  触发：{selectedRunDetail.triggerMode}
                  <br />
                  决议：{getDecisionModeLabel(selectedRunDetail.decisionMode)}
                  <br />
                  基线：{selectedRunDetail.baseVersionType} ·{" "}
                  {selectedRunBaseVersionHref ? (
                    <Link href={selectedRunBaseVersionHref} className="transition hover:text-cinnabar">
                      {selectedRunDetail.baseVersionRef}
                    </Link>
                  ) : (
                    selectedRunDetail.baseVersionRef
                  )}
                  <br />
                  候选：{selectedRunDetail.candidateVersionType} ·{" "}
                  {selectedRunCandidateVersionHref ? (
                    <Link href={selectedRunCandidateVersionHref} className="transition hover:text-cinnabar">
                      {selectedRunDetail.candidateVersionRef}
                    </Link>
                  ) : (
                    selectedRunDetail.candidateVersionRef
                  )}
                  <br />
                  来源调度：
                  {selectedRunSourceScheduleHref && selectedRunSourceSchedule ? (
                    <Link href={selectedRunSourceScheduleHref} className="ml-1 transition hover:text-cinnabar">
                      {`${selectedRunSourceSchedule.name} · #${selectedRunSourceSchedule.id}`}
                    </Link>
                  ) : (
                    <span className="ml-1">当前未关联</span>
                  )}
                  <br />
                  状态：{selectedRunDetail.status}
                  <br />
                  决议状态：{getResolutionStatusLabel(selectedRunDetail.resolutionStatus)}
                  {selectedRunDetail.resolvedAt ? ` · ${new Date(selectedRunDetail.resolvedAt).toLocaleString("zh-CN")}` : ""}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedRunBaseLedgerHref ? (
                    <Link href={selectedRunBaseLedgerHref} className={uiPrimitives.opsSecondaryButton}>
                      查看基线账本
                    </Link>
                  ) : null}
                  {selectedRunCandidateLedgerHref ? (
                    <Link href={selectedRunCandidateLedgerHref} className={uiPrimitives.opsSecondaryButton}>
                      查看候选账本
                    </Link>
                  ) : null}
                  {selectedRunBasePromptHref ? (
                    <Link href={selectedRunBasePromptHref} className={uiPrimitives.opsSecondaryButton}>
                      打开基线 Prompt
                    </Link>
                  ) : null}
                  {selectedRunCandidatePromptHref ? (
                    <Link href={selectedRunCandidatePromptHref} className={uiPrimitives.opsSecondaryButton}>
                      打开候选 Prompt
                    </Link>
                  ) : null}
                  {selectedRunSourceScheduleHref ? (
                    <Link href={selectedRunSourceScheduleHref} className={uiPrimitives.opsSecondaryButton}>
                      查看来源调度
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">实验摘要与建议</div>
                <div className="mt-3 leading-7">
                  {selectedRunDetail.summary || "暂无摘要"}
                  <div className={`mt-3 ${selectedRunDetail.recommendation === "keep" ? "text-emerald-400" : "text-cinnabar"}`}>
                    建议：{selectedRunDetail.recommendation}
                  </div>
                  <div className="mt-2 text-stone-400">{selectedRunDetail.recommendationReason}</div>
                  {selectedRunDetail.errorMessage ? <div className="mt-2 text-cinnabar">错误：{selectedRunDetail.errorMessage}</div> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleRetryRun} className={uiPrimitives.opsSecondaryButton}>
                重跑当前实验
              </button>
              <button
                type="button"
                onClick={handlePromoteRun}
                className={uiPrimitives.primaryButton}
                disabled={selectedRunDetail.status !== "succeeded" || selectedRunDetail.resolutionStatus !== "pending"}
              >
                保留候选版本
              </button>
              <button
                type="button"
                onClick={handleDiscardRun}
                className={uiPrimitives.opsSecondaryButton}
                disabled={selectedRunDetail.status !== "succeeded" || selectedRunDetail.resolutionStatus !== "pending"}
              >
                记录 discard
              </button>
              {selectedRunDetail.baseVersionType === "prompt_version" && selectedRunDetail.candidateVersionType === "prompt_version" ? (
                <button
                  type="button"
                  onClick={() => void handleCreatePromptCandidateFromRun()}
                  className={uiPrimitives.opsSecondaryButton}
                  disabled={selectedRunDetail.status !== "succeeded"}
                >
                  基于当前 Run 生成下一版 Prompt
                </button>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "真实回流样本",
                  value: `${feedbackState?.realOutcome.items.length ?? 0} 条`,
                  caption: `观察爆款 ${formatMetric(feedbackState?.realOutcome.summary.averageObservedViralScore, "", 2)} · 打开 ${formatMetric(feedbackState?.realOutcome.summary.averageOpenRate, "%", 1)}`,
                  tone: "text-stone-100",
                },
                {
                  label: "实验反馈样本",
                  value: `${feedbackState?.items.length ?? 0} 条`,
                  caption: `观察爆款 ${formatMetric(feedbackState?.summary.averageObservedViralScore, "", 2)} · 打开 ${formatMetric(feedbackState?.summary.averageOpenRate, "%", 1)}`,
                  tone: "text-stone-100",
                },
                {
                  label: "打开率口径差",
                  value: formatDeltaMetric(
                    (feedbackState?.realOutcome.summary.averageOpenRate ?? null) !== null
                      && (feedbackState?.summary.averageOpenRate ?? null) !== null
                      ? (feedbackState?.realOutcome.summary.averageOpenRate ?? 0) - (feedbackState?.summary.averageOpenRate ?? 0)
                      : null,
                    "%",
                    1,
                  ),
                  caption: "真实回流减去实验反馈",
                  tone: getDeltaTone(
                    (feedbackState?.realOutcome.summary.averageOpenRate ?? null) !== null
                      && (feedbackState?.summary.averageOpenRate ?? null) !== null
                      ? (feedbackState?.realOutcome.summary.averageOpenRate ?? 0) - (feedbackState?.summary.averageOpenRate ?? 0)
                      : null,
                  ),
                },
                {
                  label: "校准偏差口径差",
                  value: formatDeltaMetric(
                    (feedbackState?.realOutcome.summary.averageCalibrationGap ?? null) !== null
                      && (feedbackState?.summary.averageCalibrationGap ?? null) !== null
                      ? (feedbackState?.realOutcome.summary.averageCalibrationGap ?? 0) - (feedbackState?.summary.averageCalibrationGap ?? 0)
                      : null,
                    "",
                    2,
                  ),
                  caption: "真实回流减去实验反馈",
                  tone: getDeltaTone(
                    (feedbackState?.realOutcome.summary.averageCalibrationGap ?? null) !== null
                      && (feedbackState?.summary.averageCalibrationGap ?? null) !== null
                      ? (feedbackState?.realOutcome.summary.averageCalibrationGap ?? 0) - (feedbackState?.summary.averageCalibrationGap ?? 0)
                      : null,
                  ),
                },
              ].map((item) => (
                <div key={item.label} className="border border-stone-800 bg-stone-950 px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{item.label}</div>
                  <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                  <div className="mt-2 text-sm leading-6 text-stone-500">{item.caption}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">真实回流主口径</div>
                    <h3 className="mt-3 text-lg text-stone-100">按运行时归因回看的真实发布结果</h3>
                  </div>
                  <div className="text-xs text-stone-500">
                    {loadingFeedback ? "加载中..." : `${feedbackState?.realOutcome.items.length ?? 0} 条真实回流`}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    {
                      label: "观察爆款分",
                      value: formatMetric(feedbackState?.realOutcome.summary.averageObservedViralScore, "", 2),
                      tone: "text-stone-100",
                    },
                    {
                      label: "离线预测爆款分",
                      value: formatMetric(feedbackState?.realOutcome.summary.averagePredictedViralScore, "", 2),
                      tone: "text-stone-300",
                    },
                    {
                      label: "校准偏差",
                      value: formatMetric(feedbackState?.realOutcome.summary.averageCalibrationGap, "", 2),
                      tone:
                        (feedbackState?.realOutcome.summary.averageCalibrationGap ?? 0) >= 0
                          ? "text-emerald-400"
                          : "text-cinnabar",
                    },
                    {
                      label: "平均打开率",
                      value: formatMetric(feedbackState?.realOutcome.summary.averageOpenRate, "%", 1),
                      tone: "text-stone-100",
                    },
                  ].map((item) => (
                    <div key={item.label} className="border border-stone-800 bg-[#141414] px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                      <div className={`mt-3 text-2xl ${item.tone}`}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 space-y-3">
                  {feedbackState?.realOutcome.supported ? (
                    feedbackState.realOutcome.items.length ? (
                      feedbackState.realOutcome.items.map((item) => {
                        const realOutcomeCaseHref =
                          item.caseId && selectedRunDetail
                            ? `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${item.caseId}`
                            : null;
                        return (
                          <article key={item.id} className="border border-stone-800 bg-[#141414] px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{getFeedbackSourceLabel(item)}</div>
                                <div className="mt-2 text-base text-stone-100">{item.topicTitle || item.articleTitle || "未绑定样本"}</div>
                                <div className="mt-2 text-sm text-stone-500">
                                  {item.articleTitle ? `稿件：${item.articleTitle}` : "未关联稿件"}
                                  {item.mediaId ? ` · media_id ${item.mediaId}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-stone-500">{new Date(item.capturedAt).toLocaleString("zh-CN")}</div>
                            </div>

                            <div className="mt-4 grid gap-2 md:grid-cols-4 text-sm">
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">打开率 {formatMetric(item.openRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">读完率 {formatMetric(item.readCompletionRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">分享率 {formatMetric(item.shareRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">收藏率 {formatMetric(item.favoriteRate, "%")}</div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">观察爆款 {formatMetric(item.observedViralScore, "", 2)}</span>
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">离线预测 {formatMetric(item.predictedViralScore, "", 2)}</span>
                              <span className={`border px-3 py-1 ${((item.calibrationGap ?? 0) >= 0 ? "border-emerald-700 text-emerald-400" : "border-cinnabar text-cinnabar")}`}>
                                偏差 {formatMetric(item.calibrationGap, "", 2)}
                              </span>
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">
                                阅读量 {item.readCount ?? "--"} · 点赞 {item.likeCount ?? "--"} · 评论 {item.commentCount ?? "--"}
                              </span>
                            </div>

                            {item.resultId || realOutcomeCaseHref ? (
                              <div className="mt-4 flex flex-wrap gap-3">
                                {item.resultId ? (
                                  <button type="button" onClick={() => focusRunResult(item.resultId!)} className={uiPrimitives.opsSecondaryButton}>
                                    打开对应样本
                                  </button>
                                ) : null}
                                {realOutcomeCaseHref ? (
                                  <Link href={realOutcomeCaseHref} className={uiPrimitives.opsSecondaryButton}>
                                    打开评测样本
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}

                            {item.notes ? <div className="mt-3 text-sm leading-7 text-stone-400">{item.notes}</div> : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="border border-dashed border-stone-700 bg-[#141414] px-4 py-6 text-sm text-stone-500">
                        当前运行对应的候选版本还没有归因成功的真实回流样本。
                      </div>
                    )
                  ) : (
                    <div className="border border-dashed border-stone-700 bg-[#141414] px-4 py-6 text-sm text-stone-500">
                      当前运行还没有可展示的真实回流归因结果。
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleCreateFeedback} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">实验反馈录入</div>
                <div className="mt-2 text-sm leading-7 text-stone-500">
                  这里保留实验反馈录入，用于 run 样本绑定、人工补录和补充观察；左侧治理判断只看真实回流主口径。
                </div>
                <div className="mt-3 rounded border border-stone-800 bg-[#141414] px-3 py-3 text-xs text-stone-400">
                  当前实验反馈 {loadingFeedback ? "加载中..." : `${feedbackState?.items.length ?? 0} 条`} · 平均打开率 {formatMetric(feedbackState?.summary.averageOpenRate, "%", 1)} ·
                  校准偏差 {formatMetric(feedbackState?.summary.averageCalibrationGap, "", 2)}
                </div>
                <div className="mt-4 space-y-3">
                  <select
                    value={feedbackForm.resultId}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, resultId: event.target.value }))}
                    className={uiPrimitives.opsSelect}
                  >
                    <option value="">选择关联样本结果，可选</option>
                    {(feedbackState?.options.results ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.taskCode} · {item.topicTitle} · 爆款 {item.viralScore.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={feedbackForm.articleId}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, articleId: event.target.value }))}
                    className={uiPrimitives.opsSelect}
                  >
                    <option value="">选择已发布稿件，可选</option>
                    {(feedbackState?.options.articles ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        #{item.id} · {item.title} · {item.status}
                      </option>
                    ))}
                  </select>
                  <select
                    value={feedbackForm.wechatSyncLogId}
                    onChange={(event) =>
                      setFeedbackForm((prev) => {
                        const nextSyncLogId = event.target.value;
                        const matched = (feedbackState?.options.syncLogs ?? []).find((item) => String(item.id) === nextSyncLogId);
                        return {
                          ...prev,
                          wechatSyncLogId: nextSyncLogId,
                          articleId: prev.articleId || (matched ? String(matched.articleId) : ""),
                        };
                      })
                    }
                    className={uiPrimitives.opsSelect}
                  >
                    <option value="">选择微信同步记录，可选</option>
                    {(feedbackState?.options.syncLogs ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        #{item.id} · {item.title || "未命名稿件"} · {item.status}
                      </option>
                    ))}
                  </select>
                  <select
                    value={feedbackForm.sourceType}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, sourceType: event.target.value }))}
                    className={uiPrimitives.opsSelect}
                  >
                    <option value="manual">manual</option>
                    <option value="wechat_dashboard">wechat_dashboard</option>
                    <option value="ops_review">ops_review</option>
                  </select>
                  <input
                    value={feedbackForm.sourceLabel}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, sourceLabel: event.target.value }))}
                    placeholder="来源标签，例如 4 月第 2 周复盘"
                    className={uiPrimitives.opsInput}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={feedbackForm.openRate} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, openRate: event.target.value }))} placeholder="打开率 %" className={uiPrimitives.opsInput} />
                    <input
                      value={feedbackForm.readCompletionRate}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, readCompletionRate: event.target.value }))}
                      placeholder="读完率 %"
                      className={uiPrimitives.opsInput}
                    />
                    <input value={feedbackForm.shareRate} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, shareRate: event.target.value }))} placeholder="分享率 %" className={uiPrimitives.opsInput} />
                    <input
                      value={feedbackForm.favoriteRate}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, favoriteRate: event.target.value }))}
                      placeholder="收藏率 %"
                      className={uiPrimitives.opsInput}
                    />
                    <input value={feedbackForm.readCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, readCount: event.target.value }))} placeholder="阅读量" className={uiPrimitives.opsInput} />
                    <input value={feedbackForm.likeCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, likeCount: event.target.value }))} placeholder="点赞数" className={uiPrimitives.opsInput} />
                    <input value={feedbackForm.commentCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, commentCount: event.target.value }))} placeholder="评论数" className={uiPrimitives.opsInput} />
                    <input
                      type="datetime-local"
                      value={feedbackForm.capturedAt}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, capturedAt: event.target.value }))}
                      className={uiPrimitives.opsInput}
                    />
                  </div>
                  <textarea
                    value={feedbackForm.notes}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, notes: event.target.value }))}
                    className={`min-h-[110px] ${uiPrimitives.opsInput}`}
                    placeholder="记录这次线上表现的背景，例如推送时段、封面策略、外部事件干扰。"
                  />
                  <button className={uiPrimitives.primaryButton}>写入回流结果</button>
                </div>

                <div className="mt-6 border-t border-stone-800 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-amber-300">实验反馈样本</div>
                      <div className="mt-2 text-sm leading-7 text-stone-500">保留 run 级人工补录、样本绑定和 prompt 快速观察，不与真实发布回流混口径。</div>
                    </div>
                    <div className="text-xs text-stone-500">{loadingFeedback ? "加载中..." : `${feedbackState?.items.length ?? 0} 条`}</div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {feedbackState?.items.length ? (
                      feedbackState.items.map((item) => {
                        const signalHighlights = getFeedbackSignalHighlights(item);
                        const feedbackCaseHref =
                          item.caseId && selectedRunDetail
                            ? `/ops/writing-eval/datasets?datasetId=${selectedRunDetail.datasetId}&caseId=${item.caseId}`
                            : null;
                        return (
                          <article key={`feedback-${item.id}`} className="border border-stone-800 bg-[#141414] px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{getFeedbackSourceLabel(item)}</div>
                                <div className="mt-2 text-base text-stone-100">{item.topicTitle || item.articleTitle || "未绑定样本"}</div>
                                <div className="mt-2 text-sm text-stone-500">
                                  {item.resultId ? `result #${item.resultId}` : "未关联 result"}
                                  {item.articleTitle ? ` · 稿件：${item.articleTitle}` : ""}
                                  {item.mediaId ? ` · media_id ${item.mediaId}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-stone-500">{new Date(item.capturedAt).toLocaleString("zh-CN")}</div>
                            </div>

                            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4 text-sm">
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">打开率 {formatMetric(item.openRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">读完率 {formatMetric(item.readCompletionRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">分享率 {formatMetric(item.shareRate, "%")}</div>
                              <div className="border border-stone-800 px-3 py-3 text-stone-300">收藏率 {formatMetric(item.favoriteRate, "%")}</div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3 text-sm">
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">观察爆款 {formatMetric(item.observedViralScore, "", 2)}</span>
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">离线预测 {formatMetric(item.predictedViralScore, "", 2)}</span>
                              <span className={`border px-3 py-1 ${getDeltaTone(item.calibrationGap).includes("emerald") ? "border-emerald-700 text-emerald-400" : getDeltaTone(item.calibrationGap).includes("cinnabar") ? "border-cinnabar text-cinnabar" : "border-stone-700 text-stone-300"}`}>
                                偏差 {formatMetric(item.calibrationGap, "", 2)}
                              </span>
                              <span className="border border-stone-700 px-3 py-1 text-stone-300">
                                阅读量 {item.readCount ?? "--"} · 点赞 {item.likeCount ?? "--"} · 评论 {item.commentCount ?? "--"}
                              </span>
                            </div>

                            {item.resultId || feedbackCaseHref ? (
                              <div className="mt-4 flex flex-wrap gap-3">
                                {item.resultId ? (
                                  <button type="button" onClick={() => focusRunResult(item.resultId!)} className={uiPrimitives.opsSecondaryButton}>
                                    打开对应样本
                                  </button>
                                ) : null}
                                {feedbackCaseHref ? (
                                  <Link href={feedbackCaseHref} className={uiPrimitives.opsSecondaryButton}>
                                    打开评测样本
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}

                            {signalHighlights.length ? (
                              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                {signalHighlights.map((entry) => (
                                  <span key={`${item.id}-${entry.label}`} className="border border-stone-700 px-3 py-1 text-stone-400">
                                    {entry.label} {formatMetric(entry.value, "", 2)}
                                  </span>
                                ))}
                              </div>
                            ) : null}

                            {item.notes ? <div className="mt-3 text-sm leading-7 text-stone-400">{item.notes}</div> : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="border border-dashed border-stone-700 bg-[#141414] px-4 py-6 text-sm text-stone-500">
                        当前运行还没有录入实验反馈样本。
                      </div>
                    )}
                  </div>
                </div>
              </form>
            </div>

            <div className="space-y-4">
              {selectedRunDetail.results.length === 0 ? (
                <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">当前运行还没有产出样本结果。</div>
              ) : selectedRunResult ? (
                (() => {
                  const baseline = getRecord(selectedRunResult.judgePayload.baseline);
                  const comparison = getRecord(selectedRunResult.judgePayload.comparison);
                  const delta = getRecord(comparison.delta);
                  const hybridJudge = getRecord(selectedRunResult.judgePayload.hybridJudge);
                  const judgeReasons = getRecord(hybridJudge.reasons);
                  const judgeProblems = getStringList(hybridJudge.problems, 8);
                  const baselineGenerated = getRecord(baseline.generated);
                  const baselineScores = getRecord(baseline.scores);
                  const deltaTotal = getResultDeltaTotal(selectedRunResult);
                  const winner = getString(comparison.winner) || "unknown";
                  const caseError = getResultCaseError(selectedRunResult);
                  const metricDeltas = [
                    {
                      label: "总分",
                      candidate: selectedRunResult.totalScore,
                      baseline: getNumber(baselineScores.total_score),
                      delta: deltaTotal,
                    },
                    {
                      label: "质量",
                      candidate: selectedRunResult.qualityScore,
                      baseline: getNumber(baselineScores.quality_score),
                      delta: getNumber(delta.quality_score),
                    },
                    {
                      label: "爆款",
                      candidate: selectedRunResult.viralScore,
                      baseline: getNumber(baselineScores.viral_score),
                      delta: getNumber(delta.viral_score),
                    },
                    {
                      label: "标题",
                      candidate: selectedRunResult.headlineScore,
                      baseline: getNumber(baselineScores.headline_score),
                      delta: getNumber(delta.headline_score),
                    },
                    {
                      label: "开头",
                      candidate: selectedRunResult.hookScore,
                      baseline: getNumber(baselineScores.hook_score),
                      delta: getNumber(delta.hook_score),
                    },
                    {
                      label: "密度",
                      candidate: selectedRunResult.densityScore,
                      baseline: getNumber(baselineScores.density_score),
                      delta: getNumber(delta.density_score),
                    },
                    {
                      label: "语言",
                      candidate: selectedRunResult.languageScore,
                      baseline: getNumber(baselineScores.language_score),
                      delta: getNumber(delta.language_score),
                    },
                    {
                      label: "情绪",
                      candidate: selectedRunResult.emotionScore,
                      baseline: getNumber(baselineScores.emotion_score),
                      delta: getNumber(delta.emotion_score),
                    },
                    {
                      label: "结构",
                      candidate: selectedRunResult.structureScore,
                      baseline: getNumber(baselineScores.structure_score),
                      delta: getNumber(delta.structure_score),
                    },
                  ];
                  return (
                    <>
                      {focusResult ? (
                        <div className="flex flex-wrap items-start justify-between gap-3 border border-cinnabar bg-[#1d1413] px-4 py-4">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-cinnabar">样本聚焦模式</div>
                            <div className="mt-2 text-sm leading-7 text-stone-200">
                              当前通过深链聚焦 result #{focusResult.resultId}，匹配 {focusResult.matchedCount} 条。
                            </div>
                          </div>
                          <Link href={focusResult.clearHref} className={uiPrimitives.opsSecondaryButton}>
                            返回整条 Run
                          </Link>
                        </div>
                      ) : null}

                      <section id="run-result-comparator" className="border border-stone-800 bg-stone-950 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">单样本结果对比器</div>
                            <h3 className="mt-3 text-lg text-stone-100">{selectedRunResult.topicTitle || "未命名选题"}</h3>
                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                              {selectedRunResult.taskCode || `case-${selectedRunResult.caseId}`} · {selectedRunResult.difficultyLevel || "unknown"}
                            </div>
                            {selectedRunCaseHref ? (
                              <div className="mt-3">
                                <Link href={selectedRunCaseHref} className={uiPrimitives.opsSecondaryButton}>
                                  打开评测样本
                                </Link>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2 text-sm">
                            <span className="border border-stone-700 px-3 py-1 text-stone-300">候选 {selectedRunResult.totalScore.toFixed(2)}</span>
                            <span className="border border-stone-700 px-3 py-1 text-stone-300">基线 {getNumber(baselineScores.total_score)?.toFixed(2) ?? "--"}</span>
                            <span className={`border px-3 py-1 ${winner === "candidate" ? "border-emerald-700 text-emerald-400" : winner === "base" ? "border-cinnabar text-cinnabar" : "border-stone-700 text-stone-300"}`}>
                              {winner === "candidate" ? "候选胜" : winner === "base" ? "基线胜" : "持平"}
                              {deltaTotal !== null ? ` · ${deltaTotal >= 0 ? "+" : ""}${deltaTotal.toFixed(2)}` : ""}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {selectedRunDetail.results.map((result) => {
                            const resultComparison = getRecord(result.judgePayload.comparison);
                            const resultWinner = getString(resultComparison.winner) || "unknown";
                            const resultDeltaTotal = getResultDeltaTotal(result);
                            const isActive = result.id === selectedRunResult.id;
                            return (
                              <button
                                key={`result-selector-${result.id}`}
                                type="button"
                                onClick={() => {
                                  setSelectedResultId(result.id);
                                  replaceRunsUrl(selectedRunId, result.id, selectedDatasetId);
                                }}
                                className={`border px-4 py-4 text-left ${isActive ? "border-cinnabar bg-[#1d1413]" : "border-stone-800 bg-[#141414]"}`}
                              >
                                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                                  {result.taskCode || `case-${result.caseId}`} · {result.difficultyLevel || "unknown"}
                                </div>
                                <div className="mt-2 text-sm text-stone-100">{result.topicTitle || "未命名选题"}</div>
                                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                  <span className="border border-stone-700 px-2 py-1 text-stone-300">候选 {result.totalScore.toFixed(2)}</span>
                                  <span className={`border px-2 py-1 ${resultWinner === "candidate" ? "border-emerald-700 text-emerald-400" : resultWinner === "base" ? "border-cinnabar text-cinnabar" : "border-stone-700 text-stone-300"}`}>
                                    {resultWinner === "candidate" ? "候选胜" : resultWinner === "base" ? "基线胜" : "持平"}
                                  </span>
                                  <span className={`${(resultDeltaTotal ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                                    {resultDeltaTotal !== null ? `${resultDeltaTotal >= 0 ? "+" : ""}${resultDeltaTotal.toFixed(2)}` : "--"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px_minmax(0,1fr)]">
                        <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">基线输出</div>
                          <div className="mt-3 text-base text-stone-100">{getString(baselineGenerated.title) || "无标题"}</div>
                          <div className="mt-2 text-sm leading-7 text-stone-400">{truncateText(getString(baselineGenerated.lead), 220)}</div>
                          <div className="mt-4 grid gap-2 text-xs text-stone-400 md:grid-cols-3">
                            <div>质量 {getNumber(baselineScores.quality_score)?.toFixed(2) ?? "--"}</div>
                            <div>爆款 {getNumber(baselineScores.viral_score)?.toFixed(2) ?? "--"}</div>
                            <div>标题 {getNumber(baselineScores.headline_score)?.toFixed(2) ?? "--"}</div>
                          </div>
                          <div className="mt-4 text-sm leading-7 text-stone-500">{truncateText(getString(baselineGenerated.markdown), 420)}</div>
                        </div>

                        <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">分项变化</div>
                          <div className={`mt-3 text-sm ${winner === "candidate" ? "text-emerald-400" : winner === "base" ? "text-cinnabar" : "text-stone-300"}`}>
                            {winner === "candidate" ? "当前样本推荐保留候选" : winner === "base" ? "当前样本基线仍占优" : "当前样本没有明显胜者"}
                          </div>
                          {caseError ? <div className="mt-3 text-sm leading-6 text-cinnabar">失败原因：{caseError}</div> : null}
                          <div className="mt-4 space-y-2">
                            {metricDeltas.map((item) => (
                              <div key={`${selectedRunResult.id}-${item.label}`} className="border border-stone-800 bg-[#141414] px-3 py-3 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-stone-300">{item.label}</span>
                                  <span className={`${(item.delta ?? 0) >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                                    {item.delta !== null ? `${item.delta >= 0 ? "+" : ""}${item.delta.toFixed(2)}` : "--"}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-3 text-stone-500">
                                  <span>基线 {item.baseline !== null ? item.baseline.toFixed(2) : "--"}</span>
                                  <span>候选 {item.candidate !== null ? item.candidate.toFixed(2) : "--"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 border border-stone-800 bg-[#111111] px-3 py-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="uppercase tracking-[0.18em] text-stone-500">Hybrid Judge</span>
                              <span className="text-stone-400">
                                {getString(hybridJudge.status) || "unknown"} · {getString(hybridJudge.keepRecommendation) || "observe"}
                              </span>
                            </div>
                            {getString(hybridJudge.summary) ? (
                              <div className="mt-2 leading-6 text-stone-300">{getString(hybridJudge.summary)}</div>
                            ) : null}
                            <div className="mt-3 space-y-2 text-stone-400">
                              {[
                                ["标题", getString(judgeReasons.headline)],
                                ["开头", getString(judgeReasons.hook)],
                                ["密度", getString(judgeReasons.density)],
                                ["语言", getString(judgeReasons.language)],
                                ["传播", getString(judgeReasons.shareability)],
                              ]
                                .filter(([, value]) => value)
                                .map(([label, value]) => (
                                  <div key={`${selectedRunResult.id}-${label}`}>
                                    <span className="text-stone-500">{label}：</span>
                                    {value}
                                  </div>
                                ))}
                            </div>
                            {judgeProblems.length > 0 ? <div className="mt-3 text-cinnabar">风险提示：{judgeProblems.join("；")}</div> : null}
                          </div>
                        </div>

                        <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                          <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">候选输出</div>
                          <div className="mt-3 text-base text-stone-100">{selectedRunResult.generatedTitle || "无标题"}</div>
                          <div className="mt-2 text-sm leading-7 text-stone-400">{truncateText(selectedRunResult.generatedLead, 220)}</div>
                          <div className="mt-4 grid gap-2 text-xs text-stone-400 md:grid-cols-3">
                            <div>质量 {selectedRunResult.qualityScore.toFixed(2)}</div>
                            <div>爆款 {selectedRunResult.viralScore.toFixed(2)}</div>
                            <div>标题 {selectedRunResult.headlineScore.toFixed(2)}</div>
                          </div>
                          <div className="mt-4 text-sm leading-7 text-stone-500">{truncateText(selectedRunResult.generatedMarkdown, 420)}</div>
                        </div>
                      </section>
                    </>
                  );
                })()
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-6 border border-dashed border-stone-700 bg-stone-950 px-4 py-6 text-sm text-stone-500">
            先选择一条运行记录，才能看到基线与候选版本的样本级对比。
          </div>
        )}
      </section>

      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
