import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPersona, getPersonaCatalog, getPersonaLimitForUser, getPersonas } from "@/lib/personas";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const [personas, maxCount, catalog] = await Promise.all([
    getPersonas(session.userId),
    getPersonaLimitForUser(session.userId),
    getPersonaCatalog(),
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
    const persona = await createPersona({
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
