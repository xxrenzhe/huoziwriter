import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getWechatSyncLogs } from "@/lib/repositories";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const logs = await getWechatSyncLogs(session.userId);
  return ok(
    logs.map((log) => ({
      id: log.id,
      documentId: log.document_id,
      title: log.title,
      connectionName: log.connection_name,
      mediaId: log.media_id,
      status: log.status,
      requestSummary: log.request_summary,
      responseSummary: log.response_summary,
      failureReason: log.failure_reason,
      failureCode: log.failure_code,
      retryCount: log.retry_count,
      documentVersionHash: log.document_version_hash,
      templateId: log.template_id,
      idempotencyKey: log.idempotency_key,
      createdAt: log.created_at,
    })),
  );
}
