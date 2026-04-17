import { requireAdminAccess } from "@/lib/auth";
import { getAdminAuditFilterOptions, getAdminAuditLogs } from "@/lib/audit";
import { fail, ok } from "@/lib/http";

export async function GET(request: Request) {
  try {
    await requireAdminAccess();
    const searchParams = new URL(request.url).searchParams;
    const [logs, filters] = await Promise.all([
      getAdminAuditLogs({
        query: searchParams.get("query") || undefined,
        action: searchParams.get("action") || undefined,
        targetType: searchParams.get("targetType") || undefined,
        limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      }),
      getAdminAuditFilterOptions(),
    ]);
    return ok({
      logs,
      filters,
    });
  } catch (error) {
    return fail(error instanceof Error && error.message === "UNAUTHORIZED" ? "无权限访问" : "加载审计日志失败", 401);
  }
}
