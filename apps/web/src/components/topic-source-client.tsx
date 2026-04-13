"use client";

import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useState } from "react";

export function TopicSourceManagerClient({
  sources,
  canManage,
}: {
  sources: Array<{ id: number; name: string; homepageUrl: string | null; scope: "system" | "custom" | "team" }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/topic-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, homepageUrl }),
    });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "新增信息源失败");
      return;
    }
    setName("");
    setHomepageUrl("");
    setMessage("信息源已创建，并已尝试同步最新热点。");
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
        <form onSubmit={handleSubmit} className="grid gap-3 border border-stone-300/40 bg-[#faf7f0] p-4 md:grid-cols-[180px_minmax(0,1fr)_140px]">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="信息源名称" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
          <input value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://example.com 或 RSS 地址" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
          <button className="bg-cinnabar px-4 py-3 text-sm text-white">新增信息源</button>
        </form>
      ) : (
        <div className="border border-stone-300/40 bg-[#faf7f0] p-4 text-sm leading-7 text-stone-700">
          当前套餐只能读取系统信息源。升级到 `ultra/team` 后，才可新增自己的外部源。
        </div>
      )}
      <div className="space-y-3">
        {sources.map((source) => (
          <article key={source.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-300/40 bg-white p-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">
                {source.scope === "system" ? "系统源" : source.scope === "team" ? "团队共享源" : "自定义源"}
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink">{source.name}</div>
              <div className="mt-2 text-sm text-stone-600">{source.homepageUrl || "未配置主页地址"}</div>
            </div>
            {canManage && source.scope !== "system" ? (
              <button onClick={() => disableSource(source.id)} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                停用
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
