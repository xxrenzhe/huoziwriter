import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { executeTopicBacklogGenerationJob } from "@/lib/topic-backlogs";

type TopicBacklogGenerateItemBody = {
  userId?: number;
  backlogId?: number;
  itemId?: number;
  seriesId?: number | null;
  batchId?: string | null;
};

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: TopicBacklogGenerateItemBody = {};
  try {
    body = (await request.json()) as TopicBacklogGenerateItemBody;
  } catch {
    body = {};
  }

  try {
    return ok(
      await executeTopicBacklogGenerationJob({
        userId: Number(body.userId),
        backlogId: Number(body.backlogId),
        itemId: Number(body.itemId),
        seriesId: body.seriesId,
        batchId: body.batchId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题库条目生成失败", 400);
  }
}
