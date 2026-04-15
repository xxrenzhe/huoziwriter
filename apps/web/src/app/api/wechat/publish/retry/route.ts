import { ensureUserSession } from "@/lib/auth";
import { fail, failWithData, ok } from "@/lib/http";
import { assertWechatPublishAllowed } from "@/lib/plan-access";
import { WechatPublishError, publishDocumentToWechat } from "@/lib/wechat-publish";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await assertWechatPublishAllowed(session.userId);

  try {
    const body = await request.json().catch(() => ({}));
    const documentId = Number(body.documentId);
    const wechatConnectionId = Number(body.wechatConnectionId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return fail("文稿不存在", 404);
    }
    if (!Number.isInteger(wechatConnectionId) || wechatConnectionId <= 0) {
      return fail("公众号连接不存在", 404);
    }

    const result = await publishDocumentToWechat({
      userId: session.userId,
      documentId,
      wechatConnectionId,
      templateId: typeof body.templateId === "string" && body.templateId.trim() ? body.templateId.trim() : null,
    });

    return ok({
      mediaId: result.mediaId,
      reused: result.reused,
      idempotencyKey: result.idempotencyKey,
      retried: true,
    });
  } catch (error) {
    if (error instanceof WechatPublishError) {
      return failWithData(error.message, 400, {
        code: error.code,
        retryable: error.retryable,
        publishGuard: error.publishGuard,
      });
    }
    return fail(error instanceof Error ? error.message : "发布重试失败", 400);
  }
}
