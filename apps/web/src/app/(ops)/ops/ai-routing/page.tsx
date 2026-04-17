import { GlobalCoverImageEngineSettings, GlobalObjectStorageSettings } from "@/components/ops-image-engine-client";
import { RouteManagerClient } from "@/components/ops-client";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { getGlobalObjectStorageConfig } from "@/lib/object-storage-config";
import { requireOpsSession } from "@/lib/page-auth";
import { getModelRoutes } from "@/lib/repositories";

export default async function OpsAiRoutingPage() {
  await requireOpsSession();
  const [routes, coverImageEngine, objectStorage] = await Promise.all([
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getGlobalObjectStorageConfig(),
  ]);
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
      <GlobalObjectStorageSettings config={objectStorage} />
    </div>
  );
}
