import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { importWritingEvalCasesFromTopicItems } from "@/lib/writing-eval";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    return ok(await importWritingEvalCasesFromTopicItems({
      datasetId,
      topicItemIds: Array.isArray(body.topicItemIds) ? body.topicItemIds : [],
      operatorUserId: operator.userId,
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量导入主题档案失败", 400);
  }
}
