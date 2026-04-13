import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { deleteBannedWord } from "@/lib/repositories";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await deleteBannedWord(session.userId, Number(params.id));
  return ok({ deleted: true });
}
