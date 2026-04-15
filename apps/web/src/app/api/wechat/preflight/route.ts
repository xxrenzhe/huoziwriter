import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { evaluatePublishGuard } from "@/lib/publish-guard";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const documentId = Number(body.documentId);
    const wechatConnectionId = Number.isFinite(Number(body.wechatConnectionId)) ? Number(body.wechatConnectionId) : null;
    const templateId = typeof body.templateId === "string" && body.templateId.trim() ? body.templateId.trim() : null;
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return fail("文稿不存在", 404);
    }

    const publishGuard = await evaluatePublishGuard({
      documentId,
      userId: session.userId,
      templateId,
      wechatConnectionId,
    });

    return ok({
      connectionHealth: publishGuard.connectionHealth,
      latestAttempt: publishGuard.latestAttempt,
      canPublish: publishGuard.canPublish,
      blockers: publishGuard.blockers,
      warnings: publishGuard.warnings,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "发布前连接自检失败", 400);
  }
}
