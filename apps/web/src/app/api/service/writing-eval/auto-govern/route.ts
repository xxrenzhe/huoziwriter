import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoGovernWritingEvalRisks } from "@/lib/writing-eval-governance";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: {
    limit?: number;
    recentWindowDays?: number;
    insightLimit?: number;
    rolloutDays?: number;
    cooldownHours?: number;
    maxRetryActionsPerRun?: number;
    dryRun?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoGovernWritingEvalRisks({
        triggerMode: "service_auto",
        operatorUserId: null,
        limit: body.limit,
        recentWindowDays: body.recentWindowDays,
        insightLimit: body.insightLimit,
        rolloutDays: body.rolloutDays,
        cooldownHours: body.cooldownHours,
        maxRetryActionsPerRun: body.maxRetryActionsPerRun,
        dryRun: body.dryRun,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测自动治理失败", 400);
  }
}
