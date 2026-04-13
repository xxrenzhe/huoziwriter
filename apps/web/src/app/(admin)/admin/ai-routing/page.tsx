import { GlobalCoverImageEngineSettings } from "@/components/admin-image-engine-client";
import { RouteManagerClient } from "@/components/admin-client";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { requireAdminSession } from "@/lib/page-auth";
import { getModelRoutes } from "@/lib/repositories";

export default async function AdminAiRoutingPage() {
  await requireAdminSession();
  const [routes, coverImageEngine] = await Promise.all([getModelRoutes(), getGlobalCoverImageEngine()]);
  return (
    <div className="space-y-6">
      <RouteManagerClient
        routes={routes.map((route) => ({
          sceneCode: route.scene_code,
          primaryModel: route.primary_model,
          fallbackModel: route.fallback_model,
          description: route.description,
        }))}
      />
      <GlobalCoverImageEngineSettings config={coverImageEngine} />
    </div>
  );
}
