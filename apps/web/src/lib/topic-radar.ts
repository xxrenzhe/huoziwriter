import { createHash } from "node:crypto";
import { getDatabase } from "./db";
import { getUserAccessScope } from "./access-scope";
import { fetchExternalText } from "./external-fetch";
import { assertTopicSourceQuota } from "./plan-access";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import {
  recordSourceConnectorSyncFailure,
  recordSourceConnectorSyncSuccess,
  syncTopicSourceToSourceConnectorById,
} from "./source-connectors";

type TopicSourceRow = {
  id: number;
  owner_user_id: number | null;
  name: string;
  homepage_url: string | null;
  source_type: string | null;
  priority: number | null;
  is_active: number | boolean;
  last_fetched_at?: string | null;
  connector_scope?: string | null;
  connector_status?: string | null;
  connector_attempt_count?: number | null;
  connector_consecutive_failures?: number | null;
  connector_last_error?: string | null;
  connector_last_http_status?: number | null;
  connector_next_retry_at?: string | null;
  connector_health_score?: number | null;
  connector_degraded_reason?: string | null;
};

type ParsedTopic = {
  title: string;
  sourceUrl: string | null;
};

type TopicEventSourceRow = {
  id: number;
  owner_user_id: number | null;
  source_name: string;
  source_type: string | null;
  source_priority: number | null;
  title: string;
  summary: string | null;
  emotion_labels_json: string | string[] | null;
  angle_options_json: string | string[] | null;
  source_url: string | null;
  published_at: string | null;
  created_at: string;
};

type TopicEventRow = {
  id: number;
  owner_user_id: number | null;
  source_name: string | null;
  source_type: string | null;
  source_priority: number | null;
  title: string;
  summary: string | null;
  emotion_labels_json: string | string[] | null;
  angle_options_json: string | string[] | null;
  source_url: string | null;
  source_names_json?: string | string[] | null;
  source_urls_json?: string | string[] | null;
  published_at: string | null;
  item_count: number;
};

type TopicSyncRunRow = {
  id: number;
  sync_window_start: string;
  sync_window_label: string;
  status: string;
  scheduled_source_count: number;
  enqueued_job_count: number;
  completed_source_count: number;
  failed_source_count: number;
  inserted_item_count: number;
  last_error: string | null;
  triggered_at: string;
  finished_at: string | null;
  updated_at: string;
};

type TopicFetchJobRow = {
  payload_json: string | null;
};

type TopicSyncSourceResult = {
  sourceId: number;
  sourceName: string;
  inserted: number;
  status: "completed" | "failed";
  error: string | null;
};

type TopicSyncBatchResult = {
  inserted: number;
  completedSourceCount: number;
  failedSourceCount: number;
  failedSources: Array<{ sourceId: number; sourceName: string; error: string }>;
};

function decodeHtml(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function absolutizeUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractTopicsFromHtml(baseUrl: string, html: string) {
  const matches = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
  const topics: ParsedTopic[] = [];
  for (const match of matches) {
    const href = match[1];
    const text = stripHtml(match[2]);
    if (text.length < 12 || text.length > 80) continue;
    if (/登录|注册|下载|APP|关于我们|联系我们|广告|隐私|版权|更多|专题|视频|直播/i.test(text)) continue;
    const sourceUrl = absolutizeUrl(baseUrl, href);
    topics.push({
      title: text,
      sourceUrl,
    });
  }
  if (topics.length === 0) {
    const headingMatches = Array.from(html.matchAll(/<(h1|h2|h3|li)[^>]*>([\s\S]*?)<\/\1>/gi));
    for (const match of headingMatches) {
      const text = stripHtml(match[2]);
      if (text.length < 12 || text.length > 80) continue;
      if (/登录|注册|下载|APP|关于我们|联系我们|广告|隐私|版权|更多|专题|视频|直播/i.test(text)) continue;
      topics.push({
        title: text,
        sourceUrl: baseUrl,
      });
    }
  }
  return topics.filter((topic, index, items) => topic.title && items.findIndex((item) => item.title === topic.title) === index);
}

function pickEmotionLabels(title: string) {
  const labels = new Set<string>();
  if (/(裁员|降薪|亏损|倒闭|收缩|失业|出血|焦虑)/.test(title)) labels.add("行业焦虑");
  if (/(涨价|降价|利润|融资|估值|财富|收入|现金)/.test(title)) labels.add("财富焦虑");
  if (/(AI|模型|大厂|算力|芯片|平台|工具)/i.test(title)) labels.add("技术震荡");
  if (/(监管|争议|反垄断|封禁|事故|问题|风险)/.test(title)) labels.add("冷眼旁观");
  if (labels.size === 0) labels.add("创作危机");
  return Array.from(labels).slice(0, 3);
}

function buildAngleOptions(title: string, labels: string[]) {
  const lead = labels[0] || "行业焦虑";
  return [
    `${lead}不是背景音，它本身就是这条新闻最值得写的切口。`,
    `别急着重复标题，先拆开“${title}”背后的利益变化和叙事漏洞。`,
    `如果把这件事放回长期观察里，真正变化的不是事件，而是判断这件事的坐标。`,
  ];
}

function buildSummary(title: string) {
  return `热点信号：${title}。建议优先关注其中涉及的数据变化、角色关系和叙事转向。`;
}

function clampScore(value: number, max = 100) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value * 100) / 100));
}

function normalizeTopicSourceType(value: string | null | undefined) {
  const normalized = String(value || "news").trim().toLowerCase();
  if (["youtube", "reddit", "x", "podcast", "spotify", "news", "blog", "rss"].includes(normalized)) {
    return normalized;
  }
  return "news";
}

function normalizeTopicSourcePriority(value: number | string | null | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(0, Math.min(999, Math.round(parsed)));
}

function computeHotEventFreshnessScore(latestPublishedAt: string | null | undefined) {
  if (!latestPublishedAt) {
    return 30;
  }
  const diffHours = Math.max(0, (Date.now() - new Date(latestPublishedAt).getTime()) / 3_600_000);
  if (!Number.isFinite(diffHours)) {
    return 30;
  }
  return clampScore(100 - diffHours * 4);
}

