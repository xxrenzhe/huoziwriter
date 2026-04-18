import type { AdminAuditLogItem } from "./audit";

export type WritingEvalRolloutDirection = "expand" | "shrink" | "hold";

export type NormalizedWritingEvalRolloutAuditItem = {
  id: number;
  createdAt: string;
  assetType: string | null;
  assetRef: string | null;
  reason: string | null;
  riskLevel: string;
  direction: WritingEvalRolloutDirection;
  directionLabel: "扩量" | "收缩" | "维持";
  signals: Record<string, unknown>;
  feedbackCount: number | null;
  uniqueUsers: number | null;
  totalHitCount: number | null;
  deltaTotalScore: number | null;
  observedViralScore: number | null;
  openRate: number | null;
  readCompletionRate: number | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getDirection(payload: Record<string, unknown>): WritingEvalRolloutDirection {
  const previousConfig = getRecord(payload.previousConfig);
  const nextConfig = getRecord(payload.nextConfig);
  const previousPercentage = getNumber(previousConfig.rolloutPercentage) ?? 0;
  const nextPercentage = getNumber(nextConfig.rolloutPercentage) ?? 0;
  const previousObserveOnly = Boolean(previousConfig.rolloutObserveOnly);
  const nextObserveOnly = Boolean(nextConfig.rolloutObserveOnly);

  if (nextObserveOnly && !previousObserveOnly) return "shrink";
  if (nextPercentage > previousPercentage) return "expand";
  if (nextPercentage < previousPercentage || (!nextObserveOnly && previousObserveOnly)) return "shrink";
  return "hold";
}

export function getWritingEvalRolloutDirectionLabel(direction: WritingEvalRolloutDirection) {
  if (direction === "expand") return "扩量";
  if (direction === "shrink") return "收缩";
  return "维持";
}

export function normalizeWritingEvalRolloutAuditLog(item: AdminAuditLogItem): NormalizedWritingEvalRolloutAuditItem {
  const payload = getRecord(item.payload);
  const signals = getRecord(payload.signals);
  const direction = getDirection(payload);

  return {
    id: item.id,
    createdAt: item.createdAt,
    assetType:
      item.action === "prompt_rollout_auto_manage"
        ? "prompt_version"
        : String(payload.assetType || "").trim() || null,
    assetRef:
      item.action === "prompt_rollout_auto_manage"
        ? `${String(payload.promptId || "").trim()}@${String(payload.version || "").trim()}`
        : String(payload.assetRef || "").trim() || null,
    reason: String(payload.reason || "").trim() || null,
    riskLevel: String(payload.riskLevel || "").trim() || "stone",
    direction,
    directionLabel: getWritingEvalRolloutDirectionLabel(direction),
    signals,
    feedbackCount: getNumber(signals.feedbackCount),
    uniqueUsers: getNumber(signals.uniqueUsers),
    totalHitCount: getNumber(signals.totalHitCount),
    deltaTotalScore: getNumber(signals.deltaTotalScore),
    observedViralScore: getNumber(signals.observedViralScore),
    openRate: getNumber(signals.openRate),
    readCompletionRate: getNumber(signals.readCompletionRate),
  };
}

export function normalizeWritingEvalRolloutAuditLogs(items: AdminAuditLogItem[]) {
  return items.map(normalizeWritingEvalRolloutAuditLog);
}
