import { normalizeArticleStatus, toStoredArticleStatus } from "./article-status-label";
import { recomputeAndPersistArticleOutcome } from "./article-outcome-runtime";
import { assertWechatTemplateAllowed } from "./plan-access";
import { getArticleById, saveArticle } from "./repositories";

type ArticleDraftBody = {
  title?: string;
  markdownContent?: string;
  status?: string;
  seriesId?: number | string | null;
  wechatTemplateId?: string | null;
};

export async function saveArticleDraft(input: {
  articleId: number;
  userId: number;
  body: ArticleDraftBody;
}) {
  const currentArticle = await getArticleById(input.articleId, input.userId);
  if (!currentArticle) {
    return null;
  }

  const wechatTemplateId =
    input.body.wechatTemplateId === undefined
      ? currentArticle.wechat_template_id
      : input.body.wechatTemplateId === null
        ? null
        : String(input.body.wechatTemplateId);
  await assertWechatTemplateAllowed(input.userId, wechatTemplateId);

  const savedArticle = await saveArticle({
    articleId: input.articleId,
    userId: input.userId,
    title: input.body.title,
    markdownContent: input.body.markdownContent,
    status: input.body.status === undefined ? undefined : toStoredArticleStatus(input.body.status),
    seriesId:
      input.body.seriesId === undefined
        ? undefined
        : input.body.seriesId === null
          ? null
          : Number(input.body.seriesId),
    wechatTemplateId,
  });
  if (savedArticle) {
    await recomputeAndPersistArticleOutcome({
      articleId: input.articleId,
      userId: input.userId,
    });
  }
  return savedArticle;
}

export function serializeArticleDraft(
  savedArticle: Awaited<ReturnType<typeof saveArticleDraft>>,
) {
  return {
    id: savedArticle?.id,
    title: savedArticle?.title,
    htmlContent: savedArticle?.html_content,
    status: normalizeArticleStatus(savedArticle?.status),
    seriesId: savedArticle?.series_id ?? null,
    wechatTemplateId: savedArticle?.wechat_template_id,
    updatedAt: savedArticle?.updated_at,
  };
}
