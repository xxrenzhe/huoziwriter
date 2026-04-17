import { requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createAdminTopicSource, getAdminTopicSources } from "@/lib/topic-signals";

export async function GET() {
  try {
    await requireAdminAccess();
    const sources = await getAdminTopicSources();
    return ok(
      sources.map((source) => ({
        id: source.id,
        name: source.name,
        homepageUrl: source.homepage_url,
        sourceType: source.source_type ?? "news",
        priority: source.priority ?? 100,
        isActive: Boolean(source.is_active),
        lastFetchedAt: source.last_fetched_at,
        connectorScope: source.connector_scope ?? "system",
        status: source.connector_status ?? "healthy",
        attemptCount: source.connector_attempt_count ?? 0,
        consecutiveFailures: source.connector_consecutive_failures ?? 0,
        lastError: source.connector_last_error,
        lastHttpStatus: source.connector_last_http_status,
        nextRetryAt: source.connector_next_retry_at,
        healthScore: source.connector_health_score ?? 100,
        degradedReason: source.connector_degraded_reason,
        createdAt: source.created_at,
        updatedAt: source.updated_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json();
    if (!body.name?.trim() || !body.homepageUrl?.trim()) {
      return fail("名称和主页地址不能为空", 400);
    }
    await createAdminTopicSource({
      name: String(body.name),
      homepageUrl: String(body.homepageUrl),
      sourceType: body.sourceType ? String(body.sourceType) : undefined,
      priority: body.priority,
    });
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建系统信息源失败", 400);
  }
}
