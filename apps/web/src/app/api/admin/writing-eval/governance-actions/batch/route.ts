import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  dedupeWritingEvalGovernanceActions,
  executeWritingEvalGovernanceAction,
  type WritingEvalGovernanceActionInput,
} from "@/lib/writing-eval-governance";

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const actions = Array.isArray(body?.actions) ? body.actions : [];
    const normalized = dedupeWritingEvalGovernanceActions(
      actions
        .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item: Record<string, unknown>) => ({
          actionType: String(item.actionType || "").trim() as WritingEvalGovernanceActionInput["actionType"],
          label: typeof item.label === "string" ? item.label : null,
          reason: typeof item.reason === "string" ? item.reason : null,
          runId: typeof item.runId === "number" ? item.runId : Number(item.runId ?? 0) || null,
          assetType: typeof item.assetType === "string" ? item.assetType : null,
          assetRef: typeof item.assetRef === "string" ? item.assetRef : null,
        })),
    );
    if (normalized.length === 0) {
      return fail("没有可执行的治理动作", 400);
    }

    const results = [] as Array<{
      ok: boolean;
      actionType: string;
      target: string;
      message: string;
    }>;
    for (const action of normalized) {
      try {
        const result = await executeWritingEvalGovernanceAction(action, operator.userId, "batch");
        results.push({
          ok: true,
          actionType: result.actionType,
          target: result.runCode || result.assetRef || String(result.runId || "--"),
          message: result.message,
        });
      } catch (error) {
        results.push({
          ok: false,
          actionType: action.actionType,
          target: action.assetRef || String(action.runId || "--"),
          message: error instanceof Error ? error.message : "执行治理动作失败",
        });
      }
    }

    return ok({
      total: results.length,
      successCount: results.filter((item) => item.ok).length,
      failureCount: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量执行治理动作失败", 400);
  }
}
