import { buildFourPointAudit } from "./article-strategy";
import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { recordPlan17RuntimeObservation } from "./plan17-observability";
import { getUserPlanContext, consumeDailyGenerationQuota } from "./plan-access";
import { createArticle, upsertArticleStrategyCard } from "./repositories";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import { getSeries, getSeriesById, resolveArticleSeriesId } from "./series";
import { buildFallbackStrategyCardAutoDraft, generateStrategyCardAutoDraft, type StrategyCardAutoDraft } from "./strategy-card-auto-draft";
import { adoptTopicLeadToBacklogItem, getTopicLeadById } from "./topic-leads";

export type TopicBacklogSourceType = "manual" | "excel" | "ai-generated" | "from-radar" | "from-fission";
export type TopicBacklogFissionMode = "regularity" | "contrast" | "cross-domain";
export type TopicBacklogItemStatus = "draft" | "ready" | "queued" | "generated" | "discarded";
export type TopicBacklogArchetype = "opinion" | "case" | "howto" | "hotTake" | "phenomenon";

type TopicBacklogRow = {
  id: number;
  user_id: number;
  series_id: number | null;
  name: string;
  description: string | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

type TopicBacklogItemRow = {
  id: number;
  backlog_id: number;
  user_id: number;
  topic_lead_id: number | null;
  source_type: string;
  fission_mode: string | null;
  theme: string;
  archetype: string | null;
  evidence_refs_json: string | string[] | null;
  strategy_draft_json: string | Record<string, unknown> | null;
  target_audience: string | null;
  reader_snapshot_hint: string | null;
  status: string;
  generated_article_id: number | null;
  generated_batch_id: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TopicBacklogItem = {
  id: number;
  backlogId: number;
  userId: number;
  topicLeadId: number | null;
  sourceType: TopicBacklogSourceType;
  fissionMode: TopicBacklogFissionMode | null;
  theme: string;
  archetype: TopicBacklogArchetype | null;
  evidenceRefs: string[];
  strategyDraft: Record<string, unknown> | null;
  targetAudience: string | null;
  readerSnapshotHint: string | null;
  status: TopicBacklogItemStatus;
  generatedArticleId: number | null;
  generatedBatchId: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TopicBacklogGenerationJob = {
  itemId: number;
  jobId: number;
  status: "queued";
};

type TopicBacklogBulkImportItemInput = {
  topicLeadId?: unknown;
  sourceType?: unknown;
  fissionMode?: unknown;
  theme?: unknown;
  archetype?: unknown;
  evidenceRefs?: unknown;
  strategyDraft?: Record<string, unknown> | null;
  targetAudience?: unknown;
  readerSnapshotHint?: unknown;
  status?: unknown;
};

export type TopicBacklog = {
  id: number;
  userId: number;
  seriesId: number | null;
  seriesName: string | null;
  name: string;
  description: string | null;
  itemCount: number;
  lastGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: TopicBacklogItem[];
};

const BULK_IMPORT_THEME_HEADERS = new Set(["theme", "主题", "选题", "标题", "topic"]);
const BULK_IMPORT_ARCHETYPE_HEADERS = new Set(["archetype", "主题原型", "原型", "题型"]);
const BULK_IMPORT_TARGET_AUDIENCE_HEADERS = new Set(["targetaudience", "目标读者", "读者", "受众"]);
const BULK_IMPORT_READER_HINT_HEADERS = new Set(["readersnapshothint", "读者快照", "选题描述", "描述", "场景"]);
const BULK_IMPORT_CORE_ASSERTION_HEADERS = new Set(["coreassertion", "核心判断", "核心观点"]);
const BULK_IMPORT_WHY_NOW_HEADERS = new Set(["whynow", "为何现在值得写", "为什么现在", "why now"]);
const BULK_IMPORT_MAINSTREAM_BELIEF_HEADERS = new Set(["mainstreambelief", "主流看法", "大众共识"]);
const BULK_IMPORT_STATUS_HEADERS = new Set(["status", "状态"]);
const BULK_IMPORT_SOURCE_TYPE_HEADERS = new Set(["sourcetype", "来源类型"]);

const TOPIC_BACKLOG_BATCH_LIMITS = {
  free: 2,
  pro: 5,
  ultra: 10,
} as const;

function parseJsonArray(value: unknown) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeBulkHeader(value: string) {
  return value.replace(/\s+/g, "").replace(/[_-]/g, "").toLowerCase();
}

function splitBulkLine(line: string) {
  if (line.includes("\t")) {
    return line.split("\t").map((cell) => cell.trim());
  }
  if (line.includes(",")) {
    return line.split(",").map((cell) => cell.trim());
  }
  return [line.trim()];
}

function isLikelyBulkHeader(row: string[]) {
  return row.some((cell) => {
    const normalized = normalizeBulkHeader(cell);
    return (
      BULK_IMPORT_THEME_HEADERS.has(normalized)
      || BULK_IMPORT_ARCHETYPE_HEADERS.has(normalized)
      || BULK_IMPORT_TARGET_AUDIENCE_HEADERS.has(normalized)
      || BULK_IMPORT_READER_HINT_HEADERS.has(normalized)
      || BULK_IMPORT_CORE_ASSERTION_HEADERS.has(normalized)
      || BULK_IMPORT_WHY_NOW_HEADERS.has(normalized)
      || BULK_IMPORT_MAINSTREAM_BELIEF_HEADERS.has(normalized)
      || BULK_IMPORT_STATUS_HEADERS.has(normalized)
      || BULK_IMPORT_SOURCE_TYPE_HEADERS.has(normalized)
    );
  });
}

function parseBulkTabularText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [] as TopicBacklogBulkImportItemInput[];
  }

  const rows = lines.map(splitBulkLine).filter((row) => row.some(Boolean));
  if (rows.length === 0) {
    return [] as TopicBacklogBulkImportItemInput[];
  }

  const firstRow = rows[0] ?? [];
  if (!isLikelyBulkHeader(firstRow)) {
    return lines.map<TopicBacklogBulkImportItemInput>((line) => ({
      theme: line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)、]\s*/, "").trim(),
      sourceType: "excel",
      status: "draft",
    })).filter((item) => String(item.theme || "").trim());
  }

  const headerMap = new Map<number, string>();
  firstRow.forEach((cell, index) => {
    const normalized = normalizeBulkHeader(cell);
    if (BULK_IMPORT_THEME_HEADERS.has(normalized)) {
      headerMap.set(index, "theme");
    } else if (BULK_IMPORT_ARCHETYPE_HEADERS.has(normalized)) {
      headerMap.set(index, "archetype");
    } else if (BULK_IMPORT_TARGET_AUDIENCE_HEADERS.has(normalized)) {
      headerMap.set(index, "targetAudience");
    } else if (BULK_IMPORT_READER_HINT_HEADERS.has(normalized)) {
      headerMap.set(index, "readerSnapshotHint");
    } else if (BULK_IMPORT_CORE_ASSERTION_HEADERS.has(normalized)) {
      headerMap.set(index, "coreAssertion");
    } else if (BULK_IMPORT_WHY_NOW_HEADERS.has(normalized)) {
      headerMap.set(index, "whyNow");
    } else if (BULK_IMPORT_MAINSTREAM_BELIEF_HEADERS.has(normalized)) {
      headerMap.set(index, "mainstreamBelief");
    } else if (BULK_IMPORT_STATUS_HEADERS.has(normalized)) {
      headerMap.set(index, "status");
    } else if (BULK_IMPORT_SOURCE_TYPE_HEADERS.has(normalized)) {
      headerMap.set(index, "sourceType");
    }
  });

  return rows.slice(1).map<TopicBacklogBulkImportItemInput>((row) => {
    const draft: Record<string, unknown> = {};
    row.forEach((cell, index) => {
      const field = headerMap.get(index);
      if (!field) return;
      draft[field] = cell.trim();
    });
    return {
      theme: draft.theme,
      archetype: draft.archetype,
      targetAudience: draft.targetAudience,
      readerSnapshotHint: draft.readerSnapshotHint,
      sourceType: draft.sourceType || "excel",
      status: draft.status || "draft",
      strategyDraft: buildStrategyDraft({
        coreAssertion: draft.coreAssertion,
        whyNow: draft.whyNow,
        mainstreamBelief: draft.mainstreamBelief,
        targetReader: draft.targetAudience,
      }),
    } satisfies TopicBacklogBulkImportItemInput;
  }).filter((item) => String(item.theme || "").trim());
}

