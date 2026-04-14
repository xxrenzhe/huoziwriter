import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { deleteLanguageGuardRule } from "@/lib/language-guard";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await deleteLanguageGuardRule(session.userId, decodeURIComponent(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "删除语言守卫规则失败", 400);
  }
}
