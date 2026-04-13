import { ensureUserSession } from "@/lib/auth";
import { appendAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { compileKnowledgeCardFromFragments } from "@/lib/knowledge";

export async function POST() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const card = await compileKnowledgeCardFromFragments(session.userId);
    await appendAuditLog({
      userId: session.userId,
      action: "knowledge.compile",
      targetType: "knowledge_card",
      targetId: card?.id,
    });
    return ok(card);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "知识编译失败", 400);
  }
}
