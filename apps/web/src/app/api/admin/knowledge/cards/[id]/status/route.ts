import { requireAdminAccess } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { updateKnowledgeCardStatus } from "@/lib/knowledge";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdminAccess();
    const body = await request.json();
    const updated = await updateKnowledgeCardStatus(Number(params.id), body.status);
    await appendAuditLog({
      userId: session.userId,
      action: "knowledge.admin_status",
      targetType: "knowledge_card",
      targetId: params.id,
      payload: { status: body.status },
    });
    return ok({
      id: updated?.id,
      status: updated?.status,
      updatedAt: updated?.updated_at,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新背景卡状态失败", 400);
  }
}
