import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getPlan17AcceptanceReport } from "@/lib/plan17-acceptance";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getPlan17AcceptanceReport());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取 plan17 验收汇总失败", 400);
  }
}

