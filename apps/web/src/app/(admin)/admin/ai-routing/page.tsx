import { RouteManagerClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getModelRoutes } from "@/lib/repositories";

export default async function AdminAiRoutingPage() {
  await requireAdminSession();
  const routes = await getModelRoutes();
  return (
    <RouteManagerClient
      routes={routes.map((route) => ({
        sceneCode: route.scene_code,
        primaryModel: route.primary_model,
        fallbackModel: route.fallback_model,
        shadowModel: route.shadow_model,
        shadowTrafficPercent: route.shadow_traffic_percent,
        description: route.description,
      }))}
    />
  );
}
