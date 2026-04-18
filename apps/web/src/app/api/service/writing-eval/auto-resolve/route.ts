import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoResolveWritingEvalRun, autoResolveWritingEvalRuns } from "@/lib/writing-eval";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { runId?: number; decision?: string | null; reason?: string | null; limit?: number; dryRun?: boolean } = {};
  try {
    body = (await request.json()) as { runId?: number; decision?: string | null; reason?: string | null; limit?: number; dryRun?: boolean };
  } catch {
    body = {};
  }

  try {
    if (!body.runId) {
      return ok(
        await autoResolveWritingEvalRuns({
          operatorUserId: null,
          limit: body.limit,
          dryRun: body.dryRun,
        }),
      );
    }
    return ok(
      await autoResolveWritingEvalRun({
        runId: Number(body.runId),
        decision: body.decision,
        reason: body.reason,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测自动决议失败", 400);
  }
}