function normalizeSourceType(value: unknown): TopicBacklogSourceType {
  if (value === "excel" || value === "ai-generated" || value === "from-radar" || value === "from-fission") {
    return value;
  }
  return "manual";
}

function normalizeFissionMode(value: unknown): TopicBacklogFissionMode | null {
  if (value === "regularity" || value === "contrast" || value === "cross-domain") {
    return value;
  }
  return null;
}

function normalizeItemStatus(value: unknown): TopicBacklogItemStatus {
  if (value === "ready" || value === "queued" || value === "generated" || value === "discarded") {
    return value;
  }
  return "draft";
}

function normalizeArchetype(value: unknown): TopicBacklogArchetype | null {
  if (value === "opinion" || value === "case" || value === "howto" || value === "hotTake" || value === "phenomenon") {
    return value;
  }
  return null;
}

function mapTopicBacklogItem(row: TopicBacklogItemRow): TopicBacklogItem {
  return {
    id: row.id,
    backlogId: row.backlog_id,
    userId: row.user_id,
    topicLeadId: row.topic_lead_id,
    sourceType: normalizeSourceType(row.source_type),
    fissionMode: normalizeFissionMode(row.fission_mode),
    theme: row.theme,
    archetype: normalizeArchetype(row.archetype),
    evidenceRefs: parseJsonArray(row.evidence_refs_json),
    strategyDraft: parseJsonRecord(row.strategy_draft_json),
    targetAudience: row.target_audience,
    readerSnapshotHint: row.reader_snapshot_hint,
    status: normalizeItemStatus(row.status),
    generatedArticleId: row.generated_article_id,
    generatedBatchId: row.generated_batch_id,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveOptionalSeriesId(userId: number, seriesId: unknown) {
  if (seriesId == null || seriesId === "") {
    return null;
  }
  const normalizedId = Number(seriesId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new Error("绑定系列无效");
  }
  const matched = await getSeriesById(userId, normalizedId);
  if (!matched) {
    throw new Error("绑定系列不存在");
  }
  return matched.id;
}

async function getTopicBacklogRow(userId: number, backlogId: number) {
  const db = getDatabase();
  return db.queryOne<TopicBacklogRow>(
    `SELECT id, user_id, series_id, name, description, last_generated_at, created_at, updated_at
     FROM topic_backlogs
     WHERE id = ? AND user_id = ?`,
    [backlogId, userId],
  );
}

async function getTopicBacklogItemRow(userId: number, backlogId: number, itemId: number) {
  const db = getDatabase();
  return db.queryOne<TopicBacklogItemRow>(
    `SELECT id, backlog_id, user_id, topic_lead_id, source_type, fission_mode, theme, archetype, evidence_refs_json, strategy_draft_json,
            target_audience, reader_snapshot_hint, status, generated_article_id, generated_batch_id, generated_at, created_at, updated_at
     FROM topic_backlog_items
     WHERE id = ? AND backlog_id = ? AND user_id = ?`,
    [itemId, backlogId, userId],
  );
}

export async function getTopicBacklogs(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [backlogRows, itemRows, series] = await Promise.all([
    db.query<TopicBacklogRow>(
      `SELECT id, user_id, series_id, name, description, last_generated_at, created_at, updated_at
       FROM topic_backlogs
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [userId],
    ),
    db.query<TopicBacklogItemRow>(
      `SELECT id, backlog_id, user_id, topic_lead_id, source_type, fission_mode, theme, archetype, evidence_refs_json, strategy_draft_json,
              target_audience, reader_snapshot_hint, status, generated_article_id, generated_batch_id, generated_at, created_at, updated_at
       FROM topic_backlog_items
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [userId],
    ),
    getSeries(userId),
  ]);
  const seriesMap = new Map(series.map((item) => [item.id, item] as const));
  const itemMap = new Map<number, TopicBacklogItem[]>();
  for (const row of itemRows) {
    const current = itemMap.get(row.backlog_id) ?? [];
    current.push(mapTopicBacklogItem(row));
    itemMap.set(row.backlog_id, current);
  }

  return backlogRows.map((row) => {
    const items = itemMap.get(row.id) ?? [];
    return {
      id: row.id,
      userId: row.user_id,
      seriesId: row.series_id,
      seriesName: row.series_id ? seriesMap.get(row.series_id)?.name ?? null : null,
      name: row.name,
      description: row.description,
      itemCount: items.length,
      lastGeneratedAt: row.last_generated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      items,
    } satisfies TopicBacklog;
  });
}

export async function getTopicBacklogById(userId: number, backlogId: number) {
  const backlogs = await getTopicBacklogs(userId);
  return backlogs.find((item) => item.id === backlogId) ?? null;
}

export async function createTopicBacklog(input: {
  userId: number;
  name?: unknown;
  description?: unknown;
  seriesId?: unknown;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("选题库名称不能为空");
  }
  const seriesId = await resolveOptionalSeriesId(input.userId, input.seriesId);
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO topic_backlogs (user_id, series_id, name, description, last_generated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.userId, seriesId, name, String(input.description || "").trim() || null, null, now, now],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklog.create",
    targetType: "topic_backlog",
    targetId: result.lastInsertRowid!,
    payload: { name, seriesId },
  });
  const backlog = await getTopicBacklogById(input.userId, Number(result.lastInsertRowid!));
  if (!backlog) {
    throw new Error("选题库创建失败");
  }
  return backlog;
}

