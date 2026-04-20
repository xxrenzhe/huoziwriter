import { getDatabase } from "./db";
import { getPersonas } from "./personas";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

const SERIES_TABLE = "series";

type SeriesRow = {
  id: number;
  user_id: number;
  name: string;
  persona_id: number;
  thesis: string | null;
  target_audience: string | null;
  active_status: string;
  pre_hook: string | null;
  post_hook: string | null;
  default_layout_template_id: string | null;
  platform_preference: string | null;
  target_pack_hint: string | null;
  default_archetype: string | null;
  default_dna_id: number | null;
  rhythm_override_json: string | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function normalizeSeriesStatus(value: unknown) {
  const normalized = String(value || "").trim();
  if (normalized === "paused" || normalized === "archived") {
    return normalized;
  }
  return "active";
}

async function getSeriesRow(userId: number, seriesId: number) {
  const db = getDatabase();
  return db.queryOne<SeriesRow>(
    `SELECT id, user_id, name, persona_id, thesis, target_audience, active_status, pre_hook, post_hook, default_layout_template_id, platform_preference, target_pack_hint, default_archetype, default_dna_id, rhythm_override_json, created_at, updated_at
     FROM ${SERIES_TABLE}
     WHERE id = ? AND user_id = ?`,
    [seriesId, userId],
  );
}

async function countSeries(userId: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM ${SERIES_TABLE} WHERE user_id = ?`, [
    userId,
  ]);
  return row?.count ?? 0;
}

async function resolveSeriesPersona(userId: number, personaId: unknown) {
  const normalizedId = Number(personaId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new Error("系列必须绑定一个有效作者人设");
  }
  const personas = await getPersonas(userId);
  const matched = personas.find((item) => item.id === normalizedId);
  if (!matched) {
    throw new Error("系列绑定的作者人设不存在");
  }
  return matched;
}

export async function getSeries(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [rows, personas] = await Promise.all([
    db.query<SeriesRow>(
      `SELECT id, user_id, name, persona_id, thesis, target_audience, active_status, pre_hook, post_hook, default_layout_template_id, platform_preference, target_pack_hint, default_archetype, default_dna_id, rhythm_override_json, created_at, updated_at
       FROM ${SERIES_TABLE}
       WHERE user_id = ?
       ORDER BY CASE active_status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, updated_at DESC, id DESC`,
      [userId],
    ),
    getPersonas(userId),
  ]);
  const personaMap = new Map(personas.map((item) => [item.id, item] as const));
  return rows.map((row) => {
    const persona = personaMap.get(row.persona_id) ?? null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      personaId: row.persona_id,
      personaName: persona?.name ?? "已删除人设",
      personaSummary: persona?.summary ?? null,
      identityTags: persona?.identityTags ?? [],
      writingStyleTags: persona?.writingStyleTags ?? [],
      domainKeywords: persona?.domainKeywords ?? [],
      argumentPreferences: persona?.argumentPreferences ?? [],
      toneConstraints: persona?.toneConstraints ?? [],
      audienceHints: persona?.audienceHints ?? [],
      sourceMode: persona?.sourceMode ?? "manual",
      boundWritingStyleProfileId: persona?.boundWritingStyleProfileId ?? null,
      boundWritingStyleProfileName: persona?.boundWritingStyleProfileName ?? null,
      thesis: row.thesis,
      targetAudience: row.target_audience,
      activeStatus: normalizeSeriesStatus(row.active_status),
      preHook: row.pre_hook,
      postHook: row.post_hook,
      defaultLayoutTemplateId: row.default_layout_template_id,
      platformPreference: row.platform_preference,
      targetPackHint: row.target_pack_hint,
      defaultArchetype:
        row.default_archetype === "opinion" || row.default_archetype === "case" || row.default_archetype === "howto" || row.default_archetype === "hotTake" || row.default_archetype === "phenomenon"
          ? row.default_archetype
          : null,
      defaultDnaId: row.default_dna_id,
      rhythmOverride: parseJsonRecord(row.rhythm_override_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function getSeriesById(userId: number, seriesId: number) {
  const series = await getSeries(userId);
  return series.find((item) => item.id === seriesId) ?? null;
}

export async function getDefaultSeries(userId: number) {
  const series = await getSeries(userId);
  if (series.length === 1) {
    return series[0];
  }
  return null;
}

export async function createSeries(input: {
  userId: number;
  name?: unknown;
  personaId: unknown;
  thesis?: unknown;
  targetAudience?: unknown;
  activeStatus?: unknown;
  preHook?: unknown;
  postHook?: unknown;
  defaultLayoutTemplateId?: unknown;
  platformPreference?: unknown;
  targetPackHint?: unknown;
  defaultArchetype?: unknown;
  defaultDnaId?: unknown;
  rhythmOverride?: Record<string, unknown> | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const name = String(input.name || "").trim();
  if (!name) {
    throw new Error("系列名称不能为空");
  }
  const thesis = String(input.thesis || "").trim() || null;
  const targetAudience = String(input.targetAudience || "").trim() || null;
  if (!thesis) {
    throw new Error("系列必须写明核心判断");
  }
  if (!targetAudience) {
    throw new Error("系列必须写明目标读者");
  }
  const persona = await resolveSeriesPersona(input.userId, input.personaId);
  const now = new Date().toISOString();
  const result = await db.exec(
    `INSERT INTO ${SERIES_TABLE} (
      user_id, name, persona_id, thesis, target_audience, active_status, pre_hook, post_hook, default_layout_template_id, platform_preference, target_pack_hint, default_archetype, default_dna_id, rhythm_override_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      name,
      persona.id,
      thesis,
      targetAudience,
      normalizeSeriesStatus(input.activeStatus),
      String(input.preHook || "").trim() || null,
      String(input.postHook || "").trim() || null,
      String(input.defaultLayoutTemplateId || "").trim() || null,
      String(input.platformPreference || "").trim() || null,
      String(input.targetPackHint || "").trim() || null,
      String(input.defaultArchetype || "").trim() || null,
      Number(input.defaultDnaId || 0) || null,
      JSON.stringify(input.rhythmOverride ?? null),
      now,
      now,
    ],
  );
  const created = await getSeriesById(input.userId, Number(result.lastInsertRowid!));
  if (!created) {
    throw new Error("系列创建失败");
  }
  return created;
}

