import { ensureUserSession } from "@/lib/auth";
import { upsertFirstSuccessGuideState, getFirstSuccessGuideState } from "@/lib/first-success-guide";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const state = await getFirstSuccessGuideState(session.userId);
  return ok(state);
}

export async function PATCH(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "").trim();
    const current = await getFirstSuccessGuideState(session.userId);
    if (action === "set_step") {
      const stepId = Number(body.stepId);
      const completed = Boolean(body.completed);
      if (!Number.isInteger(stepId) || stepId <= 0) {
        return fail("步骤不存在", 400);
      }
      const completedSteps = completed
        ? Array.from(new Set([...current.completedSteps, stepId])).sort((left, right) => left - right)
        : current.completedSteps.filter((item) => item !== stepId);
      const state = await upsertFirstSuccessGuideState({
        userId: session.userId,
        completedSteps,
        lastViewedAt: new Date().toISOString(),
      });
      return ok(state);
    }
    if (action === "dismiss") {
      const state = await upsertFirstSuccessGuideState({
        userId: session.userId,
        dismissedAt: new Date().toISOString(),
        lastViewedAt: new Date().toISOString(),
      });
      return ok(state);
    }
    if (action === "reopen") {
      const state = await upsertFirstSuccessGuideState({
        userId: session.userId,
        dismissedAt: null,
        lastViewedAt: new Date().toISOString(),
      });
      return ok(state);
    }
    if (action === "viewed") {
      const state = await upsertFirstSuccessGuideState({
        userId: session.userId,
        lastViewedAt: new Date().toISOString(),
      });
      return ok(state);
    }
    return fail("不支持的引导状态动作", 400);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "首篇引导状态更新失败", 400);
  }
}
