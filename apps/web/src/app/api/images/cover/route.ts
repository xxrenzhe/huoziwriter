import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { generateCoverImage } from "@/lib/image-generation";
import {
  assertCoverImageAllowed,
  assertCoverImageQuota,
  assertCoverImageReferenceAllowed,
  consumeCoverImageQuota,
} from "@/lib/plan-access";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertCoverImageAllowed(session.userId);
    await assertCoverImageQuota(session.userId);
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
    const generated = await generateCoverImage({
      title: body.title || "Huozi Writer",
      referenceImageDataUrl,
    });
    const db = getDatabase();
    const createdAt = new Date().toISOString();
    await db.exec(
      `INSERT INTO cover_images (user_id, document_id, prompt, image_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [session.userId, body.documentId ?? null, generated.prompt, generated.imageUrl, createdAt],
    );
    const quota = await consumeCoverImageQuota(session.userId);
    await appendAuditLog({
      userId: session.userId,
      action: "cover_image.generate",
      targetType: "document",
      targetId: body.documentId ?? null,
      payload: { title: body.title, model: generated.model, endpoint: generated.endpoint, usedReferenceImage: Boolean(referenceImageDataUrl) },
    });
    return ok({
      imageUrl: generated.imageUrl,
      prompt: generated.prompt,
      createdAt,
      model: generated.model,
      providerName: generated.providerName,
      endpoint: generated.endpoint,
      quota,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "封面图生成失败", 400);
  }
}
