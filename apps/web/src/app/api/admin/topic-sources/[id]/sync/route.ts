import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { runAdminTopicSourceSync } from "@/lib/topic-radar";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const result = await runAdminTopicSourceSync({
      sourceId: Number(params.id),
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 4,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "手动重抓系统信息源失败", 400);
  }
}
