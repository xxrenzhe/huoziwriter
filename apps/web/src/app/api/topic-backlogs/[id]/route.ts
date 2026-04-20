import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { deleteTopicBacklog, getTopicBacklogById, updateTopicBacklog } from "@/lib/topic-backlogs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const backlog = await getTopicBacklogById(session.userId, Number(params.id));
  if (!backlog) {
    return fail("选题库不存在", 404);
  }
  return ok(backlog);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const backlog = await updateTopicBacklog({
      userId: session.userId,
      backlogId: Number(params.id),
      name: body.name,
      description: body.description,
      seriesId: body.seriesId,
    });
    return ok(backlog);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题库更新失败", 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await deleteTopicBacklog(session.userId, Number(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题库删除失败", 400);
  }
}
