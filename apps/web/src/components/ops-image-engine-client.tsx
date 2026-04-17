"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";
import type { GlobalObjectStorageConfig } from "@/lib/object-storage-config";
import {
  getObjectStorageProviderPresetMeta,
  OBJECT_STORAGE_PROVIDER_PRESETS,
  resolveObjectStorageProviderLabel,
  type ObjectStorageProviderName,
  type ObjectStorageProviderPreset,
} from "@/lib/object-storage-provider-presets";

type GlobalCoverImageEngineConfig = {
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
};


export function GlobalCoverImageEngineSettings({
  config,
}: {
  config: GlobalCoverImageEngineConfig;
}) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [model, setModel] = useState(config.model || "Gemini 3.1 Pro");
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/ops/image-engine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, model, apiKey, isEnabled: true }),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "保存失败");
      return;
    }
    setApiKey("");
    setMessage("全局生图 AI 引擎已保存，所有用户的封面图都会走这套配置。");
    router.refresh();
  }

  return (
    <section className={`${uiPrimitives.opsPanel} p-5`}>
      <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Global Image Engine</div>
      <h2 className="mt-4 font-serifCn text-3xl text-stone-100">全局生图 AI 引擎</h2>
      <p className="mt-4 text-sm leading-7 text-stone-400">
        这是运营后台统一维护的封面图生成引擎。用户不单独配置，所有封面图请求都读取这里的 Base_URL、API Key 和默认模型。
      </p>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="Base_URL，例如 http://127.0.0.1:3301/v1"
          className={uiPrimitives.opsInput}
        />
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="模型名称"
          className={uiPrimitives.opsInput}
        />
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={config.hasApiKey ? `API Key 已保存：${config.apiKeyPreview}` : "输入 API Key"}
          className={uiPrimitives.opsInput}
        />
        <button disabled={saving} className={uiPrimitives.primaryButton}>
          {saving ? "保存中..." : "保存全局生图引擎"}
        </button>
      </form>
      <div className="mt-5 grid gap-3 text-sm text-stone-400 md:grid-cols-2">
        <div className="border border-stone-800 bg-stone-950 p-4">
          当前状态：{config.hasApiKey ? "已配置" : "未配置"}
          <br />
          最近检查：{config.lastCheckedAt ? new Date(config.lastCheckedAt).toLocaleString("zh-CN") : "尚未调用"}
        </div>
        <div className="border border-stone-800 bg-stone-950 p-4">
          最近错误：{config.lastError || "无"}
          <br />
          最近更新：{config.updatedAt ? new Date(config.updatedAt).toLocaleString("zh-CN") : "尚未保存"}
        </div>
      </div>
      {message ? <div className={`mt-4 text-sm ${message.includes("失败") ? "text-cinnabar" : "text-stone-300"}`}>{message}</div> : null}
    </section>
  );
}

