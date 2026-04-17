import { requireAdminAccess } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { rebuildKnowledgeCard } from "@/lib/knowledge";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdminAccess();
    const card = await rebuildKnowledgeCard(Number(params.id));
    await appendAuditLog({
      userId: session.userId,
      action: "knowledge.admin_rebuild",
      targetType: "knowledge_card",
      targetId: params.id,
    });
    return ok(card);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "后台重编译失败", 400);
  }
}
