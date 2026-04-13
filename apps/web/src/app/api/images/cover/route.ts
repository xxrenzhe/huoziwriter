import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { generateCoverImage } from "@/lib/image-generation";
import { assertCoverImageAllowed } from "@/lib/plan-access";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertCoverImageAllowed(session.userId);
    const body = await request.json();
    const generated = await generateCoverImage({
      title: body.title || "Huozi Writer",
    });
    const db = getDatabase();
    await db.exec(
      `INSERT INTO cover_images (user_id, document_id, prompt, image_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [session.userId, body.documentId ?? null, generated.prompt, generated.imageUrl, new Date().toISOString()],
    );
    await appendAuditLog({
      userId: session.userId,
      action: "cover_image.generate",
      targetType: "document",
      targetId: body.documentId ?? null,
      payload: { title: body.title, model: generated.model, endpoint: generated.endpoint },
    });
    return ok({
      imageUrl: generated.imageUrl,
      prompt: generated.prompt,
      model: generated.model,
      providerName: generated.providerName,
      endpoint: generated.endpoint,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "封面图生成失败", 400);
  }
}
