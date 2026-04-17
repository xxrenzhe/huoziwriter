import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { rollbackWritingEvalVersion } from "@/lib/writing-eval";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const operator = await requireAdminAccess();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    return ok(
      await rollbackWritingEvalVersion({
        versionId: Number(id),
        reason: body?.reason,
        operatorUserId: operator.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "回滚实验版本失败", 400);
  }
}
