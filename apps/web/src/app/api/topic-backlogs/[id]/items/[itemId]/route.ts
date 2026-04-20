import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { buildTopicBacklogStrategyDraft, deleteTopicBacklogItem, updateTopicBacklogItem } from "@/lib/topic-backlogs";

export async function PATCH(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const item = await updateTopicBacklogItem({
      userId: session.userId,
      backlogId: Number(params.id),
      itemId: Number(params.itemId),
      topicLeadId: body.topicLeadId,
      sourceType: body.sourceType,
      fissionMode: body.fissionMode,
      theme: body.theme,
      archetype: body.archetype,
      evidenceRefs: body.evidenceRefs,
      strategyDraft:
        body.strategyDraft && typeof body.strategyDraft === "object"
          ? body.strategyDraft
          : buildTopicBacklogStrategyDraft({
              coreAssertion: body.coreAssertion,
              whyNow: body.whyNow,
              mainstreamBelief: body.mainstreamBelief,
              targetReader: body.targetAudience,
            }),
      targetAudience: body.targetAudience,
      readerSnapshotHint: body.readerSnapshotHint,
      status: body.status,
    });
    return ok(item);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题条目更新失败", 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string; itemId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await deleteTopicBacklogItem(session.userId, Number(params.id), Number(params.itemId));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题条目删除失败", 400);
  }
}
