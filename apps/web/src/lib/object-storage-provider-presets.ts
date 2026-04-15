export const OBJECT_STORAGE_PROVIDER_NAME_LOCAL = "local";
export const OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE = "s3-compatible";

export type ObjectStorageProviderName =
  | typeof OBJECT_STORAGE_PROVIDER_NAME_LOCAL
  | typeof OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE;

export type ObjectStorageProviderPreset =
  | "local"
  | "aws-s3"
  | "cloudflare-r2"
  | "aliyun-oss"
  | "tencent-cos"
  | "minio"
  | "custom-s3";

export type ObjectStorageProviderPresetMeta = {
  id: ObjectStorageProviderPreset;
  label: string;
  description: string;
  providerName: ObjectStorageProviderName;
  endpointPlaceholder: string;
  regionPlaceholder: string;
  publicBaseUrlPlaceholder: string;
  pathPrefixSuggestion: string;
};

export const OBJECT_STORAGE_PROVIDER_PRESETS: ObjectStorageProviderPresetMeta[] = [
  {
    id: "local",
    label: "本地存储",
    description: "资源直接写入应用本地 generated-assets 目录，适合开发环境或单机部署。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_LOCAL,
    endpointPlaceholder: "",
    regionPlaceholder: "",
    publicBaseUrlPlaceholder: "",
    pathPrefixSuggestion: "",
  },
  {
    id: "aws-s3",
    label: "AWS S3",
    description: "AWS 原生对象存储，适合直接接入标准 S3 生产环境。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://s3.us-east-1.amazonaws.com",
    regionPlaceholder: "us-east-1",
    publicBaseUrlPlaceholder: "https://<bucket>.s3.<region>.amazonaws.com",
    pathPrefixSuggestion: "wechat/assets",
  },
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    description: "推荐用于生产环境，S3 兼容，区域通常使用 auto。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://<account-id>.r2.cloudflarestorage.com",
    regionPlaceholder: "auto",
    publicBaseUrlPlaceholder: "https://pub-<hash>.r2.dev",
    pathPrefixSuggestion: "prod/images",
  },
  {
    id: "aliyun-oss",
    label: "阿里云 OSS",
    description: "面向国内链路，需填写地域对应的 OSS Endpoint。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://oss-cn-hangzhou.aliyuncs.com",
    regionPlaceholder: "cn-hangzhou",
    publicBaseUrlPlaceholder: "https://<bucket>.<region>.aliyuncs.com",
    pathPrefixSuggestion: "wechat/assets",
  },
  {
    id: "tencent-cos",
    label: "腾讯云 COS",
    description: "适合腾讯云生态，需使用 COS 兼容的 Endpoint 与地域。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://cos.ap-shanghai.myqcloud.com",
    regionPlaceholder: "ap-shanghai",
    publicBaseUrlPlaceholder: "https://<bucket>.cos.<region>.myqcloud.com",
    pathPrefixSuggestion: "wechat/assets",
  },
  {
    id: "minio",
    label: "MinIO",
    description: "适合私有化部署或内网对象存储，通常使用自建域名或服务地址。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://minio.example.com",
    regionPlaceholder: "us-east-1",
    publicBaseUrlPlaceholder: "https://cdn.example.com/assets",
    pathPrefixSuggestion: "content-assets",
  },
  {
    id: "custom-s3",
    label: "自定义 S3 兼容",
    description: "适配其他 S3 兼容提供方，自行填写 Endpoint、Region 与公网地址。",
    providerName: OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE,
    endpointPlaceholder: "https://s3.example.com",
    regionPlaceholder: "us-east-1",
    publicBaseUrlPlaceholder: "https://cdn.example.com",
    pathPrefixSuggestion: "assets",
  },
];

export function getObjectStorageProviderPresetMeta(
  preset: ObjectStorageProviderPreset,
): ObjectStorageProviderPresetMeta {
  return (
    OBJECT_STORAGE_PROVIDER_PRESETS.find((item) => item.id === preset) ??
    OBJECT_STORAGE_PROVIDER_PRESETS[0]
  );
}

export function normalizeObjectStorageProviderName(
  value: string | null | undefined,
): ObjectStorageProviderName {
  return value === OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE
    ? OBJECT_STORAGE_PROVIDER_NAME_S3_COMPATIBLE
    : OBJECT_STORAGE_PROVIDER_NAME_LOCAL;
}

export function normalizeObjectStorageProviderPreset(
  value: string | null | undefined,
  providerName?: string | null,
): ObjectStorageProviderPreset {
  const normalizedProviderName = normalizeObjectStorageProviderName(providerName);
  if (normalizedProviderName === OBJECT_STORAGE_PROVIDER_NAME_LOCAL) {
    return "local";
  }

  switch (String(value || "").trim()) {
    case "cloudflare-r2":
    case "aws-s3":
    case "aliyun-oss":
    case "tencent-cos":
    case "minio":
    case "custom-s3":
      return value as ObjectStorageProviderPreset;
    default:
      return "custom-s3";
  }
}

export function resolveObjectStorageProviderLabel(
  preset: ObjectStorageProviderPreset,
): string {
  return getObjectStorageProviderPresetMeta(preset).label;
}
