import { ensureUserSession } from "@/lib/auth";
import { resumeArticleAutomationRun } from "@/lib/article-automation-orchestrator";
import { getArticleAutomationRunById, resetArticleAutomationRunFromStage } from "@/lib/article-automation-runs";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "@/lib/plan22-prompt-catalog";
import { fail, ok } from "@/lib/http";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const runId = Number(params.id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return fail("自动化运行 ID 无效", 400);
  }

  const stageCode = String(params.stageCode || "").trim();
  if (!PLAN22_STAGE_PROMPT_DEFINITIONS.some((definition) => definition.stageCode === stageCode)) {
    return fail("自动化阶段不存在", 400);
  }

  const current = await getArticleAutomationRunById(runId, session.userId);
  if (!current) {
    return fail("自动化运行不存在", 404);
  }

  try {
    await resetArticleAutomationRunFromStage({
      runId,
      userId: session.userId,
      stageCode,
    });
    const result = await resumeArticleAutomationRun({
      runId,
      userId: session.userId,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "自动化阶段重跑失败", 400);
  }
}
