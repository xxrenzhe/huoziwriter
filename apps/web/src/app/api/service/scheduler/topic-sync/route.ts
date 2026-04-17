import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { runScheduledTopicSync } from "@/lib/topic-radar";

type SchedulerTopicSyncBody = {
  limitPerSource?: number;
  force?: boolean;
  windowHour?: number;
  windowMinute?: number;
};

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
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
      windowMinute: body.windowMinute === 15 ? 15 : body.windowMinute === 45 ? 45 : 0,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "定时热点同步失败", 500);
  }
}
