import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { upsertWritingEvalCaseQualityLabel } from "@/lib/writing-eval";

export async function POST(request: Request) {
  try {
    const session = await ensureUserSession();
    if (!session) {
      throw new Error("UNAUTHORIZED");
    }
    const body = await request.json().catch(() => ({}));
    return ok(
      await upsertWritingEvalCaseQualityLabel({
        caseId: Number(body?.caseId),
        strategyManualScore: body?.strategyManualScore == null || body?.strategyManualScore === "" ? null : Number(body.strategyManualScore),
        evidenceExpectedTags: Array.isArray(body?.evidenceExpectedTags) ? body.evidenceExpectedTags : null,
        evidenceDetectedTags: Array.isArray(body?.evidenceDetectedTags) ? body.evidenceDetectedTags : null,
        notes: typeof body?.notes === "string" ? body.notes : null,
        createdBy: session.userId,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写入 plan17 质量人工标注失败", 400);
  }
}