export async function updateTopicBacklog(input: {
  userId: number;
  backlogId: number;
  name?: unknown;
  description?: unknown;
  seriesId?: unknown;
}) {
  await ensureExtendedProductSchema();
  const current = await getTopicBacklogRow(input.userId, input.backlogId);
  if (!current) {
    throw new Error("选题库不存在");
  }
  const name = input.name === undefined ? current.name : String(input.name || "").trim();
  if (!name) {
    throw new Error("选题库名称不能为空");
  }
  const seriesId = input.seriesId === undefined ? current.series_id : await resolveOptionalSeriesId(input.userId, input.seriesId);
  const description = input.description === undefined ? current.description : String(input.description || "").trim() || null;
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE topic_backlogs
     SET series_id = ?, name = ?, description = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [seriesId, name, description, now, input.backlogId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklog.update",
    targetType: "topic_backlog",
    targetId: input.backlogId,
    payload: { name, seriesId },
  });
  const backlog = await getTopicBacklogById(input.userId, input.backlogId);
  if (!backlog) {
    throw new Error("选题库更新失败");
  }
  return backlog;
}

export async function deleteTopicBacklog(userId: number, backlogId: number) {
  await ensureExtendedProductSchema();
  const current = await getTopicBacklogRow(userId, backlogId);
  if (!current) {
    throw new Error("选题库不存在");
  }
  const db = getDatabase();
  await db.exec("DELETE FROM topic_backlog_items WHERE backlog_id = ? AND user_id = ?", [backlogId, userId]);
  await db.exec("DELETE FROM topic_backlogs WHERE id = ? AND user_id = ?", [backlogId, userId]);
  await appendAuditLog({
    userId,
    action: "topicBacklog.delete",
    targetType: "topic_backlog",
    targetId: backlogId,
    payload: { name: current.name },
  });
}

