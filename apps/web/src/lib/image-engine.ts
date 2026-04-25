import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import { decryptSecret, encryptSecret } from "./security";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export const COVER_IMAGE_ENGINE_CODE = "coverImage";
export const DEFAULT_COVER_IMAGE_MODEL = "gpt-image-2";

type CoverImageEngineProvider = "openai" | "custom";

function inferCoverImageProviderName(baseUrl: string, model: string) {
  const normalizedBaseUrl = String(baseUrl || "").trim().toLowerCase();
  const normalizedModel = String(model || "").trim().toLowerCase();
  if (normalizedBaseUrl.includes("api.openai.com") || normalizedModel.startsWith("gpt-image")) {
    return "openai";
  }
  return "custom";
}

function normalizeProviderName(value: string | null | undefined): CoverImageEngineProvider | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "openai") return "openai";
  return "custom";
}

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

export type CoverImageEngineConfig = {
  providerName: string;
  baseUrl: string;
  model: string;
  isEnabled: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedBy: number | null;
  updatedAt: string | null;
  configSource?: "env" | "database";
  secretWarning?: string | null;
};

export type CoverImageEngineSecret = {
  id: number | null;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isEnabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedBy: number | null;
  configSource?: "env" | "database";
  secretWarning?: string | null;
};

const COVER_IMAGE_SECRET_WARNING = "数据库兜底 API Key 无法在当前环境解密，请重新输入并保存一次。";

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

function readStoredApiKey(payload: string | null | undefined) {
  if (!payload) {
    return {
      apiKey: null,
      secretWarning: null,
    };
  }

  try {
    return {
      apiKey: decryptSecret(payload),
      secretWarning: null,
    };
  } catch {
    return {
      apiKey: null,
      secretWarning: COVER_IMAGE_SECRET_WARNING,
    };
  }
}

function getCoverImageEnvOverride(): {
  providerName: CoverImageEngineProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  isEnabled: boolean;
} | null {
  const model = String(process.env.COVER_IMAGE_MODEL || "").trim();
  const baseUrl = String(process.env.COVER_IMAGE_BASE_URL || "").trim();
  const providerFromEnv = normalizeProviderName(process.env.COVER_IMAGE_PROVIDER);
  const apiKey = String(process.env.COVER_IMAGE_API_KEY || "").trim();
  const enabledRaw = String(process.env.COVER_IMAGE_ENABLED || "").trim().toLowerCase();
  const hasExplicitEnabled = enabledRaw.length > 0;
  const isEnabled = hasExplicitEnabled ? !["0", "false", "off", "no"].includes(enabledRaw) : true;
  const hasAnyOverride = Boolean(model || baseUrl || providerFromEnv || apiKey || hasExplicitEnabled);

  if (!hasAnyOverride) {
    return null;
  }

  const resolvedProviderName = providerFromEnv || inferCoverImageProviderName(baseUrl, model || DEFAULT_COVER_IMAGE_MODEL);
  const resolvedBaseUrl = baseUrl;
  const resolvedModel = model || DEFAULT_COVER_IMAGE_MODEL;
  const resolvedApiKey = apiKey;

  return {
    providerName: resolvedProviderName,
    baseUrl: resolvedBaseUrl,
    model: resolvedModel,
    apiKey: resolvedApiKey,
    isEnabled,
  };
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

function buildCoverImageEngineConfigFromRecord(record: DbGlobalImageEngine | null | undefined): CoverImageEngineConfig {
  if (!record) {
    return {
      providerName: "openai",
      baseUrl: "",
      model: DEFAULT_COVER_IMAGE_MODEL,
      isEnabled: true,
      hasApiKey: false,
      apiKeyPreview: null,
      lastCheckedAt: null,
      lastError: null,
      updatedBy: null,
      updatedAt: null,
      configSource: "database",
      secretWarning: null,
    };
  }

  const { apiKey, secretWarning } = readStoredApiKey(record.api_key_encrypted);
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
    configSource: "database",
    secretWarning,
  };
}

