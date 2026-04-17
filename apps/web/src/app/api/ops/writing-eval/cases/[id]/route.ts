import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateWritingEvalCase } from "@/lib/writing-eval";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireOpsAccess();
    const caseId = Number(params.id);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      return fail("评测样本无效", 400);
    }
    const body = await request.json();
    const updated = await updateWritingEvalCase({
      caseId,
      taskCode: body.taskCode,
      taskType: body.taskType,
      topicTitle: body.topicTitle,
      inputPayload: body.inputPayload,
      expectedConstraints: body.expectedConstraints,
      viralTargets: body.viralTargets,
      stageArtifactPayloads: body.stageArtifactPayloads,
      referenceGoodOutput: body.referenceGoodOutput,
      referenceBadPatterns: body.referenceBadPatterns,
      difficultyLevel: body.difficultyLevel,
      isEnabled: body.isEnabled,
    });
    return ok(updated);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新评测样本失败", 400);
  }
}
