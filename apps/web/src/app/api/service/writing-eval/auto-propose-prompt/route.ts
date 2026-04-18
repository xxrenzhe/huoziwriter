import { fail, ok } from "@/lib/http";
import { autoProposeWritingEvalPromptCandidates } from "@/lib/prompt-candidates";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { limit?: number; cooldownHours?: number } = {};
  try {
    body = (await request.json()) as { limit?: number; cooldownHours?: number };
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoProposeWritingEvalPromptCandidates({
        limit: body.limit,
        cooldownHours: body.cooldownHours,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测自动候选生成失败", 400);
  }
}