function buildStrategyDraft(input: {
  coreAssertion?: unknown;
  whyNow?: unknown;
  mainstreamBelief?: unknown;
  targetReader?: unknown;
}) {
  const draft = {
    coreAssertion: String(input.coreAssertion || "").trim() || null,
    whyNow: String(input.whyNow || "").trim() || null,
    mainstreamBelief: String(input.mainstreamBelief || "").trim() || null,
    targetReader: String(input.targetReader || "").trim() || null,
  };
  return Object.values(draft).some(Boolean) ? draft : null;
}

export async function createTopicBacklogItem(input: {
  userId: number;
  backlogId: number;
  topicLeadId?: unknown;
  sourceType?: unknown;
  fissionMode?: unknown;
  theme?: unknown;
  archetype?: unknown;
  evidenceRefs?: unknown;
  strategyDraft?: Record<string, unknown> | null;
  targetAudience?: unknown;
  readerSnapshotHint?: unknown;
  status?: unknown;
}) {
  await ensureExtendedProductSchema();
  const backlog = await getTopicBacklogRow(input.userId, input.backlogId);
  if (!backlog) {
    throw new Error("选题库不存在");
  }
  const theme = String(input.theme || "").trim();
  if (!theme) {
    throw new Error("选题主题不能为空");
  }
  const topicLeadId =
    input.topicLeadId == null || input.topicLeadId === ""
      ? null
      : Number.isInteger(Number(input.topicLeadId)) && Number(input.topicLeadId) > 0
        ? Number(input.topicLeadId)
        : null;
  if (input.topicLeadId != null && input.topicLeadId !== "" && !topicLeadId) {
    throw new Error("TopicLead 无效");
  }
  if (topicLeadId) {
    const topicLead = await getTopicLeadById(input.userId, topicLeadId);
    if (!topicLead) {
      throw new Error("TopicLead 不存在");
    }
  }
  const db = getDatabase();
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO topic_backlog_items (
      backlog_id, user_id, topic_lead_id, source_type, fission_mode, theme, archetype, evidence_refs_json, strategy_draft_json,
      target_audience, reader_snapshot_hint, status, generated_article_id, generated_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.backlogId,
      input.userId,
      topicLeadId,
      normalizeSourceType(input.sourceType),
      normalizeFissionMode(input.fissionMode),
      theme,
      normalizeArchetype(input.archetype),
      JSON.stringify(parseJsonArray(input.evidenceRefs)),
      JSON.stringify(parseJsonRecord(input.strategyDraft) ?? null),
      String(input.targetAudience || "").trim() || null,
      String(input.readerSnapshotHint || "").trim() || null,
      normalizeItemStatus(input.status),
      null,
      null,
      now,
      now,
    ],
  );
  await db.exec("UPDATE topic_backlogs SET updated_at = ? WHERE id = ? AND user_id = ?", [now, input.backlogId, input.userId]);
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklogItem.create",
    targetType: "topic_backlog_item",
    targetId: result.lastInsertRowid!,
    payload: { backlogId: input.backlogId, theme },
  });
  const row = await getTopicBacklogItemRow(input.userId, input.backlogId, Number(result.lastInsertRowid!));
  if (!row) {
    throw new Error("选题条目创建失败");
  }
  if (topicLeadId) {
    await adoptTopicLeadToBacklogItem({
      userId: input.userId,
      topicLeadId,
      backlogItemId: Number(result.lastInsertRowid!),
    });
  }
  return mapTopicBacklogItem(row);
}

