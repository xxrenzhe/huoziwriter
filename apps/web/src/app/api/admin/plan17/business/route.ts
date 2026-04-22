import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { buildPlan17BusinessViewPayload, getPlan17BusinessReport } from "@/lib/plan17-business";

export async function GET(request: Request) {
  try {
    await requireAdminAccess();
    const report = await getPlan17BusinessReport();
    const view = new URL(request.url).searchParams.get("view");
    return ok(buildPlan17BusinessViewPayload(report, view));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取 plan17 业务报表失败", 400);
  }
}
