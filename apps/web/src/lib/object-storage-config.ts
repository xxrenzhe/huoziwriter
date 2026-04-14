import { appendAuditLog } from "./audit";
import { getDatabase } from "./db";
import {
  normalizeObjectStorageProviderName,
  normalizeObjectStorageProviderPreset,
  type ObjectStorageProviderName,
  type ObjectStorageProviderPreset,
} from "./object-storage-provider-presets";
import { decryptSecret, encryptSecret } from "./security";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export const IMAGE_OBJECT_STORAGE_CODE = "imageAssets";
export const DEFAULT_OBJECT_STORAGE_REGION = "auto";

type DbGlobalObjectStorageConfig = {
  id: number;
  storage_code: string;
  provider_name: string;
  provider_preset: string | null;
  endpoint: string | null;
  bucket_name: string | null;
  region: string | null;
  access_key_id: string | null;
  secret_access_key_encrypted: string | null;
  public_base_url: string | null;
  path_prefix: string | null;
  is_enabled: number | boolean;
  last_checked_at: string | null;
  last_error: string | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

export type GlobalObjectStorageConfig = {
  providerName: ObjectStorageProviderName;
  providerPreset: ObjectStorageProviderPreset;
  endpoint: string;
  bucketName: string;
  region: string;
  accessKeyId: string;
  hasSecretAccessKey: boolean;
  secretAccessKeyPreview: string | null;
  publicBaseUrl: string;
  pathPrefix: string;
  isEnabled: boolean;
  effectiveProvider: ObjectStorageProviderName;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedBy: number | null;
  updatedAt: string | null;
};

export type GlobalObjectStorageSecretConfig = {
  providerName: ObjectStorageProviderName;
  providerPreset: ObjectStorageProviderPreset;
  endpoint: string;
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  pathPrefix: string;
  isEnabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedBy: number | null;
};

function maskSecret(value: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

function normalizeOptionalUrl(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : "";
}

function normalizeBucketName(value: string | null | undefined) {
  return String(value || "").trim();
}

function normalizePathPrefix(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/{2,}/g, "/");
}

function buildDefaultConfig(): GlobalObjectStorageConfig {
  return {
    providerName: "local",
    providerPreset: "local",
    endpoint: "",
    bucketName: "",
    region: DEFAULT_OBJECT_STORAGE_REGION,
    accessKeyId: "",
    hasSecretAccessKey: false,
    secretAccessKeyPreview: null as string | null,
    publicBaseUrl: "",
    pathPrefix: "",
    isEnabled: true,
    effectiveProvider: "local",
    lastCheckedAt: null,
    lastError: null,
    updatedBy: null,
    updatedAt: null,
  };
}

function validateRemoteConfig(input: {
  endpoint?: string | null;
  bucketName?: string | null;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
}) {
  if (!normalizeOptionalUrl(input.endpoint)) {
    throw new Error("S3 兼容对象存储必须填写 Endpoint");
  }
  if (!normalizeBucketName(input.bucketName)) {
    throw new Error("S3 兼容对象存储必须填写 Bucket");
  }
  if (!String(input.region || "").trim()) {
    throw new Error("S3 兼容对象存储必须填写 Region");
  }
  if (!String(input.accessKeyId || "").trim()) {
    throw new Error("S3 兼容对象存储必须填写 Access Key ID");
  }
  if (!String(input.secretAccessKey || "").trim()) {
    throw new Error("S3 兼容对象存储必须填写 Secret Access Key");
  }
}

export async function getGlobalObjectStorageConfig(): Promise<GlobalObjectStorageConfig> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalObjectStorageConfig>(
    "SELECT * FROM global_object_storage_configs WHERE storage_code = ?",
    [IMAGE_OBJECT_STORAGE_CODE],
  );
  if (!record) {
    return buildDefaultConfig();
  }

  const secretAccessKey = decryptSecret(record.secret_access_key_encrypted);
  const providerName = normalizeObjectStorageProviderName(record.provider_name);
  const providerPreset = normalizeObjectStorageProviderPreset(record.provider_preset, providerName);
  const effectiveProvider: ObjectStorageProviderName =
    providerName === "s3-compatible" && Boolean(record.is_enabled) ? "s3-compatible" : "local";
  return {
    providerName,
    providerPreset,
    endpoint: record.endpoint || "",
    bucketName: record.bucket_name || "",
    region: record.region || DEFAULT_OBJECT_STORAGE_REGION,
    accessKeyId: record.access_key_id || "",
    hasSecretAccessKey: Boolean(secretAccessKey),
    secretAccessKeyPreview: maskSecret(secretAccessKey),
    publicBaseUrl: record.public_base_url || "",
    pathPrefix: record.path_prefix || "",
    isEnabled: Boolean(record.is_enabled),
    effectiveProvider,
    lastCheckedAt: record.last_checked_at,
    lastError: record.last_error,
    updatedBy: record.updated_by,
    updatedAt: record.updated_at,
  };
}

