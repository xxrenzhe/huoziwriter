import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createTopicBacklog, getTopicBacklogs } from "@/lib/topic-backlogs";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  return ok({ backlogs: await getTopicBacklogs(session.userId) });
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const backlog = await createTopicBacklog({
      userId: session.userId,
      name: body.name,
      description: body.description,
      seriesId: body.seriesId,
    });
    return ok(backlog);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题库创建失败", 400);
  }
}
