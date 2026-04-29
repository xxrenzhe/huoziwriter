import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fetchExternalBinary } from "./external-fetch";
import { buildObjectPublicUrl, putObject } from "./object-storage";

type DownloadedBinaryAsset = {
  buffer: Buffer;
  contentType: string;
  sourceKind: "data-url" | "remote-url";
};

type DerivedAssetBinary = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number | null;
  height: number | null;
  byteLength: number;
};

type DerivedAssetSet = {
  original: DerivedAssetBinary;
  compressed: DerivedAssetBinary;
  thumbnail: DerivedAssetBinary;
  strategy: {
    compressedQuality: number;
    thumbnailQuality: number;
    resizeKernel: string;
    sharpen: boolean;
    targetMaxWidth: number;
    targetMaxHeight: number;
  };
};

function detectExtension(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("svg")) return "svg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "bin";
}

function normalizeContentType(contentType: string) {
  const trimmed = String(contentType || "").trim().toLowerCase();
  return trimmed || "application/octet-stream";
}

export function resolveBaoyuCompressionStrategy(input: {
  width: number;
  height: number;
  hasAlpha?: boolean | null;
  sourceByteLength: number;
  sourceIsSvg: boolean;
}) {
  const width = input.width || 0;
  const height = input.height || 0;
  const megapixels = width > 0 && height > 0 ? width * height / 1_000_000 : 0;
  const compressedQuality = input.sourceIsSvg
    ? 88
    : input.sourceByteLength > 6_000_000 || megapixels >= 6
      ? 78
      : input.sourceByteLength > 3_000_000 || megapixels >= 3
        ? 80
        : input.hasAlpha
          ? 86
          : 84;
  return {
    compressedQuality,
    thumbnailQuality: Math.max(input.sourceIsSvg ? 76 : 70, compressedQuality - (input.sourceIsSvg ? 10 : input.hasAlpha ? 8 : 10)),
    resizeKernel: "lanczos3",
    sharpen: true,
    targetMaxWidth: 1280,
    targetMaxHeight: 1600,
  };
}

function pickDerivedFormat(metadata: sharp.Metadata, quality: number) {
  if (metadata.hasAlpha) {
    return {
      extension: "webp",
      contentType: "image/webp",
      encode: (instance: sharp.Sharp) => instance.webp({ quality, effort: 5, smartSubsample: true }),
      thumbnailEncode: (instance: sharp.Sharp) => instance.webp({ quality: Math.max(70, quality - 8), effort: 5, smartSubsample: true }),
    };
  }
  return {
    extension: "jpg",
    contentType: "image/jpeg",
    encode: (instance: sharp.Sharp) => instance.jpeg({ quality, mozjpeg: true, progressive: true, chromaSubsampling: "4:4:4" }),
    thumbnailEncode: (instance: sharp.Sharp) => instance.jpeg({ quality: Math.max(70, quality - 10), mozjpeg: true, progressive: true }),
  };
}

function parseAspectRatio(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : null;
}

function resolveResizeBox(input: {
  sourceWidth: number;
  sourceHeight: number;
  maxWidth: number;
  maxHeight: number;
  aspectRatio?: string | null;
}) {
  const aspect = parseAspectRatio(input.aspectRatio);
  if (!aspect) {
    return { width: input.maxWidth, height: input.maxHeight, fit: "inside" as const };
  }
  let width = Math.min(input.maxWidth, input.sourceWidth);
  let height = Math.round(width / aspect);
  if (height > input.sourceHeight || height > input.maxHeight) {
    height = Math.min(input.maxHeight, input.sourceHeight);
    width = Math.round(height * aspect);
  }
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    fit: "cover" as const,
  };
}

