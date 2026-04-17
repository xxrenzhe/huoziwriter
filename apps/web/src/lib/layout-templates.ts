import { STYLE_TEMPLATE_LIBRARY } from "./catalog";
import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

type LayoutTemplateSyncInput = {
  templateId: string;
  version: string;
  ownerUserId?: number | null;
  name: string;
  description?: string | null;
  sourceUrl?: string | null;
  meta?: string | null;
  config: Record<string, unknown>;
  isActive?: boolean;
};

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

function inferSchemaVersion(config: Record<string, unknown>) {
  const raw = String(config.schemaVersion || "").trim();
  return raw || "v2";
}

function inferVisibilityScope(ownerUserId?: number | null) {
  return ownerUserId == null ? "official" : "private";
}

export async function syncTemplateVersionToLayoutTemplates(input: LayoutTemplateSyncInput) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const isActive = input.isActive ?? true;
  const visibilityScope = inferVisibilityScope(input.ownerUserId);
  const existingTemplate = await db.queryOne<{ id: number }>(
    "SELECT id FROM layout_templates WHERE template_id = ?",
    [input.templateId],
  );

  if (!existingTemplate) {
    await db.exec(
      `INSERT INTO layout_templates (
        template_id, owner_user_id, name, description, source_url, meta, visibility_scope, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.templateId,
        input.ownerUserId ?? null,
        input.name,
        input.description ?? null,
        input.sourceUrl ?? null,
        input.meta ?? null,
        visibilityScope,
        isActive,
        now,
        now,
      ],
    );
  } else {
    await db.exec(
      `UPDATE layout_templates
       SET owner_user_id = ?, name = ?, description = ?, source_url = ?, meta = ?, visibility_scope = ?, is_active = ?, updated_at = ?
       WHERE template_id = ?`,
      [
        input.ownerUserId ?? null,
        input.name,
        input.description ?? null,
        input.sourceUrl ?? null,
        input.meta ?? null,
        visibilityScope,
        isActive,
        now,
        input.templateId,
      ],
    );
  }

  const configJson = JSON.stringify(input.config);
  const schemaVersion = inferSchemaVersion(input.config);
  const existingVersion = await db.queryOne<{ id: number }>(
    "SELECT id FROM layout_template_versions WHERE template_id = ? AND version = ?",
    [input.templateId, input.version],
  );
  if (!existingVersion) {
    await db.exec(
      `INSERT INTO layout_template_versions (
        template_id, version, schema_version, config_json, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.templateId, input.version, schemaVersion, configJson, isActive, now, now],
    );
  } else {
    await db.exec(
      `UPDATE layout_template_versions
       SET schema_version = ?, config_json = ?, is_active = ?, updated_at = ?
       WHERE template_id = ? AND version = ?`,
      [schemaVersion, configJson, isActive, now, input.templateId, input.version],
    );
  }
}

export async function backfillLayoutTemplatesFromTemplateVersions() {
  const db = getDatabase();
  const templateVersionRows = await db.query<{
    template_id: string;
    version: string;
    owner_user_id: number | null;
    name: string;
    description: string | null;
    source_url: string | null;
    config_json: string | Record<string, unknown> | null;
    is_active: number | boolean;
  }>(
    `SELECT template_id, version, owner_user_id, name, description, source_url, config_json, is_active
     FROM template_versions
     ORDER BY id ASC`,
  );

  for (const row of templateVersionRows) {
    let config: Record<string, unknown> = {};
    if (typeof row.config_json === "string") {
      try {
        config = JSON.parse(row.config_json) as Record<string, unknown>;
      } catch {
        config = {};
      }
    } else if (row.config_json && typeof row.config_json === "object" && !Array.isArray(row.config_json)) {
      config = row.config_json;
    }
    await syncTemplateVersionToLayoutTemplates({
      templateId: row.template_id,
      version: row.version,
      ownerUserId: row.owner_user_id,
      name: row.name,
      description: row.description,
      sourceUrl: row.source_url,
      config,
      isActive: Boolean(row.is_active),
    });
  }
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
       FROM articles
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
