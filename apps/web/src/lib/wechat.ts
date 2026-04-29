import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDatabase } from "./db";
import { fetchExternalBinary } from "./external-fetch";
import { decryptSecret, encryptSecret, jpegThumbBuffer } from "./security";
import { renderMarkdownToWechatHtml } from "./rendering";
import type { TemplateRenderConfig } from "./template-rendering";

type WechatConnectionRow = {
  id: number;
  user_id: number;
  account_name: string | null;
  original_id: string | null;
  app_id_encrypted: string;
  app_secret_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  status: "valid" | "invalid" | "expired" | "disabled";
};

function extractWechatWhitelistIp(message: string) {
  const matched = String(message || "").match(/invalid ip\s+([0-9a-fA-F:.]+)/i);
  return matched?.[1] || null;
}

function normalizeWechatUpstreamMessage(input: {
  message: string;
  fallback: string;
  errcode?: number | null;
  operation?: string | null;
}) {
  const message = input.message;
  const normalized = String(message || "").trim();
  const prefix = input.errcode ? `微信错误 ${input.errcode}` : null;
  const operation = input.operation ? `（${input.operation}）` : "";
  if (!normalized) {
    return prefix ? `${prefix}${operation}: ${input.fallback}` : input.fallback;
  }
  if (/not in whitelist|invalid ip/i.test(normalized)) {
    const ip = extractWechatWhitelistIp(normalized);
    const detail = `当前服务器出口 IP${ip ? ` ${ip}` : ""} 未加入微信公众平台接口白名单，暂时无法获取 access_token 或推送草稿箱。请先到公众号后台把这个出口 IP 加入白名单后再重试。`;
    return prefix ? `${prefix}${operation}: ${detail}` : detail;
  }
  if (/invalid appsecret/i.test(normalized)) {
    const detail = "当前 WECHAT_APP_SECRET 无效，或与 WECHAT_APP_ID 不匹配。请到微信公众平台确认 AppSecret 是否最新且与该公众号的 AppID 对应。";
    return prefix ? `${prefix}${operation}: ${detail}` : detail;
  }
  if (/invalid appid/i.test(normalized)) {
    const detail = "当前 WECHAT_APP_ID 无效。请到微信公众平台确认 AppID 是否填写正确。";
    return prefix ? `${prefix}${operation}: ${detail}` : detail;
  }
  return prefix ? `${prefix}${operation}: ${normalized}` : normalized;
}

function isMockWechatCredential(appId: string, appSecret: string) {
  return appId.startsWith("mock_") && appSecret.startsWith("mock_");
}

function isMockWechatAccessToken(accessToken: string) {
  return accessToken.startsWith("mock_access_token_");
}

function detectWechatImageExtension(contentType: string) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("gif")) return "gif";
  return "jpg";
}

function decodeHtmlAttribute(value: string) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function loadWechatImageBinary(source: string) {
  const trimmed = String(source || "").trim();
  if (!trimmed) {
    return {
      buffer: jpegThumbBuffer(),
      contentType: "image/jpeg",
      extension: "jpg",
    };
  }

  const decoded = decodeHtmlAttribute(trimmed);
  const dataUrlMatch = decoded.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return normalizeWechatUploadBinary({
      buffer: Buffer.from(dataUrlMatch[2], "base64"),
      contentType: dataUrlMatch[1],
    });
  }

  if (decoded.startsWith("/")) {
    const localPath = path.join(process.cwd(), "public", decoded.replace(/^\/+/, ""));
    const buffer = await readFile(localPath);
    const extension = path.extname(localPath).toLowerCase();
    const contentType =
      extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : extension === ".png"
          ? "image/png"
          : extension === ".gif"
            ? "image/gif"
            : extension === ".webp"
              ? "image/webp"
              : "application/octet-stream";
    return normalizeWechatUploadBinary({ buffer, contentType });
  }

  const response = await fetchExternalBinary({
    url: decoded,
    timeoutMs: 60_000,
    maxAttempts: 2,
    cache: "no-store",
  });
  return normalizeWechatUploadBinary({
    buffer: response.buffer,
    contentType: response.contentType || "image/jpeg",
  });
}

