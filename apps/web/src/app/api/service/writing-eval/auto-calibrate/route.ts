import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoCalibrateWritingEvalScoringProfile } from "@/lib/writing-eval";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { activate?: boolean; force?: boolean } = {};
  try {
    body = (await request.json()) as { activate?: boolean; force?: boolean };
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoCalibrateWritingEvalScoringProfile({
        activate: body.activate,
        force: body.force,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测自动校准失败", 400);
  }
}
