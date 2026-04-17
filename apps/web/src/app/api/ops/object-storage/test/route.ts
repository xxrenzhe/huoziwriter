import { requireOpsAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { normalizeObjectStorageProviderPreset } from "@/lib/object-storage-provider-presets";
import { DEFAULT_OBJECT_STORAGE_REGION, type GlobalObjectStorageSecretConfig } from "@/lib/object-storage-config";
import { testObjectStorageConnection } from "@/lib/object-storage";

export async function POST(request: Request) {
  try {
    await requireOpsAccess();
    const body = await request.json();
    const providerName = body.providerName === "s3-compatible" ? "s3-compatible" : "local";
    const config: GlobalObjectStorageSecretConfig = {
      providerName,
      providerPreset: normalizeObjectStorageProviderPreset(body.providerPreset, providerName),
      endpoint: String(body.endpoint || "").trim(),
      bucketName: String(body.bucketName || "").trim(),
      region: String(body.region || DEFAULT_OBJECT_STORAGE_REGION).trim() || DEFAULT_OBJECT_STORAGE_REGION,
      accessKeyId: String(body.accessKeyId || "").trim(),
      secretAccessKey: String(body.secretAccessKey || "").trim(),
      publicBaseUrl: String(body.publicBaseUrl || "").trim(),
      pathPrefix: String(body.pathPrefix || "").trim(),
      isEnabled: body.isEnabled ?? true,
      lastCheckedAt: null,
      lastError: null,
      updatedBy: null,
    };

    const result = await testObjectStorageConnection({ config });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "对象存储连通性测试失败", 400);
  }
}
