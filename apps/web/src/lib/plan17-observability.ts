import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type Plan17RuntimeObservationStatus = "completed" | "failed";
export const PLAN17_RUNTIME_ACCEPTANCE_WINDOW = 50;

type RuntimeObservationRow = {
  group_key: string | null;
  status: string;
  duration_ms: number | null;
  meta_json: string | Record<string, unknown> | null;
  observed_at: string | null;
};

export type Plan17LatencySummary = {
  metricKey: string;
  observationCount: number;
  sampleCount: number;
  completedCount: number;
  failedCount: number;
  avgMs: number | null;
  p95Ms: number | null;
  latestObservedAt: string | null;
};

export type Plan17BatchIsolationSummary = {
  metricKey: string;
  observationCount: number;
  batchCount: number;
  completedItemCount: number;
  failedItemCount: number;
  failureBatchCount: number;
  isolatedFailureBatchCount: number;
  isolationRate: number | null;
  latestObservedAt: string | null;
};

function toRoundedNumber(value: number | null) {
  return value == null || !Number.isFinite(value) ? null : Math.round(value);
}

export function calculatePercentile(values: number[], percentile: number) {
  if (!values.length) {
    return null;
  }
  const normalized = Math.max(0, Math.min(1, percentile));
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * normalized) - 1));
  return sorted[index] ?? null;
}

export function summarizeLatencyObservations(metricKey: string, rows: RuntimeObservationRow[]): Plan17LatencySummary {
  const durations = rows
    .filter((row) => row.status === "completed")
    .map((row) => Number(row.duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgMs = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;

  return {
    metricKey,
    observationCount: rows.length,
    sampleCount: durations.length,
    completedCount: rows.filter((row) => row.status === "completed").length,
    failedCount: rows.filter((row) => row.status === "failed").length,
    avgMs: toRoundedNumber(avgMs),
    p95Ms: toRoundedNumber(calculatePercentile(durations, 0.95)),
    latestObservedAt: rows[0]?.observed_at ?? null,
  };
}

export function summarizeBatchIsolationObservations(metricKey: string, rows: RuntimeObservationRow[]): Plan17BatchIsolationSummary {
  const grouped = new Map<string, { completed: number; failed: number }>();
  let completedItemCount = 0;
  let failedItemCount = 0;

  for (const row of rows) {
    if (!row.group_key) {
      continue;
    }
    const current = grouped.get(row.group_key) ?? { completed: 0, failed: 0 };
    if (row.status === "failed") {
      current.failed += 1;
      failedItemCount += 1;
    } else {
      current.completed += 1;
      completedItemCount += 1;
    }
    grouped.set(row.group_key, current);
  }

  let failureBatchCount = 0;
  let isolatedFailureBatchCount = 0;
  for (const batch of grouped.values()) {
    if (batch.failed > 0) {
      failureBatchCount += 1;
      if (batch.completed > 0) {
        isolatedFailureBatchCount += 1;
      }
    }
  }

  return {
    metricKey,
    observationCount: rows.length,
    batchCount: grouped.size,
    completedItemCount,
    failedItemCount,
    failureBatchCount,
    isolatedFailureBatchCount,
    isolationRate: failureBatchCount > 0 ? Number((isolatedFailureBatchCount / failureBatchCount).toFixed(4)) : null,
    latestObservedAt: rows[0]?.observed_at ?? null,
  };
}

export async function recordPlan17RuntimeObservation(input: {
  metricKey: string;
  groupKey?: string | null;
  userId?: number | null;
  status: Plan17RuntimeObservationStatus;
  durationMs?: number | null;
  meta?: Record<string, unknown>;
  observedAt?: string;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const observedAt = input.observedAt ?? new Date().toISOString();
  await db.exec(
    `INSERT INTO plan17_runtime_observations (metric_key, group_key, user_id, status, duration_ms, meta_json, observed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.metricKey,
      input.groupKey ?? null,
      input.userId ?? null,
      input.status,
      input.durationMs != null && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
      JSON.stringify(input.meta ?? {}),
      observedAt,
      observedAt,
    ],
  );
}

async function getPlan17RuntimeObservations(metricKey: string, limit = PLAN17_RUNTIME_ACCEPTANCE_WINDOW) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return db.query<RuntimeObservationRow>(
    `SELECT group_key, status, duration_ms, meta_json, observed_at
     FROM plan17_runtime_observations
     WHERE metric_key = ?
     ORDER BY observed_at DESC, id DESC`,
    [metricKey],
  ).then((rows) => rows.slice(0, limit));
}

export async function getPlan17LatencySummary(metricKey: string, limit = PLAN17_RUNTIME_ACCEPTANCE_WINDOW) {
  return summarizeLatencyObservations(metricKey, await getPlan17RuntimeObservations(metricKey, limit));
}

export async function getPlan17BatchIsolationSummary(metricKey: string, limit = PLAN17_RUNTIME_ACCEPTANCE_WINDOW) {
  return summarizeBatchIsolationObservations(metricKey, await getPlan17RuntimeObservations(metricKey, limit));
}
