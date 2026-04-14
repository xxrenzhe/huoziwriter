import { fail, ok } from "@/lib/http";
import { isInternalSchedulerAuthorized } from "@/lib/internal-auth";
import { runScheduledTopicSync } from "@/lib/topic-radar";

type SchedulerTopicSyncBody = {
  limitPerSource?: number;
  force?: boolean;
  windowHour?: number;
};

export async function POST(request: Request) {
  if (!isInternalSchedulerAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: SchedulerTopicSyncBody = {};
  try {
    body = (await request.json()) as SchedulerTopicSyncBody;
  } catch {
    body = {};
  }

  try {
    const result = await runScheduledTopicSync({
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 4,
      force: Boolean(body.force),
      windowHour: body.windowHour === 18 ? 18 : body.windowHour === 6 ? 6 : undefined,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "定时热点同步失败", 500);
  }
}
