import { normalizeArticleStatus, toStoredArticleStatus } from "./article-status-label";
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
  const currentDocument = await getArticleById(input.articleId, input.userId);
  if (!currentDocument) {
    return null;
  }

  const wechatTemplateId =
    input.body.wechatTemplateId === undefined
      ? currentDocument.wechat_template_id
      : input.body.wechatTemplateId === null
        ? null
        : String(input.body.wechatTemplateId);
  await assertWechatTemplateAllowed(input.userId, wechatTemplateId);

  return saveArticle({
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
}

export function serializeArticleDraft(
  savedDocument: Awaited<ReturnType<typeof saveArticleDraft>>,
) {
  return {
    id: savedDocument?.id,
    title: savedDocument?.title,
    htmlContent: savedDocument?.html_content,
    status: normalizeArticleStatus(savedDocument?.status),
    seriesId: savedDocument?.series_id ?? null,
    wechatTemplateId: savedDocument?.wechat_template_id,
    updatedAt: savedDocument?.updated_at,
  };
}
