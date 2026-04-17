import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWritingEvalVersions } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getWritingEvalVersions());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取版本账本失败", 400);
  }
}
