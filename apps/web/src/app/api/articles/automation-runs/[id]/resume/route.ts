import { ensureUserSession } from "@/lib/auth";
import { resumeArticleAutomationRun } from "@/lib/article-automation-orchestrator";
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
  try {
    const result = await resumeArticleAutomationRun({
      runId,
      userId: session.userId,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "自动化运行恢复失败", 400);
  }
}
