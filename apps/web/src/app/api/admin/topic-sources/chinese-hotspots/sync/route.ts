import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { runAdminChineseHotspotSync } from "@/lib/topic-signals";

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const result = await runAdminChineseHotspotSync({
      limitPerSource: Number.isFinite(Number(body.limitPerSource)) ? Number(body.limitPerSource) : 6,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "刷新中文热点源失败", 400);
  }
}
