import { listArticleVisualAssets, listArticleVisualBriefs, updateArticleVisualBriefStatus } from "./article-visual-repository";
import { sanitizeUserVisibleVisualCaption } from "./article-structure-labels";
import { saveArticle } from "./repositories";

function escapeRegExp(value: string) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMarkdownImage(asset: {
  id: number;
  visualBriefId: number | null;
  publicUrl: string | null;
  altText: string | null;
  caption: string | null;
}) {
  const caption = sanitizeUserVisibleVisualCaption(asset.caption);
  const alt = String(asset.altText || caption || "文章配图").replace(/[\r\n]+/g, " ").trim();
  return [
    `<!-- huozi-visual:${asset.id} -->`,
    `![${alt}](${asset.publicUrl})`,
    caption ? `*${caption}*` : null,
  ].filter(Boolean).join("\n");
}

function insertAfterHeading(markdown: string, heading: string, block: string) {
  const trimmedHeading = heading.trim();
  if (!trimmedHeading) {
    return `${markdown.trimEnd()}\n\n${block}\n`;
  }
  const headingPattern = new RegExp(`(^#{1,6}\\s+${escapeRegExp(trimmedHeading)}\\s*$)`, "m");
  const match = markdown.match(headingPattern);
  if (!match || match.index == null) {
    return `${markdown.trimEnd()}\n\n${block}\n`;
  }
  const insertAt = match.index + match[0].length;
  return `${markdown.slice(0, insertAt)}\n\n${block}${markdown.slice(insertAt)}`;
}

export async function insertArticleVisualAssetsIntoMarkdown(input: {
  userId: number;
  articleId: number;
  title: string;
  markdown: string;
}) {
  const briefs = await listArticleVisualBriefs(input.userId, input.articleId);
  const insertableBriefIds = new Set(
    briefs
      .filter((brief) => brief.status !== "failed")
      .map((brief) => brief.id)
      .filter((id): id is number => typeof id === "number"),
  );
  const assets = (await listArticleVisualAssets(input.userId, input.articleId))
    .filter((asset) => asset.assetType !== "cover_image")
    .filter((asset) => asset.assetType !== "diagram_png" && asset.assetType !== "diagram_svg")
    .filter((asset) => asset.publicUrl && asset.status === "ready")
    .filter((asset) => !asset.visualBriefId || insertableBriefIds.has(asset.visualBriefId))
    .filter((asset) => !/已移除|不可用|登录页|抓取失败|来源类型|来源链接/i.test([asset.altText, asset.caption, asset.insertAnchor].filter(Boolean).join(" ")));
  let nextMarkdown = input.markdown;
  const inserted: number[] = [];

  for (const asset of assets) {
    if (nextMarkdown.includes(`huozi-visual:${asset.id}`) || (asset.publicUrl && nextMarkdown.includes(asset.publicUrl))) {
      continue;
    }
    const block = buildMarkdownImage(asset);
    nextMarkdown = insertAfterHeading(nextMarkdown, asset.insertAnchor || sanitizeUserVisibleVisualCaption(asset.caption) || asset.altText || "", block);
    inserted.push(asset.id);
    if (asset.visualBriefId) {
      await updateArticleVisualBriefStatus({
        briefId: asset.visualBriefId,
        userId: input.userId,
        status: "inserted",
        generatedAssetFileId: asset.id,
      });
    }
  }

  if (inserted.length > 0 && nextMarkdown !== input.markdown) {
    await saveArticle({
      articleId: input.articleId,
      userId: input.userId,
      title: input.title,
      markdownContent: nextMarkdown,
    });
  }

  return {
    markdown: nextMarkdown,
    inserted,
  };
}
