import { dispatchDueWritingEvalRunSchedules } from "@/lib/writing-eval";
import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { limit?: number; triggerMode?: string; agentStrategy?: string | null } = {};
  try {
    body = (await request.json()) as { limit?: number; triggerMode?: string; agentStrategy?: string | null };
  } catch {
    body = {};
  }

  try {
    return ok(
      await dispatchDueWritingEvalRunSchedules({
        limit: body.limit,
        triggerMode: body.triggerMode,
        agentStrategy: body.agentStrategy,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测调度派发失败", 500);
  }
}
