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
      failureReason: log.failure_reason,
      createdAt: log.created_at,
    })),
  );
}
