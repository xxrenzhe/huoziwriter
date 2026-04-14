import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertTopicSourceManageAllowed } from "@/lib/plan-access";
import { createTopicSource, getVisibleTopicSources } from "@/lib/topic-radar";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const sources = await getVisibleTopicSources(session.userId);
  return ok(
    sources.map((source) => ({
      id: source.id,
      ownerUserId: source.owner_user_id,
      name: source.name,
      homepageUrl: source.homepage_url,
      sourceType: source.source_type ?? "news",
      priority: source.priority ?? 100,
      isActive: Boolean(source.is_active),
      scope: source.owner_user_id == null ? "system" : "custom",
      connectorScope: source.connector_scope ?? (source.owner_user_id == null ? "system" : "custom"),
      status: source.connector_status ?? "healthy",
      attemptCount: source.connector_attempt_count ?? 0,
      consecutiveFailures: source.connector_consecutive_failures ?? 0,
      lastError: source.connector_last_error,
      lastHttpStatus: source.connector_last_http_status,
      nextRetryAt: source.connector_next_retry_at,
      healthScore: source.connector_health_score ?? 100,
      degradedReason: source.connector_degraded_reason,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertTopicSourceManageAllowed(session.userId);
    const body = await request.json();
    if (!body.name?.trim() || !body.homepageUrl?.trim()) {
      return fail("名称和主页地址不能为空", 400);
    }
    await createTopicSource({
      userId: session.userId,
      name: body.name,
      homepageUrl: body.homepageUrl,
      sourceType: body.sourceType ? String(body.sourceType) : undefined,
      priority: body.priority,
    });
    return ok({ created: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建信息源失败", 400);
  }
}
