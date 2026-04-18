import { appendAuditLog, getAdminAuditLogs, getWritingEvalRolloutAuditLogs } from "./audit";
import { updatePromptVersionRolloutConfig } from "./repositories";
import { buildWritingEvalInsightsRiskLedger, getWritingEvalInsights, getWritingEvalRunDetail } from "./writing-eval";
import { retryWritingEvalRun } from "./writing-eval";
import { getWritingAssetRollout, upsertWritingAssetRollout, type WritingRolloutAssetType } from "./writing-rollout";

export type WritingEvalGovernanceActionType = "retry_run" | "set_rollout_observe" | "set_rollout_trial" | "pause_rollout";

export type WritingEvalGovernanceActionInput = {
  actionType: WritingEvalGovernanceActionType;
  label?: string | null;
  reason?: string | null;
  priorityHint?: number | null;
  strategyTags?: string[] | null;
  runId: number | null;
  assetType: string | null;
  assetRef: string | null;
};

type WritingEvalGovernanceCandidate = WritingEvalGovernanceActionInput & {
  priority: number;
  targetKey: string;
};

function normalizeAssetType(value: string | null | undefined) {
  if (value === "prompt_version") return "prompt_version" as const;
  if (value && ["layout_strategy", "apply_command_template", "scoring_profile"].includes(value)) {
    return value as WritingRolloutAssetType;
  }
  return null;
}

function parsePromptRef(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed.includes("@")) return null;
  const [promptId, version] = trimmed.split("@", 2);
  return promptId && version ? { promptId, version } : null;
}

function getWritingEvalGovernancePriority(actionType: WritingEvalGovernanceActionType) {
  if (actionType === "pause_rollout") return 400;
  if (actionType === "set_rollout_observe") return 300;
  if (actionType === "retry_run") return 200;
  return 100;
}

function getWritingEvalGovernanceTargetKey(action: Pick<WritingEvalGovernanceActionInput, "actionType" | "runId" | "assetType" | "assetRef">) {
  return action.actionType === "retry_run"
    ? `run:${action.runId ?? "null"}`
    : `asset:${action.assetType ?? "null"}:${action.assetRef ?? "null"}`;
}

export function dedupeWritingEvalGovernanceActions(actions: WritingEvalGovernanceActionInput[]) {
  const deduped = new Map<string, WritingEvalGovernanceActionInput>();
  for (const action of actions) {
    const key = action.actionType === "retry_run"
      ? `${action.actionType}:${action.runId ?? "null"}`
      : `${action.actionType}:${action.assetType ?? "null"}:${action.assetRef ?? "null"}`;
    if (!deduped.has(key)) {
      deduped.set(key, action);
    }
  }
  return [...deduped.values()];
}

function buildWritingEvalGovernancePlan(actions: WritingEvalGovernanceActionInput[]) {
  const byTarget = new Map<string, WritingEvalGovernanceCandidate>();
  for (const action of dedupeWritingEvalGovernanceActions(actions)) {
    const candidate: WritingEvalGovernanceCandidate = {
      ...action,
      priority: Math.max(getWritingEvalGovernancePriority(action.actionType), Math.round(Number(action.priorityHint ?? 0)) || 0),
      targetKey: getWritingEvalGovernanceTargetKey(action),
    };
    const existing = byTarget.get(candidate.targetKey);
    if (!existing || candidate.priority > existing.priority) {
      byTarget.set(candidate.targetKey, candidate);
    }
  }
  return [...byTarget.values()].sort((left, right) => right.priority - left.priority);
}

async function getRecentWritingEvalGovernanceActionAudits(limit = 400) {
  const audits = await getAdminAuditLogs({
    action: "writing_eval_governance_action",
    limit,
  });
  return audits.map((item) => ({
    createdAt: item.createdAt,
    targetType: item.targetType,
    targetId: item.targetId,
    actionType: typeof item.payload?.actionType === "string" ? item.payload.actionType : null,
    triggerMode: typeof item.payload?.triggerMode === "string" ? item.payload.triggerMode : null,
  }));
}

