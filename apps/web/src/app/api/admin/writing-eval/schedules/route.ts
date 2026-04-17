import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createWritingEvalRunSchedule, dispatchDueWritingEvalRunSchedules, getWritingEvalRunSchedules } from "@/lib/writing-eval";

export async function GET() {
  try {
    await requireAdminAccess();
    return ok(await getWritingEvalRunSchedules());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    const operator = await requireAdminAccess();
    const body = await request.json();
    if (body.action === "dispatch_due") {
      return ok(
        await dispatchDueWritingEvalRunSchedules({
          limit: Number(body.limit),
          operatorUserId: operator.userId,
          triggerMode: body.triggerMode,
          agentStrategy: body.agentStrategy,
        }),
      );
    }
    const created = await createWritingEvalRunSchedule({
      name: body.name,
      datasetId: Number(body.datasetId),
      baseVersionType: body.baseVersionType,
      baseVersionRef: body.baseVersionRef,
      candidateVersionType: body.candidateVersionType,
      candidateVersionRef: body.candidateVersionRef,
      experimentMode: body.experimentMode,
      triggerMode: body.triggerMode,
      agentStrategy: body.agentStrategy,
      decisionMode: body.decisionMode,
      priority: body.priority === undefined ? undefined : Number(body.priority),
      cadenceHours: Number(body.cadenceHours),
      nextRunAt: body.nextRunAt,
      isEnabled: body.isEnabled,
      summary: body.summary,
      createdBy: operator.userId,
    });
    return ok(created);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建调度规则失败", 400);
  }
}
