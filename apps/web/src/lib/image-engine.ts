import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { decryptSecret, encryptSecret } from "./security";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export const COVER_IMAGE_ENGINE_CODE = "coverImage";
export const DEFAULT_COVER_IMAGE_MODEL = "Gemini 3.1 Pro";

type DbGlobalImageEngine = {
  id: number;
  engine_code: string;
  provider_name: string;
  base_url: string;
  api_key_encrypted: string;
  model: string;
  is_enabled: number | boolean;
  last_checked_at: string | null;
  last_error: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Base_URL 不能为空");
  }
  return trimmed.replace(/\/+$/, "");
}

function maskSecret(value: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

async function maybeBackfillFromLegacyUserConfig() {
  const db = getDatabase();
  const globalRecord = await db.queryOne<{ id: number }>(
    "SELECT id FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );
  if (globalRecord) {
    return;
  }

  const legacy = await db.queryOne<{
    provider_name: string;
    base_url: string;
    api_key_encrypted: string;
    model: string;
    is_enabled: number | boolean;
    last_checked_at: string | null;
    last_error: string | null;
    user_id: number | null;
  }>(
    `SELECT provider_name, base_url, api_key_encrypted, model, is_enabled, last_checked_at, last_error, user_id
     FROM user_ai_engines
     WHERE engine_code = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [COVER_IMAGE_ENGINE_CODE],
  ).catch(() => undefined);

  if (!legacy) {
    return;
  }

  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO global_ai_engines (
      engine_code, provider_name, base_url, api_key_encrypted, model, is_enabled, last_checked_at, last_error, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      COVER_IMAGE_ENGINE_CODE,
      legacy.provider_name,
      legacy.base_url,
      legacy.api_key_encrypted,
      legacy.model || DEFAULT_COVER_IMAGE_MODEL,
      legacy.is_enabled,
      legacy.last_checked_at,
      legacy.last_error,
      legacy.user_id ?? null,
      now,
      now,
    ],
  );
}

export async function getGlobalCoverImageEngine() {
  await ensureExtendedProductSchema();
  await maybeBackfillFromLegacyUserConfig();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalImageEngine>(
    "SELECT * FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );

  if (!record) {
    return {
      providerName: "custom",
      baseUrl: "",
      model: DEFAULT_COVER_IMAGE_MODEL,
      isEnabled: true,
      hasApiKey: false,
      apiKeyPreview: null as string | null,
      lastCheckedAt: null as string | null,
      lastError: null as string | null,
      updatedBy: null as number | null,
      updatedAt: null as string | null,
    };
  }

  const apiKey = decryptSecret(record.api_key_encrypted);
  return {
    providerName: record.provider_name,
    baseUrl: record.base_url,
    model: record.model || DEFAULT_COVER_IMAGE_MODEL,
    isEnabled: Boolean(record.is_enabled),
    hasApiKey: Boolean(apiKey),
    apiKeyPreview: maskSecret(apiKey),
    lastCheckedAt: record.last_checked_at,
    lastError: record.last_error,
    updatedBy: record.updated_by,
    updatedAt: record.updated_at,
  };
}

export async function getGlobalCoverImageEngineSecret() {
  await ensureExtendedProductSchema();
  await maybeBackfillFromLegacyUserConfig();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalImageEngine>(
    "SELECT * FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    providerName: record.provider_name,
    baseUrl: record.base_url,
    apiKey: decryptSecret(record.api_key_encrypted),
    model: record.model || DEFAULT_COVER_IMAGE_MODEL,
    isEnabled: Boolean(record.is_enabled),
    lastCheckedAt: record.last_checked_at,
    lastError: record.last_error,
    updatedBy: record.updated_by,
  };
}

export async function upsertGlobalCoverImageEngine(input: {
  adminUserId: number;
  baseUrl: string;
  apiKey?: string | null;
  model?: string | null;
  isEnabled?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<DbGlobalImageEngine>(
    "SELECT * FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );

  const normalizedBaseUrl = normalizeBaseUrl(input.baseUrl);
  const model = (input.model || DEFAULT_COVER_IMAGE_MODEL).trim() || DEFAULT_COVER_IMAGE_MODEL;
  const apiKeyEncrypted = input.apiKey?.trim()
    ? encryptSecret(input.apiKey.trim())
    : existing?.api_key_encrypted;

  if (!apiKeyEncrypted) {
    throw new Error("API Key 不能为空");
  }

  if (existing) {
    await db.exec(
      `UPDATE global_ai_engines
       SET provider_name = ?, base_url = ?, api_key_encrypted = ?, model = ?, is_enabled = ?, last_error = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      ["custom", normalizedBaseUrl, apiKeyEncrypted, model, input.isEnabled ?? true, null, input.adminUserId, now, existing.id],
    );
  } else {
    await db.exec(
      `INSERT INTO global_ai_engines (
        engine_code, provider_name, base_url, api_key_encrypted, model, is_enabled, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [COVER_IMAGE_ENGINE_CODE, "custom", normalizedBaseUrl, apiKeyEncrypted, model, input.isEnabled ?? true, input.adminUserId, now, now],
    );
  }

  await appendAuditLog({
    userId: input.adminUserId,
    action: "admin.cover_image_engine.update",
    targetType: "global_ai_engine",
    targetId: COVER_IMAGE_ENGINE_CODE,
    payload: { baseUrl: normalizedBaseUrl, model, isEnabled: input.isEnabled ?? true },
  });

  return getGlobalCoverImageEngine();
}

export async function updateGlobalCoverImageEngineHealth(input: {
  lastCheckedAt: string;
  lastError?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec(
    `UPDATE global_ai_engines
     SET last_checked_at = ?, last_error = ?, updated_at = ?
     WHERE engine_code = ?`,
    [input.lastCheckedAt, input.lastError ?? null, input.lastCheckedAt, COVER_IMAGE_ENGINE_CODE],
  );
}
