import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { getDatabase } from "./db";

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

export async function getStyleGenomes(options?: { includePrivateForUserId?: number }) {
  const db = getDatabase();
  if (options?.includePrivateForUserId) {
    return db.query<{
      id: number;
      owner_user_id: number | null;
      source_genome_id: number | null;
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
       FROM style_genomes sg
       LEFT JOIN users u ON u.id = sg.owner_user_id
       WHERE sg.is_public = ? OR sg.owner_user_id = ?
       ORDER BY is_official DESC, published_at DESC, id DESC`,
      [true, options.includePrivateForUserId],
    );
  }

  return db.query<{
    id: number;
    owner_user_id: number | null;
    source_genome_id: number | null;
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
     FROM style_genomes sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE sg.is_public = ?
     ORDER BY is_official DESC, published_at DESC, id DESC`,
    [true],
  );
}

export async function getStyleGenomeById(genomeId: number, options?: { userId?: number }) {
  const db = getDatabase();
  const params: unknown[] = [genomeId];
  let where = "sg.id = ?";
  if (options?.userId) {
    where += " AND (sg.is_public = ? OR sg.owner_user_id = ?)";
    params.push(true, options.userId);
  }

  return db.queryOne<{
    id: number;
    owner_user_id: number | null;
    source_genome_id: number | null;
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
     FROM style_genomes sg
     LEFT JOIN users u ON u.id = sg.owner_user_id
     WHERE ${where}
     LIMIT 1`,
    params,
  );
}

export async function createGenomeFork(input: { sourceGenomeId: number; userId: number }) {
  const db = getDatabase();
  const source = await db.queryOne<{
    id: number;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
  }>("SELECT id, code, name, description, meta, config_json FROM style_genomes WHERE id = ?", [input.sourceGenomeId]);
  if (!source) {
    throw new Error("排版基因不存在");
  }
  const result = await db.exec(
    `INSERT INTO style_genomes (
      owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      source.id,
      `${source.code}-fork-${input.userId}-${Date.now()}`,
      `${source.name} Fork`,
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
    `INSERT INTO style_genome_forks (source_genome_id, target_genome_id, user_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [source.id, result.lastInsertRowid!, input.userId, new Date().toISOString()],
  );
  return db.queryOne("SELECT * FROM style_genomes WHERE id = ?", [result.lastInsertRowid!]);
}

export async function createStyleGenome(input: {
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
    throw new Error("排版基因名称不能为空");
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
    `INSERT INTO style_genomes (
      owner_user_id, source_genome_id, code, name, description, meta, config_json, is_public, is_official, published_at, created_at, updated_at
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
    source_genome_id: number | null;
    code: string;
    name: string;
    description: string | null;
    meta: string | null;
    config_json: string;
    is_public: number | boolean;
    is_official: number | boolean;
    published_at: string | null;
    created_at: string;
  }>("SELECT * FROM style_genomes WHERE id = ?", [result.lastInsertRowid!]);
}

export async function publishStyleGenome(input: { genomeId: number; userId: number }) {
  const db = getDatabase();
  await db.exec(
    `UPDATE style_genomes
     SET is_public = ?, published_at = ?, updated_at = ?
     WHERE id = ? AND owner_user_id = ?`,
    [true, new Date().toISOString(), new Date().toISOString(), input.genomeId, input.userId],
  );
}

export async function getActiveTemplates() {
  const db = getDatabase();
  const rows = await db.query<{
    template_id: string;
    version: string;
    name: string;
    description: string | null;
    config_json: string;
  }>("SELECT template_id, version, name, description, config_json FROM template_versions WHERE is_active = ? ORDER BY id ASC", [true]);

  if (rows.length > 0) {
    return rows.map((row) => ({
      id: row.template_id,
      version: row.version,
      name: row.name,
      description: row.description,
      meta: STYLE_TEMPLATE_LIBRARY.find((item) => item.id === row.template_id)?.meta ?? "模板",
      config: parseJson<Record<string, unknown>>(row.config_json, {}),
    }));
  }

  return STYLE_TEMPLATE_LIBRARY.map((template) => ({
    id: template.id,
    version: "v1.0.0",
    name: template.name,
    description: template.description,
    meta: template.meta,
    config: template.config,
  }));
}

export async function getActiveTemplateById(templateId: string) {
  const templates = await getActiveTemplates();
  return templates.find((template) => template.id === templateId) ?? null;
}
