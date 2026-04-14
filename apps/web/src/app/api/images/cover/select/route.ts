import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { ensureExtendedProductSchema } from "@/lib/schema-bootstrap";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await ensureExtendedProductSchema();
    const body = await request.json();
    const candidateId = Number(body.candidateId);
    if (!candidateId) {
      return fail("candidateId 不能为空", 400);
    }
    const db = getDatabase();
    const candidate = await db.queryOne<{
      id: number;
      user_id: number;
      document_id: number | null;
      batch_token: string;
      variant_label: string;
      prompt: string;
      image_url: string;
      storage_provider: string | null;
      original_object_key: string | null;
      compressed_object_key: string | null;
      thumbnail_object_key: string | null;
      asset_manifest_json: string | null;
    }>(
      `SELECT id, user_id, document_id, batch_token, variant_label, prompt, image_url,
              storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json
       FROM cover_image_candidates
       WHERE id = ? AND user_id = ?`,
      [candidateId, session.userId],
    );
    if (!candidate) {
      return fail("封面图候选不存在", 404);
    }

    const createdAt = new Date().toISOString();
    await db.exec(
      `INSERT INTO cover_images (
        user_id, document_id, prompt, image_url, storage_provider, original_object_key, compressed_object_key, thumbnail_object_key, asset_manifest_json, created_at
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.userId,
        candidate.document_id,
        candidate.prompt,
        candidate.image_url,
        candidate.storage_provider,
        candidate.original_object_key,
        candidate.compressed_object_key,
        candidate.thumbnail_object_key,
        candidate.asset_manifest_json,
        createdAt,
      ],
    );
    await db.exec(
      `UPDATE cover_image_candidates
       SET is_selected = ?, selected_at = ?
       WHERE batch_token = ? AND user_id = ?`,
      [false, null, candidate.batch_token, session.userId],
    );
    await db.exec(
      `UPDATE cover_image_candidates
       SET is_selected = ?, selected_at = ?
       WHERE id = ? AND user_id = ?`,
      [true, createdAt, candidate.id, session.userId],
    );

    await appendAuditLog({
      userId: session.userId,
      action: "cover_image.select",
      targetType: "document",
      targetId: candidate.document_id,
      payload: { candidateId: candidate.id, batchToken: candidate.batch_token, variantLabel: candidate.variant_label },
    });

    return ok({
      id: candidate.id,
      imageUrl: candidate.image_url,
      prompt: candidate.prompt,
      variantLabel: candidate.variant_label,
      createdAt,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选择封面图失败", 400);
  }
}
