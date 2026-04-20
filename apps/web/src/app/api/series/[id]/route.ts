import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { deleteSeries, updateSeries } from "@/lib/series";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    const series = await updateSeries({
      userId: session.userId,
      seriesId: Number(params.id),
      name: body.name,
      personaId: body.personaId,
      thesis: body.thesis,
      targetAudience: body.targetAudience,
      activeStatus: body.activeStatus,
      preHook: body.preHook,
      postHook: body.postHook,
      defaultLayoutTemplateId: body.defaultLayoutTemplateId,
      platformPreference: body.platformPreference,
      targetPackHint: body.targetPackHint,
      defaultArchetype: body.defaultArchetype,
      defaultDnaId: body.defaultDnaId,
      rhythmOverride: body.rhythmOverride,
    });
    return ok(series);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "系列更新失败", 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await deleteSeries(session.userId, Number(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "系列删除失败", 400);
  }
}
