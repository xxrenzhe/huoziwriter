import { createHash, createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getGlobalObjectStorageSecret,
  updateGlobalObjectStorageHealth,
  type GlobalObjectStorageSecretConfig,
} from "./object-storage-config";

export type StoredObject = {
  provider: "local" | "s3-compatible";
  objectKey: string;
  publicUrl: string;
  contentType: string;
  byteLength: number;
};

function sanitizeObjectKey(value: string) {
  return value
    .split("/")
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset")
    .join("/");
}

function getLocalObjectRoot() {
  return path.join(process.cwd(), "public", "generated-assets");
}

export function buildObjectPublicUrl(objectKey: string) {
  return `/generated-assets/${sanitizeObjectKey(objectKey)}`;
}

function resolveObjectKeyWithPrefix(objectKey: string, pathPrefix?: string) {
  const normalizedKey = sanitizeObjectKey(objectKey);
  const rawPrefix = String(pathPrefix || "").trim().replace(/^\/+|\/+$/g, "");
  const normalizedPrefix = rawPrefix ? sanitizeObjectKey(rawPrefix).replace(/^\/+|\/+$/g, "") : "";
  return normalizedPrefix ? `${normalizedPrefix}/${normalizedKey}` : normalizedKey;
}

async function putLocalObject(input: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}) {
  const normalizedKey = sanitizeObjectKey(input.objectKey);
  const absolutePath = path.join(getLocalObjectRoot(), normalizedKey);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, input.body);

  return {
    provider: "local",
    objectKey: normalizedKey,
    publicUrl: buildObjectPublicUrl(normalizedKey),
    contentType: input.contentType,
    byteLength: input.body.byteLength,
  } satisfies StoredObject;
}

async function testLocalObjectStorageWritable(objectKey: string) {
  const probe = await putLocalObject({
    objectKey,
    body: Buffer.from("object-storage-healthcheck", "utf8"),
    contentType: "text/plain",
  });
  return {
    provider: "local" as const,
    objectKey: probe.objectKey,
    publicUrl: probe.publicUrl,
    message: "本地对象存储可写，后续图片资产会落到 public/generated-assets。",
  };
}

function sha256Hex(input: Buffer | string) {
  return createHash("sha256").update(input).digest("hex");
}

function signHmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodeObjectKeyForPath(objectKey: string) {
  return objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildRemotePublicUrl(input: {
  endpoint: string;
  bucketName: string;
  publicBaseUrl?: string;
  objectKey: string;
}) {
  const encodedObjectKey = encodeObjectKeyForPath(input.objectKey);
  if (input.publicBaseUrl) {
    return `${input.publicBaseUrl.replace(/\/+$/, "")}/${encodedObjectKey}`;
  }
  return `${input.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(input.bucketName)}/${encodedObjectKey}`;
}

async function putS3CompatibleObject(input: {
  endpoint: string;
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl?: string;
  objectKey: string;
  body: Buffer;
  contentType: string;
}) {
  const encodedObjectKey = encodeObjectKeyForPath(input.objectKey);
  const requestUrl = new URL(`${input.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(input.bucketName)}/${encodedObjectKey}`);
  const payloadHash = sha256Hex(input.body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeaders =
    `content-type:${input.contentType}\n` +
    `host:${requestUrl.host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["PUT", requestUrl.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${input.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const kDate = signHmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = signHmac(kDate, input.region);
  const kService = signHmac(kRegion, "s3");
  const kSigning = signHmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const requestBody = new Blob([Uint8Array.from(input.body)], { type: input.contentType });

  const response = await fetch(requestUrl, {
    method: "PUT",
    headers: {
      Authorization: authorization,
      "Content-Type": input.contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
    body: requestBody,
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`对象存储上传失败，HTTP ${response.status}`);
  }

  return {
    provider: "s3-compatible",
    objectKey: input.objectKey,
    publicUrl: buildRemotePublicUrl({
      endpoint: input.endpoint,
      bucketName: input.bucketName,
      publicBaseUrl: input.publicBaseUrl,
      objectKey: input.objectKey,
    }),
    contentType: input.contentType,
    byteLength: input.body.byteLength,
  } satisfies StoredObject;
}

export async function putObject(input: {
  objectKey: string;
  body: Buffer;
  contentType: string;
}) {
  const config = await getGlobalObjectStorageSecret();
  const resolvedObjectKey = resolveObjectKeyWithPrefix(input.objectKey, config.pathPrefix);
  const checkedAt = new Date().toISOString();

  try {
    if (
      config.isEnabled &&
      config.providerName === "s3-compatible" &&
      config.endpoint &&
      config.bucketName &&
      config.region &&
      config.accessKeyId &&
      config.secretAccessKey
    ) {
      const stored = await putS3CompatibleObject({
        endpoint: config.endpoint,
        bucketName: config.bucketName,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        publicBaseUrl: config.publicBaseUrl || undefined,
        objectKey: resolvedObjectKey,
        body: input.body,
        contentType: input.contentType,
      });
      await updateGlobalObjectStorageHealth({
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return stored;
    }

    const stored = await putLocalObject({
      objectKey: resolvedObjectKey,
      body: input.body,
      contentType: input.contentType,
    });
    await updateGlobalObjectStorageHealth({
      lastCheckedAt: checkedAt,
      lastError: null,
    });
    return stored;
  } catch (error) {
    await updateGlobalObjectStorageHealth({
      lastCheckedAt: checkedAt,
      lastError: error instanceof Error ? error.message : "对象存储上传失败",
    });
    throw error;
  }
}

export async function testObjectStorageConnection(input: {
  config?: GlobalObjectStorageSecretConfig;
}) {
  const config = input.config ?? (await getGlobalObjectStorageSecret());
  const checkedAt = new Date().toISOString();
  const probeKey = resolveObjectKeyWithPrefix(
    `__healthchecks__/object-storage-${Date.now()}.txt`,
    config.pathPrefix,
  );

  try {
    if (
      config.providerName === "s3-compatible" &&
      config.endpoint &&
      config.bucketName &&
      config.region &&
      config.accessKeyId &&
      config.secretAccessKey
    ) {
      const stored = await putS3CompatibleObject({
        endpoint: config.endpoint,
        bucketName: config.bucketName,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        publicBaseUrl: config.publicBaseUrl || undefined,
        objectKey: probeKey,
        body: Buffer.from(`healthcheck:${checkedAt}`, "utf8"),
        contentType: "text/plain",
      });
      await updateGlobalObjectStorageHealth({
        lastCheckedAt: checkedAt,
        lastError: null,
      });
      return {
        provider: "s3-compatible" as const,
        effectiveProvider: config.isEnabled ? ("s3-compatible" as const) : ("local" as const),
        objectKey: stored.objectKey,
        publicUrl: stored.publicUrl,
        message: config.isEnabled
          ? "远端对象存储连通性通过，后续新增图片资产会按当前配置写入远端。"
          : "远端对象存储连通性通过，但当前配置未启用，运行时仍会继续使用 local。",
      };
    }

    const localProbe = await testLocalObjectStorageWritable(probeKey);
    await updateGlobalObjectStorageHealth({
      lastCheckedAt: checkedAt,
      lastError: null,
    });
    return {
      provider: "local" as const,
      effectiveProvider: "local" as const,
      objectKey: localProbe.objectKey,
      publicUrl: localProbe.publicUrl,
      message: localProbe.message,
    };
  } catch (error) {
    await updateGlobalObjectStorageHealth({
      lastCheckedAt: checkedAt,
      lastError: error instanceof Error ? error.message : "对象存储连通性测试失败",
    });
    throw error;
  }
}
