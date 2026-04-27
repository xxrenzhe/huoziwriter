import { generateArticleVisualAsset } from "./article-image-generator";
import { insertArticleVisualAssetsIntoMarkdown } from "./article-image-inserter";
import { planArticleVisualBriefs } from "./article-visual-planner";
import { listArticleVisualBriefs, replaceArticleVisualBriefs } from "./article-visual-repository";
import { ensureCoverImagePreparedForPublish } from "./article-automation-publish-repair";
import { getArticleById } from "./repositories";

export async function ensureArticleVisualsPreparedForWechatDraft(input: {
  userId: number;
  articleId: number;
  title: string;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在，无法准备微信草稿图片。");
  }

  const cover = await ensureCoverImagePreparedForPublish({
    userId: input.userId,
    articleId: input.articleId,
    title: input.title,
  });

  let briefs = await listArticleVisualBriefs(input.userId, input.articleId);
  if (!briefs.some((brief) => brief.visualScope !== "cover")) {
    await replaceArticleVisualBriefs({
      userId: input.userId,
      articleId: input.articleId,
      briefs: await planArticleVisualBriefs({
        userId: input.userId,
        articleId: input.articleId,
        title: input.title,
        markdown: article.markdown_content,
        includeCover: false,
        includeInline: true,
      }),
    });
    briefs = await listArticleVisualBriefs(input.userId, input.articleId);
  }

  const pendingInlineBriefs = briefs.filter((brief) => brief.visualScope !== "cover" && brief.status !== "generated" && brief.status !== "inserted");
  const warnings: string[] = [];
  const generated: Array<Awaited<ReturnType<typeof generateArticleVisualAsset>>> = [];
  for (const brief of pendingInlineBriefs) {
    try {
      generated.push(await generateArticleVisualAsset(brief));
    } catch (error) {
      warnings.push(`${brief.title}: ${error instanceof Error ? error.message : "图片生成失败"}`);
    }
  }

  const refreshedArticle = await getArticleById(input.articleId, input.userId);
  const insertion = refreshedArticle
    ? await insertArticleVisualAssetsIntoMarkdown({
        userId: input.userId,
        articleId: input.articleId,
        title: refreshedArticle.title,
        markdown: refreshedArticle.markdown_content,
      })
    : { inserted: [] };

  return {
    coverChanged: cover.changed,
    coverProvider: cover.provider,
    coverModel: cover.model,
    inlineBriefCount: briefs.filter((brief) => brief.visualScope !== "cover").length,
    pendingInlineCount: pendingInlineBriefs.length,
    generatedInlineCount: generated.length,
    insertedInlineCount: insertion.inserted.length,
    warnings,
  };
}
