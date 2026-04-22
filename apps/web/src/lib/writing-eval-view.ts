export type WritingEvalReadinessLike = {
  status: "ready" | "warning" | "blocked";
  enabledCaseCount: number;
  blockers: string[];
  warnings: string[];
};

type WritingEvalDatasetLike = {
  id: number;
  status: string;
  sampleCount: number;
  readiness: WritingEvalReadinessLike;
};

type WritingEvalRunLike = {
  status: string;
};

type WritingEvalScheduleLike = {
  isEnabled: boolean;
  datasetStatus: string;
  decisionMode: string;
  nextRunAt: string | null;
  readiness: WritingEvalReadinessLike;
};

const WRITING_EVAL_PROCESSING_RUN_STATUSES = new Set(["queued", "running", "scoring", "promoting"]);

export function getWritingEvalReadinessMeta(readiness: WritingEvalReadinessLike | null | undefined) {
  if (!readiness) {
    return {
      label: "unknown",
      tone: "border-adminLineStrong text-adminInkMuted",
      summary: "还没有就绪度数据。",
    };
  }
  if (readiness.status === "ready") {
    return {
      label: "ready",
      tone: "border-emerald-500/40 text-emerald-300",
      summary: `启用样本 ${readiness.enabledCaseCount} 条，已满足自动实验基础守卫。`,
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

export function getWritingEvalReadinessTone(status: string | null | undefined) {
  if (status === "ready") return "text-emerald-300";
  if (status === "warning") return "text-amber-200";
  if (status === "blocked") return "text-cinnabar";
  return "text-adminInkMuted";
}

export function getWritingEvalExecutionTone(state: string | null | undefined) {
  if (state === "executable") return "text-emerald-300 border-emerald-500/40";
  if (state === "blocked") return "text-cinnabar border-cinnabar/40";
  return "text-adminInkMuted border-adminLineStrong";
}

export function isWritingEvalScheduleExecutable(schedule: WritingEvalScheduleLike) {
  if (!schedule.isEnabled) return false;
  if (schedule.datasetStatus !== "active") return false;
  if (schedule.readiness.status === "blocked") return false;
  if (schedule.decisionMode !== "manual_review" && schedule.readiness.status !== "ready") return false;
  return true;
}

export function getWritingEvalDatasetStats<T extends WritingEvalDatasetLike>(datasets: T[]) {
  const totalSampleCount = datasets.reduce((sum, item) => sum + item.sampleCount, 0);
  const activeCount = datasets.filter((item) => item.status === "active").length;
  const readyCount = datasets.filter((item) => item.readiness.status === "ready").length;
  const warningCount = datasets.filter((item) => item.readiness.status === "warning").length;
  const blockedCount = datasets.filter((item) => item.readiness.status === "blocked").length;
  const prioritizedIssues = datasets
    .filter((item) => item.readiness.status !== "ready")
    .sort((left, right) => {
      const rank = { blocked: 0, warning: 1, ready: 2 } as const;
      return rank[left.readiness.status] - rank[right.readiness.status];
    })
    .slice(0, 3);

  return {
    totalSampleCount,
    activeCount,
    readyCount,
    warningCount,
    blockedCount,
    prioritizedIssues,
  };
}

export function getWritingEvalRunStats<T extends WritingEvalRunLike>(runs: T[]) {
  return {
    succeededCount: runs.filter((item) => item.status === "succeeded").length,
    processingCount: runs.filter((item) => WRITING_EVAL_PROCESSING_RUN_STATUSES.has(item.status)).length,
  };
}

export function getWritingEvalScheduleStats<T extends WritingEvalScheduleLike>(schedules: T[], now = Date.now()) {
  const enabledCount = schedules.filter((item) => item.isEnabled).length;
  const executableCount = schedules.filter((item) => isWritingEvalScheduleExecutable(item)).length;
  const blockedEnabledCount = schedules.filter((item) => item.isEnabled && !isWritingEvalScheduleExecutable(item)).length;
  const dueCount = schedules.filter((item) => item.isEnabled && item.nextRunAt && new Date(item.nextRunAt).getTime() <= now).length;

  return {
    enabledCount,
    executableCount,
    blockedEnabledCount,
    dueCount,
  };
}
