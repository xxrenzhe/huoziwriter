import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createWritingEvalCase, getWritingEvalCases } from "@/lib/writing-eval";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireOpsAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    return ok(await getWritingEvalCases(datasetId));
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireOpsAccess();
    const datasetId = Number(params.id);
    if (!Number.isInteger(datasetId) || datasetId <= 0) {
      return fail("数据集无效", 400);
    }
    const body = await request.json();
    const created = await createWritingEvalCase({
      datasetId,
      taskCode: body.taskCode,
      taskType: body.taskType,
      topicTitle: body.topicTitle,
      inputPayload: body.inputPayload ?? {},
      expectedConstraints: body.expectedConstraints ?? {},
      viralTargets: body.viralTargets ?? {},
      stageArtifactPayloads: body.stageArtifactPayloads ?? {},
      referenceGoodOutput: body.referenceGoodOutput,
      referenceBadPatterns: body.referenceBadPatterns ?? [],
      difficultyLevel: body.difficultyLevel,
      isEnabled: body.isEnabled,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建评测样本失败", 400);
  }
}
