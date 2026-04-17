import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

function parseJson<T>(value: string | null, fallback: T) {
  if (!value) return fallback;
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

export async function getLayoutStrategies(options?: { includePrivateForUserId?: number }) {
  const db = getDatabase();
  if (options?.includePrivateForUserId) {
    return db.query<{
      id: number;
      owner_user_id: number | null;
      source_layout_strategy_id: number | null;
      code: string;
      name: string;
      description: string | null;
      meta: string | null;
      config_json: string;
      is_public: number | boolean;
      is_official: number | boolean;
      owner_username: string | null;
      published_at: string | null;
      created_at: string;
    }>(
      `SELECT
         sg.*,
         u.username as owner_username
       FROM layout_strategies sg
       LEFT JOIN users u ON u.id = sg.owner_user_id
       WHERE sg.is_public = ? OR sg.owner_user_id = ?
       ORDER BY is_official DESC, published_at DESC, id DESC`,
      [true, options.includePrivateForUserId],
    );
  }

  return db.query<{
    id: number;
    owner_user_id: number | null;
    source_layout_strategy_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    owner_username: string | null;
    published_at: string | null;
    created_at: string;
  }>(
    `SELECT
       sg.*,
       u.username as owner_username
     FROM layout_strategies sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE sg.is_public = ?
     ORDER BY is_official DESC, published_at DESC, id DESC`,
    [true],
  );
}

export async function getLayoutStrategyById(layoutStrategyId: number, options?: { userId?: number }) {
  const db = getDatabase();
  const params: unknown[] = [layoutStrategyId];
  let where = "sg.id = ?";
  if (options?.userId) {
    where += " AND (sg.is_public = ? OR sg.owner_user_id = ?)";
    params.push(true, options.userId);
  }

  return db.queryOne<{
    id: number;
    owner_user_id: number | null;
    source_layout_strategy_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    owner_username: string | null;
    published_at: string | null;
    created_at: string;
  }>(
    `SELECT
       sg.*,
       u.username as owner_username
     FROM layout_strategies sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE ${where}
     LIMIT 1`,
    params,
  );
}

export async function getOwnedLayoutStrategies(userId: number) {
  const db = getDatabase();
  return db.query<{
    id: number;
    owner_user_id: number | null;
    source_layout_strategy_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    owner_username: string | null;
    published_at: string | null;
    created_at: string;
  }>(
    `SELECT
       sg.*,
       u.username as owner_username
     FROM layout_strategies sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE sg.owner_user_id = ?
     ORDER BY published_at DESC, id DESC`,
    [userId],
  );
}

export async function getOwnedLayoutStrategyById(layoutStrategyId: number, userId: number) {
  const db = getDatabase();
  return db.queryOne<{
    id: number;
    owner_user_id: number | null;
    source_layout_strategy_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    owner_username: string | null;
    published_at: string | null;
    created_at: string;
  }>(
    `SELECT
       sg.*,
       u.username as owner_username
     FROM layout_strategies sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE sg.id = ? AND sg.owner_user_id = ?
     LIMIT 1`,
    [layoutStrategyId, userId],
  );
}

export async function createLayoutStrategyFork(input: { sourceLayoutStrategyId: number; userId: number }) {
  const db = getDatabase();
  const source = await db.queryOne<{
    id: number;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
  }>("SELECT id, code, name, description, meta, config_json FROM layout_strategies WHERE id = ?", [input.sourceLayoutStrategyId]);
  if (!source) {
    throw new Error("写作风格资产不存在");
  }
  const result = await db.exec(
    `INSERT INTO layout_strategies (
      owner_user_id, source_layout_strategy_id, code, name, description, meta, config_json, is_public, is_official, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      source.id,
      `${source.code}-fork-${input.userId}-${Date.now()}`,
      `${source.name} 副本`,
      source.description,
      source.meta,
      source.config_json,
      false,
      false,
      null,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  await db.exec(
    `INSERT INTO layout_strategy_forks (source_layout_strategy_id, target_layout_strategy_id, user_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [source.id, result.lastInsertRowid!, input.userId, new Date().toISOString()],
  );
  return db.queryOne("SELECT * FROM layout_strategies WHERE id = ?", [result.lastInsertRowid!]);
}

export async function createLayoutStrategy(input: {
  userId: number;
  name: string;
  description?: string | null;
  meta?: string | null;
  config?: Record<string, unknown>;
}) {
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
      owner_user_id, source_layout_strategy_id, code, name, description, meta, config_json, is_public, is_official, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      null,
      `custom-${input.userId}-${Date.now()}`,
      name,
      input.description?.trim() || null,
      input.meta?.trim() || "自定义",
      config,
      false,
      false,
      null,
      now,
      now,
    ],
  );

  return db.queryOne<{
    id: number;
    owner_user_id: number | null;
    source_layout_strategy_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    published_at: string | null;
    created_at: string;
  }>("SELECT * FROM layout_strategies WHERE id = ?", [result.lastInsertRowid!]);
}

