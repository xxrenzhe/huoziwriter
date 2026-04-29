import { getDatabase } from "./db";

type TopicSourceSnapshot = {
  topicSourceId: number;
  ownerUserId?: number | null;
  name: string;
  homepageUrl?: string | null;
  sourceType?: string | null;
  priority?: number | null;
  isActive?: boolean;
  lastFetchedAt?: string | null;
};

type SourceConnectorRow = {
  id: number;
  topic_source_id: number;
  owner_user_id: number | null;
  connector_scope: string | null;
  name: string;
  homepage_url: string | null;
  source_type: string | null;
  priority: number | null;
  is_active: number | boolean;
  status: string | null;
  attempt_count: number | null;
  consecutive_failures: number | null;
  last_error: string | null;
  last_http_status: number | null;
  next_retry_at: string | null;
  health_score: number | null;
  degraded_reason: string | null;
  last_fetched_at: string | null;
};

const CIRCUIT_OPEN_THRESHOLD = 3;

function normalizeSourceType(value: string | null | undefined) {
  const normalized = String(value || "news").trim().toLowerCase();
  if (["youtube", "reddit", "community", "podcast", "spotify", "news", "blog", "rss", "x-hotspot"].includes(normalized)) {
    return normalized;
  }
  return "news";
}

function normalizePriority(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(0, Math.min(999, Math.round(parsed)));
}

function clampHealthScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function resolveConnectorScope(ownerUserId?: number | null) {
  return ownerUserId == null ? "system" : "custom";
}

function buildFailureReason(input: { status: string; failures: number; error: string }) {
  if (input.status === "circuit_open") {
    return `连续 ${input.failures} 次抓取失败，已临时熔断。最近错误：${input.error}`;
  }
  return `最近一次抓取失败：${input.error}`;
}

