import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { autoFillWritingEvalDatasetImports } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json().catch(() => ({}));
    const maxImports = Number(body.maxImports);
    return ok(await autoFillWritingEvalDatasetImports({
      datasetId,
      maxImports: Number.isFinite(maxImports) && maxImports > 0 ? maxImports : 4,
      operatorUserId: operator.userId,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "自动补桶失败", 400);
  }
}
