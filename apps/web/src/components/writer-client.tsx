"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { DocumentOutlineClient } from "./document-outline-client";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildBannedWordMarkup(markdown: string, bannedWords: string[]) {
  const words = Array.from(new Set(bannedWords.map((item) => item.trim()).filter(Boolean))).sort((left, right) => right.length - left.length);
  if (!words.length) {
    return escapeHtml(markdown);
  }

  const regex = new RegExp(words.map((item) => escapeRegex(item)).join("|"), "g");
  let html = "";
  let lastIndex = 0;
  for (const match of markdown.matchAll(regex)) {
    const index = match.index ?? 0;
    html += escapeHtml(markdown.slice(lastIndex, index));
    html += `<span style="color:#A73032;background:rgba(167,48,50,0.08);text-decoration-line:underline line-through;text-decoration-style:wavy;text-decoration-color:#A73032;text-decoration-thickness:1.5px;">${escapeHtml(match[0])}</span>`;
    lastIndex = index + match[0].length;
  }
  html += escapeHtml(markdown.slice(lastIndex));
  return html;
}

function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVisualSuggestion(title: string, markdown: string) {
  const plain = stripMarkdown(markdown);
  const seed = (plain || title || "写作主题").slice(0, 120);

  const mood = /裁员|下滑|亏损|焦虑|风险|危机|崩|压力/.test(seed)
    ? "冷峻、高反差、纪实摄影"
    : /增长|机会|扩张|新品|突破|创新|发布/.test(seed)
      ? "克制、留白、现代商业摄影"
      : "新中式、纸张肌理、静物感";

  const subject = title.trim() || seed.slice(0, 24) || "内容生产现场";
  return `视觉联想：围绕“${subject}”，提炼一个单主体隐喻场景，画面保持 ${mood}，16:9 横版，不出现水印与密集文字，只保留一个高辨识度主体和明确情绪。参考内容：${seed || "请根据当前文稿核心冲突生成画面。"}。`;
}

function refreshRouter(router: ReturnType<typeof useRouter>) {
  startTransition(() => {
    router.refresh();
  });
}

async function parseResponseMessage(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message || json.error || text;
  } catch {
    return text || "请求失败";
  }
}