export async function getGlobalCoverImageEngine(): Promise<CoverImageEngineConfig> {
  await ensureExtendedProductSchema();
  await maybeBackfillFromLegacyUserConfig();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalImageEngine>(
    "SELECT * FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );
  const databaseConfig = buildCoverImageEngineConfigFromRecord(record);
  const envOverride = getCoverImageEnvOverride();
  if (!envOverride) {
    return databaseConfig;
  }
  return {
    ...databaseConfig,
    providerName: envOverride.providerName,
    baseUrl: envOverride.baseUrl,
    model: envOverride.model,
    isEnabled: envOverride.isEnabled,
    hasApiKey: Boolean(envOverride.apiKey),
    apiKeyPreview: maskSecret(envOverride.apiKey),
    configSource: "env",
  } satisfies CoverImageEngineConfig;
}

export async function getGlobalCoverImageEngineSecret(): Promise<CoverImageEngineSecret | null> {
  await ensureExtendedProductSchema();
  await maybeBackfillFromLegacyUserConfig();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalImageEngine>(
    "SELECT * FROM global_ai_engines WHERE engine_code = ?",
    [COVER_IMAGE_ENGINE_CODE],
  );
  const envOverride = getCoverImageEnvOverride();
  if (envOverride) {
    return {
      id: record?.id ?? null,
      providerName: envOverride.providerName,
      baseUrl: envOverride.baseUrl,
      apiKey: envOverride.apiKey,
      model: envOverride.model,
      isEnabled: envOverride.isEnabled,
      lastCheckedAt: record?.last_checked_at ?? null,
      lastError: record?.last_error ?? null,
      updatedBy: record?.updated_by ?? null,
      configSource: "env",
    } satisfies CoverImageEngineSecret;
  }
  if (!record) {
    return null;
  }
  const { apiKey, secretWarning } = readStoredApiKey(record.api_key_encrypted);
  return {
    id: record.id,
    providerName: record.provider_name,
    baseUrl: record.base_url,
    apiKey: apiKey || "",
    model: record.model || DEFAULT_COVER_IMAGE_MODEL,
    isEnabled: Boolean(record.is_enabled),
    lastCheckedAt: record.last_checked_at,
    lastError: record.last_error,
    updatedBy: record.updated_by,
    configSource: "database",
    secretWarning,
  } satisfies CoverImageEngineSecret;
}

export async function upsertGlobalCoverImageEngine(input: {
  operatorUserId: number;
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
  const providerName = inferCoverImageProviderName(normalizedBaseUrl, model);
  const nextApiKey = input.apiKey?.trim() || "";
  const existingStoredApiKey = readStoredApiKey(existing?.api_key_encrypted);
  const apiKeyEncrypted = nextApiKey
    ? encryptSecret(nextApiKey)
    : existing?.api_key_encrypted;

  if (!apiKeyEncrypted) {
    throw new Error("API Key 不能为空");
  }
  if (!nextApiKey && existingStoredApiKey.secretWarning) {
    throw new Error(COVER_IMAGE_SECRET_WARNING);
  }

  if (existing) {
    await db.exec(
      `UPDATE global_ai_engines
       SET provider_name = ?, base_url = ?, api_key_encrypted = ?, model = ?, is_enabled = ?, last_error = ?, updated_by = ?, updated_at = ?
       WHERE id = ?`,
      [providerName, normalizedBaseUrl, apiKeyEncrypted, model, input.isEnabled ?? true, null, input.operatorUserId, now, existing.id],
    );
  } else {
    await db.exec(
      `INSERT INTO global_ai_engines (
        engine_code, provider_name, base_url, api_key_encrypted, model, is_enabled, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [COVER_IMAGE_ENGINE_CODE, providerName, normalizedBaseUrl, apiKeyEncrypted, model, input.isEnabled ?? true, input.operatorUserId, now, now],
    );
  }

  await appendAuditLog({
    userId: input.operatorUserId,
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
