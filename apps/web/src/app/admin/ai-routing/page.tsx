import Link from "next/link";
import { GlobalCoverImageEngineSettings, GlobalObjectStorageSettings } from "@/components/admin-image-engine-client";
import { RouteManagerClient } from "@/components/admin-client";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { getGlobalObjectStorageConfig } from "@/lib/object-storage-config";
import { requireAdminSession } from "@/lib/page-auth";
import { getModelRoutes } from "@/lib/repositories";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";

const panelClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const actionClassName = buttonStyles({ variant: "secondary", size: "sm" });

export default async function AdminAiRoutingPage() {
  await requireAdminSession();
  const [routes, coverImageEngine, objectStorage] = await Promise.all([
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getGlobalObjectStorageConfig(),
  ]);
  return (
    <div className="space-y-8">
      <section className={panelClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-adminAccent">AI Routing</div>
            <h1 className="mt-4 font-serifCn text-4xl text-adminInk text-balance">模型路由与 provider 健康</h1>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-adminInkSoft">
              在当前路由配置之外，补上 provider 健康探针与 AI 调用观测看板，避免缺 key、缓存命中异常或失败率抬头时只能到业务链路里才发现。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/ai-routing/health" className={actionClassName}>
              打开健康探针
            </Link>
            <Link href="/admin/ai-routing/observations" className={actionClassName}>
              打开调用观测
            </Link>
          </div>
        </div>
      </section>
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
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <GlobalCoverImageEngineSettings config={coverImageEngine} />
        <GlobalObjectStorageSettings config={objectStorage} />
      </div>
    </div>
  );
}