async function shouldSkipWritingEvalGovernanceAction(input: {
  action: WritingEvalGovernanceCandidate;
  recentAudits: Awaited<ReturnType<typeof getRecentWritingEvalGovernanceActionAudits>>;
  now: Date;
  cooldownHours: number;
  maxRetryActionsPerRun: number;
}) {
  const cooldownMs = input.cooldownHours * 60 * 60 * 1000;
  const targetAuditId =
    input.action.actionType === "retry_run"
      ? String(input.action.runId ?? "")
      : `${input.action.assetType ?? ""}:${input.action.assetRef ?? ""}`;
  const matched = input.recentAudits.filter(
    (item) => item.actionType === input.action.actionType && item.targetId === targetAuditId,
  );
  const sameTargetRecent = input.recentAudits.filter(
    (item) => item.targetId === targetAuditId && input.now.getTime() - new Date(item.createdAt).getTime() < cooldownMs,
  );
  const withinCooldown = matched.find((item) => input.now.getTime() - new Date(item.createdAt).getTime() < cooldownMs);
  if (withinCooldown) {
    return {
      skip: true,
      reason: `cooldown 未结束，上次同动作执行于 ${withinCooldown.createdAt}`,
    };
  }
  if (input.action.actionType !== "pause_rollout") {
    const strongerRecent = sameTargetRecent.find((item) => item.actionType === "pause_rollout");
    if (strongerRecent) {
      return {
        skip: true,
        reason: `同目标近期已执行更强治理动作 pause_rollout（${strongerRecent.createdAt}），当前不再降级为较弱动作`,
      };
    }
  }
  if (input.action.actionType === "retry_run") {
    const retryCount = matched.length;
    if (retryCount >= input.maxRetryActionsPerRun) {
      return {
        skip: true,
        reason: `该 run 已自动治理重试 ${retryCount} 次，超过上限 ${input.maxRetryActionsPerRun}`,
      };
    }
    const runId = Number(input.action.runId);
    if (Number.isInteger(runId) && runId > 0) {
      try {
        const run = await getWritingEvalRunDetail(runId);
        const deltaTotalScore = typeof run.scoreSummary.deltaTotalScore === "number" ? run.scoreSummary.deltaTotalScore : 0;
        const failedCaseCount = typeof run.scoreSummary.failedCaseCount === "number" ? run.scoreSummary.failedCaseCount : 0;
        if (run.resolutionStatus !== "pending") {
          return {
            skip: true,
            reason: `当前 run 已是 ${run.resolutionStatus}，自动重试收益低`,
          };
        }
        if (run.recommendation === "discard" && deltaTotalScore <= -3) {
          return {
            skip: true,
            reason: `当前 run 离线 Delta ${deltaTotalScore.toFixed(2)} 且系统建议 discard，自动重试收益低`,
          };
        }
        if (run.results.length > 0 && failedCaseCount >= Math.max(3, Math.ceil(run.results.length * 0.6)) && deltaTotalScore <= 0) {
          return {
            skip: true,
            reason: `当前 run 失败 case ${failedCaseCount}/${run.results.length} 且收益未转正，优先人工排查而不是自动重试`,
          };
        }
      } catch {
        return {
          skip: false,
          reason: null,
        };
      }
    }
  }
  return {
    skip: false,
    reason: null,
  };
}

