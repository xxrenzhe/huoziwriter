import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { getModelRoutes, updateModelRoute } from "@/lib/repositories";

export async function GET() {
  try {
    await requireAdminAccess();
    const [routes, coverImageEngine] = await Promise.all([getModelRoutes(), getGlobalCoverImageEngine()]);
    return ok(
      {
        routes: routes.map((route) => ({
          id: route.id,
          sceneCode: route.scene_code,
          primaryModel: route.primary_model,
          fallbackModel: route.fallback_model,
          description: route.description,
          updatedAt: route.updated_at,
        })),
        coverImageEngine,
      },
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json();
    await updateModelRoute({
      sceneCode: body.sceneCode,
      primaryModel: body.primaryModel,
      fallbackModel: body.fallbackModel,
      description: body.description,
    });
    return ok({ updated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新模型路由失败", 400);
  }
}
