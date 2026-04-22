import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type AiCallObservationStatus = "success" | "retried" | "failed";
export type AiCallObservationMode = "primary" | "fallback" | "shadow";

export type AiCallObservationInput = {
  sceneCode: string;
  model: string;
  provider: string;
  callMode?: AiCallObservationMode;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cacheCreationTokens?: number | null;
  cacheReadTokens?: number | null;
  latencyMs?: number | null;
  status: AiCallObservationStatus;
  errorClass?: string | null;
};

export type AiCallObservationAggregate = {
  label: string;
  provider?: string | null;
  callMode?: AiCallObservationMode | null;
  callCount: number;
  failedCount: number;
  retriedCount: number;
  averageLatencyMs: number | null;
  cacheHitRate: number | null;
  failureRate: number;
};

export type AiCallObservationRecord = {
  id: number;
  sceneCode: string;
  model: string;
  provider: string;
  callMode: AiCallObservationMode;
  status: AiCallObservationStatus;
  errorClass: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  createdAt: string;
};

export type AiCallObservationDashboard = {
  summary: {
    callCount: number;
    failedCount: number;
    retriedCount: number;
    averageLatencyMs: number | null;
    cacheHitRate: number | null;
    failureRate: number;
  };
  byScene: AiCallObservationAggregate[];
  byModel: AiCallObservationAggregate[];
  recentCalls: AiCallObservationRecord[];
};

function normalizeNullableInteger(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : null;
  return parsed == null || !Number.isFinite(parsed) ? null : Math.max(0, Math.round(parsed));
}

function normalizeCount(value: unknown) {
  const normalized = normalizeNullableInteger(value);
  return normalized ?? 0;
}

function normalizeRatio(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

function normalizeCallMode(value: unknown): AiCallObservationMode {
  const normalized = String(value || "").trim();
  return normalized === "fallback" || normalized === "shadow" ? normalized : "primary";
}

function mapAggregateRow(
  row: Record<string, unknown>,
  labelKey: "scene_code" | "model",
  providerKey?: "provider",
  callModeKey?: "call_mode",
): AiCallObservationAggregate {
  const callCount = normalizeCount(row.call_count);
  const failedCount = normalizeCount(row.failed_count);
  const retriedCount = normalizeCount(row.retried_count);
  const averageLatencyMs = normalizeNullableInteger(row.average_latency_ms);
  const cacheReadTokens = normalizeCount(row.cache_read_tokens);
  const totalInputTokens = normalizeCount(row.total_input_tokens);
  return {
    label: String(row[labelKey] || "").trim(),
    provider: providerKey ? String(row[providerKey] || "").trim() || null : null,
    callMode: callModeKey ? normalizeCallMode(row[callModeKey]) : null,
    callCount,
    failedCount,
    retriedCount,
    averageLatencyMs,
    cacheHitRate: normalizeRatio(cacheReadTokens, totalInputTokens),
    failureRate: normalizeRatio(failedCount, callCount) ?? 0,
  };
}

export async function recordAiCallObservation(input: AiCallObservationInput) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO ai_call_observations (
      scene_code, model, provider, call_mode,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
      latency_ms, status, error_class, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(input.sceneCode || "").trim(),
      String(input.model || "").trim(),
      String(input.provider || "").trim(),
      normalizeCallMode(input.callMode),
      normalizeNullableInteger(input.inputTokens),
      normalizeNullableInteger(input.outputTokens),
      normalizeNullableInteger(input.cacheCreationTokens),
      normalizeNullableInteger(input.cacheReadTokens),
      normalizeNullableInteger(input.latencyMs),
      input.status,
      String(input.errorClass || "").trim() || null,
      now,
    ],
  );
}

export async function getAiCallObservationsDashboard(limit = 30): Promise<AiCallObservationDashboard> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const normalizedLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const [summaryRow, sceneRows, modelRows, recentRows] = await Promise.all([
    db.queryOne<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS call_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END) AS retried_count,
         AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) AS average_latency_ms,
         SUM(COALESCE(cache_read_tokens, 0)) AS cache_read_tokens,
         SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)) AS total_input_tokens
       FROM ai_call_observations`,
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         scene_code,
         COUNT(*) AS call_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END) AS retried_count,
         AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) AS average_latency_ms,
         SUM(COALESCE(cache_read_tokens, 0)) AS cache_read_tokens,
         SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)) AS total_input_tokens
       FROM ai_call_observations
       GROUP BY scene_code
       ORDER BY call_count DESC, scene_code ASC`,
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         model,
         provider,
         call_mode,
         COUNT(*) AS call_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
         SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END) AS retried_count,
         AVG(CASE WHEN latency_ms IS NOT NULL THEN latency_ms END) AS average_latency_ms,
         SUM(COALESCE(cache_read_tokens, 0)) AS cache_read_tokens,
         SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)) AS total_input_tokens
       FROM ai_call_observations
       GROUP BY model, provider, call_mode
       ORDER BY call_count DESC, model ASC`,
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         id, scene_code, model, provider, call_mode, status, error_class, latency_ms,
         input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, created_at
       FROM ai_call_observations
       ORDER BY id DESC
       LIMIT ?`,
      [normalizedLimit],
    ),
  ]);

  const summaryCallCount = normalizeCount(summaryRow?.call_count);
  const summaryFailedCount = normalizeCount(summaryRow?.failed_count);
  const summaryRetriedCount = normalizeCount(summaryRow?.retried_count);
  const summaryAverageLatencyMs = normalizeNullableInteger(summaryRow?.average_latency_ms);
  const summaryCacheReadTokens = normalizeCount(summaryRow?.cache_read_tokens);
  const summaryTotalInputTokens = normalizeCount(summaryRow?.total_input_tokens);

  return {
    summary: {
      callCount: summaryCallCount,
      failedCount: summaryFailedCount,
      retriedCount: summaryRetriedCount,
      averageLatencyMs: summaryAverageLatencyMs,
      cacheHitRate: normalizeRatio(summaryCacheReadTokens, summaryTotalInputTokens),
      failureRate: normalizeRatio(summaryFailedCount, summaryCallCount) ?? 0,
    },
    byScene: sceneRows.map((row) => mapAggregateRow(row, "scene_code")),
    byModel: modelRows.map((row) => mapAggregateRow(row, "model", "provider", "call_mode")),
    recentCalls: recentRows.map((row) => ({
      id: normalizeCount(row.id),
      sceneCode: String(row.scene_code || "").trim(),
      model: String(row.model || "").trim(),
      provider: String(row.provider || "").trim(),
      callMode: normalizeCallMode(row.call_mode),
      status: String(row.status || "success").trim() as AiCallObservationStatus,
      errorClass: String(row.error_class || "").trim() || null,
      latencyMs: normalizeNullableInteger(row.latency_ms),
      inputTokens: normalizeNullableInteger(row.input_tokens),
      outputTokens: normalizeNullableInteger(row.output_tokens),
      cacheCreationTokens: normalizeNullableInteger(row.cache_creation_tokens),
      cacheReadTokens: normalizeNullableInteger(row.cache_read_tokens),
      createdAt: String(row.created_at || "").trim(),
    })),
  };
}