function computeNextRetryAt(consecutiveFailures: number) {
  const delayMinutes = consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD
    ? Math.min(60, consecutiveFailures * 10)
    : Math.min(15, consecutiveFailures * 5);
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

async function getSourceConnectorByTopicSourceId(topicSourceId: number) {
  const db = getDatabase();
  return db.queryOne<SourceConnectorRow>(
    `SELECT
       id,
       topic_source_id,
       owner_user_id,
       connector_scope,
       name,
       homepage_url,
       source_type,
       priority,
       is_active,
       status,
       attempt_count,
       consecutive_failures,
       last_error,
       last_http_status,
       next_retry_at,
       health_score,
       degraded_reason,
       last_fetched_at
     FROM source_connectors
     WHERE topic_source_id = ?`,
    [topicSourceId],
  );
}

export function parseHttpStatusFromErrorMessage(message: string | null | undefined) {
  const matched = String(message || "").match(/\bHTTP\s+(\d{3})\b/i);
  if (!matched) {
    return null;
  }
  const status = Number(matched[1]);
  return Number.isInteger(status) ? status : null;
}

export async function syncTopicSourceToSourceConnector(input: TopicSourceSnapshot) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await getSourceConnectorByTopicSourceId(input.topicSourceId);
  const lastFetchedAt = input.lastFetchedAt ?? existing?.last_fetched_at ?? null;

  if (!existing) {
    await db.exec(
      `INSERT INTO source_connectors (
        topic_source_id, owner_user_id, connector_scope, name, homepage_url, source_type, priority,
        is_active, status, attempt_count, consecutive_failures, last_error, last_http_status,
        next_retry_at, health_score, degraded_reason, last_fetched_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.topicSourceId,
        input.ownerUserId ?? null,
        resolveConnectorScope(input.ownerUserId),
        input.name,
        input.homepageUrl ?? null,
        normalizeSourceType(input.sourceType),
        normalizePriority(input.priority),
        input.isActive ?? true,
        "healthy",
        0,
        0,
        null,
        null,
        null,
        100,
        null,
        lastFetchedAt,
        now,
        now,
      ],
    );
    return;
  }

  await db.exec(
    `UPDATE source_connectors
     SET owner_user_id = ?, connector_scope = ?, name = ?, homepage_url = ?, source_type = ?, priority = ?,
         is_active = ?, last_fetched_at = ?, updated_at = ?
     WHERE topic_source_id = ?`,
    [
      input.ownerUserId ?? null,
      resolveConnectorScope(input.ownerUserId),
      input.name,
      input.homepageUrl ?? null,
      normalizeSourceType(input.sourceType),
      normalizePriority(input.priority),
      input.isActive ?? Boolean(existing.is_active),
      lastFetchedAt,
      now,
      input.topicSourceId,
    ],
  );
}

export async function syncTopicSourceToSourceConnectorById(topicSourceId: number) {
  const db = getDatabase();
  const source = await db.queryOne<{
    id: number;
    owner_user_id: number | null;
    name: string;
    homepage_url: string | null;
    source_type: string | null;
    priority: number | null;
    is_active: number | boolean;
    last_fetched_at: string | null;
  }>(
    `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
     FROM topic_sources
     WHERE id = ?`,
    [topicSourceId],
  );
  if (!source) {
    return;
  }

  await syncTopicSourceToSourceConnector({
    topicSourceId: source.id,
    ownerUserId: source.owner_user_id,
    name: source.name,
    homepageUrl: source.homepage_url,
    sourceType: source.source_type,
    priority: source.priority,
    isActive: Boolean(source.is_active),
    lastFetchedAt: source.last_fetched_at,
  });
}

export async function syncLegacyTopicSourcesToSourceConnectors() {
  const db = getDatabase();
  const sources = await db.query<{
    id: number;
    owner_user_id: number | null;
    name: string;
    homepage_url: string | null;
    source_type: string | null;
    priority: number | null;
    is_active: number | boolean;
    last_fetched_at: string | null;
  }>(
    `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
     FROM topic_sources
     ORDER BY id ASC`,
  );

  for (const source of sources) {
    await syncTopicSourceToSourceConnector({
      topicSourceId: source.id,
      ownerUserId: source.owner_user_id,
      name: source.name,
      homepageUrl: source.homepage_url,
      sourceType: source.source_type,
      priority: source.priority,
      isActive: Boolean(source.is_active),
      lastFetchedAt: source.last_fetched_at,
    });
  }
}

export async function recordSourceConnectorSyncSuccess(input: {
  topicSourceId: number;
  httpStatus?: number | null;
  lastFetchedAt?: string | null;
}) {
  const db = getDatabase();
  const existing = await getSourceConnectorByTopicSourceId(input.topicSourceId);
  const now = new Date().toISOString();
  const nextHealthScore = clampHealthScore((existing?.health_score ?? 88) + 12);
  await db.exec(
    `UPDATE source_connectors
     SET status = ?, attempt_count = ?, consecutive_failures = ?, last_error = ?, last_http_status = ?,
         next_retry_at = ?, health_score = ?, degraded_reason = ?, last_fetched_at = ?, updated_at = ?
     WHERE topic_source_id = ?`,
    [
      "healthy",
      (existing?.attempt_count ?? 0) + 1,
      0,
      null,
      input.httpStatus ?? 200,
      null,
      nextHealthScore,
      null,
      input.lastFetchedAt ?? existing?.last_fetched_at ?? now,
      now,
      input.topicSourceId,
    ],
  );
}

export async function recordSourceConnectorSyncFailure(input: {
  topicSourceId: number;
  error: string;
  httpStatus?: number | null;
  failedAt?: string | null;
}) {
  const db = getDatabase();
  const existing = await getSourceConnectorByTopicSourceId(input.topicSourceId);
  const consecutiveFailures = (existing?.consecutive_failures ?? 0) + 1;
  const status = consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD ? "circuit_open" : "degraded";
  const healthPenalty = consecutiveFailures >= CIRCUIT_OPEN_THRESHOLD ? 28 : 18;
  const nextHealthScore = clampHealthScore((existing?.health_score ?? 100) - healthPenalty);
  const failedAt = input.failedAt ?? new Date().toISOString();
  await db.exec(
    `UPDATE source_connectors
     SET status = ?, attempt_count = ?, consecutive_failures = ?, last_error = ?, last_http_status = ?,
         next_retry_at = ?, health_score = ?, degraded_reason = ?, updated_at = ?
     WHERE topic_source_id = ?`,
    [
      status,
      (existing?.attempt_count ?? 0) + 1,
      consecutiveFailures,
      input.error,
      input.httpStatus ?? parseHttpStatusFromErrorMessage(input.error),
      computeNextRetryAt(consecutiveFailures),
      nextHealthScore,
      buildFailureReason({ status, failures: consecutiveFailures, error: input.error }),
      failedAt,
      input.topicSourceId,
    ],
  );
}