async function normalizeWechatUploadBinary(input: {
  buffer: Buffer;
  contentType: string;
}) {
  const normalizedContentType = String(input.contentType || "").toLowerCase();
  if (normalizedContentType.includes("jpeg") || normalizedContentType.includes("jpg") || normalizedContentType.includes("png") || normalizedContentType.includes("gif")) {
    return {
      buffer: input.buffer,
      contentType: normalizedContentType.includes("png") ? "image/png" : normalizedContentType.includes("gif") ? "image/gif" : "image/jpeg",
      extension: detectWechatImageExtension(normalizedContentType),
    };
  }

  const converted = await sharp(input.buffer, { failOn: "none", animated: false })
    .rotate()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return {
    buffer: converted,
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

function mockWechatImageUrl(source: string) {
  const digest = createHash("sha1").update(String(source || "image")).digest("hex").slice(0, 16);
  return `https://mock.weixin.qq.com/uploadimg/${digest}.jpg`;
}

function bufferToBlobPart(buffer: Buffer) {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

async function fetchWechatToken(appId: string, appSecret: string) {
  if (isMockWechatCredential(appId, appSecret)) {
    return {
      access_token: `mock_access_token_${appId.slice(5) || "default"}`,
      expires_in: 7200,
    };
  }
  const response = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
    { cache: "no-store" },
  );
  const json = await response.json();
  if (!response.ok || json.errcode) {
    throw new Error(normalizeWechatUpstreamMessage({
      message: String(json.errmsg || ""),
      fallback: "获取微信 access_token 失败",
      errcode: Number(json.errcode || 0) || null,
      operation: "获取 access_token",
    }));
  }
  return json as { access_token: string; expires_in: number };
}

async function refreshWechatAccessToken(connection: WechatConnectionRow) {
  const appId = decryptSecret(connection.app_id_encrypted);
  const appSecret = decryptSecret(connection.app_secret_encrypted);
  if (!appId || !appSecret) {
    throw new Error("公众号凭证解密失败");
  }
  return fetchWechatToken(appId, appSecret);
}

async function uploadThumb(accessToken: string, coverImageUrl?: string | null) {
  if (isMockWechatAccessToken(accessToken)) {
    const digest = createHash("sha1").update(String(coverImageUrl || "fallback-thumb")).digest("hex").slice(0, 12);
    return `mock_thumb_${digest}`;
  }
  const binary = await loadWechatImageBinary(coverImageUrl || "");
  const formData = new FormData();
  formData.append("media", new Blob([bufferToBlobPart(binary.buffer)], { type: binary.contentType }), `huozi-thumb.${binary.extension}`);
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`, {
    method: "POST",
    body: formData,
  });
  const json = await response.json();
  if (!response.ok || json.errcode) {
    throw new Error(normalizeWechatUpstreamMessage({
      message: String(json.errmsg || ""),
      fallback: "上传微信封面图失败",
      errcode: Number(json.errcode || 0) || null,
      operation: "上传封面图",
    }));
  }
  return json.media_id as string;
}

function extractHtmlImageSources(html: string) {
  const sources: string[] = [];
  const pattern = /<img\b[^>]*\bsrc=(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const src = String(match[2] || "").trim();
    if (src && !sources.includes(src)) {
      sources.push(src);
    }
  }
  return sources;
}

function isWechatHostedImageUrl(src: string) {
  return /^https?:\/\/(?:mmbiz\.qpic\.cn|mmbiz.qlogo.cn|mock\.weixin\.qq\.com)\//i.test(String(src || "").trim());
}

async function uploadWechatContentImage(input: {
  accessToken: string;
  source: string;
  index: number;
}) {
  if (isMockWechatAccessToken(input.accessToken)) {
    return mockWechatImageUrl(input.source);
  }

  const binary = await loadWechatImageBinary(input.source);
  const formData = new FormData();
  formData.append("media", new Blob([bufferToBlobPart(binary.buffer)], { type: binary.contentType }), `huozi-content-${input.index}.${binary.extension}`);
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${input.accessToken}`, {
    method: "POST",
    body: formData,
  });
  const json = await response.json();
  if (!response.ok || json.errcode || !json.url) {
    throw new Error(normalizeWechatUpstreamMessage({
      message: String(json.errmsg || ""),
      fallback: "上传微信正文图片失败",
      errcode: Number(json.errcode || 0) || null,
      operation: "上传正文图片",
    }));
  }
  return json.url as string;
}

async function rewriteWechatHtmlImages(input: {
  accessToken: string;
  html: string;
}) {
  const sources = extractHtmlImageSources(input.html).filter((src) => !isWechatHostedImageUrl(src));
  let content = input.html;
  const uploads: Array<{ source: string; url: string }> = [];
  for (const [index, source] of sources.entries()) {
    const url = await uploadWechatContentImage({
      accessToken: input.accessToken,
      source,
      index: index + 1,
    });
    content = content.split(source).join(url);
    uploads.push({ source, url });
  }
  return {
    content,
    uploads,
  };
}

export async function verifyWechatCredential(appId: string, appSecret: string) {
  return fetchWechatToken(appId, appSecret);
}

export function encryptWechatConnection(input: {
  appId: string;
  appSecret: string;
  accessToken?: string | null;
}) {
  return {
    appIdEncrypted: encryptSecret(input.appId),
    appSecretEncrypted: encryptSecret(input.appSecret),
    accessTokenEncrypted: input.accessToken ? encryptSecret(input.accessToken) : null,
  };
}

export async function resolveWechatAccessToken(connection: WechatConnectionRow) {
  const cachedToken = decryptSecret(connection.access_token_encrypted);
  if (
    cachedToken &&
    connection.access_token_expires_at &&
    new Date(connection.access_token_expires_at).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    return {
      access_token: cachedToken,
      expires_in: Math.max(
        60,
        Math.floor((new Date(connection.access_token_expires_at).getTime() - Date.now()) / 1000),
      ),
    };
  }

  const appId = decryptSecret(connection.app_id_encrypted);
  const appSecret = decryptSecret(connection.app_secret_encrypted);
  if (!appId || !appSecret) {
    throw new Error("公众号凭证解密失败");
  }
  return fetchWechatToken(appId, appSecret);
}

export async function refreshWechatConnectionsDueForScheduler(input?: {
  limit?: number;
  refreshWindowMinutes?: number;
}) {
  const db = getDatabase();
  const limit = Math.max(1, Math.min(input?.limit ?? 12, 50));
  const refreshWindowMinutes = Math.max(5, Math.min(input?.refreshWindowMinutes ?? 30, 24 * 60));
  const now = new Date();
  const nowIso = now.toISOString();
  const refreshBeforeIso = new Date(now.getTime() + refreshWindowMinutes * 60 * 1000).toISOString();

  const dueConnections = await db.query<WechatConnectionRow>(
    `SELECT id, user_id, account_name, original_id, app_id_encrypted, app_secret_encrypted, access_token_encrypted, access_token_expires_at, status
     FROM wechat_connections
     WHERE status IN (?, ?)
       AND (access_token_expires_at IS NULL OR access_token_expires_at <= ?)
     ORDER BY access_token_expires_at ASC, id ASC
     LIMIT ?`,
    ["valid", "expired", refreshBeforeIso, limit],
  );

  let refreshed = 0;
  let failed = 0;
  for (const connection of dueConnections) {
    try {
      const token = await refreshWechatAccessToken(connection);
      await db.exec(
        `UPDATE wechat_connections
         SET access_token_encrypted = ?, access_token_expires_at = ?, status = ?, last_verified_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          encryptSecret(token.access_token),
          new Date(Date.now() + token.expires_in * 1000).toISOString(),
          "valid",
          nowIso,
          nowIso,
          connection.id,
        ],
      );
      refreshed += 1;
    } catch {
      await db.exec(
        `UPDATE wechat_connections
         SET status = ?, last_verified_at = ?, updated_at = ?
         WHERE id = ?`,
        ["expired", nowIso, nowIso, connection.id],
      );
      failed += 1;
    }
  }

  return {
    scanned: dueConnections.length,
    refreshed,
    failed,
    refreshWindowMinutes,
  };
}

export async function publishWechatDraft(input: {
  connection: WechatConnectionRow;
  title: string;
  markdownContent: string;
  coverImageUrl?: string | null;
  digest?: string;
  author?: string;
  templateConfig?: TemplateRenderConfig | null;
}) {
  const tokenResult = await resolveWechatAccessToken(input.connection);
  const thumbMediaId = await uploadThumb(tokenResult.access_token, input.coverImageUrl);
  const renderedContent = await renderMarkdownToWechatHtml(input.markdownContent, input.title, input.templateConfig ?? null, {
    includeTitle: false,
  });
  const imageRewrite = await rewriteWechatHtmlImages({
    accessToken: tokenResult.access_token,
    html: renderedContent,
  });
  const payload = {
    articles: [
      {
        title: input.title,
        author: input.author || "Huozi Writer",
        digest: input.digest || input.title,
        content: imageRewrite.content,
        content_source_url: "",
        thumb_media_id: thumbMediaId,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      },
    ],
  };

  if (isMockWechatAccessToken(tokenResult.access_token)) {
    const mediaId = `mock_media_${Date.now()}`;
    return {
      mediaId,
      accessToken: tokenResult.access_token,
      expiresIn: tokenResult.expires_in,
      requestSummary: {
        ...payload,
        imageUploadSummary: {
          coverImageUrl: input.coverImageUrl || null,
          contentImageCount: imageRewrite.uploads.length,
          contentImages: imageRewrite.uploads,
        },
      },
      responseSummary: {
        media_id: mediaId,
        thumb_media_id: thumbMediaId,
        mocked: true,
      },
    };
  }

  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${tokenResult.access_token}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!response.ok || json.errcode) {
    throw new Error(normalizeWechatUpstreamMessage({
      message: String(json.errmsg || ""),
      fallback: "推送微信草稿箱失败",
      errcode: Number(json.errcode || 0) || null,
      operation: "新增草稿",
    }));
  }

  return {
    mediaId: json.media_id as string,
    accessToken: tokenResult.access_token,
    expiresIn: tokenResult.expires_in,
    requestSummary: {
      ...payload,
      imageUploadSummary: {
        coverImageUrl: input.coverImageUrl || null,
        contentImageCount: imageRewrite.uploads.length,
        contentImages: imageRewrite.uploads,
      },
    },
    responseSummary: {
      ...json,
      thumb_media_id: thumbMediaId,
    },
  };
}
