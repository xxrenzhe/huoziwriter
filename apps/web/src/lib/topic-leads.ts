import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type TopicLeadSource = "radar" | "topicFission" | "referenceLink" | "backlog" | "manual";
export type TopicLeadFissionMode = "regularity" | "contrast" | "cross-domain";
export type TopicLeadArchetype = "opinion" | "case" | "howto" | "hotTake" | "phenomenon";

type TopicLeadRow = {
  id: number;
  user_id: number;
  source: string;
  fission_mode: string | null;
  source_track_label: string | null;
  topic: string;
  target_audience: string | null;
  description: string | null;
  predicted_flip_strength: number | null;
  archetype_suggestion: string | null;
  adopted_article_id: number | null;
  adopted_backlog_item_id: number | null;
  created_at: string;
  updated_at: string;
};

export type TopicLead = {
  id: number;
  userId: number;
  source: TopicLeadSource;
  fissionMode: TopicLeadFissionMode | null;
  sourceTrackLabel: string | null;
  topic: string;
  targetAudience: string | null;
  description: string | null;
  predictedFlipStrength: number | null;
  archetypeSuggestion: TopicLeadArchetype | null;
  adoptedArticleId: number | null;
  adoptedBacklogItemId: number | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeSource(value: unknown): TopicLeadSource {
  if (value === "topicFission" || value === "referenceLink" || value === "backlog" || value === "manual") {
    return value;
  }
  return "radar";
}

function normalizeFissionMode(value: unknown): TopicLeadFissionMode | null {
  if (value === "regularity" || value === "contrast" || value === "cross-domain") {
    return value;
  }
  return null;
}

function normalizeArchetype(value: unknown): TopicLeadArchetype | null {
  if (value === "opinion" || value === "case" || value === "howto" || value === "hotTake" || value === "phenomenon") {
    return value;
  }
  return null;
}

function normalizeFlipStrength(value: unknown) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return null;
  }
  return Math.max(0, Math.min(5, Math.round(normalized)));
}

function mapTopicLead(row: TopicLeadRow): TopicLead {
  return {
    id: row.id,
    userId: row.user_id,
    source: normalizeSource(row.source),
    fissionMode: normalizeFissionMode(row.fission_mode),
    sourceTrackLabel: row.source_track_label,
    topic: row.topic,
    targetAudience: row.target_audience,
    description: row.description,
    predictedFlipStrength: row.predicted_flip_strength == null ? null : Number(row.predicted_flip_strength),
    archetypeSuggestion: normalizeArchetype(row.archetype_suggestion),
    adoptedArticleId: row.adopted_article_id,
    adoptedBacklogItemId: row.adopted_backlog_item_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getTopicLeadById(userId: number, topicLeadId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<TopicLeadRow>(
    `SELECT id, user_id, source, fission_mode, source_track_label, topic, target_audience, description,
            predicted_flip_strength, archetype_suggestion, adopted_article_id, adopted_backlog_item_id, created_at, updated_at
     FROM topic_leads
     WHERE id = ? AND user_id = ?`,
    [topicLeadId, userId],
  );
  return row ? mapTopicLead(row) : null;
}

export async function createTopicLead(input: {
  userId: number;
  source?: unknown;
  fissionMode?: unknown;
  sourceTrackLabel?: unknown;
  topic?: unknown;
  targetAudience?: unknown;
  description?: unknown;
  predictedFlipStrength?: unknown;
  archetypeSuggestion?: unknown;
}) {
  await ensureExtendedProductSchema();
  const topic = String(input.topic || "").trim();
  if (!topic) {
    throw new Error("选题不能为空");
  }
  const now = new Date().toISOString();
  const db = getDatabase();
  const result = await db.exec(
    `INSERT INTO topic_leads (
      user_id, source, fission_mode, source_track_label, topic, target_audience, description,
      predicted_flip_strength, archetype_suggestion, adopted_article_id, adopted_backlog_item_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      normalizeSource(input.source),
      normalizeFissionMode(input.fissionMode),
      String(input.sourceTrackLabel || "").trim() || null,
      topic,
      String(input.targetAudience || "").trim() || null,
      String(input.description || "").trim() || null,
      normalizeFlipStrength(input.predictedFlipStrength),
      normalizeArchetype(input.archetypeSuggestion),
      null,
      null,
      now,
      now,
    ],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicLead.create",
    targetType: "topic_lead",
    targetId: result.lastInsertRowid!,
    payload: {
      source: normalizeSource(input.source),
      topic,
      fissionMode: normalizeFissionMode(input.fissionMode),
    },
  });
  return getTopicLeadById(input.userId, Number(result.lastInsertRowid!));
}

export async function adoptTopicLeadToArticle(input: {
  userId: number;
  topicLeadId: number;
  articleId: number;
}) {
  await ensureExtendedProductSchema();
  const current = await getTopicLeadById(input.userId, input.topicLeadId);
  if (!current) {
    throw new Error("TopicLead 不存在");
  }
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE topic_leads
     SET adopted_article_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [input.articleId, now, input.topicLeadId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicLead.adoptArticle",
    targetType: "topic_lead",
    targetId: input.topicLeadId,
    payload: { articleId: input.articleId },
  });
  return getTopicLeadById(input.userId, input.topicLeadId);
}

export async function adoptTopicLeadToBacklogItem(input: {
  userId: number;
  topicLeadId: number;
  backlogItemId: number;
}) {
  await ensureExtendedProductSchema();
  const current = await getTopicLeadById(input.userId, input.topicLeadId);
  if (!current) {
    throw new Error("TopicLead 不存在");
  }
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE topic_leads
     SET adopted_backlog_item_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [input.backlogItemId, now, input.topicLeadId, input.userId],
  );
  await appendAuditLog({
    userId: input.userId,
    action: "topicLead.adoptBacklog",
    targetType: "topic_lead",
    targetId: input.topicLeadId,
    payload: { backlogItemId: input.backlogItemId },
  });
  return getTopicLeadById(input.userId, input.topicLeadId);
}
