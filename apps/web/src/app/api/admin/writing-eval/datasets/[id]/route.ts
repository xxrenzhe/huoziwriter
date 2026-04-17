import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateWritingEvalDataset } from "@/lib/writing-eval";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminAccess();
    const { id } = await params;
    const datasetId = Number(id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json().catch(() => ({}));
    return ok(
      await updateWritingEvalDataset({
        datasetId,
        code: body.code,
        name: body.name,
        description: body.description,
        status: body.status,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新评测集失败", 400);
  }
}
