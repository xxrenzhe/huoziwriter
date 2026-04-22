import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { runStrategyAuditForArticle } from "@/lib/strategy-audit-runtime";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    return ok(await runStrategyAuditForArticle({
      userId: session.userId,
      articleId: Number(params.id),
      body: await request.json().catch(() => ({})),
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "策略卡四元自检失败", 400);
  }
}
