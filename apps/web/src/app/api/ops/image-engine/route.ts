import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getGlobalCoverImageEngine, upsertGlobalCoverImageEngine } from "@/lib/image-engine";

export async function GET() {
  try {
    await requireOpsAccess();
    return ok(await getGlobalCoverImageEngine());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireOpsAccess();
    const body = await request.json();
    const config = await upsertGlobalCoverImageEngine({
      operatorUserId: session.userId,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
      isEnabled: body.isEnabled ?? true,
    });
    return ok(config);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保存全局生图引擎失败", 400);
  }
}
