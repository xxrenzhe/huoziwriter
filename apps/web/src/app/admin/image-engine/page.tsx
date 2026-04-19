import { AdminImageAssetMaintenance } from "@/components/admin-image-assets-client";
import { GlobalCoverImageEngineSettings, GlobalObjectStorageSettings } from "@/components/admin-image-engine-client";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { getGlobalObjectStorageConfig } from "@/lib/object-storage-config";
import { requireAdminSession } from "@/lib/page-auth";

export default async function AdminImageEnginePage() {
  await requireAdminSession();
  const [coverImageEngine, objectStorage] = await Promise.all([
    getGlobalCoverImageEngine(),
    getGlobalObjectStorageConfig(),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <GlobalCoverImageEngineSettings config={coverImageEngine} />
        <GlobalObjectStorageSettings config={objectStorage} />
      </div>
      <AdminImageAssetMaintenance />
    </div>
  );
}
