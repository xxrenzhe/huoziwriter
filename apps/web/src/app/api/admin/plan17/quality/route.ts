import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getPlan17QualityReport } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getPlan17QualityReport());
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取 plan17 质量报表失败", 400);
  }
}
