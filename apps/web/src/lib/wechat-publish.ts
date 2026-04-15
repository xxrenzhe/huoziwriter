import { createHash } from "node:crypto";
import {
  clearDocumentWorkflowPendingPublishIntent,
  completeDocumentWorkflowStage,
  failDocumentWorkflowStage,
  setDocumentWorkflowCurrentStage,
  setDocumentWorkflowPendingPublishIntent,
} from "./document-workflows";
import { getActiveTemplateById } from "./marketplace";
import { assertWechatTemplateAllowed } from "./plan-access";
import { evaluatePublishGuard, type PublishGuardResult } from "./publish-guard";
import { createWechatSyncLog, getDocumentById, getLatestWechatSyncLogForDocument, getWechatConnectionRaw, saveDocument, updateWechatConnectionToken } from "./repositories";
import { encryptSecret } from "./security";
import { resolveTemplateRenderConfig } from "./template-rendering";
import { publishWechatDraft } from "./wechat";

export class WechatPublishError extends Error {
  code: string;
  retryable: boolean;
  publishGuard?: PublishGuardResult;

  constructor(message: string, options: { code: string; retryable?: boolean; publishGuard?: PublishGuardResult }) {
    super(message);
    this.code = options.code;
    this.retryable = Boolean(options.retryable);
    this.publishGuard = options.publishGuard;
  }
}

export function buildDocumentVersionHash(input: {
  documentId: number;
  title: string;
  markdownContent: string;
  templateId: string | null;
  wechatConnectionId: number;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        documentId: input.documentId,
        title: input.title,
        markdownContent: input.markdownContent,
        templateId: input.templateId,
        wechatConnectionId: input.wechatConnectionId,
      }),
    )
    .digest("hex");
}

export function classifyPublishFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "推送失败";
  if (/(access_token|token|凭证|appid|appsecret|secret|credential|授权|验证失败)/i.test(message)) {
    return { code: "auth_failed", message };
  }
  if (/(thumb|封面|图片|image|media)/i.test(message)) {
    return { code: "media_failed", message };
  }
  if (/(频率|rate|quota|limit|次数)/i.test(message)) {
    return { code: "rate_limited", message };
  }
  if (/(html|content|内容|格式|标题|素材)/i.test(message)) {
    return { code: "content_invalid", message };
  }
  return { code: "upstream_error", message };
}

