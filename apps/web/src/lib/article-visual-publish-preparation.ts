import { generateArticleVisualAsset } from "./article-image-generator";
import { insertArticleVisualAssetsIntoMarkdown } from "./article-image-inserter";
import { planArticleVisualBriefs } from "./article-visual-planner";
import { listArticleVisualBriefs, replaceArticleVisualBriefs } from "./article-visual-repository";
import { ensureCoverImagePreparedForPublish } from "./article-automation-publish-repair";
import { getArticleById } from "./repositories";

function readPositiveIntegerEnv(name: string, fallback: number) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));
  return results;
}

const WECHAT_VISUAL_PREP_CONCURRENCY = readPositiveIntegerEnv("WECHAT_VISUAL_PREP_CONCURRENCY", 2);

export async function ensureArticleVisualsPreparedForWechatDraft(input: {
  userId: number;
  articleId: number;
  title: string;
}) {
  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在，无法准备微信草稿图片。");
  }

  const coverPromise = ensureCoverImagePreparedForPublish({
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
  const generationResults = await mapWithConcurrency(pendingInlineBriefs, WECHAT_VISUAL_PREP_CONCURRENCY, async (brief) => {
    try {
      return {
        ok: true as const,
        value: await generateArticleVisualAsset(brief),
      };
    } catch (error) {
      return {
        ok: false as const,
        warning: `${brief.title}: ${error instanceof Error ? error.message : "图片生成失败"}`,
      };
    }
  });
  const generated: Array<Awaited<ReturnType<typeof generateArticleVisualAsset>>> = [];
  for (const result of generationResults) {
    if (result.ok) {
      generated.push(result.value);
    } else {
      warnings.push(result.warning);
    }
  }
  const cover = await coverPromise;

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
    concurrency: WECHAT_VISUAL_PREP_CONCURRENCY,
    warnings,
  };
}
