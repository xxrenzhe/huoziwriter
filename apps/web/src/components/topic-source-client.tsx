"use client";

import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useState } from "react";

export function TopicSourceManagerClient({
  sources,
  canManage,
  currentCustomCount = 0,
  maxCustomCount = 0,
  planName = "",
}: {
  sources: Array<{
    id: number;
    name: string;
    homepageUrl: string | null;
    sourceType: string;
    priority: number;
    scope: "system" | "custom";
    status?: string;
    attemptCount?: number;
    consecutiveFailures?: number;
    lastError?: string | null;
    lastHttpStatus?: number | null;
    nextRetryAt?: string | null;
    healthScore?: number;
    degradedReason?: string | null;
  }>;
  canManage: boolean;
  currentCustomCount?: number;
  maxCustomCount?: number;
  planName?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [sourceType, setSourceType] = useState("news");
  const [priority, setPriority] = useState("100");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const reachedLimit = canManage && maxCustomCount > 0 && currentCustomCount >= maxCustomCount;

  function formatSourceTypeLabel(value: string) {
    if (value === "youtube") return "YouTube";
    if (value === "reddit") return "Reddit";
    if (value === "x") return "X";
    if (value === "podcast") return "Podcast";
    if (value === "spotify") return "Spotify";
    if (value === "rss") return "RSS";
    if (value === "blog") return "Blog";
    return "News";
  }

  function formatSourceStatusLabel(value: string | undefined) {
    if (value === "degraded") return "降级";
    if (value === "failed") return "失败";
    if (value === "paused") return "暂停";
    return "健康";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (reachedLimit) {
      setMessage(`${planName || "当前"}套餐最多只能启用 ${maxCustomCount} 个自定义信息源。先停用旧源，再新增新的来源。`);
      return;
    }
    const response = await fetch("/api/topic-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, homepageUrl, sourceType, priority: Number(priority || 100) }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "新增信息源失败");
      return;
    }
    setName("");
    setHomepageUrl("");
    setSourceType("news");
    setPriority("100");
    setMessage("信息源已创建，并已尝试同步最新热点。");
    startTransition(() => router.refresh());
  }

  async function updateSource(sourceId: number, payload: { sourceType?: string; priority?: number }) {
    setUpdatingId(sourceId);
    const response = await fetch(`/api/topic-sources/${sourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "更新信息源失败");
      setUpdatingId(null);
      return;
    }
    setMessage("信息源配置已更新。");
    setUpdatingId(null);
    startTransition(() => router.refresh());
  }

  async function disableSource(id: number) {
    const response = await fetch(`/api/topic-sources/${id}`, { method: "DELETE" });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "停用失败");
      return;
    }
    setMessage("信息源已停用。");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="border border-stone-300/40 bg-[#fffdfa] px-4 py-4 text-sm leading-7 text-stone-700">
          当前已启用 {currentCustomCount} / {maxCustomCount} 个自定义信息源。系统默认源不占额度；停用后即可释放启用名额。
        </div>
      ) : null}
      {canManage ? (
        <form onSubmit={handleSubmit} className="grid gap-3 border border-stone-300/40 bg-[#faf7f0] p-4 md:grid-cols-[180px_minmax(0,1fr)_140px_120px_140px]">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="信息源名称" disabled={reachedLimit} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100" />
          <input value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://example.com 或 RSS 地址" disabled={reachedLimit} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100" />
          <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} disabled={reachedLimit} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100">
            <option value="youtube">YouTube</option>
            <option value="reddit">Reddit</option>
            <option value="podcast">Podcast</option>
            <option value="spotify">Spotify</option>
            <option value="news">News</option>
            <option value="blog">Blog</option>
            <option value="rss">RSS</option>
          </select>
          <input value={priority} onChange={(event) => setPriority(event.target.value)} placeholder="优先级" disabled={reachedLimit} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100" />
          <button disabled={reachedLimit} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {reachedLimit ? "已达上限" : "新增信息源"}
          </button>
        </form>
      ) : (
        <div className="border border-stone-300/40 bg-[#faf7f0] p-4 text-sm leading-7 text-stone-700">
          当前套餐只能读取系统信息源。升级到 `pro` 或 `ultra` 后，才可新增自己的外部源。
        </div>
      )}
      <div className="space-y-3">
        {sources.map((source) => (
          <article key={source.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-300/40 bg-white p-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">
                {source.scope === "system" ? "系统源" : "自定义源"}
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink">{source.name}</div>
              <div className="mt-2 text-sm text-stone-600">{source.homepageUrl || "未配置主页地址"}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                <span className="border border-stone-300 bg-[#faf7f0] px-2 py-1">
                  类型 · {formatSourceTypeLabel(source.sourceType)}
                </span>
                <span className="border border-stone-300 bg-[#faf7f0] px-2 py-1">
                  优先级 · {source.priority}
                </span>
                <span className="border border-stone-300 bg-[#faf7f0] px-2 py-1">
                  状态 · {formatSourceStatusLabel(source.status)}
                </span>
                <span className="border border-stone-300 bg-[#faf7f0] px-2 py-1">
                  健康分 · {Math.round(Number(source.healthScore ?? 100))}
                </span>
              </div>
              {source.degradedReason || source.lastError || source.nextRetryAt ? (
                <div className="mt-3 space-y-1 text-xs leading-6 text-stone-500">
                  {source.degradedReason ? <div>降级原因：{source.degradedReason}</div> : null}
                  {source.lastError ? <div>最近错误：{source.lastError}{source.lastHttpStatus ? `（HTTP ${source.lastHttpStatus}）` : ""}</div> : null}
                  {source.nextRetryAt ? <div>下次重试：{new Date(source.nextRetryAt).toLocaleString("zh-CN")}</div> : null}
                  {typeof source.attemptCount === "number" || typeof source.consecutiveFailures === "number" ? (
                    <div>尝试次数：{source.attemptCount ?? 0} · 连续失败：{source.consecutiveFailures ?? 0}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
            {canManage && source.scope !== "system" ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  defaultValue={source.sourceType}
                  onChange={(event) => updateSource(source.id, { sourceType: event.target.value })}
                  disabled={updatingId === source.id}
                  className="border border-stone-300 bg-white px-3 py-3 text-sm"
                >
                  <option value="youtube">YouTube</option>
                  <option value="reddit">Reddit</option>
                  <option value="podcast">Podcast</option>
                  <option value="spotify">Spotify</option>
                  <option value="news">News</option>
                  <option value="blog">Blog</option>
                  <option value="rss">RSS</option>
                </select>
                <button
                  onClick={() => {
                    const next = window.prompt("设置优先级（0-999）", String(source.priority));
                    if (next == null) return;
                    updateSource(source.id, { priority: Number(next) });
                  }}
                  disabled={updatingId === source.id}
                  className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700"
                >
                  调整优先级
                </button>
                <button onClick={() => disableSource(source.id)} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                  停用
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
