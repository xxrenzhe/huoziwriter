import { getDatabase } from "./db";

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

export async function syncLegacyTemplateVersionsToLayoutTemplates() {
  const db = getDatabase();
  const legacyRows = await db.query<{
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

  for (const row of legacyRows) {
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
