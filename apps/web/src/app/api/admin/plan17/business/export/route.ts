import { requireAdminAccess } from "@/lib/auth";
import { fail } from "@/lib/http";
import {
  buildPlan17BusinessExportCsv,
  getPlan17BusinessReport,
  normalizePlan17BusinessExportScope,
} from "@/lib/plan17-business";

function buildExportFilename(generatedAt: string, scope: string) {
  const stamp = generatedAt.slice(0, 19).replace(/[:T]/g, "-");
  return `plan17-business-${scope}-${stamp}.csv`;
}

export async function GET(request: Request) {
  try {
    await requireAdminAccess();
    const url = new URL(request.url);
    const scope = normalizePlan17BusinessExportScope(url.searchParams.get("scope"));
    const format = url.searchParams.get("format") || "csv";

    if (format !== "csv") {
      return fail("plan17 业务导出目前仅支持 csv", 400);
    }
    if (!scope) {
      return fail("不支持的 plan17 业务导出范围", 400);
    }

    const report = await getPlan17BusinessReport();
    const csv = buildPlan17BusinessExportCsv(report, scope);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(report.generatedAt, scope)}"`,
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "导出 plan17 业务报表失败", 400);
  }
}