async function createImageDerivatives(downloaded: DownloadedBinaryAsset, aspectRatio?: string | null): Promise<DerivedAssetSet> {
  const image = sharp(downloaded.buffer, { failOn: "none", animated: false }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("无法识别图片尺寸");
  }

  const sourceIsSvg = normalizeContentType(downloaded.contentType).includes("svg");
  const strategy = resolveBaoyuCompressionStrategy({
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha,
    sourceByteLength: downloaded.buffer.byteLength,
    sourceIsSvg,
  });
  const compressedQuality = strategy.compressedQuality;
  const derivedFormat = sourceIsSvg
    ? {
        extension: "webp",
        contentType: "image/webp",
        encode: (instance: sharp.Sharp) => instance.webp({ quality: compressedQuality, effort: 5, smartSubsample: true }),
        thumbnailEncode: (instance: sharp.Sharp) => instance.webp({ quality: strategy.thumbnailQuality, effort: 5, smartSubsample: true }),
      }
    : pickDerivedFormat(metadata, compressedQuality);
  const compressedResize = resolveResizeBox({
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    maxWidth: strategy.targetMaxWidth,
    maxHeight: strategy.targetMaxHeight,
    aspectRatio,
  });
  const thumbnailResize = resolveResizeBox({
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    maxWidth: 480,
    maxHeight: 480,
    aspectRatio,
  });
  const compressedPipeline = derivedFormat
    .encode(
      sharp(downloaded.buffer, { failOn: "none", animated: false })
        .rotate()
        .resize({ ...compressedResize, kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
        .sharpen({ sigma: 0.35, m1: 0.45, m2: 0.25 }),
    );
  const thumbnailPipeline = derivedFormat
    .thumbnailEncode(
      sharp(downloaded.buffer, { failOn: "none", animated: false })
        .rotate()
        .resize({ ...thumbnailResize, kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
        .sharpen({ sigma: 0.3, m1: 0.35, m2: 0.2 }),
    );
  const [compressedResult, thumbnailResult] = await Promise.all([
    compressedPipeline.toBuffer({ resolveWithObject: true }),
    thumbnailPipeline.toBuffer({ resolveWithObject: true }),
  ]);

  return {
    original: {
      buffer: downloaded.buffer,
      contentType: normalizeContentType(downloaded.contentType),
      extension: detectExtension(downloaded.contentType),
      width: metadata.width,
      height: metadata.height,
      byteLength: downloaded.buffer.byteLength,
    },
    compressed: {
      buffer: compressedResult.data,
      contentType: derivedFormat.contentType,
      extension: derivedFormat.extension,
      width: compressedResult.info.width,
      height: compressedResult.info.height,
      byteLength: compressedResult.info.size,
    },
    thumbnail: {
      buffer: thumbnailResult.data,
      contentType: derivedFormat.contentType,
      extension: derivedFormat.extension,
      width: thumbnailResult.info.width,
      height: thumbnailResult.info.height,
      byteLength: thumbnailResult.info.size,
    },
    strategy: {
      compressedQuality: strategy.compressedQuality,
      thumbnailQuality: strategy.thumbnailQuality,
      resizeKernel: strategy.resizeKernel,
      sharpen: strategy.sharpen,
      targetMaxWidth: strategy.targetMaxWidth,
      targetMaxHeight: strategy.targetMaxHeight,
    },
  };
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";
}

async function downloadBinaryAsset(source: string): Promise<DownloadedBinaryAsset> {
  const trimmed = String(source || "").trim();
  if (!trimmed) {
    throw new Error("图片资源为空");
  }

  if (trimmed.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", trimmed.replace(/^\/+/, ""));
    const buffer = await readFile(localPath);
    const extension = path.extname(localPath).toLowerCase();
    const contentType =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".webp"
          ? "image/webp"
          : extension === ".gif"
            ? "image/gif"
            : "image/png";
    return {
      buffer,
      contentType,
      sourceKind: "remote-url",
    };
  }

  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      buffer: Buffer.from(dataUrlMatch[2], "base64"),
      contentType: dataUrlMatch[1],
      sourceKind: "data-url",
    };
  }

  const response = await fetchExternalBinary({
    url: trimmed,
    timeoutMs: 60_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  return {
    buffer: response.buffer,
    contentType: response.contentType || "image/png",
    sourceKind: "remote-url",
  };
}

export async function persistCoverImageAssetSet(input: {
  userId: number;
  articleId?: number | null;
  batchToken?: string | null;
  variantLabel?: string | null;
  source: string;
  assetNamespace?: string | null;
  assetLabel?: string | null;
  aspectRatio?: string | null;
}) {
  const downloaded = await downloadBinaryAsset(input.source);
  const articleScope = input.articleId ? `article-${input.articleId}` : "unbound";
  const batchScope = sanitizeSegment(input.batchToken || "single");
  const variantScope = sanitizeSegment(input.assetLabel || input.variantLabel || "cover");
  const digest = createHash("sha1").update(downloaded.buffer).digest("hex").slice(0, 12);
  const basePrefix = `${sanitizeSegment(input.assetNamespace || "cover-images")}/user-${input.userId}/${articleScope}/${batchScope}/${variantScope}-${digest}`;
  let derivativeMode = "sharp";
  let derivativeWarning: string | null = null;
  let derivatives: DerivedAssetSet;

  try {
    derivatives = await createImageDerivatives(downloaded, input.aspectRatio);
  } catch (error) {
    derivativeMode = "passthrough-fallback";
    derivativeWarning = error instanceof Error ? error.message : "图片衍生处理失败";
    const normalizedContentType = normalizeContentType(downloaded.contentType);
    const fallbackExtension = detectExtension(normalizedContentType);
    derivatives = {
      original: {
        buffer: downloaded.buffer,
        contentType: normalizedContentType,
        extension: fallbackExtension,
        width: null,
        height: null,
        byteLength: downloaded.buffer.byteLength,
      },
      compressed: {
        buffer: downloaded.buffer,
        contentType: normalizedContentType,
        extension: fallbackExtension,
        width: null,
        height: null,
        byteLength: downloaded.buffer.byteLength,
      },
      thumbnail: {
        buffer: downloaded.buffer,
        contentType: normalizedContentType,
        extension: fallbackExtension,
        width: null,
        height: null,
        byteLength: downloaded.buffer.byteLength,
      },
      strategy: {
        compressedQuality: 100,
        thumbnailQuality: 100,
        resizeKernel: "passthrough",
        sharpen: false,
        targetMaxWidth: 0,
        targetMaxHeight: 0,
      },
    };
  }

  const [original, compressed, thumbnail] = await Promise.all([
    putObject({
      objectKey: `${basePrefix}/original.${derivatives.original.extension}`,
      body: derivatives.original.buffer,
      contentType: derivatives.original.contentType,
    }),
    putObject({
      objectKey: `${basePrefix}/compressed.${derivatives.compressed.extension}`,
      body: derivatives.compressed.buffer,
      contentType: derivatives.compressed.contentType,
    }),
    putObject({
      objectKey: `${basePrefix}/thumbnail.${derivatives.thumbnail.extension}`,
      body: derivatives.thumbnail.buffer,
      contentType: derivatives.thumbnail.contentType,
    }),
  ]);

  const assetManifest = {
    baoyuCompression: {
      skill: "baoyu-compress-image",
      version: "sharp-derivatives-2026-04-29",
      mode: derivativeMode,
      publishDerivative: "compressed",
      strategy: derivatives.strategy,
    },
    derivativeMode,
    derivativeWarning,
    sourceKind: downloaded.sourceKind,
    sourceUrl: downloaded.sourceKind === "remote-url" ? input.source : null,
    contentType: normalizeContentType(downloaded.contentType),
    byteLength: downloaded.buffer.byteLength,
    original: {
      objectKey: original.objectKey,
      publicUrl: original.publicUrl,
      contentType: derivatives.original.contentType,
      byteLength: derivatives.original.byteLength,
      width: derivatives.original.width,
      height: derivatives.original.height,
    },
    compressed: {
      objectKey: compressed.objectKey,
      publicUrl: compressed.publicUrl,
      contentType: derivatives.compressed.contentType,
      byteLength: derivatives.compressed.byteLength,
      width: derivatives.compressed.width,
      height: derivatives.compressed.height,
    },
    thumbnail: {
      objectKey: thumbnail.objectKey,
      publicUrl: thumbnail.publicUrl,
      contentType: derivatives.thumbnail.contentType,
      byteLength: derivatives.thumbnail.byteLength,
      width: derivatives.thumbnail.width,
      height: derivatives.thumbnail.height,
    },
    svgOriginal: derivatives.original.contentType.includes("svg")
      ? {
          objectKey: original.objectKey,
          publicUrl: original.publicUrl,
          contentType: derivatives.original.contentType,
          byteLength: derivatives.original.byteLength,
        }
      : null,
    publishDerivative: {
      objectKey: compressed.objectKey,
      publicUrl: compressed.publicUrl,
      contentType: derivatives.compressed.contentType,
      width: derivatives.compressed.width,
      height: derivatives.compressed.height,
      byteLength: derivatives.compressed.byteLength,
    },
    compression: {
      savedBytes:
        derivatives.original.byteLength != null && derivatives.compressed.byteLength != null
          ? Math.max(0, derivatives.original.byteLength - derivatives.compressed.byteLength)
          : null,
      ratio:
        derivatives.original.byteLength > 0 && derivatives.compressed.byteLength > 0
          ? Number((derivatives.compressed.byteLength / derivatives.original.byteLength).toFixed(4))
          : null,
    },
  };

  return {
    imageUrl: compressed.publicUrl,
    storageProvider: original.provider,
    originalObjectKey: original.objectKey,
    compressedObjectKey: compressed.objectKey,
    thumbnailObjectKey: thumbnail.objectKey,
    assetManifest,
  };
}

export async function persistArticleCoverImageAssetSet(input: {
  userId: number;
  articleId?: number | null;
  batchToken?: string | null;
  variantLabel?: string | null;
  source: string;
  aspectRatio?: string | null;
}) {
  return persistCoverImageAssetSet({
    userId: input.userId,
    articleId: input.articleId ?? null,
    batchToken: input.batchToken,
    variantLabel: input.variantLabel,
    source: input.source,
    aspectRatio: input.aspectRatio,
  });
}

export async function persistArticleVisualImageAssetSet(input: {
  userId: number;
  articleId: number;
  visualBriefId: number;
  assetType: string;
  source: string;
  aspectRatio?: string | null;
}) {
  return persistCoverImageAssetSet({
    userId: input.userId,
    articleId: input.articleId,
    batchToken: "article-visuals",
    variantLabel: input.assetType,
    assetNamespace: "article-images",
    assetLabel: `${input.assetType}-${input.visualBriefId}`,
    source: input.source,
    aspectRatio: input.aspectRatio,
  });
}

export function resolveStoredImageAssetSource(input: {
  imageUrl: string;
  storageProvider?: string | null;
  originalObjectKey?: string | null;
}) {
  if (input.storageProvider === "local" && input.originalObjectKey) {
    return buildObjectPublicUrl(input.originalObjectKey);
  }
  return input.imageUrl;
}
