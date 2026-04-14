import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { deleteWritingStyleProfile } from "@/lib/writing-style-profiles";

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await deleteWritingStyleProfile(session.userId, Number(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作风格资产删除失败", 400);
  }
}
