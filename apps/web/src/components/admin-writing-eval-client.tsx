"use client";

import Link from "next/link";
import { startTransition, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";
import { AdminWritingEvalNav } from "@/components/admin-writing-eval-nav";
import {
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
  buildAdminWritingEvalVersionsHref,
} from "@/lib/admin-writing-eval-links";
import { formatWritingEvalDateTime, formatWritingEvalMetric } from "@/lib/writing-eval-format";
import {
  getWritingEvalReadinessMeta as getDatasetReadinessMeta,
  getWritingEvalScheduleStats,
  isWritingEvalScheduleExecutable as isExecutableSchedule,
} from "@/lib/writing-eval-view";
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
  sourceScheduleId: number | null;
  sourceScheduleName: string | null;
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
  jobHistory: Array<{
    id: number;
    jobType: string;
    stageKey: string;
    stageLabel: string;
    attemptIndex: number;
    status: string;
    runAt: string | null;
    queuedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    updatedAt: string;
    lastError: string | null;
    retryCount: number;
    runCode: string | null;
  }>;
  retryHistory: Array<{
    id: number;
    username: string | null;
    createdAt: string;
    retriedAt: string | null;
    runCode: string | null;
  }>;
  postDecisionOps: {
    focusVersionType: string;
    focusVersionRef: string;
    focusTargetKey: string;
    focusSource: "candidate" | "base";
    candidateLedgerId: number | null;
    baseLedgerId: number | null;
    focusLedgerId: number | null;
    focusLedgerDecision: string | null;
    focusLedgerCreatedAt: string | null;
    canRollbackFocusLedger: boolean;
    rolloutKind: "prompt" | "asset" | "unsupported";
    isFocusActive: boolean | null;
    rolloutConfig: {
      autoMode: string;
      rolloutObserveOnly: boolean;
      rolloutPercentage: number;
      rolloutPlanCodes: string[];
      isEnabled: boolean;
      notes: string | null;
    } | null;
    rolloutStats: {
      uniqueUserCount: number;
      totalHitCount: number;
      lastHitAt: string | null;
      observeUserCount: number;
      planUserCount: number;
      percentageUserCount: number;
      stableUserCount: number;
    } | null;
    feedbackSummary: {
      feedbackCount: number;
      averageObservedViralScore: number | null;
      averageOpenRate: number | null;
      averageReadCompletionRate: number | null;
    };
    rolloutAuditLogs: Array<{
      id: number;
      createdAt: string;
      action: string;
      username: string | null;
      reason: string | null;
      riskLevel: string;
      changes: string[];
      signals: {
        feedbackCount: number | null;
        uniqueUsers: number | null;
        totalHitCount: number | null;
        deltaTotalScore: number | null;
        observedViralScore: number | null;
        openRate: number | null;
        readCompletionRate: number | null;
      };
    }>;
  } | null;
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
  lastRunScoreSummary: Record<string, unknown>;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
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

type BreakdownScoreField =
  | "styleScore"
  | "languageScore"
  | "densityScore"
  | "emotionScore"
  | "structureScore"
  | "topicMomentumScore"
  | "headlineScore"
  | "hookScore"
  | "shareabilityScore"
  | "readerValueScore"
  | "noveltyScore"
  | "platformFitScore";

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

function getIsoDateTimeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDateValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatWritingEvalElapsed(startValue: unknown, endValue?: unknown) {
  const start = parseDateValue(startValue);
  if (!start) return null;
  const end = parseDateValue(endValue ?? new Date());
  if (!end) return null;
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  if (diffMs < 1_000) return "<1秒";
  const totalSeconds = Math.floor(diffMs / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

const WRITING_EVAL_QUEUE_DELAY_WARNING_MS = 3 * 60 * 1000;
const WRITING_EVAL_HEARTBEAT_STALE_MS = 10 * 60 * 1000;

function getWritingEvalPipelineStageLabel(stageInput: string, statusInput?: string) {
  const stage = String(stageInput || "").trim();
  if (stage === "generation_running") return "生成中";
  if (stage === "generation_completed") return "生成完成";
  if (stage === "scoring_running") return "评分中";
  if (stage === "score_completed") return "评分完成";
  if (stage === "promoting_running") return "决议处理中";
  if (stage === "promotion_ready") return "决议完成";
  if (stage === "generation_failed") return "生成失败";
  if (stage === "scoring_failed") return "评分失败";
  if (stage === "promotion_failed") return "决议失败";
  const status = String(statusInput || "").trim();
  if (status === "queued") return "排队中";
  if (status === "running") return "生成中";
  if (status === "scoring") return "评分中";
  if (status === "promoting") return "决议处理中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "执行失败";
  return stage || status || "--";
}

function getWritingEvalStageStartedAt(scoreSummary: Record<string, unknown>, startedAt?: string | null) {
  const stage = getString(scoreSummary.pipelineStage);
  const failedStage = getString(scoreSummary.failedStage);
  const generationStartedAt = getIsoDateTimeString(scoreSummary.generationStartedAt);
  const scoringStartedAt = getIsoDateTimeString(scoreSummary.scoringStartedAt);
  const promotionStartedAt = getIsoDateTimeString(scoreSummary.promotionStartedAt);
  const runStartedAt = getIsoDateTimeString(scoreSummary.runStartedAt) ?? startedAt ?? null;
  if (stage.startsWith("generation_")) return generationStartedAt ?? runStartedAt;
  if (stage.startsWith("scoring_") || stage === "score_completed") return scoringStartedAt ?? generationStartedAt ?? runStartedAt;
  if (stage.startsWith("promoting_") || stage === "promotion_ready") return promotionStartedAt ?? scoringStartedAt ?? runStartedAt;
  if (stage.endsWith("_failed")) {
    if (failedStage === "promotion") return promotionStartedAt ?? scoringStartedAt ?? runStartedAt;
    if (failedStage === "scoring") return scoringStartedAt ?? generationStartedAt ?? runStartedAt;
    return generationStartedAt ?? runStartedAt;
  }
  return runStartedAt;
}

function getWritingEvalTimelineEntries(scoreSummary: Record<string, unknown>, startedAt?: string | null, finishedAt?: string | null) {
  const entries = [
    { key: "runStartedAt", label: "Run 开始", at: getIsoDateTimeString(scoreSummary.runStartedAt) ?? startedAt ?? null },
    { key: "generationStartedAt", label: "生成开始", at: getIsoDateTimeString(scoreSummary.generationStartedAt) },
    { key: "generationCompletedAt", label: "生成完成", at: getIsoDateTimeString(scoreSummary.generationCompletedAt) },
    { key: "scoringStartedAt", label: "评分开始", at: getIsoDateTimeString(scoreSummary.scoringStartedAt) },
    { key: "scoreCompletedAt", label: "评分完成", at: getIsoDateTimeString(scoreSummary.scoreCompletedAt) },
    { key: "promotionStartedAt", label: "决议开始", at: getIsoDateTimeString(scoreSummary.promotionStartedAt) },
    { key: "promotionCompletedAt", label: "决议完成", at: getIsoDateTimeString(scoreSummary.promotionCompletedAt) ?? finishedAt ?? null },
    { key: "failedAt", label: "失败时间", at: getIsoDateTimeString(scoreSummary.failedAt) },
    { key: "lastProgressAt", label: "最近心跳", at: getIsoDateTimeString(scoreSummary.lastProgressAt) },
  ];
  const seen = new Set<string>();
  return entries.filter((item) => {
    if (!item.at) return false;
    const dedupeKey = `${item.label}-${item.at}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

function getWritingEvalQueueWaitDuration(createdAt?: string | null, startedAt?: string | null, statusInput?: string) {
  const status = String(statusInput || "").trim();
  if (status !== "queued") return null;
  return formatWritingEvalElapsed(createdAt, startedAt ?? undefined);
}

function isWritingEvalQueueDelayed(createdAt?: string | null, startedAt?: string | null, statusInput?: string) {
  const status = String(statusInput || "").trim();
  if (status !== "queued") return false;
  const created = parseDateValue(createdAt);
  const started = parseDateValue(startedAt);
  if (!created || started) return false;
  return Date.now() - created.getTime() >= WRITING_EVAL_QUEUE_DELAY_WARNING_MS;
}

function getWritingEvalHeartbeatStaleness(lastProgressAt?: string | null, startedAt?: string | null, statusInput?: string) {
  const status = String(statusInput || "").trim();
  if (!isRunActive(status)) return null;
  const baseline = parseDateValue(lastProgressAt) ?? parseDateValue(startedAt);
  if (!baseline) return null;
  return formatWritingEvalElapsed(baseline);
}

function isWritingEvalHeartbeatStale(lastProgressAt?: string | null, startedAt?: string | null, statusInput?: string) {
  const status = String(statusInput || "").trim();
  if (!isRunActive(status)) return false;
  const baseline = parseDateValue(lastProgressAt) ?? parseDateValue(startedAt);
  if (!baseline) return false;
  return Date.now() - baseline.getTime() >= WRITING_EVAL_HEARTBEAT_STALE_MS;
}

function getWritingEvalRunOpsFlags(run: RunItem) {
  const lastProgressAt = getIsoDateTimeString(run.scoreSummary.lastProgressAt);
  const queueDelayed = isWritingEvalQueueDelayed(run.createdAt, run.startedAt, run.status);
  const heartbeatStale = isWritingEvalHeartbeatStale(lastProgressAt, run.startedAt, run.status);
  const resolutionPending = run.status === "succeeded" && run.resolutionStatus === "pending";
  const exception = run.status === "failed" || queueDelayed || heartbeatStale;
  const actionRequired = isRunActive(run.status) || run.status === "queued" || exception || resolutionPending;
  return {
    queueDelayed,
    heartbeatStale,
    resolutionPending,
    exception,
    actionRequired,
  };
}

function getWritingEvalRunOpsIssueSummary(run: RunItem) {
  const flags = getWritingEvalRunOpsFlags(run);
  if (run.status === "failed") {
    return getString(run.errorMessage) || getString(run.scoreSummary.failureReason) || "执行失败，建议查看详情并决定是否重跑";
  }
  if (flags.queueDelayed) {
    return "排队时间过长，优先检查 worker 是否在正常取任务";
  }
  if (flags.heartbeatStale) {
    return "长时间未收到心跳，可能卡在生成、评分或决议阶段";
  }
  if (flags.resolutionPending) {
    return "运行已完成但仍待人工决议，建议尽快 keep/discard 或继续迭代";
  }
  return "需要人工关注";
}

function getWritingEvalRunOpsIssueTone(run: RunItem) {
  const flags = getWritingEvalRunOpsFlags(run);
  if (run.status === "failed" || flags.heartbeatStale) return "text-cinnabar";
  if (flags.queueDelayed || flags.resolutionPending) return "text-amber-200";
  return "text-stone-400";
}

function compareRunsByUrgency(left: RunItem, right: RunItem) {
  const leftFlags = getWritingEvalRunOpsFlags(left);
  const rightFlags = getWritingEvalRunOpsFlags(right);
  const rank = (run: RunItem, flags: ReturnType<typeof getWritingEvalRunOpsFlags>) => {
    if (run.status === "failed") return 5;
    if (flags.heartbeatStale) return 4;
    if (flags.queueDelayed) return 3;
    if (flags.resolutionPending) return 2;
    if (isRunActive(run.status)) return 1;
    return 0;
  };
  const leftRank = rank(left, leftFlags);
  const rightRank = rank(right, rightFlags);
  if (rightRank !== leftRank) return rightRank - leftRank;
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

const SCORE_BREAKDOWN_FIELDS: Array<{ field: BreakdownScoreField; label: string }> = [
  { field: "styleScore", label: "风格" },
  { field: "languageScore", label: "语言" },
  { field: "densityScore", label: "密度" },
  { field: "emotionScore", label: "情绪" },
  { field: "structureScore", label: "结构" },
  { field: "topicMomentumScore", label: "话题势能" },
  { field: "headlineScore", label: "标题" },
  { field: "hookScore", label: "开头" },
  { field: "shareabilityScore", label: "传播" },
  { field: "readerValueScore", label: "读者价值" },
  { field: "noveltyScore", label: "新鲜感" },
  { field: "platformFitScore", label: "平台适配" },
];

function getResultDeltaTotal(result: RunResultItem) {
  return getNumber(getRecord(getRecord(result.judgePayload.comparison).delta).total_score);
}

function getResultCaseError(result: RunResultItem) {
  const caseError = getRecord(result.judgePayload).caseError;
  return typeof caseError === "string" && caseError.trim() ? caseError.trim() : null;
}

function getWritingEvalCaseLedgerStatusLabel(status: "succeeded" | "failed" | "running" | "queued" | "disabled") {
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running") return "执行中";
  if (status === "queued") return "排队中";
  return "已禁用";
}

function getWritingEvalCaseLedgerStatusTone(status: "succeeded" | "failed" | "running" | "queued" | "disabled") {
  if (status === "succeeded") return "text-emerald-400 border-emerald-500/30";
  if (status === "failed") return "text-cinnabar border-cinnabar/40";
  if (status === "running") return "text-amber-200 border-amber-400/40";
  if (status === "queued") return "text-stone-300 border-stone-700";
  return "text-stone-500 border-stone-800";
}

function getWritingEvalStageJobStatusLabel(status: string) {
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running") return "执行中";
  if (status === "queued") return "排队中";
  return status || "--";
}

function getWritingEvalStageJobStatusTone(status: string) {
  if (status === "completed") return "text-emerald-400 border-emerald-500/30";
  if (status === "failed") return "text-cinnabar border-cinnabar/40";
  if (status === "running") return "text-amber-200 border-amber-400/40";
  if (status === "queued") return "text-stone-300 border-stone-700";
  return "text-stone-500 border-stone-800";
}

function averageNumbers(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toSnakeCaseScoreField(field: string) {
  return field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function getBaselineScore(result: RunResultItem, field: ScoreMetricField) {
  return getNumber(getRecord(getRecord(result.judgePayload.baseline).scores)[toSnakeCaseScoreField(field)]);
}

function truncateText(value: string | null | undefined, limit: number) {
  const text = String(value || "").trim();
  if (!text) return "暂无内容";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
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

function buildPromptOptimizationGoalFromRun(runDetail: RunDetailItem, promptId: string) {
  return [
    `基于实验 ${runDetail.runCode} 的结果继续优化 ${promptId}。`,
    `当前系统建议：${runDetail.recommendation}。`,
    runDetail.recommendationReason || "",
    "要求延续已有输出契约，优先做小步、可归因、可回滚的 Prompt 调整。",
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizePlanCodes(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

const ACTIVE_RUN_STATUSES = new Set(["queued", "running", "scoring", "promoting"]);
const TITLE_TEMPLATE_PROMPT_ID = "outline_planning";
const LEAD_TEMPLATE_PROMPT_ID = "prose_polish";

function isRunActive(status: unknown) {
  return ACTIVE_RUN_STATUSES.has(String(status || "").trim());
}

function isPromptBackedVersionType(versionType: string) {
  return versionType === "prompt_version"
    || versionType === "fact_check"
    || versionType === "title_template"
    || versionType === "lead_template";
}

function getPromptTargetIdFromVersionRef(versionType: string, versionRef: string) {
  if (!isPromptBackedVersionType(versionType)) return null;
  return parsePromptVersionRef(versionRef)?.promptId ?? null;
}

function canCreateRunFromSelection(input: {
  dataset: DatasetItem | null;
  readiness: DatasetItem["readiness"] | null;
  triggerMode: string;
  decisionMode: string;
}) {
  if (!input.dataset || !input.readiness) return false;
  if (input.dataset.status === "archived") return false;
  if (input.triggerMode === "manual" && input.decisionMode === "manual_review") return true;
  if (input.dataset.status !== "active") return false;
  if (input.readiness.status === "blocked") return false;
  return input.decisionMode === "manual_review" || input.readiness.status === "ready";
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

function canCreateScheduleFromSelection(input: {
  dataset: DatasetItem | null;
  readiness: DatasetItem["readiness"] | null;
  decisionMode: string;
}) {
  if (!input.dataset || !input.readiness) return false;
  if (input.dataset.status !== "active") return false;
  if (input.readiness.status === "blocked") return false;
  return input.decisionMode === "manual_review" || input.readiness.status === "ready";
}

function WritingEvalDatasetGuardPanel({
  title,
  meta,
  readiness,
  children,
}: {
  title: string;
  meta: ReturnType<typeof getDatasetReadinessMeta>;
  readiness: DatasetItem["readiness"];
  children: ReactNode;
}) {
  return (
    <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{title}</div>
        <span className={`border px-2 py-1 text-[11px] uppercase tracking-[0.16em] ${meta.tone}`}>
          {meta.label}
        </span>
      </div>
      <div className="mt-3 leading-7">{children}</div>
      {readiness.blockers.length > 0 ? (
        <div className="mt-2 text-xs leading-6 text-cinnabar">阻断项：{readiness.blockers.join("；")}</div>
      ) : null}
      {readiness.warnings.length > 0 ? (
        <div className="mt-2 text-xs leading-6 text-amber-200">告警：{readiness.warnings.slice(0, 3).join("；")}</div>
      ) : null}
    </div>
  );
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

function getFeedbackCalibrationTone(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "border-stone-700 text-stone-300";
  return value >= 0 ? "border-emerald-700 text-emerald-400" : "border-cinnabar text-cinnabar";
}

function FeedbackSampleCard({
  item,
  detail,
  actionContent,
  extraContent,
}: {
  item: FeedbackItem;
  detail: ReactNode;
  actionContent?: ReactNode;
  extraContent?: ReactNode;
}) {
  return (
    <article className="border border-stone-800 bg-[#141414] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{getFeedbackSourceLabel(item)}</div>
          <div className="mt-2 text-base text-stone-100">{item.topicTitle || item.articleTitle || "未绑定样本"}</div>
          <div className="mt-2 text-sm text-stone-500">{detail}</div>
        </div>
        <div className="text-xs text-stone-500">{formatWritingEvalDateTime(item.capturedAt)}</div>
      </div>

      <div className="mt-4 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div className="border border-stone-800 px-3 py-3 text-stone-300">打开率 {formatWritingEvalMetric(item.openRate, "%")}</div>
        <div className="border border-stone-800 px-3 py-3 text-stone-300">读完率 {formatWritingEvalMetric(item.readCompletionRate, "%")}</div>
        <div className="border border-stone-800 px-3 py-3 text-stone-300">分享率 {formatWritingEvalMetric(item.shareRate, "%")}</div>
        <div className="border border-stone-800 px-3 py-3 text-stone-300">收藏率 {formatWritingEvalMetric(item.favoriteRate, "%")}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <span className="border border-stone-700 px-3 py-1 text-stone-300">观察爆款 {formatWritingEvalMetric(item.observedViralScore, "", 2)}</span>
        <span className="border border-stone-700 px-3 py-1 text-stone-300">离线预测 {formatWritingEvalMetric(item.predictedViralScore, "", 2)}</span>
        <span className={`border px-3 py-1 ${getFeedbackCalibrationTone(item.calibrationGap)}`}>
          偏差 {formatWritingEvalMetric(item.calibrationGap, "", 2)}
        </span>
        <span className="border border-stone-700 px-3 py-1 text-stone-300">
          阅读量 {item.readCount ?? "--"} · 点赞 {item.likeCount ?? "--"} · 评论 {item.commentCount ?? "--"}
        </span>
      </div>

      {actionContent ? <div className="mt-4 flex flex-wrap gap-3">{actionContent}</div> : null}
      {extraContent ? <div className="mt-4">{extraContent}</div> : null}
      {item.notes ? <div className="mt-3 text-sm leading-7 text-stone-400">{item.notes}</div> : null}
    </article>
  );
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
  if (versionType === "fact_check") {
    return promptOptions.filter((item) => item.promptId === "fact_check");
  }
  if (versionType === "title_template") {
    return promptOptions.filter((item) => item.promptId === TITLE_TEMPLATE_PROMPT_ID);
  }
  if (versionType === "lead_template") {
    return promptOptions.filter((item) => item.promptId === LEAD_TEMPLATE_PROMPT_ID);
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

function buildVersionLedgerHref(versionType: string, versionRef: string, versionId?: number | null) {
  return buildAdminWritingEvalVersionsHref({
    assetType: versionType,
    assetRef: versionRef,
    versionId,
  });
}

function buildPromptFocusHref(value: string) {
  const parsed = parsePromptVersionRef(value);
  if (!parsed) return null;
  const params = new URLSearchParams({
    promptId: parsed.promptId,
    version: parsed.version,
  });
  return `/admin/prompts?${params.toString()}`;
}

function getRequiredPromptTargetIdForExperimentMode(experimentMode: string) {
  if (experimentMode === "title_only") return TITLE_TEMPLATE_PROMPT_ID;
  if (experimentMode === "lead_only") return LEAD_TEMPLATE_PROMPT_ID;
  return null;
}

function getRequiredVersionTypeForExperimentMode(experimentMode: string) {
  if (experimentMode === "title_only") return "title_template";
  if (experimentMode === "lead_only") return "lead_template";
  return null;
}

function getExperimentModeLabel(experimentMode: string) {
  if (experimentMode === "title_only") return "只优化标题";
  if (experimentMode === "lead_only") return "只优化开头";
  return "全文实验";
}

function getVersionTypeLabel(versionType: string) {
  if (versionType === "fact_check") return "fact_check（事实核查 Prompt）";
  if (versionType === "title_template") return "title_template（标题模板 Prompt）";
  if (versionType === "lead_template") return "lead_template（开头模板 Prompt）";
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

function getWritingEvalAutoExecutionResultLabel(result: string) {
  if (result === "keep") return "已自动 keep";
  if (result === "discard") return "已自动 discard";
  if (result === "rollback") return "已自动回滚";
  if (result === "noop_already_resolved") return "已跳过，Run 先前已决议";
  if (result === "skipped_non_keep") return "未触发 keep，保留人工审核";
  if (result === "failed") return "自动执行失败";
  if (result === "manual_review") return "保留人工审核";
  if (result === "missing_service_dispatch_result") return "自动执行结果缺失";
  return result || "--";
}

function getWritingEvalAutoExecutionTone(result: string) {
  if (result === "keep") return "text-emerald-400";
  if (result === "discard" || result === "rollback" || result === "failed") return "text-cinnabar";
  return "text-stone-500";
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

export function AdminWritingEvalClient({
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
  const [retryingRunId, setRetryingRunId] = useState<number | null>(null);
  const [creatingAiCandidateRun, setCreatingAiCandidateRun] = useState(false);
  const [promotingRunAction, setPromotingRunAction] = useState<string | null>(null);
  const [savingRunOpsAction, setSavingRunOpsAction] = useState<string | null>(null);
  const [rollingBackRunOpsLedgerId, setRollingBackRunOpsLedgerId] = useState<number | null>(null);
  const [runOpsRolloutForm, setRunOpsRolloutForm] = useState({
    isEnabled: false,
    autoMode: "manual",
    rolloutObserveOnly: false,
    rolloutPercentage: "0",
    rolloutPlanCodes: "",
    notes: "",
  });
  const [promoteApprovalReason, setPromoteApprovalReason] = useState("");
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
  const [runOpsFilter, setRunOpsFilter] = useState<"all" | "action_required" | "exceptions">("all");
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
        historicalSimilarityMultiplier: 0.35,
        judgeDisagreementMultiplier: 0.45,
      },
      judge: {
        enabled: 1,
        ruleWeight: 0.65,
        judgeWeight: 0.35,
        temperature: 0.2,
        reviewers: [
          { label: "strict", model: "", temperature: 0.1, weight: 1 },
          { label: "market", model: "", temperature: 0.35, weight: 1 },
        ],
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
  const displayedScheduleStats = getWritingEvalScheduleStats(displayedSchedules);
  const blockedDisplayedSchedules = displayedSchedules.filter((item) => item.isEnabled && !isExecutableSchedule(item));
  const promptTargets = Array.from(
    new Map(promptOptions.map((item) => [item.promptId, { promptId: item.promptId, label: `${item.name} · ${item.promptId}` }])).values(),
  );
  const selectedScoringProfile = scoringProfiles.find((profile) => profile.id === selectedScoringProfileId) ?? null;
  const selectedRunSourceSchedule = selectedRunDetail
    ? (
      selectedRunDetail.sourceScheduleId
        ? schedules.find((schedule) => schedule.id === selectedRunDetail.sourceScheduleId) ?? null
        : schedules.find((schedule) => schedule.lastRunId === selectedRunDetail.id) ?? null
    )
    : null;
  const selectedRunSourceScheduleId = selectedRunDetail?.sourceScheduleId ?? selectedRunSourceSchedule?.id ?? null;
  const selectedRunSourceScheduleName = selectedRunSourceSchedule?.name ?? selectedRunDetail?.sourceScheduleName ?? null;
  const selectedRunPostDecisionOps = selectedRunDetail?.postDecisionOps ?? null;
  const selectedRunBaseLedgerHref = selectedRunDetail
    ? buildVersionLedgerHref(
      selectedRunDetail.baseVersionType,
      selectedRunDetail.baseVersionRef,
      selectedRunPostDecisionOps?.baseLedgerId ?? null,
    )
    : null;
  const selectedRunCandidateLedgerHref = selectedRunDetail
    ? buildVersionLedgerHref(
      selectedRunDetail.candidateVersionType,
      selectedRunDetail.candidateVersionRef,
      selectedRunPostDecisionOps?.candidateLedgerId ?? null,
    )
    : null;
  const selectedRunBasePromptHref =
    selectedRunDetail && isPromptBackedVersionType(selectedRunDetail.baseVersionType)
      ? buildPromptFocusHref(selectedRunDetail.baseVersionRef)
      : null;
  const selectedRunCandidatePromptHref =
    selectedRunDetail && isPromptBackedVersionType(selectedRunDetail.candidateVersionType)
      ? buildPromptFocusHref(selectedRunDetail.candidateVersionRef)
      : null;
  const selectedRunBaseVersionHref = selectedRunBasePromptHref ?? selectedRunBaseLedgerHref;
  const selectedRunCandidateVersionHref = selectedRunCandidatePromptHref ?? selectedRunCandidateLedgerHref;
  const selectedRunSourceScheduleHref = selectedRunSourceScheduleId ? buildAdminWritingEvalRunsHref({ scheduleId: selectedRunSourceScheduleId }) : null;
  const selectedRunOpsVersionsHref = selectedRunPostDecisionOps
    ? buildVersionLedgerHref(
      selectedRunPostDecisionOps.focusVersionType,
      selectedRunPostDecisionOps.focusVersionRef,
      selectedRunPostDecisionOps.focusLedgerId,
    )
    : null;
  const selectedRunOpsPromptHref =
    selectedRunPostDecisionOps?.rolloutKind === "prompt"
      ? buildPromptFocusHref(selectedRunPostDecisionOps.focusVersionRef)
      : null;
  const canInlineRunRollout = Boolean(
    selectedRunDetail
    && selectedRunPostDecisionOps
    && selectedRunDetail.resolutionStatus !== "pending"
    && selectedRunPostDecisionOps.rolloutKind !== "unsupported",
  );
  const canRollbackSelectedRunOpsLedger = Boolean(
    selectedRunDetail
    && selectedRunDetail.resolutionStatus !== "pending"
    && selectedRunPostDecisionOps?.canRollbackFocusLedger
    && selectedRunPostDecisionOps.focusLedgerId,
  );
  const selectedRunResult = selectedRunDetail
    ? selectedRunDetail.results.find((result) => result.id === selectedResultId) ?? selectedRunDetail.results[0] ?? null
    : null;
  const hasActiveRuns = runs.some((run) => isRunActive(run.status));
  const selectedRunIsActive = selectedRunDetail ? isRunActive(selectedRunDetail.status) : false;
  const selectedRunPipelineStage = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.pipelineStage) : "";
  const selectedRunPipelineStageLabel = getWritingEvalPipelineStageLabel(selectedRunPipelineStage, selectedRunDetail?.status);
  const selectedRunStageStartedAt = selectedRunDetail
    ? getWritingEvalStageStartedAt(selectedRunDetail.scoreSummary, selectedRunDetail.startedAt)
    : null;
  const selectedRunStageDuration = selectedRunDetail
    ? formatWritingEvalElapsed(selectedRunStageStartedAt, selectedRunIsActive ? undefined : selectedRunDetail.finishedAt)
    : null;
  const selectedRunTotalDuration = selectedRunDetail
    ? formatWritingEvalElapsed(
      getIsoDateTimeString(selectedRunDetail.scoreSummary.runStartedAt) ?? selectedRunDetail.startedAt,
      selectedRunDetail.finishedAt,
    )
    : null;
  const selectedRunRequiresRiskApproval = selectedRunDetail?.recommendation !== "keep";
  const selectedRunLastProgressAt = selectedRunDetail ? getIsoDateTimeString(selectedRunDetail.scoreSummary.lastProgressAt) : null;
  const selectedRunQueueWaitDuration = selectedRunDetail
    ? getWritingEvalQueueWaitDuration(selectedRunDetail.createdAt, selectedRunDetail.startedAt, selectedRunDetail.status)
    : null;
  const selectedRunQueueDelayed = selectedRunDetail
    ? isWritingEvalQueueDelayed(selectedRunDetail.createdAt, selectedRunDetail.startedAt, selectedRunDetail.status)
    : false;
  const selectedRunHeartbeatLag = selectedRunDetail
    ? getWritingEvalHeartbeatStaleness(selectedRunLastProgressAt, selectedRunDetail.startedAt, selectedRunDetail.status)
    : null;
  const selectedRunHeartbeatStale = selectedRunDetail
    ? isWritingEvalHeartbeatStale(selectedRunLastProgressAt, selectedRunDetail.startedAt, selectedRunDetail.status)
    : false;
  const selectedRunAutoDecision = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoDecision) : "";
  const selectedRunAutoDecisionReason = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoDecisionReason) : "";
  const selectedRunAutoExecutionMode = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoExecutionMode) : "";
  const selectedRunAutoExecutionTargetDecision = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoExecutionTargetDecision) : "";
  const selectedRunAutoExecutionResult = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoExecutionResult) : "";
  const selectedRunAutoExecutionCompletedAt = selectedRunDetail ? getIsoDateTimeString(selectedRunDetail.scoreSummary.autoExecutionCompletedAt) : null;
  const selectedRunAutoExecutionError = selectedRunDetail ? getString(selectedRunDetail.scoreSummary.autoExecutionError) : "";
  const selectedRunShowAutoExecution =
    Boolean(
      selectedRunAutoExecutionMode
      || selectedRunAutoDecision
      || selectedRunAutoExecutionTargetDecision
      || selectedRunAutoExecutionResult,
    );
  const selectedRunTimelineEntries = selectedRunDetail
    ? getWritingEvalTimelineEntries(selectedRunDetail.scoreSummary, selectedRunDetail.startedAt, selectedRunDetail.finishedAt)
    : [];
  const selectedRunPhaseDurations = selectedRunDetail
    ? [
      {
        label: "生成",
        value: formatWritingEvalElapsed(
          getIsoDateTimeString(selectedRunDetail.scoreSummary.generationStartedAt) ?? selectedRunDetail.startedAt,
          getIsoDateTimeString(selectedRunDetail.scoreSummary.generationCompletedAt)
            ?? getIsoDateTimeString(selectedRunDetail.scoreSummary.scoringStartedAt)
            ?? (getString(selectedRunDetail.scoreSummary.failedStage) === "generation"
              ? getIsoDateTimeString(selectedRunDetail.scoreSummary.failedAt)
              : null),
        ),
      },
      {
        label: "评分",
        value: formatWritingEvalElapsed(
          getIsoDateTimeString(selectedRunDetail.scoreSummary.scoringStartedAt),
          getIsoDateTimeString(selectedRunDetail.scoreSummary.scoreCompletedAt)
            ?? getIsoDateTimeString(selectedRunDetail.scoreSummary.promotionStartedAt)
            ?? (getString(selectedRunDetail.scoreSummary.failedStage) === "scoring"
              ? getIsoDateTimeString(selectedRunDetail.scoreSummary.failedAt)
              : null),
        ),
      },
      {
        label: "决议",
        value: formatWritingEvalElapsed(
          getIsoDateTimeString(selectedRunDetail.scoreSummary.promotionStartedAt),
          getIsoDateTimeString(selectedRunDetail.scoreSummary.promotionCompletedAt)
            ?? (getString(selectedRunDetail.scoreSummary.failedStage) === "promotion"
              ? getIsoDateTimeString(selectedRunDetail.scoreSummary.failedAt)
              : null),
        ),
      },
    ].filter((item): item is { label: string; value: string } => Boolean(item.value))
    : [];
  const selectedDatasetHref = buildAdminWritingEvalDatasetsHref({ datasetId: selectedDatasetId });
  const runOpsStats = runs.reduce(
    (stats, run) => {
      const flags = getWritingEvalRunOpsFlags(run);
      if (flags.actionRequired) stats.actionRequired += 1;
      if (flags.exception) stats.exceptions += 1;
      if (flags.resolutionPending) stats.pendingResolution += 1;
      return stats;
    },
    { actionRequired: 0, exceptions: 0, pendingResolution: 0 },
  );
  const displayedRuns = runs.filter((run) => {
    const flags = getWritingEvalRunOpsFlags(run);
    if (runOpsFilter === "action_required") return flags.actionRequired;
    if (runOpsFilter === "exceptions") return flags.exception;
    return true;
  });
  const exceptionRuns = runs
    .filter((run) => getWritingEvalRunOpsFlags(run).exception)
    .sort(compareRunsByUrgency)
    .slice(0, 5);
  const pendingDecisionRuns = runs
    .filter((run) => getWritingEvalRunOpsFlags(run).resolutionPending)
    .sort(compareRunsByUrgency)
    .slice(0, 5);
  const selectedRunCaseLedger = selectedRunDetail && selectedRunDetail.datasetId === selectedDatasetId
    ? (() => {
      const resultByCaseId = new Map(selectedRunDetail.results.map((result) => [result.caseId, result] as const));
      const currentCaseId = getNumber(selectedRunDetail.scoreSummary.currentCaseId);
      const currentTaskCode = getString(selectedRunDetail.scoreSummary.currentTaskCode);
      const items = cases.map((item) => {
        const result = resultByCaseId.get(item.id) ?? null;
        const caseError = result ? getResultCaseError(result) : null;
        const isRunning = !result && ((currentCaseId !== null && currentCaseId === item.id) || (currentTaskCode && currentTaskCode === item.taskCode));
        const status: "succeeded" | "failed" | "running" | "queued" | "disabled" =
          !item.isEnabled
            ? "disabled"
            : result
              ? caseError
                ? "failed"
                : "succeeded"
              : isRunning
                ? "running"
                : "queued";
        return {
          caseId: item.id,
          taskCode: item.taskCode,
          topicTitle: item.topicTitle,
          difficultyLevel: item.difficultyLevel,
          status,
          statusLabel: getWritingEvalCaseLedgerStatusLabel(status),
          statusTone: getWritingEvalCaseLedgerStatusTone(status),
          totalScore: result?.totalScore ?? null,
          caseError,
          resultId: result?.id ?? null,
        };
      });
      const counts = items.reduce(
        (stats, item) => {
          if (item.status === "succeeded") stats.succeeded += 1;
          else if (item.status === "failed") stats.failed += 1;
          else if (item.status === "running") stats.running += 1;
          else if (item.status === "queued") stats.queued += 1;
          else stats.disabled += 1;
          return stats;
        },
        { succeeded: 0, failed: 0, running: 0, queued: 0, disabled: 0 },
      );
      items.sort((left, right) => {
        const rank = { failed: 0, running: 1, queued: 2, succeeded: 3, disabled: 4 } as const;
        if (rank[left.status] !== rank[right.status]) return rank[left.status] - rank[right.status];
        return left.taskCode.localeCompare(right.taskCode, "zh-CN");
      });
      return { items, counts };
    })()
    : null;
  const selectedRunJobHistory = selectedRunDetail?.jobHistory ?? [];
  const selectedRunRetryHistory = selectedRunDetail?.retryHistory ?? [];
  const selectedRunJobHistorySummary = selectedRunJobHistory.reduce(
    (stats, item) => {
      if (item.status === "completed") stats.completed += 1;
      else if (item.status === "failed") stats.failed += 1;
      else if (item.status === "running") stats.running += 1;
      else if (item.status === "queued") stats.queued += 1;
      else stats.other += 1;
      return stats;
    },
    { completed: 0, failed: 0, running: 0, queued: 0, other: 0 },
  );
  const selectedRunFormDataset = datasets.find((item) => String(item.id) === runForm.datasetId) ?? null;
  const selectedRunFormDatasetReadiness = selectedRunFormDataset?.readiness ?? null;
  const selectedRunFormDatasetReadinessMeta = getDatasetReadinessMeta(selectedRunFormDatasetReadiness);
  const canCreateRun = canCreateRunFromSelection({
    dataset: selectedRunFormDataset,
    readiness: selectedRunFormDatasetReadiness,
    triggerMode: runForm.triggerMode,
    decisionMode: runForm.decisionMode,
  });
  const canCreateAiCandidateRun = canCreateRun && isPromptBackedVersionType(runForm.baseVersionType) && Boolean(runForm.baseVersionRef);
  const canCreateSchedule = canCreateScheduleFromSelection({
    dataset: selectedRunFormDataset,
    readiness: selectedRunFormDatasetReadiness,
    decisionMode: scheduleForm.decisionMode,
  });
  const selectedRunCaseHref =
    selectedRunResult && selectedRunDetail
      ? buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: selectedRunResult.caseId })
      : null;
  const runFormDatasetHref = runForm.datasetId ? buildAdminWritingEvalDatasetsHref({ datasetId: Number(runForm.datasetId) }) : null;
  const runFormBasePromptHref = isPromptBackedVersionType(runForm.baseVersionType)
    ? buildPromptFocusHref(runForm.baseVersionRef)
    : null;
  const runFormCandidatePromptHref = isPromptBackedVersionType(runForm.candidateVersionType)
    ? buildPromptFocusHref(runForm.candidateVersionRef)
    : null;
  const scheduleEditorDatasetHref = scheduleEditorForm.datasetId ? buildAdminWritingEvalDatasetsHref({ datasetId: Number(scheduleEditorForm.datasetId) }) : null;
  const scheduleEditorBasePromptHref = isPromptBackedVersionType(scheduleEditorForm.baseVersionType)
    ? buildPromptFocusHref(scheduleEditorForm.baseVersionRef)
    : null;
  const scheduleEditorCandidatePromptHref = isPromptBackedVersionType(scheduleEditorForm.candidateVersionType)
    ? buildPromptFocusHref(scheduleEditorForm.candidateVersionRef)
    : null;

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

  useEffect(() => {
    setPromoteApprovalReason("");
  }, [selectedRunDetail?.id]);

  useEffect(() => {
    setRunOpsRolloutForm({
      isEnabled: Boolean(selectedRunPostDecisionOps?.rolloutConfig?.isEnabled),
      autoMode: selectedRunPostDecisionOps?.rolloutConfig?.autoMode ?? "manual",
      rolloutObserveOnly: Boolean(selectedRunPostDecisionOps?.rolloutConfig?.rolloutObserveOnly),
      rolloutPercentage: String(selectedRunPostDecisionOps?.rolloutConfig?.rolloutPercentage ?? 0),
      rolloutPlanCodes: selectedRunPostDecisionOps?.rolloutConfig?.rolloutPlanCodes.join(", ") ?? "",
      notes: selectedRunPostDecisionOps?.rolloutConfig?.notes ?? "",
    });
  }, [selectedRunPostDecisionOps]);

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
      const response = await fetch(`/api/admin/writing-eval/datasets/${selectedDatasetId}/cases`);
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

  async function refreshRuns(options?: { silent?: boolean }) {
    const response = await fetch("/api/admin/writing-eval/runs");
    const json = await response.json();
    if (!response.ok || !json.success) {
      if (!options?.silent) {
        setMessage(json.error || "刷新实验运行失败");
      }
      return null;
    }
    const nextRuns = json.data as RunItem[];
    setRuns(nextRuns);
    return nextRuns;
  }

  async function refreshSchedules() {
    const response = await fetch("/api/admin/writing-eval/schedules");
    const json = await response.json();
    if (!response.ok || !json.success) {
      setMessage(json.error || "刷新调度规则失败");
      return null;
    }
    const nextSchedules = sortSchedules(json.data as RunScheduleItem[]);
    setSchedules(nextSchedules);
    return nextSchedules;
  }

  async function loadRunDetail(runId: number, options?: { silent?: boolean; syncUrl?: boolean }) {
    if (!options?.silent) {
      setLoadingRunDetail(true);
    }
    const response = await fetch(`/api/admin/writing-eval/runs/${runId}`);
    const json = await response.json();
    if (!options?.silent) {
      setLoadingRunDetail(false);
    }
    if (!response.ok || !json.success) {
      if (!options?.silent) {
        setMessage(json.error || "加载实验详情失败");
      }
      return;
    }
    const detail = json.data as RunDetailItem;
    setSelectedRunId(runId);
    setSelectedRunDetail(detail);
    setSelectedDatasetId(detail.datasetId);
    setRunForm((prev) => ({ ...prev, datasetId: String(detail.datasetId) }));
    if (options?.syncUrl !== false) {
      replaceRunsUrl(runId, null, detail.datasetId);
    }
  }

  async function loadFeedback(runId: number) {
    setLoadingFeedback(true);
    const response = await fetch(`/api/admin/writing-eval/runs/${runId}/feedback`);
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
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/feedback`);
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
            historicalSimilarityMultiplier: 0.35,
            judgeDisagreementMultiplier: 0.45,
          },
          judge: {
            enabled: 1,
            ruleWeight: 0.65,
            judgeWeight: 0.35,
            temperature: 0.2,
            reviewers: [
              { label: "strict", model: "", temperature: 0.1, weight: 1 },
              { label: "market", model: "", temperature: 0.35, weight: 1 },
            ],
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

  useEffect(() => {
    if (!hasActiveRuns && !selectedRunIsActive) {
      return;
    }
    let cancelled = false;
    let polling = false;
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const nextRuns = await refreshRuns({ silent: true });
        if (cancelled) return;
        const shouldReloadSelectedRun =
          typeof selectedRunId === "number"
          && selectedRunId > 0
          && (
            selectedRunIsActive
            || (Array.isArray(nextRuns) && nextRuns.some((run) => run.id === selectedRunId && isRunActive(run.status)))
          );
        if (shouldReloadSelectedRun) {
          await loadRunDetail(selectedRunId, { silent: true, syncUrl: false });
        }
      } finally {
        polling = false;
      }
    }
    const timer = window.setInterval(() => {
      void poll();
    }, 5000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasActiveRuns, selectedRunId, selectedRunIsActive]);

  async function createRunWithPayload(input: {
    datasetId: number;
    baseVersionType: string;
    baseVersionRef: string;
    candidateVersionType: string;
    candidateVersionRef: string;
    experimentMode: string;
    triggerMode: string;
    decisionMode: string;
    summary: string;
  }) {
    const response = await fetch("/api/admin/writing-eval/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "创建实验运行失败");
    }
    const created = json.data as RunItem;
    const nextRuns = await refreshRuns();
    setSelectedRunId(created.id);
    await loadRunDetail(created.id);
    if (nextRuns && nextRuns.length > 0) {
      setRuns(nextRuns);
    }
    startTransition(() => router.refresh());
    return created;
  }

  async function handleCreateRun(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      await createRunWithPayload({
        datasetId: Number(runForm.datasetId),
        baseVersionType: runForm.baseVersionType,
        baseVersionRef: runForm.baseVersionRef,
        candidateVersionType: runForm.candidateVersionType,
        candidateVersionRef: runForm.candidateVersionRef,
        experimentMode: runForm.experimentMode,
        triggerMode: runForm.triggerMode,
        decisionMode: runForm.decisionMode,
        summary: runForm.summary,
      });
      setRunForm((prev) => ({ ...prev, summary: "" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建实验运行失败");
    }
  }

  async function createScheduleWithPayload(input: {
    name: string;
    datasetId: number;
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
    isEnabled: boolean;
    summary: string;
  }) {
    const response = await fetch("/api/admin/writing-eval/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "创建调度规则失败");
    }
    const created = json.data as RunScheduleItem;
    setSchedules((prev) => sortSchedules([created, ...prev]));
    return created;
  }

  async function handleCreateSchedule(event: FormEvent) {
    event.preventDefault();
    setSavingSchedule(true);
    setMessage("");
    try {
      const created = await createScheduleWithPayload({
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
      });
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
    const response = await fetch(`/api/admin/writing-eval/schedules/${scheduleId}`, {
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

  function openScheduleEditor(schedule: RunScheduleItem, options?: { scrollIntoView?: boolean }) {
    setEditingScheduleId(schedule.id);
    setScheduleEditorForm(createScheduleEditorForm(schedule));
    if (options?.scrollIntoView && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById(`schedule-card-${schedule.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function handleStartEditSchedule(schedule: RunScheduleItem) {
    openScheduleEditor(schedule);
    setMessage("");
  }

  function handleCancelEditSchedule() {
    setEditingScheduleId(null);
    setMessage("");
  }

  function handleApplyCurrentRunToEditingSchedule() {
    if (selectedRunDetail) {
      setScheduleEditorForm((prev) => ({
        ...prev,
        datasetId: String(selectedRunDetail.datasetId),
        baseVersionType: selectedRunDetail.baseVersionType,
        baseVersionRef: selectedRunDetail.baseVersionRef,
        candidateVersionType: selectedRunDetail.candidateVersionType,
        candidateVersionRef: selectedRunDetail.candidateVersionRef,
        experimentMode: selectedRunDetail.experimentMode,
        decisionMode: selectedRunDetail.decisionMode,
        summary: selectedRunDetail.summary || prev.summary,
      }));
      setMessage(`已将 ${selectedRunDetail.runCode} 的实验定义覆盖到当前调度编辑表单`);
      return;
    }

    setScheduleEditorForm((prev) => ({
      ...prev,
      datasetId: runForm.datasetId,
      baseVersionType: runForm.baseVersionType,
      baseVersionRef: runForm.baseVersionRef,
      candidateVersionType: runForm.candidateVersionType,
      candidateVersionRef: runForm.candidateVersionRef,
      experimentMode: runForm.experimentMode,
      decisionMode: runForm.decisionMode,
      summary: runForm.summary || prev.summary,
    }));
    setMessage("当前未选择 Run，已回退为发起实验表单中的实验定义");
  }

  function handleEditSourceScheduleFromSelectedRun() {
    if (!selectedRunSourceSchedule || !selectedRunDetail) {
      setMessage("当前 Run 暂未匹配到可编辑的来源调度规则");
      return;
    }
    openScheduleEditor(selectedRunSourceSchedule, { scrollIntoView: true });
    setMessage(`已打开 ${selectedRunDetail.runCode} 的来源调度 ${selectedRunSourceSchedule.name} 进行编辑`);
  }

  const currentCreateStrategyPreset = getWritingEvalAgentStrategyPreset(scheduleForm.agentStrategy);
  const currentEditorStrategyPreset = getWritingEvalAgentStrategyPreset(scheduleEditorForm.agentStrategy);

  async function handleSaveSchedule(scheduleId: number) {
    setSavingScheduleId(scheduleId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/schedules/${scheduleId}`, {
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
      const response = await fetch(`/api/admin/writing-eval/schedules/${scheduleId}/dispatch`, {
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
      const response = await fetch("/api/admin/writing-eval/schedules", {
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
    const response = await fetch("/api/admin/writing-eval/scoring-profiles", {
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
    const response = await fetch(`/api/admin/writing-eval/scoring-profiles/${selectedScoringProfile.id}`, {
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
    const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/feedback`, {
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

  function handleReuseSelectedRunConfig() {
    if (!selectedRunDetail) return;
    const nextPromptTargetId =
      getPromptTargetIdFromVersionRef(selectedRunDetail.baseVersionType, selectedRunDetail.baseVersionRef)
      || getPromptTargetIdFromVersionRef(selectedRunDetail.candidateVersionType, selectedRunDetail.candidateVersionRef)
      || promptTargetId;
    setPromptTargetId(nextPromptTargetId);
    setSelectedDatasetId(selectedRunDetail.datasetId);
    setRunForm({
      datasetId: String(selectedRunDetail.datasetId),
      baseVersionType: selectedRunDetail.baseVersionType,
      baseVersionRef: selectedRunDetail.baseVersionRef,
      candidateVersionType: selectedRunDetail.candidateVersionType,
      candidateVersionRef: selectedRunDetail.candidateVersionRef,
      experimentMode: selectedRunDetail.experimentMode,
      triggerMode: selectedRunDetail.triggerMode,
      decisionMode: selectedRunDetail.decisionMode,
      summary: selectedRunDetail.summary || `复用 ${selectedRunDetail.runCode} 的实验配置`,
    });
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("run-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    setMessage(`已将 ${selectedRunDetail.runCode} 的配置回填到发起实验表单`);
  }

  function handleSwapRunVersions() {
    setRunForm((prev) => ({
      ...prev,
      baseVersionType: prev.candidateVersionType,
      baseVersionRef: prev.candidateVersionRef,
      candidateVersionType: prev.baseVersionType,
      candidateVersionRef: prev.baseVersionRef,
    }));
    setMessage("已交换基线与候选版本");
  }

  function handlePrefillScheduleFromSelectedRun() {
    if (!selectedRunDetail) return;
    setSelectedDatasetId(selectedRunDetail.datasetId);
    setRunForm((prev) => ({
      ...prev,
      datasetId: String(selectedRunDetail.datasetId),
      baseVersionType: selectedRunDetail.baseVersionType,
      baseVersionRef: selectedRunDetail.baseVersionRef,
      candidateVersionType: selectedRunDetail.candidateVersionType,
      candidateVersionRef: selectedRunDetail.candidateVersionRef,
      experimentMode: selectedRunDetail.experimentMode,
      decisionMode: selectedRunDetail.decisionMode,
      summary: selectedRunDetail.summary || prev.summary,
    }));
    setScheduleForm((prev) => ({
      ...prev,
      name: prev.name || `${selectedRunDetail.runCode} 自动实验`,
      summary: selectedRunDetail.summary || prev.summary,
      decisionMode: selectedRunDetail.decisionMode,
    }));
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("schedule-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    setMessage(`已将 ${selectedRunDetail.runCode} 的配置回填到调度规则表单`);
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

  async function handleRetryRunById(runId: number) {
    if (!Number.isInteger(runId) || runId <= 0) return;
    setRetryingRunId(runId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${runId}/retry`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.error || "重试实验运行失败");
        return;
      }
      await refreshRuns();
      setMessage(`已重新入队 ${json.data?.runCode || `Run #${runId}`}`);
      await loadRunDetail(runId);
    } finally {
      setRetryingRunId(null);
    }
  }

  async function handleRetryRun() {
    if (!selectedRunId) return;
    await handleRetryRunById(selectedRunId);
  }

  async function handlePromoteRun() {
    if (!selectedRunId) return;
    if (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim()) {
      setMessage("当前 run 命中风险守卫，keep 前必须填写审批理由");
      return;
    }
    setPromotingRunAction("promote");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "keep",
          reason: selectedRunRequiresRiskApproval ? promoteApprovalReason.trim() : "",
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          message?: string;
          promotedPromptId?: string;
          promotedVersion?: string;
          promotedScoringProfileCode?: string;
          promotedLayoutStrategyId?: number;
          promotedApplyCommandTemplateCode?: string;
        };
      };
      if (!response.ok || !json.success) {
        setMessage(json.error || "保留实验版本失败");
        return;
      }
      if (json.data?.message) {
        setMessage(json.data.message);
      } else if (json.data?.promotedPromptId && json.data.promotedVersion) {
        setMessage(`已保留候选版本 ${json.data.promotedPromptId}@${json.data.promotedVersion}`);
      } else if (json.data?.promotedScoringProfileCode) {
        setMessage(`已激活评分画像 ${json.data.promotedScoringProfileCode}`);
      } else if (json.data?.promotedLayoutStrategyId) {
        setMessage(`已激活写作风格资产 #${json.data.promotedLayoutStrategyId}`);
      } else if (json.data?.promotedApplyCommandTemplateCode) {
        setMessage(`已激活 apply command 模板 ${json.data.promotedApplyCommandTemplateCode}`);
      } else {
        setMessage("已保留候选版本");
      }
      await refreshRuns();
      await loadRunDetail(selectedRunId);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保留实验版本失败");
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handlePromoteRunAndOpenVersions() {
    if (!selectedRunId || !selectedRunDetail) return;
    if (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim()) {
      setMessage("当前 run 命中风险守卫，keep 前必须填写审批理由");
      return;
    }
    setPromotingRunAction("promote-open");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "keep",
          reason: selectedRunRequiresRiskApproval ? promoteApprovalReason.trim() : "",
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        setMessage(json.error || "保留实验版本失败");
        return;
      }
      const href = buildAdminWritingEvalVersionsHref({
        assetType: selectedRunDetail.candidateVersionType,
        assetRef: selectedRunDetail.candidateVersionRef,
      });
      startTransition(() => {
        router.push(href);
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保留实验版本失败");
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handlePromoteRunWithRollout(input: { actionKey: string; rolloutObserveOnly: boolean; rolloutPercentage: number }) {
    if (!selectedRunId) return;
    if (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim()) {
      setMessage("当前 run 命中风险守卫，keep 前必须填写审批理由");
      return;
    }
    setPromotingRunAction(input.actionKey);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "keep",
          reason: selectedRunRequiresRiskApproval ? promoteApprovalReason.trim() : "",
          autoMode: "manual",
          rolloutObserveOnly: input.rolloutObserveOnly,
          rolloutPercentage: input.rolloutPercentage,
          rolloutPlanCodes: [],
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { message?: string } };
      if (!response.ok || !json.success) {
        setMessage(json.error || "保留并配置灰度失败");
        return;
      }
      setMessage(json.data?.message || "已保留并配置灰度");
      await refreshRuns();
      await loadRunDetail(selectedRunId);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保留并配置灰度失败");
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handleSaveSelectedRunRolloutQuickAction(input: {
    actionKey: string;
    isEnabled: boolean;
    rolloutObserveOnly: boolean;
    rolloutPercentage: number;
  }) {
    if (!selectedRunDetail || !selectedRunPostDecisionOps || selectedRunPostDecisionOps.rolloutKind === "unsupported") {
      return;
    }
    const assetType = selectedRunPostDecisionOps.rolloutKind === "prompt" ? "prompt_version" : selectedRunPostDecisionOps.focusVersionType;
    setSavingRunOpsAction(input.actionKey);
    setMessage("");
    try {
      const response = await fetch("/api/admin/writing-eval/rollouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          assetRef: selectedRunPostDecisionOps.focusVersionRef,
          autoMode: selectedRunPostDecisionOps.rolloutConfig?.autoMode ?? "manual",
          rolloutObserveOnly: input.isEnabled ? input.rolloutObserveOnly : false,
          rolloutPercentage: input.isEnabled ? input.rolloutPercentage : 0,
          rolloutPlanCodes: input.isEnabled ? normalizePlanCodes((selectedRunPostDecisionOps.rolloutConfig?.rolloutPlanCodes ?? []).join(", ")) : [],
          isEnabled: input.isEnabled,
          notes: null,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存灰度配置失败");
      }
      setMessage(
        input.isEnabled
          ? input.rolloutObserveOnly
            ? "已切到观察优先"
            : `已更新为 ${Math.round(input.rolloutPercentage)}% 灰度`
          : "已暂停当前灰度",
      );
      await refreshRuns();
      if (selectedRunId) {
        await loadRunDetail(selectedRunId, { silent: true });
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存灰度配置失败");
    } finally {
      setSavingRunOpsAction(null);
    }
  }

  async function handleSaveSelectedRunRolloutForm() {
    if (!selectedRunDetail || !selectedRunPostDecisionOps || selectedRunPostDecisionOps.rolloutKind === "unsupported") {
      return;
    }
    const assetType = selectedRunPostDecisionOps.rolloutKind === "prompt" ? "prompt_version" : selectedRunPostDecisionOps.focusVersionType;
    setSavingRunOpsAction("save-form");
    setMessage("");
    try {
      const response = await fetch("/api/admin/writing-eval/rollouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetType,
          assetRef: selectedRunPostDecisionOps.focusVersionRef,
          autoMode: runOpsRolloutForm.autoMode,
          rolloutObserveOnly: runOpsRolloutForm.isEnabled ? runOpsRolloutForm.rolloutObserveOnly : false,
          rolloutPercentage: runOpsRolloutForm.isEnabled ? Number(runOpsRolloutForm.rolloutPercentage || 0) : 0,
          rolloutPlanCodes: runOpsRolloutForm.isEnabled ? normalizePlanCodes(runOpsRolloutForm.rolloutPlanCodes) : [],
          isEnabled: runOpsRolloutForm.isEnabled,
          notes: selectedRunPostDecisionOps.rolloutKind === "asset" ? runOpsRolloutForm.notes : null,
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存灰度配置失败");
      }
      setMessage("已保存当前运营对象的灰度配置");
      await refreshRuns();
      if (selectedRunId) {
        await loadRunDetail(selectedRunId, { silent: true });
      }
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存灰度配置失败");
    } finally {
      setSavingRunOpsAction(null);
    }
  }

  async function handleRollbackSelectedRunOpsLedger() {
    if (!selectedRunId || !selectedRunPostDecisionOps?.focusLedgerId) return;
    setRollingBackRunOpsLedgerId(selectedRunPostDecisionOps.focusLedgerId);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/versions/${selectedRunPostDecisionOps.focusLedgerId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string; data?: { rollbackTarget?: string } };
      if (!response.ok) {
        throw new Error(json.error || "回滚失败");
      }
      setMessage(`已回滚到 ${json.data?.rollbackTarget || "目标版本"}`);
      await refreshRuns();
      await loadRunDetail(selectedRunId, { silent: true });
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setRollingBackRunOpsLedgerId(null);
    }
  }

  async function handleDiscardRun() {
    if (!selectedRunId) return;
    setPromotingRunAction("discard");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunId}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "discard",
          reason: selectedRunDetail?.recommendationReason || "",
        }),
      });
      const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { message?: string } };
      if (!response.ok || !json.success) {
        setMessage(json.error || "丢弃实验版本失败");
        return;
      }
      setMessage(json.data?.message || "已记录 discard 决策");
      await refreshRuns();
      await loadRunDetail(selectedRunId);
      startTransition(() => router.refresh());
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handleCreatePromptCandidateFromRun() {
    if (!selectedRunDetail) return;
    if (!isPromptBackedVersionType(selectedRunDetail.baseVersionType) || selectedRunDetail.baseVersionType !== selectedRunDetail.candidateVersionType) {
      setMessage("当前实验不是同类型的 Prompt/模板版本对比，无法直接生成下一版候选");
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
    const response = await fetch("/api/admin/prompts/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promptId: parsed.promptId,
        baseVersion: parsed.version,
        optimizationGoal: buildPromptOptimizationGoalFromRun(selectedRunDetail, parsed.promptId),
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; data?: { version?: string } };
    if (!response.ok || !json.success) {
      setMessage(json.error || "基于实验结果生成候选 Prompt 失败");
      return;
    }
    setMessage(`已基于 ${selectedRunDetail.runCode} 生成候选版本 ${json.data?.version || ""}，请到 Prompts 页查看。`);
  }

  async function handleCreateAiCandidateRun() {
    if (!isPromptBackedVersionType(runForm.baseVersionType)) {
      setMessage("当前只支持基于 Prompt/模板类对象自动生成候选并开跑");
      return;
    }
    setCreatingAiCandidateRun(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/writing-eval/runs/propose-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: Number(runForm.datasetId),
          baseVersionType: runForm.baseVersionType,
          baseVersionRef: runForm.baseVersionRef,
          experimentMode: runForm.experimentMode,
          triggerMode: runForm.triggerMode,
          decisionMode: runForm.decisionMode,
          summary: runForm.summary,
          optimizationGoal: [
            `为 ${getExperimentModeLabel(runForm.experimentMode)} 生成下一版候选。`,
            runForm.summary || null,
          ]
            .filter(Boolean)
            .join(" "),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: { candidate?: { promptVersionRef?: string }; run?: { id?: number; runCode?: string } };
      };
      if (!response.ok || !json.success) {
        setMessage(json.error || "自动生成候选并创建实验失败");
        return;
      }
      const nextRunId = Number(json.data?.run?.id);
      const nextRunCode = String(json.data?.run?.runCode || "").trim();
      const nextCandidateRef = String(json.data?.candidate?.promptVersionRef || "").trim();
      setMessage(`已基于 ${runForm.baseVersionRef} 生成候选 ${nextCandidateRef || ""} 并创建实验 ${nextRunCode || ""}`.trim());
      await refreshRuns();
      if (Number.isInteger(nextRunId) && nextRunId > 0) {
        setSelectedRunId(nextRunId);
        await loadRunDetail(nextRunId);
      }
      startTransition(() => router.refresh());
    } finally {
      setCreatingAiCandidateRun(false);
    }
  }

  async function handleForkPromptCandidateAndRun() {
    if (!selectedRunDetail) return;
    if (!isPromptBackedVersionType(selectedRunDetail.baseVersionType) || selectedRunDetail.baseVersionType !== selectedRunDetail.candidateVersionType) {
      setMessage("当前实验不是同类型的 Prompt/模板版本对比，无法一键 fork 候选并发起新实验");
      return;
    }
    const sourceRef =
      selectedRunDetail.recommendation === "keep" ? selectedRunDetail.candidateVersionRef : selectedRunDetail.baseVersionRef;
    const parsed = parsePromptVersionRef(sourceRef);
    if (!parsed) {
      setMessage("当前 Prompt 版本引用格式不正确，无法 fork 下一版候选");
      return;
    }
    setPromotingRunAction("continue-optimize");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunDetail.id}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "none",
          continueOptimization: true,
          experimentMode: selectedRunDetail.experimentMode,
          triggerMode: "manual",
          decisionMode: "manual_review",
          summary: [
            `fork from ${selectedRunDetail.runCode}`,
            `source:${sourceRef}`,
            selectedRunDetail.recommendationReason || "",
          ]
            .filter(Boolean)
            .join(" · "),
          optimizationGoal: buildPromptOptimizationGoalFromRun(selectedRunDetail, parsed.promptId),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          message?: string;
          candidate?: { promptVersionRef?: string };
          nextRun?: { id?: number; runCode?: string };
        };
      };
      if (!response.ok || !json.success) {
        setMessage(json.error || "一键 fork 候选并发起实验失败");
        return;
      }
      const nextRunId = Number(json.data?.nextRun?.id);
      const nextRunCode = String(json.data?.nextRun?.runCode || "").trim();
      const nextCandidateRef = String(json.data?.candidate?.promptVersionRef || "").trim();
      await refreshRuns();
      if (Number.isInteger(nextRunId) && nextRunId > 0) {
        setSelectedDatasetId(selectedRunDetail.datasetId);
        setSelectedResultId(null);
        await loadRunDetail(nextRunId);
        replaceRunsUrl(nextRunId, null, selectedRunDetail.datasetId);
      }
      setMessage(json.data?.message || `已从 ${sourceRef} fork 候选 ${nextCandidateRef || ""} 并创建实验 ${nextRunCode || ""}`.trim());
      startTransition(() => router.refresh());
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handleAdvanceRunAlongRecommendation() {
    if (!selectedRunDetail || !isPromptBackedVersionType(selectedRunDetail.baseVersionType) || selectedRunDetail.baseVersionType !== selectedRunDetail.candidateVersionType) {
      return;
    }
    const sourceRef =
      selectedRunDetail.recommendation === "keep" ? selectedRunDetail.candidateVersionRef : selectedRunDetail.baseVersionRef;
    const parsed = parsePromptVersionRef(sourceRef);
    if (!parsed) {
      setMessage("当前 Prompt 版本引用格式不正确，无法继续优化下一轮");
      return;
    }
    if (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim()) {
      setMessage("当前 run 命中风险守卫，keep 前必须填写审批理由");
      return;
    }
    setPromotingRunAction("decision-continue");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/writing-eval/runs/${selectedRunDetail.id}/decision-wizard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: selectedRunDetail.recommendation === "keep" ? "keep" : "discard",
          reason:
            selectedRunDetail.recommendation === "keep"
              ? (selectedRunRequiresRiskApproval ? promoteApprovalReason.trim() : "")
              : (selectedRunDetail.recommendationReason || ""),
          continueOptimization: true,
          experimentMode: selectedRunDetail.experimentMode,
          triggerMode: "manual",
          decisionMode: "manual_review",
          summary: [
            `${selectedRunDetail.recommendation} from ${selectedRunDetail.runCode}`,
            `source:${sourceRef}`,
            selectedRunDetail.recommendationReason || "",
          ]
            .filter(Boolean)
            .join(" · "),
          optimizationGoal: buildPromptOptimizationGoalFromRun(selectedRunDetail, parsed.promptId),
        }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        data?: {
          message?: string;
          nextRun?: { id?: number };
        };
      };
      if (!response.ok || !json.success) {
        setMessage(json.error || "按当前建议继续推进失败");
        return;
      }
      const nextRunId = Number(json.data?.nextRun?.id);
      await refreshRuns();
      if (Number.isInteger(nextRunId) && nextRunId > 0) {
        setSelectedDatasetId(selectedRunDetail.datasetId);
        setSelectedResultId(null);
        await loadRunDetail(nextRunId);
        replaceRunsUrl(nextRunId, null, selectedRunDetail.datasetId);
      } else {
        await loadRunDetail(selectedRunDetail.id);
      }
      setMessage(json.data?.message || "已按当前建议推进并创建下一轮实验");
      startTransition(() => router.refresh());
    } finally {
      setPromotingRunAction(null);
    }
  }

  async function handleCreateReverseRun() {
    if (!selectedRunDetail) return;
    setMessage("");
    try {
      const created = await createRunWithPayload({
        datasetId: selectedRunDetail.datasetId,
        baseVersionType: selectedRunDetail.candidateVersionType,
        baseVersionRef: selectedRunDetail.candidateVersionRef,
        candidateVersionType: selectedRunDetail.baseVersionType,
        candidateVersionRef: selectedRunDetail.baseVersionRef,
        experimentMode: selectedRunDetail.experimentMode,
        triggerMode: "manual",
        decisionMode: "manual_review",
        summary: [
          `reverse compare from ${selectedRunDetail.runCode}`,
          `${selectedRunDetail.candidateVersionRef} vs ${selectedRunDetail.baseVersionRef}`,
          selectedRunDetail.recommendationReason || "",
        ]
          .filter(Boolean)
          .join(" · "),
      });
      setMessage(`已基于 ${selectedRunDetail.runCode} 发起反向对照实验 ${created.runCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发起反向对照实验失败");
    }
  }

  async function handleCreateScheduleFromSelectedRun() {
    if (!selectedRunDetail) return;
    setMessage("");
    try {
      const created = await createScheduleWithPayload({
        name: `${selectedRunDetail.runCode} 自动实验`,
        datasetId: selectedRunDetail.datasetId,
        baseVersionType: selectedRunDetail.baseVersionType,
        baseVersionRef: selectedRunDetail.baseVersionRef,
        candidateVersionType: selectedRunDetail.candidateVersionType,
        candidateVersionRef: selectedRunDetail.candidateVersionRef,
        experimentMode: selectedRunDetail.experimentMode,
        triggerMode: "scheduled",
        agentStrategy: "default",
        decisionMode: selectedRunDetail.decisionMode,
        priority: 100,
        cadenceHours: 24,
        nextRunAt: null,
        isEnabled: true,
        summary: selectedRunDetail.summary || `created from ${selectedRunDetail.runCode}`,
      });
      setMessage(`已基于 ${selectedRunDetail.runCode} 创建调度规则 ${created.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建调度规则失败");
    }
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
      <section className={uiPrimitives.adminPanel + " p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Writing Eval</div>
            <h1 className="mt-4 font-serifCn text-4xl text-stone-100 text-balance">写作自动优化闭环</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-400">
              Runs 页现在专注实验编排、结果对比和线上回流；评测集与样本维护已经迁到独立的 Datasets 页，避免一个页面承担两类职责。
            </p>
          </div>
          <AdminWritingEvalNav sections={["overview", "datasets", "versions", "insights"]} className="flex gap-3" />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">实验上下文</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">当前可用评测集</h2>
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
              <Link href={focusDataset.clearHref} className={uiPrimitives.adminSecondaryButton}>
                返回默认 Runs 视图
              </Link>
            </div>
          ) : null}
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {datasets.map((dataset) => {
              const datasetHref = buildAdminWritingEvalDatasetsHref({ datasetId: dataset.id });
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
                    <div className="mt-3 text-xs text-stone-500">样本数 {dataset.sampleCount} · 更新于 {formatWritingEvalDateTime(dataset.updatedAt)}</div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">{readinessMeta.summary}</div>
                  </button>
                  <div className="mt-4">
                    <Link href={datasetHref} className={uiPrimitives.adminSecondaryButton}>
                      打开评测集
                    </Link>
                  </div>
                </article>
              );
            })}
            {datasets.length === 0 ? <div className="border border-dashed border-stone-700 bg-stone-950 px-4 py-5 text-sm text-stone-400">还没有评测集。</div> : null}
          </div>
        </div>

        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">数据集职责</div>
          <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">样本维护已迁出</h2>
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
            <div>当前样本数：{loadingCases ? "加载中…" : `${cases.length} 条`} · 启用样本 {cases.filter((item) => item.isEnabled).length}。</div>
          </div>
          <Link href={selectedDatasetHref} className={uiPrimitives.primaryButton + " mt-5 inline-flex"}>
            去 Datasets 管理评测集与样本
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">评分画像</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">评分权重实验对象</h2>
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

        <form onSubmit={handleCreateScoringProfile} className={uiPrimitives.adminPanel + " space-y-3 p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建评分画像</div>
          <input aria-label="编码，例如 viral-55-default" value={scoringProfileForm.code} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, code: event.target.value }))} placeholder="编码，例如 viral-55-default" className={uiPrimitives.adminInput} />
          <input aria-label="名称" value={scoringProfileForm.name} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="名称" className={uiPrimitives.adminInput} />
          <textarea value={scoringProfileForm.description} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="说明" className={`min-h-[90px] ${uiPrimitives.adminInput}`} />
          <label className="flex items-center gap-2 text-sm text-stone-400">
            <input aria-label="评分画像配置 JSON" type="checkbox" checked={scoringProfileForm.isActive} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
            设为 active
          </label>
          <textarea aria-label="评分画像配置 JSON" value={scoringProfileForm.config} onChange={(event) => setScoringProfileForm((prev) => ({ ...prev, config: event.target.value }))} className={`min-h-[220px] ${uiPrimitives.adminInput}`} placeholder="评分画像配置 JSON" />
          <div className="flex flex-wrap gap-3">
            <button className={uiPrimitives.primaryButton}>创建评分画像</button>
            <button type="button" onClick={() => void handleSaveScoringProfile()} className={uiPrimitives.adminSecondaryButton} disabled={!selectedScoringProfile}>
              保存当前画像
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form id="run-create-form" onSubmit={handleCreateRun} className={uiPrimitives.adminPanel + " space-y-3 p-5"}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发起实验</div>
          <select aria-label="select control"
            value={runForm.datasetId}
            onChange={(event) => {
              const nextDatasetId = Number(event.target.value);
              setRunForm((prev) => ({ ...prev, datasetId: event.target.value }));
              setSelectedDatasetId(Number.isInteger(nextDatasetId) && nextDatasetId > 0 ? nextDatasetId : null);
              replaceRunsUrl(selectedRunId, selectedResultId, Number.isInteger(nextDatasetId) && nextDatasetId > 0 ? nextDatasetId : null);
            }}
            className={uiPrimitives.adminSelect}
          >
            <option value="">选择评测集</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={String(dataset.id)}>{dataset.name}</option>
            ))}
          </select>
          {selectedRunFormDatasetReadiness ? (
            <WritingEvalDatasetGuardPanel
              title="评测集就绪度"
              meta={selectedRunFormDatasetReadinessMeta}
              readiness={selectedRunFormDatasetReadiness}
            >
              <>
                启用样本 {selectedRunFormDatasetReadiness.enabledCaseCount}/{selectedRunFormDatasetReadiness.totalCaseCount} ·
                标题目标 {selectedRunFormDatasetReadiness.coverage.titleGoal} · 开头目标 {selectedRunFormDatasetReadiness.coverage.hookGoal} ·
                传播目标 {selectedRunFormDatasetReadiness.coverage.shareTriggerGoal} · 事实素材 {selectedRunFormDatasetReadiness.coverage.sourceFacts}
                <div className="mt-2 text-xs leading-6 text-stone-500">
                题型 {selectedRunFormDatasetReadiness.qualityTargets.distinctTaskTypeCount}/4 ·
                light {selectedRunFormDatasetReadiness.qualityTargets.lightCount} ·
                medium {selectedRunFormDatasetReadiness.qualityTargets.mediumCount} ·
                hard {selectedRunFormDatasetReadiness.qualityTargets.hardCount} ·
                好稿 {selectedRunFormDatasetReadiness.qualityTargets.referenceGoodOutputCount} ·
                反例 {selectedRunFormDatasetReadiness.qualityTargets.referenceBadPatternsCount} ·
                mustUseFacts {selectedRunFormDatasetReadiness.qualityTargets.mustUseFactsCount}
                </div>
              </>
            </WritingEvalDatasetGuardPanel>
          ) : null}
          <select aria-label="select control"
            value={runForm.experimentMode}
            onChange={(event) => {
              const nextExperimentMode = event.target.value;
              const requiredPromptTargetId = getRequiredPromptTargetIdForExperimentMode(nextExperimentMode);
              const requiredVersionType = getRequiredVersionTypeForExperimentMode(nextExperimentMode);
              const nextPromptTargetId = requiredPromptTargetId ?? promptTargetId;
              const nextPromptOptions = getVersionOptionsByType(requiredVersionType ?? "prompt_version", promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, nextPromptTargetId);
              setPromptTargetId(nextPromptTargetId);
              setRunForm((prev) => ({
                ...prev,
                experimentMode: nextExperimentMode,
                baseVersionType: requiredVersionType ?? prev.baseVersionType,
                candidateVersionType: requiredVersionType ?? prev.candidateVersionType,
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
            className={uiPrimitives.adminSelect}
          >
            <option value="full_article">全文实验</option>
            <option value="title_only">只优化标题</option>
            <option value="lead_only">只优化开头</option>
          </select>
          <select aria-label="select control"
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
            className={uiPrimitives.adminSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            {promptTargets.map((target) => (
              <option key={target.promptId} value={target.promptId}>{target.label}</option>
            ))}
          </select>
          <div className="text-xs leading-6 text-stone-500">
            {runForm.experimentMode === "title_only"
              ? "标题专项实验会固定到 title_template（底层绑定 outline_planning），仅比较标题候选对点击力的影响。"
              : runForm.experimentMode === "lead_only"
                ? "开头专项实验会固定到 lead_template（底层绑定 prose_polish），仅比较首段改写对留存力的影响。"
                : hasLayoutStrategyOptions
                  ? hasApplyCommandTemplateOptions
                  ? "全文实验可比较完整写作 Prompt、fact_check、title_template、lead_template、评分画像、写作风格资产与 apply command 模板。"
                    : "全文实验可比较完整写作 Prompt、fact_check、title_template、lead_template、评分画像或写作风格资产。"
                  : hasApplyCommandTemplateOptions
                    ? "全文实验可比较完整写作 Prompt、fact_check、title_template、lead_template、评分画像与 apply command 模板；当前还没有可用写作风格资产。"
                    : "全文实验可比较完整写作 Prompt、fact_check、title_template、lead_template 与评分画像；当前还没有可用写作风格资产。"}
          </div>
          <select aria-label="select control"
            value={runForm.baseVersionType}
            onChange={(event) =>
              setRunForm((prev) => ({
                ...prev,
                baseVersionType: event.target.value,
                baseVersionRef: getVersionOptionsByType(event.target.value, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId)[0]?.value ?? "",
              }))
            }
            className={uiPrimitives.adminSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            <option value="prompt_version">prompt_version</option>
            <option value="fact_check">fact_check</option>
            <option value="title_template">title_template</option>
            <option value="lead_template">lead_template</option>
            <option value="scoring_profile">scoring_profile</option>
            <option value="layout_strategy" disabled={!hasLayoutStrategyOptions}>{getVersionTypeLabel("layout_strategy")}</option>
            <option value="apply_command_template" disabled={!hasApplyCommandTemplateOptions}>apply_command_template</option>
          </select>
          <select aria-label="select control" value={runForm.baseVersionRef} onChange={(event) => setRunForm((prev) => ({ ...prev, baseVersionRef: event.target.value }))} className={uiPrimitives.adminSelect}>
            {getVersionOptionsByType(runForm.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).length > 0 ? (
              getVersionOptionsByType(runForm.baseVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).map((option) => (
                <option key={`base-${option.value}`} value={option.value}>{option.label}</option>
              ))
            ) : (
              <option value="">暂无可用版本</option>
            )}
          </select>
          <select aria-label="select control"
            value={runForm.candidateVersionType}
            onChange={(event) =>
              setRunForm((prev) => ({
                ...prev,
                candidateVersionType: event.target.value,
                candidateVersionRef: getVersionOptionsByType(event.target.value, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId)[0]?.value ?? "",
              }))
            }
            className={uiPrimitives.adminSelect}
            disabled={runForm.experimentMode !== "full_article"}
          >
            <option value="prompt_version">prompt_version</option>
            <option value="fact_check">fact_check</option>
            <option value="title_template">title_template</option>
            <option value="lead_template">lead_template</option>
            <option value="scoring_profile">scoring_profile</option>
            <option value="layout_strategy" disabled={!hasLayoutStrategyOptions}>{getVersionTypeLabel("layout_strategy")}</option>
            <option value="apply_command_template" disabled={!hasApplyCommandTemplateOptions}>apply_command_template</option>
          </select>
          <select aria-label="select control" value={runForm.candidateVersionRef} onChange={(event) => setRunForm((prev) => ({ ...prev, candidateVersionRef: event.target.value }))} className={uiPrimitives.adminSelect}>
            {getVersionOptionsByType(runForm.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).length > 0 ? (
              getVersionOptionsByType(runForm.candidateVersionType, promptOptions, scoringProfileOptions, layoutStrategyOptions, applyCommandTemplateOptions, promptTargetId).map((option) => (
                <option key={`candidate-${option.value}`} value={option.value}>{option.label}</option>
              ))
            ) : (
              <option value="">暂无可用版本</option>
            )}
          </select>
          <button type="button" onClick={handleSwapRunVersions} className={uiPrimitives.adminSecondaryButton}>
            交换基线与候选
          </button>
          <select aria-label="select control" value={runForm.triggerMode} onChange={(event) => setRunForm((prev) => ({ ...prev, triggerMode: event.target.value }))} className={uiPrimitives.adminSelect}>
            <option value="manual">manual</option>
            <option value="scheduled">scheduled</option>
            <option value="agent">agent</option>
          </select>
          <select value={runForm.decisionMode} onChange={(event) => setRunForm((prev) => ({ ...prev, decisionMode: event.target.value }))} className={uiPrimitives.adminSelect}>
            <option value="manual_review">人工审核</option>
            <option value="auto_keep">自动 keep</option>
            <option value="auto_keep_or_discard">自动 keep/discard</option>
          </select>
          <textarea aria-label="实验摘要，可选" value={runForm.summary} onChange={(event) => setRunForm((prev) => ({ ...prev, summary: event.target.value }))} className={`min-h-[100px] ${uiPrimitives.adminInput}`} placeholder="实验摘要，可选" />
          <button className={uiPrimitives.primaryButton} disabled={!canCreateRun}>
            创建实验运行
          </button>
          <button
            type="button"
            onClick={() => void handleCreateAiCandidateRun()}
            className={uiPrimitives.adminSecondaryButton}
            disabled={!canCreateAiCandidateRun || creatingAiCandidateRun}
          >
            {creatingAiCandidateRun ? "AI 生成并开跑中…" : "AI 生成候选并开跑"}
          </button>
          {isPromptBackedVersionType(runForm.baseVersionType) ? (
            <div className="text-xs leading-6 text-stone-500">
              会基于当前基线 {runForm.baseVersionRef || "Prompt"} 自动产出下一版候选，并直接创建同类型对照实验。
            </div>
          ) : null}
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

        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">实验运行</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">当前队列与历史记录</h2>
            </div>
            <div className="text-sm text-stone-500">{displayedRuns.length}/{runs.length} 条运行记录</div>
          </div>
          {runOpsStats.actionRequired > 0 ? (
            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">异常与卡住</div>
                    <div className="mt-2 text-sm text-stone-100">failed / 心跳中断 / 排队过久</div>
                  </div>
                  <button
                    type="button"
                    className={runOpsFilter === "exceptions" ? uiPrimitives.primaryButton : uiPrimitives.adminSecondaryButton}
                    onClick={() => setRunOpsFilter("exceptions")}
                  >
                    只看异常 {runOpsStats.exceptions}
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {exceptionRuns.length > 0 ? (
                    exceptionRuns.map((run) => {
                      const issueTone = getWritingEvalRunOpsIssueTone(run);
                      return (
                        <div key={`exception-run-${run.id}`} className="border border-stone-800 bg-[#141414] px-3 py-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <button
                              type="button"
                              className="font-mono text-stone-300 transition hover:text-cinnabar"
                              onClick={() => void loadRunDetail(run.id)}
                            >
                              {run.runCode}
                            </button>
                            <div className="text-stone-500">{formatWritingEvalDateTime(run.createdAt)}</div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-3 text-stone-500">
                            <span>{run.status}</span>
                            <span>{getExperimentModeLabel(run.experimentMode)}</span>
                            <span>{run.datasetName || `#${run.datasetId}`}</span>
                          </div>
                          <div className={`mt-2 leading-6 ${issueTone}`}>{getWritingEvalRunOpsIssueSummary(run)}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={uiPrimitives.adminSecondaryButton}
                              onClick={() => void loadRunDetail(run.id)}
                            >
                              打开详情
                            </button>
                            <button
                              type="button"
                              className={uiPrimitives.adminSecondaryButton}
                              onClick={() => void handleRetryRunById(run.id)}
                              disabled={retryingRunId === run.id}
                            >
                              {retryingRunId === run.id ? "重跑中…" : "快速重跑"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs leading-6 text-stone-500">当前没有 failed、卡住或排队过久的 Run。</div>
                  )}
                </div>
              </div>

              <div className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">待人工处理</div>
                    <div className="mt-2 text-sm text-stone-100">运行成功但还没决议</div>
                  </div>
                  <button
                    type="button"
                    className={runOpsFilter === "action_required" ? uiPrimitives.primaryButton : uiPrimitives.adminSecondaryButton}
                    onClick={() => setRunOpsFilter("action_required")}
                  >
                    待处理 {runOpsStats.actionRequired}
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {pendingDecisionRuns.length > 0 ? (
                    pendingDecisionRuns.map((run) => (
                      <div key={`pending-run-${run.id}`} className="border border-stone-800 bg-[#141414] px-3 py-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            className="font-mono text-stone-300 transition hover:text-cinnabar"
                            onClick={() => void loadRunDetail(run.id)}
                          >
                            {run.runCode}
                          </button>
                          <div className="text-stone-500">{typeof run.scoreSummary.deltaTotalScore === "number" ? `${run.scoreSummary.deltaTotalScore >= 0 ? "+" : ""}${run.scoreSummary.deltaTotalScore.toFixed(2)}` : "--"}</div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-stone-500">
                          <span>{getDecisionModeLabel(run.decisionMode)}</span>
                          <span>{run.datasetName || `#${run.datasetId}`}</span>
                          <span>{formatWritingEvalDateTime(run.createdAt)}</span>
                        </div>
                        <div className="mt-2 leading-6 text-amber-200">{getWritingEvalRunOpsIssueSummary(run)}</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={uiPrimitives.adminSecondaryButton}
                            onClick={() => void loadRunDetail(run.id)}
                          >
                            打开详情
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs leading-6 text-stone-500">当前没有待人工决议的成功 Run。</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <button
              type="button"
              className={runOpsFilter === "all" ? uiPrimitives.primaryButton : uiPrimitives.adminSecondaryButton}
              onClick={() => setRunOpsFilter("all")}
            >
              全部 {runs.length}
            </button>
            <button
              type="button"
              className={runOpsFilter === "action_required" ? uiPrimitives.primaryButton : uiPrimitives.adminSecondaryButton}
              onClick={() => setRunOpsFilter("action_required")}
            >
              待处理 {runOpsStats.actionRequired}
            </button>
            <button
              type="button"
              className={runOpsFilter === "exceptions" ? uiPrimitives.primaryButton : uiPrimitives.adminSecondaryButton}
              onClick={() => setRunOpsFilter("exceptions")}
            >
              异常 {runOpsStats.exceptions}
            </button>
            {runOpsStats.pendingResolution > 0 ? <span>待人工决议 {runOpsStats.pendingResolution}</span> : null}
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
                {displayedRuns.map((run) => (
                  (() => {
                    const runOpsFlags = getWritingEvalRunOpsFlags(run);
                    const runDatasetHref = buildAdminWritingEvalDatasetsHref({ datasetId: run.datasetId });
                    const runSourceScheduleHref = run.sourceScheduleId ? buildAdminWritingEvalRunsHref({ scheduleId: run.sourceScheduleId }) : null;
                    const runBasePromptHref = isPromptBackedVersionType(run.baseVersionType)
                      ? buildPromptFocusHref(run.baseVersionRef)
                      : null;
                    const runCandidatePromptHref = isPromptBackedVersionType(run.candidateVersionType)
                      ? buildPromptFocusHref(run.candidateVersionRef)
                      : null;
                    const runCasesProcessed = getNumber(run.scoreSummary.casesProcessed);
                    const runTotalCaseCount = getNumber(run.scoreSummary.totalCaseCount);
                    const runCurrentTaskCode = getString(run.scoreSummary.currentTaskCode);
                    const runPipelineStage = getString(run.scoreSummary.pipelineStage);
                    const runPipelineStageLabel = getWritingEvalPipelineStageLabel(runPipelineStage, run.status);
                    const runStageStartedAt = getWritingEvalStageStartedAt(run.scoreSummary, run.startedAt);
                    const runStageDuration = formatWritingEvalElapsed(runStageStartedAt, isRunActive(run.status) ? undefined : run.finishedAt);
                    const runTotalDuration = formatWritingEvalElapsed(
                      getIsoDateTimeString(run.scoreSummary.runStartedAt) ?? run.startedAt,
                      run.finishedAt,
                    );
                    const runLastProgressAt = getIsoDateTimeString(run.scoreSummary.lastProgressAt);
                    const runQueueWaitDuration = getWritingEvalQueueWaitDuration(run.createdAt, run.startedAt, run.status);
                    const runQueueDelayed = runOpsFlags.queueDelayed;
                    const runHeartbeatLag = getWritingEvalHeartbeatStaleness(runLastProgressAt, run.startedAt, run.status);
                    const runHeartbeatStale = runOpsFlags.heartbeatStale;
                    const runAutoExecutionMode = getString(run.scoreSummary.autoExecutionMode);
                    const runAutoExecutionResult = getString(run.scoreSummary.autoExecutionResult);
                    const shouldShowQuickRetry = runOpsFlags.exception;
                    return (
                      <tr
                        key={run.id}
                        className={`cursor-pointer border-t border-stone-800 ${selectedRunId === run.id ? "bg-[#1d1413]" : ""}`}
                        onClick={() => {
                          void loadRunDetail(run.id);
                        }}
                      >
                        <td className="py-4 font-mono text-xs text-stone-300">
                          <div>{run.runCode}</div>
                          {runSourceScheduleHref ? (
                            <Link
                              href={runSourceScheduleHref}
                              onClick={(event) => event.stopPropagation()}
                              className="mt-1 inline-block text-[11px] text-stone-500 transition hover:text-cinnabar"
                            >
                              {`${run.sourceScheduleName || "来源调度"} · #${run.sourceScheduleId}`}
                            </Link>
                          ) : null}
                        </td>
                        <td className="py-4 text-stone-400">{getExperimentModeLabel(run.experimentMode)}</td>
                        <td className="py-4 text-stone-400">
                          <div>{getDecisionModeLabel(run.decisionMode)}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {getResolutionStatusLabel(run.resolutionStatus)}
                            {run.resolvedAt ? ` · ${formatWritingEvalDateTime(run.resolvedAt)}` : ""}
                          </div>
                          {runAutoExecutionMode || runAutoExecutionResult ? (
                            <div className={`mt-1 text-xs ${getWritingEvalAutoExecutionTone(runAutoExecutionResult)}`}>
                              自动执行：
                              {runAutoExecutionMode ? ` ${getDecisionModeLabel(runAutoExecutionMode)}` : ""}
                              {runAutoExecutionResult ? ` · ${getWritingEvalAutoExecutionResultLabel(runAutoExecutionResult)}` : ""}
                            </div>
                          ) : null}
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
                        <td className="py-4 text-stone-100">
                          <div>{run.status}</div>
                          <div className="mt-1 text-xs text-stone-500">
                            {runPipelineStageLabel}
                            {run.status === "queued"
                              ? runQueueWaitDuration
                                ? ` · 排队 ${runQueueWaitDuration}`
                                : ""
                              : isRunActive(run.status)
                                ? runStageDuration
                                  ? ` · 阶段耗时 ${runStageDuration}`
                                  : ""
                                : runTotalDuration
                                  ? ` · 总耗时 ${runTotalDuration}`
                                  : ""}
                          </div>
                          {runQueueDelayed ? (
                            <div className="mt-1 text-xs text-amber-200">排队偏久，请检查 worker 是否及时取走任务</div>
                          ) : null}
                          {runHeartbeatStale ? (
                            <div className="mt-1 text-xs text-amber-200">
                              疑似卡住，{runHeartbeatLag ? `${runHeartbeatLag} 未收到心跳` : "长时间未收到心跳"}
                            </div>
                          ) : null}
                          {shouldShowQuickRetry ? (
                            <div className="mt-2">
                              <button
                                type="button"
                                className={uiPrimitives.adminSecondaryButton}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRetryRunById(run.id);
                                }}
                                disabled={retryingRunId === run.id}
                              >
                                {retryingRunId === run.id ? "重跑中…" : "快速重跑"}
                              </button>
                            </div>
                          ) : null}
                          {runCasesProcessed !== null || runTotalCaseCount !== null || runCurrentTaskCode ? (
                            <div className="mt-1 text-xs text-stone-500">
                              {runCasesProcessed !== null || runTotalCaseCount !== null
                                ? `${runCasesProcessed ?? 0}/${runTotalCaseCount ?? "--"}`
                                : ""}
                              {runCurrentTaskCode ? `${runCasesProcessed !== null || runTotalCaseCount !== null ? " · " : ""}${runCurrentTaskCode}` : ""}
                              {runPipelineStage ? ` · ${runPipelineStage}` : ""}
                            </div>
                          ) : null}
                          {runLastProgressAt ? (
                            <div className="mt-1 text-xs text-stone-500">最近心跳 {formatWritingEvalDateTime(runLastProgressAt)}</div>
                          ) : null}
                        </td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.qualityScore === "number" ? run.scoreSummary.qualityScore.toFixed(2) : "--"}</td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.viralScore === "number" ? run.scoreSummary.viralScore.toFixed(2) : "--"}</td>
                        <td className="py-4 text-stone-400">{typeof run.scoreSummary.totalScore === "number" ? run.scoreSummary.totalScore.toFixed(2) : "--"}</td>
                        <td className={`py-4 ${typeof run.scoreSummary.deltaTotalScore === "number" && run.scoreSummary.deltaTotalScore >= 0 ? "text-emerald-400" : "text-cinnabar"}`}>
                          {typeof run.scoreSummary.deltaTotalScore === "number" ? `${run.scoreSummary.deltaTotalScore >= 0 ? "+" : ""}${run.scoreSummary.deltaTotalScore.toFixed(2)}` : "--"}
                        </td>
                        <td className="py-4 text-stone-400">{formatWritingEvalDateTime(run.createdAt)}</td>
                      </tr>
                    );
                  })()
                ))}
                {displayedRuns.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-6 text-sm text-stone-500">
                      {runOpsFilter === "all" ? "还没有实验运行记录。" : "当前筛选条件下没有 Run。"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <form id="schedule-create-form" onSubmit={handleCreateSchedule} className={uiPrimitives.adminPanel + " space-y-3 p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">自动触发</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">创建调度规则</h2>
            </div>
            <button
              type="button"
              className={uiPrimitives.adminSecondaryButton}
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
          <input aria-label="规则名称，例如 每日标题实验"
            value={scheduleForm.name}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="规则名称，例如 每日标题实验"
            className={uiPrimitives.adminInput}
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
            <WritingEvalDatasetGuardPanel
              title="调度前置守卫"
              meta={selectedRunFormDatasetReadinessMeta}
              readiness={selectedRunFormDatasetReadiness}
            >
              <>
                {scheduleForm.decisionMode === "manual_review"
                  ? "manual_review 调度允许 warning 数据集，但 blocked 数据集不会放行。"
                  : "自动决议调度仅允许 ready 数据集，避免低质量评测集直接驱动 keep/discard。"}
              </>
            </WritingEvalDatasetGuardPanel>
          ) : null}
          <select aria-label="select control"
            value={scheduleForm.triggerMode}
            onChange={(event) =>
              setScheduleForm((prev) => ({
                ...prev,
                triggerMode: event.target.value,
                agentStrategy: event.target.value === "agent" ? prev.agentStrategy || "default" : "default",
              }))
            }
            className={uiPrimitives.adminSelect}
          >
            <option value="scheduled">scheduled</option>
            <option value="agent">agent</option>
          </select>
          <select aria-label="select control"
            value={scheduleForm.decisionMode}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, decisionMode: event.target.value }))}
            className={uiPrimitives.adminSelect}
          >
            <option value="manual_review">人工审核</option>
            <option value="auto_keep">自动 keep</option>
            <option value="auto_keep_or_discard">自动 keep/discard</option>
          </select>
          {scheduleForm.triggerMode === "agent" ? (
            <div className="space-y-3">
              <select aria-label="select control"
                value={currentCreateStrategyPreset?.code ?? "__custom__"}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  if (nextValue === "__custom__") return;
                  setScheduleForm((prev) => applyAgentStrategyPresetToForm(prev, nextValue));
                }}
                className={uiPrimitives.adminSelect}
              >
                {WRITING_EVAL_AGENT_STRATEGY_PRESETS.map((preset) => (
                  <option key={preset.code} value={preset.code}>
                    {preset.label} · {preset.code} · P{preset.recommendedPriority}
                  </option>
                ))}
                <option value="__custom__">自定义策略标签</option>
              </select>
              <input aria-label="agent 策略标签，例如 default / calibration / title_lab"
                value={scheduleForm.agentStrategy}
                onChange={(event) => setScheduleForm((prev) => ({ ...prev, agentStrategy: event.target.value }))}
                placeholder="agent 策略标签，例如 default / calibration / title_lab"
                className={uiPrimitives.adminInput}
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
            <input aria-label="优先级，越大越先派发"
              value={scheduleForm.priority}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, priority: event.target.value }))}
              placeholder="优先级，越大越先派发"
              className={uiPrimitives.adminInput}
            />
            <input aria-label="间隔小时数，例如 24"
              value={scheduleForm.cadenceHours}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, cadenceHours: event.target.value }))}
              placeholder="间隔小时数，例如 24"
              className={uiPrimitives.adminInput}
            />
            <input aria-label="input control"
              type="datetime-local"
              value={scheduleForm.nextRunAt}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, nextRunAt: event.target.value }))}
              className={uiPrimitives.adminInput}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-400">
            <input aria-label="规则说明，可选" type="checkbox" checked={scheduleForm.isEnabled} onChange={(event) => setScheduleForm((prev) => ({ ...prev, isEnabled: event.target.checked }))} />
            创建后立即启用
          </label>
          <textarea aria-label="规则说明，可选"
            value={scheduleForm.summary}
            onChange={(event) => setScheduleForm((prev) => ({ ...prev, summary: event.target.value }))}
            className={`min-h-[96px] ${uiPrimitives.adminInput}`}
            placeholder="规则说明，可选"
          />
          <button className={uiPrimitives.primaryButton} disabled={savingSchedule || !canCreateSchedule}>
            {savingSchedule ? "创建中…" : "创建调度规则"}
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

        <div className={uiPrimitives.adminPanel + " p-5"}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">调度编排</div>
              <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">自动实验规则</h2>
            </div>
            <button type="button" className={uiPrimitives.adminSecondaryButton} onClick={() => void handleDispatchDueSchedules()} disabled={dispatchingDue}>
              {dispatchingDue ? "派发中…" : "派发到期规则"}
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
              <Link href={focusSchedule.clearHref} className={uiPrimitives.adminSecondaryButton}>
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
                  const skippedDatasetHref = matchedSchedule ? buildAdminWritingEvalDatasetsHref({ datasetId: matchedSchedule.datasetId }) : null;
                  return (
                    <div key={`skipped-${item.scheduleId}`} className="border border-stone-800 bg-stone-950 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm text-stone-100">{item.scheduleName}</div>
                          <div className="mt-2 text-xs leading-6 text-amber-200">{item.reason}</div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={buildAdminWritingEvalRunsHref({ scheduleId: item.scheduleId })} className={uiPrimitives.adminSecondaryButton}>
                            打开规则
                          </Link>
                          {skippedDatasetHref ? (
                            <Link href={skippedDatasetHref} className={uiPrimitives.adminSecondaryButton}>
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
              <span>启用 {displayedScheduleStats.enabledCount}</span>
              <span>可执行 {displayedScheduleStats.executableCount}</span>
              {blockedDisplayedSchedules.length > 0 ? <span className="text-cinnabar">阻断 {blockedDisplayedSchedules.length}</span> : null}
            </div>
            {blockedDisplayedSchedules.length > 0 ? (
              <div className="mt-3 space-y-2">
                {blockedDisplayedSchedules.slice(0, 3).map((schedule) => (
                  <div key={`blocked-summary-${schedule.id}`} className="text-xs leading-6 text-stone-400">
                    <Link href={buildAdminWritingEvalRunsHref({ scheduleId: schedule.id })} className="transition hover:text-cinnabar">
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
              <div
                key={schedule.id}
                id={`schedule-card-${schedule.id}`}
                className={`border bg-stone-950 px-4 py-4 ${focusSchedule?.scheduleId === schedule.id ? "border-cinnabar bg-[#1d1413]" : "border-stone-800"}`}
              >
                {(() => {
                  const isEditing = editingScheduleId === schedule.id;
                  const scheduleDatasetHref = buildAdminWritingEvalDatasetsHref({ datasetId: schedule.datasetId });
                  const scheduleReadinessMeta = getDatasetReadinessMeta(schedule.readiness);
                  const scheduleDispatchBlocked =
                    schedule.readiness.status === "blocked"
                    || (schedule.decisionMode !== "manual_review" && schedule.readiness.status !== "ready");
                  const scheduleBasePromptHref = isPromptBackedVersionType(schedule.baseVersionType)
                    ? buildPromptFocusHref(schedule.baseVersionRef)
                    : null;
                  const scheduleCandidatePromptHref = isPromptBackedVersionType(schedule.candidateVersionType)
                    ? buildPromptFocusHref(schedule.candidateVersionRef)
                    : null;
                  const scheduleLastRunHref = schedule.lastRunId ? buildAdminWritingEvalRunsHref({ runId: schedule.lastRunId }) : null;
                  const scheduleLastRunPipelineStage = getString(schedule.lastRunScoreSummary.pipelineStage);
                  const scheduleLastRunPipelineLabel = getWritingEvalPipelineStageLabel(scheduleLastRunPipelineStage, schedule.lastRunStatus || "");
                  const scheduleLastRunCasesProcessed = getNumber(schedule.lastRunScoreSummary.casesProcessed);
                  const scheduleLastRunTotalCaseCount = getNumber(schedule.lastRunScoreSummary.totalCaseCount);
                  const scheduleLastRunCurrentTaskCode = getString(schedule.lastRunScoreSummary.currentTaskCode);
                  const scheduleLastRunLastProgressAt = getIsoDateTimeString(schedule.lastRunScoreSummary.lastProgressAt);
                  const scheduleLastRunStageStartedAt = getWritingEvalStageStartedAt(schedule.lastRunScoreSummary, schedule.lastRunStartedAt);
                  const scheduleLastRunDuration = formatWritingEvalElapsed(
                    scheduleLastRunStageStartedAt,
                    schedule.lastRunStatus && isRunActive(schedule.lastRunStatus) ? undefined : schedule.lastRunFinishedAt,
                  );
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
                      <input aria-label="input control"
                        type="checkbox"
                        checked={schedule.isEnabled}
                        onChange={(event) => void handleToggleSchedule(schedule.id, event.target.checked)}
                        disabled={savingScheduleId === schedule.id}
                      />
                      <span className="ml-2">{schedule.isEnabled ? "启用" : "停用"}</span>
                    </label>
                    <button
                      type="button"
                      className={uiPrimitives.adminSecondaryButton}
                      onClick={() => (isEditing ? handleCancelEditSchedule() : handleStartEditSchedule(schedule))}
                      disabled={savingScheduleId === schedule.id}
                    >
                      {isEditing ? "取消编辑" : "编辑"}
                    </button>
                    <button
                      type="button"
                      className={uiPrimitives.adminSecondaryButton}
                      onClick={() => void handleDispatchSchedule(schedule.id)}
                      disabled={dispatchingScheduleId === schedule.id || savingScheduleId === schedule.id || scheduleDispatchBlocked}
                    >
                      {dispatchingScheduleId === schedule.id ? "派发中…" : scheduleDispatchBlocked ? "守卫阻断" : "立即派发"}
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
                  下次执行：{schedule.nextRunAt ? formatWritingEvalDateTime(schedule.nextRunAt) : "未设置"}
                  <br />
                  最近派发：{schedule.lastDispatchedAt ? formatWritingEvalDateTime(schedule.lastDispatchedAt) : "暂无"}
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
                {schedule.lastRunId ? (
                  <div className="mt-3 border border-stone-800 bg-[#141414] px-3 py-3 text-xs text-stone-400">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-stone-300">最近 Run 进度</span>
                      <span>{scheduleLastRunPipelineLabel}</span>
                      {scheduleLastRunDuration ? <span>耗时 {scheduleLastRunDuration}</span> : null}
                      {scheduleLastRunCasesProcessed !== null || scheduleLastRunTotalCaseCount !== null ? (
                        <span>
                          {scheduleLastRunCasesProcessed ?? 0}/{scheduleLastRunTotalCaseCount ?? "--"}
                        </span>
                      ) : null}
                      {scheduleLastRunCurrentTaskCode ? <span>当前样本 {scheduleLastRunCurrentTaskCode}</span> : null}
                      {scheduleLastRunLastProgressAt ? <span>最近心跳 {formatWritingEvalDateTime(scheduleLastRunLastProgressAt)}</span> : null}
                    </div>
                  </div>
                ) : null}
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
                      <button type="button" className={uiPrimitives.adminSecondaryButton} onClick={handleApplyCurrentRunToEditingSchedule}>
                        用当前实验覆盖定义
                      </button>
                    </div>
                    <input aria-label="规则名称"
                      value={scheduleEditorForm.name}
                      onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, name: event.target.value }))}
                      className={uiPrimitives.adminInput}
                      placeholder="规则名称"
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <select aria-label="select control"
                        value={scheduleEditorForm.triggerMode}
                        onChange={(event) =>
                          setScheduleEditorForm((prev) => ({
                            ...prev,
                            triggerMode: event.target.value,
                            agentStrategy: event.target.value === "agent" ? prev.agentStrategy || "default" : "default",
                          }))
                        }
                        className={uiPrimitives.adminSelect}
                      >
                        <option value="scheduled">scheduled</option>
                        <option value="agent">agent</option>
                      </select>
                      <select aria-label="select control"
                        value={scheduleEditorForm.decisionMode}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, decisionMode: event.target.value }))}
                        className={uiPrimitives.adminSelect}
                      >
                        <option value="manual_review">人工审核</option>
                        <option value="auto_keep">自动 keep</option>
                        <option value="auto_keep_or_discard">自动 keep/discard</option>
                      </select>
                      {scheduleEditorForm.triggerMode === "agent" ? (
                        <div className="space-y-3">
                          <select aria-label="select control"
                            value={currentEditorStrategyPreset?.code ?? "__custom__"}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === "__custom__") return;
                              setScheduleEditorForm((prev) => applyAgentStrategyPresetToForm(prev, nextValue));
                            }}
                            className={uiPrimitives.adminSelect}
                          >
                            {WRITING_EVAL_AGENT_STRATEGY_PRESETS.map((preset) => (
                              <option key={preset.code} value={preset.code}>
                                {preset.label} · {preset.code} · P{preset.recommendedPriority}
                              </option>
                            ))}
                            <option value="__custom__">自定义策略标签</option>
                          </select>
                          <input aria-label="agent 策略标签"
                            value={scheduleEditorForm.agentStrategy}
                            onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, agentStrategy: event.target.value }))}
                            className={uiPrimitives.adminInput}
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
                      <input aria-label="优先级，越大越先派发"
                        value={scheduleEditorForm.priority}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, priority: event.target.value }))}
                        className={uiPrimitives.adminInput}
                        placeholder="优先级，越大越先派发"
                      />
                      <input aria-label="间隔小时数"
                        value={scheduleEditorForm.cadenceHours}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, cadenceHours: event.target.value }))}
                        className={uiPrimitives.adminInput}
                        placeholder="间隔小时数"
                      />
                      <input aria-label="input control"
                        type="datetime-local"
                        value={scheduleEditorForm.nextRunAt}
                        onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, nextRunAt: event.target.value }))}
                        className={uiPrimitives.adminInput}
                      />
                      <label className="flex items-center gap-2 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-400">
                        <input aria-label="input control"
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
                    <textarea aria-label="规则说明，可选"
                      value={scheduleEditorForm.summary}
                      onChange={(event) => setScheduleEditorForm((prev) => ({ ...prev, summary: event.target.value }))}
                      className={`min-h-[96px] ${uiPrimitives.adminInput}`}
                      placeholder="规则说明，可选"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className={uiPrimitives.primaryButton}
                        onClick={() => void handleSaveSchedule(schedule.id)}
                        disabled={savingScheduleId === schedule.id}
                      >
                        {savingScheduleId === schedule.id ? "保存中…" : "保存规则"}
                      </button>
                      <button type="button" className={uiPrimitives.adminSecondaryButton} onClick={handleCancelEditSchedule} disabled={savingScheduleId === schedule.id}>
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

      <section className={uiPrimitives.adminPanel + " p-5"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">运行详情</div>
            <h2 className="mt-3 font-serifCn text-2xl text-stone-100 text-balance">
              {selectedRunDetail ? `Run ${selectedRunDetail.runCode}` : "选择一条实验运行"}
            </h2>
          </div>
          <div className="text-sm text-stone-500">
            {loadingRunDetail ? "加载详情中…" : selectedRunDetail ? `${selectedRunDetail.results.length} 条样本结果` : "暂无详情"}
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
                        <div className="mt-1 text-xl text-stone-100">{formatWritingEvalMetric(item.candidateAverage, "", 2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-stone-600">基线</div>
                        <div className="mt-1 text-lg text-stone-400">{formatWritingEvalMetric(item.baselineAverage, "", 2)}</div>
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
                  const trendCaseHref = buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: item.caseId });
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
                        <Link href={trendCaseHref} className={uiPrimitives.adminSecondaryButton}>
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
                      const improvedCaseHref = buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: result.caseId });
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
                            <Link href={improvedCaseHref} className={uiPrimitives.adminSecondaryButton}>
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
                      const regressedCaseHref = buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: result.caseId });
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
                            <Link href={regressedCaseHref} className={uiPrimitives.adminSecondaryButton}>
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
                      const failedCaseHref = buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: result.caseId });
                      return (
                        <article key={`failed-${result.id}`} className="border border-stone-800 bg-[#141414] px-4 py-3">
                          <button type="button" onClick={() => focusRunResult(result.id)} className="w-full text-left">
                            <div className="text-sm text-stone-100">{result.topicTitle || result.taskCode || `case-${result.caseId}`}</div>
                            <div className="mt-2 text-xs leading-6 text-stone-500">{caseError}</div>
                          </button>
                          <div className="mt-3">
                            <Link href={failedCaseHref} className={uiPrimitives.adminSecondaryButton}>
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
                  {selectedRunSourceScheduleHref && selectedRunSourceScheduleId ? (
                    <Link href={selectedRunSourceScheduleHref} className="ml-1 transition hover:text-cinnabar">
                      {`${selectedRunSourceScheduleName || "来源调度"} · #${selectedRunSourceScheduleId}`}
                    </Link>
                  ) : (
                    <span className="ml-1">当前未关联</span>
                  )}
                  <br />
                  状态：{selectedRunDetail.status}
                  <br />
                  决议状态：{getResolutionStatusLabel(selectedRunDetail.resolutionStatus)}
                  {selectedRunDetail.resolvedAt ? ` · ${formatWritingEvalDateTime(selectedRunDetail.resolvedAt)}` : ""}
                  {selectedRunShowAutoExecution ? (
                    <>
                      <br />
                      自动执行：
                      {selectedRunAutoExecutionMode ? ` ${getDecisionModeLabel(selectedRunAutoExecutionMode)}` : ""}
                      {selectedRunAutoExecutionResult ? ` · ${getWritingEvalAutoExecutionResultLabel(selectedRunAutoExecutionResult)}` : ""}
                      {selectedRunAutoExecutionCompletedAt ? ` · ${formatWritingEvalDateTime(selectedRunAutoExecutionCompletedAt)}` : ""}
                    </>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedRunBaseLedgerHref ? (
                    <Link href={selectedRunBaseLedgerHref} className={uiPrimitives.adminSecondaryButton}>
                      查看基线账本
                    </Link>
                  ) : null}
                  {selectedRunCandidateLedgerHref ? (
                    <Link href={selectedRunCandidateLedgerHref} className={uiPrimitives.adminSecondaryButton}>
                      查看候选账本
                    </Link>
                  ) : null}
                  {selectedRunBasePromptHref ? (
                    <Link href={selectedRunBasePromptHref} className={uiPrimitives.adminSecondaryButton}>
                      打开基线 Prompt
                    </Link>
                  ) : null}
                  {selectedRunCandidatePromptHref ? (
                    <Link href={selectedRunCandidatePromptHref} className={uiPrimitives.adminSecondaryButton}>
                      打开候选 Prompt
                    </Link>
                  ) : null}
                  {selectedRunSourceScheduleHref ? (
                    <Link href={selectedRunSourceScheduleHref} className={uiPrimitives.adminSecondaryButton}>
                      查看来源调度
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">实验摘要与建议</div>
                <div className="mt-3 leading-7">
                  {selectedRunDetail.summary || "暂无摘要"}
                  {(getNumber(selectedRunDetail.scoreSummary.casesProcessed) !== null ||
                    getNumber(selectedRunDetail.scoreSummary.totalCaseCount) !== null ||
                    getString(selectedRunDetail.scoreSummary.currentTaskCode) ||
                    selectedRunTimelineEntries.length > 0) ? (
                    <div className="mt-3 border border-stone-800 bg-[#141414] px-3 py-3 text-xs text-stone-400">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-stone-300">执行进度</span>
                        <span>{selectedRunPipelineStageLabel}</span>
                        {selectedRunQueueWaitDuration ? <span>排队 {selectedRunQueueWaitDuration}</span> : null}
                        {selectedRunStageDuration ? <span>阶段耗时 {selectedRunStageDuration}</span> : null}
                        {selectedRunTotalDuration ? <span>总耗时 {selectedRunTotalDuration}</span> : null}
                        <span>
                          {(getNumber(selectedRunDetail.scoreSummary.casesProcessed) ?? 0)}/
                          {getNumber(selectedRunDetail.scoreSummary.totalCaseCount) ?? "--"}
                        </span>
                        {getString(selectedRunDetail.scoreSummary.currentTaskCode) ? (
                          <span>当前样本 {getString(selectedRunDetail.scoreSummary.currentTaskCode)}</span>
                        ) : null}
                        {getString(selectedRunDetail.scoreSummary.pipelineStage) ? (
                          <span>{getString(selectedRunDetail.scoreSummary.pipelineStage)}</span>
                        ) : null}
                        {selectedRunLastProgressAt ? (
                          <span>最近心跳 {formatWritingEvalDateTime(selectedRunLastProgressAt)}</span>
                        ) : null}
                      </div>
                      {selectedRunQueueDelayed ? (
                        <div className="mt-3 text-amber-200">排队时间已偏久，建议检查 worker 队列消费是否阻塞。</div>
                      ) : null}
                      {selectedRunHeartbeatStale ? (
                        <div className="mt-3 text-amber-200">
                          当前 Run 疑似卡住，{selectedRunHeartbeatLag ? `${selectedRunHeartbeatLag} 未收到新心跳。` : "长时间未收到新心跳。"}
                        </div>
                      ) : null}
                      {selectedRunPhaseDurations.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedRunPhaseDurations.map((item) => (
                            <span key={item.label} className="border border-stone-700 px-2 py-1 text-[11px] text-stone-300">
                              {item.label} {item.value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {selectedRunTimelineEntries.length > 0 ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {selectedRunTimelineEntries.map((item) => (
                            <div key={`${item.key}-${item.at}`} className="border border-stone-800 bg-stone-950 px-2 py-2">
                              <div className="text-[11px] uppercase tracking-[0.12em] text-stone-500">{item.label}</div>
                              <div className="mt-1 text-stone-300">{formatWritingEvalDateTime(item.at)}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {selectedRunJobHistory.length > 0 || selectedRunRetryHistory.length > 0 ? (
                        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                          <div className="border border-stone-800 bg-stone-950 px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500">阶段作业台账</div>
                                <div className="mt-1 text-stone-300">
                                  已完成 {selectedRunJobHistorySummary.completed} · 失败 {selectedRunJobHistorySummary.failed} ·
                                  执行中 {selectedRunJobHistorySummary.running} · 排队中 {selectedRunJobHistorySummary.queued}
                                </div>
                              </div>
                              <div className="text-[11px] text-stone-500">共 {selectedRunJobHistory.length} 条 stage job</div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {selectedRunJobHistory.map((item) => (
                                <div key={`job-history-${item.id}`} className="border border-stone-800 bg-[#141414] px-3 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <div className="font-mono text-xs text-stone-300">
                                        {item.stageLabel} · 第 {item.attemptIndex} 次
                                      </div>
                                      <div className="mt-1 text-[11px] text-stone-500">
                                        job #{item.id} · {item.jobType}
                                        {item.runCode ? ` · ${item.runCode}` : ""}
                                      </div>
                                    </div>
                                    <div className={`border px-2 py-1 text-[11px] ${getWritingEvalStageJobStatusTone(item.status)}`}>
                                      {getWritingEvalStageJobStatusLabel(item.status)}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-stone-500">
                                    <span>入队 {formatWritingEvalDateTime(item.queuedAt)}</span>
                                    {item.startedAt ? <span>开始 {formatWritingEvalDateTime(item.startedAt)}</span> : null}
                                    {item.finishedAt ? <span>结束 {formatWritingEvalDateTime(item.finishedAt)}</span> : null}
                                    {item.runAt ? <span>计划 {formatWritingEvalDateTime(item.runAt)}</span> : null}
                                    {item.startedAt ? (
                                      <span>耗时 {formatWritingEvalElapsed(item.startedAt, item.finishedAt ?? item.updatedAt)}</span>
                                    ) : null}
                                    {item.retryCount > 0 ? <span>内部失败计数 {item.retryCount}</span> : null}
                                  </div>
                                  {item.lastError ? <div className="mt-2 text-[11px] leading-6 text-cinnabar">{item.lastError}</div> : null}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="border border-stone-800 bg-stone-950 px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500">重试轨迹</div>
                                <div className="mt-1 text-stone-300">{selectedRunRetryHistory.length} 次人工重试</div>
                              </div>
                              <div className="text-[11px] text-stone-500">retry audit</div>
                            </div>
                            <div className="mt-3 space-y-2">
                              {selectedRunRetryHistory.length > 0 ? (
                                selectedRunRetryHistory.map((item, index) => (
                                  <div key={`retry-history-${item.id}`} className="border border-stone-800 bg-[#141414] px-3 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="font-mono text-xs text-stone-300">第 {index + 1} 次重试</div>
                                      <div className="text-[11px] text-stone-500">
                                        {item.username ? item.username : "system"} · {formatWritingEvalDateTime(item.retriedAt ?? item.createdAt)}
                                      </div>
                                    </div>
                                    <div className="mt-2 text-[11px] leading-6 text-stone-500">
                                      写入审计 {formatWritingEvalDateTime(item.createdAt)}
                                      {item.runCode ? ` · ${item.runCode}` : ""}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-[11px] leading-6 text-stone-500">
                                  当前 Run 还没有人工重试记录；如果后续执行失败并触发 retry，这里会保留完整轨迹。
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {selectedRunCaseLedger ? (
                        <div className="mt-4 border border-stone-800 bg-stone-950 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500">Case Fan-Out 台账</div>
                              <div className="mt-1 text-stone-300">
                                已完成 {selectedRunCaseLedger.counts.succeeded} · 失败 {selectedRunCaseLedger.counts.failed} ·
                                执行中 {selectedRunCaseLedger.counts.running} · 排队中 {selectedRunCaseLedger.counts.queued}
                                {selectedRunCaseLedger.counts.disabled > 0 ? ` · 禁用 ${selectedRunCaseLedger.counts.disabled}` : ""}
                              </div>
                            </div>
                            <div className="text-[11px] text-stone-500">共 {selectedRunCaseLedger.items.length} 个 case</div>
                          </div>
                          <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                            {selectedRunCaseLedger.items.map((item) => (
                              <div key={`case-ledger-${item.caseId}`} className="border border-stone-800 bg-[#141414] px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-mono text-xs text-stone-300">{item.taskCode}</div>
                                    <div className="mt-1 text-sm text-stone-100">{item.topicTitle}</div>
                                  </div>
                                  <div className={`border px-2 py-1 text-[11px] ${item.statusTone}`}>{item.statusLabel}</div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-stone-500">
                                  <span>{item.difficultyLevel}</span>
                                  {item.totalScore !== null ? <span>总分 {item.totalScore.toFixed(2)}</span> : null}
                                  <span>case #{item.caseId}</span>
                                </div>
                                {item.caseError ? <div className="mt-2 text-[11px] leading-6 text-cinnabar">{item.caseError}</div> : null}
                                {item.resultId ? (
                                  <div className="mt-3">
                                    <button
                                      type="button"
                                      className={uiPrimitives.adminSecondaryButton}
                                      onClick={() => focusRunResult(item.resultId!)}
                                    >
                                      查看结果对比
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className={`mt-3 ${selectedRunDetail.recommendation === "keep" ? "text-emerald-400" : "text-cinnabar"}`}>
                    建议：{selectedRunDetail.recommendation}
                  </div>
                  <div className="mt-2 text-stone-400">{selectedRunDetail.recommendationReason}</div>
                  {selectedRunRequiresRiskApproval && selectedRunDetail.resolutionStatus === "pending" ? (
                    <div className="mt-3 border border-cinnabar/40 bg-[#241515] px-3 py-3 text-xs text-stone-300">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-cinnabar">风险例外审批</div>
                      <div className="mt-2 leading-6">
                        当前系统建议 `discard`。如果仍要 keep，必须填写审批理由，理由会写入版本账本与审计日志。
                      </div>
                      <textarea
                        aria-label="填写风险例外审批理由"
                        value={promoteApprovalReason}
                        onChange={(event) => setPromoteApprovalReason(event.target.value)}
                        placeholder="说明为什么仍要 keep，例如已人工复核事实风险、已限定观察窗口、已确认只做低比例灰度。"
                        className={`mt-3 min-h-[96px] ${uiPrimitives.adminInput}`}
                      />
                    </div>
                  ) : null}
                  {selectedRunShowAutoExecution ? (
                    <div className="mt-3 border border-stone-800 bg-stone-950 px-3 py-3 text-xs text-stone-400">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-stone-500">自动决议执行</div>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {selectedRunAutoExecutionMode ? <span>模式 {getDecisionModeLabel(selectedRunAutoExecutionMode)}</span> : null}
                        {selectedRunAutoDecision ? <span>系统建议 {selectedRunAutoDecision}</span> : null}
                        {selectedRunAutoExecutionTargetDecision ? <span>执行目标 {selectedRunAutoExecutionTargetDecision}</span> : null}
                        {selectedRunAutoExecutionResult ? (
                          <span className={getWritingEvalAutoExecutionTone(selectedRunAutoExecutionResult)}>
                            结果 {getWritingEvalAutoExecutionResultLabel(selectedRunAutoExecutionResult)}
                          </span>
                        ) : null}
                        {selectedRunAutoExecutionCompletedAt ? (
                          <span>完成于 {formatWritingEvalDateTime(selectedRunAutoExecutionCompletedAt)}</span>
                        ) : null}
                      </div>
                      {selectedRunAutoDecisionReason ? <div className="mt-2 text-stone-500">{selectedRunAutoDecisionReason}</div> : null}
                      {selectedRunAutoExecutionError ? <div className="mt-2 text-cinnabar">错误：{selectedRunAutoExecutionError}</div> : null}
                    </div>
                  ) : null}
                  {selectedRunDetail.errorMessage ? <div className="mt-2 text-cinnabar">错误：{selectedRunDetail.errorMessage}</div> : null}
                </div>
              </div>
            </div>

            {selectedRunPostDecisionOps ? (
              <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">决议后续动作</div>
                    <div className="mt-3 text-base text-stone-100">
                      {selectedRunPostDecisionOps.focusSource === "candidate" ? "当前应推进候选版本" : "当前应保持基线版本"}
                    </div>
                    <div className="mt-2 leading-7">
                      {selectedRunPostDecisionOps.focusVersionType} · {selectedRunPostDecisionOps.focusVersionRef}
                      {selectedRunPostDecisionOps.focusLedgerDecision
                        ? ` · 账本 ${selectedRunPostDecisionOps.focusLedgerDecision}`
                        : " · 暂无账本决议"}
                      {selectedRunPostDecisionOps.focusLedgerCreatedAt
                        ? ` · ${formatWritingEvalDateTime(selectedRunPostDecisionOps.focusLedgerCreatedAt)}`
                        : ""}
                      {selectedRunPostDecisionOps.isFocusActive === true ? " · 当前 active" : ""}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">
                      {selectedRunDetail.resolutionStatus === "pending"
                        ? selectedRunPostDecisionOps.focusSource === "candidate"
                          ? "系统建议先 keep 候选，再进入放量观察或回滚监控。"
                          : "当前更适合保持基线，把候选退回继续优化链路。"
                        : selectedRunPostDecisionOps.focusSource === "candidate"
                          ? "这条版本已经进入后续运营对象，可直接继续灰度、观察真实回流，必要时回滚。"
                          : "这条运行当前以基线为准，后续重点是继续迭代候选，而不是直接扩量。"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRunOpsVersionsHref ? (
                      <Link href={selectedRunOpsVersionsHref} className={uiPrimitives.primaryButton}>
                        打开账本与放量面板
                      </Link>
                    ) : null}
                    {selectedRunOpsPromptHref ? (
                      <Link href={selectedRunOpsPromptHref} className={uiPrimitives.adminSecondaryButton}>
                        打开对应 Prompt
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">灰度状态</div>
                    <div className="mt-3 text-stone-100">
                      {selectedRunPostDecisionOps.rolloutConfig
                        ? selectedRunPostDecisionOps.rolloutConfig.isEnabled
                          ? selectedRunPostDecisionOps.rolloutConfig.rolloutObserveOnly
                            ? "仅观察流量"
                            : `${Math.round(selectedRunPostDecisionOps.rolloutConfig.rolloutPercentage)}% 灰度`
                          : "未启用灰度"
                        : selectedRunPostDecisionOps.rolloutKind === "unsupported"
                          ? "当前对象无灰度配置"
                          : "暂无灰度配置"}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">
                      {selectedRunPostDecisionOps.rolloutConfig?.rolloutPlanCodes.length
                        ? `plan=${selectedRunPostDecisionOps.rolloutConfig.rolloutPlanCodes.join(", ")}`
                        : selectedRunPostDecisionOps.rolloutConfig
                          ? `auto=${selectedRunPostDecisionOps.rolloutConfig.autoMode}`
                          : "可直接在当前面板配置观察优先、比例和白名单。"}
                    </div>
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">灰度命中</div>
                    <div className="mt-3 text-stone-100">
                      {selectedRunPostDecisionOps.rolloutStats
                        ? `${selectedRunPostDecisionOps.rolloutStats.totalHitCount} 次 / ${selectedRunPostDecisionOps.rolloutStats.uniqueUserCount} 人`
                        : "暂无"}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">
                      {selectedRunPostDecisionOps.rolloutStats?.lastHitAt
                        ? `最近命中 ${formatWritingEvalDateTime(selectedRunPostDecisionOps.rolloutStats.lastHitAt)}`
                        : "尚未记录灰度命中"}
                    </div>
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">真实回流</div>
                    <div className="mt-3 text-stone-100">
                      {selectedRunPostDecisionOps.feedbackSummary.feedbackCount} 条
                    </div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">
                      爆款 {formatWritingEvalMetric(selectedRunPostDecisionOps.feedbackSummary.averageObservedViralScore, "", 2)} ·
                      打开 {formatWritingEvalMetric(selectedRunPostDecisionOps.feedbackSummary.averageOpenRate, "%", 1)}
                      {" · "}
                      读完 {formatWritingEvalMetric(selectedRunPostDecisionOps.feedbackSummary.averageReadCompletionRate, "%", 1)}
                    </div>
                  </div>
                  <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">回滚能力</div>
                    <div className="mt-3 text-stone-100">
                      {selectedRunPostDecisionOps.canRollbackFocusLedger ? "可从当前账本回滚" : "当前没有可直接回滚的 keep 账本"}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-stone-500">
                      {selectedRunPostDecisionOps.canRollbackFocusLedger
                        ? "可直接在当前页执行 rollback，并继续观察回滚后的线上表现。"
                        : "若要回滚，请先确认当前运营对象是否已经形成 keep 账本。"}
                    </div>
                  </div>
                </div>
                {canInlineRunRollout || canRollbackSelectedRunOpsLedger ? (
                  <div className="mt-4 border border-stone-800 bg-[#141414] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-stone-500">内联放量与回滚</div>
                        <div className="mt-2 text-xs leading-6 text-stone-500">
                          当前页可以直接修改自动模式、观察优先、比例、套餐白名单和资产备注，并查看最近 rollout 审计。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canInlineRunRollout ? (
                          <button
                            type="button"
                            className={uiPrimitives.primaryButton}
                            onClick={() => void handleSaveSelectedRunRolloutForm()}
                            disabled={savingRunOpsAction !== null}
                          >
                            {savingRunOpsAction === "save-form" ? "保存中…" : "保存内联放量配置"}
                          </button>
                        ) : null}
                        {canRollbackSelectedRunOpsLedger ? (
                          <button
                            type="button"
                            className={uiPrimitives.adminSecondaryButton}
                            onClick={() => void handleRollbackSelectedRunOpsLedger()}
                            disabled={rollingBackRunOpsLedgerId !== null}
                          >
                            {rollingBackRunOpsLedgerId === selectedRunPostDecisionOps?.focusLedgerId ? "回滚中…" : "回滚当前账本"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {canInlineRunRollout ? (
                      <>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <label className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">启用灰度</div>
                            <input
                              type="checkbox"
                              className="mt-3 h-4 w-4"
                              checked={runOpsRolloutForm.isEnabled}
                              onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                            />
                          </label>
                          <label className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">仅观察流量</div>
                            <input
                              type="checkbox"
                              className="mt-3 h-4 w-4"
                              checked={runOpsRolloutForm.rolloutObserveOnly}
                              onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, rolloutObserveOnly: event.target.checked }))}
                            />
                          </label>
                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">自动模式</div>
                            <select
                              aria-label="select control"
                              value={runOpsRolloutForm.autoMode}
                              onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, autoMode: event.target.value }))}
                              className={`mt-3 ${uiPrimitives.adminInput}`}
                            >
                              <option value="manual">manual</option>
                              <option value="recommendation">recommendation</option>
                            </select>
                          </div>
                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">命中比例</div>
                            <input
                              aria-label="0-100"
                              value={runOpsRolloutForm.rolloutPercentage}
                              onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, rolloutPercentage: event.target.value }))}
                              placeholder="0-100"
                              className={`mt-3 ${uiPrimitives.adminInput}`}
                            />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 xl:grid-cols-2">
                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">套餐白名单</div>
                            <input
                              aria-label="pro, ultra"
                              value={runOpsRolloutForm.rolloutPlanCodes}
                              onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, rolloutPlanCodes: event.target.value }))}
                              placeholder="pro, ultra"
                              className={`mt-3 ${uiPrimitives.adminInput}`}
                            />
                            <div className="mt-2 text-[11px] leading-6 text-stone-600">多个套餐用逗号分隔；为空时只看观察优先和比例。</div>
                          </div>
                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs text-stone-400">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">
                              {selectedRunPostDecisionOps?.rolloutKind === "asset" ? "资产备注" : "治理说明"}
                            </div>
                            {selectedRunPostDecisionOps?.rolloutKind === "asset" ? (
                              <textarea
                                aria-label="记录灰度目标、风险点或预计观察窗口"
                                value={runOpsRolloutForm.notes}
                                onChange={(event) => setRunOpsRolloutForm((prev) => ({ ...prev, notes: event.target.value }))}
                                placeholder="记录灰度目标、风险点或预计观察窗口"
                                className={`mt-3 min-h-[110px] ${uiPrimitives.adminInput}`}
                              />
                            ) : (
                              <div className="mt-3 text-sm leading-7 text-stone-400">
                                Prompt 版本会保存自动模式、观察优先、比例和套餐白名单；具体治理原因以审计日志为主。
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={uiPrimitives.adminSecondaryButton}
                            onClick={() => void handleSaveSelectedRunRolloutQuickAction({
                              actionKey: "observe",
                              isEnabled: true,
                              rolloutObserveOnly: true,
                              rolloutPercentage: 0,
                            })}
                            disabled={savingRunOpsAction !== null}
                          >
                            {savingRunOpsAction === "observe" ? "保存中…" : "设为观察优先"}
                          </button>
                          <button
                            type="button"
                            className={uiPrimitives.adminSecondaryButton}
                            onClick={() => void handleSaveSelectedRunRolloutQuickAction({
                              actionKey: "trial-5",
                              isEnabled: true,
                              rolloutObserveOnly: false,
                              rolloutPercentage: 5,
                            })}
                            disabled={savingRunOpsAction !== null}
                          >
                            {savingRunOpsAction === "trial-5" ? "保存中…" : "5% 试水"}
                          </button>
                          <button
                            type="button"
                            className={uiPrimitives.adminSecondaryButton}
                            onClick={() => void handleSaveSelectedRunRolloutQuickAction({
                              actionKey: "pause",
                              isEnabled: false,
                              rolloutObserveOnly: true,
                              rolloutPercentage: 0,
                            })}
                            disabled={savingRunOpsAction !== null}
                          >
                            {savingRunOpsAction === "pause" ? "保存中…" : "暂停灰度"}
                          </button>
                        </div>
                      </>
                    ) : null}
                    <div className="mt-4 border border-stone-800 bg-stone-950 px-4 py-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">最近治理审计</div>
                      {selectedRunPostDecisionOps?.rolloutAuditLogs.length ? (
                        <div className="mt-3 space-y-2">
                          {selectedRunPostDecisionOps.rolloutAuditLogs.map((item) => (
                            <div key={`run-rollout-audit-${item.id}`} className="border border-stone-800 bg-[#141414] px-3 py-3 text-xs text-stone-400">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-stone-300">{formatWritingEvalDateTime(item.createdAt)}</span>
                                <span className={item.riskLevel === "cinnabar" ? "text-cinnabar" : item.riskLevel === "emerald" ? "text-emerald-400" : "text-stone-500"}>
                                  {item.riskLevel}
                                </span>
                              </div>
                              <div className="mt-2 text-stone-500">
                                动作 {item.action}
                                {item.username ? ` · 操作人 ${item.username}` : ""}
                              </div>
                              {item.reason ? <div className="mt-2 leading-6 text-stone-300">{item.reason}</div> : null}
                              {item.changes.length ? <div className="mt-2 text-stone-500">变更：{item.changes.join("；")}</div> : null}
                              <div className="mt-2 text-stone-500">
                                回流 {formatWritingEvalMetric(item.signals.feedbackCount, "", 0)} ·
                                用户 {formatWritingEvalMetric(item.signals.uniqueUsers, "", 0)} ·
                                命中 {formatWritingEvalMetric(item.signals.totalHitCount, "", 0)} ·
                                Delta {formatWritingEvalMetric(item.signals.deltaTotalScore, "", 2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-xs leading-6 text-stone-500">
                          当前运营对象还没有 rollout 审计记录。保存后续配置或等待 scheduler 自动治理后，这里会显示最近轨迹。
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={handleReuseSelectedRunConfig} className={uiPrimitives.adminSecondaryButton}>
                复用当前实验配置
              </button>
              <button type="button" onClick={handlePrefillScheduleFromSelectedRun} className={uiPrimitives.adminSecondaryButton}>
                基于当前 Run 预填调度
              </button>
              {selectedRunSourceSchedule ? (
                <button type="button" onClick={handleEditSourceScheduleFromSelectedRun} className={uiPrimitives.adminSecondaryButton}>
                  编辑来源调度
                </button>
              ) : null}
              <button type="button" onClick={() => void handleCreateScheduleFromSelectedRun()} className={uiPrimitives.adminSecondaryButton}>
                一键创建调度规则
              </button>
              <button type="button" onClick={() => void handleCreateReverseRun()} className={uiPrimitives.adminSecondaryButton}>
                发起反向对照实验
              </button>
              <button
                type="button"
                onClick={handleRetryRun}
                className={uiPrimitives.adminSecondaryButton}
                disabled={retryingRunId === selectedRunId}
              >
                {retryingRunId === selectedRunId ? "重跑中…" : "重跑当前实验"}
              </button>
              <button
                type="button"
                onClick={handlePromoteRun}
                className={uiPrimitives.primaryButton}
                disabled={
                  selectedRunDetail.status !== "succeeded"
                  || selectedRunDetail.resolutionStatus !== "pending"
                  || promotingRunAction !== null
                  || (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim())
                }
              >
                {promotingRunAction === "promote" ? "保留中…" : selectedRunRequiresRiskApproval ? "填写审批后 keep" : "保留候选版本"}
              </button>
              <button
                type="button"
                onClick={handlePromoteRunAndOpenVersions}
                className={uiPrimitives.adminSecondaryButton}
                disabled={
                  selectedRunDetail.status !== "succeeded"
                  || selectedRunDetail.resolutionStatus !== "pending"
                  || promotingRunAction !== null
                  || (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim())
                }
              >
                {promotingRunAction === "promote-open"
                  ? "保留中…"
                  : selectedRunRequiresRiskApproval
                    ? "审批后 keep 并进入放量面板"
                    : "保留并进入放量面板"}
              </button>
              <button
                type="button"
                onClick={() => void handlePromoteRunWithRollout({ actionKey: "promote-observe", rolloutObserveOnly: true, rolloutPercentage: 0 })}
                className={uiPrimitives.adminSecondaryButton}
                disabled={
                  selectedRunDetail.status !== "succeeded"
                  || selectedRunDetail.resolutionStatus !== "pending"
                  || promotingRunAction !== null
                  || (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim())
                }
              >
                {promotingRunAction === "promote-observe" ? "提交中…" : "keep 并观察"}
              </button>
              <button
                type="button"
                onClick={() => void handlePromoteRunWithRollout({ actionKey: "promote-trial-5", rolloutObserveOnly: false, rolloutPercentage: 5 })}
                className={uiPrimitives.adminSecondaryButton}
                disabled={
                  selectedRunDetail.status !== "succeeded"
                  || selectedRunDetail.resolutionStatus !== "pending"
                  || promotingRunAction !== null
                  || (selectedRunRequiresRiskApproval && !promoteApprovalReason.trim())
                }
              >
                {promotingRunAction === "promote-trial-5" ? "提交中…" : "keep 并 5% 试水"}
              </button>
              <button
                type="button"
                onClick={handleDiscardRun}
                className={uiPrimitives.adminSecondaryButton}
                disabled={selectedRunDetail.status !== "succeeded" || selectedRunDetail.resolutionStatus !== "pending" || promotingRunAction !== null}
              >
                {promotingRunAction === "discard" ? "提交中…" : "记录 discard"}
              </button>
              {isPromptBackedVersionType(selectedRunDetail.baseVersionType) && selectedRunDetail.baseVersionType === selectedRunDetail.candidateVersionType ? (
                <>
                  {selectedRunDetail.status === "succeeded" && selectedRunDetail.resolutionStatus === "pending" ? (
                    <button
                      type="button"
                      onClick={() => void handleAdvanceRunAlongRecommendation()}
                      className={uiPrimitives.adminSecondaryButton}
                      disabled={
                        promotingRunAction !== null
                        || (selectedRunDetail.recommendation === "keep" && selectedRunRequiresRiskApproval && !promoteApprovalReason.trim())
                      }
                    >
                      {promotingRunAction === "decision-continue"
                        ? "推进中…"
                        : selectedRunDetail.recommendation === "keep"
                          ? "keep 并继续优化下一轮"
                          : "discard 并继续优化下一轮"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleForkPromptCandidateAndRun()}
                    className={uiPrimitives.primaryButton}
                    disabled={selectedRunDetail.status !== "succeeded" || promotingRunAction !== null}
                  >
                    {promotingRunAction === "continue-optimize" ? "创建中…" : "一键 fork 候选并发起新实验"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreatePromptCandidateFromRun()}
                    className={uiPrimitives.adminSecondaryButton}
                    disabled={selectedRunDetail.status !== "succeeded"}
                  >
                    仅生成下一版 Prompt
                  </button>
                </>
              ) : null}
              {selectedRunOpsVersionsHref ? (
                <Link href={selectedRunOpsVersionsHref} className={uiPrimitives.adminSecondaryButton}>
                  打开当前运营对象账本
                </Link>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "真实回流样本",
                  value: `${feedbackState?.realOutcome.items.length ?? 0} 条`,
                  caption: `观察爆款 ${formatWritingEvalMetric(feedbackState?.realOutcome.summary.averageObservedViralScore, "", 2)} · 打开 ${formatWritingEvalMetric(feedbackState?.realOutcome.summary.averageOpenRate, "%", 1)}`,
                  tone: "text-stone-100",
                },
                {
                  label: "实验反馈样本",
                  value: `${feedbackState?.items.length ?? 0} 条`,
                  caption: `观察爆款 ${formatWritingEvalMetric(feedbackState?.summary.averageObservedViralScore, "", 2)} · 打开 ${formatWritingEvalMetric(feedbackState?.summary.averageOpenRate, "%", 1)}`,
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
                    {loadingFeedback ? "加载中…" : `${feedbackState?.realOutcome.items.length ?? 0} 条真实回流`}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  {[
                    {
                      label: "观察爆款分",
                      value: formatWritingEvalMetric(feedbackState?.realOutcome.summary.averageObservedViralScore, "", 2),
                      tone: "text-stone-100",
                    },
                    {
                      label: "离线预测爆款分",
                      value: formatWritingEvalMetric(feedbackState?.realOutcome.summary.averagePredictedViralScore, "", 2),
                      tone: "text-stone-300",
                    },
                    {
                      label: "校准偏差",
                      value: formatWritingEvalMetric(feedbackState?.realOutcome.summary.averageCalibrationGap, "", 2),
                      tone:
                        (feedbackState?.realOutcome.summary.averageCalibrationGap ?? 0) >= 0
                          ? "text-emerald-400"
                          : "text-cinnabar",
                    },
                    {
                      label: "平均打开率",
                      value: formatWritingEvalMetric(feedbackState?.realOutcome.summary.averageOpenRate, "%", 1),
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
                            ? buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: item.caseId })
                            : null;
                        return (
                          <FeedbackSampleCard
                            key={item.id}
                            item={item}
                            detail={
                              <>
                                {item.articleTitle ? `稿件：${item.articleTitle}` : "未关联稿件"}
                                {item.mediaId ? ` · media_id ${item.mediaId}` : ""}
                              </>
                            }
                            actionContent={
                              item.resultId || realOutcomeCaseHref ? (
                                <>
                                  {item.resultId ? (
                                    <button type="button" onClick={() => focusRunResult(item.resultId!)} className={uiPrimitives.adminSecondaryButton}>
                                      打开对应样本
                                    </button>
                                  ) : null}
                                  {realOutcomeCaseHref ? (
                                    <Link href={realOutcomeCaseHref} className={uiPrimitives.adminSecondaryButton}>
                                      打开评测样本
                                    </Link>
                                  ) : null}
                                </>
                              ) : undefined
                            }
                          />
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
                  当前实验反馈 {loadingFeedback ? "加载中…" : `${feedbackState?.items.length ?? 0} 条`} · 平均打开率 {formatWritingEvalMetric(feedbackState?.summary.averageOpenRate, "%", 1)} ·
                  校准偏差 {formatWritingEvalMetric(feedbackState?.summary.averageCalibrationGap, "", 2)}
                </div>
                <div className="mt-4 space-y-3">
                  <select aria-label="select control"
                    value={feedbackForm.resultId}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, resultId: event.target.value }))}
                    className={uiPrimitives.adminSelect}
                  >
                    <option value="">选择关联样本结果，可选</option>
                    {(feedbackState?.options.results ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.taskCode} · {item.topicTitle} · 爆款 {item.viralScore.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <select aria-label="select control"
                    value={feedbackForm.articleId}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, articleId: event.target.value }))}
                    className={uiPrimitives.adminSelect}
                  >
                    <option value="">选择已发布稿件，可选</option>
                    {(feedbackState?.options.articles ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        #{item.id} · {item.title} · {item.status}
                      </option>
                    ))}
                  </select>
                  <select aria-label="select control"
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
                    className={uiPrimitives.adminSelect}
                  >
                    <option value="">选择微信同步记录，可选</option>
                    {(feedbackState?.options.syncLogs ?? []).map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        #{item.id} · {item.title || "未命名稿件"} · {item.status}
                      </option>
                    ))}
                  </select>
                  <select aria-label="select control"
                    value={feedbackForm.sourceType}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, sourceType: event.target.value }))}
                    className={uiPrimitives.adminSelect}
                  >
                    <option value="manual">manual</option>
                    <option value="wechat_dashboard">wechat_dashboard</option>
                    <option value="admin_review">admin_review</option>
                  </select>
                  <input aria-label="来源标签，例如 4 月第 2 周复盘"
                    value={feedbackForm.sourceLabel}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, sourceLabel: event.target.value }))}
                    placeholder="来源标签，例如 4 月第 2 周复盘"
                    className={uiPrimitives.adminInput}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input aria-label="打开率 %" value={feedbackForm.openRate} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, openRate: event.target.value }))} placeholder="打开率 %" className={uiPrimitives.adminInput} />
                    <input aria-label="读完率 %"
                      value={feedbackForm.readCompletionRate}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, readCompletionRate: event.target.value }))}
                      placeholder="读完率 %"
                      className={uiPrimitives.adminInput}
                    />
                    <input aria-label="分享率 %" value={feedbackForm.shareRate} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, shareRate: event.target.value }))} placeholder="分享率 %" className={uiPrimitives.adminInput} />
                    <input aria-label="收藏率 %"
                      value={feedbackForm.favoriteRate}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, favoriteRate: event.target.value }))}
                      placeholder="收藏率 %"
                      className={uiPrimitives.adminInput}
                    />
                    <input aria-label="阅读量" value={feedbackForm.readCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, readCount: event.target.value }))} placeholder="阅读量" className={uiPrimitives.adminInput} />
                    <input aria-label="点赞数" value={feedbackForm.likeCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, likeCount: event.target.value }))} placeholder="点赞数" className={uiPrimitives.adminInput} />
                    <input aria-label="评论数" value={feedbackForm.commentCount} onChange={(event) => setFeedbackForm((prev) => ({ ...prev, commentCount: event.target.value }))} placeholder="评论数" className={uiPrimitives.adminInput} />
                    <input aria-label="input control"
                      type="datetime-local"
                      value={feedbackForm.capturedAt}
                      onChange={(event) => setFeedbackForm((prev) => ({ ...prev, capturedAt: event.target.value }))}
                      className={uiPrimitives.adminInput}
                    />
                  </div>
                  <textarea aria-label="记录这次线上表现的背景，例如推送时段、封面策略、外部事件干扰。"
                    value={feedbackForm.notes}
                    onChange={(event) => setFeedbackForm((prev) => ({ ...prev, notes: event.target.value }))}
                    className={`min-h-[110px] ${uiPrimitives.adminInput}`}
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
                    <div className="text-xs text-stone-500">{loadingFeedback ? "加载中…" : `${feedbackState?.items.length ?? 0} 条`}</div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {feedbackState?.items.length ? (
                      feedbackState.items.map((item) => {
                        const signalHighlights = getFeedbackSignalHighlights(item);
                        const feedbackCaseHref =
                          item.caseId && selectedRunDetail
                            ? buildAdminWritingEvalDatasetsHref({ datasetId: selectedRunDetail.datasetId, caseId: item.caseId })
                            : null;
                        return (
                          <FeedbackSampleCard
                            key={`feedback-${item.id}`}
                            item={item}
                            detail={
                              <>
                                {item.resultId ? `result #${item.resultId}` : "未关联 result"}
                                {item.articleTitle ? ` · 稿件：${item.articleTitle}` : ""}
                                {item.mediaId ? ` · media_id ${item.mediaId}` : ""}
                              </>
                            }
                            actionContent={
                              item.resultId || feedbackCaseHref ? (
                                <>
                                  {item.resultId ? (
                                    <button type="button" onClick={() => focusRunResult(item.resultId!)} className={uiPrimitives.adminSecondaryButton}>
                                      打开对应样本
                                    </button>
                                  ) : null}
                                  {feedbackCaseHref ? (
                                    <Link href={feedbackCaseHref} className={uiPrimitives.adminSecondaryButton}>
                                      打开评测样本
                                    </Link>
                                  ) : null}
                                </>
                              ) : undefined
                            }
                            extraContent={
                              signalHighlights.length ? (
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {signalHighlights.map((entry) => (
                                    <span key={`${item.id}-${entry.label}`} className="border border-stone-700 px-3 py-1 text-stone-400">
                                      {entry.label} {formatWritingEvalMetric(entry.value, "", 2)}
                                    </span>
                                  ))}
                                </div>
                              ) : undefined
                            }
                          />
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
                  const ruleScores = getRecord(selectedRunResult.judgePayload.ruleScores);
                  const judgeScores = getRecord(hybridJudge.scores);
                  const judgeBlend = getRecord(hybridJudge.blend);
                  const judgeReasons = getRecord(hybridJudge.reasons);
                  const judgeProblems = getStringList(hybridJudge.problems, 8);
                  const judgeReviewers = Array.isArray(hybridJudge.reviewers)
                    ? hybridJudge.reviewers.map((item) => getRecord(item)).filter((item) => Object.keys(item).length > 0)
                    : [];
                  const baselineJudge = getRecord(baseline.judge);
                  const baselineRuleScores = getRecord(baselineJudge.ruleScores);
                  const baselineHybridJudge = getRecord(baselineJudge.hybridJudge);
                  const baselineJudgeScores = getRecord(baselineHybridJudge.scores);
                  const scoringProfile = getRecord(selectedRunResult.judgePayload.scoringProfile);
                  const qualityWeights = getRecord(scoringProfile.qualityWeights);
                  const viralWeights = getRecord(scoringProfile.viralWeights);
                  const totalWeights = getRecord(scoringProfile.totalWeights);
                  const penalties = getRecord(scoringProfile.penalties);
                  const signals = getRecord(selectedRunResult.judgePayload.signals);
                  const totalPenalties = getRecord(selectedRunResult.judgePayload.totalPenalties);
                  const baselineTotalPenalties = getRecord(getRecord(baseline.judge).totalPenalties);
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
                  const scoreBreakdownRows = SCORE_BREAKDOWN_FIELDS.map((item) => ({
                    label: item.label,
                    candidateRule: getNumber(ruleScores[item.field]),
                    candidateJudge: getNumber(judgeScores[item.field]),
                    candidateBlended: selectedRunResult[item.field],
                    baselineRule: getNumber(baselineRuleScores[item.field]),
                    baselineJudge: getNumber(baselineJudgeScores[item.field]),
                    baselineBlended: getNumber(baselineScores[toSnakeCaseScoreField(item.field)]),
                  }));
                  const signalRows: Array<[string, number | null]> = [
                    ["事实信号", getNumber(signals.factSignalCount)],
                    ["必用事实数", getNumber(signals.mustUseFactCount)],
                    ["必用事实命中", getNumber(signals.mustUseFactHits)],
                    ["必用事实覆盖", getNumber(signals.mustUseFactCoverage)],
                    ["情绪触发", getNumber(signals.emotionHits)],
                    ["冲突触发", getNumber(signals.conflictHits)],
                    ["价值触发", getNumber(signals.valueHits)],
                    ["新鲜触发", getNumber(signals.noveltyHits)],
                    ["时效触发", getNumber(signals.timelinessHits)],
                    ["传播触发", getNumber(signals.shareabilityHits)],
                    ["坏模式命中", getNumber(signals.badPatternHits)],
                    ["关键词重合", getNumber(signals.keywordOverlapRatio)],
                    ["无来源数字", getNumber(signals.unsupportedNumberCount)],
                    ["系列连续触发", getNumber(signals.seriesContinuityHits)],
                    ["系列关键词重合", getNumber(signals.seriesKeywordOverlap)],
                    ["系列一致性", getNumber(signals.seriesConsistencyScore)],
                    ["目标情绪覆盖", getNumber(signals.targetEmotionCoverage)],
                    ["段落情绪跨度", getNumber(signals.paragraphEmotionSpan)],
                    ["段落情绪转折", getNumber(signals.paragraphEmotionTurns)],
                    ["段落情绪推进", getNumber(signals.paragraphEmotionProgression)],
                    ["情绪峰值位置", getNumber(signals.paragraphEmotionPeakPosition)],
                    ["情绪轨迹分", getNumber(signals.emotionTrajectoryScore)],
                    ["参考稿相似度", getNumber(signals.referenceOutputSimilarity)],
                    ["历史标题相似度", getNumber(signals.historyTitleSimilarity)],
                    ["历史正文相似度", getNumber(signals.historyBodySimilarity)],
                    ["历史近重复风险", getNumber(signals.historicalSimilarityRisk)],
                    ["评审一致率", getNumber(signals.judgeAgreementRatio)],
                    ["评审打分波动", getNumber(signals.judgeScoreStddev)],
                    ["评审最大波动", getNumber(signals.judgeMaxScoreStddev)],
                    ["评审分歧风险", getNumber(signals.judgeDisagreementRisk)],
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
                          <Link href={focusResult.clearHref} className={uiPrimitives.adminSecondaryButton}>
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
                                <Link href={selectedRunCaseHref} className={uiPrimitives.adminSecondaryButton}>
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
                            {judgeReviewers.length > 0 ? (
                              <div className="mt-2 text-[11px] leading-6 text-stone-500">
                                reviewers {getNumber(hybridJudge.successReviewerCount) ?? 0}/{getNumber(hybridJudge.reviewerCount) ?? judgeReviewers.length}
                                {` · `}
                                {judgeReviewers
                                  .map((item) => getString(item.label) || getString(item.model))
                                  .filter(Boolean)
                                  .slice(0, 3)
                                  .join(" · ")}
                              </div>
                            ) : null}
                            <div className="mt-2 text-[11px] leading-6 text-stone-500">
                              agreement {getNumber(hybridJudge.keepRecommendationAgreementRatio)?.toFixed(3) ?? "--"}
                              {` · `}
                              stddev {getNumber(hybridJudge.scoreStddev)?.toFixed(3) ?? "--"}
                              {` · `}
                              risk {getNumber(hybridJudge.disagreementRisk)?.toFixed(3) ?? "--"}
                            </div>
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

                      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.2em] text-emerald-400">候选评分拆解</div>
                              <div className="text-xs text-stone-500">
                                rule {getNumber(judgeBlend.ruleWeight)?.toFixed(2) ?? "--"} / judge {getNumber(judgeBlend.judgeWeight)?.toFixed(2) ?? "--"}
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                              <div>维度</div>
                              <div>Rule</div>
                              <div>Judge</div>
                              <div>Blended</div>
                            </div>
                            <div className="mt-2 space-y-2">
                              {scoreBreakdownRows.map((row) => (
                                <div key={`candidate-breakdown-${selectedRunResult.id}-${row.label}`} className="grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-2 border border-stone-800 bg-stone-950 px-3 py-3 text-xs">
                                  <div className="text-stone-300">{row.label}</div>
                                  <div className="text-stone-400">{row.candidateRule !== null ? row.candidateRule.toFixed(2) : "--"}</div>
                                  <div className="text-stone-400">{row.candidateJudge !== null ? row.candidateJudge.toFixed(2) : "--"}</div>
                                  <div className="text-emerald-400">{row.candidateBlended.toFixed(2)}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="border border-stone-800 bg-[#141414] px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs uppercase tracking-[0.2em] text-stone-300">基线评分拆解</div>
                              <div className="text-xs text-stone-500">
                                rule {getNumber(getRecord(baselineHybridJudge.blend).ruleWeight)?.toFixed(2) ?? "--"} / judge {getNumber(getRecord(baselineHybridJudge.blend).judgeWeight)?.toFixed(2) ?? "--"}
                              </div>
                            </div>
                            <div className="mt-3 grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                              <div>维度</div>
                              <div>Rule</div>
                              <div>Judge</div>
                              <div>Blended</div>
                            </div>
                            <div className="mt-2 space-y-2">
                              {scoreBreakdownRows.map((row) => (
                                <div key={`baseline-breakdown-${selectedRunResult.id}-${row.label}`} className="grid grid-cols-[84px_repeat(3,minmax(0,1fr))] gap-2 border border-stone-800 bg-stone-950 px-3 py-3 text-xs">
                                  <div className="text-stone-300">{row.label}</div>
                                  <div className="text-stone-400">{row.baselineRule !== null ? row.baselineRule.toFixed(2) : "--"}</div>
                                  <div className="text-stone-400">{row.baselineJudge !== null ? row.baselineJudge.toFixed(2) : "--"}</div>
                                  <div className="text-stone-300">{row.baselineBlended !== null ? row.baselineBlended.toFixed(2) : "--"}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs">
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">Blend 权重</div>
                            <div className="mt-3 space-y-3">
                              <div className="border border-stone-800 bg-[#141414] px-3 py-3">
                                <div className="text-stone-300">候选 Hybrid Judge</div>
                                <div className="mt-2 flex items-center justify-between gap-3 text-stone-400">
                                  <span>ruleWeight</span>
                                  <span>{getNumber(judgeBlend.ruleWeight)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3 text-stone-400">
                                  <span>judgeWeight</span>
                                  <span>{getNumber(judgeBlend.judgeWeight)?.toFixed(4) ?? "--"}</span>
                                </div>
                              </div>
                              <div className="border border-stone-800 bg-[#141414] px-3 py-3">
                                <div className="text-stone-300">基线 Hybrid Judge</div>
                                <div className="mt-2 flex items-center justify-between gap-3 text-stone-400">
                                  <span>ruleWeight</span>
                                  <span>{getNumber(getRecord(baselineHybridJudge.blend).ruleWeight)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3 text-stone-400">
                                  <span>judgeWeight</span>
                                  <span>{getNumber(getRecord(baselineHybridJudge.blend).judgeWeight)?.toFixed(4) ?? "--"}</span>
                                </div>
                              </div>
                              <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-stone-400">
                                <div className="flex items-center justify-between gap-3">
                                  <span>评分画像</span>
                                  <span>{getString(scoringProfile.label) || "--"}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs">
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">聚合分与惩罚</div>
                            <div className="mt-3 space-y-2">
                              {[
                                ["质量分", selectedRunResult.qualityScore, getNumber(baselineScores.quality_score)],
                                ["爆款分", selectedRunResult.viralScore, getNumber(baselineScores.viral_score)],
                                ["总分", selectedRunResult.totalScore, getNumber(baselineScores.total_score)],
                                ["事实惩罚", selectedRunResult.factualRiskPenalty, getNumber(baselineScores.factual_risk_penalty)],
                                ["AI 噪声惩罚", selectedRunResult.aiNoisePenalty, getNumber(baselineScores.ai_noise_penalty)],
                                ["近重复惩罚", getNumber(totalPenalties.historicalSimilarityPenalty), getNumber(baselineTotalPenalties.historicalSimilarityPenalty)],
                                ["评审分歧惩罚", getNumber(totalPenalties.judgeDisagreementPenalty), getNumber(baselineTotalPenalties.judgeDisagreementPenalty)],
                              ].map(([label, candidate, baselineValue]) => (
                                <div key={`aggregate-${selectedRunResult.id}-${label}`} className="border border-stone-800 bg-[#141414] px-3 py-3">
                                  <div className="text-stone-300">{label}</div>
                                  <div className="mt-2 flex items-center justify-between gap-3 text-stone-400">
                                    <span>候选 {typeof candidate === "number" ? candidate.toFixed(2) : "--"}</span>
                                    <span>基线 {typeof baselineValue === "number" ? baselineValue.toFixed(2) : "--"}</span>
                                  </div>
                                </div>
                              ))}
                              <div className="border border-stone-800 bg-[#141414] px-3 py-3 text-stone-400">
                                <div className="flex items-center justify-between gap-3">
                                  <span>quality 权重</span>
                                  <span>{getNumber(totalWeights.quality)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <span>viral 权重</span>
                                  <span>{getNumber(totalWeights.viral)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <span>aiNoiseMultiplier</span>
                                  <span>{getNumber(penalties.aiNoiseMultiplier)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <span>historicalSimilarityMultiplier</span>
                                  <span>{getNumber(penalties.historicalSimilarityMultiplier)?.toFixed(4) ?? "--"}</span>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <span>judgeDisagreementMultiplier</span>
                                  <span>{getNumber(penalties.judgeDisagreementMultiplier)?.toFixed(4) ?? "--"}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-xs">
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">规则信号与画像权重</div>
                            <div className="mt-3 space-y-2">
                              {signalRows.map(([label, value]) => (
                                <div key={`signal-${selectedRunResult.id}-${label}`} className="flex items-center justify-between gap-3 border border-stone-800 bg-[#141414] px-3 py-2 text-stone-400">
                                  <span>{label}</span>
                                  <span>{value !== null ? value.toFixed(3) : "--"}</span>
                                </div>
                              ))}
                            </div>
                            <div className="mt-4 border border-stone-800 bg-[#141414] px-3 py-3">
                              <div className="text-stone-300">质量权重</div>
                              <div className="mt-2 space-y-1 text-stone-400">
                                {[
                                  ["style", getNumber(qualityWeights.style)],
                                  ["language", getNumber(qualityWeights.language)],
                                  ["density", getNumber(qualityWeights.density)],
                                  ["emotion", getNumber(qualityWeights.emotion)],
                                  ["structure", getNumber(qualityWeights.structure)],
                                ].map(([label, value]) => (
                                  <div key={`quality-weight-${selectedRunResult.id}-${label}`} className="flex items-center justify-between gap-3">
                                    <span>{label}</span>
                                    <span>{typeof value === "number" ? value.toFixed(4) : "--"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="mt-3 border border-stone-800 bg-[#141414] px-3 py-3">
                              <div className="text-stone-300">爆款权重</div>
                              <div className="mt-2 space-y-1 text-stone-400">
                                {[
                                  ["topicMomentum", getNumber(viralWeights.topicMomentum)],
                                  ["headline", getNumber(viralWeights.headline)],
                                  ["hook", getNumber(viralWeights.hook)],
                                  ["shareability", getNumber(viralWeights.shareability)],
                                  ["readerValue", getNumber(viralWeights.readerValue)],
                                  ["novelty", getNumber(viralWeights.novelty)],
                                  ["platformFit", getNumber(viralWeights.platformFit)],
                                ].map(([label, value]) => (
                                  <div key={`viral-weight-${selectedRunResult.id}-${label}`} className="flex items-center justify-between gap-3">
                                    <span>{label}</span>
                                    <span>{typeof value === "number" ? value.toFixed(4) : "--"}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
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
