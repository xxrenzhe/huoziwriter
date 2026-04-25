import { ensureUserSession } from "@/lib/auth";
import { resumeArticleAutomationRun } from "@/lib/article-automation-orchestrator";
import { createArticleAutomationRun, getArticleAutomationRunsByUser } from "@/lib/article-automation-runs";
import { fail, ok } from "@/lib/http";

export async function GET(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 20);
  return ok({
    runs: await getArticleAutomationRunsByUser(session.userId, limit),
  });
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const created = await createArticleAutomationRun({
      userId: session.userId,
      inputMode: body.inputMode,
      inputText: body.inputText,
      sourceUrl: body.sourceUrl,
      targetWechatConnectionId: body.targetWechatConnectionId,
      targetSeriesId: body.targetSeriesId,
      automationLevel: body.automationLevel,
    });
    const autoStart = body.autoStart !== false;
    if (!autoStart) {
      return ok(created);
    }
    try {
      const resumed = await resumeArticleAutomationRun({
        runId: created.run.id,
        userId: session.userId,
      });
      return ok(resumed);
    } catch {
      return ok(created);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "自动化运行创建失败", 400);
  }
}