export async function publishDocumentToWechat(input: {
  userId: number;
  documentId: number;
  wechatConnectionId: number;
  templateId?: string | null;
  digest?: string | null;
  author?: string | null;
}) {
  const document = await getDocumentById(input.documentId, input.userId);
  if (!document) {
    throw new WechatPublishError("文稿不存在", { code: "document_missing" });
  }
  const connection = await getWechatConnectionRaw(input.wechatConnectionId, input.userId);
  if (!connection) {
    throw new WechatPublishError("公众号连接不存在", { code: "connection_missing" });
  }
  if (connection.status === "disabled") {
    throw new WechatPublishError("公众号连接已停用", { code: "connection_disabled" });
  }

  const templateId = input.templateId ?? document.wechat_template_id;

  try {
    await setDocumentWorkflowCurrentStage({
      documentId: document.id,
      userId: input.userId,
      stageCode: "publish",
    });

    await assertWechatTemplateAllowed(input.userId, templateId);
    const documentVersionHash = buildDocumentVersionHash({
      documentId: document.id,
      title: document.title,
      markdownContent: document.markdown_content,
      templateId: templateId ?? null,
      wechatConnectionId: connection.id,
    });
    const idempotencyKey = `wechat:${document.id}:${connection.id}:${documentVersionHash}`;
    const publishGuard = await evaluatePublishGuard({
      documentId: document.id,
      userId: input.userId,
      templateId,
      wechatConnectionId: connection.id,
    });
    if (!publishGuard.canPublish) {
      throw new WechatPublishError(publishGuard.blockers.join("；"), {
        code: "publish_guard_blocked",
        publishGuard,
      });
    }

    const latestVersionLog = await getLatestWechatSyncLogForDocument({
      userId: input.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
      documentVersionHash,
    });
    if (latestVersionLog?.status === "success" && latestVersionLog.media_id) {
      await saveDocument({
        documentId: document.id,
        userId: input.userId,
        status: "published",
        wechatTemplateId: templateId ?? null,
      });
      await clearDocumentWorkflowPendingPublishIntent({
        documentId: document.id,
        userId: input.userId,
      });
      await completeDocumentWorkflowStage({
        documentId: document.id,
        userId: input.userId,
        stageCode: "publish",
      });
      return {
        mediaId: latestVersionLog.media_id,
        reused: true,
        idempotencyKey,
        documentVersionHash,
      };
    }

    const template = templateId ? await getActiveTemplateById(templateId, input.userId) : null;
    const result = await publishWechatDraft({
      connection,
      title: document.title,
      markdownContent: document.markdown_content,
      digest: input.digest ?? undefined,
      author: input.author ?? undefined,
      templateConfig: resolveTemplateRenderConfig(template),
    });
    await updateWechatConnectionToken({
      connectionId: connection.id,
      userId: input.userId,
      accessTokenEncrypted: encryptSecret(result.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
      status: "valid",
    });
    await createWechatSyncLog({
      userId: input.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
      mediaId: result.mediaId,
      status: "success",
      requestSummary: result.requestSummary,
      responseSummary: result.responseSummary,
      documentVersionHash,
      templateId: templateId ?? null,
      idempotencyKey,
      retryCount: latestVersionLog?.status === "failed" ? (latestVersionLog.retry_count ?? 0) + 1 : 0,
    });
    await saveDocument({
      documentId: document.id,
      userId: input.userId,
      status: "published",
      wechatTemplateId: templateId ?? null,
    });
    await clearDocumentWorkflowPendingPublishIntent({
      documentId: document.id,
      userId: input.userId,
    });
    await completeDocumentWorkflowStage({
      documentId: document.id,
      userId: input.userId,
      stageCode: "publish",
    });
    return {
      mediaId: result.mediaId,
      reused: false,
      idempotencyKey,
      documentVersionHash,
    };
  } catch (error) {
    if (error instanceof WechatPublishError && error.code === "publish_guard_blocked") {
      throw error;
    }
    const failure = classifyPublishFailure(error);
    const latestVersionLog = await getLatestWechatSyncLogForDocument({
      userId: input.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
    });
    const documentVersionHash = buildDocumentVersionHash({
      documentId: document.id,
      title: document.title,
      markdownContent: document.markdown_content,
      templateId: templateId ?? null,
      wechatConnectionId: connection.id,
    });
    await createWechatSyncLog({
      userId: input.userId,
      documentId: document.id,
      wechatConnectionId: connection.id,
      status: "failed",
      failureReason: failure.message,
      failureCode: failure.code,
      documentVersionHash,
      templateId: templateId ?? null,
      idempotencyKey: `wechat:${document.id}:${connection.id}:${documentVersionHash}`,
      retryCount: (latestVersionLog?.retry_count ?? 0) + 1,
    });
    await saveDocument({
      documentId: document.id,
      userId: input.userId,
      status: "publishFailed",
    });
    if (failure.code === "auth_failed") {
      await setDocumentWorkflowPendingPublishIntent({
        documentId: document.id,
        userId: input.userId,
        intent: {
          templateId: templateId ?? null,
          reason: "auth_failed",
        },
      });
    }
    await failDocumentWorkflowStage({
      documentId: document.id,
      userId: input.userId,
      stageCode: "publish",
    });
    throw new WechatPublishError(failure.message, {
      code: failure.code,
      retryable: !["auth_failed", "content_invalid"].includes(failure.code),
    });
  }
}
