import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoFillWritingEvalDatasets } from "@/lib/writing-eval";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: {
    limit?: number;
    maxImportsPerDataset?: number;
    cooldownHours?: number;
    force?: boolean;
    statuses?: string[];
  } = {};
  try {
    body = (await request.json()) as {
      limit?: number;
      maxImportsPerDataset?: number;
      cooldownHours?: number;
      force?: boolean;
      statuses?: string[];
    };
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoFillWritingEvalDatasets({
        limit: body.limit,
        maxImportsPerDataset: body.maxImportsPerDataset,
        cooldownHours: body.cooldownHours,
        force: body.force,
        statuses: Array.isArray(body.statuses) ? body.statuses : undefined,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作评测样本自动补桶失败", 400);
  }
}
