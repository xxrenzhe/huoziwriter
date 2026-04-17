import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { runOpsTopicSync } from "@/lib/topic-radar";

export async function POST(request: Request) {
  try {
    await requireOpsAccess();
    const body = await request.json().catch(() => ({}));
    const result = await runOpsTopicSync({
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 4,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "手动触发热点同步失败", 400);
  }
}
