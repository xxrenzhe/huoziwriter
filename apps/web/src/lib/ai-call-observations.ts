import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type AiCallObservationStatus = "success" | "retried" | "failed";
export type AiCallObservationMode = "primary" | "fallback" | "shadow";

export type AiCallObservationInput = {
  sceneCode: string;
  articleId?: number | null;
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
  articleId: number | null;
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

export type PromptCacheArticleObservation = {
  articleId: number;
  callCount: number;
  sceneCoverage: string[];
  totalInputTokens: number;
  totalCacheReadTokens: number;
  firstDeepWriteCacheReadTokens: number | null;
  secondDeepWriteCacheReadTokens: number | null;
  maxDeepWriteCacheReadTokens: number | null;
  latestObservedAt: string;
};

export type PromptCacheAcceptanceReport = {
  articleCoverage: {
    articleCount: number;
    sixStepCandidateArticleCount: number;
    items: PromptCacheArticleObservation[];
  };
  deepWriteRepeat: {
    status: "passed" | "partial" | "blocked";
    threshold: number;
    repeatedArticleCount: number;
    passedArticleCount: number;
    bestArticleId: number | null;
    bestCacheReadTokens: number | null;
  };
};

function normalizeNullableInteger(value: unknown) {
  const parsed = typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : null;
  return parsed == null || !Number.isFinite(parsed) ? null : Math.max(0, Math.round(parsed));
}

function normalizeNullablePositiveInteger(value: unknown) {
  const normalized = normalizeNullableInteger(value);
  return normalized != null && normalized > 0 ? normalized : null;
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

type AiCallObservationRollupDelta = {
  callCount: number;
  failedCount: number;
  retriedCount: number;
  latencyTotalMs: number;
  latencySampleCount: number;
  cacheReadTokens: number;
  totalInputTokens: number;
};

const SUMMARY_BUCKET_KEY = "all";

function buildRollupDelta(input: AiCallObservationInput): AiCallObservationRollupDelta {
  const inputTokens = normalizeCount(input.inputTokens);
  const cacheCreationTokens = normalizeCount(input.cacheCreationTokens);
  const cacheReadTokens = normalizeCount(input.cacheReadTokens);
  const latencyMs = normalizeNullableInteger(input.latencyMs);
  return {
    callCount: 1,
    failedCount: input.status === "failed" ? 1 : 0,
    retriedCount: input.status === "retried" ? 1 : 0,
    latencyTotalMs: latencyMs ?? 0,
    latencySampleCount: latencyMs == null ? 0 : 1,
    cacheReadTokens,
    totalInputTokens: inputTokens + cacheCreationTokens + cacheReadTokens,
  };
}

async function upsertSummaryRollup(delta: AiCallObservationRollupDelta, updatedAt: string) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO ai_call_observation_summary_stats (
      bucket_key, call_count, failed_count, retried_count,
      latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      call_count = ai_call_observation_summary_stats.call_count + excluded.call_count,
      failed_count = ai_call_observation_summary_stats.failed_count + excluded.failed_count,
      retried_count = ai_call_observation_summary_stats.retried_count + excluded.retried_count,
      latency_total_ms = ai_call_observation_summary_stats.latency_total_ms + excluded.latency_total_ms,
      latency_sample_count = ai_call_observation_summary_stats.latency_sample_count + excluded.latency_sample_count,
      cache_read_tokens = ai_call_observation_summary_stats.cache_read_tokens + excluded.cache_read_tokens,
      total_input_tokens = ai_call_observation_summary_stats.total_input_tokens + excluded.total_input_tokens,
      updated_at = excluded.updated_at`,
    [
      SUMMARY_BUCKET_KEY,
      delta.callCount,
      delta.failedCount,
      delta.retriedCount,
      delta.latencyTotalMs,
      delta.latencySampleCount,
      delta.cacheReadTokens,
      delta.totalInputTokens,
      updatedAt,
    ],
  );
}

async function upsertSceneRollup(sceneCode: string, delta: AiCallObservationRollupDelta, updatedAt: string) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO ai_call_observation_scene_stats (
      scene_code, call_count, failed_count, retried_count,
      latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scene_code) DO UPDATE SET
      call_count = ai_call_observation_scene_stats.call_count + excluded.call_count,
      failed_count = ai_call_observation_scene_stats.failed_count + excluded.failed_count,
      retried_count = ai_call_observation_scene_stats.retried_count + excluded.retried_count,
      latency_total_ms = ai_call_observation_scene_stats.latency_total_ms + excluded.latency_total_ms,
      latency_sample_count = ai_call_observation_scene_stats.latency_sample_count + excluded.latency_sample_count,
      cache_read_tokens = ai_call_observation_scene_stats.cache_read_tokens + excluded.cache_read_tokens,
      total_input_tokens = ai_call_observation_scene_stats.total_input_tokens + excluded.total_input_tokens,
      updated_at = excluded.updated_at`,
    [
      sceneCode,
      delta.callCount,
      delta.failedCount,
      delta.retriedCount,
      delta.latencyTotalMs,
      delta.latencySampleCount,
      delta.cacheReadTokens,
      delta.totalInputTokens,
      updatedAt,
    ],
  );
}

async function upsertModelRollup(
  model: string,
  provider: string,
  callMode: AiCallObservationMode,
  delta: AiCallObservationRollupDelta,
  updatedAt: string,
) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO ai_call_observation_model_stats (
      model, provider, call_mode, call_count, failed_count, retried_count,
      latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model, provider, call_mode) DO UPDATE SET
      call_count = ai_call_observation_model_stats.call_count + excluded.call_count,
      failed_count = ai_call_observation_model_stats.failed_count + excluded.failed_count,
      retried_count = ai_call_observation_model_stats.retried_count + excluded.retried_count,
      latency_total_ms = ai_call_observation_model_stats.latency_total_ms + excluded.latency_total_ms,
      latency_sample_count = ai_call_observation_model_stats.latency_sample_count + excluded.latency_sample_count,
      cache_read_tokens = ai_call_observation_model_stats.cache_read_tokens + excluded.cache_read_tokens,
      total_input_tokens = ai_call_observation_model_stats.total_input_tokens + excluded.total_input_tokens,
      updated_at = excluded.updated_at`,
    [
      model,
      provider,
      callMode,
      delta.callCount,
      delta.failedCount,
      delta.retriedCount,
      delta.latencyTotalMs,
      delta.latencySampleCount,
      delta.cacheReadTokens,
      delta.totalInputTokens,
      updatedAt,
    ],
  );
}

export async function rebuildAiCallObservationRollups() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const updatedAt = new Date().toISOString();

  await db.transaction(async () => {
    await db.exec("DELETE FROM ai_call_observation_summary_stats");
    await db.exec("DELETE FROM ai_call_observation_scene_stats");
    await db.exec("DELETE FROM ai_call_observation_model_stats");

    await db.exec(
      `INSERT INTO ai_call_observation_summary_stats (
        bucket_key, call_count, failed_count, retried_count,
        latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
      )
      SELECT
        ?, COUNT(*),
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN latency_ms ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN 1 ELSE 0 END),
        SUM(COALESCE(cache_read_tokens, 0)),
        SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)),
        ?
      FROM ai_call_observations
      HAVING COUNT(*) > 0`,
      [SUMMARY_BUCKET_KEY, updatedAt],
    );

    await db.exec(
      `INSERT INTO ai_call_observation_scene_stats (
        scene_code, call_count, failed_count, retried_count,
        latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
      )
      SELECT
        scene_code, COUNT(*),
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN latency_ms ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN 1 ELSE 0 END),
        SUM(COALESCE(cache_read_tokens, 0)),
        SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)),
        ?
      FROM ai_call_observations
      GROUP BY scene_code`,
      [updatedAt],
    );

    await db.exec(
      `INSERT INTO ai_call_observation_model_stats (
        model, provider, call_mode, call_count, failed_count, retried_count,
        latency_total_ms, latency_sample_count, cache_read_tokens, total_input_tokens, updated_at
      )
      SELECT
        model, provider, COALESCE(call_mode, 'primary'), COUNT(*),
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'retried' THEN 1 ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN latency_ms ELSE 0 END),
        SUM(CASE WHEN latency_ms IS NOT NULL THEN 1 ELSE 0 END),
        SUM(COALESCE(cache_read_tokens, 0)),
        SUM(COALESCE(input_tokens, 0) + COALESCE(cache_creation_tokens, 0) + COALESCE(cache_read_tokens, 0)),
        ?
      FROM ai_call_observations
      GROUP BY model, provider, COALESCE(call_mode, 'primary')`,
      [updatedAt],
    );
  });
}

async function ensureAiCallObservationRollups() {
  const db = getDatabase();
  const [summaryRow, baseCountRow] = await Promise.all([
    db.queryOne<{ call_count: number }>(
      "SELECT call_count FROM ai_call_observation_summary_stats WHERE bucket_key = ? LIMIT 1",
      [SUMMARY_BUCKET_KEY],
    ),
    db.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM ai_call_observations"),
  ]);
  if (!summaryRow && normalizeCount(baseCountRow?.count) > 0) {
    await rebuildAiCallObservationRollups();
  }
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
  const averageLatencyMs = normalizeCount(row.latency_sample_count) > 0
    ? Math.round(normalizeCount(row.latency_total_ms) / normalizeCount(row.latency_sample_count))
    : null;
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
  const sceneCode = String(input.sceneCode || "").trim();
  const model = String(input.model || "").trim();
  const provider = String(input.provider || "").trim();
  const callMode = normalizeCallMode(input.callMode);
  const delta = buildRollupDelta(input);

  await db.transaction(async () => {
    await db.exec(
      `INSERT INTO ai_call_observations (
        scene_code, article_id, model, provider, call_mode,
        input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
        latency_ms, status, error_class, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sceneCode,
        normalizeNullablePositiveInteger(input.articleId),
        model,
        provider,
        callMode,
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
    await upsertSummaryRollup(delta, now);
    await upsertSceneRollup(sceneCode, delta, now);
    await upsertModelRollup(model, provider, callMode, delta, now);
  });
}

