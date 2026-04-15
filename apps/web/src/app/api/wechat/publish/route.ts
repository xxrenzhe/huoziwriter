import { ensureUserSession } from "@/lib/auth";
import { setDocumentWorkflowPendingPublishIntent } from "@/lib/document-workflows";
import { fail, failWithData, ok } from "@/lib/http";
import { assertWechatPublishAllowed } from "@/lib/plan-access";
import { WechatPublishError, publishDocumentToWechat } from "@/lib/wechat-publish";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await assertWechatPublishAllowed(session.userId);

  const body = await request.json();
  const documentId = Number(body.documentId);
  const wechatConnectionId = Number(body.wechatConnectionId);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return fail("文稿不存在", 404);
  }
  if (!Number.isInteger(wechatConnectionId) || wechatConnectionId <= 0) {
    try {
      await setDocumentWorkflowPendingPublishIntent({
        documentId,
        userId: session.userId,
        intent: {
          templateId: body.templateId ? String(body.templateId) : null,
          reason: "missing_connection",
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "保存待恢复发布意图失败", 400);
    }
    return failWithData("当前还没有可用公众号连接，已保留待发布状态。", 400, {
      code: "connection_missing",
      retryable: false,
    });
  }

  try {
    const result = await publishDocumentToWechat({
      userId: session.userId,
      documentId,
      wechatConnectionId,
      templateId: body.templateId ? String(body.templateId) : null,
      digest: typeof body.digest === "string" ? body.digest : null,
      author: typeof body.author === "string" ? body.author : null,
    });
    return ok({ mediaId: result.mediaId, reused: result.reused, idempotencyKey: result.idempotencyKey });
  } catch (error) {
    if (error instanceof WechatPublishError) {
      return failWithData(error.message, 400, {
        code: error.code,
        retryable: error.retryable,
        publishGuard: error.publishGuard,
      });
    }
    return fail(error instanceof Error ? error.message : "推送微信草稿箱失败", 400);
  }
}