export async function getGlobalObjectStorageSecret(): Promise<GlobalObjectStorageSecretConfig> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const record = await db.queryOne<DbGlobalObjectStorageConfig>(
    "SELECT * FROM global_object_storage_configs WHERE storage_code = ?",
    [IMAGE_OBJECT_STORAGE_CODE],
  );
  if (!record) {
    return {
      providerName: "local" as const,
      providerPreset: "local" as const,
      endpoint: "",
      bucketName: "",
      region: DEFAULT_OBJECT_STORAGE_REGION,
      accessKeyId: "",
      secretAccessKey: "",
      publicBaseUrl: "",
      pathPrefix: "",
      isEnabled: true,
      lastCheckedAt: null as string | null,
      lastError: null as string | null,
      updatedBy: null as number | null,
    };
  }

  return {
    providerName: normalizeObjectStorageProviderName(record.provider_name),
    providerPreset: normalizeObjectStorageProviderPreset(record.provider_preset, record.provider_name),
    endpoint: record.endpoint || "",
    bucketName: record.bucket_name || "",
    region: record.region || DEFAULT_OBJECT_STORAGE_REGION,
    accessKeyId: record.access_key_id || "",
    secretAccessKey: decryptSecret(record.secret_access_key_encrypted) || "",
    publicBaseUrl: record.public_base_url || "",
    pathPrefix: record.path_prefix || "",
    isEnabled: Boolean(record.is_enabled),
    lastCheckedAt: record.last_checked_at,
    lastError: record.last_error,
    updatedBy: record.updated_by,
  };
}

export async function upsertGlobalObjectStorageConfig(input: {
  adminUserId: number;
  providerName: ObjectStorageProviderName;
  providerPreset?: ObjectStorageProviderPreset | null;
  endpoint?: string | null;
  bucketName?: string | null;
  region?: string | null;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  publicBaseUrl?: string | null;
  pathPrefix?: string | null;
  isEnabled?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<DbGlobalObjectStorageConfig>(
    "SELECT * FROM global_object_storage_configs WHERE storage_code = ?",
    [IMAGE_OBJECT_STORAGE_CODE],
  );

  const providerName = normalizeObjectStorageProviderName(input.providerName);
  const providerPreset = normalizeObjectStorageProviderPreset(input.providerPreset, providerName);
  const endpoint = normalizeOptionalUrl(input.endpoint);
  const bucketName = normalizeBucketName(input.bucketName);
  const region = String(input.region || DEFAULT_OBJECT_STORAGE_REGION).trim() || DEFAULT_OBJECT_STORAGE_REGION;
  const accessKeyId = String(input.accessKeyId || "").trim();
  const publicBaseUrl = normalizeOptionalUrl(input.publicBaseUrl);
  const pathPrefix = normalizePathPrefix(input.pathPrefix);
  const isEnabled = input.isEnabled ?? true;

  let secretAccessKeyEncrypted = existing?.secret_access_key_encrypted ?? null;
  if (String(input.secretAccessKey || "").trim()) {
    secretAccessKeyEncrypted = encryptSecret(String(input.secretAccessKey || "").trim());
  }

  if (providerName === "s3-compatible") {
    validateRemoteConfig({
      endpoint,
      bucketName,
      region,
      accessKeyId,
      secretAccessKey: secretAccessKeyEncrypted ? decryptSecret(secretAccessKeyEncrypted) : "",
    });
  }

  if (providerName === "local") {
    secretAccessKeyEncrypted = null;
  } else if (!secretAccessKeyEncrypted) {
    throw new Error("S3 兼容对象存储必须填写 Secret Access Key");
  }

  if (existing) {
    await db.exec(
      `UPDATE global_object_storage_configs
       SET provider_name = ?, provider_preset = ?, endpoint = ?, bucket_name = ?, region = ?, access_key_id = ?, secret_access_key_encrypted = ?, public_base_url = ?, path_prefix = ?, is_enabled = ?, last_error = ?, updated_by = ?, updated_at = ?
       WHERE storage_code = ?`,
      [
        providerName,
        providerPreset,
        endpoint || null,
        bucketName || null,
        region,
        accessKeyId || null,
        secretAccessKeyEncrypted,
        publicBaseUrl || null,
        pathPrefix || null,
        isEnabled,
        null,
        input.adminUserId,
        now,
        IMAGE_OBJECT_STORAGE_CODE,
      ],
    );
  } else {
    await db.exec(
      `INSERT INTO global_object_storage_configs (
        storage_code, provider_name, provider_preset, endpoint, bucket_name, region, access_key_id, secret_access_key_encrypted, public_base_url, path_prefix, is_enabled, last_error, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        IMAGE_OBJECT_STORAGE_CODE,
        providerName,
        providerPreset,
        endpoint || null,
        bucketName || null,
        region,
        accessKeyId || null,
        secretAccessKeyEncrypted,
        publicBaseUrl || null,
        pathPrefix || null,
        isEnabled,
        null,
        input.adminUserId,
        now,
        now,
      ],
    );
  }

  await appendAuditLog({
    userId: input.adminUserId,
    action: "admin.object_storage.update",
    targetType: "global_object_storage",
    targetId: IMAGE_OBJECT_STORAGE_CODE,
    payload: {
      providerName,
      providerPreset,
      endpoint: endpoint || null,
      bucketName: bucketName || null,
      region,
      publicBaseUrl: publicBaseUrl || null,
      pathPrefix: pathPrefix || null,
      isEnabled,
    },
  });

  return getGlobalObjectStorageConfig();
}

export async function updateGlobalObjectStorageHealth(input: {
  lastCheckedAt: string;
  lastError?: string | null;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.exec(
    `UPDATE global_object_storage_configs
     SET last_checked_at = ?, last_error = ?, updated_at = ?
     WHERE storage_code = ?`,
    [input.lastCheckedAt, input.lastError ?? null, input.lastCheckedAt, IMAGE_OBJECT_STORAGE_CODE],
  );
}
