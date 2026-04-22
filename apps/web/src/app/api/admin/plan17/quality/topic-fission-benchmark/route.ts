import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { queuePlan17TopicFissionBenchmarkRuns } from "@/lib/writing-eval";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    return ok(await queuePlan17TopicFissionBenchmarkRuns({
      operatorUserId: admin.userId,
      force: body?.force === true,
      autoFill: body?.autoFill !== false,
      maxImportsPerDataset: body?.maxImportsPerDataset == null ? undefined : Number(body.maxImportsPerDataset),
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "执行 topicFission benchmark 排队失败", 400);
  }
}
