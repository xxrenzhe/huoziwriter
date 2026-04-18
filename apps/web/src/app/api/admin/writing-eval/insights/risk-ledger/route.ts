import { requireAdminAccess } from "@/lib/auth";
import { getWritingEvalRolloutAuditLogs } from "@/lib/audit";
import { fail, ok } from "@/lib/http";
import { buildWritingEvalInsightsRiskLedger, getWritingEvalInsights } from "@/lib/writing-eval";

function clampInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

export async function GET(request: Request) {
  try {
    await requireAdminAccess();
    const { searchParams } = new URL(request.url);
    const limit = clampInteger(searchParams.get("limit"), 12, 1, 48);
    const days = clampInteger(searchParams.get("days"), 7, 1, 30);
    const insightLimit = clampInteger(searchParams.get("insightLimit"), 60, 12, 60);
    const rolloutDays = clampInteger(searchParams.get("rolloutDays"), 180, 30, 365);
    const [insights, rolloutAudits] = await Promise.all([
      getWritingEvalInsights(insightLimit),
      getWritingEvalRolloutAuditLogs(rolloutDays),
    ]);
    return ok(
      buildWritingEvalInsightsRiskLedger({
        insights,
        combinedRolloutAuditLogs: rolloutAudits.combinedRolloutAuditLogs,
        recentWindowDays: days,
        maxItems: limit,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "获取 writing eval 风险台账失败", 400);
  }
}
