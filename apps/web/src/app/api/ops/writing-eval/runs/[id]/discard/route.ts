import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { discardWritingEvalRun } from "@/lib/writing-eval";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireOpsAccess();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    return ok(
      await discardWritingEvalRun({
        runId: Number(id),
        reason: body?.reason,
        operatorUserId: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "丢弃实验版本失败", 400);
  }
}
