import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoManagePromptRollouts } from "@/lib/prompt-rollout";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { promptId?: string; force?: boolean; cooldownHours?: number; limit?: number } = {};
  try {
    body = (await request.json()) as { promptId?: string; force?: boolean; cooldownHours?: number; limit?: number };
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoManagePromptRollouts({
        promptId: body.promptId,
        force: body.force,
        cooldownHours: body.cooldownHours,
        limit: body.limit,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Prompt 自动放量失败", 400);
  }
}
