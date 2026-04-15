import { getDatabase } from "./db";
import { PERSONA_IDENTITY_OPTIONS, PERSONA_WRITING_STYLE_OPTIONS } from "./persona-catalog";

export type PersonaTagType = "identity" | "writing_style";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function syncPersonaCatalogToPersonaTags() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const seeds = [
    ...PERSONA_IDENTITY_OPTIONS.map((label, index) => ({ tagType: "identity" as const, tagName: label, sortOrder: index + 1 })),
    ...PERSONA_WRITING_STYLE_OPTIONS.map((label, index) => ({ tagType: "writing_style" as const, tagName: label, sortOrder: index + 1 })),
  ];

  for (const seed of seeds) {
    const tagKey = `${seed.tagType}:${slugify(seed.tagName)}`;
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM persona_tags
       WHERE tag_key = ?`,
      [tagKey],
    );
    if (!existing) {
      await db.exec(
        `INSERT INTO persona_tags (
          tag_key, tag_name, tag_type, description, sort_order, is_active, is_system, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tagKey, seed.tagName, seed.tagType, null, seed.sortOrder, true, true, now, now],
      );
      continue;
    }
    await db.exec(
      `UPDATE persona_tags
       SET tag_name = ?, tag_type = ?, sort_order = ?, is_active = ?, is_system = ?, updated_at = ?
       WHERE id = ?`,
      [seed.tagName, seed.tagType, seed.sortOrder, true, true, now, existing.id],
    );
  }
}

export async function getPersonaTagCatalog() {
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    tag_key: string;
    tag_name: string;
    tag_type: PersonaTagType;
    description: string | null;
    sort_order: number | null;
    is_active: number | boolean;
  }>(
    `SELECT id, tag_key, tag_name, tag_type, description, sort_order, is_active
     FROM persona_tags
     WHERE is_active = ?
     ORDER BY tag_type ASC, sort_order ASC, id ASC`,
    [true],
  );

  return {
    identity: rows
      .filter((row) => row.tag_type === "identity")
      .map((row) => ({ id: row.id, key: row.tag_key, label: row.tag_name, description: row.description, sortOrder: row.sort_order ?? 0 })),
    writingStyle: rows
      .filter((row) => row.tag_type === "writing_style")
      .map((row) => ({ id: row.id, key: row.tag_key, label: row.tag_name, description: row.description, sortOrder: row.sort_order ?? 0 })),
  };
}

export async function getPersonaTagOptionValues() {
  const catalog = await getPersonaTagCatalog();
  return {
    identity: catalog.identity.map((item) => item.label),
    writingStyle: catalog.writingStyle.map((item) => item.label),
  };
}