export async function getAiCallObservationsDashboard(limit = 30): Promise<AiCallObservationDashboard> {
  await ensureExtendedProductSchema();
  await ensureAiCallObservationRollups();
  const db = getDatabase();
  const normalizedLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const [summaryRow, sceneRows, modelRows, recentRows] = await Promise.all([
    db.queryOne<Record<string, unknown>>(
      `SELECT
         call_count,
         failed_count,
         retried_count,
         latency_total_ms,
         latency_sample_count,
         cache_read_tokens,
         total_input_tokens
       FROM ai_call_observation_summary_stats
       WHERE bucket_key = ?`,
      [SUMMARY_BUCKET_KEY],
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         scene_code,
         call_count,
         failed_count,
         retried_count,
         latency_total_ms,
         latency_sample_count,
         cache_read_tokens,
         total_input_tokens
       FROM ai_call_observation_scene_stats
       ORDER BY call_count DESC, scene_code ASC`,
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         model,
         provider,
         call_mode,
         call_count,
         failed_count,
         retried_count,
         latency_total_ms,
         latency_sample_count,
         cache_read_tokens,
         total_input_tokens
       FROM ai_call_observation_model_stats
       ORDER BY call_count DESC, model ASC`,
    ),
    db.query<Record<string, unknown>>(
      `SELECT
         id, scene_code, article_id, model, provider, call_mode, status, error_class, latency_ms,
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
  const summaryAverageLatencyMs = normalizeCount(summaryRow?.latency_sample_count) > 0
    ? Math.round(normalizeCount(summaryRow?.latency_total_ms) / normalizeCount(summaryRow?.latency_sample_count))
    : null;
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
      articleId: normalizeNullablePositiveInteger(row.article_id),
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

export async function getPromptCacheAcceptanceReport(limit = 12): Promise<PromptCacheAcceptanceReport> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const normalizedLimit = Math.max(1, Math.min(100, Math.round(limit)));
  const rows = await db.query<Record<string, unknown>>(
    `SELECT
       article_id,
       scene_code,
       input_tokens,
       cache_creation_tokens,
       cache_read_tokens,
       created_at,
       id
     FROM ai_call_observations
     WHERE article_id IS NOT NULL
     ORDER BY article_id ASC, created_at ASC, id ASC`,
  );

  const grouped = new Map<number, PromptCacheArticleObservation>();
  const deepWriteCacheReads = new Map<number, number[]>();

  for (const row of rows) {
    const articleId = normalizeNullablePositiveInteger(row.article_id);
    if (articleId == null) {
      continue;
    }
    const sceneCode = String(row.scene_code || "").trim();
    const inputTokens = normalizeCount(row.input_tokens);
    const cacheCreationTokens = normalizeCount(row.cache_creation_tokens);
    const cacheReadTokens = normalizeCount(row.cache_read_tokens);
    const createdAt = String(row.created_at || "").trim();

    const existing = grouped.get(articleId) ?? {
      articleId,
      callCount: 0,
      sceneCoverage: [],
      totalInputTokens: 0,
      totalCacheReadTokens: 0,
      firstDeepWriteCacheReadTokens: null,
      secondDeepWriteCacheReadTokens: null,
      maxDeepWriteCacheReadTokens: null,
      latestObservedAt: createdAt,
    };

    existing.callCount += 1;
    existing.totalInputTokens += inputTokens + cacheCreationTokens + cacheReadTokens;
    existing.totalCacheReadTokens += cacheReadTokens;
    existing.latestObservedAt = existing.latestObservedAt > createdAt ? existing.latestObservedAt : createdAt;
    if (sceneCode && !existing.sceneCoverage.includes(sceneCode)) {
      existing.sceneCoverage.push(sceneCode);
      existing.sceneCoverage.sort((left, right) => left.localeCompare(right));
    }

    if (sceneCode === "deepWrite") {
      const values = deepWriteCacheReads.get(articleId) ?? [];
      values.push(cacheReadTokens);
      deepWriteCacheReads.set(articleId, values);
    }

    grouped.set(articleId, existing);
  }

  const threshold = 8000;
  const items = Array.from(grouped.values())
    .map((item) => {
      const deepWriteValues = deepWriteCacheReads.get(item.articleId) ?? [];
      return {
        ...item,
        firstDeepWriteCacheReadTokens: deepWriteValues[0] ?? null,
        secondDeepWriteCacheReadTokens: deepWriteValues[1] ?? null,
        maxDeepWriteCacheReadTokens: deepWriteValues.length ? Math.max(...deepWriteValues) : null,
      } satisfies PromptCacheArticleObservation;
    })
    .sort((left, right) => {
      if (right.totalCacheReadTokens !== left.totalCacheReadTokens) {
        return right.totalCacheReadTokens - left.totalCacheReadTokens;
      }
      return right.articleId - left.articleId;
    });

  const repeatedItems = items.filter((item) => item.secondDeepWriteCacheReadTokens != null);
  const passedItems = repeatedItems.filter((item) => (item.secondDeepWriteCacheReadTokens ?? 0) >= threshold);
  const bestItem = items.reduce<PromptCacheArticleObservation | null>((best, item) => {
    if (best == null) {
      return item;
    }
    return (item.maxDeepWriteCacheReadTokens ?? -1) > (best.maxDeepWriteCacheReadTokens ?? -1) ? item : best;
  }, null);

  return {
    articleCoverage: {
      articleCount: items.length,
      sixStepCandidateArticleCount: items.filter((item) => item.sceneCoverage.length >= 6).length,
      items: items.slice(0, normalizedLimit),
    },
    deepWriteRepeat: {
      status: passedItems.length > 0 ? "passed" : repeatedItems.length > 0 ? "partial" : "blocked",
      threshold,
      repeatedArticleCount: repeatedItems.length,
      passedArticleCount: passedItems.length,
      bestArticleId: bestItem?.articleId ?? null,
      bestCacheReadTokens: bestItem?.maxDeepWriteCacheReadTokens ?? null,
    },
  };
}
