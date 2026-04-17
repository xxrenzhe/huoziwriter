import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { runAdminTopicSync } from "@/lib/topic-signals";

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const result = await runAdminTopicSync({
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 4,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "手动触发热点同步失败", 400);
  }
}
