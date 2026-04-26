import { getDatabase } from "./db";
import { decryptSecret, encryptSecret } from "./security";
import { verifyWechatCredential } from "./wechat";

type WechatConnectionEnvRow = {
  id: number;
  user_id: number;
  account_name: string | null;
  original_id: string | null;
  app_id_encrypted: string;
  app_secret_encrypted: string;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  status: "valid" | "invalid" | "expired" | "disabled";
  is_default: number | boolean;
};

const DEFAULT_ENV_CONNECTION_NAME = "环境变量默认公众号";
const DEFAULT_ENV_ORIGINAL_ID = "env-wechat-default";

function normalizeBoolean(value: string | null | undefined, fallback: boolean) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readWechatEnvConnectionConfig() {
  const appId = String(process.env.WECHAT_APP_ID || "").trim();
  const appSecret = String(process.env.WECHAT_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    return null;
  }
  return {
    appId,
    appSecret,
    accountName: String(process.env.WECHAT_ACCOUNT_NAME || DEFAULT_ENV_CONNECTION_NAME).trim() || DEFAULT_ENV_CONNECTION_NAME,
    originalId: String(process.env.WECHAT_ORIGINAL_ID || DEFAULT_ENV_ORIGINAL_ID).trim() || DEFAULT_ENV_ORIGINAL_ID,
    isDefault: normalizeBoolean(process.env.WECHAT_ENV_CONNECTION_IS_DEFAULT, true),
  };
}

function isTokenStillUsable(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return false;
  }
  const timestamp = Date.parse(expiresAt);
  if (!Number.isFinite(timestamp)) {
    return false;
  }
  return timestamp > Date.now() + 5 * 60 * 1000;
}

export function hasWechatEnvConnectionConfig() {
  return Boolean(readWechatEnvConnectionConfig());
}

export async function ensureWechatEnvConnectionForUser(userId: number, input?: { throwOnError?: boolean }) {
  const config = readWechatEnvConnectionConfig();
  if (!config) {
    return null;
  }

  const db = getDatabase();
  const rows = await db.query<WechatConnectionEnvRow>(
    `SELECT id, user_id, account_name, original_id, app_id_encrypted, app_secret_encrypted, access_token_encrypted,
            access_token_expires_at, status, is_default
     FROM wechat_connections
     WHERE user_id = ? AND status != ?
     ORDER BY is_default DESC, id DESC`,
    [userId, "disabled"],
  );

  const existing =
    rows.find((row) => decryptSecret(row.app_id_encrypted) === config.appId && decryptSecret(row.app_secret_encrypted) === config.appSecret)
    ?? rows.find((row) => String(row.original_id || "").trim() === config.originalId)
    ?? null;

  const now = new Date().toISOString();
  let verifiedToken: Awaited<ReturnType<typeof verifyWechatCredential>> | null = null;
  let resolvedStatus: WechatConnectionEnvRow["status"] = "valid";
  const needsVerification =
    !existing
    || decryptSecret(existing.app_id_encrypted) !== config.appId
    || decryptSecret(existing.app_secret_encrypted) !== config.appSecret
    || existing.status !== "valid"
    || !decryptSecret(existing.access_token_encrypted)
    || !isTokenStillUsable(existing.access_token_expires_at);

  if (needsVerification) {
    try {
      verifiedToken = await verifyWechatCredential(config.appId, config.appSecret);
    } catch (error) {
      if (input?.throwOnError) {
        throw error;
      }
      resolvedStatus = "invalid";
    }
  }

  const nextAccessToken = verifiedToken?.access_token ?? decryptSecret(existing?.access_token_encrypted) ?? null;
  const nextExpiresAt = verifiedToken
    ? new Date(Date.now() + verifiedToken.expires_in * 1000).toISOString()
    : existing?.access_token_expires_at ?? null;

  if (config.isDefault) {
    await db.exec("UPDATE wechat_connections SET is_default = ? WHERE user_id = ?", [false, userId]);
  }

  const sharedParams = [
    config.accountName,
    config.originalId,
    encryptSecret(config.appId),
    encryptSecret(config.appSecret),
    nextAccessToken ? encryptSecret(nextAccessToken) : null,
    nextExpiresAt,
    resolvedStatus,
    config.isDefault,
    now,
    now,
  ];

  if (existing) {
    await db.exec(
      `UPDATE wechat_connections
       SET account_name = ?, original_id = ?, app_id_encrypted = ?, app_secret_encrypted = ?, access_token_encrypted = ?,
           access_token_expires_at = ?, status = ?, is_default = ?, updated_at = ?, last_verified_at = ?
       WHERE id = ? AND user_id = ?`,
      [...sharedParams, existing.id, userId],
    );
  } else {
    await db.exec(
      `INSERT INTO wechat_connections (
        user_id, account_name, original_id, app_id_encrypted, app_secret_encrypted, access_token_encrypted,
        access_token_expires_at, status, last_verified_at, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        config.accountName,
        config.originalId,
        encryptSecret(config.appId),
        encryptSecret(config.appSecret),
        nextAccessToken ? encryptSecret(nextAccessToken) : null,
        nextExpiresAt,
        resolvedStatus,
        now,
        config.isDefault,
        now,
        now,
      ],
    );
  }

  return await db.queryOne<WechatConnectionEnvRow>(
    `SELECT id, user_id, account_name, original_id, app_id_encrypted, app_secret_encrypted, access_token_encrypted,
            access_token_expires_at, status, is_default
     FROM wechat_connections
     WHERE user_id = ? AND original_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, config.originalId],
  );
}
