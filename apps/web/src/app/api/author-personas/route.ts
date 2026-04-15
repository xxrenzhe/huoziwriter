import { ensureUserSession } from "@/lib/auth";
import { createAuthorPersona, getAuthorPersonaCatalog, getAuthorPersonaLimitForUser, getAuthorPersonas } from "@/lib/author-personas";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const [personas, maxCount, catalog] = await Promise.all([
    getAuthorPersonas(session.userId),
    getAuthorPersonaLimitForUser(session.userId),
    getAuthorPersonaCatalog(),
  ]);
  return ok({ personas, maxCount, catalog });
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    const persona = await createAuthorPersona({
      userId: session.userId,
      name: body.name ? String(body.name) : null,
      identityTags: body.identityTags,
      writingStyleTags: body.writingStyleTags,
      boundWritingStyleProfileId: body.boundWritingStyleProfileId,
      isDefault: body.isDefault ?? false,
    });
    return ok(persona);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "作者人设创建失败", 400);
  }
}
