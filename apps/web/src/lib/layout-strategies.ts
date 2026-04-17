import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

function parseJson<T>(value: string | null, fallback: T) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

type LayoutStrategyRow = {
  id: number;
  owner_user_id: number | null;
  code: string;
  name: string;
  description: string | null;
  meta: string | null;
  config_json: string | Record<string, unknown>;
  is_official: number | boolean;
  owner_username?: string | null;
  created_at: string;
  updated_at?: string;
};

function mapLayoutStrategy(row: LayoutStrategyRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    meta: row.meta,
    config: typeof row.config_json === "string" ? parseJson<Record<string, unknown>>(row.config_json, {}) : row.config_json,
    isOfficial: Boolean(row.is_official),
    ownerUserId: row.owner_user_id,
    ownerUsername: row.owner_username ?? null,
    scope: row.owner_user_id == null ? "official" : "private",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export async function getLayoutStrategies(options?: { userId?: number }) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const params: unknown[] = [true];
  let where = "ls.is_official = ?";
  if (options?.userId) {
    where += " OR ls.owner_user_id = ?";
    params.push(options.userId);
  }

  const rows = await db.query<LayoutStrategyRow>(
    `SELECT
       ls.id,
       ls.owner_user_id,
       ls.code,
       ls.name,
       ls.description,
       ls.meta,
       ls.config_json,
       ls.is_official,
       u.username AS owner_username,
       ls.created_at,
       ls.updated_at
     FROM layout_strategies ls
     LEFT JOIN users u ON u.id = ls.owner_user_id
     WHERE ${where}
     ORDER BY ls.is_official DESC, ls.owner_user_id ASC, ls.updated_at DESC, ls.id DESC`,
    params,
  );

  return rows.map(mapLayoutStrategy);
}

export async function getLayoutStrategyById(layoutStrategyId: number, options?: { userId?: number }) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const params: unknown[] = [layoutStrategyId];
  let where = "ls.id = ?";
  if (options?.userId) {
    where += " AND (ls.is_official = ? OR ls.owner_user_id = ?)";
    params.push(true, options.userId);
  }

  const row = await db.queryOne<LayoutStrategyRow>(
    `SELECT
       ls.id,
       ls.owner_user_id,
       ls.code,
       ls.name,
       ls.description,
       ls.meta,
       ls.config_json,
       ls.is_official,
       u.username AS owner_username,
       ls.created_at,
       ls.updated_at
     FROM layout_strategies ls
     LEFT JOIN users u ON u.id = ls.owner_user_id
     WHERE ${where}
     LIMIT 1`,
    params,
  );

  return row ? mapLayoutStrategy(row) : null;
}

export async function getOwnedLayoutStrategies(userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<LayoutStrategyRow>(
    `SELECT
       ls.id,
       ls.owner_user_id,
       ls.code,
       ls.name,
       ls.description,
       ls.meta,
       ls.config_json,
       ls.is_official,
       u.username AS owner_username,
       ls.created_at,
       ls.updated_at
     FROM layout_strategies ls
     LEFT JOIN users u ON u.id = ls.owner_user_id
     WHERE ls.owner_user_id = ?
     ORDER BY ls.updated_at DESC, ls.id DESC`,
    [userId],
  );

  return rows.map(mapLayoutStrategy);
}

export async function getOwnedLayoutStrategyById(layoutStrategyId: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<LayoutStrategyRow>(
    `SELECT
       ls.id,
       ls.owner_user_id,
       ls.code,
       ls.name,
       ls.description,
       ls.meta,
       ls.config_json,
       ls.is_official,
       u.username AS owner_username,
       ls.created_at,
       ls.updated_at
     FROM layout_strategies ls
     LEFT JOIN users u ON u.id = ls.owner_user_id
     WHERE ls.id = ? AND ls.owner_user_id = ?
     LIMIT 1`,
    [layoutStrategyId, userId],
  );

  return row ? mapLayoutStrategy(row) : null;
}

export async function createLayoutStrategy(input: {
  userId: number;
  name: string;
  description?: string | null;
  meta?: string | null;
  config?: Record<string, unknown>;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const name = input.name.trim();
  if (!name) {
    throw new Error("写作风格资产名称不能为空");
  }

  const config = {
    tone: String(input.config?.tone || "克制表达").trim() || "克制表达",
    paragraphLength: ["short", "medium", "long"].includes(String(input.config?.paragraphLength || "short"))
      ? String(input.config?.paragraphLength || "short")
      : "short",
    titleStyle: ["sharp", "serif", "plain"].includes(String(input.config?.titleStyle || "plain"))
      ? String(input.config?.titleStyle || "plain")
      : "plain",
    bannedWords: normalizeList(input.config?.bannedWords),
    bannedPunctuation: normalizeList(input.config?.bannedPunctuation),
  };

  const result = await db.exec(
    `INSERT INTO layout_strategies (
      owner_user_id, code, name, description, meta, config_json, is_official, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      `custom-${input.userId}-${Date.now()}`,
      name,
      input.description?.trim() || null,
      input.meta?.trim() || "自定义",
      config,
      false,
      now,
      now,
    ],
  );

  return getOwnedLayoutStrategyById(Number(result.lastInsertRowid), input.userId);
}
