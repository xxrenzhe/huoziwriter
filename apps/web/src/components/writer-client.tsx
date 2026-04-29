"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

export function CaptureForms() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "url" | "screenshot">("manual");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const endpoint = useMemo(() => {
    if (mode === "url") return "/api/capture/url";
    if (mode === "screenshot") return "/api/capture/screenshot";
    return "/api/capture/manual";
  }, [mode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "url"
          ? { title, url: content }
          : mode === "screenshot"
            ? { title, note: content, screenshotPath: "/uploads/mock-screenshot.png" }
            : { title, content },
      ),
    });
    setLoading(false);
    setTitle("");
    setContent("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border border-stone-300/40 bg-white p-6 shadow-ink">
      <div className="flex gap-2">
        {[
          ["manual", "手动输入"],
          ["url", "URL"],
          ["screenshot", "截图"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value as "manual" | "url" | "screenshot")}
            className={`border px-4 py-2 text-sm ${mode === value ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题" className="w-full border border-stone-300 px-4 py-3 text-sm" />
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder={mode === "url" ? "粘贴公众号或网页链接" : mode === "screenshot" ? "描述截图内容" : "输入碎片正文"}
        className="min-h-[180px] w-full border border-stone-300 px-4 py-3 text-sm"
      />
      <button disabled={loading} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
        {loading ? "提交中..." : "写入碎片库"}
      </button>
    </form>
  );
}

export function BannedWordsManager({
  words,
}: {
  words: Array<{ id: number; word: string }>;
}) {
  const router = useRouter();
  const [word, setWord] = useState("");

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!word.trim()) return;
    await fetch("/api/banned-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    });
    setWord("");
    router.refresh();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/banned-words/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAdd} className="flex gap-3">
        <input value={word} onChange={(event) => setWord(event.target.value)} placeholder="例如：不可否认" className="flex-1 border border-stone-300 px-4 py-3 text-sm" />
        <button className="bg-cinnabar px-5 py-3 text-sm text-white">添加</button>
      </form>
      <div className="flex flex-wrap gap-3">
        {words.map((item) => (
          <button key={item.id} onClick={() => handleDelete(item.id)} className="border border-cinnabar px-4 py-2 text-sm text-cinnabar line-through">
            {item.word}
          </button>
        ))}
      </div>
    </div>
  );
}

export function WechatConnectionsManager({
  connections,
}: {
  connections: Array<{ id: number; accountName: string | null; status: string; isDefault: boolean; accessTokenExpiresAt: string | null }>;
}) {
  const router = useRouter();
  const [accountName, setAccountName] = useState("");
  const [originalId, setOriginalId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await fetch("/api/wechat/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountName, originalId, appId, appSecret, isDefault: true }),
    });
    setLoading(false);
    setAccountName("");
    setOriginalId("");
    setAppId("");
    setAppSecret("");
    router.refresh();
  }

  async function handleDelete(id: number) {
    await fetch(`/api/wechat/connections/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="grid gap-3 border border-stone-300/40 bg-white p-5 shadow-ink">
        <input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="公众号名称" className="border border-stone-300 px-4 py-3 text-sm" />
        <input value={originalId} onChange={(event) => setOriginalId(event.target.value)} placeholder="原始 ID" className="border border-stone-300 px-4 py-3 text-sm" />
        <input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="AppID" className="border border-stone-300 px-4 py-3 text-sm" />
        <input value={appSecret} onChange={(event) => setAppSecret(event.target.value)} placeholder="AppSecret" className="border border-stone-300 px-4 py-3 text-sm" />
        <button disabled={loading} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
          {loading ? "校验中..." : "添加公众号连接"}
        </button>
      </form>
      <div className="space-y-3">
        {connections.map((connection) => (
          <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-300/40 bg-white p-4">
            <div>
              <div className="font-serifCn text-xl text-ink">{connection.accountName || "未命名公众号"}</div>
              <div className="mt-1 text-sm text-stone-600">
                状态：{connection.status} {connection.isDefault ? "· 默认连接" : ""}
              </div>
            </div>
            <button onClick={() => handleDelete(connection.id)} className="border border-stone-300 px-4 py-2 text-sm text-stone-700">
              删除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentEditorClient({
  document,
  fragments,
  bannedWords,
  connections,
}: {
  document: { id: number; title: string; markdownContent: string; status: string; htmlContent: string };
  fragments: Array<{ id: number; distilledContent: string }>;
  bannedWords: Array<{ id: number; word: string }>;
  connections: Array<{ id: number; accountName: string | null }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [markdown, setMarkdown] = useState(document.markdownContent);
  const [status, setStatus] = useState(document.status);
  const [selectedConnectionId, setSelectedConnectionId] = useState(connections[0]?.id ? String(connections[0].id) : "");

  async function save(statusValue?: string) {
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, markdownContent: markdown, status: statusValue || status }),
    });
    const json = await response.json();
    if (response.ok && json.success) {
      setStatus(json.data.status);
      router.refresh();
    }
  }

  async function generate() {
    const response = await fetch(`/api/documents/${document.id}/generate`, { method: "POST" });
    const json = await response.json();
    if (response.ok && json.success) {
      setMarkdown(json.data.markdownContent);
      setStatus(json.data.status);
      router.refresh();
    }
  }

  async function publish() {
    if (!selectedConnectionId) return;
    await save("readyToPublish");
    const response = await fetch("/api/wechat/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: document.id, wechatConnectionId: Number(selectedConnectionId) }),
    });
    const json = await response.json();
    if (response.ok && json.success) {
      setStatus("published");
      router.push("/sync/logs");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">挂载碎片</div>
        <div className="mt-4 space-y-3">
          {fragments.slice(0, 6).map((fragment) => (
            <div key={fragment.id} className="border border-stone-300 bg-white p-4 text-sm leading-7 text-stone-700">
              {fragment.distilledContent}
            </div>
          ))}
        </div>
      </aside>
      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap gap-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-[240px] flex-1 border border-stone-300 px-4 py-3 text-sm" />
          <button onClick={() => save()} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">保存</button>
          <button onClick={generate} className="bg-cinnabar px-4 py-3 text-sm text-white">生成正文</button>
        </div>
        <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} className="mt-4 min-h-[560px] w-full border border-stone-300 px-4 py-4 text-sm leading-8" />
      </section>
      <aside className="space-y-4">
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">文稿状态</div>
          <div className="mt-3 font-serifCn text-3xl text-ink">{status}</div>
        </div>
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">死刑词</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {bannedWords.map((item) => (
              <span key={item.id} className="border border-cinnabar px-3 py-1 text-xs text-cinnabar">{item.word}</span>
            ))}
          </div>
        </div>
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发布到公众号</div>
          <select value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm">
            <option value="">选择公众号连接</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.accountName || `连接 ${connection.id}`}</option>
            ))}
          </select>
          <button onClick={publish} className="mt-4 w-full bg-cinnabar px-4 py-3 text-sm text-white">推送到微信草稿箱</button>
        </div>
      </aside>
    </div>
  );
}