export async function updateSeries(input: {
  userId: number;
  seriesId: number;
  name?: unknown;
  personaId?: unknown;
  thesis?: unknown;
  targetAudience?: unknown;
  activeStatus?: unknown;
  preHook?: unknown;
  postHook?: unknown;
  defaultLayoutTemplateId?: unknown;
  platformPreference?: unknown;
  targetPackHint?: unknown;
  defaultArchetype?: unknown;
  defaultDnaId?: unknown;
  rhythmOverride?: Record<string, unknown> | null;
}) {
  await ensureExtendedProductSchema();
  const current = await getSeriesRow(input.userId, input.seriesId);
  if (!current) {
    throw new Error("系列不存在");
  }
  const nextName = input.name === undefined ? current.name : String(input.name || "").trim();
  if (!nextName) {
    throw new Error("系列名称不能为空");
  }
  const persona =
    input.personaId === undefined
      ? await resolveSeriesPersona(input.userId, current.persona_id)
      : await resolveSeriesPersona(input.userId, input.personaId);
  const thesis = input.thesis === undefined ? current.thesis : String(input.thesis || "").trim() || null;
  const targetAudience =
    input.targetAudience === undefined ? current.target_audience : String(input.targetAudience || "").trim() || null;
  const preHook = input.preHook === undefined ? current.pre_hook : String(input.preHook || "").trim() || null;
  const postHook = input.postHook === undefined ? current.post_hook : String(input.postHook || "").trim() || null;
  const defaultLayoutTemplateId =
    input.defaultLayoutTemplateId === undefined ? current.default_layout_template_id : String(input.defaultLayoutTemplateId || "").trim() || null;
  const platformPreference =
    input.platformPreference === undefined ? current.platform_preference : String(input.platformPreference || "").trim() || null;
  const targetPackHint =
    input.targetPackHint === undefined ? current.target_pack_hint : String(input.targetPackHint || "").trim() || null;
  const defaultArchetype =
    input.defaultArchetype === undefined ? current.default_archetype : String(input.defaultArchetype || "").trim() || null;
  const defaultDnaId = input.defaultDnaId === undefined ? current.default_dna_id : Number(input.defaultDnaId || 0) || null;
  const rhythmOverrideJson =
    input.rhythmOverride === undefined ? JSON.stringify(parseJsonRecord(current.rhythm_override_json) ?? null) : JSON.stringify(input.rhythmOverride ?? null);
  if (!thesis) {
    throw new Error("系列必须写明核心判断");
  }
  if (!targetAudience) {
    throw new Error("系列必须写明目标读者");
  }
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE ${SERIES_TABLE}
     SET name = ?, persona_id = ?, thesis = ?, target_audience = ?, active_status = ?, pre_hook = ?, post_hook = ?, default_layout_template_id = ?, platform_preference = ?, target_pack_hint = ?, default_archetype = ?, default_dna_id = ?, rhythm_override_json = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      nextName,
      persona.id,
      thesis,
      targetAudience,
      input.activeStatus === undefined ? normalizeSeriesStatus(current.active_status) : normalizeSeriesStatus(input.activeStatus),
      preHook,
      postHook,
      defaultLayoutTemplateId,
      platformPreference,
      targetPackHint,
      defaultArchetype,
      defaultDnaId,
      rhythmOverrideJson,
      now,
      input.seriesId,
      input.userId,
    ],
  );
  const updated = await getSeriesById(input.userId, input.seriesId);
  if (!updated) {
    throw new Error("系列更新失败");
  }
  return updated;
}

