import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCardDetail, rebuildKnowledgeCard } from "@/lib/knowledge";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const existing = await getKnowledgeCardDetail(session.userId, Number(params.id));
    if (!existing) {
      return fail("主题档案不存在", 404);
    }
    const card = await rebuildKnowledgeCard(Number(params.id));
    await appendAuditLog({
      userId: session.userId,
      action: "knowledge.refresh",
      targetType: "knowledge_card",
      targetId: params.id,
    });
    return ok(card);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "知识刷新失败", 400);
  }
}
