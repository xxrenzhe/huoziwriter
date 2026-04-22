import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { autoFillPlan17QualityDatasets } from "@/lib/writing-eval";

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    return ok(await autoFillPlan17QualityDatasets({
      force: body?.force !== false,
      maxImportsPerDataset: body?.maxImportsPerDataset == null ? undefined : Number(body.maxImportsPerDataset),
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "执行 plan17 质量桶自动补样本失败", 400);
  }
}