export async function publishLayoutStrategy(input: { layoutStrategyId: number; userId: number }) {
  const db = getDatabase();
  await db.exec(
    `UPDATE layout_strategies
     SET is_public = ?, published_at = ?, updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    [true, new Date().toISOString(), new Date().toISOString(), input.layoutStrategyId, input.userId],
  );
}

export async function getActiveTemplates(userId?: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const rows = await db.query<{
    template_id: string;
    version: string;
    name: string;
    description: string | null;
    owner_user_id: number | null;
    source_url: string | null;
    meta: string | null;
    config_json: string;
  }>(
    userId
      ? `SELECT
           lt.template_id,
           ltv.version,
           lt.name,
           lt.description,
           lt.owner_user_id,
           lt.source_url,
           lt.meta,
           ltv.config_json
         FROM layout_templates lt
         JOIN layout_template_versions ltv ON ltv.template_id = lt.template_id
         WHERE lt.is_active = ? AND ltv.is_active = ? AND (lt.owner_user_id IS NULL OR lt.owner_user_id = ?)
         ORDER BY CASE WHEN lt.owner_user_id IS NULL THEN 0 ELSE 1 END, lt.id ASC, ltv.id ASC`
      : `SELECT
           lt.template_id,
           ltv.version,
           lt.name,
           lt.description,
           lt.owner_user_id,
           lt.source_url,
           lt.meta,
           ltv.config_json
         FROM layout_templates lt
         JOIN layout_template_versions ltv ON ltv.template_id = lt.template_id
         WHERE lt.is_active = ? AND ltv.is_active = ? AND lt.owner_user_id IS NULL
         ORDER BY lt.id ASC, ltv.id ASC`,
    userId ? [true, true, userId] : [true, true],
  );

  const privateTemplateUsage = new Map<string, { usageCount: number; lastUsedAt: string | null }>();
  if (userId) {
    const usageRows = await db.query<{
      wechat_template_id: string;
      usage_count: number;
      last_used_at: string | null;
    }>(
      `SELECT wechat_template_id, COUNT(*) as usage_count, MAX(updated_at) as last_used_at
       FROM documents
       WHERE user_id = ? AND wechat_template_id IS NOT NULL
       GROUP BY wechat_template_id`,
      [userId],
    );
    for (const row of usageRows) {
      privateTemplateUsage.set(row.wechat_template_id, {
        usageCount: Number(row.usage_count || 0),
        lastUsedAt: row.last_used_at,
      });
    }
  }

  if (rows.length > 0) {
    return rows.map((row) => ({
      ...(row.owner_user_id != null ? privateTemplateUsage.get(row.template_id) ?? { usageCount: 0, lastUsedAt: null } : { usageCount: 0, lastUsedAt: null }),
      id: row.template_id,
      version: row.version,
      name: row.name,
      description: row.description,
      meta: row.meta ?? STYLE_TEMPLATE_LIBRARY.find((item) => item.id === row.template_id)?.meta ?? "模板",
      ownerUserId: row.owner_user_id,
      sourceUrl: row.source_url,
      config: parseJson<Record<string, unknown>>(row.config_json, {}),
    }));
  }

  return STYLE_TEMPLATE_LIBRARY.map((template) => ({
    usageCount: 0,
    lastUsedAt: null,
    id: template.id,
    version: "v1.0.0",
    name: template.name,
    description: template.description,
    meta: template.meta,
    ownerUserId: null,
    sourceUrl: null,
    config: template.config,
  }));
}

export async function getActiveTemplateById(templateId: string, userId?: number) {
  const templates = await getActiveTemplates(userId);
  return templates.find((template) => template.id === templateId) ?? null;
}
