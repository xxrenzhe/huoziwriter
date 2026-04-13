"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { uiPrimitives } from "@huoziwriter/ui";

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
    const response = await fetch("/api/admin/image-engine", {
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
    <section className={`${uiPrimitives.adminPanel} p-5`}>
      <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Global Image Engine</div>
      <h2 className="mt-4 font-serifCn text-3xl text-stone-100">全局生图 AI 引擎</h2>
      <p className="mt-4 text-sm leading-7 text-stone-400">
        这是管理员统一维护的封面图生成引擎。用户不单独配置，所有封面图请求都读取这里的 Base_URL、API Key 和默认模型。
      </p>
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="Base_URL，例如 http://127.0.0.1:3301/v1"
          className={uiPrimitives.adminInput}
        />
        <input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="模型名称"
          className={uiPrimitives.adminInput}
        />
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={config.hasApiKey ? `API Key 已保存：${config.apiKeyPreview}` : "输入 API Key"}
          className={uiPrimitives.adminInput}
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
