import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertTopicSourceManageAllowed } from "@/lib/plan-access";
import { disableTopicSource, updateTopicSource } from "@/lib/topic-radar";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertTopicSourceManageAllowed(session.userId);
    const body = await request.json();
    await updateTopicSource({
      userId: session.userId,
      sourceId: Number(params.id),
      sourceType: body.sourceType === undefined ? undefined : String(body.sourceType),
      priority: body.priority,
    });
    return ok({ updated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新信息源失败", 400);
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertTopicSourceManageAllowed(session.userId);
    await disableTopicSource({
      userId: session.userId,
      sourceId: Number(params.id),
    });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "停用信息源失败", 400);
  }
}
