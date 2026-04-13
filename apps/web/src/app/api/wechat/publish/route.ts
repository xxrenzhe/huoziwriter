import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getActiveTemplateById } from "@/lib/marketplace";
import { assertWechatPublishAllowed } from "@/lib/plan-access";
import { createWechatSyncLog, getDocumentById, getWechatConnectionRaw, saveDocument, updateWechatConnectionToken } from "@/lib/repositories";
import { encryptSecret } from "@/lib/security";
import { publishWechatDraft } from "@/lib/wechat";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await assertWechatPublishAllowed(session.userId);

  const body = await request.json();
  const document = await getDocumentById(Number(body.documentId), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const connection = await getWechatConnectionRaw(Number(body.wechatConnectionId), session.userId);
  if (!connection) {
    return fail("公众号连接不存在", 404);
  }
  if (connection.status === "disabled") {
    return fail("公众号连接已停用", 400);
  }

  try {
    const templateId = body.templateId ? String(body.templateId) : document.wechat_template_id;
    const template = templateId ? await getActiveTemplateById(templateId) : null;
    const result = await publishWechatDraft({
      connection,
      title: document.title,
      markdownContent: document.markdown_content,
      digest: body.digest,
      author: body.author,
      templateConfig: template
        ? {
            titleStyle: typeof template.config?.titleStyle === "string" ? template.config.titleStyle : undefined,
            paragraphLength: typeof template.config?.paragraphLength === "string" ? template.config.paragraphLength : undefined,
          }
        : null,
    });
    await updateWechatConnectionToken({
      connectionId: connection.id,
      userId: session.userId,
      accessTokenEncrypted: encryptSecret(result.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
      status: "valid",
    });
    await createWechatSyncLog({
      userId: session.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
      mediaId: result.mediaId,
      status: "success",
      requestSummary: result.requestSummary,
      responseSummary: result.responseSummary,
    });
    await saveDocument({
      documentId: document.id,
      userId: session.userId,
      status: "published",
      wechatTemplateId: templateId ?? null,
    });
    return ok({ mediaId: result.mediaId });
  } catch (error) {
    await createWechatSyncLog({
      userId: session.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
      status: "failed",
      failureReason: error instanceof Error ? error.message : "推送失败",
    });
    await saveDocument({
      documentId: document.id,
      userId: session.userId,
      status: "publishFailed",
    });
    return fail(error instanceof Error ? error.message : "推送微信草稿箱失败", 400);
  }
}
