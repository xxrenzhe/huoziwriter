import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { promoteWritingEvalRun } from "@/lib/writing-eval";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireOpsAccess();
    const { id } = await context.params;
    return ok(await promoteWritingEvalRun({ runId: Number(id), operatorUserId: operator.userId }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保留实验版本失败", 400);
  }
}
