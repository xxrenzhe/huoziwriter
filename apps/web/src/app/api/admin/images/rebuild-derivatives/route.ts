import { requireAdmin } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { persistCoverImageAssetSet, resolveStoredImageAssetSource } from "@/lib/image-assets";
import { ensureExtendedProductSchema } from "@/lib/schema-bootstrap";

type LegacyImageAssetRow = {
  assetScope: "cover" | "candidate";
  id: number;
  userId: number;
  documentId: number | null;
  batchToken: string | null;
  variantLabel: string | null;
  imageUrl: string;
  storageProvider: string | null;
  originalObjectKey: string | null;
  assetManifestJson: string | null;
};

function parseManifest(value: string | null) {
  if (!value) return null as Record<string, unknown> | null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function needsDerivativeRebuild(value: string | null) {
  const manifest = parseManifest(value);
  const derivativeMode = String(manifest?.derivativeMode || "").trim();
  return !derivativeMode || derivativeMode === "passthrough" || derivativeMode === "passthrough-fallback";
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    await ensureExtendedProductSchema();
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit || 20)));
    const db = getDatabase();
    const rows = await db.query<{
      asset_scope: string;
      id: number;
      user_id: number;
      document_id: number | null;
      batch_token: string | null;
      variant_label: string | null;
      image_url: string;
      storage_provider: string | null;
      original_object_key: string | null;
      asset_manifest_json: string | null;
    }>(
      `SELECT *
       FROM (
         SELECT 'cover' as asset_scope, id, user_id, document_id, NULL as batch_token, NULL as variant_label, image_url, storage_provider, original_object_key, asset_manifest_json
         FROM cover_images
         UNION ALL
         SELECT 'candidate' as asset_scope, id, user_id, document_id, batch_token, variant_label, image_url, storage_provider, original_object_key, asset_manifest_json
         FROM cover_image_candidates
       )
       ORDER BY id ASC
       LIMIT 500`,
    );

    const targets = rows
      .map(
        (row) =>
          ({
            assetScope: row.asset_scope === "candidate" ? "candidate" : "cover",
            id: row.id,
            userId: row.user_id,
            documentId: row.document_id,
            batchToken: row.batch_token,
            variantLabel: row.variant_label,
            imageUrl: row.image_url,
            storageProvider: row.storage_provider,
            originalObjectKey: row.original_object_key,
            assetManifestJson: row.asset_manifest_json,
          }) satisfies LegacyImageAssetRow,
      )
      .filter((row) => needsDerivativeRebuild(row.assetManifestJson))
      .slice(0, limit);

    const failures: Array<{ assetScope: string; id: number; message: string }> = [];
    let rebuiltCount = 0;

    for (const target of targets) {
      try {
        const rebuilt = await persistCoverImageAssetSet({
          userId: target.userId,
          documentId: target.documentId,
          batchToken: target.batchToken,
          variantLabel: target.variantLabel,
          source: resolveStoredImageAssetSource({
            imageUrl: target.imageUrl,
            storageProvider: target.storageProvider,
            originalObjectKey: target.originalObjectKey,
          }),
        });
        if (target.assetScope === "cover") {
          await db.exec(
            `UPDATE cover_images
             SET image_url = ?, storage_provider = ?, original_object_key = ?, compressed_object_key = ?, thumbnail_object_key = ?, asset_manifest_json = ?
             WHERE id = ?`,
            [
              rebuilt.imageUrl,
              rebuilt.storageProvider,
              rebuilt.originalObjectKey,
              rebuilt.compressedObjectKey,
              rebuilt.thumbnailObjectKey,
              JSON.stringify(rebuilt.assetManifest),
              target.id,
            ],
          );
        } else {
          await db.exec(
            `UPDATE cover_image_candidates
             SET image_url = ?, storage_provider = ?, original_object_key = ?, compressed_object_key = ?, thumbnail_object_key = ?, asset_manifest_json = ?
             WHERE id = ?`,
            [
              rebuilt.imageUrl,
              rebuilt.storageProvider,
              rebuilt.originalObjectKey,
              rebuilt.compressedObjectKey,
              rebuilt.thumbnailObjectKey,
              JSON.stringify(rebuilt.assetManifest),
              target.id,
            ],
          );
        }
        rebuiltCount += 1;
      } catch (error) {
        failures.push({
          assetScope: target.assetScope,
          id: target.id,
          message: error instanceof Error ? error.message : "重建失败",
        });
      }
    }

    await appendAuditLog({
      userId: session.userId,
      action: "admin.image_assets.rebuild_derivatives",
      targetType: "image_asset",
      targetId: String(rebuiltCount),
      payload: {
        requestedLimit: limit,
        rebuiltCount,
        failureCount: failures.length,
        failures: failures.slice(0, 5),
      },
    });

    return ok({
      requestedLimit: limit,
      scannedCount: rows.length,
      matchedCount: targets.length,
      rebuiltCount,
      failureCount: failures.length,
      failures: failures.slice(0, 10),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "旧图片资产重建失败", 400);
  }
}
