import {
  buildAdminPromptVersionHref,
  buildAdminWritingEvalDatasetsHref,
  buildAdminWritingEvalRunsHref,
  buildAdminWritingEvalVersionsHref,
} from "./admin-writing-eval-links";
import { normalizeWritingEvalRolloutAuditLogs } from "./admin-writing-eval-rollout-audits";
import { getAdminAuditLogs, getWritingEvalRolloutAuditLogs, type AdminAuditLogItem } from "./audit";

type WritingEvalAutomationTone = "emerald" | "amber" | "cinnabar" | "stone";

export type WritingEvalAutomationFeedItem = {
  id: number;
  kind: "auto_fill" | "auto_candidate" | "schedule_dispatch" | "auto_calibrate" | "auto_rollout" | "auto_resolve" | "auto_resolve_batch" | "auto_govern";
  createdAt: string;
  title: string;
  summary: string;
  detail: string | null;
  tone: WritingEvalAutomationTone;
  href: string | null;
  hrefLabel: string | null;
  secondaryHref: string | null;
  secondaryHrefLabel: string | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPositiveInt(value: unknown) {
  const number = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(number) && number > 0 ? Number(number) : null;
}

function getSourceReasonLabel(value: string) {
  if (value === "resolved_keep_candidate") return "沿 keep 候选继续迭代";
  if (value === "resolved_discard_base") return "discard 后回到基线";
  if (value === "resolved_rollback_base") return "rollback 后回到基线";
  if (value === "pending_keep_recommendation_candidate") return "高置信 keep 候选提前继续提案";
  return value || "自动提案";
}

function toneRank(value: WritingEvalAutomationTone) {
  if (value === "cinnabar") return 4;
  if (value === "amber") return 3;
  if (value === "emerald") return 2;
  return 1;
}

function mapAutoFillAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const datasetId = getPositiveInt(item.targetId);
  const datasetCode = getString(payload.datasetCode);
  const importedCount = getNumber(payload.importedCount) ?? 0;
  const readinessStatus = getString(payload.readinessStatus) || "unknown";
  const reason = getString(payload.reason);
  const targetSummary = getString(payload.targetSummary);
  return {
    id: item.id,
    kind: "auto_fill",
    createdAt: item.createdAt,
    title: datasetCode || `dataset #${datasetId ?? "--"}`,
    summary: importedCount > 0 ? `自动补桶新增 ${importedCount} 条样本` : "自动补桶未新增样本",
    detail: [readinessStatus, reason || targetSummary].filter(Boolean).join(" · ") || null,
    tone: importedCount > 0 ? "emerald" : readinessStatus === "blocked" ? "cinnabar" : "stone",
    href: datasetId ? buildAdminWritingEvalDatasetsHref({ datasetId }) : null,
    hrefLabel: datasetId ? "打开评测集" : null,
    secondaryHref: null,
    secondaryHrefLabel: null,
  };
}

function mapAutoCandidateAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const nextRunId = getPositiveInt(payload.nextRunId);
  const nextRunCode = getString(payload.nextRunCode);
  const candidateRef = getString(payload.candidateRef);
  const sourceRunCode = getString(payload.sourceRunCode);
  const sourceReason = getString(payload.sourceReason);
  const experimentMode = getString(payload.experimentMode);
  const versionType = getString(payload.versionType);
  const opportunityScore = getNumber(payload.opportunityScore);
  return {
    id: item.id,
    kind: "auto_candidate",
    createdAt: item.createdAt,
    title: candidateRef || nextRunCode || "自动候选提案",
    summary: `${nextRunCode || "新 Run"} · 从 ${sourceRunCode || "上一轮实验"} 继续自动提案`,
    detail: [
      getSourceReasonLabel(sourceReason),
      versionType || null,
      experimentMode || null,
      opportunityScore !== null ? `机会分 ${opportunityScore.toFixed(1)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    tone: "emerald",
    href: nextRunId ? buildAdminWritingEvalRunsHref({ runId: nextRunId }) : null,
    hrefLabel: nextRunId ? "打开新 Run" : null,
    secondaryHref: buildAdminPromptVersionHref(candidateRef),
    secondaryHrefLabel: candidateRef ? "打开候选 Prompt" : null,
  };
}

function mapScheduleDispatchAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const scheduleId = getPositiveInt(item.targetId);
  const runId = getPositiveInt(payload.runId);
  const runCode = getString(payload.runCode);
  const agentStrategy = getString(payload.agentStrategy);
  const decisionMode = getString(payload.decisionMode);
  const triggerMode = getString(payload.triggerMode);
  const nextRunAt = getString(payload.nextRunAt);
  const forced = Boolean(payload.force);
  return {
    id: item.id,
    kind: "schedule_dispatch",
    createdAt: item.createdAt,
    title: runCode || `schedule #${scheduleId ?? "--"}`,
    summary: `调度已派发${forced ? " · force" : ""}`,
    detail: [agentStrategy, decisionMode, triggerMode, nextRunAt ? `下次 ${nextRunAt}` : null].filter(Boolean).join(" · ") || null,
    tone: "emerald",
    href: runId ? buildAdminWritingEvalRunsHref({ runId }) : scheduleId ? buildAdminWritingEvalRunsHref({ scheduleId }) : null,
    hrefLabel: runId ? "打开对应 Run" : scheduleId ? "打开调度面板" : null,
    secondaryHref: scheduleId ? buildAdminWritingEvalRunsHref({ scheduleId }) : null,
    secondaryHrefLabel: scheduleId && runId ? "打开调度面板" : null,
  };
}

function mapAutoCalibrateAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const linkedResultCount = getNumber(payload.linkedResultCount) ?? 0;
  const averageCalibrationGap = getNumber(payload.averageCalibrationGap);
  const misjudgedCaseCount = getNumber(payload.misjudgedCaseCount) ?? 0;
  return {
    id: item.id,
    kind: "auto_calibrate",
    createdAt: item.createdAt,
    title: getString(payload.sourceProfileCode) || "自动校准",
    summary: `基于 ${linkedResultCount} 条线上回流生成新评分画像`,
    detail: [
      averageCalibrationGap !== null ? `平均偏差 ${averageCalibrationGap.toFixed(2)}` : null,
      misjudgedCaseCount > 0 ? `误判样本 ${misjudgedCaseCount}` : null,
      payload.autoActivated ? "已自动激活" : "待人工激活",
    ]
      .filter(Boolean)
      .join(" · ") || null,
    tone: misjudgedCaseCount > 0 ? "amber" : "emerald",
    href: "/admin/writing-eval/insights",
    hrefLabel: "打开 Insights",
    secondaryHref: null,
    secondaryHrefLabel: null,
  };
}

function mapAutoResolveAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const runId = getPositiveInt(item.targetId);
  const runCode = getString(payload.runCode) || (runId ? `run#${runId}` : "自动决议");
  const decision = getString(payload.decision);
  const decisionMode = getString(payload.decisionMode);
  const recommendation = getString(payload.recommendation);
  return {
    id: item.id,
    kind: "auto_resolve",
    createdAt: item.createdAt,
    title: runCode,
    summary: decision === "keep" ? "自动 keep 已执行" : decision === "discard" ? "自动 discard 已执行" : "自动决议已执行",
    detail: [decisionMode || null, recommendation || null, getString(payload.reason) || getString(payload.recommendationReason) || null]
      .filter(Boolean)
      .join(" · ") || null,
    tone: decision === "keep" ? "emerald" : decision === "discard" ? "amber" : "stone",
    href: runId ? buildAdminWritingEvalRunsHref({ runId }) : null,
    hrefLabel: runId ? "打开 Run" : null,
    secondaryHref: null,
    secondaryHrefLabel: null,
  };
}

function mapAutoResolveBatchAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem | null {
  const payload = getRecord(item.payload);
  const scannedCount = getNumber(payload.scannedCount) ?? 0;
  const resolvedCount = getNumber(payload.resolvedCount) ?? 0;
  const failureCount = getNumber(payload.failureCount) ?? 0;
  const noopCount = getNumber(payload.noopCount) ?? 0;
  if (failureCount <= 0 && noopCount <= 0 && resolvedCount > 0) {
    return null;
  }
  return {
    id: item.id,
    kind: "auto_resolve_batch",
    createdAt: item.createdAt,
    title: "自动决议批次",
    summary:
      failureCount > 0
        ? `失败 ${failureCount} 条 · 已决议 ${resolvedCount}/${scannedCount}`
        : resolvedCount <= 0
          ? `本批次未执行自动决议 · 扫描 ${scannedCount}`
          : `部分跳过 · 已决议 ${resolvedCount}/${scannedCount}`,
    detail: [
      noopCount > 0 ? `跳过 ${noopCount}` : null,
      failureCount > 0 ? `失败 ${failureCount}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    tone: failureCount > 0 ? "cinnabar" : resolvedCount <= 0 ? "amber" : "stone",
    href: buildAdminWritingEvalRunsHref(),
    hrefLabel: "打开 Runs",
    secondaryHref: null,
    secondaryHrefLabel: null,
  };
}

function mapAutoGovernAudit(item: AdminAuditLogItem): WritingEvalAutomationFeedItem {
  const payload = getRecord(item.payload);
  const successCount = getNumber(payload.successCount) ?? 0;
  const failureCount = getNumber(payload.failureCount) ?? 0;
  const executableCount = getNumber(payload.executableCount) ?? 0;
  const skippedCount = getNumber(payload.skippedCount) ?? 0;
  return {
    id: item.id,
    kind: "auto_govern",
    createdAt: item.createdAt,
    title: "自动治理批次",
    summary: `执行 ${successCount}/${executableCount} · 跳过 ${skippedCount}`,
    detail: failureCount > 0 ? `失败 ${failureCount} 条治理动作` : "治理动作已批量执行",
    tone: failureCount > 0 ? "cinnabar" : successCount > 0 ? "emerald" : "stone",
    href: "/admin/writing-eval/insights",
    hrefLabel: "打开 Insights",
    secondaryHref: buildAdminWritingEvalRunsHref(),
    secondaryHrefLabel: "打开 Runs",
  };
}

export async function getWritingEvalAutomationOverview(limit = 36) {
  const [autoFillAudits, autoCandidateAudits, scheduleDispatchAudits, autoCalibrateAudits, autoResolveAudits, autoResolveBatchAudits, autoGovernAudits, rolloutAudits] = await Promise.all([
    getAdminAuditLogs({
      action: "writing_eval_dataset_auto_fill",
      targetType: "writing_eval_dataset",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_auto_candidate_create",
      targetType: "writing_optimization_run",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_schedule_dispatch",
      targetType: "writing_eval_run_schedule",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_scoring_profile_auto_calibrate",
      targetType: "writing_eval_scoring_profile",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_auto_resolve",
      targetType: "writing_optimization_run",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_auto_resolve_batch",
      targetType: "writing_optimization_run",
      limit,
    }),
    getAdminAuditLogs({
      action: "writing_eval_auto_govern_batch",
      targetType: "writing_eval_governance",
      limit,
    }),
    getWritingEvalRolloutAuditLogs(limit),
  ]);

  const rolloutActions = normalizeWritingEvalRolloutAuditLogs(rolloutAudits.combinedRolloutAuditLogs);
  const rolloutFeedItems: WritingEvalAutomationFeedItem[] = rolloutActions.map((item) => ({
    id: item.id,
    kind: "auto_rollout",
    createdAt: item.createdAt,
    title: item.assetRef || item.assetType || "自动放量",
    summary: `${item.directionLabel} · 风险 ${item.riskLevel}`,
    detail: [
      item.reason,
      item.feedbackCount !== null ? `回流 ${item.feedbackCount}` : null,
      item.uniqueUsers !== null ? `用户 ${item.uniqueUsers}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
    tone: item.riskLevel === "cinnabar" ? "cinnabar" : item.direction === "expand" ? "emerald" : item.direction === "shrink" ? "amber" : "stone",
    href: item.assetType && item.assetRef ? buildAdminWritingEvalVersionsHref({ assetType: item.assetType, assetRef: item.assetRef }) : null,
    hrefLabel: item.assetType && item.assetRef ? "打开聚焦账本" : null,
    secondaryHref: item.assetType === "prompt_version" ? buildAdminPromptVersionHref(item.assetRef) : null,
    secondaryHrefLabel: item.assetType === "prompt_version" ? "打开 Prompt" : null,
  }));

  const items = [
    ...autoFillAudits.map(mapAutoFillAudit),
    ...autoCandidateAudits.map(mapAutoCandidateAudit),
    ...scheduleDispatchAudits.map(mapScheduleDispatchAudit),
    ...autoCalibrateAudits.map(mapAutoCalibrateAudit),
    ...autoResolveAudits.map(mapAutoResolveAudit),
    ...autoResolveBatchAudits.map(mapAutoResolveBatchAudit).filter((item): item is WritingEvalAutomationFeedItem => Boolean(item)),
    ...autoGovernAudits.map(mapAutoGovernAudit),
    ...rolloutFeedItems,
  ]
    .sort((left, right) => {
      const timeDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return toneRank(right.tone) - toneRank(left.tone);
    })
    .slice(0, limit);

  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const counts24h = items.reduce(
    (stats, item) => {
      if (new Date(item.createdAt).getTime() < recentCutoff) return stats;
      if (item.kind === "auto_fill") stats.autoFill += 1;
      else if (item.kind === "auto_candidate") stats.autoCandidate += 1;
      else if (item.kind === "schedule_dispatch") stats.scheduleDispatch += 1;
      else if (item.kind === "auto_calibrate") stats.autoCalibrate += 1;
      else if (item.kind === "auto_resolve") stats.autoResolve += 1;
      else if (item.kind === "auto_govern") stats.autoGovern += 1;
      else if (item.kind === "auto_rollout") stats.autoRollout += 1;
      return stats;
    },
    {
      autoFill: 0,
      autoCandidate: 0,
      scheduleDispatch: 0,
      autoCalibrate: 0,
      autoResolve: 0,
      autoGovern: 0,
      autoRollout: 0,
    },
  );

  return {
    items,
    counts24h,
    rolloutActions,
    combinedRolloutAuditLogs: rolloutAudits.combinedRolloutAuditLogs,
  };
}
