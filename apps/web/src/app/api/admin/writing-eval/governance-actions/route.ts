import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { executeWritingEvalGovernanceAction, type WritingEvalGovernanceActionInput, type WritingEvalGovernanceActionType } from "@/lib/writing-eval-governance";

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const actionType = String(body?.actionType || "").trim() as WritingEvalGovernanceActionType;
    if (!actionType) {
      return fail("治理动作无效", 400);
    }
    const result = await executeWritingEvalGovernanceAction(
      {
        actionType,
        label: body?.label,
        reason: body?.reason,
        runId: typeof body?.runId === "number" ? body.runId : Number(body?.runId ?? 0) || null,
        assetType: typeof body?.assetType === "string" ? body.assetType : null,
        assetRef: typeof body?.assetRef === "string" ? body.assetRef : null,
      } satisfies WritingEvalGovernanceActionInput,
      operator.userId,
      "manual",
    );
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "执行治理动作失败", 400);
  }
}