export async function updateTopicBacklogItem(input: {
  userId: number;
  backlogId: number;
  itemId: number;
  topicLeadId?: unknown;
  sourceType?: unknown;
  fissionMode?: unknown;
  theme?: unknown;
  archetype?: unknown;
  evidenceRefs?: unknown;
  strategyDraft?: Record<string, unknown> | null;
  targetAudience?: unknown;
  readerSnapshotHint?: unknown;
  status?: unknown;
}) {
  await ensureExtendedProductSchema();
  const current = await getTopicBacklogItemRow(input.userId, input.backlogId, input.itemId);
  if (!current) {
    throw new Error("选题条目不存在");
  }
  const theme = input.theme === undefined ? current.theme : String(input.theme || "").trim();
  if (!theme) {
    throw new Error("选题主题不能为空");
  }
  const topicLeadId =
    input.topicLeadId === undefined
      ? current.topic_lead_id
      : input.topicLeadId == null || input.topicLeadId === ""
        ? null
        : Number.isInteger(Number(input.topicLeadId)) && Number(input.topicLeadId) > 0
          ? Number(input.topicLeadId)
          : null;
  if (input.topicLeadId !== undefined && input.topicLeadId != null && input.topicLeadId !== "" && !topicLeadId) {
    throw new Error("TopicLead 无效");
  }
  if (topicLeadId) {
    const topicLead = await getTopicLeadById(input.userId, topicLeadId);
    if (!topicLead) {
      throw new Error("TopicLead 不存在");
    }
  }
  const sourceType = input.sourceType === undefined ? normalizeSourceType(current.source_type) : normalizeSourceType(input.sourceType);
  const fissionMode = input.fissionMode === undefined ? normalizeFissionMode(current.fission_mode) : normalizeFissionMode(input.fissionMode);
  const archetype = input.archetype === undefined ? normalizeArchetype(current.archetype) : normalizeArchetype(input.archetype);
  const evidenceRefs = input.evidenceRefs === undefined ? parseJsonArray(current.evidence_refs_json) : parseJsonArray(input.evidenceRefs);
  const strategyDraft = input.strategyDraft === undefined ? parseJsonRecord(current.strategy_draft_json) : parseJsonRecord(input.strategyDraft);
  const targetAudience = input.targetAudience === undefined ? current.target_audience : String(input.targetAudience || "").trim() || null;
  const readerSnapshotHint =
    input.readerSnapshotHint === undefined ? current.reader_snapshot_hint : String(input.readerSnapshotHint || "").trim() || null;
  const status = input.status === undefined ? normalizeItemStatus(current.status) : normalizeItemStatus(input.status);
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE topic_backlog_items
     SET topic_lead_id = ?, source_type = ?, fission_mode = ?, theme = ?, archetype = ?, evidence_refs_json = ?, strategy_draft_json = ?,
         target_audience = ?, reader_snapshot_hint = ?, status = ?, updated_at = ?
     WHERE id = ? AND backlog_id = ? AND user_id = ?`,
    [
      topicLeadId,
      sourceType,
      fissionMode,
      theme,
      archetype,
      JSON.stringify(evidenceRefs),
      JSON.stringify(strategyDraft ?? null),
      targetAudience,
      readerSnapshotHint,
      status,
      now,
      input.itemId,
      input.backlogId,
      input.userId,
    ],
  );
  await db.exec("UPDATE topic_backlogs SET updated_at = ? WHERE id = ? AND user_id = ?", [now, input.backlogId, input.userId]);
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklogItem.update",
    targetType: "topic_backlog_item",
    targetId: input.itemId,
    payload: { backlogId: input.backlogId, theme, status },
  });
  const row = await getTopicBacklogItemRow(input.userId, input.backlogId, input.itemId);
  if (!row) {
    throw new Error("选题条目更新失败");
  }
  if (topicLeadId) {
    await adoptTopicLeadToBacklogItem({
      userId: input.userId,
      topicLeadId,
      backlogItemId: input.itemId,
    });
  }
  return mapTopicBacklogItem(row);
}

export async function deleteTopicBacklogItem(userId: number, backlogId: number, itemId: number) {
  await ensureExtendedProductSchema();
  const current = await getTopicBacklogItemRow(userId, backlogId, itemId);
  if (!current) {
    throw new Error("选题条目不存在");
  }
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec("DELETE FROM topic_backlog_items WHERE id = ? AND backlog_id = ? AND user_id = ?", [itemId, backlogId, userId]);
  await db.exec("UPDATE topic_backlogs SET updated_at = ? WHERE id = ? AND user_id = ?", [now, backlogId, userId]);
  await appendAuditLog({
    userId,
    action: "topicBacklogItem.delete",
    targetType: "topic_backlog_item",
    targetId: itemId,
    payload: { backlogId, theme: current.theme },
  });
}

export async function bulkCreateTopicBacklogItems(input: {
  userId: number;
  backlogId: number;
  items?: unknown;
  text?: unknown;
  defaultSourceType?: unknown;
  defaultStatus?: unknown;
}) {
  await ensureExtendedProductSchema();
  const defaultSourceType = normalizeSourceType(input.defaultSourceType === undefined ? "excel" : input.defaultSourceType);
  const defaultStatus = normalizeItemStatus(input.defaultStatus === undefined ? "draft" : input.defaultStatus);
  const itemsFromArray = Array.isArray(input.items) ? input.items as TopicBacklogBulkImportItemInput[] : [];
  const itemsFromText = typeof input.text === "string" ? parseBulkTabularText(input.text) : [];
  const sourceItems = [...itemsFromArray, ...itemsFromText];
  if (sourceItems.length === 0) {
    throw new Error("至少提供 1 条可导入的选题");
  }

  const createdItems: TopicBacklogItem[] = [];
  for (const item of sourceItems) {
    const theme = String(item.theme || "").trim();
    if (!theme) {
      continue;
    }
    createdItems.push(
      await createTopicBacklogItem({
        userId: input.userId,
        backlogId: input.backlogId,
        topicLeadId: item.topicLeadId,
        sourceType: item.sourceType ?? defaultSourceType,
        fissionMode: item.fissionMode,
        theme,
        archetype: item.archetype,
        evidenceRefs: item.evidenceRefs,
        strategyDraft: item.strategyDraft && typeof item.strategyDraft === "object"
          ? item.strategyDraft
          : buildStrategyDraft({
              targetReader: item.targetAudience,
            }),
        targetAudience: item.targetAudience,
        readerSnapshotHint: item.readerSnapshotHint,
        status: item.status ?? defaultStatus,
      }),
    );
  }
  if (createdItems.length === 0) {
    throw new Error("导入内容里没有有效的选题主题");
  }
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklog.bulkImport",
    targetType: "topic_backlog",
    targetId: input.backlogId,
    payload: { importedCount: createdItems.length, defaultSourceType, defaultStatus },
  });
  return {
    createdItems,
    backlog: await getTopicBacklogById(input.userId, input.backlogId),
  };
}

function getStrategyDraftString(record: Record<string, unknown> | null, key: string) {
  return String(record?.[key] || "").trim() || null;
}

function buildTopicBacklogBatchId(backlogId: number) {
  return `tb-${backlogId}-${Date.now().toString(36)}`;
}

async function getValidatedTopicBacklogGenerationRows(input: {
  userId: number;
  backlogId: number;
  itemIds: Array<number | string>;
}) {
  const itemIds = Array.from(
    new Set(
      input.itemIds
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  );
  if (itemIds.length === 0) {
    throw new Error("至少选择 1 条选题");
  }
  const placeholders = itemIds.map(() => "?").join(", ");
  const db = getDatabase();
  const rows = await db.query<TopicBacklogItemRow>(
    `SELECT id, backlog_id, user_id, source_type, fission_mode, theme, archetype, evidence_refs_json, strategy_draft_json,
            target_audience, reader_snapshot_hint, status, generated_article_id, generated_batch_id, generated_at, created_at, updated_at
     FROM topic_backlog_items
     WHERE backlog_id = ? AND user_id = ? AND id IN (${placeholders})
     ORDER BY id ASC`,
    [input.backlogId, input.userId, ...itemIds],
  );
  if (rows.length === 0) {
    throw new Error("没有找到可生成的选题条目");
  }
  const missingIds = itemIds.filter((itemId) => !rows.some((row) => row.id === itemId));
  if (missingIds.length > 0) {
    throw new Error(`部分选题条目不存在：${missingIds.join(", ")}`);
  }
  const discarded = rows.find((row) => normalizeItemStatus(row.status) === "discarded");
  if (discarded) {
    throw new Error("已丢弃的条目不能参与生成");
  }
  const queued = rows.find((row) => normalizeItemStatus(row.status) === "queued");
  if (queued) {
    throw new Error(`条目《${queued.theme}》已在生成队列中`);
  }
  return rows;
}

export async function generateArticlesFromTopicBacklog(input: {
  userId: number;
  backlogId: number;
  itemIds: Array<number | string>;
  seriesId?: unknown;
  concurrency?: unknown;
}) {
  await ensureExtendedProductSchema();
  const backlog = await getTopicBacklogRow(input.userId, input.backlogId);
  if (!backlog) {
    throw new Error("选题库不存在");
  }
  const rows = await getValidatedTopicBacklogGenerationRows(input);
  const resolvedSeriesId = await resolveArticleSeriesId(input.userId, input.seriesId ?? backlog.series_id ?? null);
  const planContext = await getUserPlanContext(input.userId);
  const limit = TOPIC_BACKLOG_BATCH_LIMITS[planContext.effectivePlanCode] ?? TOPIC_BACKLOG_BATCH_LIMITS.free;
  if (rows.length > limit) {
    throw new Error(`${planContext.plan.name}套餐单批最多生成 ${limit} 篇稿件`);
  }
  const requestedConcurrency = Number(input.concurrency);
  const concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.min(limit, Math.floor(requestedConcurrency))) : Math.min(3, limit);
  const db = getDatabase();
  const now = new Date().toISOString();
  const batchId = buildTopicBacklogBatchId(input.backlogId);
  const jobs: TopicBacklogGenerationJob[] = [];
  await db.transaction(async () => {
    for (const row of rows) {
      await db.exec(
        `UPDATE topic_backlog_items
         SET status = ?, generated_batch_id = ?, updated_at = ?
         WHERE id = ? AND backlog_id = ? AND user_id = ?`,
        ["queued", batchId, now, row.id, input.backlogId, input.userId],
      );
      const result = await db.exec(
        `INSERT INTO job_queue (job_type, status, payload_json, run_at, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "topicBacklogGenerate",
          "queued",
          {
            batchId,
            backlogId: input.backlogId,
            itemId: row.id,
            userId: input.userId,
            seriesId: resolvedSeriesId,
            concurrency,
            queuedAt: now,
          },
          now,
          0,
          now,
          now,
        ],
      );
      jobs.push({
        itemId: row.id,
        jobId: Number(result.lastInsertRowid!),
        status: "queued",
      });
    }
    await db.exec(
      `UPDATE topic_backlogs
       SET series_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [resolvedSeriesId, now, input.backlogId, input.userId],
    );
  });
  await db.exec(
    `UPDATE topic_backlogs
     SET updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [now, input.backlogId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicBacklog.generate",
    targetType: "topic_backlog",
    targetId: input.backlogId,
    payload: { batchId, itemIds: rows.map((row) => row.id), seriesId: resolvedSeriesId, queuedJobCount: jobs.length, concurrency },
  });
  return {
    batchId,
    jobs,
    backlog: await getTopicBacklogById(input.userId, input.backlogId),
  };
}

