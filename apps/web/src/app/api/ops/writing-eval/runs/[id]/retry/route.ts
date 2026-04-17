import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { retryWritingEvalRun } from "@/lib/writing-eval";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireOpsAccess();
    const { id } = await context.params;
    return ok(await retryWritingEvalRun({ runId: Number(id), operatorUserId: operator.userId }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "重试实验运行失败", 400);
  }
}
