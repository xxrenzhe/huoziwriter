import { ensureUserSession } from "@/lib/auth";
import { deleteImaConnection } from "@/lib/ima-connections";
import { fail, ok } from "@/lib/http";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      throw new Error("IMA 连接不存在");
    }
    await deleteImaConnection(id, session.userId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "IMA 连接删除失败", 400);
  }
}
