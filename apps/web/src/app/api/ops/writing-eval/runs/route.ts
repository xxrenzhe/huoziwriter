import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createWritingEvalRun, getWritingEvalRuns } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireOpsAccess();
    return ok(await getWritingEvalRuns());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireOpsAccess();
    const body = await request.json();
    const created = await createWritingEvalRun({
      datasetId: Number(body.datasetId),
      baseVersionType: body.baseVersionType,
      baseVersionRef: body.baseVersionRef,
      candidateVersionType: body.candidateVersionType,
      candidateVersionRef: body.candidateVersionRef,
      experimentMode: body.experimentMode,
      triggerMode: body.triggerMode,
      decisionMode: body.decisionMode,
      summary: body.summary,
      createdBy: operator.userId,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建实验运行失败", 400);
  }
}
