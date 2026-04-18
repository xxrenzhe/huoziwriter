import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { importWritingEvalCaseFromKnowledgeCard } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    const created = await importWritingEvalCaseFromKnowledgeCard({
      datasetId,
      knowledgeCardId: Number(body.knowledgeCardId),
      operatorUserId: operator.userId,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "导入知识卡失败", 400);
  }
}