function computeHotEventAuthorityScore(priority: number | null | undefined, itemCount: number) {
  const normalizedPriority = normalizeTopicSourcePriority(priority);
  return clampScore(normalizedPriority * 0.7 + Math.min(itemCount, 10) * 3);
}

function computeHotEventPriorityScore(input: { latestPublishedAt: string | null | undefined; primaryPriority: number | null | undefined; itemCount: number }) {
  const freshnessScore = computeHotEventFreshnessScore(input.latestPublishedAt);
  const authorityScore = computeHotEventAuthorityScore(input.primaryPriority, input.itemCount);
  return {
    freshnessScore,
    authorityScore,
    priorityScore: clampScore(freshnessScore * 0.55 + authorityScore * 0.45 + Math.min(input.itemCount, 8) * 1.5),
  };
}

function parseJsonArray(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function normalizeTopicTitleForEvent(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/^[\[【(（].*?[\]】)）]\s*/g, "")
    .replace(/^(快讯|独家|深度|观察|解读|播客|podcast|breaking|update)[:：\s-]*/i, "")
    .replace(/\s+/g, "")
    .replace(/[|｜:：,，。.、!！?？"'“”‘’\-—]/g, "");
}

function buildTopicEventKey(ownerUserId: number | null, title: string) {
  const normalized = normalizeTopicTitleForEvent(title) || title.trim().toLowerCase();
  const scopeKey = ownerUserId == null ? "global" : `user-${ownerUserId}`;
  const digest = createHash("sha1").update(`${scopeKey}:${normalized}`).digest("hex").slice(0, 24);
  return `${scopeKey}:${digest}`;
}

async function getTopicEventSourceRows(ownerUserId?: number | null) {
  const db = getDatabase();
  if (ownerUserId == null) {
    return db.query<TopicEventSourceRow>(
      `SELECT
         ti.id,
         ti.owner_user_id,
         ti.source_name,
         ts.source_type,
         ts.priority AS source_priority,
         ti.title,
         ti.summary,
         ti.emotion_labels_json,
         ti.angle_options_json,
         ti.source_url,
         ti.published_at,
         ti.created_at
       FROM topic_items ti
       LEFT JOIN topic_sources ts
         ON ts.name = ti.source_name
        AND ts.owner_user_id IS NULL
       WHERE ti.owner_user_id IS NULL
       ORDER BY ti.published_at DESC, ti.id DESC`,
    );
  }

  return db.query<TopicEventSourceRow>(
    `SELECT
       ti.id,
       ti.owner_user_id,
       ti.source_name,
       ts.source_type,
       ts.priority AS source_priority,
       ti.title,
       ti.summary,
       ti.emotion_labels_json,
       ti.angle_options_json,
       ti.source_url,
       ti.published_at,
       ti.created_at
     FROM topic_items ti
     LEFT JOIN topic_sources ts
       ON ts.name = ti.source_name
      AND ts.owner_user_id = ti.owner_user_id
     WHERE ti.owner_user_id = ?
     ORDER BY ti.published_at DESC, ti.id DESC`,
    [ownerUserId],
  );
}

function compareTopicEventSourceRows(left: TopicEventSourceRow, right: TopicEventSourceRow) {
  const leftPriority = normalizeTopicSourcePriority(left.source_priority);
  const rightPriority = normalizeTopicSourcePriority(right.source_priority);
  if (rightPriority !== leftPriority) {
    return rightPriority - leftPriority;
  }
  const leftPublishedAt = new Date(left.published_at || left.created_at).getTime();
  const rightPublishedAt = new Date(right.published_at || right.created_at).getTime();
  if (rightPublishedAt !== leftPublishedAt) {
    return rightPublishedAt - leftPublishedAt;
  }
  return right.id - left.id;
}

export async function rebuildTopicEvents(options?: { ownerUserId?: number | null }) {
  await ensureExtendedProductSchema();
  const ownerUserId = options?.ownerUserId ?? null;
  const db = getDatabase();
  const rows = await getTopicEventSourceRows(ownerUserId);
  const groups = new Map<string, TopicEventSourceRow[]>();

  for (const row of rows) {
    const normalizedTitle = normalizeTopicTitleForEvent(row.title);
    if (!normalizedTitle) {
      continue;
    }
    const eventKey = buildTopicEventKey(ownerUserId, row.title);
    const current = groups.get(eventKey) ?? [];
    current.push(row);
    groups.set(eventKey, current);
  }

  if (ownerUserId == null) {
    await db.exec("DELETE FROM topic_events WHERE owner_user_id IS NULL");
    await db.exec("DELETE FROM hot_event_evidence_items WHERE owner_user_id IS NULL");
    await db.exec("DELETE FROM hot_event_clusters WHERE owner_user_id IS NULL");
  } else {
    await db.exec("DELETE FROM topic_events WHERE owner_user_id = ?", [ownerUserId]);
    await db.exec("DELETE FROM hot_event_evidence_items WHERE owner_user_id = ?", [ownerUserId]);
    await db.exec("DELETE FROM hot_event_clusters WHERE owner_user_id = ?", [ownerUserId]);
  }

  const now = new Date().toISOString();
  for (const [eventKey, groupedRows] of groups.entries()) {
    const primary = [...groupedRows].sort(compareTopicEventSourceRows)[0];
    const emotionLabels = Array.from(
      new Set(groupedRows.flatMap((row) => parseJsonArray(row.emotion_labels_json).map((item) => item.trim()).filter(Boolean))),
    ).slice(0, 6);
    const angleOptions = Array.from(
      new Set(groupedRows.flatMap((row) => parseJsonArray(row.angle_options_json).map((item) => item.trim()).filter(Boolean))),
    ).slice(0, 8);
    const sourceNames = Array.from(new Set(groupedRows.map((row) => row.source_name).filter(Boolean))).slice(0, 12) as string[];
    const sourceUrls = Array.from(new Set(groupedRows.map((row) => row.source_url).filter(Boolean))).slice(0, 12) as string[];
    const publishedTimes = groupedRows
      .map((row) => row.published_at)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    const createdTimes = groupedRows
      .map((row) => row.created_at)
      .map((value) => new Date(value).getTime())
      .filter((value) => Number.isFinite(value));
    const latestPublishedAt =
      publishedTimes.length > 0 ? new Date(Math.max(...publishedTimes)).toISOString() : primary.published_at || primary.created_at;
    const firstSeenAt = createdTimes.length > 0 ? new Date(Math.min(...createdTimes)).toISOString() : primary.created_at;
    const lastSeenAt = createdTimes.length > 0 ? new Date(Math.max(...createdTimes)).toISOString() : primary.created_at;
    const normalizedTitle = normalizeTopicTitleForEvent(primary.title);
    const primarySourceType = normalizeTopicSourceType(primary.source_type);
    const primarySourcePriority = normalizeTopicSourcePriority(primary.source_priority);
    const scoring = computeHotEventPriorityScore({
      latestPublishedAt,
      primaryPriority: primarySourcePriority,
      itemCount: groupedRows.length,
    });
    const emotionPayload = JSON.stringify(emotionLabels.length > 0 ? emotionLabels : pickEmotionLabels(primary.title));
    const anglePayload = JSON.stringify(angleOptions.length > 0 ? angleOptions : buildAngleOptions(primary.title, emotionLabels));
    const sourceNamesPayload = JSON.stringify(sourceNames);
    const sourceUrlsPayload = JSON.stringify(sourceUrls);

    await db.exec(
      `INSERT INTO topic_events (
        event_key, owner_user_id, canonical_title, summary, emotion_labels_json, angle_options_json,
        primary_source_name, primary_source_type, primary_source_priority, primary_source_url,
        source_names_json, source_urls_json, item_count, first_seen_at, last_seen_at, latest_published_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventKey,
        ownerUserId,
        primary.title,
        primary.summary || buildSummary(primary.title),
        emotionPayload,
        anglePayload,
        primary.source_name,
        primarySourceType,
        primarySourcePriority,
        primary.source_url,
        sourceNamesPayload,
        sourceUrlsPayload,
        groupedRows.length,
        firstSeenAt,
        lastSeenAt,
        latestPublishedAt,
        now,
        now,
      ],
    );

    await db.exec(
      `INSERT INTO hot_event_clusters (
        cluster_key, owner_user_id, canonical_title, normalized_title, summary, emotion_labels_json, angle_options_json,
        primary_source_name, primary_source_type, primary_source_priority, primary_source_url,
        source_names_json, source_urls_json, item_count, freshness_score, authority_score, priority_score,
        first_seen_at, last_seen_at, latest_published_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventKey,
        ownerUserId,
        primary.title,
        normalizedTitle,
        primary.summary || buildSummary(primary.title),
        emotionPayload,
        anglePayload,
        primary.source_name,
        primarySourceType,
        primarySourcePriority,
        primary.source_url,
        sourceNamesPayload,
        sourceUrlsPayload,
        groupedRows.length,
        scoring.freshnessScore,
        scoring.authorityScore,
        scoring.priorityScore,
        firstSeenAt,
        lastSeenAt,
        latestPublishedAt,
        now,
        now,
      ],
    );

    for (const row of groupedRows) {
      await db.exec(
        `INSERT INTO hot_event_evidence_items (
          cluster_key, owner_user_id, topic_item_id, source_name, source_type, source_priority,
          title, summary, source_url, published_at, captured_at, evidence_payload_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventKey,
          ownerUserId,
          row.id,
          row.source_name,
          normalizeTopicSourceType(row.source_type),
          normalizeTopicSourcePriority(row.source_priority),
          row.title,
          row.summary || buildSummary(row.title),
          row.source_url,
          row.published_at || row.created_at,
          row.created_at,
          JSON.stringify({
            emotionLabels: parseJsonArray(row.emotion_labels_json),
            angleOptions: parseJsonArray(row.angle_options_json),
            sourceName: row.source_name,
          }),
          now,
          now,
        ],
      );
    }
  }

  return {
    rebuilt: groups.size,
    ownerUserId,
  };
}

async function ensureTopicEvents(ownerUserId?: number | null) {
  const db = getDatabase();
  const latestItem =
    ownerUserId == null
      ? await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(created_at) as latest_at FROM topic_items WHERE owner_user_id IS NULL",
        )
      : await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(created_at) as latest_at FROM topic_items WHERE owner_user_id = ?",
          [ownerUserId],
        );
  const latestEvent =
    ownerUserId == null
      ? await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(updated_at) as latest_at FROM topic_events WHERE owner_user_id IS NULL",
        )
      : await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(updated_at) as latest_at FROM topic_events WHERE owner_user_id = ?",
          [ownerUserId],
        );
  const latestCluster =
    ownerUserId == null
      ? await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(updated_at) as latest_at FROM hot_event_clusters WHERE owner_user_id IS NULL",
        )
      : await db.queryOne<{ latest_at: string | null }>(
          "SELECT MAX(updated_at) as latest_at FROM hot_event_clusters WHERE owner_user_id = ?",
          [ownerUserId],
        );

  if (!latestItem?.latest_at) {
    return;
  }
  if (
    !latestEvent?.latest_at ||
    !latestCluster?.latest_at ||
    new Date(latestEvent.latest_at).getTime() < new Date(latestItem.latest_at).getTime() ||
    new Date(latestCluster.latest_at).getTime() < new Date(latestItem.latest_at).getTime()
  ) {
    await rebuildTopicEvents({ ownerUserId: ownerUserId ?? null });
  }
}

export async function getVisibleTopicEvents(userId: number) {
  await ensureExtendedProductSchema();
  await ensureDefaultTopics();
  await ensureTopicEvents(null);
  await ensureTopicEvents(userId);

  const db = getDatabase();
  return db.query<TopicEventRow>(
    `SELECT
       id,
       owner_user_id,
       primary_source_name as source_name,
       primary_source_type as source_type,
       primary_source_priority as source_priority,
       canonical_title as title,
       summary,
       emotion_labels_json,
       angle_options_json,
       primary_source_url as source_url,
       source_names_json,
       source_urls_json,
       latest_published_at as published_at,
       item_count
     FROM hot_event_clusters
     WHERE owner_user_id IS NULL OR owner_user_id = ?
     ORDER BY priority_score DESC, latest_published_at DESC, item_count DESC, id DESC`,
    [userId],
  );
}

async function getTopicSources(userId?: number) {
  const db = getDatabase();
  if (!userId) {
    return db.query<TopicSourceRow>(
      `SELECT
         ts.*,
         sc.connector_scope,
         sc.status as connector_status,
         sc.attempt_count as connector_attempt_count,
         sc.consecutive_failures as connector_consecutive_failures,
         sc.last_error as connector_last_error,
         sc.last_http_status as connector_last_http_status,
         sc.next_retry_at as connector_next_retry_at,
         sc.health_score as connector_health_score,
         sc.degraded_reason as connector_degraded_reason
       FROM topic_sources ts
       LEFT JOIN source_connectors sc ON sc.topic_source_id = ts.id
       WHERE ts.is_active = ? AND ts.owner_user_id IS NULL
       ORDER BY ts.priority DESC, ts.id ASC`,
      [true],
    );
  }

  const scope = await getUserAccessScope(userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  return db.query<TopicSourceRow>(
    `SELECT
       ts.*,
       sc.connector_scope,
       sc.status as connector_status,
       sc.attempt_count as connector_attempt_count,
       sc.consecutive_failures as connector_consecutive_failures,
       sc.last_error as connector_last_error,
       sc.last_http_status as connector_last_http_status,
       sc.next_retry_at as connector_next_retry_at,
       sc.health_score as connector_health_score,
       sc.degraded_reason as connector_degraded_reason
     FROM topic_sources ts
     LEFT JOIN source_connectors sc ON sc.topic_source_id = ts.id
     WHERE ts.is_active = ? AND (ts.owner_user_id IS NULL OR ts.owner_user_id IN (${placeholders}))
     ORDER BY ts.priority DESC, ts.owner_user_id ASC, ts.id ASC`,
    [true, ...scope.userIds],
  );
}

async function createManualTopicSyncRun(label: string, scheduledSourceCount: number, syncWindowStart?: string) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO topic_sync_runs (
      sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
      completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [syncWindowStart ?? now, label, "running", scheduledSourceCount, scheduledSourceCount, 0, 0, 0, null, now, null, now, now],
  );
  const runId = Number(result.lastInsertRowid || 0);
  const run = await db.queryOne<TopicSyncRunRow>(
    `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
            completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, updated_at
     FROM topic_sync_runs
     WHERE id = ?`,
    [runId],
  );
  if (!run) {
    throw new Error("热点同步记录创建失败");
  }
  return run;
}

async function getLatestTopicSyncRunByLabel(label: string) {
  const db = getDatabase();
  return db.queryOne<TopicSyncRunRow>(
    `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
            completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, updated_at
     FROM topic_sync_runs
     WHERE sync_window_label = ?
     ORDER BY id DESC
     LIMIT 1`,
    [label],
  );
}

async function getTopicSyncRunByWindowStart(syncWindowStart: string) {
  const db = getDatabase();
  return db.queryOne<TopicSyncRunRow>(
    `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
            completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, updated_at
     FROM topic_sync_runs
     WHERE sync_window_start = ?
     ORDER BY id DESC
     LIMIT 1`,
    [syncWindowStart],
  );
}

function getShanghaiDateParts(value: Date) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(value);
  const record = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return {
    year: String(record.year || new Date().getFullYear()),
    month: String(record.month || "01"),
    day: String(record.day || "01"),
    hour: Number(record.hour || "0"),
  };
}

function resolveScheduledTopicSyncWindow(options?: { triggeredAt?: Date; windowHour?: number }) {
  const triggeredAt = options?.triggeredAt ?? new Date();
  const parts = getShanghaiDateParts(triggeredAt);
  const windowHour = options?.windowHour === 18 ? 18 : options?.windowHour === 6 ? 6 : parts.hour >= 12 ? 18 : 6;
  const hourLabel = String(windowHour).padStart(2, "0");
  return {
    windowHour,
    syncWindowStart: `${parts.year}-${parts.month}-${parts.day}T${hourLabel}:00:00+08:00`,
    windowLabel: `定时触发热点同步 · 北京时间 ${parts.year}-${parts.month}-${parts.day} ${hourLabel}:00`,
  };
}

async function getTopicSyncRunById(runId: number) {
  const db = getDatabase();
  return db.queryOne<TopicSyncRunRow>(
    `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
            completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, updated_at
     FROM topic_sync_runs
     WHERE id = ?`,
    [runId],
  );
}

async function completeManualTopicSyncRun(input: { runId: number; scheduledSourceCount: number; insertedItemCount: number }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE topic_sync_runs
     SET status = ?, completed_source_count = ?, failed_source_count = ?, inserted_item_count = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
    ["completed", input.scheduledSourceCount, 0, input.insertedItemCount, now, now, input.runId],
  );
}

async function failManualTopicSyncRun(input: { runId: number; lastError: string; scheduledSourceCount: number }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE topic_sync_runs
     SET status = ?, completed_source_count = ?, failed_source_count = ?, last_error = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
    ["failed", 0, input.scheduledSourceCount, input.lastError.slice(0, 400), now, now, input.runId],
  );
}

async function finalizeTopicSyncRun(input: {
  runId: number;
  scheduledSourceCount: number;
  completedSourceCount: number;
  failedSourceCount: number;
  insertedItemCount: number;
  lastError?: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const status =
    input.failedSourceCount <= 0
      ? "completed"
      : input.completedSourceCount > 0 || input.insertedItemCount > 0
        ? "partial_failed"
        : "failed";
  await db.exec(
    `UPDATE topic_sync_runs
     SET status = ?, completed_source_count = ?, failed_source_count = ?, inserted_item_count = ?, last_error = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      status,
      input.completedSourceCount,
      input.failedSourceCount,
      input.insertedItemCount,
      input.lastError ? input.lastError.slice(0, 400) : null,
      now,
      now,
      input.runId,
    ],
  );
}

function summarizeTopicSyncFailure(errors: Array<{ sourceName: string; error: string }>) {
  if (errors.length === 0) return null;
  return errors
    .slice(0, 3)
    .map((item) => `${item.sourceName}: ${item.error}`)
    .join("；");
}

async function hasRecentTopic(sourceName: string, title: string, ownerUserId?: number | null) {
  const db = getDatabase();
  const row =
    ownerUserId == null
      ? await db.queryOne<{ id: number }>(
          "SELECT id FROM topic_items WHERE source_name = ? AND title = ? AND owner_user_id IS NULL ORDER BY id DESC LIMIT 1",
          [sourceName, title],
        )
      : await db.queryOne<{ id: number }>(
          "SELECT id FROM topic_items WHERE source_name = ? AND title = ? AND owner_user_id = ? ORDER BY id DESC LIMIT 1",
          [sourceName, title, ownerUserId],
        );
  return Boolean(row);
}

async function insertTopicItem(input: {
  ownerUserId?: number | null;
  sourceName: string;
  title: string;
  summary: string;
  emotionLabels: string[];
  angleOptions: string[];
  sourceUrl: string | null;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO topic_items (
      owner_user_id, source_name, title, summary, emotion_labels_json, angle_options_json, source_url, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.ownerUserId ?? null,
      input.sourceName,
      input.title,
      input.summary,
      input.emotionLabels,
      input.angleOptions,
      input.sourceUrl,
      now,
      now,
    ],
  );
}

async function fetchSourceTopics(source: TopicSourceRow) {
  if (!source.homepage_url) return [] as ParsedTopic[];
  const response = await fetchExternalText({
    url: source.homepage_url,
    timeoutMs: 20_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  return extractTopicsFromHtml(response.finalUrl || source.homepage_url, response.text).slice(0, 8);
}

async function getRetryableFailedSourceIdsForRun(run: TopicSyncRunRow) {
  const db = getDatabase();
  const failedJobs = await db.query<TopicFetchJobRow>(
    `SELECT payload_json
     FROM job_queue
     WHERE job_type = ? AND status = ? AND payload_json LIKE ?
     ORDER BY id DESC`,
    ["topicFetch", "failed", `%${run.sync_window_start}%`],
  );

  return Array.from(
    new Set(
      failedJobs
        .map((job) => {
          if (!job.payload_json) {
            return null;
          }
          try {
            const payload = JSON.parse(job.payload_json) as {
              topicSyncWindowStart?: string;
              sourceId?: number | string;
            };
            if (String(payload.topicSyncWindowStart || "") !== run.sync_window_start) {
              return null;
            }
            const sourceId = Number(payload.sourceId);
            return Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null;
          } catch {
            return null;
          }
        })
        .filter((sourceId): sourceId is number => typeof sourceId === "number" && sourceId > 0),
    ),
  );
}

async function syncTopicItemsForSource(source: TopicSourceRow, limitPerSource: number) {
  const db = getDatabase();
  const safeLimit = Math.max(0, Number(limitPerSource) || 0);
  if (safeLimit === 0) {
    return 0;
  }
  const topics = await fetchSourceTopics(source);
  let inserted = 0;
  for (const topic of topics.slice(0, safeLimit)) {
    if (await hasRecentTopic(source.name, topic.title, source.owner_user_id)) {
      continue;
    }
    const emotionLabels = pickEmotionLabels(topic.title);
    await insertTopicItem({
      ownerUserId: source.owner_user_id,
      sourceName: source.name,
      title: topic.title,
      summary: buildSummary(topic.title),
      emotionLabels,
      angleOptions: buildAngleOptions(topic.title, emotionLabels),
      sourceUrl: topic.sourceUrl,
    });
    inserted += 1;
  }
  const fetchedAt = new Date().toISOString();
  await db.exec(
    `UPDATE topic_sources
     SET last_fetched_at = ?, updated_at = ?
     WHERE id = ?`,
    [fetchedAt, fetchedAt, source.id],
  );
  await recordSourceConnectorSyncSuccess({
    topicSourceId: source.id,
    httpStatus: 200,
    lastFetchedAt: fetchedAt,
  });
  return inserted;
}

async function createTopicFetchJob(input: {
  source: TopicSourceRow;
  limitPerSource: number;
  runId?: number;
  syncWindowStart?: string | null;
  syncWindowLabel?: string | null;
  triggerKind?: string;
}) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const payload = {
    sourceId: input.source.id,
    sourceName: input.source.name,
    sourceType: input.source.source_type ?? "news",
    ownerUserId: input.source.owner_user_id ?? null,
    homepageUrl: input.source.homepage_url ?? null,
    limitPerSource: input.limitPerSource,
    topicSyncRunId: input.runId ?? null,
    topicSyncWindowStart: input.syncWindowStart ?? null,
    topicSyncWindowLabel: input.syncWindowLabel ?? null,
    triggerKind: input.triggerKind ?? "manual",
    createdAt: now,
  };
  const result = await db.exec(
    `INSERT INTO job_queue (job_type, status, payload_json, run_at, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["topicFetch", "queued", payload, now, 0, now, now],
  );
  return {
    jobId: Number(result.lastInsertRowid || 0),
    payload,
  };
}

async function updateTopicFetchJob(input: {
  jobId: number;
  status: "running" | "completed" | "failed";
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string | null;
}) {
  const db = getDatabase();
  await db.exec(
    `UPDATE job_queue
     SET status = ?, payload_json = ?, attempts = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
    [input.status, input.payload, input.attempts, input.lastError ?? null, new Date().toISOString(), input.jobId],
  );
}

async function syncTrackedTopicSource(input: {
  source: TopicSourceRow;
  limitPerSource: number;
  runId?: number;
  syncWindowStart?: string | null;
  syncWindowLabel?: string | null;
  triggerKind?: string;
}): Promise<TopicSyncSourceResult> {
  const tracked = await createTopicFetchJob(input);
  const runningPayload = {
    ...tracked.payload,
    startedAt: new Date().toISOString(),
  };
  await updateTopicFetchJob({
    jobId: tracked.jobId,
    status: "running",
    payload: runningPayload,
    attempts: 1,
  });

  try {
    const inserted = await syncTopicItemsForSource(input.source, input.limitPerSource);
    const completedPayload = {
      ...runningPayload,
      insertedItemCount: inserted,
      completedAt: new Date().toISOString(),
    };
    await updateTopicFetchJob({
      jobId: tracked.jobId,
      status: "completed",
      payload: completedPayload,
      attempts: 1,
    });
    return {
      sourceId: input.source.id,
      sourceName: input.source.name,
      inserted,
      status: "completed",
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "热点抓取失败";
    try {
      await recordSourceConnectorSyncFailure({
        topicSourceId: input.source.id,
        error: message,
        failedAt: new Date().toISOString(),
      });
    } catch {
      // 保持原始抓取错误优先，健康状态写回失败不覆盖抓取结果。
    }
    const failedPayload = {
      ...runningPayload,
      failedAt: new Date().toISOString(),
      failedReason: message,
    };
    await updateTopicFetchJob({
      jobId: tracked.jobId,
      status: "failed",
      payload: failedPayload,
      attempts: 1,
      lastError: message,
    });
    return {
      sourceId: input.source.id,
      sourceName: input.source.name,
      inserted: 0,
      status: "failed",
      error: message,
    };
  }
}

async function syncTopicSourcesBatch(input: {
  sources: TopicSourceRow[];
  limitPerSource: number;
  ownerUserId?: number | null;
  runId?: number;
  syncWindowStart?: string | null;
  syncWindowLabel?: string | null;
  triggerKind?: string;
}) {
  let inserted = 0;
  let completedSourceCount = 0;
  let failedSourceCount = 0;
  const failedSources: Array<{ sourceId: number; sourceName: string; error: string }> = [];

  for (const source of input.sources) {
    const result = await syncTrackedTopicSource({
      source,
      limitPerSource: input.limitPerSource,
      runId: input.runId,
      syncWindowStart: input.syncWindowStart,
      syncWindowLabel: input.syncWindowLabel,
      triggerKind: input.triggerKind,
    });
    inserted += result.inserted;
    if (result.status === "completed") {
      completedSourceCount += 1;
    } else {
      failedSourceCount += 1;
      failedSources.push({
        sourceId: result.sourceId,
        sourceName: result.sourceName,
        error: result.error || "热点抓取失败",
      });
    }
  }

  await rebuildTopicEvents({ ownerUserId: input.ownerUserId ?? null });

  return {
    inserted,
    completedSourceCount,
    failedSourceCount,
    failedSources,
  } satisfies TopicSyncBatchResult;
}

export async function syncTopicRadar(options?: { userId?: number; limitPerSource?: number }) {
  const sources = await getTopicSources(options?.userId);
  const result = await syncTopicSourcesBatch({
    sources,
    limitPerSource: options?.limitPerSource ?? 4,
    ownerUserId: options?.userId ?? null,
    triggerKind: options?.userId ? "user_scope" : "direct",
  });
  return {
    inserted: result.inserted,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
  };
}

export async function runAdminTopicSync(options?: { limitPerSource?: number }) {
  await ensureExtendedProductSchema();
  const sources = await getTopicSources();
  const run = await createManualTopicSyncRun("手动触发热点同步", sources.length);
  const result = await syncTopicSourcesBatch({
    sources,
    limitPerSource: options?.limitPerSource ?? 4,
    ownerUserId: null,
    runId: run.id,
    syncWindowStart: run.sync_window_start,
    syncWindowLabel: run.sync_window_label,
    triggerKind: "admin_manual",
  });
  await finalizeTopicSyncRun({
    runId: run.id,
    scheduledSourceCount: sources.length,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    insertedItemCount: result.inserted,
    lastError: summarizeTopicSyncFailure(result.failedSources),
  });
  return {
    runId: run.id,
    inserted: result.inserted,
    scheduledSourceCount: sources.length,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    status: result.failedSourceCount > 0 ? (result.completedSourceCount > 0 ? "partial_failed" : "failed") : "completed",
  };
}

export async function runScheduledTopicSync(options?: {
  limitPerSource?: number;
  triggeredAt?: Date;
  windowHour?: number;
  force?: boolean;
}) {
  await ensureExtendedProductSchema();
  const sources = await getTopicSources();
  const window = resolveScheduledTopicSyncWindow({
    triggeredAt: options?.triggeredAt,
    windowHour: options?.windowHour,
  });
  const existing = await getTopicSyncRunByWindowStart(window.syncWindowStart)
    ?? await getLatestTopicSyncRunByLabel(window.windowLabel);
  if (existing) {
    if (!options?.force && ["running", "completed"].includes(existing.status)) {
      return {
        skipped: true,
        reason: "already_triggered_for_window",
        runId: existing.id,
        inserted: existing.inserted_item_count,
        scheduledSourceCount: existing.scheduled_source_count,
        windowLabel: window.windowLabel,
        syncWindowStart: existing.sync_window_start,
      };
    }
    if (options?.force) {
      return {
        skipped: false,
        reason: "reused_existing_window",
        runId: existing.id,
        inserted: existing.inserted_item_count,
        scheduledSourceCount: existing.scheduled_source_count,
        completedSourceCount: existing.completed_source_count,
        failedSourceCount: existing.failed_source_count,
        status: existing.status,
        windowLabel: window.windowLabel,
        syncWindowStart: existing.sync_window_start,
      };
    }
  }

  const run = await createManualTopicSyncRun(window.windowLabel, sources.length, window.syncWindowStart);
  const result = await syncTopicSourcesBatch({
    sources,
    limitPerSource: options?.limitPerSource ?? 4,
    ownerUserId: null,
    runId: run.id,
    syncWindowStart: window.syncWindowStart,
    syncWindowLabel: window.windowLabel,
    triggerKind: "scheduler",
  });
  await finalizeTopicSyncRun({
    runId: run.id,
    scheduledSourceCount: sources.length,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    insertedItemCount: result.inserted,
    lastError: summarizeTopicSyncFailure(result.failedSources),
  });
  return {
    skipped: false,
    runId: run.id,
    inserted: result.inserted,
    scheduledSourceCount: sources.length,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    status: result.failedSourceCount > 0 ? (result.completedSourceCount > 0 ? "partial_failed" : "failed") : "completed",
    windowLabel: window.windowLabel,
    syncWindowStart: window.syncWindowStart,
  };
}

export async function runAdminTopicSourceSync(input: { sourceId: number; limitPerSource?: number }) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const source = await db.queryOne<TopicSourceRow>(
    `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
     FROM topic_sources
     WHERE id = ? AND owner_user_id IS NULL`,
    [input.sourceId],
  );
  if (!source) {
    throw new Error("系统信息源不存在");
  }
  if (!Boolean(source.is_active)) {
    throw new Error("当前系统信息源已停用，请先启用后再重抓");
  }
  const run = await createManualTopicSyncRun(`手动重抓 · ${source.name}`, 1);
  const result = await syncTopicSourcesBatch({
    sources: [source],
    limitPerSource: input.limitPerSource ?? 4,
    ownerUserId: null,
    runId: run.id,
    syncWindowStart: run.sync_window_start,
    syncWindowLabel: run.sync_window_label,
    triggerKind: "admin_source_sync",
  });
  await finalizeTopicSyncRun({
    runId: run.id,
    scheduledSourceCount: 1,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    insertedItemCount: result.inserted,
    lastError: summarizeTopicSyncFailure(result.failedSources),
  });
  return {
    runId: run.id,
    inserted: result.inserted,
    sourceId: source.id,
    sourceName: source.name,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    status: result.failedSourceCount > 0 ? "failed" : "completed",
  };
}

export async function retryAdminTopicSyncRun(input: { runId: number; limitPerSource?: number }) {
  await ensureExtendedProductSchema();
  const run = await getTopicSyncRunById(input.runId);
  if (!run) {
    throw new Error("热点同步窗口不存在");
  }
  if (!["failed", "partial_failed"].includes(run.status) || (run.failed_source_count ?? 0) <= 0) {
    throw new Error("当前同步窗口没有可重试的失败源");
  }

  const failedSourceIds = await getRetryableFailedSourceIdsForRun(run);
  if (failedSourceIds.length === 0) {
    throw new Error("当前同步窗口缺少可重试的失败源记录，请先检查 job_queue 中的 topicFetch 失败任务");
  }

  const db = getDatabase();
  const placeholders = failedSourceIds.map(() => "?").join(", ");
  const sources = await db.query<TopicSourceRow>(
    `SELECT id, owner_user_id, name, homepage_url, source_type, priority, is_active, last_fetched_at
     FROM topic_sources
     WHERE owner_user_id IS NULL AND is_active = ? AND id IN (${placeholders})
     ORDER BY priority DESC, id ASC`,
    [true, ...failedSourceIds],
  );
  if (sources.length === 0) {
    throw new Error("失败窗口对应的系统源当前不可用，无法重试");
  }

  const retryRun = await createManualTopicSyncRun(`失败窗口重试 · ${run.sync_window_label}`, sources.length);
  const result = await syncTopicSourcesBatch({
    sources,
    limitPerSource: input.limitPerSource ?? 4,
    ownerUserId: null,
    runId: retryRun.id,
    syncWindowStart: retryRun.sync_window_start,
    syncWindowLabel: retryRun.sync_window_label,
    triggerKind: "admin_retry",
  });
  await finalizeTopicSyncRun({
    runId: retryRun.id,
    scheduledSourceCount: sources.length,
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    insertedItemCount: result.inserted,
    lastError: summarizeTopicSyncFailure(result.failedSources),
  });
  return {
    runId: retryRun.id,
    retryOfRunId: run.id,
    retriedSourceCount: sources.length,
    inserted: result.inserted,
    sourceNames: sources.map((source) => source.name),
    completedSourceCount: result.completedSourceCount,
    failedSourceCount: result.failedSourceCount,
    status: result.failedSourceCount > 0 ? (result.completedSourceCount > 0 ? "partial_failed" : "failed") : "completed",
  };
}

export async function ensureDefaultTopics() {
  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM topic_items");
  if ((count?.count ?? 0) > 0) {
    const latest = await db.queryOne<{ created_at: string }>("SELECT created_at FROM topic_items ORDER BY id DESC LIMIT 1");
    const latestAt = latest?.created_at ? new Date(latest.created_at).getTime() : 0;
    if (Date.now() - latestAt < 60 * 60 * 1000) {
      return;
    }
  }
  await syncTopicRadar({ limitPerSource: 4 });
}

export async function getVisibleTopicSources(userId: number) {
  return getTopicSources(userId);
}

export async function createTopicSource(input: {
  userId: number;
  name: string;
  homepageUrl: string;
  sourceType?: string | null;
  priority?: number | string | null;
}) {
  await assertTopicSourceQuota(input.userId);
  const db = getDatabase();
  const scope = await getUserAccessScope(input.userId);
  const now = new Date().toISOString();
  const normalizedName = input.name.trim();
  const normalizedUrl = input.homepageUrl.trim();
  const sourceType = normalizeTopicSourceType(input.sourceType);
  const priority = normalizeTopicSourcePriority(input.priority);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  const existingVisible = await db.queryOne<{ id: number; owner_user_id: number | null }>(
    `SELECT id, owner_user_id
     FROM topic_sources
     WHERE name = ?
       AND (
         owner_user_id IS NULL
         OR owner_user_id IN (${placeholders})
       )
     ORDER BY owner_user_id ASC, id ASC
     LIMIT 1`,
    [normalizedName, ...scope.userIds],
  );
  if (existingVisible) {
    if (existingVisible.owner_user_id == null) {
      throw new Error("系统信息源里已经存在同名来源，请直接复用，不要重复创建");
    }
    throw new Error("你已经创建过同名信息源");
  }

  await db.exec(
    `INSERT INTO topic_sources (owner_user_id, name, homepage_url, source_type, priority, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.userId, normalizedName, normalizedUrl, sourceType, priority, true, now, now],
  );
  const created = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM topic_sources
     WHERE owner_user_id = ? AND name = ?
     ORDER BY id DESC
     LIMIT 1`,
    [input.userId, normalizedName],
  );
  if (created) {
    await syncTopicSourceToSourceConnectorById(created.id);
  }
  await syncTopicRadar({ userId: input.userId, limitPerSource: 4 });
}

export async function disableTopicSource(input: { userId: number; sourceId: number }) {
  const db = getDatabase();
  const scope = await getUserAccessScope(input.userId);
  const placeholders = scope.userIds.map(() => "?").join(", ");
  await db.exec(
    `UPDATE topic_sources
     SET is_active = ?, updated_at = ?
     WHERE id = ? AND owner_user_id IN (${placeholders})`,
    [false, new Date().toISOString(), input.sourceId, ...scope.userIds],
  );
  await syncTopicSourceToSourceConnectorById(input.sourceId);
}

export async function updateTopicSource(input: {
  userId: number;
  sourceId: number;
  sourceType?: string | null;
  priority?: number | string | null;
}) {
  const db = getDatabase();
  const existing = await db.queryOne<{
    id: number;
    source_type: string | null;
    priority: number | null;
  }>("SELECT id, source_type, priority FROM topic_sources WHERE id = ? AND owner_user_id = ?", [input.sourceId, input.userId]);
  if (!existing) {
    throw new Error("信息源不存在");
  }
  const nextSourceType = input.sourceType === undefined ? normalizeTopicSourceType(existing.source_type) : normalizeTopicSourceType(input.sourceType);
  const nextPriority = input.priority === undefined ? normalizeTopicSourcePriority(existing.priority) : normalizeTopicSourcePriority(input.priority);
  await db.exec(
    `UPDATE topic_sources
     SET source_type = ?, priority = ?, updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    [nextSourceType, nextPriority, new Date().toISOString(), input.sourceId, input.userId],
  );
  await syncTopicSourceToSourceConnectorById(input.sourceId);
  await syncTopicRadar({ userId: input.userId, limitPerSource: 4 });
}

export async function getAdminTopicSources() {
  const db = getDatabase();
  return db.query<{
    id: number;
    owner_user_id: number | null;
    name: string;
    homepage_url: string | null;
    source_type: string | null;
    priority: number | null;
    is_active: number | boolean;
    last_fetched_at: string | null;
    created_at: string;
    updated_at: string;
    connector_scope?: string | null;
    connector_status?: string | null;
    connector_attempt_count?: number | null;
    connector_consecutive_failures?: number | null;
    connector_last_error?: string | null;
    connector_last_http_status?: number | null;
    connector_next_retry_at?: string | null;
    connector_health_score?: number | null;
    connector_degraded_reason?: string | null;
  }>(
    `SELECT
       ts.id,
       ts.owner_user_id,
       ts.name,
       ts.homepage_url,
       ts.source_type,
       ts.priority,
       ts.is_active,
       ts.last_fetched_at,
       ts.created_at,
       ts.updated_at,
       sc.connector_scope,
       sc.status as connector_status,
       sc.attempt_count as connector_attempt_count,
       sc.consecutive_failures as connector_consecutive_failures,
       sc.last_error as connector_last_error,
       sc.last_http_status as connector_last_http_status,
       sc.next_retry_at as connector_next_retry_at,
       sc.health_score as connector_health_score,
       sc.degraded_reason as connector_degraded_reason
     FROM topic_sources ts
     LEFT JOIN source_connectors sc ON sc.topic_source_id = ts.id
     WHERE ts.owner_user_id IS NULL
     ORDER BY ts.priority DESC, ts.is_active DESC, ts.id ASC`,
  );
}

export async function createAdminTopicSource(input: { name: string; homepageUrl: string; sourceType?: string; priority?: number | string | null }) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const normalizedName = input.name.trim();
  const normalizedUrl = input.homepageUrl.trim();
  const sourceType = normalizeTopicSourceType(input.sourceType);
  const priority = normalizeTopicSourcePriority(input.priority);
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM topic_sources
     WHERE owner_user_id IS NULL AND name = ?
     LIMIT 1`,
    [normalizedName],
  );
  if (existing) {
    throw new Error("系统默认信息源里已经存在同名来源");
  }
  await db.exec(
    `INSERT INTO topic_sources (owner_user_id, name, homepage_url, source_type, priority, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [null, normalizedName, normalizedUrl, sourceType, priority, true, now, now],
  );
  const created = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM topic_sources
     WHERE owner_user_id IS NULL AND name = ?
     ORDER BY id DESC
     LIMIT 1`,
    [normalizedName],
  );
  if (created) {
    await syncTopicSourceToSourceConnectorById(created.id);
  }
  await syncTopicRadar({ limitPerSource: 4 });
}

export async function updateAdminTopicSource(input: {
  sourceId: number;
  isActive?: boolean;
  sourceType?: string | null;
  priority?: number | string | null;
}) {
  const db = getDatabase();
  const existing = await db.queryOne<{
    id: number;
    is_active: number | boolean;
    source_type: string | null;
    priority: number | null;
  }>("SELECT id, is_active, source_type, priority FROM topic_sources WHERE id = ? AND owner_user_id IS NULL", [input.sourceId]);
  if (!existing) {
    throw new Error("系统信息源不存在");
  }
  const nextIsActive = input.isActive === undefined ? Boolean(existing.is_active) : input.isActive;
  const nextSourceType = input.sourceType === undefined ? normalizeTopicSourceType(existing.source_type) : normalizeTopicSourceType(input.sourceType);
  const nextPriority = input.priority === undefined ? normalizeTopicSourcePriority(existing.priority) : normalizeTopicSourcePriority(input.priority);
  await db.exec(
    `UPDATE topic_sources
     SET is_active = ?, source_type = ?, priority = ?, updated_at = ?
     WHERE id = ? AND owner_user_id IS NULL`,
    [nextIsActive, nextSourceType, nextPriority, new Date().toISOString(), input.sourceId],
  );
  await syncTopicSourceToSourceConnectorById(input.sourceId);
}
