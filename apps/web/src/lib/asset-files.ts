import { getDatabase } from "./db";

type AssetFileScope = "cover" | "candidate" | "visual_brief";

type AssetFileSyncInput = {
  assetScope: AssetFileScope;
  sourceRecordId: number;
  userId: number;
  articleId?: number | null;
  batchToken?: string | null;
  variantLabel?: string | null;
  imageUrl: string;
  storageProvider?: string | null;
  originalObjectKey?: string | null;
  compressedObjectKey?: string | null;
  thumbnailObjectKey?: string | null;
  assetManifestJson?: string | Record<string, unknown> | null;
  assetType?: string | null;
  visualBriefId?: number | null;
  articleNodeId?: number | null;
  insertAnchor?: string | null;
  altText?: string | null;
  caption?: string | null;
  createdAt?: string | null;
};

function normalizeManifest(value: string | Record<string, unknown> | null | undefined) {
  if (!value) return null as Record<string, unknown> | null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export async function syncCoverAssetToAssetFiles(input: AssetFileSyncInput) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const manifest = normalizeManifest(input.assetManifestJson);
  const compressed = manifest?.compressed as Record<string, unknown> | undefined;
  const original = manifest?.original as Record<string, unknown> | undefined;
  const publicUrl = String(input.imageUrl || compressed?.publicUrl || original?.publicUrl || "").trim();
  const mimeType = String(compressed?.contentType || original?.contentType || manifest?.contentType || "").trim() || null;
  const byteLength = Number(compressed?.byteLength || original?.byteLength || manifest?.byteLength || 0) || null;
  const manifestJson = manifest ? JSON.stringify(manifest) : null;
  const status = publicUrl ? "ready" : "pending";

  const existing = await db.queryOne<{ id: number }>(
    `SELECT id
     FROM asset_files
     WHERE asset_scope = ? AND source_record_id = ?`,
    [input.assetScope, input.sourceRecordId],
  );

  if (!existing) {
    const result = await db.exec(
      `INSERT INTO asset_files (
        user_id, article_id, asset_scope, asset_type, source_record_id, batch_token, variant_label,
        storage_provider, public_url, original_object_key, compressed_object_key, thumbnail_object_key,
        mime_type, byte_length, status, manifest_json, visual_brief_id, article_node_id, insert_anchor,
        alt_text, caption, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.articleId ?? null,
        input.assetScope,
        input.assetType || "cover_image",
        input.sourceRecordId,
        input.batchToken ?? null,
        input.variantLabel ?? null,
        input.storageProvider ?? null,
        publicUrl || input.imageUrl,
        input.originalObjectKey ?? null,
        input.compressedObjectKey ?? null,
        input.thumbnailObjectKey ?? null,
        mimeType,
        byteLength,
        status,
        manifestJson,
        input.visualBriefId ?? null,
        input.articleNodeId ?? null,
        input.insertAnchor ?? null,
        input.altText ?? null,
        input.caption ?? null,
        input.createdAt ?? now,
        now,
      ],
    );
    return Number(result.lastInsertRowid || 0);
  }

  await db.exec(
    `UPDATE asset_files
     SET user_id = ?, article_id = ?, asset_type = ?, batch_token = ?, variant_label = ?, storage_provider = ?,
         public_url = ?, original_object_key = ?, compressed_object_key = ?, thumbnail_object_key = ?,
         mime_type = ?, byte_length = ?, status = ?, manifest_json = ?, visual_brief_id = ?, article_node_id = ?,
         insert_anchor = ?, alt_text = ?, caption = ?, updated_at = ?
     WHERE asset_scope = ? AND source_record_id = ?`,
    [
      input.userId,
      input.articleId ?? null,
      input.assetType || "cover_image",
      input.batchToken ?? null,
      input.variantLabel ?? null,
      input.storageProvider ?? null,
      publicUrl || input.imageUrl,
      input.originalObjectKey ?? null,
      input.compressedObjectKey ?? null,
      input.thumbnailObjectKey ?? null,
      mimeType,
      byteLength,
      status,
      manifestJson,
      input.visualBriefId ?? null,
      input.articleNodeId ?? null,
      input.insertAnchor ?? null,
      input.altText ?? null,
      input.caption ?? null,
      now,
      input.assetScope,
      input.sourceRecordId,
    ],
  );
  return existing.id;
}

export async function syncArticleCoverAssetToAssetFiles(input: AssetFileSyncInput) {
  return syncCoverAssetToAssetFiles({
    ...input,
    articleId: input.articleId ?? null,
  });
}

export async function syncArticleVisualAssetToAssetFiles(input: AssetFileSyncInput & {
  visualBriefId: number;
  articleNodeId?: number | null;
  assetType: "cover_image" | "inline_image" | "infographic" | "diagram_svg" | "diagram_png";
  insertAnchor?: string | null;
  altText?: string | null;
  caption?: string | null;
}) {
  return syncCoverAssetToAssetFiles({
    ...input,
    assetScope: "visual_brief",
    sourceRecordId: input.visualBriefId,
    visualBriefId: input.visualBriefId,
    articleNodeId: input.articleNodeId ?? null,
    assetType: input.assetType,
    insertAnchor: input.insertAnchor ?? null,
    altText: input.altText ?? null,
    caption: input.caption ?? null,
  });
}

export async function backfillAssetFilesFromCoverAssets() {
  const db = getDatabase();
  const coverRows = await db.query<{
    id: number;
    user_id: number;
    article_id: number | null;
    image_url: string;
    storage_provider: string | null;
    original_object_key: string | null;
    compressed_object_key: string | null;
    thumbnail_object_key: string | null;
    asset_manifest_json: string | null;
    created_at: string | null;
  }>(
    `SELECT
       id, user_id, article_id AS article_id, image_url, storage_provider, original_object_key,
       compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
     FROM cover_images
     ORDER BY id ASC`,
  );
  for (const row of coverRows) {
    await syncCoverAssetToAssetFiles({
      assetScope: "cover",
      sourceRecordId: row.id,
      userId: row.user_id,
      articleId: row.article_id,
      imageUrl: row.image_url,
      storageProvider: row.storage_provider,
      originalObjectKey: row.original_object_key,
      compressedObjectKey: row.compressed_object_key,
      thumbnailObjectKey: row.thumbnail_object_key,
      assetManifestJson: row.asset_manifest_json,
      createdAt: row.created_at,
    });
  }

  const candidateRows = await db.query<{
    id: number;
    user_id: number;
    article_id: number | null;
    batch_token: string | null;
    variant_label: string | null;
    image_url: string;
    storage_provider: string | null;
    original_object_key: string | null;
    compressed_object_key: string | null;
    thumbnail_object_key: string | null;
    asset_manifest_json: string | null;
    created_at: string | null;
  }>(
    `SELECT
       id, user_id, article_id AS article_id, batch_token, variant_label, image_url, storage_provider,
       original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
     FROM cover_image_candidates
     ORDER BY id ASC`,
  );
  for (const row of candidateRows) {
    await syncCoverAssetToAssetFiles({
      assetScope: "candidate",
      sourceRecordId: row.id,
      userId: row.user_id,
      articleId: row.article_id,
      batchToken: row.batch_token,
      variantLabel: row.variant_label,
      imageUrl: row.image_url,
      storageProvider: row.storage_provider,
      originalObjectKey: row.original_object_key,
      compressedObjectKey: row.compressed_object_key,
      thumbnailObjectKey: row.thumbnail_object_key,
      assetManifestJson: row.asset_manifest_json,
      createdAt: row.created_at,
    });
  }
}
