import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { retryAdminTopicSyncRun } from "@/lib/topic-radar";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const runId = Number(id);
    if (!Number.isInteger(runId) || runId <= 0) {
      return fail("同步窗口参数无效", 400);
    }

    const body = await request.json().catch(() => ({}));
    const result = await retryAdminTopicSyncRun({
      runId,
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 4,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "失败窗口重试失败", 400);
  }
}
