import { ensureUserSession } from "@/lib/auth";
import { syncCoverAssetToAssetFiles } from "@/lib/asset-files";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { persistCoverImageAssetSet } from "@/lib/image-assets";
import { generateCoverImageCandidates } from "@/lib/image-generation";
import {
  assertCoverImageAllowed,
  assertCoverImageQuota,
  assertCoverImageReferenceAllowed,
  assertImageAssetStorageAvailable,
  consumeCoverImageQuota,
  getCoverImageGenerationStorageReserveBytes,
  getImageAssetStorageQuotaStatus,
} from "@/lib/plan-access";
import { getDocumentAuthoringStyleContext } from "@/lib/document-authoring-style-context";
import { ensureExtendedProductSchema } from "@/lib/schema-bootstrap";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await ensureExtendedProductSchema();
    await assertCoverImageAllowed(session.userId);
    await assertCoverImageQuota(session.userId);
    await assertImageAssetStorageAvailable(session.userId, {
      reserveBytes: getCoverImageGenerationStorageReserveBytes(),
    });
    const body = await request.json();
    const referenceImageDataUrl =
      typeof body.referenceImageDataUrl === "string" && body.referenceImageDataUrl.startsWith("data:image/")
        ? body.referenceImageDataUrl
        : null;
    if (body.referenceImageDataUrl && !referenceImageDataUrl) {
      return fail("参考图格式不合法，必须是 data:image/* 数据", 400);
    }
    if (referenceImageDataUrl) {
      await assertCoverImageReferenceAllowed(session.userId);
    }
    const authoringContext = await getDocumentAuthoringStyleContext(session.userId);
    const candidates = await generateCoverImageCandidates({
      title: body.title || "Huozi Writer",
      referenceImageDataUrl,
      authoringContext,
    });
    const db = getDatabase();
    const createdAt = new Date().toISOString();
    const batchToken = `cover-${session.userId}-${Date.now()}`;
    for (const candidate of candidates) {
      const storedAsset = await persistCoverImageAssetSet({
        userId: session.userId,
        documentId: body.documentId ?? null,
        batchToken,
        variantLabel: candidate.variantLabel,
        source: candidate.imageUrl,
      });
      const result = await db.exec(
        `INSERT INTO cover_image_candidates (
          user_id, document_id, batch_token, variant_label, prompt, image_url,
          storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json,
          is_selected, created_at
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.userId,
          body.documentId ?? null,
          batchToken,
          candidate.variantLabel,
          candidate.prompt,
          storedAsset.imageUrl,
          storedAsset.storageProvider,
          storedAsset.originalObjectKey,
          storedAsset.compressedObjectKey,
          storedAsset.thumbnailObjectKey,
          JSON.stringify(storedAsset.assetManifest),
          false,
          createdAt,
        ],
      );
      await syncCoverAssetToAssetFiles({
        assetScope: "candidate",
        legacyAssetId: Number(result.lastInsertRowid || 0),
        userId: session.userId,
        documentId: body.documentId ?? null,
        batchToken,
        variantLabel: candidate.variantLabel,
        imageUrl: storedAsset.imageUrl,
        storageProvider: storedAsset.storageProvider,
        originalObjectKey: storedAsset.originalObjectKey,
        compressedObjectKey: storedAsset.compressedObjectKey,
        thumbnailObjectKey: storedAsset.thumbnailObjectKey,
        assetManifestJson: storedAsset.assetManifest,
        createdAt,
      });
    }
    const savedCandidates = await db.query<{
      id: number;
      variant_label: string;
      prompt: string;
      image_url: string;
      asset_file_id: number | null;
    }>(
      body.documentId == null
        ? `SELECT cic.id, cic.variant_label, cic.prompt, cic.image_url, af.id as asset_file_id
           FROM cover_image_candidates cic
           LEFT JOIN asset_files af ON af.asset_scope = ? AND af.legacy_asset_id = cic.id
           WHERE cic.user_id = ? AND cic.document_id IS NULL AND cic.batch_token = ?
           ORDER BY cic.id ASC`
        : `SELECT cic.id, cic.variant_label, cic.prompt, cic.image_url, af.id as asset_file_id
           FROM cover_image_candidates cic
           LEFT JOIN asset_files af ON af.asset_scope = ? AND af.legacy_asset_id = cic.id
           WHERE cic.user_id = ? AND cic.document_id = ? AND cic.batch_token = ?
           ORDER BY cic.id ASC`,
      body.documentId == null ? ["candidate", session.userId, batchToken] : ["candidate", session.userId, body.documentId, batchToken],
    );
    const quota = await consumeCoverImageQuota(session.userId);
    const storageQuota = await getImageAssetStorageQuotaStatus(session.userId);
    await appendAuditLog({
      userId: session.userId,
      action: "cover_image.generate",
      targetType: "document",
      targetId: body.documentId ?? null,
      payload: {
        title: body.title,
        model: candidates[0]?.model,
        endpoint: candidates[0]?.endpoint,
        usedReferenceImage: Boolean(referenceImageDataUrl),
        candidateCount: candidates.length,
      },
    });
    return ok({
      batchToken,
      candidates: savedCandidates.map((candidate) => ({
        id: candidate.id,
        variantLabel: candidate.variant_label,
        imageUrl: candidate.image_url,
        prompt: candidate.prompt,
        assetFileId: candidate.asset_file_id,
      })),
      createdAt,
      model: candidates[0]?.model,
      providerName: candidates[0]?.providerName,
      endpoint: candidates[0]?.endpoint,
      quota,
      storageQuota,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "封面图生成失败", 400);
  }
}
