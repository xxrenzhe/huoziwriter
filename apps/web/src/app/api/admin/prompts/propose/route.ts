import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createPromptCandidateVersionFromBase } from "@/lib/prompt-candidates";

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json();
    return ok(
      await createPromptCandidateVersionFromBase({
        promptId: body.promptId,
        baseVersion: body.baseVersion,
        versionType: body.versionType,
        experimentMode: body.experimentMode,
        optimizationGoal: body.optimizationGoal,
        candidateVersion: body.candidateVersion,
        operatorUserId: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "生成候选 Prompt 版本失败", 400);
  }
}
