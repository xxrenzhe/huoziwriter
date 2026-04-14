import { ensureUserSession } from "@/lib/auth";
import { deleteAuthorPersona, updateAuthorPersona } from "@/lib/author-personas";
import { fail, ok } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    const persona = await updateAuthorPersona({
      userId: session.userId,
      personaId: Number(params.id),
      name: body.name,
      identityTags: body.identityTags,
      writingStyleTags: body.writingStyleTags,
      boundWritingStyleProfileId: body.boundWritingStyleProfileId,
      isDefault: body.isDefault,
    });
    return ok(persona);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "作者人设更新失败", 400);
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await deleteAuthorPersona(session.userId, Number(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "作者人设删除失败", 400);
  }
}
