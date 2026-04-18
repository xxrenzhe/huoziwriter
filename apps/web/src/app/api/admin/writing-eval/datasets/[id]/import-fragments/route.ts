import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { importWritingEvalCasesFromFragments } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    return ok(await importWritingEvalCasesFromFragments({
      datasetId,
      fragmentIds: Array.isArray(body.fragmentIds) ? body.fragmentIds : [],
      operatorUserId: operator.userId,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量导入素材失败", 400);
  }
}