export async function resetQueuedTopicBacklogItemAfterFailure(input: {
  userId: number;
  backlogId: number;
  itemId: number;
}) {
  await ensureExtendedProductSchema();
  const current = await getTopicBacklogItemRow(input.userId, input.backlogId, input.itemId);
  if (!current || normalizeItemStatus(current.status) !== "queued") {
    return null;
  }
  const nextStatus = current.generated_article_id ? "generated" : "ready";
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE topic_backlog_items
     SET status = ?, generated_batch_id = ?, updated_at = ?
     WHERE id = ? AND backlog_id = ? AND user_id = ?`,
    [nextStatus, nextStatus === "generated" ? current.generated_batch_id : null, now, input.itemId, input.backlogId, input.userId],
  );
  return getTopicBacklogItemRow(input.userId, input.backlogId, input.itemId);
}

export async function executeTopicBacklogGenerationJob(input: {
  userId: number;
  backlogId: number;
  itemId: number;
  seriesId?: unknown;
  batchId?: string | null;
}) {
  await ensureExtendedProductSchema();
  const backlog = await getTopicBacklogRow(input.userId, input.backlogId);
  if (!backlog) {
    throw new Error("选题库不存在");
  }
  const row = await getTopicBacklogItemRow(input.userId, input.backlogId, input.itemId);
  if (!row) {
    throw new Error("选题条目不存在");
  }
  if (normalizeItemStatus(row.status) === "discarded") {
    throw new Error("已丢弃的条目不能生成稿件");
  }
  const startedAt = Date.now();
  let observationStatus: "completed" | "failed" = "completed";
  const observationMeta: Record<string, unknown> = {
    backlogId: input.backlogId,
    itemId: input.itemId,
    reused: false,
  };
  if (normalizeItemStatus(row.status) === "generated" && row.generated_article_id) {
    observationMeta.reused = true;
    observationMeta.articleId = row.generated_article_id;
    await recordPlan17RuntimeObservation({
      metricKey: "topicBacklogGenerate.item",
      groupKey: input.batchId ?? row.generated_batch_id ?? null,
      userId: input.userId,
      status: observationStatus,
      durationMs: Date.now() - startedAt,
      meta: observationMeta,
    }).catch(() => undefined);
    return {
      batchId: input.batchId ?? null,
      itemId: row.id,
      articleId: row.generated_article_id,
      reused: true,
    };
  }

  try {
    const resolvedSeriesId = await resolveArticleSeriesId(input.userId, input.seriesId ?? backlog.series_id ?? null);
    const strategyDraft = parseJsonRecord(row.strategy_draft_json);
    await consumeDailyGenerationQuota(input.userId);
    const article = await createArticle(input.userId, row.theme, resolvedSeriesId);
    if (!article?.id) {
      throw new Error(`条目《${row.theme}》生成失败`);
    }
    const autoDraft: StrategyCardAutoDraft = await generateStrategyCardAutoDraft({
      title: row.theme,
      summary: row.reader_snapshot_hint,
      sourceName: backlog.name,
      chosenAngle: getStrategyDraftString(strategyDraft, "coreAssertion"),
      readerSnapshotHint: row.reader_snapshot_hint,
      strategyCard: {
        archetype: normalizeArchetype(row.archetype) ?? undefined,
        targetReader: row.target_audience || getStrategyDraftString(strategyDraft, "targetReader") || undefined,
        coreAssertion: getStrategyDraftString(strategyDraft, "coreAssertion") || undefined,
        whyNow: getStrategyDraftString(strategyDraft, "whyNow") || row.reader_snapshot_hint || undefined,
        mainstreamBelief: getStrategyDraftString(strategyDraft, "mainstreamBelief") || undefined,
      },
    }).catch(() => ({} as StrategyCardAutoDraft));
    const fallbackDraft = buildFallbackStrategyCardAutoDraft({
      title: row.theme,
      strategyCard: {
        archetype: normalizeArchetype(row.archetype) ?? undefined,
        targetReader: row.target_audience || getStrategyDraftString(strategyDraft, "targetReader") || undefined,
        coreAssertion: getStrategyDraftString(strategyDraft, "coreAssertion") || undefined,
        whyNow: getStrategyDraftString(strategyDraft, "whyNow") || row.reader_snapshot_hint || undefined,
        mainstreamBelief: getStrategyDraftString(strategyDraft, "mainstreamBelief") || undefined,
      },
    });
    const mergedStrategyCard = {
      ...fallbackDraft,
      ...autoDraft,
      archetype: normalizeArchetype(row.archetype) ?? autoDraft.archetype ?? fallbackDraft.archetype,
      targetReader: row.target_audience || getStrategyDraftString(strategyDraft, "targetReader") || autoDraft.targetReader || fallbackDraft.targetReader,
      coreAssertion: getStrategyDraftString(strategyDraft, "coreAssertion") || autoDraft.coreAssertion || fallbackDraft.coreAssertion,
      whyNow: getStrategyDraftString(strategyDraft, "whyNow") || row.reader_snapshot_hint || autoDraft.whyNow || fallbackDraft.whyNow,
      mainstreamBelief: getStrategyDraftString(strategyDraft, "mainstreamBelief") || autoDraft.mainstreamBelief || fallbackDraft.mainstreamBelief,
    };
    await upsertArticleStrategyCard({
      articleId: Number(article.id),
      userId: input.userId,
      ...mergedStrategyCard,
      fourPointAudit: buildFourPointAudit(mergedStrategyCard),
    });
    const now = new Date().toISOString();
    const db = getDatabase();
    await db.exec(
      `UPDATE topic_backlog_items
       SET status = ?, generated_article_id = ?, generated_batch_id = ?, generated_at = ?, updated_at = ?
       WHERE id = ? AND backlog_id = ? AND user_id = ?`,
      ["generated", article.id, input.batchId ?? row.generated_batch_id ?? null, now, now, row.id, input.backlogId, input.userId],
    );
    await db.exec(
      `UPDATE topic_backlogs
       SET series_id = ?, last_generated_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [resolvedSeriesId, now, now, input.backlogId, input.userId],
    );
    observationMeta.articleId = Number(article.id);
    return {
      batchId: input.batchId ?? null,
      itemId: row.id,
      articleId: Number(article.id),
      reused: false,
    };
  } catch (error) {
    observationStatus = "failed";
    observationMeta.error =
      error instanceof Error && error.message ? error.message.slice(0, 200) : "unknown";
    await resetQueuedTopicBacklogItemAfterFailure({
      userId: input.userId,
      backlogId: input.backlogId,
      itemId: input.itemId,
    });
    throw error;
  } finally {
    await recordPlan17RuntimeObservation({
      metricKey: "topicBacklogGenerate.item",
      groupKey: input.batchId ?? row.generated_batch_id ?? null,
      userId: input.userId,
      status: observationStatus,
      durationMs: Date.now() - startedAt,
      meta: observationMeta,
    }).catch(() => undefined);
  }
}

export function buildTopicBacklogStrategyDraft(input: {
  coreAssertion?: unknown;
  whyNow?: unknown;
  mainstreamBelief?: unknown;
  targetReader?: unknown;
}) {
  return buildStrategyDraft(input);
}
