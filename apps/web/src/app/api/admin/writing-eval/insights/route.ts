import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWritingEvalInsights } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getWritingEvalInsights());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取写作评测洞察失败", 400);
  }
}