export async function executeWritingEvalGovernanceAction(
  action: WritingEvalGovernanceActionInput,
  operatorUserId: number | null,
  triggerMode: "manual" | "batch" | "service_auto" = "manual",
) {
  const auditTargetType = action.actionType === "retry_run" ? "writing_optimization_run" : "writing_rollout_target";
  const auditTargetId = action.actionType === "retry_run" ? action.runId : `${action.assetType || ""}:${action.assetRef || ""}`;
  if (action.actionType === "retry_run") {
    const runId = Number(action.runId);
    if (!Number.isInteger(runId) || runId <= 0) {
      throw new Error("Run 无效");
    }
    const run = await retryWritingEvalRun({ runId, operatorUserId });
    await appendAuditLog({
      userId: operatorUserId,
      action: "writing_eval_governance_action",
      targetType: auditTargetType,
      targetId: auditTargetId,
      payload: {
        actionType: action.actionType,
        triggerMode,
        reason: action.reason || null,
        strategyTags: Array.isArray(action.strategyTags) ? action.strategyTags : [],
        runCode: run.runCode,
      },
    });
    return {
      actionType: action.actionType,
      runId: run.id,
      runCode: run.runCode,
      assetType: null,
      assetRef: null,
      message: `已重新入队 ${run.runCode || `run#${run.id}`}`,
    };
  }

  const assetType = normalizeAssetType(action.assetType);
  const assetRef = String(action.assetRef || "").trim();
  if (!assetType || !assetRef) {
    throw new Error("治理对象无效");
  }

  const nextConfig =
    action.actionType === "set_rollout_trial"
      ? { rolloutObserveOnly: false, rolloutPercentage: 5, rolloutPlanCodes: [] as string[] }
      : action.actionType === "pause_rollout"
        ? { rolloutObserveOnly: false, rolloutPercentage: 0, rolloutPlanCodes: [] as string[] }
        : { rolloutObserveOnly: true, rolloutPercentage: 0, rolloutPlanCodes: [] as string[] };

  if (assetType === "prompt_version") {
    const promptRef = parsePromptRef(assetRef);
    if (!promptRef) {
      throw new Error("Prompt 版本引用无效");
    }
    await updatePromptVersionRolloutConfig({
      promptId: promptRef.promptId,
      version: promptRef.version,
      autoMode: "manual",
      ...nextConfig,
    });
  } else {
    const existing = await getWritingAssetRollout(assetType, assetRef);
    await upsertWritingAssetRollout({
      assetType,
      assetRef,
      autoMode: "manual",
      rolloutObserveOnly: nextConfig.rolloutObserveOnly,
      rolloutPercentage: nextConfig.rolloutPercentage,
      rolloutPlanCodes: nextConfig.rolloutPlanCodes,
      isEnabled: action.actionType !== "pause_rollout",
      notes: existing?.notes ?? null,
      operatorUserId,
    });
  }

  await appendAuditLog({
    userId: operatorUserId,
    action: "writing_eval_governance_action",
    targetType: auditTargetType,
    targetId: auditTargetId,
    payload: {
      actionType: action.actionType,
      triggerMode,
      reason: action.reason || null,
      strategyTags: Array.isArray(action.strategyTags) ? action.strategyTags : [],
      assetType,
      assetRef,
    },
  });

  return {
    actionType: action.actionType,
    runId: null,
    runCode: null,
    assetType,
    assetRef,
    message:
      action.actionType === "set_rollout_trial"
        ? "已调整为 5% 试水"
        : action.actionType === "pause_rollout"
          ? "已暂停当前灰度"
      : "已切回观察流量",
  };
}