export async function deleteSeries(userId: number, seriesId: number) {
  await ensureExtendedProductSchema();
  const current = await getSeriesRow(userId, seriesId);
  if (!current) {
    throw new Error("系列不存在");
  }
  const db = getDatabase();
  const linkedArticles = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM articles WHERE user_id = ? AND series_id = ?",
    [userId, seriesId],
  );
  if ((linkedArticles?.count ?? 0) > 0) {
    throw new Error("该系列下还有稿件，先把稿件改绑到其他系列后再删除");
  }
  const linkedBacklogs = await db.queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM topic_backlogs WHERE user_id = ? AND series_id = ?",
    [userId, seriesId],
  );
  if ((linkedBacklogs?.count ?? 0) > 0) {
    throw new Error("该系列下还有选题库，先把选题库改绑到其他系列或解绑后再删除");
  }
  if ((await countSeries(userId)) <= 1) {
    throw new Error("至少保留 1 个系列，避免稿件失去归属");
  }
  await db.exec(`DELETE FROM ${SERIES_TABLE} WHERE id = ? AND user_id = ?`, [seriesId, userId]);
}

export async function resolveArticleSeriesId(userId: number, seriesId: unknown) {
  if (seriesId == null || seriesId === "") {
    const fallbackSeries = await getDefaultSeries(userId);
    if (fallbackSeries) {
      return fallbackSeries.id;
    }
    const total = await countSeries(userId);
    if (total <= 0) {
      throw new Error("请先创建至少 1 个系列，再开始写稿");
    }
    throw new Error("每篇稿件都必须绑定系列，请先选择一个系列");
  }
  const normalizedId = Number(seriesId);
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw new Error("稿件系列无效");
  }
  const matched = await getSeriesById(userId, normalizedId);
  if (!matched) {
    throw new Error("稿件系列不存在");
  }
  return matched.id;
}
