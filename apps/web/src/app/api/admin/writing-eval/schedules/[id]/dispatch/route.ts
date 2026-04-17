import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { dispatchWritingEvalRunSchedule } from "@/lib/writing-eval";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireAdminAccess();
    return ok(
      await dispatchWritingEvalRunSchedule({
        scheduleId: Number(params.id),
        operatorUserId: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "派发调度规则失败", 400);
  }
}
