import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWritingEvalCaseQualityLabels, upsertWritingEvalCaseQualityLabel } from "@/lib/writing-eval";

export async function GET(request: Request) {
  try {
    await requireAdminAccess();
    const url = new URL(request.url);
    const datasetId = url.searchParams.get("datasetId");
    const focusKey = url.searchParams.get("focusKey");
    const limit = url.searchParams.get("limit");
    return ok(await getWritingEvalCaseQualityLabels({
      datasetId: datasetId == null || datasetId === "" ? null : Number(datasetId),
      focusKey: focusKey || null,
      limit: limit == null || limit === "" ? undefined : Number(limit),
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "读取 plan17 质量人工标注失败", 400);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminAccess();
    const body = await request.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [body];
    const results = [];
    for (const item of items) {
      results.push(await upsertWritingEvalCaseQualityLabel({
        caseId: Number(item.caseId),
        strategyManualScore: item.strategyManualScore == null || item.strategyManualScore === "" ? null : Number(item.strategyManualScore),
        evidenceExpectedTags: Array.isArray(item.evidenceExpectedTags) ? item.evidenceExpectedTags : null,
        evidenceDetectedTags: Array.isArray(item.evidenceDetectedTags) ? item.evidenceDetectedTags : null,
        notes: typeof item.notes === "string" ? item.notes : null,
        createdBy: admin.userId,
      }));
    }
    return ok(Array.isArray(body?.items) ? results : results[0] ?? null);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写入 plan17 质量人工标注失败", 400);
  }
}
