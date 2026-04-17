import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createSeries, getSeries } from "@/lib/series";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const series = await getSeries(session.userId);
  return ok({ series });
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json();
    const series = await createSeries({
      userId: session.userId,
      name: body.name,
      personaId: body.personaId,
      thesis: body.thesis,
      targetAudience: body.targetAudience,
      activeStatus: body.activeStatus,
    });
    return ok(series);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "系列创建失败", 400);
  }
}
