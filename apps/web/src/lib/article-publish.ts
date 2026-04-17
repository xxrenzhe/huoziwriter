import { setArticleWorkflowPendingPublishIntent } from "./article-workflows";
import { fail, failWithData, ok } from "./http";
import { WechatPublishError, publishArticleToWechat } from "./wechat-publish";

export async function handleArticlePublish(input: {
  userId: number;
  articleId: number;
  wechatConnectionId: number | null;
  templateId?: string | null;
  digest?: string | null;
  author?: string | null;
}) {
  if (!Number.isInteger(input.articleId) || input.articleId <= 0) {
    return fail("稿件不存在", 404);
  }
  if (!Number.isInteger(input.wechatConnectionId) || Number(input.wechatConnectionId) <= 0) {
    try {
      await setArticleWorkflowPendingPublishIntent({
        articleId: input.articleId,
        userId: input.userId,
        intent: {
          templateId: input.templateId ?? null,
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
    const wechatConnectionId = Number(input.wechatConnectionId);
    const result = await publishArticleToWechat({
      userId: input.userId,
      articleId: input.articleId,
      wechatConnectionId,
      templateId: input.templateId ?? null,
      digest: input.digest ?? null,
      author: input.author ?? null,
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

export async function handleArticlePublishRetry(input: {
  userId: number;
  articleId: number;
  wechatConnectionId: number | null;
  templateId?: string | null;
}) {
  if (!Number.isInteger(input.articleId) || input.articleId <= 0) {
    return fail("稿件不存在", 404);
  }
  if (!Number.isInteger(input.wechatConnectionId) || Number(input.wechatConnectionId) <= 0) {
    return fail("公众号连接不存在", 404);
  }

  try {
    const result = await publishArticleToWechat({
      userId: input.userId,
      articleId: input.articleId,
      wechatConnectionId: Number(input.wechatConnectionId),
      templateId: input.templateId ?? null,
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
