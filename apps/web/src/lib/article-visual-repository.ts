import { getDatabase } from "./db";
import type { ArticleVisualAsset, ArticleVisualBrief, ArticleVisualBriefStatus } from "./article-visual-types";
import type { ArticleViralMode } from "./article-viral-modes";

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

function parseJsonArray(value: unknown) {
  const parsed = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  })() : value;
  return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function serializeJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

function normalizeVisualBriefViralMode(value: unknown) {
  return value === "power_shift_breaking" || value === "default" ? value as ArticleViralMode : null;
}

function mapBrief(row: {
  id: number;
  user_id: number;
  article_id: number;
  article_node_id: number | null;
  visual_scope: string;
  target_anchor: string;
  baoyu_skill: ArticleVisualBrief["baoyuSkill"];
  visual_type: ArticleVisualBrief["visualType"];
  layout_code: string | null;
  style_code: string | null;
  palette_code: string | null;
  rendering_code: string | null;
  text_level: ArticleVisualBrief["textLevel"] | null;
  mood_code: ArticleVisualBrief["moodCode"] | null;
  font_code: ArticleVisualBrief["fontCode"] | null;
  aspect_ratio: string;
  output_resolution: string;
  title: string;
  purpose: string;
  alt_text: string;
  caption: string | null;
  labels_json: string | null;
  source_facts_json: string | null;
  prompt_text: string | null;
  negative_prompt: string | null;
  prompt_hash: string | null;
  prompt_manifest_json: string | null | Record<string, unknown>;
  status: ArticleVisualBriefStatus;
  error_message: string | null;
  generated_asset_file_id: number | null;
  created_at: string;
  updated_at: string;
}): ArticleVisualBrief {
  return {
    id: row.id,
    userId: row.user_id,
    articleId: row.article_id,
    articleNodeId: row.article_node_id,
    visualScope: row.visual_scope as ArticleVisualBrief["visualScope"],
    targetAnchor: row.target_anchor,
    baoyuSkill: row.baoyu_skill,
    visualType: row.visual_type,
    layoutCode: row.layout_code,
    styleCode: row.style_code,
    paletteCode: row.palette_code,
    renderingCode: row.rendering_code,
    textLevel: row.text_level,
    moodCode: row.mood_code,
    fontCode: row.font_code,
    aspectRatio: row.aspect_ratio,
    outputResolution: row.output_resolution,
    title: row.title,
    purpose: row.purpose,
    viralMode: normalizeVisualBriefViralMode(parseJsonRecord(row.prompt_manifest_json)?.viralMode),
    altText: row.alt_text,
    caption: row.caption,
    labels: parseJsonArray(row.labels_json),
    sourceFacts: parseJsonArray(row.source_facts_json),
    promptText: row.prompt_text,
    negativePrompt: row.negative_prompt,
    promptHash: row.prompt_hash,
    promptManifest: parseJsonRecord(row.prompt_manifest_json),
    status: row.status,
    errorMessage: row.error_message,
    generatedAssetFileId: row.generated_asset_file_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertArticleVisualBrief(input: ArticleVisualBrief) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM article_visual_briefs
     WHERE user_id = ? AND article_id = ? AND visual_scope = ? AND target_anchor = ? AND visual_type = ?`,
    [input.userId, input.articleId, input.visualScope, input.targetAnchor, input.visualType],
  );
  const values = [
    input.userId,
    input.articleId,
    input.articleNodeId ?? null,
    input.visualScope,
    input.targetAnchor,
    input.baoyuSkill,
    input.visualType,
    input.layoutCode ?? null,
    input.styleCode ?? null,
    input.paletteCode ?? null,
    input.renderingCode ?? null,
    input.textLevel ?? null,
    input.moodCode ?? null,
    input.fontCode ?? null,
    input.aspectRatio,
    input.outputResolution,
    input.title,
    input.purpose,
    input.altText,
    input.caption ?? null,
    serializeJson(input.labels),
    serializeJson(input.sourceFacts),
    input.promptText ?? null,
    input.negativePrompt ?? null,
    input.promptHash ?? null,
    serializeJson(input.promptManifest),
    input.status ?? "prompt_ready",
    input.errorMessage ?? null,
    input.generatedAssetFileId ?? null,
  ];

  if (!existing) {
    const result = await db.exec(
      `INSERT INTO article_visual_briefs (
        user_id, article_id, article_node_id, visual_scope, target_anchor, baoyu_skill, visual_type,
        layout_code, style_code, palette_code, rendering_code, text_level, mood_code, font_code,
        aspect_ratio, output_resolution, title, purpose, alt_text, caption, labels_json, source_facts_json,
        prompt_text, negative_prompt, prompt_hash, prompt_manifest_json, status, error_message,
        generated_asset_file_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...values, now, now],
    );
    return Number(result.lastInsertRowid || 0);
  }

  await db.exec(
    `UPDATE article_visual_briefs
     SET user_id = ?, article_id = ?, article_node_id = ?, visual_scope = ?, target_anchor = ?,
         baoyu_skill = ?, visual_type = ?, layout_code = ?, style_code = ?, palette_code = ?,
         rendering_code = ?, text_level = ?, mood_code = ?, font_code = ?, aspect_ratio = ?,
         output_resolution = ?, title = ?, purpose = ?, alt_text = ?, caption = ?, labels_json = ?,
         source_facts_json = ?, prompt_text = ?, negative_prompt = ?, prompt_hash = ?,
         prompt_manifest_json = ?, status = ?, error_message = ?, generated_asset_file_id = ?, updated_at = ?
     WHERE id = ?`,
    [...values, now, existing.id],
  );
  return existing.id;
}

