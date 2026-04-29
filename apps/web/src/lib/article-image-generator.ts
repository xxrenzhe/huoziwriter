import { syncArticleVisualAssetToAssetFiles } from "./asset-files";
import { updateArticleVisualBriefStatus } from "./article-visual-repository";
import { evaluateVisualAssetQuality } from "./article-visual-quality";
import type { ArticleVisualBrief } from "./article-visual-types";
import { generateCoverImage } from "./image-generation";
import { persistArticleVisualImageAssetSet } from "./image-assets";

function resolveAssetType(brief: ArticleVisualBrief): "cover_image" | "inline_image" | "infographic" | "diagram_svg" | "diagram_png" | "comic" {
  if (brief.visualScope === "cover") return "cover_image";
  if (brief.visualScope === "infographic") return "infographic";
  if (brief.visualScope === "diagram") return "diagram_png";
  if (brief.visualScope === "comic") return "comic";
  return "inline_image";
}

export async function generateArticleVisualAsset(brief: ArticleVisualBrief) {
  if (!brief.id) {
    throw new Error("视觉 brief 尚未落库，无法生成图片");
  }
  if (brief.visualScope === "diagram" || brief.baoyuSkill === "baoyu-diagram") {
    await updateArticleVisualBriefStatus({
      briefId: brief.id,
      userId: brief.userId,
      status: "failed",
      errorMessage: "当前文章生成流程不再使用 SVG/diagram 图解，请改用 baoyu-infographic 或 baoyu-comic。",
    });
    throw new Error("当前文章生成流程不再使用 SVG/diagram 图解，请改用 baoyu-infographic 或 baoyu-comic。");
  }
  await updateArticleVisualBriefStatus({
    briefId: brief.id,
    userId: brief.userId,
    status: "generating",
  });

  try {
    const generated = await generateCoverImage({
      title: brief.title,
      promptOverride: brief.promptText || undefined,
      negativePrompt: brief.negativePrompt || undefined,
      outputResolution: brief.outputResolution,
      aspectRatio: brief.aspectRatio,
    });

    const assetType = resolveAssetType(brief);
    const persisted = await persistArticleVisualImageAssetSet({
      userId: brief.userId,
      articleId: brief.articleId,
      visualBriefId: brief.id,
      assetType,
      source: generated.imageUrl,
      aspectRatio: brief.aspectRatio,
    });
    const manifest = {
      ...(persisted.assetManifest || {}),
      baoyu: brief.promptManifest || null,
      promptHash: brief.promptHash || null,
      prompt: generated.prompt,
      provider: generated.providerName,
      model: generated.model,
      endpoint: generated.endpoint,
      size: generated.size,
      visualScope: brief.visualScope,
      visualType: brief.visualType,
    };
    const quality = evaluateVisualAssetQuality({
      brief,
      asset: {
        id: 0,
        visualBriefId: brief.id,
        articleNodeId: brief.articleNodeId ?? null,
        assetType,
        publicUrl: persisted.imageUrl,
        altText: brief.altText,
        caption: brief.caption ?? null,
        insertAnchor: brief.targetAnchor,
        status: "ready",
        manifest,
      },
      requirePublishReady: true,
    });
    if (quality.status === "blocked") {
      throw new Error(quality.blockers.join("；") || "图片质量门槛未通过");
    }
    const assetFileId = await syncArticleVisualAssetToAssetFiles({
      assetScope: "visual_brief",
      sourceRecordId: brief.id,
      visualBriefId: brief.id,
      userId: brief.userId,
      articleId: brief.articleId,
      articleNodeId: brief.articleNodeId ?? null,
      assetType,
      imageUrl: persisted.imageUrl,
      storageProvider: persisted.storageProvider,
      originalObjectKey: persisted.originalObjectKey,
      compressedObjectKey: persisted.compressedObjectKey,
      thumbnailObjectKey: persisted.thumbnailObjectKey,
      assetManifestJson: manifest,
      insertAnchor: brief.targetAnchor,
      altText: brief.altText,
      caption: brief.caption ?? null,
    });
    await updateArticleVisualBriefStatus({
      briefId: brief.id,
      userId: brief.userId,
      status: "generated",
      generatedAssetFileId: assetFileId,
    });
    return {
      assetFileId,
      imageUrl: persisted.imageUrl,
      assetType,
      promptHash: brief.promptHash || null,
    };
  } catch (error) {
    await updateArticleVisualBriefStatus({
      briefId: brief.id,
      userId: brief.userId,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "图片生成失败",
    });
    throw error;
  }
}
