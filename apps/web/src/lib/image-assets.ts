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

function pickDerivedFormat(metadata: sharp.Metadata) {
  if (metadata.hasAlpha) {
    return {
      extension: "webp",
      contentType: "image/webp",
      encode: (instance: sharp.Sharp) => instance.webp({ quality: 82, effort: 4 }),
      thumbnailEncode: (instance: sharp.Sharp) => instance.webp({ quality: 74, effort: 4 }),
    };
  }
  return {
    extension: "jpg",
    contentType: "image/jpeg",
    encode: (instance: sharp.Sharp) => instance.jpeg({ quality: 82, mozjpeg: true }),
    thumbnailEncode: (instance: sharp.Sharp) => instance.jpeg({ quality: 74, mozjpeg: true }),
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
  const derivedFormat = sourceIsSvg
    ? {
        extension: "webp",
        contentType: "image/webp",
        encode: (instance: sharp.Sharp) => instance.webp({ quality: 88, effort: 4 }),
        thumbnailEncode: (instance: sharp.Sharp) => instance.webp({ quality: 78, effort: 4 }),
      }
    : pickDerivedFormat(metadata);
  const compressedResize = resolveResizeBox({
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    maxWidth: 1600,
    maxHeight: 1600,
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
        .resize({ ...compressedResize, withoutEnlargement: true }),
    );
  const thumbnailPipeline = derivedFormat
    .thumbnailEncode(
      sharp(downloaded.buffer, { failOn: "none", animated: false })
        .rotate()
        .resize({ ...thumbnailResize, withoutEnlargement: true }),
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
