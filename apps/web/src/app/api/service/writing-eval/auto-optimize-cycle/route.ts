import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoOptimizeWritingEvalCycle } from "@/lib/writing-eval-auto-cycle";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: {
    force?: boolean;
    autoFillLimit?: number;
    autoFillMaxImportsPerDataset?: number;
    autoGovernLimit?: number;
    autoGovernCooldownHours?: number;
    autoResolveLimit?: number;
    autoRolloutLimit?: number;
    autoRolloutCooldownHours?: number;
    promptRolloutLimit?: number;
    promptRolloutCooldownHours?: number;
    autoProposeLimit?: number;
    autoProposeCooldownHours?: number;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoOptimizeWritingEvalCycle({
        force: body.force,
        autoFillLimit: body.autoFillLimit,
        autoFillMaxImportsPerDataset: body.autoFillMaxImportsPerDataset,
        autoGovernLimit: body.autoGovernLimit,
        autoGovernCooldownHours: body.autoGovernCooldownHours,
        autoResolveLimit: body.autoResolveLimit,
        autoRolloutLimit: body.autoRolloutLimit,
        autoRolloutCooldownHours: body.autoRolloutCooldownHours,
        promptRolloutLimit: body.promptRolloutLimit,
        promptRolloutCooldownHours: body.promptRolloutCooldownHours,
        autoProposeLimit: body.autoProposeLimit,
        autoProposeCooldownHours: body.autoProposeCooldownHours,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测自动优化周期执行失败", 400);
  }
}
