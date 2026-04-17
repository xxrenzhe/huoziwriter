import { ensureUserSession } from "@/lib/auth";
import { getCurrentSeriesPlaybook } from "@/lib/article-outcomes";
import { fail, ok } from "@/lib/http";
import { getAuthorPlaybooks } from "@/lib/repositories";

export async function GET(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const { searchParams } = new URL(request.url);
  const seriesIdParam = searchParams.get("seriesId");
  if (seriesIdParam) {
    const seriesId = Number(seriesIdParam);
    if (!Number.isInteger(seriesId) || seriesId <= 0) {
      return fail("系列 ID 无效", 400);
    }
    const playbook = await getCurrentSeriesPlaybook(session.userId, seriesId);
    return ok(playbook);
  }

  const playbooks = await getAuthorPlaybooks(session.userId);
  return ok(playbooks);
}
