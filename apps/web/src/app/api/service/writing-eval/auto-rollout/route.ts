import { fail, ok } from "@/lib/http";
import { isSchedulerServiceAuthorized } from "@/lib/scheduler-service-auth";
import { autoManageWritingAssetRollouts } from "@/lib/writing-rollout";

export async function POST(request: Request) {
  if (!isSchedulerServiceAuthorized(request)) {
    return fail("无权限访问", 401);
  }

  let body: { assetType?: string; force?: boolean; cooldownHours?: number; limit?: number } = {};
  try {
    body = (await request.json()) as { assetType?: string; force?: boolean; cooldownHours?: number; limit?: number };
  } catch {
    body = {};
  }

  try {
    return ok(
      await autoManageWritingAssetRollouts({
        assetType: body.assetType,
        force: body.force,
        cooldownHours: body.cooldownHours,
        limit: body.limit,
      }),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作资产自动放量失败", 400);
  }
}
