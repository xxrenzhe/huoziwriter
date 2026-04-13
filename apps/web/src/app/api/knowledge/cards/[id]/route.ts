import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getKnowledgeCardDetail } from "@/lib/knowledge";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const card = await getKnowledgeCardDetail(session.userId, Number(params.id));
  if (!card) {
    return fail("主题档案不存在", 404);
  }
  return ok(card);
}
