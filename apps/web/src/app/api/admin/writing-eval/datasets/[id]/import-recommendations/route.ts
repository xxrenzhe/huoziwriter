import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWritingEvalDatasetImportRecommendations } from "@/lib/writing-eval";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "8");
    return ok(await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 8,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "加载补桶推荐失败", 400);
  }
}
