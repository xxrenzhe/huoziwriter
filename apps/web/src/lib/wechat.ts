import { getDatabase } from "./db";
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

function normalizeWechatUpstreamMessage(message: string, fallback: string) {
  const normalized = String(message || "").trim();
  if (!normalized) {
    return fallback;
  }
  if (/not in whitelist|invalid ip/i.test(normalized)) {
    const ip = extractWechatWhitelistIp(normalized);
    return `当前服务器出口 IP${ip ? ` ${ip}` : ""} 未加入微信公众平台接口白名单，暂时无法获取 access_token 或推送草稿箱。请先到公众号后台把这个出口 IP 加入白名单后再重试。`;
  }
  if (/invalid appsecret/i.test(normalized)) {
    return "当前 WECHAT_APP_SECRET 无效，或与 WECHAT_APP_ID 不匹配。请到微信公众平台确认 AppSecret 是否最新且与该公众号的 AppID 对应。";
  }
  if (/invalid appid/i.test(normalized)) {
    return "当前 WECHAT_APP_ID 无效。请到微信公众平台确认 AppID 是否填写正确。";
  }
  return normalized;
}

function isMockWechatCredential(appId: string, appSecret: string) {
  return appId.startsWith("mock_") && appSecret.startsWith("mock_");
}

function isMockWechatAccessToken(accessToken: string) {
  return accessToken.startsWith("mock_access_token_");
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
    throw new Error(normalizeWechatUpstreamMessage(String(json.errmsg || ""), "获取微信 access_token 失败"));
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

async function uploadThumb(accessToken: string) {
  if (isMockWechatAccessToken(accessToken)) {
    return `mock_thumb_${Date.now()}`;
  }
  const formData = new FormData();
  formData.append("media", new Blob([jpegThumbBuffer()], { type: "image/jpeg" }), "huozi-thumb.jpg");
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`, {
    method: "POST",
    body: formData,
  });
  const json = await response.json();
  if (!response.ok || json.errcode) {
    throw new Error(normalizeWechatUpstreamMessage(String(json.errmsg || ""), "上传微信封面图失败"));
  }
  return json.media_id as string;
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
  digest?: string;
  author?: string;
  templateConfig?: TemplateRenderConfig | null;
}) {
  const tokenResult = await resolveWechatAccessToken(input.connection);
  const thumbMediaId = await uploadThumb(tokenResult.access_token);
  const content = await renderMarkdownToWechatHtml(input.markdownContent, input.title, input.templateConfig ?? null);
  const payload = {
    articles: [
      {
        title: input.title,
        author: input.author || "Huozi Writer",
        digest: input.digest || input.title,
        content,
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
      requestSummary: payload,
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
    throw new Error(normalizeWechatUpstreamMessage(String(json.errmsg || ""), "推送微信草稿箱失败"));
  }

  return {
    mediaId: json.media_id as string,
    accessToken: tokenResult.access_token,
    expiresIn: tokenResult.expires_in,
    requestSummary: payload,
    responseSummary: json,
  };
}