export function GlobalObjectStorageSettings({
  config,
}: {
  config: GlobalObjectStorageConfig;
}) {
  const router = useRouter();
  const [providerPreset, setProviderPreset] = useState<ObjectStorageProviderPreset>(config.providerPreset);
  const [providerName, setProviderName] = useState<ObjectStorageProviderName>(config.providerName);
  const [endpoint, setEndpoint] = useState(config.endpoint);
  const [bucketName, setBucketName] = useState(config.bucketName);
  const [region, setRegion] = useState(config.region || "auto");
  const [accessKeyId, setAccessKeyId] = useState(config.accessKeyId);
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState(config.publicBaseUrl);
  const [pathPrefix, setPathPrefix] = useState(config.pathPrefix);
  const [isEnabled, setIsEnabled] = useState(config.isEnabled);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const selectedPreset = getObjectStorageProviderPresetMeta(providerPreset);

  function applyProviderPreset(nextPreset: ObjectStorageProviderPreset) {
    const presetMeta = getObjectStorageProviderPresetMeta(nextPreset);
    setProviderPreset(nextPreset);
    setProviderName(presetMeta.providerName);
    if (presetMeta.providerName === "local") {
      setEndpoint("");
      setBucketName("");
      setRegion("auto");
      setAccessKeyId("");
      setPublicBaseUrl("");
      return;
    }
    if (!endpoint) {
      setEndpoint(presetMeta.endpointPlaceholder);
    }
    if (!region || region === "auto" || region === "us-east-1") {
      setRegion(presetMeta.regionPlaceholder || "auto");
    }
    if (!publicBaseUrl && presetMeta.publicBaseUrlPlaceholder) {
      setPublicBaseUrl(presetMeta.publicBaseUrlPlaceholder);
    }
    if (!pathPrefix && presetMeta.pathPrefixSuggestion) {
      setPathPrefix(presetMeta.pathPrefixSuggestion);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestMessage("");
    const response = await fetch("/api/ops/object-storage/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerName,
        providerPreset,
        endpoint,
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        publicBaseUrl,
        pathPrefix,
        isEnabled,
      }),
    });
    const json = await response.json().catch(() => null);
    setTesting(false);
    if (!response.ok || !json?.success) {
      setTestMessage(json?.error || "测试失败");
      return;
    }
    setTestMessage(json.data?.message || "测试通过");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/ops/object-storage", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerName,
        providerPreset,
        endpoint,
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        publicBaseUrl,
        pathPrefix,
        isEnabled,
      }),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "保存失败");
      return;
    }
    setSecretAccessKey("");
    setMessage(
      providerName === "local"
        ? "对象存储已切换为本地模式。"
        : `${resolveObjectStorageProviderLabel(providerPreset)} 配置已保存，后续图片资产会优先写入远端存储。`,
    );
    router.refresh();
  }

  return (
    <section className={`${uiPrimitives.opsPanel} p-5`}>
      <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Global Object Storage</div>
      <h2 className="mt-4 font-serifCn text-3xl text-stone-100">图片对象存储</h2>
      <p className="mt-4 text-sm leading-7 text-stone-400">
        这里统一管理封面图与图片资产的对象存储。默认走本地存储，也可以按 AWS S3、Cloudflare R2、阿里云 OSS、腾讯云 COS、MinIO 或自定义 S3 兼容预设接入。
      </p>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <select
          value={providerPreset}
          onChange={(event) => applyProviderPreset(event.target.value as ObjectStorageProviderPreset)}
          className={uiPrimitives.opsSelect}
        >
          {OBJECT_STORAGE_PROVIDER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <div className="border border-stone-800 bg-stone-950 px-4 py-3 text-sm leading-7 text-stone-300">
          当前预设：{selectedPreset.label}
          <br />
          {selectedPreset.description}
        </div>
        <label className="flex items-center gap-3 border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-300">
          <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} />
          启用当前对象存储配置
        </label>
        <input
          value={pathPrefix}
          onChange={(event) => setPathPrefix(event.target.value)}
          placeholder="路径前缀，可选，例如 prod/assets"
          className={uiPrimitives.opsInput}
        />
        {providerName === "s3-compatible" ? (
          <>
            <input
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={`Endpoint，例如 ${selectedPreset.endpointPlaceholder}`}
              className={uiPrimitives.opsInput}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={bucketName}
                onChange={(event) => setBucketName(event.target.value)}
                placeholder="Bucket 名称"
                className={uiPrimitives.opsInput}
              />
              <input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                placeholder={`Region，例如 ${selectedPreset.regionPlaceholder}`}
                className={uiPrimitives.opsInput}
              />
            </div>
            <input
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              placeholder="Access Key ID"
              className={uiPrimitives.opsInput}
            />
            <input
              value={secretAccessKey}
              onChange={(event) => setSecretAccessKey(event.target.value)}
              placeholder={config.hasSecretAccessKey ? `Secret 已保存：${config.secretAccessKeyPreview}` : "Secret Access Key"}
              className={uiPrimitives.opsInput}
            />
            <input
              value={publicBaseUrl}
              onChange={(event) => setPublicBaseUrl(event.target.value)}
              placeholder={`Public Base URL，可选，例如 ${selectedPreset.publicBaseUrlPlaceholder || "https://cdn.example.com"}`}
              className={uiPrimitives.opsInput}
            />
          </>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <button type="button" disabled={testing} onClick={handleTestConnection} className={uiPrimitives.opsSecondaryButton}>
            {testing ? "测试中..." : "测试对象存储连通性"}
          </button>
          <button disabled={saving} className={uiPrimitives.primaryButton}>
            {saving ? "保存中..." : "保存对象存储配置"}
          </button>
        </div>
      </form>
      <div className="mt-5 grid gap-3 text-sm text-stone-400 md:grid-cols-2">
        <div className="border border-stone-800 bg-stone-950 p-4">
          当前提供方：{resolveObjectStorageProviderLabel(config.effectiveProvider === "local" ? "local" : config.providerPreset)}
          <br />
          最近检查：{config.lastCheckedAt ? new Date(config.lastCheckedAt).toLocaleString("zh-CN") : "尚未调用"}
        </div>
        <div className="border border-stone-800 bg-stone-950 p-4">
          最近错误：{config.lastError || "无"}
          <br />
          最近更新：{config.updatedAt ? new Date(config.updatedAt).toLocaleString("zh-CN") : "尚未保存"}
        </div>
      </div>
      {providerName === "s3-compatible" ? (
        <div className="mt-4 border border-[#7d6430] bg-[#2b2518] px-4 py-3 text-sm leading-7 text-[#e0c37a]">
          `publicBaseUrl` 可选；不填时系统会按 `endpoint/bucket/objectKey` 生成地址，但是否可公网访问取决于 {selectedPreset.label} 的桶策略或 CDN 配置。
        </div>
      ) : null}
      <div className={`mt-4 border px-4 py-3 text-sm leading-7 ${
        providerName === "local"
          ? "border-stone-800 bg-stone-950 text-stone-300"
          : !isEnabled
            ? "border-[#7d6430] bg-[#2b2518] text-[#e0c37a]"
            : "border-[#d8b0b2] bg-[#fff7f7] text-[#8f3136]"
      }`}>
        {providerName === "local"
          ? "当前运行时直接使用 local 存储，新增图片资产会写到本地 generated-assets 目录。"
          : !isEnabled
            ? `当前 ${selectedPreset.label} 配置未启用，测试可以验证远端可用性，但运行时仍会继续回退到 local。`
            : `当前 ${selectedPreset.label} 已启用。注意：后续真实上传若失败，会直接报错并记录健康状态，不会静默回退到 local。`}
      </div>
      {testMessage ? <div className={`mt-4 text-sm ${testMessage.includes("失败") ? "text-cinnabar" : "text-stone-300"}`}>{testMessage}</div> : null}
      {message ? <div className={`mt-4 text-sm ${message.includes("失败") ? "text-cinnabar" : "text-stone-300"}`}>{message}</div> : null}
    </section>
  );
}
