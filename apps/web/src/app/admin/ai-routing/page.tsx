import { GlobalCoverImageEngineSettings, GlobalObjectStorageSettings } from "@/components/admin-image-engine-client";
import { RouteManagerClient } from "@/components/admin-client";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { getGlobalObjectStorageConfig } from "@/lib/object-storage-config";
import { requireAdminSession } from "@/lib/page-auth";
import { getModelRoutes } from "@/lib/repositories";

export default async function AdminAiRoutingPage() {
  await requireAdminSession();
  const [routes, coverImageEngine, objectStorage] = await Promise.all([
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getGlobalObjectStorageConfig(),
  ]);
  return (
    <div className="space-y-8">
      <RouteManagerClient
        routes={routes.map((route) => ({
          sceneCode: route.scene_code,
          primaryModel: route.primary_model,
          fallbackModel: route.fallback_model,
          description: route.description,
        }))}
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <GlobalCoverImageEngineSettings config={coverImageEngine} />
        <GlobalObjectStorageSettings config={objectStorage} />
      </div>
    </div>
  );
}
