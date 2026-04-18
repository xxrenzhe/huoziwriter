import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { importWritingEvalCasesFromKnowledgeCards } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    return ok(await importWritingEvalCasesFromKnowledgeCards({
      datasetId,
      knowledgeCardIds: Array.isArray(body.knowledgeCardIds) ? body.knowledgeCardIds : [],
      operatorUserId: operator.userId,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量导入知识卡失败", 400);
  }
}
