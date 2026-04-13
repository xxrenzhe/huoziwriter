import { fail, ok } from "@/lib/http";
import { isInternalSchedulerAuthorized } from "@/lib/internal-auth";
import { refreshWechatConnectionsDueForScheduler } from "@/lib/wechat";

export async function POST(request: Request) {
  if (!isInternalSchedulerAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { limit?: number; refreshWindowMinutes?: number } = {};
  try {
    body = (await request.json()) as { limit?: number; refreshWindowMinutes?: number };
  } catch {
    body = {};
  }

  try {
    const stats = await refreshWechatConnectionsDueForScheduler({
      limit: body.limit,
      refreshWindowMinutes: body.refreshWindowMinutes,
    });
    return ok(stats);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "公众号 token 定时刷新失败", 500);
  }
}
