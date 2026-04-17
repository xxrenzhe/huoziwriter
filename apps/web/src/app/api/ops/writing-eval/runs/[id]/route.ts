import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWritingEvalRunDetail } from "@/lib/writing-eval";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOpsAccess();
    const { id } = await context.params;
    return ok(await getWritingEvalRunDetail(Number(id)));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "加载实验运行详情失败", 400);
  }
}
