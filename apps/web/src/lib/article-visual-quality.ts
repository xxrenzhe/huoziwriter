import { listArticleVisualAssets, listArticleVisualBriefs } from "./article-visual-repository";
import { isInternalArticleStructureLabel } from "./article-structure-labels";
import type { ArticleVisualAsset, ArticleVisualBrief } from "./article-visual-types";

export type ArticleVisualQualityStatus = "passed" | "warning" | "blocked";

export type ArticleVisualQualityIssue = {
  key: string;
  status: ArticleVisualQualityStatus;
  detail: string;
  visualBriefId?: number | null;
  assetFileId?: number | null;
};

export type ArticleVisualQualityResult = {
  status: ArticleVisualQualityStatus;
  blockers: string[];
  warnings: string[];
  issues: ArticleVisualQualityIssue[];
  checkedBriefCount: number;
  checkedAssetCount: number;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseAspectRatio(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : null;
}

function aspectRatioMatches(input: {
  expected: string | null | undefined;
  width: number | null;
  height: number | null;
}) {
  const expected = parseAspectRatio(input.expected);
  if (!expected || !input.width || !input.height) return true;
  const actual = input.width / input.height;
  return Math.abs(actual - expected) / expected <= 0.12;
}

function isPublishableImageUrl(value: string | null | undefined) {
  const url = String(value || "").trim();
  return Boolean(url && (/^https?:\/\//i.test(url) || url.startsWith("/") || /^data:image\//i.test(url)));
}

function pushIssue(
  issues: ArticleVisualQualityIssue[],
  input: ArticleVisualQualityIssue,
) {
  issues.push(input);
}

export function evaluateVisualAssetQuality(input: {
  brief: ArticleVisualBrief;
  asset?: ArticleVisualAsset | null;
  requirePublishReady?: boolean;
}) {
  const issues: ArticleVisualQualityIssue[] = [];
  const briefId = input.brief.id ?? null;
  const assetFileId = input.asset?.id ?? null;
  const manifest = getRecord(input.asset?.manifest);
  const original = getRecord(manifest?.original);
  const compressed = getRecord(manifest?.compressed);
  const publicUrl = getString(input.asset?.publicUrl) || getString(compressed?.publicUrl);
  const compressedContentType = getString(compressed?.contentType);
  const originalContentType = getString(original?.contentType) || getString(manifest?.contentType);
  const compressedWidth = getNumber(compressed?.width);
  const compressedHeight = getNumber(compressed?.height);
  const isDiagram = input.brief.visualScope === "diagram" || input.brief.baoyuSkill === "baoyu-diagram";

  if (!input.brief.altText?.trim()) {
    pushIssue(issues, {
      key: "visual_alt_text_missing",
      status: input.requirePublishReady ? "blocked" : "warning",
      detail: "视觉资产缺少 altText，无法满足微信和无障碍发布要求。",
      visualBriefId: briefId,
      assetFileId,
    });
  }

  if (input.brief.visualScope !== "cover") {
    const userVisibleTexts = [
      input.brief.title,
      input.brief.caption,
      input.brief.altText,
      ...input.brief.labels,
    ].map((item) => getString(item)).filter(Boolean);
    const internalLabelHits = userVisibleTexts.filter((item) => isInternalArticleStructureLabel(item));
    if (internalLabelHits.length > 0) {
      pushIssue(issues, {
        key: "visual_internal_label_exposed",
        status: input.requirePublishReady ? "blocked" : "warning",
        detail: `文中配图暴露了内部结构标签：${Array.from(new Set(internalLabelHits)).join("、")}。配图必须围绕证据、对比、路径或现场信息命名。`,
        visualBriefId: briefId,
        assetFileId,
      });
    }
    if (!input.brief.purpose?.trim()) {
      pushIssue(issues, {
        key: "visual_purpose_missing",
        status: "warning",
        detail: "文中配图缺少 purpose，后续无法判断图是否真的提升理解效率。",
        visualBriefId: briefId,
        assetFileId,
      });
    }
    if (!input.brief.sourceFacts.length) {
      pushIssue(issues, {
        key: "visual_source_facts_missing",
        status: "warning",
        detail: "文中配图缺少 sourceFacts，信息图和标签存在事实漂移风险。",
        visualBriefId: briefId,
        assetFileId,
      });
    }
    if (!input.brief.targetAnchor?.trim()) {
      pushIssue(issues, {
        key: "visual_anchor_missing",
        status: "warning",
        detail: "文中配图未绑定正文锚点，插入位置不可审计。",
        visualBriefId: briefId,
        assetFileId,
      });
    }
  }

  if (!input.asset) {
    pushIssue(issues, {
      key: "visual_asset_missing",
      status: input.requirePublishReady ? "blocked" : "warning",
      detail: `${input.brief.visualScope === "cover" ? "封面图" : "文中配图"} brief 已生成，但还没有可用图片资产。`,
      visualBriefId: briefId,
      assetFileId,
    });
    return summarizeIssues(issues);
  }

  if (!isPublishableImageUrl(publicUrl)) {
    pushIssue(issues, {
      key: "visual_asset_url_missing",
      status: input.requirePublishReady ? "blocked" : "warning",
      detail: "视觉资产缺少可发布 URL。",
      visualBriefId: briefId,
      assetFileId,
    });
  }

  if (!getString(manifest?.promptHash) && !input.brief.promptHash) {
    pushIssue(issues, {
      key: "visual_prompt_hash_missing",
      status: "warning",
      detail: "视觉资产 manifest 缺少 promptHash，无法稳定复现同一张图的提示词。",
      visualBriefId: briefId,
      assetFileId,
    });
  }

  if (!getRecord(manifest?.baoyu) && !input.brief.promptManifest) {
    pushIssue(issues, {
      key: "visual_prompt_manifest_missing",
      status: "warning",
      detail: "视觉资产缺少 baoyu prompt manifest，后续重生成和审计会失去上下文。",
      visualBriefId: briefId,
      assetFileId,
    });
  }

  if (!aspectRatioMatches({
    expected: input.brief.aspectRatio,
    width: compressedWidth,
    height: compressedHeight,
  })) {
    pushIssue(issues, {
      key: "visual_aspect_ratio_mismatch",
      status: input.requirePublishReady ? "blocked" : "warning",
      detail: `视觉资产比例与 brief 要求 ${input.brief.aspectRatio} 不一致。`,
      visualBriefId: briefId,
      assetFileId,
    });
  }

  if (isDiagram) {
    if (!originalContentType.includes("svg")) {
      pushIssue(issues, {
        key: "diagram_svg_original_missing",
        status: "warning",
        detail: "SVG 图解未保留原始 SVG，资产中心无法下载可编辑源文件。",
        visualBriefId: briefId,
        assetFileId,
      });
    }
    if (!compressedContentType || compressedContentType.includes("svg")) {
      pushIssue(issues, {
        key: "diagram_raster_derivative_missing",
        status: input.requirePublishReady ? "blocked" : "warning",
        detail: "SVG 图解缺少 PNG/WebP/JPEG 可发布衍生图，微信正文不应直接使用 SVG。",
        visualBriefId: briefId,
        assetFileId,
      });
    }
  }

  return summarizeIssues(issues);
}

function summarizeIssues(issues: ArticleVisualQualityIssue[]): Pick<ArticleVisualQualityResult, "status" | "blockers" | "warnings" | "issues"> {
  const blockers = issues.filter((item) => item.status === "blocked").map((item) => item.detail);
  const warnings = issues.filter((item) => item.status === "warning").map((item) => item.detail);
  return {
    status: blockers.length ? "blocked" : warnings.length ? "warning" : "passed",
    blockers,
    warnings,
    issues,
  };
}

export async function evaluateArticleVisualQuality(input: {
  userId: number;
  articleId: number;
  requireCover?: boolean;
  requireInline?: boolean;
}): Promise<ArticleVisualQualityResult> {
  const [briefs, assets] = await Promise.all([
    listArticleVisualBriefs(input.userId, input.articleId),
    listArticleVisualAssets(input.userId, input.articleId),
  ]);
  const activeBriefs = briefs.filter((brief) => brief.status !== "failed");
  const readyAssets = assets.filter((asset) => asset.status === "ready");
  const assetByBriefId = new Map<number, ArticleVisualAsset>();
  for (const asset of readyAssets) {
    if (asset.visualBriefId && (!assetByBriefId.has(asset.visualBriefId) || asset.status === "ready")) {
      assetByBriefId.set(asset.visualBriefId, asset);
    }
  }
  const issues: ArticleVisualQualityIssue[] = [];
  if (input.requireCover === true) {
    const hasReadyCover = readyAssets.some((asset) => {
      const brief = activeBriefs.find((item) => item.id === asset.visualBriefId);
      return asset.assetType === "cover_image" || brief?.visualScope === "cover";
    });
    if (!hasReadyCover) {
      pushIssue(issues, {
        key: "visual_cover_required",
        status: "blocked",
        detail: "准备同步公众号草稿前必须至少有 1 张 ready 状态的 baoyu-cover-image 封面图。",
      });
    }
  }
  if (input.requireInline === true) {
    const activeDiagramBriefs = activeBriefs.filter((brief) => brief.visualScope === "diagram" || brief.baoyuSkill === "baoyu-diagram");
    const readyDiagramAssets = readyAssets.filter((asset) => asset.assetType === "diagram_png" || asset.assetType === "diagram_svg");
    if (activeDiagramBriefs.length > 0 || readyDiagramAssets.length > 0) {
      pushIssue(issues, {
        key: "visual_diagram_disallowed",
        status: "blocked",
        detail: "文中配图不再允许使用 SVG/diagram 图解，必须改用 baoyu-infographic 或 baoyu-comic 生成的图片资产。",
      });
    }
    const hasReadyInfographic = readyAssets.some((asset) => {
      const brief = activeBriefs.find((item) => item.id === asset.visualBriefId);
      return asset.assetType === "infographic" || brief?.visualScope === "infographic" || brief?.baoyuSkill === "baoyu-infographic";
    });
    const hasReadyComic = readyAssets.some((asset) => {
      const brief = activeBriefs.find((item) => item.id === asset.visualBriefId);
      return asset.assetType === "comic" || brief?.visualScope === "comic" || brief?.baoyuSkill === "baoyu-comic";
    });
    if (!hasReadyInfographic) {
      pushIssue(issues, {
        key: "visual_infographic_required",
        status: "blocked",
        detail: "准备同步公众号草稿前必须至少有 1 张 ready 状态的 baoyu-infographic 文中信息图。",
      });
    }
    if (!hasReadyComic) {
      pushIssue(issues, {
        key: "visual_comic_required",
        status: "blocked",
        detail: "准备同步公众号草稿前必须至少有 1 张 ready 状态的 baoyu-comic 知识漫画。",
      });
    }
  }
  for (const brief of activeBriefs) {
    if (!brief.id) continue;
    const requiresBriefPublishReady =
      (brief.visualScope === "cover" && input.requireCover === true)
      || (brief.visualScope !== "cover" && input.requireInline === true);
    const scoped = evaluateVisualAssetQuality({
      brief,
      asset: assetByBriefId.get(brief.id) ?? null,
      requirePublishReady: requiresBriefPublishReady,
    });
    issues.push(...scoped.issues);
  }
  return {
    ...summarizeIssues(issues),
    checkedBriefCount: activeBriefs.length,
    checkedAssetCount: readyAssets.length,
  };
}
