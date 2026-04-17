import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateWritingEvalRunSchedule } from "@/lib/writing-eval";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const operator = await requireOpsAccess();
    const body = await request.json();
    const updated = await updateWritingEvalRunSchedule({
      scheduleId: Number(params.id),
      operatorUserId: operator.userId,
      name: body.name,
      datasetId: body.datasetId === undefined ? undefined : Number(body.datasetId),
      baseVersionType: body.baseVersionType,
      baseVersionRef: body.baseVersionRef,
      candidateVersionType: body.candidateVersionType,
      candidateVersionRef: body.candidateVersionRef,
      experimentMode: body.experimentMode,
      triggerMode: body.triggerMode,
      agentStrategy: body.agentStrategy,
      decisionMode: body.decisionMode,
      priority: body.priority === undefined ? undefined : Number(body.priority),
      cadenceHours: body.cadenceHours === undefined ? undefined : Number(body.cadenceHours),
      nextRunAt: body.nextRunAt,
      isEnabled: body.isEnabled,
      summary: body.summary,
    });
    return ok(updated);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新调度规则失败", 400);
  }
}
