import { createHash } from "node:crypto";
import {
  clearArticleWorkflowPendingPublishIntent,
  completeArticleWorkflowStage,
  failArticleWorkflowStage,
  setArticleWorkflowCurrentStage,
  setArticleWorkflowPendingPublishIntent,
} from "./article-workflows";
import { getArticleStageArtifact } from "./article-stage-artifacts";
import { getActiveTemplateById } from "./layout-templates";
import { assertWechatTemplateAllowed } from "./plan-access";
import { evaluatePublishGuard, type PublishGuardResult } from "./publish-guard";
import { createWechatSyncLog, getArticleById, getLatestWechatSyncLogForArticle, getWechatConnectionRaw, saveArticle, updateWechatConnectionToken } from "./repositories";
import { encryptSecret } from "./security";
import { resolveTemplateRenderConfig } from "./template-rendering";
import { publishWechatDraft } from "./wechat";

async function withWechatPersistenceRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/database is locked/i.test(message) || attempt === 4) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
  throw new Error("微信发布状态持久化失败");
}

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

export function buildArticleVersionHash(input: {
  articleId: number;
  title: string;
  markdownContent: string;
  templateId: string | null;
  wechatConnectionId: number;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        articleId: input.articleId,
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
  if (/(not in whitelist|invalid ip|接口白名单|出口 IP)/i.test(message)) {
    return { code: "ip_whitelist_blocked", message };
  }
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

export async function publishArticleToWechat(input: {
  userId: number;
  articleId: number;
  wechatConnectionId: number;
  templateId?: string | null;
  digest?: string | null;
  author?: string | null;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new WechatPublishError("稿件不存在", { code: "article_missing" });
  }
  const connection = await getWechatConnectionRaw(input.wechatConnectionId, input.userId);
  if (!connection) {
    throw new WechatPublishError("公众号连接不存在", { code: "connection_missing" });
  }
  if (connection.status === "disabled") {
    throw new WechatPublishError("公众号连接已停用", { code: "connection_disabled" });
  }

  const templateId = input.templateId ?? article.wechat_template_id;
  const outlineArtifact = await getArticleStageArtifact(article.id, input.userId, "outlinePlanning").catch(() => null);
  const outlineSelection =
    outlineArtifact?.payload
    && typeof outlineArtifact.payload.selection === "object"
    && outlineArtifact.payload.selection
    && !Array.isArray(outlineArtifact.payload.selection)
      ? (outlineArtifact.payload.selection as Record<string, unknown>)
      : null;
  const selectedTitle = String(outlineSelection?.selectedTitle || "").trim();
  const effectiveTitle = selectedTitle || article.title;

  try {
    await withWechatPersistenceRetry(() => setArticleWorkflowCurrentStage({
      articleId: article.id,
      userId: input.userId,
      stageCode: "publish",
    }));

    await assertWechatTemplateAllowed(input.userId, templateId);
    const articleVersionHash = buildArticleVersionHash({
      articleId: article.id,
      title: effectiveTitle,
      markdownContent: article.markdown_content,
      templateId: templateId ?? null,
      wechatConnectionId: connection.id,
    });
    const idempotencyKey = `wechat:${article.id}:${connection.id}:${articleVersionHash}`;
    const publishGuard = await evaluatePublishGuard({
      articleId: article.id,
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

    const latestVersionLog = await getLatestWechatSyncLogForArticle({
      userId: input.userId,
      articleId: article.id,
      wechatConnectionId: connection.id,
      articleVersionHash,
    });
    if (latestVersionLog?.status === "success" && latestVersionLog.media_id) {
      await withWechatPersistenceRetry(() => saveArticle({
        articleId: article.id,
        userId: input.userId,
        status: "published",
        wechatTemplateId: templateId ?? null,
      }));
      await withWechatPersistenceRetry(() => clearArticleWorkflowPendingPublishIntent({
        articleId: article.id,
        userId: input.userId,
      }));
      await withWechatPersistenceRetry(() => completeArticleWorkflowStage({
        articleId: article.id,
        userId: input.userId,
        stageCode: "publish",
      }));
      return {
        mediaId: latestVersionLog.media_id,
        reused: true,
        idempotencyKey,
        articleVersionHash,
      };
    }

    const template = templateId ? await getActiveTemplateById(templateId, input.userId) : null;
    const result = await publishWechatDraft({
      connection,
      title: effectiveTitle,
      markdownContent: article.markdown_content,
      digest: input.digest ?? undefined,
      author: input.author ?? undefined,
      templateConfig: resolveTemplateRenderConfig(template),
    });
    await withWechatPersistenceRetry(() => updateWechatConnectionToken({
      connectionId: connection.id,
      userId: input.userId,
      accessTokenEncrypted: encryptSecret(result.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
      status: "valid",
    }));
    await withWechatPersistenceRetry(() => createWechatSyncLog({
      userId: input.userId,
      articleId: article.id,
      wechatConnectionId: connection.id,
      mediaId: result.mediaId,
      status: "success",
      requestSummary: result.requestSummary,
      responseSummary: result.responseSummary,
      articleVersionHash,
      templateId: templateId ?? null,
      idempotencyKey,
      retryCount: latestVersionLog?.status === "failed" ? (latestVersionLog.retry_count ?? 0) + 1 : 0,
    }));
    await withWechatPersistenceRetry(() => saveArticle({
      articleId: article.id,
      userId: input.userId,
      status: "published",
      wechatTemplateId: templateId ?? null,
    }));
    await withWechatPersistenceRetry(() => clearArticleWorkflowPendingPublishIntent({
      articleId: article.id,
      userId: input.userId,
    }));
    await withWechatPersistenceRetry(() => completeArticleWorkflowStage({
      articleId: article.id,
      userId: input.userId,
      stageCode: "publish",
    }));
    return {
      mediaId: result.mediaId,
      reused: false,
      idempotencyKey,
      articleVersionHash,
    };
  } catch (error) {
    if (error instanceof WechatPublishError && error.code === "publish_guard_blocked") {
      throw error;
    }
    const failure = classifyPublishFailure(error);
    const latestVersionLog = await getLatestWechatSyncLogForArticle({
      userId: input.userId,
      articleId: article.id,
      wechatConnectionId: connection.id,
    });
    const articleVersionHash = buildArticleVersionHash({
      articleId: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
      templateId: templateId ?? null,
      wechatConnectionId: connection.id,
    });
    await withWechatPersistenceRetry(() => createWechatSyncLog({
      userId: input.userId,
      articleId: article.id,
      wechatConnectionId: connection.id,
      status: "failed",
      failureReason: failure.message,
      failureCode: failure.code,
      articleVersionHash,
      templateId: templateId ?? null,
      idempotencyKey: `wechat:${article.id}:${connection.id}:${articleVersionHash}`,
      retryCount: (latestVersionLog?.retry_count ?? 0) + 1,
    }));
    await withWechatPersistenceRetry(() => saveArticle({
      articleId: article.id,
      userId: input.userId,
      status: "publish_failed",
    }));
    if (failure.code === "auth_failed") {
      await withWechatPersistenceRetry(() => setArticleWorkflowPendingPublishIntent({
        articleId: article.id,
        userId: input.userId,
        intent: {
          templateId: templateId ?? null,
          reason: "auth_failed",
        },
      }));
    }
    await withWechatPersistenceRetry(() => failArticleWorkflowStage({
      articleId: article.id,
      userId: input.userId,
      stageCode: "publish",
    }));
    throw new WechatPublishError(failure.message, {
      code: failure.code,
      retryable: !["auth_failed", "ip_whitelist_blocked", "content_invalid"].includes(failure.code),
    });
  }
}