export async function autoGovernWritingEvalRisks(input: {
  operatorUserId?: number | null;
  triggerMode?: "batch" | "service_auto";
  limit?: number;
  recentWindowDays?: number;
  insightLimit?: number;
  rolloutDays?: number;
  cooldownHours?: number;
  maxRetryActionsPerRun?: number;
  dryRun?: boolean;
}) {
  const limit = Math.min(Math.max(Math.round(Number(input.limit ?? 6)), 1), 24);
  const cooldownHours = Math.min(Math.max(Math.round(Number(input.cooldownHours ?? 12)), 1), 168);
  const maxRetryActionsPerRun = Math.min(Math.max(Math.round(Number(input.maxRetryActionsPerRun ?? 2)), 1), 10);
  const now = new Date();
  const [insights, rolloutAudits, recentAudits] = await Promise.all([
    getWritingEvalInsights(Math.min(Math.max(Math.round(Number(input.insightLimit ?? 60)), 12), 60)),
    getWritingEvalRolloutAuditLogs(Math.min(Math.max(Math.round(Number(input.rolloutDays ?? 180)), 30), 365)),
    getRecentWritingEvalGovernanceActionAudits(),
  ]);
  const riskLedger = buildWritingEvalInsightsRiskLedger({
    insights,
    combinedRolloutAuditLogs: rolloutAudits.combinedRolloutAuditLogs,
    recentWindowDays: input.recentWindowDays ?? 7,
    maxItems: 24,
  });
  const plannedActions = buildWritingEvalGovernancePlan(
    riskLedger.items
      .map((item) => (item.tone === "cinnabar" ? item.recommendedAction : null))
      .filter((item): item is NonNullable<(typeof riskLedger.items)[number]["recommendedAction"]> => Boolean(item)),
  );
  const executableActions = [] as WritingEvalGovernanceCandidate[];
  const skippedActions = [] as Array<WritingEvalGovernanceCandidate & { skipReason: string }>;
  for (const action of plannedActions) {
    const gate = await shouldSkipWritingEvalGovernanceAction({
      action,
      recentAudits,
      now,
      cooldownHours,
      maxRetryActionsPerRun,
    });
    if (gate.skip) {
      skippedActions.push({
        ...action,
        skipReason: gate.reason || "已跳过",
      });
      continue;
    }
    executableActions.push(action);
    if (executableActions.length >= limit) break;
  }

  if (input.dryRun) {
    return {
      dryRun: true,
      totalCandidateActions: plannedActions.length,
      executableCount: executableActions.length,
      skippedCount: skippedActions.length,
      cooldownHours,
      maxRetryActionsPerRun,
      actions: executableActions,
      skippedActions: skippedActions.map((item) => ({
        actionType: item.actionType,
        targetKey: item.targetKey,
        reason: item.skipReason,
      })),
    };
  }

  const results = [] as Array<{ ok: boolean; actionType: string; message: string; target: string }>;
  for (const action of executableActions) {
    try {
      const result = await executeWritingEvalGovernanceAction(action, input.operatorUserId ?? null, input.triggerMode ?? "service_auto");
      results.push({
        ok: true,
        actionType: result.actionType,
        message: result.message,
        target: result.runCode || result.assetRef || String(result.runId || "--"),
      });
    } catch (error) {
      results.push({
        ok: false,
        actionType: action.actionType,
        message: error instanceof Error ? error.message : "执行治理动作失败",
        target: action.assetRef || String(action.runId || "--"),
      });
    }
  }

  await appendAuditLog({
    userId: input.operatorUserId ?? null,
    action: "writing_eval_auto_govern_batch",
    targetType: "writing_eval_governance",
    payload: {
      triggerMode: input.triggerMode ?? "service_auto",
      dryRun: false,
      totalCandidateActions: plannedActions.length,
      executableCount: executableActions.length,
      skippedCount: skippedActions.length,
      cooldownHours,
      maxRetryActionsPerRun,
      successCount: results.filter((item) => item.ok).length,
      failureCount: results.filter((item) => !item.ok).length,
      skippedActions: skippedActions.map((item) => ({
        actionType: item.actionType,
        targetKey: item.targetKey,
        reason: item.skipReason,
      })),
      results,
    },
  });

  return {
    dryRun: false,
    totalCandidateActions: plannedActions.length,
    executableCount: executableActions.length,
    skippedCount: skippedActions.length,
    cooldownHours,
    maxRetryActionsPerRun,
    successCount: results.filter((item) => item.ok).length,
    failureCount: results.filter((item) => !item.ok).length,
    skippedActions: skippedActions.map((item) => ({
      actionType: item.actionType,
      targetKey: item.targetKey,
      reason: item.skipReason,
    })),
    results,
  };
}
