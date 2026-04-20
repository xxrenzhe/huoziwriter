import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateImaKnowledgeBase } from "@/lib/ima-connections";

export async function PATCH(request: Request, { params }: { params: { id: string; kbRowId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const connectionId = Number(params.id);
    const kbRowId = Number(params.kbRowId);
    if (!Number.isFinite(connectionId) || !Number.isFinite(kbRowId)) {
      throw new Error("知识库不存在");
    }
    const body = await request.json().catch(() => ({}));
    await updateImaKnowledgeBase({
      userId: session.userId,
      connectionId,
      kbRowId,
      isEnabled: typeof body.isEnabled === "boolean" ? body.isEnabled : undefined,
      isDefault: Boolean(body.isDefault),
    });
    return ok({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "IMA 知识库更新失败", 400);
  }
}
