import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateAdminTopicSource } from "@/lib/topic-radar";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    await updateAdminTopicSource({
      sourceId: Number(params.id),
      isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
      sourceType: body.sourceType === undefined ? undefined : String(body.sourceType),
      priority: body.priority,
    });
    return ok({ updated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新系统信息源失败", 400);
  }
}
