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
  created_at: string;
  updated_at: string;
};

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
    `SELECT id, user_id, name, persona_id, thesis, target_audience, active_status, created_at, updated_at
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
      `SELECT id, user_id, name, persona_id, thesis, target_audience, active_status, created_at, updated_at
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
      user_id, name, persona_id, thesis, target_audience, active_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      name,
      persona.id,
      thesis,
      targetAudience,
      normalizeSeriesStatus(input.activeStatus),
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
     SET name = ?, persona_id = ?, thesis = ?, target_audience = ?, active_status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      nextName,
      persona.id,
      thesis,
      targetAudience,
      input.activeStatus === undefined ? normalizeSeriesStatus(current.active_status) : normalizeSeriesStatus(input.activeStatus),
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