export function CaptureForms() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "url" | "screenshot">("manual");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [screenshotFileName, setScreenshotFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);

  const endpoint = useMemo(() => {
    if (mode === "url") return "/api/capture/url";
    if (mode === "screenshot") return "/api/capture/screenshot";
    return "/api/capture/manual";
  }, [mode]);

  function handleScreenshotFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setImageDataUrl(null);
      setScreenshotFileName("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageDataUrl(reader.result);
        setScreenshotFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "screenshot" && !imageDataUrl) {
      setMessage("截图模式必须上传真实图片文件");
      return;
    }
    setLoading(true);
    setMessage("");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "url"
          ? { title, url: content }
          : mode === "screenshot"
            ? { title, note: content, imageDataUrl }
            : { title, content },
      ),
    });
    setLoading(false);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setTitle("");
    setContent("");
    setImageDataUrl(null);
    setScreenshotFileName("");
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = "";
    }
    setMessage("已写入碎片库");
    refreshRouter(router);
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
        placeholder={mode === "url" ? "粘贴公众号或网页链接" : mode === "screenshot" ? "补充截图上下文，可选" : "输入碎片正文"}
        className="min-h-[180px] w-full border border-stone-300 px-4 py-3 text-sm"
      />
      {mode === "screenshot" ? (
        <div className="space-y-2 border border-dashed border-stone-300 bg-stone-50 px-4 py-4 text-sm text-stone-600">
          <input
            ref={screenshotInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleScreenshotFileChange}
            className="w-full"
          />
          <div>{screenshotFileName ? `已选择截图：${screenshotFileName}` : "支持 png/jpg/webp，必须上传真实截图后才会进入视觉理解链路。"}</div>
        </div>
      ) : null}
      <button disabled={loading} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
        {loading ? "提交中..." : "写入碎片库"}
      </button>
      {message ? <div className="text-sm text-stone-600">{message}</div> : null}
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
  const [message, setMessage] = useState("");

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!word.trim()) return;
    setMessage("");
    const response = await fetch("/api/banned-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setWord("");
    refreshRouter(router);
  }

  async function handleDelete(id: number) {
    await fetch(`/api/banned-words/${id}`, { method: "DELETE" });
    refreshRouter(router);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAdd} className="flex gap-3">
        <input value={word} onChange={(event) => setWord(event.target.value)} placeholder="例如：不可否认" className="flex-1 border border-stone-300 px-4 py-3 text-sm" />
        <button className="bg-cinnabar px-5 py-3 text-sm text-white">添加</button>
      </form>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
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
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/wechat/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountName, originalId, appId, appSecret, isDefault: true }),
    });
    setLoading(false);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setAccountName("");
    setOriginalId("");
    setAppId("");
    setAppSecret("");
    refreshRouter(router);
  }

  async function handleDelete(id: number) {
    await fetch(`/api/wechat/connections/${id}`, { method: "DELETE" });
    refreshRouter(router);
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
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
      <div className="space-y-3">
        {connections.map((connection) => (
          <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-300/40 bg-white p-4">
            <div>
              <div className="font-serifCn text-xl text-ink">{connection.accountName || "未命名公众号"}</div>
              <div className="mt-1 text-sm text-stone-600">
                状态：{connection.status}
                {connection.isDefault ? " · 默认连接" : ""}
                {connection.accessTokenExpiresAt ? ` · 到期 ${new Date(connection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : ""}
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

type SnapshotMeta = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type DiffState = {
  snapshotId: number;
  snapshotNote: string | null;
  createdAt: string;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  lines: Array<{ type: "added" | "removed" | "unchanged"; content: string }>;
} | null;

type KnowledgeCardPanelItem = {
  id: number;
  cardType: string;
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions: string[];
  sourceFragmentIds: number[];
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  relevanceScore: number;
  matchedFragmentCount: number;
};

function formatKnowledgeStatus(status: string) {
  if (status === "active") return "可引用";
  if (status === "stale") return "待刷新";
  if (status === "conflicted") return "有冲突";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

export function DocumentEditorClient({
  document,
  nodes: initialNodes,
  fragments,
  bannedWords,
  connections,
  snapshots: initialSnapshots,
  styleGenomes,
  templates,
  knowledgeCards,
  canExportPdf,
  canGenerateCoverImage,
  initialCoverImage,
  isTeamShared,
  sharedMemberCount,
}: {
  document: { id: number; title: string; markdownContent: string; status: string; htmlContent: string; styleGenomeId: number | null; wechatTemplateId: string | null };
  nodes: Array<{ id: number; title: string; description: string | null; sortOrder: number; fragments: Array<{ id: number; distilledContent: string; shared?: boolean }> }>;
  fragments: Array<{ id: number; title?: string | null; distilledContent: string; shared?: boolean }>;
  bannedWords: Array<{ id: number; word: string }>;
  connections: Array<{ id: number; accountName: string | null }>;
  snapshots: SnapshotMeta[];
  styleGenomes: Array<{ id: number; name: string; isPublic: boolean; isOfficial: boolean }>;
  templates: Array<{ id: string; version: string; name: string }>;
  knowledgeCards: KnowledgeCardPanelItem[];
  canExportPdf: boolean;
  canGenerateCoverImage: boolean;
  initialCoverImage: { imageUrl: string; prompt: string; createdAt: string } | null;
  isTeamShared: boolean;
  sharedMemberCount: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [markdown, setMarkdown] = useState(document.markdownContent);
  const [htmlPreview, setHtmlPreview] = useState(document.htmlContent);
  const [status, setStatus] = useState(document.status);
  const [styleGenomeId, setStyleGenomeId] = useState<number | null>(document.styleGenomeId);
  const [wechatTemplateId, setWechatTemplateId] = useState<string | null>(document.wechatTemplateId);
  const [nodes, setNodes] = useState(initialNodes);
  const [knowledgeCardItems, setKnowledgeCardItems] = useState(knowledgeCards);
  const [view, setView] = useState<"edit" | "preview" | "audit">("edit");
  const [selectedConnectionId, setSelectedConnectionId] = useState(connections[0]?.id ? String(connections[0].id) : "");
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [diffState, setDiffState] = useState<DiffState>(null);
  const [saveState, setSaveState] = useState("未保存");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [coverImage, setCoverImage] = useState(initialCoverImage);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingDiffId, setLoadingDiffId] = useState<number | null>(null);
  const [refreshingKnowledgeId, setRefreshingKnowledgeId] = useState<number | null>(null);
  const [expandedKnowledgeCardId, setExpandedKnowledgeCardId] = useState<number | null>(knowledgeCards[0]?.id ?? null);
  const lastSavedRef = useRef({
    title: document.title,
    markdown: document.markdownContent,
    status: document.status,
    styleGenomeId: document.styleGenomeId,
    wechatTemplateId: document.wechatTemplateId,
  });

  const detectedBannedWords = useMemo(() => {
    const hits = new Map<string, number>();
    for (const item of bannedWords) {
      const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = markdown.match(new RegExp(escaped, "g"));
      if (matches?.length) {
        hits.set(item.word, matches.length);
      }
    }
    return Array.from(hits.entries()).map(([word, count]) => ({ word, count }));
  }, [bannedWords, markdown]);

  const bannedWordMarkup = useMemo(
    () => buildBannedWordMarkup(markdown, bannedWords.map((item) => item.word)),
    [bannedWords, markdown],
  );
  const visualSuggestion = useMemo(() => buildVisualSuggestion(title, markdown), [title, markdown]);

  useEffect(() => {
    setKnowledgeCardItems(knowledgeCards);
    setExpandedKnowledgeCardId((current) => current ?? knowledgeCards[0]?.id ?? null);
  }, [knowledgeCards]);

  async function reloadDocumentMeta() {
    const [documentResponse, nodesResponse] = await Promise.all([
      fetch(`/api/documents/${document.id}`),
      fetch(`/api/documents/${document.id}/nodes`),
    ]);
    if (!documentResponse.ok || !nodesResponse.ok) {
      return;
    }
    const documentJson = await documentResponse.json();
    const nodesJson = await nodesResponse.json();
    if (!documentJson.success || !nodesJson.success) {
      return;
    }
    setHtmlPreview(documentJson.data.htmlContent || "");
    setStatus(documentJson.data.status);
    setStyleGenomeId(documentJson.data.styleGenomeId ?? null);
    setWechatTemplateId(documentJson.data.wechatTemplateId ?? null);
    setSnapshots(documentJson.data.snapshots);
    setNodes(
      nodesJson.data.map((node: { id: number; title: string; description: string | null; sortOrder: number; fragments: Array<{ id: number; distilledContent: string; shared?: boolean }> }) => ({
        id: node.id,
        title: node.title,
        description: node.description,
        sortOrder: node.sortOrder,
        fragments: node.fragments,
      })),
    );
    lastSavedRef.current = {
      title: documentJson.data.title,
      markdown: documentJson.data.markdownContent,
      status: documentJson.data.status,
      styleGenomeId: documentJson.data.styleGenomeId ?? null,
      wechatTemplateId: documentJson.data.wechatTemplateId ?? null,
    };
  }

  async function saveDocument(nextStatus?: string, nextMarkdown?: string, silent = false) {
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        markdownContent: nextMarkdown ?? markdown,
        status: nextStatus || status,
        styleGenomeId,
        wechatTemplateId,
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseResponseMessage(response);
      setSaveState("保存失败");
      setMessage(errorMessage);
      return false;
    }

    const json = await response.json();
    if (json.success) {
      const savedStatus = json.data.status;
      setHtmlPreview(json.data.htmlContent || "");
      setStatus(savedStatus);
      setStyleGenomeId(json.data.styleGenomeId ?? null);
      setWechatTemplateId(json.data.wechatTemplateId ?? null);
      lastSavedRef.current = {
        title,
        markdown: nextMarkdown ?? markdown,
        status: savedStatus,
        styleGenomeId: json.data.styleGenomeId ?? null,
        wechatTemplateId: json.data.wechatTemplateId ?? null,
      };
      setSaveState(silent ? "已自动保存" : "已保存");
      if (!silent) {
        setMessage("");
      }
      return true;
    }

    setSaveState("保存失败");
    return false;
  }

  useEffect(() => {
    if (generating) {
      return;
    }
    if (
      title === lastSavedRef.current.title &&
      markdown === lastSavedRef.current.markdown &&
      styleGenomeId === lastSavedRef.current.styleGenomeId &&
      wechatTemplateId === lastSavedRef.current.wechatTemplateId
    ) {
      return;
    }

    setSaveState("自动保存中...");
    const timer = window.setTimeout(() => {
      void saveDocument(undefined, undefined, true);
    }, 1200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [generating, markdown, styleGenomeId, title, wechatTemplateId]);

  async function createSnapshot() {
    const note = snapshotNote.trim() || "手动快照";
    const saved = await saveDocument();
    if (!saved) {
      return;
    }
    const response = await fetch(`/api/documents/${document.id}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setSnapshotNote("");
    setMessage("已创建快照");
    await reloadDocumentMeta();
  }

  async function restoreSnapshot(snapshotId: number) {
    const response = await fetch(`/api/documents/${document.id}/snapshot/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    await reloadDocumentMeta();
    refreshRouter(router);
  }

  async function loadDiff(snapshotId: number) {
    setLoadingDiffId(snapshotId);
    const response = await fetch(`/api/documents/${document.id}/diff?snapshotId=${snapshotId}`);
    setLoadingDiffId(null);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    const json = await response.json();
    if (json.success) {
      setDiffState({
        snapshotId: json.data.snapshot.id,
        snapshotNote: json.data.snapshot.snapshotNote,
        createdAt: json.data.snapshot.createdAt,
        summary: json.data.summary,
        lines: json.data.lines,
      });
    }
  }

  async function generate() {
    setGenerating(true);
    setMessage("");
    setStatus("generating");
    setSaveState("流式生成中...");
    setView("edit");

    const response = await fetch(`/api/documents/${document.id}/generate/stream`);
    if (!response.ok || !response.body) {
      setGenerating(false);
      setStatus(lastSavedRef.current.status);
      setMessage(await parseResponseMessage(response));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    setMarkdown("");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as { status: string; delta?: string };
        if (payload.status === "writing" && payload.delta) {
          assembled += payload.delta;
          setMarkdown(assembled);
        }
      }
    }

    const saved = await saveDocument("reviewed", assembled, false);
    setGenerating(false);
    if (saved) {
      setMessage("生成完成");
      await reloadDocumentMeta();
    }
  }

  async function publish() {
    if (!selectedConnectionId) return;
    setPublishing(true);
    setMessage("");
    const saved = await saveDocument("readyToPublish");
    if (!saved) {
      setPublishing(false);
      return;
    }
    const response = await fetch("/api/wechat/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: document.id,
        wechatConnectionId: Number(selectedConnectionId),
        templateId: wechatTemplateId,
      }),
    });
    setPublishing(false);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setStatus("published");
    router.push("/sync/logs");
    refreshRouter(router);
  }

  async function generateCoverImage() {
    setGeneratingCover(true);
    setMessage("");
    try {
      const response = await fetch("/api/images/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id, title: title.trim() || document.title }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.error || "封面图生成失败");
        return;
      }
      setCoverImage({
        imageUrl: json.data.imageUrl,
        prompt: json.data.prompt,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setMessage("封面图生成失败");
    } finally {
      setGeneratingCover(false);
    }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage("Markdown 已复制到剪贴板");
    } catch {
      setMessage("复制 Markdown 失败");
    }
  }

  async function refreshKnowledgeCard(cardId: number) {
    setRefreshingKnowledgeId(cardId);
    setMessage("");
    try {
      const response = await fetch(`/api/knowledge/cards/${cardId}/refresh`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.error || "主题档案刷新失败");
        return;
      }
      setKnowledgeCardItems((current) =>
        current.map((card) =>
          card.id === cardId
            ? {
                ...card,
                summary: json.data.summary,
                keyFacts: json.data.keyFacts,
                openQuestions: json.data.openQuestions,
                sourceFragmentIds: json.data.sourceFragmentIds,
                sourceFragments: json.data.sourceFragments,
                confidenceScore: json.data.confidenceScore,
                status: json.data.status,
                lastCompiledAt: json.data.lastCompiledAt,
              }
            : card,
        ),
      );
      setMessage("主题档案已刷新");
    } catch {
      setMessage("主题档案刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="space-y-4 border border-stone-300/40 bg-[#f4efe6] p-5">
        {isTeamShared ? (
          <div className="border border-stone-300/40 bg-white p-4 text-sm leading-7 text-stone-700">
            当前为团队共享模式。这里的碎片挂载池已经聚合 {sharedMemberCount} 个团队账号可见内容，共享碎片会带“共享”标记。
          </div>
        ) : null}
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">大纲树与碎片挂载</div>
          <div className="mt-4">
            <DocumentOutlineClient documentId={document.id} nodes={nodes} fragments={fragments} onChange={reloadDocumentMeta} />
          </div>
        </div>
        <div className="border-t border-stone-300/60 pt-4">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">快照管理</div>
          <div className="mt-3 flex gap-2">
            <input
              value={snapshotNote}
              onChange={(event) => setSnapshotNote(event.target.value)}
              placeholder="快照备注"
              className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <button onClick={createSnapshot} className="bg-cinnabar px-3 py-2 text-sm text-white">
              存档
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {snapshots.slice(0, 6).map((snapshot) => (
              <div key={snapshot.id} className="border border-stone-300 bg-white p-3">
                <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                <div className="mt-1 text-xs text-stone-500">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                <div className="mt-3 flex gap-2 text-xs">
                  <button onClick={() => loadDiff(snapshot.id)} className="border border-stone-300 px-2 py-1 text-stone-700">
                    {loadingDiffId === snapshot.id ? "对比中..." : "Diff"}
                  </button>
                  <button onClick={() => restoreSnapshot(snapshot.id)} className="border border-stone-300 px-2 py-1 text-stone-700">
                    回滚
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap gap-3">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-w-[240px] flex-1 border border-stone-300 px-4 py-3 text-sm" />
          <select
            value={styleGenomeId ?? ""}
            onChange={(event) => setStyleGenomeId(event.target.value ? Number(event.target.value) : null)}
            className="min-w-[220px] border border-stone-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">默认写作规则</option>
            {styleGenomes.map((genome) => (
              <option key={genome.id} value={genome.id}>
                {genome.name}{genome.isOfficial ? " · 官方" : genome.isPublic ? " · 公开" : " · 私有"}
              </option>
            ))}
          </select>
          <button onClick={() => void saveDocument()} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
            保存
          </button>
          <button onClick={generate} disabled={generating} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {generating ? "生成中..." : "流式生成"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setView("edit")}
              className={`border px-3 py-2 text-sm ${view === "edit" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              Markdown
            </button>
            <button
              onClick={() => setView("preview")}
              className={`border px-3 py-2 text-sm ${view === "preview" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              HTML 预览
            </button>
            <button
              onClick={() => setView("audit")}
              className={`border px-3 py-2 text-sm ${view === "audit" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-700"}`}
            >
              污染标记
            </button>
          </div>
          <div className="text-sm text-stone-500">{saveState}</div>
        </div>
        {view === "edit" ? (
          <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} className="mt-4 min-h-[560px] w-full border border-stone-300 px-4 py-4 text-sm leading-8" />
        ) : view === "preview" ? (
          <div className="mt-4 min-h-[560px] border border-stone-300 bg-[#fffdfa] p-6" dangerouslySetInnerHTML={{ __html: htmlPreview || "<p>暂无预览</p>" }} />
        ) : (
          <div className="mt-4 min-h-[560px] border border-stone-300 bg-[#fff8f7] p-6">
            <div className="mb-4 border border-[#ead3d5] bg-white px-4 py-3 text-sm leading-7 text-stone-600">
              命中死刑词会以朱砂红波浪线和删除线标出，方便你在正式保存或继续生成前先清掉机器味。
            </div>
            <div className="whitespace-pre-wrap break-words text-sm leading-8 text-ink" dangerouslySetInnerHTML={{ __html: bannedWordMarkup || "<p>暂无内容</p>" }} />
          </div>
        )}
        {message ? <div className="mt-4 text-sm text-cinnabar">{message}</div> : null}
      </section>

      <aside className="space-y-4">
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">文稿状态</div>
          <div className="mt-3 font-serifCn text-3xl text-ink">{status}</div>
        </div>

        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">相关主题档案</div>
              <div className="mt-2 text-sm leading-7 text-stone-600">优先显示与当前文稿标题、正文和已挂载碎片最相关的主题档案，减少重复总结。</div>
            </div>
            <span className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">{knowledgeCardItems.length} 张</span>
          </div>
          {knowledgeCardItems.length === 0 ? (
            <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
              当前文稿还没有命中可引用的主题档案。继续挂载碎片或编译主题档案后，这里会优先出现可复用摘要与证据。
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {knowledgeCardItems.map((card) => {
                const expanded = expandedKnowledgeCardId === card.id;
                return (
                  <article key={card.id} className="border border-stone-300 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-serifCn text-xl text-ink">{card.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                          <span className="border border-stone-300 px-2 py-1">{card.cardType}</span>
                          <span className="border border-stone-300 px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                          <span className="border border-stone-300 px-2 py-1">置信度 {Math.round(card.confidenceScore * 100)}%</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(card.status === "stale" || card.status === "conflicted") ? (
                          <button
                            onClick={() => refreshKnowledgeCard(card.id)}
                            disabled={refreshingKnowledgeId === card.id}
                            className="border border-cinnabar px-3 py-2 text-xs text-cinnabar disabled:opacity-60"
                          >
                            {refreshingKnowledgeId === card.id ? "刷新中..." : "刷新档案"}
                          </button>
                        ) : null}
                        <button
                          onClick={() => setExpandedKnowledgeCardId(expanded ? null : card.id)}
                          className="border border-stone-300 px-3 py-2 text-xs text-stone-700"
                        >
                          {expanded ? "收起证据" : "查看证据"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-stone-700">{card.summary || "暂无摘要"}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span>命中文稿挂载碎片 {card.matchedFragmentCount} 条</span>
                      <span>来源碎片 {card.sourceFragmentIds.length} 条</span>
                      <span>相关度 {card.relevanceScore}</span>
                      <span>{card.lastCompiledAt ? `最近编译 ${new Date(card.lastCompiledAt).toLocaleString("zh-CN")}` : "尚未完成编译"}</span>
                    </div>
                    {card.status === "conflicted" ? (
                      <div className="mt-3 border border-[#d8b0b2] bg-[#fff3f3] px-3 py-3 text-sm leading-7 text-[#8f3136]">
                        这张档案出现了相反信号，当前只能作为待核实线索使用，建议先补充来源或立即刷新。
                      </div>
                    ) : null}
                    {card.status === "stale" ? (
                      <div className="mt-3 border border-[#dfd2b0] bg-[#fff8e8] px-3 py-3 text-sm leading-7 text-[#7d6430]">
                        这张档案超过时间阈值未更新，适合在下笔前先刷新，避免沿用过期判断。
                      </div>
                    ) : null}
                    {card.keyFacts.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.keyFacts.slice(0, 3).map((fact, index) => (
                          <span key={`${card.id}-fact-${index}`} className="border border-[#dcc8a6] bg-[#fff8eb] px-3 py-2 text-xs leading-6 text-stone-700">
                            {fact}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {expanded ? (
                      <div className="mt-4 space-y-4 border-t border-stone-200 pt-4">
                        {card.openQuestions.length > 0 ? (
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">待确认问题</div>
                            <div className="mt-2 space-y-2">
                              {card.openQuestions.slice(0, 2).map((question, index) => (
                                <div key={`${card.id}-question-${index}`} className="text-sm leading-7 text-stone-600">
                                  {question}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-stone-500">来源碎片摘要</div>
                          <div className="mt-2 space-y-2">
                            {card.sourceFragments.map((fragment) => (
                              <div key={fragment.id} className="border border-stone-200 bg-[#fcfbf7] px-3 py-3 text-sm leading-7 text-stone-700">
                                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-500">Fragment #{fragment.id}</div>
                                {fragment.distilledContent}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">即时禁词命中</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {detectedBannedWords.length === 0 ? (
              <span className="text-sm text-stone-600">当前文稿未命中专属死刑词。</span>
            ) : (
              detectedBannedWords.map((item) => (
                <span key={item.word} className="border border-cinnabar px-3 py-1 text-xs text-cinnabar">
                  {item.word} × {item.count}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="border border-dashed border-[#d0cfcb] bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">视觉联想引擎</div>
          <div className="mt-3 text-sm leading-7 text-stone-700">{visualSuggestion}</div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={generateCoverImage}
              disabled={!canGenerateCoverImage || generatingCover}
              className={`px-4 py-3 text-sm ${canGenerateCoverImage ? "bg-cinnabar text-white" : "border border-stone-300 bg-white text-stone-400"}`}
            >
              {canGenerateCoverImage ? (generatingCover ? "封面图生成中..." : "生成 16:9 封面图") : "当前套餐仅提供文本配图建议"}
            </button>
          </div>
          {coverImage ? (
            <div className="mt-4 space-y-3">
              <img src={coverImage.imageUrl} alt="AI 生成封面图" className="aspect-[16/9] w-full border border-stone-300 object-cover" />
              <div className="border border-stone-300 bg-white px-4 py-3 text-xs leading-6 text-stone-600">
                <div className="font-medium text-stone-800">最近一次封面图 Prompt</div>
                <div className="mt-2">{coverImage.prompt}</div>
                <div className="mt-2 text-stone-500">{new Date(coverImage.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">导出</div>
          <div className="mt-3 grid gap-2">
            <button onClick={copyMarkdown} className="border border-stone-300 bg-white px-4 py-3 text-left text-sm text-stone-700">
              复制纯净 Markdown
            </button>
            <Link href={`/api/documents/${document.id}/export?format=markdown`} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
              导出 Markdown
            </Link>
            <Link href={`/api/documents/${document.id}/export?format=html`} className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
              导出 HTML
            </Link>
            <Link
              href={`/api/documents/${document.id}/export?format=pdf`}
              className={`border px-4 py-3 text-sm ${canExportPdf ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-400"}`}
            >
              {canExportPdf ? "导出 PDF" : "PDF 仅藏锋 / 团队可用"}
            </Link>
          </div>
        </div>

        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发布到公众号</div>
          <select value={wechatTemplateId ?? ""} onChange={(event) => setWechatTemplateId(event.target.value || null)} className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm">
            <option value="">选择微信模板（默认）</option>
            {templates.map((template) => (
              <option key={`${template.id}-${template.version}`} value={template.id}>
                {template.name} · {template.version}
              </option>
            ))}
          </select>
          <select value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm">
            <option value="">选择公众号连接</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.accountName || `连接 ${connection.id}`}</option>
            ))}
          </select>
          <button onClick={publish} disabled={publishing} className="mt-4 w-full bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {publishing ? "推送中..." : "推送到微信草稿箱"}
          </button>
        </div>

        <div className="border border-stone-300/40 bg-[#1a1a1a] p-5 text-stone-100">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">Diff 结果</div>
          {diffState ? (
            <div className="mt-4 space-y-3">
              <div className="text-sm text-stone-300">
                对比快照：{diffState.snapshotNote || "未命名快照"} · {new Date(diffState.createdAt).toLocaleString("zh-CN")}
              </div>
              <div className="text-xs text-stone-500">
                +{diffState.summary.added} / -{diffState.summary.removed} / ={diffState.summary.unchanged}
              </div>
              <div className="max-h-[260px] space-y-1 overflow-y-auto border border-stone-800 bg-[#101011] p-3 text-xs leading-6">
                {diffState.lines.map((line, index) => (
                  <div
                    key={`${line.type}-${index}`}
                    className={
                      line.type === "added"
                        ? "bg-emerald-950/50 px-2 text-emerald-300"
                        : line.type === "removed"
                          ? "bg-red-950/40 px-2 text-red-300"
                          : "px-2 text-stone-400"
                    }
                  >
                    {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "} {line.content || " "}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm leading-7 text-stone-400">从左侧快照列表选择一个版本，即可查看当前文稿与历史快照的逐行 Diff。</div>
          )}
        </div>
      </aside>
    </div>
  );
}
