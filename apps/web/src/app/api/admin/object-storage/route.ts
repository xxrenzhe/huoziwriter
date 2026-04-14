import { requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getGlobalObjectStorageConfig, upsertGlobalObjectStorageConfig } from "@/lib/object-storage-config";

export async function GET() {
  try {
    await requireAdmin();
    return ok(await getGlobalObjectStorageConfig());
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdmin();
    const body = await request.json();
    const config = await upsertGlobalObjectStorageConfig({
      adminUserId: session.userId,
      providerName: body.providerName,
      providerPreset: body.providerPreset,
      endpoint: body.endpoint,
      bucketName: body.bucketName,
      region: body.region,
      accessKeyId: body.accessKeyId,
      secretAccessKey: body.secretAccessKey,
      publicBaseUrl: body.publicBaseUrl,
      pathPrefix: body.pathPrefix,
      isEnabled: body.isEnabled ?? true,
    });
    return ok(config);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "保存对象存储配置失败", 400);
  }
}