export async function replaceArticleVisualBriefs(input: {
  userId: number;
  articleId: number;
  briefs: ArticleVisualBrief[];
}) {
  const db = getDatabase();
  await db.transaction(async () => {
    for (const brief of input.briefs) {
      await upsertArticleVisualBrief(brief);
    }
  });
  return listArticleVisualBriefs(input.userId, input.articleId);
}

export async function listArticleVisualBriefs(userId: number, articleId: number) {
  const db = getDatabase();
  const rows = await db.query<Parameters<typeof mapBrief>[0]>(
    `SELECT *
     FROM article_visual_briefs
     WHERE user_id = ? AND article_id = ?
     ORDER BY CASE visual_scope WHEN 'cover' THEN 0 WHEN 'diagram' THEN 1 WHEN 'infographic' THEN 2 WHEN 'comic' THEN 3 ELSE 4 END, id ASC`,
    [userId, articleId],
  );
  return rows.map(mapBrief);
}

export async function getArticleVisualBrief(input: {
  userId: number;
  articleId: number;
  briefId: number;
}) {
  const db = getDatabase();
  const row = await db.queryOne<Parameters<typeof mapBrief>[0]>(
    `SELECT *
     FROM article_visual_briefs
     WHERE id = ? AND user_id = ? AND article_id = ?`,
    [input.briefId, input.userId, input.articleId],
  );
  return row ? mapBrief(row) : null;
}

export async function updateArticleVisualBriefStatus(input: {
  briefId: number;
  userId: number;
  status: ArticleVisualBriefStatus;
  errorMessage?: string | null;
  generatedAssetFileId?: number | null;
}) {
  const db = getDatabase();
  await db.exec(
    `UPDATE article_visual_briefs
     SET status = ?, error_message = ?, generated_asset_file_id = COALESCE(?, generated_asset_file_id), updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [input.status, input.errorMessage ?? null, input.generatedAssetFileId ?? null, new Date().toISOString(), input.briefId, input.userId],
  );
}

export async function listArticleVisualAssets(userId: number, articleId: number): Promise<ArticleVisualAsset[]> {
  const db = getDatabase();
  const rows = await db.query<{
    id: number;
    visual_brief_id: number | null;
    article_node_id: number | null;
    asset_type: string;
    public_url: string | null;
    alt_text: string | null;
    caption: string | null;
    insert_anchor: string | null;
    status: string;
    manifest_json: string | null | Record<string, unknown>;
  }>(
    `SELECT id, visual_brief_id, article_node_id, asset_type, public_url, alt_text, caption, insert_anchor, status, manifest_json
     FROM asset_files
     WHERE user_id = ? AND article_id = ? AND asset_scope = ?
     ORDER BY id ASC`,
    [userId, articleId, "visual_brief"],
  );
  return rows.map((row) => ({
    id: row.id,
    visualBriefId: row.visual_brief_id,
    articleNodeId: row.article_node_id,
    assetType: row.asset_type,
    publicUrl: row.public_url,
    altText: row.alt_text,
    caption: row.caption,
    insertAnchor: row.insert_anchor,
    status: row.status,
    manifest: parseJsonRecord(row.manifest_json),
  }));
}
