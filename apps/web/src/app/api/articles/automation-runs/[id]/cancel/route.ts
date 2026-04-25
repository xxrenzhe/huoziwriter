import { ensureUserSession } from "@/lib/auth";
import { cancelArticleAutomationRun } from "@/lib/article-automation-runs";
import { fail, ok } from "@/lib/http";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const runId = Number(params.id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return fail("自动化运行 ID 无效", 400);
  }
  const result = await cancelArticleAutomationRun(runId, session.userId);
  if (!result) {
    return fail("自动化运行不存在或不可取消", 404);
  }
  return ok(result);
}
