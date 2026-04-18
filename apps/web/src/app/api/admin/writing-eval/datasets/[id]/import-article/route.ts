import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { importWritingEvalCaseFromArticle } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    const created = await importWritingEvalCaseFromArticle({
      datasetId,
      articleId: Number(body.articleId),
      operatorUserId: operator.userId,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "导入历史稿件失败", 400);
  }
}
