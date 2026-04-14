"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { ImageAuthoringStyleContext } from "@/lib/image-authoring-context";
import { buildNodeVisualSuggestion, buildVisualSuggestion } from "@/lib/image-prompting";
import { collectLanguageGuardHits, type LanguageGuardRule } from "@/lib/language-guard-core";
import { summarizeTemplateRenderConfig } from "@/lib/template-rendering";
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

async function parseResponsePayload(response: Response) {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as {
      message?: string;
      error?: string;
      data?: Record<string, unknown>;
    };
    return {
      message: json.message || json.error || text || "请求失败",
      data: json.data,
    };
  } catch {
    return {
      message: text || "请求失败",
      data: null as Record<string, unknown> | null,
    };
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
  const [urlCaptureIssue, setUrlCaptureIssue] = useState<null | {
    title: string;
    url: string;
    degradedReason: string;
    retryRecommended: boolean;
  }>(null);
  const [recentUrlCaptureIssues, setRecentUrlCaptureIssues] = useState<ExternalFetchIssueRecord[]>([]);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const urlCaptureRetryableCount = recentUrlCaptureIssues.filter((item) => item.retryRecommended && !item.resolvedAt).length;
  const urlCaptureRecoveredCount = recentUrlCaptureIssues.filter((item) => item.recoveryCount > 0).reduce((sum, item) => sum + item.recoveryCount, 0);

  useEffect(() => {
    setRecentUrlCaptureIssues(readExternalFetchIssues(CAPTURE_FETCH_ISSUES_STORAGE_KEY, "capture-url", null));
  }, []);

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

  async function submitCapture(input: {
    mode: "manual" | "url" | "screenshot";
    title: string;
    content: string;
    imageDataUrl?: string | null;
    resetForm?: boolean;
  }) {
    if (input.mode === "screenshot" && !input.imageDataUrl) {
      setMessage("截图模式必须上传真实图片文件");
      return;
    }
    const submittedTitle = input.title.trim();
    const submittedContent = input.content.trim();
    const endpoint =
      input.mode === "url"
        ? "/api/capture/url"
        : input.mode === "screenshot"
          ? "/api/capture/screenshot"
          : "/api/capture/manual";
    setLoading(true);
    setMessage("");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        input.mode === "url"
          ? { title: submittedTitle, url: submittedContent }
          : input.mode === "screenshot"
            ? { title: submittedTitle, note: submittedContent, imageDataUrl: input.imageDataUrl }
            : { title: submittedTitle, content: submittedContent },
      ),
    });
    setLoading(false);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          data?: {
            degradedReason?: string | null;
            retryRecommended?: boolean;
          };
        }
      | null;
    if (input.resetForm) {
      setTitle("");
      setContent("");
      setImageDataUrl(null);
      setScreenshotFileName("");
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
    }
    if (input.mode === "url" && payload?.data?.degradedReason) {
      const nextIssues = prependExternalFetchIssue(recentUrlCaptureIssues, {
        documentId: null,
        context: "capture-url",
        title: submittedTitle || null,
        url: submittedContent,
        degradedReason: payload.data.degradedReason,
        retryRecommended: Boolean(payload.data.retryRecommended),
      });
      setRecentUrlCaptureIssues(nextIssues);
      writeExternalFetchIssues(CAPTURE_FETCH_ISSUES_STORAGE_KEY, nextIssues);
      setUrlCaptureIssue({
        title: submittedTitle,
        url: submittedContent,
        degradedReason: payload.data.degradedReason,
        retryRecommended: Boolean(payload.data.retryRecommended),
      });
      setMessage(
        payload.data.retryRecommended
          ? `已写入碎片库，但本次抓取存在降级：${payload.data.degradedReason}。建议稍后重试或补充原文。`
          : `已写入碎片库，但本次抓取存在降级：${payload.data.degradedReason}`,
      );
    } else {
      if (input.mode === "url") {
        const recovered = markExternalFetchIssueRecovered(recentUrlCaptureIssues, {
          context: "capture-url",
          url: submittedContent,
        });
        if (recovered.recovered) {
          setRecentUrlCaptureIssues(recovered.issues);
          writeExternalFetchIssues(CAPTURE_FETCH_ISSUES_STORAGE_KEY, recovered.issues);
        }
        setUrlCaptureIssue(null);
      }
      if (input.mode === "screenshot") {
        setMessage("截图已写入碎片库，等待视觉理解任务补全。");
      } else {
        setMessage("已写入碎片库");
      }
    }
    refreshRouter(router);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitCapture({
      mode,
      title,
      content,
      imageDataUrl,
      resetForm: true,
    });
  }

  async function retryUrlCapture() {
    if (!urlCaptureIssue?.retryRecommended) {
      return;
    }
    await submitCapture({
      mode: "url",
      title: urlCaptureIssue.title,
      content: urlCaptureIssue.url,
      resetForm: false,
    });
  }

  function dismissRecentUrlCaptureIssue(issueId: string) {
    const nextIssues = removeExternalFetchIssue(recentUrlCaptureIssues, issueId);
    setRecentUrlCaptureIssues(nextIssues);
    writeExternalFetchIssues(CAPTURE_FETCH_ISSUES_STORAGE_KEY, nextIssues);
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
      {urlCaptureIssue ? (
        <div className="space-y-3 border border-[#dfd2b0] bg-[#fff8e8] px-4 py-4 text-sm leading-7 text-[#7d6430]">
          <div className="text-xs uppercase tracking-[0.18em] text-[#7d6430]">URL 外采降级</div>
          <div>
            最近一次链接抓取已降级写入：{urlCaptureIssue.degradedReason}
            {urlCaptureIssue.title ? ` 当前标题为「${urlCaptureIssue.title}」。` : ""}
          </div>
          <div className="break-all text-xs leading-6 text-stone-600">{urlCaptureIssue.url}</div>
          <div className="flex flex-wrap gap-2">
            {urlCaptureIssue.retryRecommended ? (
              <button
                type="button"
                onClick={retryUrlCapture}
                disabled={loading}
                className="border border-cinnabar bg-white px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
              >
                {loading ? "重试中..." : "重试链接抓取"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMode("url");
                setTitle(urlCaptureIssue.title);
                setContent(urlCaptureIssue.url);
              }}
              className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
            >
              回填到表单
            </button>
            <button
              type="button"
              onClick={() => setUrlCaptureIssue(null)}
              className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
            >
              清除提示
            </button>
          </div>
        </div>
      ) : null}
      {recentUrlCaptureIssues.length > 0 ? (
        <div className="space-y-3 border border-stone-300/60 bg-[#faf7f0] px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近外采异常记录</div>
          <div className="text-xs leading-6 text-stone-500">
            来源分类：URL 采集 · 共 {recentUrlCaptureIssues.length} 条 · 待重试 {urlCaptureRetryableCount} 条 · 最近恢复成功 {urlCaptureRecoveredCount} 次
          </div>
          {recentUrlCaptureIssues.map((issue) => (
            <div key={issue.id} className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium text-ink">{issue.title || "URL 采集异常"}</div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span>{new Date(issue.createdAt).toLocaleString("zh-CN")}</span>
                  <span className={`border px-2 py-1 ${issue.resolvedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#dfd2b0] bg-[#fff8e8] text-[#7d6430]"}`}>
                    {issue.resolvedAt ? "已恢复" : "待处理"}
                  </span>
                </div>
              </div>
              <div className="mt-2">{issue.degradedReason}</div>
              <div className="mt-2 break-all text-xs leading-6 text-stone-500">{issue.url}</div>
              {issue.resolvedAt ? (
                <div className="mt-2 text-xs leading-6 text-emerald-700">
                  最近恢复：{new Date(issue.resolvedAt).toLocaleString("zh-CN")} · 成功恢复 {issue.recoveryCount} 次
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {issue.retryRecommended ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUrlCaptureIssue({
                        title: issue.title || "",
                        url: issue.url,
                        degradedReason: issue.degradedReason,
                        retryRecommended: issue.retryRecommended,
                      });
                      void submitCapture({
                        mode: "url",
                        title: issue.title || "",
                        content: issue.url,
                        resetForm: false,
                      });
                    }}
                    disabled={loading}
                    className="border border-cinnabar bg-white px-3 py-2 text-sm text-cinnabar disabled:opacity-60"
                  >
                    {loading ? "重试中..." : "再次重试"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setMode("url");
                    setTitle(issue.title || "");
                    setContent(issue.url);
                  }}
                  className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                >
                  回填表单
                </button>
                <button
                  type="button"
                  onClick={() => dismissRecentUrlCaptureIssue(issue.id)}
                  className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                >
                  删除记录
                </button>
              </div>
            </div>
          ))}
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
  rules,
}: {
  rules: Array<{
    id: string;
    scope: "system" | "user";
    source: string;
    ruleKind: string;
    matchMode: string;
    patternText: string;
    rewriteHint: string | null;
    isEnabled: boolean;
  }>;
}) {
  const router = useRouter();
  const [patternText, setPatternText] = useState("");
  const [ruleKind, setRuleKind] = useState<"token" | "pattern">("token");
  const [rewriteHint, setRewriteHint] = useState("");
  const [message, setMessage] = useState("");

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!patternText.trim()) return;
    setMessage("");
    const response = await fetch("/api/language-guard-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ruleKind,
        matchMode: ruleKind === "pattern" ? "template" : "contains",
        patternText,
        rewriteHint,
      }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setPatternText("");
    setRewriteHint("");
    setRuleKind("token");
    refreshRouter(router);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/language-guard-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
    refreshRouter(router);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)_120px]">
        <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value === "pattern" ? "pattern" : "token")} className="border border-stone-300 px-4 py-3 text-sm">
          <option value="token">词语规则</option>
          <option value="pattern">句式规则</option>
        </select>
        <input
          value={patternText}
          onChange={(event) => setPatternText(event.target.value)}
          placeholder={ruleKind === "pattern" ? "例如：不是...而是..." : "例如：不可否认"}
          className="flex-1 border border-stone-300 px-4 py-3 text-sm"
        />
        <input value={rewriteHint} onChange={(event) => setRewriteHint(event.target.value)} placeholder="可选：改写提示" className="flex-1 border border-stone-300 px-4 py-3 text-sm" />
        <button className="bg-cinnabar px-5 py-3 text-sm text-white">添加</button>
      </form>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {rules.map((item) => (
          <div key={item.id} className={`border px-4 py-3 text-sm ${item.scope === "system" ? "border-stone-300 bg-[#faf7f0] text-stone-700" : "border-cinnabar text-cinnabar"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em]">
                {item.scope === "system" ? "系统默认" : item.ruleKind === "pattern" ? "我的句式规则" : "我的词语规则"}
              </div>
              {item.scope === "user" ? (
                <button onClick={() => handleDelete(item.id)} className="text-xs underline">
                  删除
                </button>
              ) : null}
            </div>
            <div className={`mt-2 ${item.scope === "user" ? "line-through" : ""}`}>{item.patternText}</div>
            {item.rewriteHint ? <div className="mt-2 text-xs leading-6 opacity-80">{item.rewriteHint}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WechatConnectionsManager({
  connections,
  canManage,
  planName,
}: {
  connections: Array<{
    id: number;
    accountName: string | null;
    originalId: string | null;
    status: string;
    isDefault: boolean;
    accessTokenExpiresAt: string | null;
    updatedAt: string;
  }>;
  canManage: boolean;
  planName: string;
}) {
  const router = useRouter();
  const [accountName, setAccountName] = useState("");
  const [originalId, setOriginalId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [switchingDefaultId, setSwitchingDefaultId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const defaultConnection = connections.find((connection) => connection.isDefault) ?? null;

  function resetForm() {
    setAccountName("");
    setOriginalId("");
    setAppId("");
    setAppSecret("");
    setIsDefault(true);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      setMessage(`${planName}套餐暂不支持绑定微信公众号。升级到 Pro 或更高套餐后，才可新增连接并推送到微信草稿箱。`);
      return;
    }
    setLoading(true);
    setMessage("");
    const response = await fetch(editingId ? `/api/wechat/connections/${editingId}` : "/api/wechat/connections", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName,
        originalId,
        appId: appId || undefined,
        appSecret: appSecret || undefined,
        isDefault,
      }),
    });
    setLoading(false);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    resetForm();
    setMessage(editingId ? "公众号连接已更新" : "公众号连接已创建");
    refreshRouter(router);
  }

  async function handleDelete(id: number) {
    if (!canManage) {
      setMessage(`${planName}套餐暂不支持管理微信公众号连接。`);
      return;
    }
    await fetch(`/api/wechat/connections/${id}`, { method: "DELETE" });
    refreshRouter(router);
  }

  function handleEdit(connection: (typeof connections)[number]) {
    if (!canManage) {
      setMessage(`${planName}套餐暂不支持编辑微信公众号连接。`);
      return;
    }
    setEditingId(connection.id);
    setAccountName(connection.accountName || "");
    setOriginalId(connection.originalId || "");
    setAppId("");
    setAppSecret("");
    setIsDefault(connection.isDefault);
    setMessage("如只修改名称、原始 ID 或默认状态，可直接保存；只有轮换密钥时才需要重新填写 AppID / AppSecret。");
  }

  async function handleSetDefault(connection: (typeof connections)[number]) {
    if (!canManage) {
      setMessage(`${planName}套餐暂不支持切换默认公众号。`);
      return;
    }
    setSwitchingDefaultId(connection.id);
    setMessage("");
    const response = await fetch(`/api/wechat/connections/${connection.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountName: connection.accountName,
        originalId: connection.originalId,
        isDefault: true,
      }),
    });
    setSwitchingDefaultId(null);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setMessage(`已将 ${connection.accountName || `连接 ${connection.id}`} 设为默认公众号`);
    refreshRouter(router);
  }

  return (
    <div className="space-y-6">
      {!canManage ? (
        <div className="border border-dashed border-[#d8b0b2] bg-[#fff3f3] px-4 py-4 text-sm leading-7 text-[#8f3136]">
          {planName}套餐当前不开放微信公众号授权。你仍可继续写作、导出 Markdown，并在升级到 Pro 或更高套餐后解锁公众号连接和草稿箱推送。
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">授权说明</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
            <div>这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取 access token。</div>
            <div>编辑器发布区默认优先使用“默认连接”，也可以临时切换到其他已授权公众号。</div>
            <div>如果你只是改名称、原始 ID 或默认状态，不必重复填写密钥。</div>
          </div>
        </div>
        <div className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前默认连接</div>
          {defaultConnection ? (
            <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
              <div className="font-serifCn text-2xl text-ink">{defaultConnection.accountName || "未命名公众号"}</div>
              <div>原始 ID：{defaultConnection.originalId || "未填写"}</div>
              <div>状态：{defaultConnection.status}</div>
              <div>{defaultConnection.accessTokenExpiresAt ? `Token 到期：${new Date(defaultConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录 Token 到期时间"}</div>
            </div>
          ) : (
            <div className="mt-3 text-sm leading-7 text-stone-600">当前还没有默认公众号。新增连接后可直接设为默认。</div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 border border-stone-300/40 bg-white p-5 shadow-ink">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{editingId ? "编辑公众号连接" : "新增公众号连接"}</div>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="border border-stone-300 px-3 py-2 text-sm text-stone-700"
            >
              取消编辑
            </button>
          ) : null}
        </div>
        <input value={accountName} disabled={!canManage} onChange={(event) => setAccountName(event.target.value)} placeholder="公众号名称" className="border border-stone-300 px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <input value={originalId} disabled={!canManage} onChange={(event) => setOriginalId(event.target.value)} placeholder="原始 ID" className="border border-stone-300 px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <input value={appId} disabled={!canManage} onChange={(event) => setAppId(event.target.value)} placeholder="AppID" className="border border-stone-300 px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <input value={appSecret} disabled={!canManage} onChange={(event) => setAppSecret(event.target.value)} placeholder={editingId ? "AppSecret（仅轮换密钥时填写）" : "AppSecret"} type="password" className="border border-stone-300 px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <label className="flex items-center gap-3 border border-stone-300 px-4 py-3 text-sm text-stone-700">
          <input type="checkbox" checked={isDefault} disabled={!canManage} onChange={(event) => setIsDefault(event.target.checked)} />
          保存后设为默认公众号
        </label>
        <button disabled={loading || !canManage} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
          {!canManage ? "当前套餐不可绑定公众号" : loading ? (editingId ? "更新中..." : "校验中...") : editingId ? "保存公众号连接" : "添加公众号连接"}
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
              <div className="mt-1 text-xs text-stone-500">
                原始 ID：{connection.originalId || "未填写"} · 更新于 {new Date(connection.updatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!connection.isDefault ? (
                <button
                  onClick={() => handleSetDefault(connection)}
                  disabled={switchingDefaultId === connection.id || !canManage}
                  className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                >
                  {switchingDefaultId === connection.id ? "切换中..." : "设为默认"}
                </button>
              ) : null}
              <button onClick={() => handleEdit(connection)} disabled={!canManage} className="border border-stone-300 px-4 py-2 text-sm text-stone-700 disabled:text-stone-400">
                编辑
              </button>
              <button onClick={() => handleDelete(connection.id)} disabled={!canManage} className="border border-stone-300 px-4 py-2 text-sm text-stone-700 disabled:text-stone-400">
                删除
              </button>
            </div>
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
  userId: number;
  ownerUsername: string | null;
  shared: boolean;
  workspaceScope: string;
  cardType: string;
  title: string;
  summary: string | null;
  keyFacts: string[];
  openQuestions: string[];
  conflictFlags: string[];
  sourceFragmentIds: number[];
  relatedCardIds: number[];
  relatedCards: Array<{ id: number; title: string; cardType: string; status: string; confidenceScore: number; summary: string | null; shared: boolean; ownerUsername: string | null; linkType: string }>;
  sourceFragments: Array<{ id: number; distilledContent: string }>;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  relevanceScore: number;
  matchedFragmentCount: number;
};

type RecentSyncLogItem = {
  id: number;
  connectionName: string | null;
  mediaId: string | null;
  status: string;
  failureReason: string | null;
  retryCount: number;
  createdAt: string;
  requestSummary: string | Record<string, unknown> | null;
  responseSummary: string | Record<string, unknown> | null;
};

type StageArtifactItem = {
  stageCode: string;
  title: string;
  status: "ready" | "failed";
  summary: string | null;
  payload: Record<string, unknown> | null;
  model: string | null;
  provider: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type DocumentFragmentItem = {
  id: number;
  title?: string | null;
  distilledContent: string;
  sourceType?: string;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string;
  shared?: boolean;
};

type OutlineMaterialNodeItem = {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: DocumentFragmentItem[];
};

type OutlineMaterialsState = {
  supplementalViewpoints: string[];
  nodes: OutlineMaterialNodeItem[];
};

type HistoryReferenceSelectionItem = {
  referencedDocumentId: number;
  title: string;
  relationReason: string | null;
  bridgeSentence: string | null;
  sortOrder?: number;
};

type HistoryReferenceSuggestionItem = HistoryReferenceSelectionItem & {
  score?: number;
};

type AudienceSelectionDraft = {
  selectedReaderLabel: string;
  selectedLanguageGuidance: string;
  selectedBackgroundAwareness: string;
  selectedReadabilityLevel: string;
  selectedCallToAction: string;
};

type OutlineSelectionDraft = {
  selectedTitle: string;
  selectedTitleStyle: string;
  selectedOpeningHook: string;
  selectedTargetEmotion: string;
  selectedEndingStrategy: string;
};

type FactCheckClaimDecision = {
  claim: string;
  action: "keep" | "source" | "soften" | "remove" | "mark_opinion";
  note: string;
};

type FactCheckSelectionDraft = {
  claimDecisions: FactCheckClaimDecision[];
};

type CoverImageCandidateItem = {
  id: number;
  variantLabel: string;
  imageUrl: string;
  prompt: string;
  isSelected: boolean;
  createdAt: string;
};

type DocumentImagePromptItem = {
  id: number;
  documentNodeId: number | null;
  assetType: string;
  title: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
};

type WechatConnectionItem = {
  id: number;
  accountName: string | null;
  originalId?: string | null;
  status: string;
  isDefault: boolean;
  accessTokenExpiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PublishPreviewState = {
  title: string;
  templateId: string | null;
  templateName: string | null;
  templateVersion: string | null;
  templateOwnerLabel: string | null;
  templateSourceLabel: string | null;
  templateSummary: string[];
  finalHtml: string;
  finalHtmlHash: string | null;
  savedHtmlHash: string | null;
  isConsistentWithSavedHtml: boolean;
  mismatchWarnings: string[];
  publishGuard: {
    canPublish: boolean;
    blockers: string[];
    warnings: string[];
    checks: Array<{ key: string; label: string; status: "passed" | "warning" | "blocked"; detail: string }>;
  };
  generatedAt: string;
};

type PendingPublishIntent = {
  documentId: number;
  createdAt: string;
  templateId: string | null;
};

type ExternalFetchIssueRecord = {
  id: string;
  documentId: number | null;
  context: "capture-url" | "fact-check-evidence";
  title: string | null;
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
  createdAt: string;
  resolvedAt: string | null;
  recoveryCount: number;
};

const PENDING_PUBLISH_INTENT_STORAGE_KEY = "huoziwriter.pendingPublishIntent";
const CAPTURE_FETCH_ISSUES_STORAGE_KEY = "huoziwriter.captureFetchIssues";
const FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX = "huoziwriter.factCheckFetchIssues";

const GENERATABLE_STAGE_ACTIONS: Record<string, { label: string; helper: string }> = {
  audienceAnalysis: {
    label: "生成受众分析",
    helper: "根据标题、人设、素材和当前正文，给出读者分层与表达建议。",
  },
  outlinePlanning: {
    label: "生成大纲规划",
    helper: "输出核心观点、段落推进、证据提示与结尾收束策略。",
  },
  deepWriting: {
    label: "生成写作执行卡",
    helper: "把已确认的大纲、受众、素材和文风约束整理成一张可直接驱动正文生成的执行卡。",
  },
  factCheck: {
    label: "执行事实核查",
    helper: "标记需要补来源、改判断语气或重新核验的数据与案例。",
  },
  prosePolish: {
    label: "执行文笔润色",
    helper: "给出节奏、表达、金句与首段改写建议。",
  },
};

function getPayloadStringArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function getPayloadRecordArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function getPayloadRecord(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getAudienceSelectionDraft(payload: Record<string, unknown> | null | undefined): AudienceSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedReaderLabel: String(selection?.selectedReaderLabel || "").trim(),
    selectedLanguageGuidance: String(selection?.selectedLanguageGuidance || "").trim(),
    selectedBackgroundAwareness: String(selection?.selectedBackgroundAwareness || "").trim(),
    selectedReadabilityLevel: String(selection?.selectedReadabilityLevel || "").trim(),
    selectedCallToAction: String(selection?.selectedCallToAction || "").trim(),
  };
}

function hydrateAudienceSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: AudienceSelectionDraft,
): AudienceSelectionDraft {
  const readerSegments = getPayloadRecordArray(payload, "readerSegments");
  const languageGuidance = getPayloadStringArray(payload, "languageGuidance");
  const backgroundAwarenessOptions = getPayloadStringArray(payload, "backgroundAwarenessOptions");
  const readabilityOptions = getPayloadStringArray(payload, "readabilityOptions");
  const recommendedCallToAction = String(payload?.recommendedCallToAction || "").trim();

  return {
    selectedReaderLabel: draft.selectedReaderLabel || String(readerSegments[0]?.label || "").trim(),
    selectedLanguageGuidance: draft.selectedLanguageGuidance || languageGuidance[0] || "",
    selectedBackgroundAwareness: draft.selectedBackgroundAwareness || backgroundAwarenessOptions[0] || "",
    selectedReadabilityLevel: draft.selectedReadabilityLevel || readabilityOptions[0] || "",
    selectedCallToAction: draft.selectedCallToAction || recommendedCallToAction,
  };
}

function getOutlineSelectionDraft(payload: Record<string, unknown> | null | undefined): OutlineSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedTitle: String(selection?.selectedTitle || "").trim(),
    selectedTitleStyle: String(selection?.selectedTitleStyle || "").trim(),
    selectedOpeningHook: String(selection?.selectedOpeningHook || "").trim(),
    selectedTargetEmotion: String(selection?.selectedTargetEmotion || "").trim(),
    selectedEndingStrategy: String(selection?.selectedEndingStrategy || "").trim(),
  };
}

function hydrateOutlineSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: OutlineSelectionDraft,
): OutlineSelectionDraft {
  const titleOptions = getPayloadRecordArray(payload, "titleOptions");
  const workingTitle = String(payload?.workingTitle || "").trim();
  const selectedTitleOption = titleOptions.find(
    (item) => String(item.title || "").trim() === draft.selectedTitle,
  );
  const openingHook = String(payload?.openingHook || "").trim();
  const openingHookOptions = getPayloadStringArray(payload, "openingHookOptions");
  const targetEmotion = String(payload?.targetEmotion || "").trim();
  const targetEmotionOptions = getPayloadStringArray(payload, "targetEmotionOptions");
  const endingStrategy = String(payload?.endingStrategy || "").trim();
  const endingStrategyOptions = getPayloadStringArray(payload, "endingStrategyOptions");

  return {
    selectedTitle: draft.selectedTitle || String(titleOptions[0]?.title || "").trim() || workingTitle,
    selectedTitleStyle:
      draft.selectedTitleStyle
      || String(selectedTitleOption?.styleLabel || "").trim()
      || String(titleOptions[0]?.styleLabel || "").trim(),
    selectedOpeningHook: draft.selectedOpeningHook || openingHook || openingHookOptions[0] || "",
    selectedTargetEmotion: draft.selectedTargetEmotion || targetEmotion || targetEmotionOptions[0] || "",
    selectedEndingStrategy: draft.selectedEndingStrategy || endingStrategy || endingStrategyOptions[0] || "",
  };
}

function getDefaultFactCheckAction(status: string): FactCheckClaimDecision["action"] {
  if (status === "needs_source") return "source";
  if (status === "risky") return "soften";
  if (status === "opinion") return "mark_opinion";
  return "keep";
}

function getFactCheckSelectionDraft(payload: Record<string, unknown> | null | undefined): FactCheckSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  const existingDecisions = Array.isArray(selection?.claimDecisions)
    ? selection.claimDecisions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          claim: String(item.claim || "").trim(),
          action: String(item.action || "").trim() as FactCheckClaimDecision["action"],
          note: String(item.note || "").trim(),
        }))
        .filter((item) => item.claim)
    : [];
  const existingMap = new Map(existingDecisions.map((item) => [item.claim, item]));
  const checks = getPayloadRecordArray(payload, "checks");
  const claimDecisions = checks
    .map((item) => {
      const claim = String(item.claim || "").trim();
      if (!claim) {
        return null;
      }
      const status = String(item.status || "").trim();
      const existing = existingMap.get(claim);
      return {
        claim,
        action: existing?.action || getDefaultFactCheckAction(status),
        note: existing?.note || "",
      } satisfies FactCheckClaimDecision;
    })
    .filter(Boolean) as FactCheckClaimDecision[];
  return { claimDecisions };
}

function getFactCheckDecision(
  draft: FactCheckSelectionDraft,
  claim: string,
  status: string,
): FactCheckClaimDecision {
  const normalizedClaim = String(claim || "").trim();
  return (
    draft.claimDecisions.find((item) => item.claim === normalizedClaim) ?? {
      claim: normalizedClaim,
      action: getDefaultFactCheckAction(status),
      note: "",
    }
  );
}

function getFactCheckActionOptions(status: string) {
  if (status === "needs_source") {
    return [
      { value: "source", label: "补来源锚点" },
      { value: "soften", label: "改判断语气" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "risky") {
    return [
      { value: "soften", label: "保守改写" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "opinion") {
    return [
      { value: "mark_opinion", label: "明确为观点" },
      { value: "keep", label: "保持原样" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  return [
    { value: "keep", label: "保持原样" },
    { value: "source", label: "补来源锚点" },
  ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
}

function formatFactCheckActionLabel(action: string) {
  if (action === "source") return "补来源锚点";
  if (action === "soften") return "改判断语气";
  if (action === "remove") return "删除该表述";
  if (action === "mark_opinion") return "明确为观点";
  return "保持原样";
}

function readPendingPublishIntent(documentId: number): PendingPublishIntent | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PendingPublishIntent | null;
    if (!parsed || parsed.documentId !== documentId) {
      return null;
    }
    return {
      documentId: parsed.documentId,
      createdAt: String(parsed.createdAt || new Date().toISOString()),
      templateId: parsed.templateId ? String(parsed.templateId) : null,
    };
  } catch {
    return null;
  }
}

function buildFactCheckFetchIssuesStorageKey(documentId: number) {
  return `${FACT_CHECK_FETCH_ISSUES_STORAGE_KEY_PREFIX}.${documentId}`;
}

function normalizeExternalFetchIssueRecord(
  value: unknown,
  expectedContext: ExternalFetchIssueRecord["context"],
  documentId?: number | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const url = String(item.url || "").trim();
  const degradedReason = String(item.degradedReason || "").trim();
  if (!url || !degradedReason) {
    return null;
  }
  return {
    id: String(item.id || `${expectedContext}-${url}-${item.createdAt || ""}`),
    documentId:
      documentId === undefined
        ? item.documentId == null
          ? null
          : Number.isInteger(Number(item.documentId))
            ? Number(item.documentId)
            : null
        : documentId,
    context: expectedContext,
    title: item.title ? String(item.title).trim() : null,
    url,
    degradedReason,
    retryRecommended: Boolean(item.retryRecommended),
    createdAt: String(item.createdAt || new Date().toISOString()),
    resolvedAt: item.resolvedAt ? String(item.resolvedAt) : null,
    recoveryCount: Math.max(0, Number(item.recoveryCount || 0) || 0),
  } satisfies ExternalFetchIssueRecord;
}

function readExternalFetchIssues(
  storageKey: string,
  expectedContext: ExternalFetchIssueRecord["context"],
  documentId?: number | null,
) {
  if (typeof window === "undefined") {
    return [] as ExternalFetchIssueRecord[];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [] as ExternalFetchIssueRecord[];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as ExternalFetchIssueRecord[];
    }
    return parsed
      .map((item) => normalizeExternalFetchIssueRecord(item, expectedContext, documentId))
      .filter((item): item is ExternalFetchIssueRecord => Boolean(item))
      .slice(0, 8);
  } catch {
    return [] as ExternalFetchIssueRecord[];
  }
}

function writeExternalFetchIssues(storageKey: string, issues: ExternalFetchIssueRecord[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(issues.slice(0, 8)));
}

function prependExternalFetchIssue(
  current: ExternalFetchIssueRecord[],
  next: Omit<ExternalFetchIssueRecord, "id" | "createdAt" | "resolvedAt" | "recoveryCount">,
) {
  const createdAt = new Date().toISOString();
  const issue = {
    ...next,
    id: `${next.context}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    resolvedAt: null,
    recoveryCount: 0,
  } satisfies ExternalFetchIssueRecord;
  return [
    issue,
    ...current.filter((item) => !(item.context === issue.context && item.url === issue.url && item.degradedReason === issue.degradedReason)),
  ].slice(0, 8);
}

function removeExternalFetchIssue(current: ExternalFetchIssueRecord[], issueId: string) {
  return current.filter((item) => item.id !== issueId);
}

function markExternalFetchIssueRecovered(
  current: ExternalFetchIssueRecord[],
  input: { context: ExternalFetchIssueRecord["context"]; url: string },
) {
  let recovered = false;
  const next = current.map((item) => {
    if (recovered || item.context !== input.context || item.url !== input.url) {
      return item;
    }
    recovered = true;
    return {
      ...item,
      resolvedAt: new Date().toISOString(),
      recoveryCount: item.recoveryCount + 1,
    } satisfies ExternalFetchIssueRecord;
  });
  return {
    issues: next,
    recovered,
  };
}

function upsertStageArtifact(items: StageArtifactItem[], next: StageArtifactItem) {
  const filtered = items.filter((item) => item.stageCode !== next.stageCode);
  return [next, ...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertKnowledgeCard(items: KnowledgeCardPanelItem[], next: KnowledgeCardPanelItem) {
  return [next, ...items.filter((item) => item.id !== next.id)];
}

function reorderKnowledgeCards(items: KnowledgeCardPanelItem[], highlightedId: number | null) {
  if (!highlightedId) {
    return items;
  }
  const highlighted = items.find((item) => item.id === highlightedId);
  if (!highlighted) {
    return items;
  }
  return [highlighted, ...items.filter((item) => item.id !== highlightedId)];
}

function buildHighlightedKnowledgeCard(
  detail: Partial<KnowledgeCardPanelItem> & { id: number; title: string },
  fallback?: KnowledgeCardPanelItem | null,
) {
  return {
    id: detail.id,
    userId: typeof detail.userId === "number" ? detail.userId : fallback?.userId ?? 0,
    ownerUsername: detail.ownerUsername ?? fallback?.ownerUsername ?? null,
    shared: typeof detail.shared === "boolean" ? detail.shared : fallback?.shared ?? false,
    workspaceScope: detail.workspaceScope ?? fallback?.workspaceScope ?? "personal",
    cardType: detail.cardType ?? fallback?.cardType ?? "topic",
    title: detail.title,
    summary: detail.summary ?? fallback?.summary ?? null,
    keyFacts: Array.isArray(detail.keyFacts) ? detail.keyFacts : fallback?.keyFacts ?? [],
    openQuestions: Array.isArray(detail.openQuestions) ? detail.openQuestions : fallback?.openQuestions ?? [],
    conflictFlags: Array.isArray(detail.conflictFlags) ? detail.conflictFlags : fallback?.conflictFlags ?? [],
    sourceFragmentIds: Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds : fallback?.sourceFragmentIds ?? [],
    relatedCardIds: Array.isArray(detail.relatedCardIds) ? detail.relatedCardIds : fallback?.relatedCardIds ?? [],
    relatedCards: Array.isArray(detail.relatedCards) ? detail.relatedCards : fallback?.relatedCards ?? [],
    sourceFragments: Array.isArray(detail.sourceFragments) ? detail.sourceFragments : fallback?.sourceFragments ?? [],
    confidenceScore: typeof detail.confidenceScore === "number" ? detail.confidenceScore : fallback?.confidenceScore ?? 0,
    status: detail.status ?? fallback?.status ?? "draft",
    lastCompiledAt: detail.lastCompiledAt ?? fallback?.lastCompiledAt ?? null,
    relevanceScore: typeof detail.relevanceScore === "number" ? detail.relevanceScore : fallback?.relevanceScore ?? 1,
    matchedFragmentCount:
      typeof detail.matchedFragmentCount === "number"
        ? detail.matchedFragmentCount
        : fallback?.matchedFragmentCount ?? (Array.isArray(detail.sourceFragmentIds) ? detail.sourceFragmentIds.length : 0),
  } satisfies KnowledgeCardPanelItem;
}

function formatKnowledgeStatus(status: string) {
  if (status === "active") return "可引用";
  if (status === "stale") return "待刷新";
  if (status === "conflicted") return "有冲突";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status;
}

function formatTemplateConfigSummary(template?: { config?: Record<string, unknown> } | null) {
  return summarizeTemplateRenderConfig(template, 7).filter((item) => !item.startsWith("标题密度：") && !item.startsWith("列表："));
}

function formatTemplateAssetOwner(template?: { ownerUserId?: number | null } | null) {
  return template?.ownerUserId == null ? "官方模板库" : "你的个人空间";
}

function formatTemplateSourceSummary(template?: { sourceUrl?: string | null } | null) {
  if (!template?.sourceUrl) {
    return "系统模板库";
  }
  try {
    return new URL(template.sourceUrl).hostname;
  } catch {
    return template.sourceUrl;
  }
}

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatWorkflowStageStatus(status: "pending" | "current" | "completed" | "failed") {
  if (status === "completed") return "已完成";
  if (status === "current") return "进行中";
  if (status === "failed") return "待处理";
  return "待开始";
}

function formatFactRiskLabel(risk: string) {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  if (risk === "low") return "低风险";
  return risk || "未评估";
}

function formatEvidenceSupportLevel(level: string) {
  if (level === "strong") return "证据较强";
  if (level === "partial") return "证据部分命中";
  if (level === "missing") return "缺少证据";
  return level || "未评估";
}

function formatFragmentSourceType(type: string | null | undefined) {
  if (type === "url") return "链接";
  if (type === "screenshot") return "截图";
  return "文本";
}

function formatFragmentUsageMode(mode: string | null | undefined) {
  return mode === "image" ? "原样插图" : "可改写素材";
}

function normalizeOutlineMaterialNode(node: {
  id: number;
  title: string;
  description: string | null;
  sortOrder: number;
  fragments: Array<{
    id: number;
    title?: string | null;
    distilledContent: string;
    sourceType?: string;
    sourceUrl?: string | null;
    screenshotPath?: string | null;
    usageMode?: string;
    shared?: boolean;
  }>;
}): OutlineMaterialNodeItem {
  return {
    id: node.id,
    title: node.title,
    description: node.description,
    sortOrder: node.sortOrder,
    fragments: node.fragments.map((fragment) => ({
      id: fragment.id,
      title: fragment.title,
      distilledContent: fragment.distilledContent,
      sourceType: fragment.sourceType,
      sourceUrl: fragment.sourceUrl,
      screenshotPath: fragment.screenshotPath,
      usageMode: fragment.usageMode,
      shared: fragment.shared,
    })),
  };
}

function getStageApplyButtonLabel(stageCode: string) {
  if (stageCode === "factCheck") {
    return "精修高风险句子";
  }
  if (stageCode === "prosePolish") {
    return "精修句段节奏";
  }
  return "一键应用回正文";
}

export function DocumentEditorClient({
  document,
  nodes: initialNodes,
  fragments: initialFragments,
  languageGuardRules,
  connections: initialConnections,
  snapshots: initialSnapshots,
  styleGenomes,
  templates,
  recentSyncLogs,
  workflow: initialWorkflow,
  stageArtifacts: initialStageArtifacts,
  knowledgeCards,
  canUseStyleGenomes,
  canExportPdf,
  canGenerateCoverImage,
  canUseCoverImageReference,
  canUseHistoryReferences,
  canPublishToWechat,
  planName,
  authoringContext,
  coverImageQuota: initialCoverImageQuota,
  initialCoverImageCandidates,
  initialImagePrompts,
  initialCoverImage,
}: {
  document: { id: number; title: string; markdownContent: string; status: string; htmlContent: string; styleGenomeId: number | null; wechatTemplateId: string | null };
  nodes: OutlineMaterialNodeItem[];
  fragments: DocumentFragmentItem[];
  languageGuardRules: LanguageGuardRule[];
  connections: WechatConnectionItem[];
  snapshots: SnapshotMeta[];
  styleGenomes: Array<{ id: number; name: string; isPublic: boolean; isOfficial: boolean }>;
  templates: Array<{ id: string; version: string; name: string; description: string | null; meta: string | null; ownerUserId: number | null; sourceUrl: string | null; config?: Record<string, unknown> }>;
  recentSyncLogs: RecentSyncLogItem[];
  workflow: {
    currentStageCode: string;
    stages: Array<{ code: string; title: string; status: "pending" | "current" | "completed" | "failed" }>;
    pendingPublishIntent?: PendingPublishIntent | null;
    updatedAt: string;
  };
  stageArtifacts: StageArtifactItem[];
  knowledgeCards: KnowledgeCardPanelItem[];
  canUseStyleGenomes: boolean;
  canExportPdf: boolean;
  canGenerateCoverImage: boolean;
  canUseCoverImageReference: boolean;
  canUseHistoryReferences: boolean;
  canPublishToWechat: boolean;
  planName: string;
  authoringContext: ImageAuthoringStyleContext | null;
  coverImageQuota: { used: number; limit: number | null; remaining: number | null };
  initialCoverImageCandidates: CoverImageCandidateItem[];
  initialImagePrompts: DocumentImagePromptItem[];
  initialCoverImage: { imageUrl: string; prompt: string; createdAt: string } | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(document.title);
  const [markdown, setMarkdown] = useState(document.markdownContent);
  const [htmlPreview, setHtmlPreview] = useState(document.htmlContent);
  const [status, setStatus] = useState(document.status);
  const [styleGenomeId, setStyleGenomeId] = useState<number | null>(document.styleGenomeId);
  const [wechatTemplateId, setWechatTemplateId] = useState<string | null>(document.wechatTemplateId);
  const [nodes, setNodes] = useState(initialNodes);
  const [fragmentPool, setFragmentPool] = useState(initialFragments);
  const [wechatConnections, setWechatConnections] = useState(initialConnections);
  const [knowledgeCardItems, setKnowledgeCardItems] = useState(knowledgeCards);
  const [workflow, setWorkflow] = useState(initialWorkflow);
  const [stageArtifacts, setStageArtifacts] = useState(initialStageArtifacts);
  const [view, setView] = useState<"edit" | "preview" | "audit">("edit");
  const [selectedConnectionId, setSelectedConnectionId] = useState(() => {
    const preferred = initialConnections.find((connection) => connection.isDefault) ?? initialConnections[0];
    return preferred?.id ? String(preferred.id) : "";
  });
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [snapshotNote, setSnapshotNote] = useState("");
  const [diffState, setDiffState] = useState<DiffState>(null);
  const [saveState, setSaveState] = useState("未保存");
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [coverImage, setCoverImage] = useState(initialCoverImage);
  const [coverImageCandidates, setCoverImageCandidates] = useState(initialCoverImageCandidates);
  const [coverImageQuota, setCoverImageQuota] = useState(initialCoverImageQuota);
  const [imagePrompts, setImagePrompts] = useState(initialImagePrompts);
  const [coverImageReferenceDataUrl, setCoverImageReferenceDataUrl] = useState<string | null>(null);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [selectingCoverCandidateId, setSelectingCoverCandidateId] = useState<number | null>(null);
  const [savingImagePrompts, setSavingImagePrompts] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingDiffId, setLoadingDiffId] = useState<number | null>(null);
  const [refreshingKnowledgeId, setRefreshingKnowledgeId] = useState<number | null>(null);
  const [expandedKnowledgeCardId, setExpandedKnowledgeCardId] = useState<number | null>(knowledgeCards[0]?.id ?? null);
  const [highlightedKnowledgeCardId, setHighlightedKnowledgeCardId] = useState<number | null>(null);
  const [updatingWorkflowCode, setUpdatingWorkflowCode] = useState<string | null>(null);
  const [generatingStageArtifactCode, setGeneratingStageArtifactCode] = useState<string | null>(null);
  const [applyingStageArtifactCode, setApplyingStageArtifactCode] = useState<string | null>(null);
  const [syncingOutlineArtifact, setSyncingOutlineArtifact] = useState(false);
  const [savingAudienceSelection, setSavingAudienceSelection] = useState(false);
  const [applyingLayout, setApplyingLayout] = useState(false);
  const [loadingPublishPreview, setLoadingPublishPreview] = useState(false);
  const [refreshingPublishPreview, setRefreshingPublishPreview] = useState(false);
  const [publishPreview, setPublishPreview] = useState<PublishPreviewState | null>(null);
  const [pendingPublishIntent, setPendingPublishIntent] = useState<PendingPublishIntent | null>(initialWorkflow.pendingPublishIntent ?? null);
  const [factCheckEvidenceUrl, setFactCheckEvidenceUrl] = useState("");
  const [addingFactCheckEvidence, setAddingFactCheckEvidence] = useState(false);
  const [factCheckEvidenceIssue, setFactCheckEvidenceIssue] = useState<null | {
    url: string;
    degradedReason: string;
    retryRecommended: boolean;
  }>(null);
  const [recentFactCheckEvidenceIssues, setRecentFactCheckEvidenceIssues] = useState<ExternalFetchIssueRecord[]>([]);
  const factCheckRetryableCount = recentFactCheckEvidenceIssues.filter((item) => item.retryRecommended && !item.resolvedAt).length;
  const factCheckRecoveredCount = recentFactCheckEvidenceIssues.filter((item) => item.recoveryCount > 0).reduce((sum, item) => sum + item.recoveryCount, 0);
  const [showWechatConnectModal, setShowWechatConnectModal] = useState(false);
  const [wechatConnectSubmitting, setWechatConnectSubmitting] = useState(false);
  const [continuePublishAfterWechatConnect, setContinuePublishAfterWechatConnect] = useState(false);
  const [wechatConnectAccountName, setWechatConnectAccountName] = useState("");
  const [wechatConnectOriginalId, setWechatConnectOriginalId] = useState("");
  const [wechatConnectAppId, setWechatConnectAppId] = useState("");
  const [wechatConnectAppSecret, setWechatConnectAppSecret] = useState("");
  const [wechatConnectIsDefault, setWechatConnectIsDefault] = useState(initialConnections.length === 0);
  const [wechatConnectMessage, setWechatConnectMessage] = useState("");
  const [audienceSelectionDraft, setAudienceSelectionDraft] = useState<AudienceSelectionDraft>({
    selectedReaderLabel: "",
    selectedLanguageGuidance: "",
    selectedBackgroundAwareness: "",
    selectedReadabilityLevel: "",
    selectedCallToAction: "",
  });
  const [outlineSelectionDraft, setOutlineSelectionDraft] = useState<OutlineSelectionDraft>({
    selectedTitle: "",
    selectedTitleStyle: "",
    selectedOpeningHook: "",
    selectedTargetEmotion: "",
    selectedEndingStrategy: "",
  });
  const [outlineMaterials, setOutlineMaterials] = useState<OutlineMaterialsState | null>(null);
  const [loadingOutlineMaterials, setLoadingOutlineMaterials] = useState(false);
  const [savingOutlineMaterials, setSavingOutlineMaterials] = useState(false);
  const [supplementalViewpointsDraft, setSupplementalViewpointsDraft] = useState<string[]>(["", "", ""]);
  const [outlineMaterialNodeId, setOutlineMaterialNodeId] = useState<string>(initialNodes[0]?.id ? String(initialNodes[0].id) : "");
  const [outlineMaterialFragmentId, setOutlineMaterialFragmentId] = useState("");
  const [outlineMaterialUsageMode, setOutlineMaterialUsageMode] = useState<"rewrite" | "image">("rewrite");
  const [outlineMaterialCreateMode, setOutlineMaterialCreateMode] = useState<"manual" | "url" | "screenshot">("manual");
  const [outlineMaterialTitle, setOutlineMaterialTitle] = useState("");
  const [outlineMaterialContent, setOutlineMaterialContent] = useState("");
  const [outlineMaterialUrl, setOutlineMaterialUrl] = useState("");
  const [outlineMaterialImageDataUrl, setOutlineMaterialImageDataUrl] = useState<string | null>(null);
  const [outlineMaterialScreenshotFileName, setOutlineMaterialScreenshotFileName] = useState("");
  const [factCheckSelectionDraft, setFactCheckSelectionDraft] = useState<FactCheckSelectionDraft>({
    claimDecisions: [],
  });
  const [historyReferenceSuggestions, setHistoryReferenceSuggestions] = useState<HistoryReferenceSuggestionItem[]>([]);
  const [selectedHistoryReferences, setSelectedHistoryReferences] = useState<HistoryReferenceSelectionItem[]>([]);
  const [loadingHistoryReferences, setLoadingHistoryReferences] = useState(false);
  const [savingHistoryReferences, setSavingHistoryReferences] = useState(false);
  const lastSavedRef = useRef({
    title: document.title,
    markdown: document.markdownContent,
    status: document.status,
    styleGenomeId: document.styleGenomeId,
    wechatTemplateId: document.wechatTemplateId,
  });
  const outlineMaterialScreenshotInputRef = useRef<HTMLInputElement | null>(null);

  const bannedWords = useMemo(
    () =>
      Array.from(
        new Set(
          languageGuardRules
            .filter((rule) => rule.isEnabled && rule.ruleKind === "token")
            .map((rule) => rule.patternText.trim())
            .filter(Boolean),
        ),
      ),
    [languageGuardRules],
  );
  const detectedBannedWords = useMemo(() => {
    const hits = new Map<string, number>();
    for (const word of bannedWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = markdown.match(new RegExp(escaped, "g"));
      if (matches?.length) {
        hits.set(word, matches.length);
      }
    }
    return Array.from(hits.entries()).map(([word, count]) => ({ word, count }));
  }, [bannedWords, markdown]);
  const liveLanguageGuardHits = useMemo(
    () => collectLanguageGuardHits(markdown, languageGuardRules).slice(0, 8),
    [languageGuardRules, markdown],
  );
  const liveLanguageGuardSummary = useMemo(
    () => ({
      tokenCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "token").length,
      patternCount: liveLanguageGuardHits.filter((hit) => hit.ruleKind === "pattern").length,
      highSeverityCount: liveLanguageGuardHits.filter((hit) => hit.severity === "high").length,
    }),
    [liveLanguageGuardHits],
  );

  const bannedWordMarkup = useMemo(
    () => buildBannedWordMarkup(markdown, bannedWords),
    [bannedWords, markdown],
  );
  const selectedTemplate = useMemo(() => templates.find((template) => template.id === wechatTemplateId) ?? null, [templates, wechatTemplateId]);
  const selectedConnection = useMemo(
    () => wechatConnections.find((connection) => String(connection.id) === selectedConnectionId) ?? null,
    [wechatConnections, selectedConnectionId],
  );
  const latestSyncLog = recentSyncLogs[0] ?? null;
  const visualSuggestion = useMemo(() => buildVisualSuggestion(title, markdown, authoringContext), [authoringContext, title, markdown]);
  const currentStage = useMemo(
    () => workflow.stages.find((stage) => stage.code === workflow.currentStageCode) ?? workflow.stages[0] ?? null,
    [workflow],
  );
  const currentStageArtifact = useMemo(
    () => stageArtifacts.find((item) => item.stageCode === workflow.currentStageCode) ?? null,
    [stageArtifacts, workflow.currentStageCode],
  );
  const currentAudienceSelection = useMemo(
    () => getAudienceSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const currentOutlineSelection = useMemo(
    () => getOutlineSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const currentFactCheckSelection = useMemo(
    () => getFactCheckSelectionDraft(currentStageArtifact?.payload),
    [currentStageArtifact],
  );
  const audienceReaderSegments = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "readerSegments"),
    [currentStageArtifact],
  );
  const audienceLanguageGuidance = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "languageGuidance"),
    [currentStageArtifact],
  );
  const audienceBackgroundAwarenessOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "backgroundAwarenessOptions"),
    [currentStageArtifact],
  );
  const audienceReadabilityOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "readabilityOptions"),
    [currentStageArtifact],
  );
  const outlineOpeningHookOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "openingHookOptions"),
    [currentStageArtifact],
  );
  const outlineTitleOptions = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "titleOptions"),
    [currentStageArtifact],
  );
  const outlineTitleStrategyNotes = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "titleStrategyNotes"),
    [currentStageArtifact],
  );
  const outlineTargetEmotionOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "targetEmotionOptions"),
    [currentStageArtifact],
  );
  const outlineEndingStrategyOptions = useMemo(
    () => getPayloadStringArray(currentStageArtifact?.payload, "endingStrategyOptions"),
    [currentStageArtifact],
  );
  const factCheckChecks = useMemo(
    () => getPayloadRecordArray(currentStageArtifact?.payload, "checks"),
    [currentStageArtifact],
  );
  const factCheckResolvedCount = useMemo(
    () =>
      factCheckChecks.filter((item) => {
        const claim = String(item.claim || "").trim();
        const status = String(item.status || "").trim();
        return getFactCheckDecision(factCheckSelectionDraft, claim, status).action !== "keep";
      }).length,
    [factCheckChecks, factCheckSelectionDraft],
  );
  const audienceCallToActionOptions = useMemo(() => {
    if (!currentStageArtifact?.payload) {
      return [] as string[];
    }
    const recommended = String(currentStageArtifact.payload.recommendedCallToAction || "").trim();
    return Array.from(
      new Set(
        [
          recommended,
          "结尾给出下一步观察点和判断标准。",
          "结尾提示读者如何把这篇内容转成可执行动作。",
        ].map((item) => String(item || "").trim()).filter(Boolean),
      ),
    ).slice(0, 4);
  }, [currentStageArtifact]);
  const currentStageAction = currentStage ? GENERATABLE_STAGE_ACTIONS[currentStage.code] : null;
  const coverImageLimitReached = coverImageQuota.limit != null && coverImageQuota.used >= coverImageQuota.limit;
  const canShowWechatControls = canPublishToWechat;
  const hasUnsavedWechatRenderInputs =
    title !== lastSavedRef.current.title ||
    markdown !== lastSavedRef.current.markdown ||
    wechatTemplateId !== lastSavedRef.current.wechatTemplateId;
  const coverImageButtonDisabled = !canGenerateCoverImage || generatingCover || coverImageLimitReached;
  const coverImageButtonLabel = !canGenerateCoverImage
    ? "当前套餐仅提供文本配图建议"
    : coverImageLimitReached
      ? "今日封面图额度已用尽"
      : generatingCover
        ? "封面图生成中..."
        : "生成 16:9 封面图";
  const nodeVisualSuggestions = useMemo(
    () =>
      nodes
        .filter((node) => node.title.trim())
        .slice(0, 4)
        .map((node) => ({
          id: node.id,
          title: node.title,
          prompt: buildNodeVisualSuggestion({
            documentTitle: title,
            nodeTitle: node.title,
            nodeDescription: node.description,
            fragments: node.fragments,
            authoringContext,
          }),
        })),
    [authoringContext, nodes, title],
  );

  useEffect(() => {
    setKnowledgeCardItems(knowledgeCards);
    setExpandedKnowledgeCardId((current) => current ?? knowledgeCards[0]?.id ?? null);
  }, [knowledgeCards]);

  useEffect(() => {
    setFragmentPool(initialFragments);
  }, [initialFragments]);

  useEffect(() => {
    setWechatConnections(initialConnections);
  }, [initialConnections]);

  useEffect(() => {
    setCoverImageCandidates(initialCoverImageCandidates);
  }, [initialCoverImageCandidates]);

  useEffect(() => {
    setImagePrompts(initialImagePrompts);
  }, [initialImagePrompts]);

  useEffect(() => {
    setStageArtifacts(initialStageArtifacts);
  }, [initialStageArtifacts]);

  useEffect(() => {
    setNodes(initialNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: initialNodes,
          }
        : current,
    );
    setOutlineMaterialNodeId((current) => {
      if (current && initialNodes.some((node) => String(node.id) === current)) {
        return current;
      }
      return initialNodes[0]?.id ? String(initialNodes[0].id) : "";
    });
  }, [initialNodes]);

  useEffect(() => {
    const fallbackIntent = readPendingPublishIntent(document.id);
    const nextIntent = initialWorkflow.pendingPublishIntent ?? fallbackIntent;
    setPendingPublishIntent(nextIntent);
    if (!initialWorkflow.pendingPublishIntent && fallbackIntent) {
      void persistPendingPublishIntent(fallbackIntent, { silent: true });
    }
  }, [document.id, initialWorkflow.pendingPublishIntent]);

  useEffect(() => {
    setRecentFactCheckEvidenceIssues(
      readExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(document.id), "fact-check-evidence", document.id),
    );
  }, [document.id]);

  useEffect(() => {
    if (currentStage?.code !== "audienceAnalysis") {
      return;
    }
    setAudienceSelectionDraft(hydrateAudienceSelectionDraft(currentStageArtifact?.payload, currentAudienceSelection));
  }, [currentAudienceSelection, currentStage?.code, currentStageArtifact?.payload]);

  useEffect(() => {
    if (currentStage?.code !== "outlinePlanning") {
      return;
    }
    setOutlineSelectionDraft(hydrateOutlineSelectionDraft(currentStageArtifact?.payload, currentOutlineSelection));
  }, [currentOutlineSelection, currentStage?.code, currentStageArtifact?.payload]);

  useEffect(() => {
    if (currentStage?.code !== "factCheck") {
      return;
    }
    setFactCheckSelectionDraft(currentFactCheckSelection);
  }, [currentFactCheckSelection, currentStage?.code]);

  useEffect(() => {
    if (currentStage?.code !== "outlinePlanning" || outlineMaterials || loadingOutlineMaterials) {
      return;
    }
    void loadOutlineMaterials();
  }, [currentStage?.code, loadingOutlineMaterials, outlineMaterials]);

  useEffect(() => {
    if (!canUseHistoryReferences || currentStage?.code !== "deepWriting" || loadingHistoryReferences) {
      return;
    }
    if (historyReferenceSuggestions.length > 0 || selectedHistoryReferences.length > 0) {
      return;
    }
    void loadHistoryReferences();
  }, [canUseHistoryReferences, currentStage?.code, historyReferenceSuggestions.length, loadingHistoryReferences, selectedHistoryReferences.length]);

  useEffect(() => {
    setSelectedConnectionId((current) => {
      if (current && wechatConnections.some((connection) => String(connection.id) === current)) {
        return current;
      }
      const preferred = wechatConnections.find((connection) => connection.isDefault) ?? wechatConnections[0];
      return preferred?.id ? String(preferred.id) : "";
    });
  }, [wechatConnections]);

  async function loadOutlineMaterials(force = false) {
    if (!force && loadingOutlineMaterials) {
      return;
    }
    setLoadingOutlineMaterials(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/outline-materials`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材加载失败");
      }
      const nextNodes: OutlineMaterialNodeItem[] = Array.isArray(json.data?.nodes)
        ? json.data.nodes.map(normalizeOutlineMaterialNode)
        : [];
      const nextViewpoints = Array.from(
        { length: 3 },
        (_, index) => String(json.data?.supplementalViewpoints?.[index] || "").trim(),
      );
      setOutlineMaterials({
        supplementalViewpoints: nextViewpoints.filter(Boolean),
        nodes: nextNodes,
      });
      setSupplementalViewpointsDraft(nextViewpoints);
      setOutlineMaterialNodeId((current) => {
        if (current && nextNodes.some((node) => String(node.id) === current)) {
          return current;
        }
        return nextNodes[0]?.id ? String(nextNodes[0].id) : "";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材加载失败");
    } finally {
      setLoadingOutlineMaterials(false);
    }
  }

  async function saveSupplementalViewpoints() {
    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/outline-materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplementalViewpoints: supplementalViewpointsDraft
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 3),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补充观点保存失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      setOutlineMaterials((current) =>
        current
          ? {
              ...current,
              supplementalViewpoints: supplementalViewpointsDraft.map((item) => item.trim()).filter(Boolean).slice(0, 3),
            }
          : current,
      );
      setMessage("补充观点已保存到大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补充观点保存失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  function handleOutlineMaterialScreenshotFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setOutlineMaterialImageDataUrl(null);
      setOutlineMaterialScreenshotFileName("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setOutlineMaterialImageDataUrl(reader.result);
        setOutlineMaterialScreenshotFileName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  async function submitOutlineMaterial(action: "attachExisting" | "createManual" | "createUrl" | "createScreenshot") {
    const nodeId = Number(outlineMaterialNodeId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      setMessage("先选择一个大纲节点。");
      return;
    }
    if (action === "attachExisting" && !outlineMaterialFragmentId) {
      setMessage("先选择要挂载的素材。");
      return;
    }
    if (action === "createManual" && !outlineMaterialContent.trim()) {
      setMessage("手动素材内容不能为空。");
      return;
    }
    if (action === "createUrl" && !outlineMaterialUrl.trim()) {
      setMessage("链接素材不能为空。");
      return;
    }
    if (action === "createScreenshot" && !outlineMaterialImageDataUrl) {
      setMessage("先上传一张截图。");
      return;
    }

    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/outline-materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "attachExisting"
            ? {
                action,
                nodeId,
                fragmentId: Number(outlineMaterialFragmentId),
                usageMode: outlineMaterialUsageMode,
              }
            : action === "createManual"
              ? {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  content: outlineMaterialContent.trim(),
                  usageMode: "rewrite",
                }
              : {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  ...(action === "createUrl"
                    ? {
                        url: outlineMaterialUrl.trim(),
                        usageMode: "rewrite",
                      }
                    : {
                        imageDataUrl: outlineMaterialImageDataUrl,
                        note: outlineMaterialContent.trim(),
                      }),
                },
        ),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材更新失败");
      }
      const nextNodes = Array.isArray(json.data)
        ? json.data.map(normalizeOutlineMaterialNode)
        : [];
      setNodes(nextNodes);
      setOutlineMaterials((current) => ({
        supplementalViewpoints: current?.supplementalViewpoints ?? [],
        nodes: nextNodes,
      }));
      setOutlineMaterialFragmentId("");
      setOutlineMaterialTitle("");
      setOutlineMaterialContent("");
      setOutlineMaterialUrl("");
      setOutlineMaterialImageDataUrl(null);
      setOutlineMaterialScreenshotFileName("");
      if (outlineMaterialScreenshotInputRef.current) {
        outlineMaterialScreenshotInputRef.current.value = "";
      }
      setMessage(action === "attachExisting" ? "素材已挂到大纲节点。" : "素材已创建并挂到大纲节点。");
      await reloadDocumentMeta();
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材更新失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  async function loadHistoryReferences(force = false) {
    if (!canUseHistoryReferences) {
      setMessage(`${planName}套餐暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    if (!force && loadingHistoryReferences) {
      return;
    }
    setLoadingHistoryReferences(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/history-reference-suggest`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章建议加载失败");
      }
      const suggestions = Array.isArray(json.data?.suggestions)
        ? (json.data.suggestions as HistoryReferenceSuggestionItem[])
        : [];
      const saved = Array.isArray(json.data?.saved)
        ? (json.data.saved as HistoryReferenceSelectionItem[])
        : [];
      setHistoryReferenceSuggestions(suggestions);
      setSelectedHistoryReferences(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章建议加载失败");
    } finally {
      setLoadingHistoryReferences(false);
    }
  }

  function toggleHistoryReferenceSelection(item: HistoryReferenceSuggestionItem) {
    setSelectedHistoryReferences((current) => {
      const exists = current.some((reference) => reference.referencedDocumentId === item.referencedDocumentId);
      if (exists) {
        return current.filter((reference) => reference.referencedDocumentId !== item.referencedDocumentId);
      }
      if (current.length >= 2) {
        setMessage("历史文章自然引用最多保留 2 篇。");
        return current;
      }
      return [
        ...current,
        {
          referencedDocumentId: item.referencedDocumentId,
          title: item.title,
          relationReason: item.relationReason ?? null,
          bridgeSentence: item.bridgeSentence ?? null,
        },
      ];
    });
  }

  function updateHistoryReferenceField(
    referencedDocumentId: number,
    field: "relationReason" | "bridgeSentence",
    value: string,
  ) {
    setSelectedHistoryReferences((current) =>
      current.map((item) =>
        item.referencedDocumentId === referencedDocumentId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  async function saveHistoryReferenceSelection() {
    if (!canUseHistoryReferences) {
      setMessage(`${planName}套餐暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    setSavingHistoryReferences(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/history-reference-selection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references: selectedHistoryReferences.slice(0, 2).map((item) => ({
            referencedDocumentId: item.referencedDocumentId,
            relationReason: item.relationReason?.trim() || null,
            bridgeSentence: item.bridgeSentence?.trim() || null,
          })),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章自然引用保存失败");
      }
      const saved = Array.isArray(json.data)
        ? (json.data as HistoryReferenceSelectionItem[])
        : [];
      setSelectedHistoryReferences(saved);
      setMessage(saved.length > 0 ? "历史文章自然引用已保存。" : "已清空历史文章自然引用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章自然引用保存失败");
    } finally {
      setSavingHistoryReferences(false);
    }
  }

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
    if (documentJson.data.workflow) {
      setWorkflow(documentJson.data.workflow);
    }
    if (Array.isArray(documentJson.data.stageArtifacts)) {
      setStageArtifacts(documentJson.data.stageArtifacts);
    }
    const nextNodes = nodesJson.data.map(normalizeOutlineMaterialNode);
    setNodes(nextNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: nextNodes,
          }
        : current,
    );
    lastSavedRef.current = {
      title: documentJson.data.title,
      markdown: documentJson.data.markdownContent,
      status: documentJson.data.status,
      styleGenomeId: documentJson.data.styleGenomeId ?? null,
      wechatTemplateId: documentJson.data.wechatTemplateId ?? null,
    };
  }

  async function saveDocument(nextStatus?: string, nextMarkdown?: string, silent = false, nextTitle?: string) {
    const resolvedTitle = nextTitle ?? title;
    const response = await fetch(`/api/documents/${document.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resolvedTitle,
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
      setTitle(resolvedTitle);
      setStatus(savedStatus);
      setStyleGenomeId(json.data.styleGenomeId ?? null);
      setWechatTemplateId(json.data.wechatTemplateId ?? null);
      lastSavedRef.current = {
        title: resolvedTitle,
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

  useEffect(() => {
    setPublishPreview(null);
  }, [title, markdown, wechatTemplateId]);

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
    await updateWorkflow("deepWriting", "set");
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
      await updateWorkflow("factCheck", "set");
      setMessage("生成完成");
      await reloadDocumentMeta();
    }
  }

  async function publish() {
    if (!canShowWechatControls) {
      setMessage(`${planName}套餐暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true);
      return;
    }
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function requestPublishPreview(options?: { silent?: boolean; setLoading?: boolean }) {
    if (options?.setLoading ?? true) {
      setLoadingPublishPreview(true);
    }
    if (!options?.silent) {
      setMessage("");
    }
    try {
      const response = await fetch(`/api/documents/${document.id}/publish-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdownContent: markdown,
          templateId: wechatTemplateId,
          wechatConnectionId: selectedConnectionId ? Number(selectedConnectionId) : null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "发布前预览生成失败");
      }
      return json.data as PublishPreviewState;
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "发布前预览生成失败");
      }
      return null;
    } finally {
      if (options?.setLoading ?? true) {
        setLoadingPublishPreview(false);
      }
    }
  }

  async function loadPublishPreview() {
    const nextPreview = await requestPublishPreview();
    if (!nextPreview) {
      return;
    }
    setPublishPreview(nextPreview);
    setView("preview");
    setMessage(
      !nextPreview.publishGuard.canPublish
        ? `发布前检查未通过：${nextPreview.publishGuard.blockers[0] || "请先处理拦截项。"}`
        : nextPreview.isConsistentWithSavedHtml
          ? "发布前最终预览已更新，当前保存版与微信最终渲染一致。"
          : "发布前最终预览已更新。检测到保存版与最终发布效果存在差异，请先刷新。",
    );
  }

  async function refreshPublishPreviewRender() {
    setRefreshingPublishPreview(true);
    setMessage("");
    try {
      const saved = await saveDocument(undefined, undefined, false);
      if (!saved) {
        return;
      }
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (!nextPreview) {
        throw new Error("刷新最终发布效果失败");
      }
      setPublishPreview(nextPreview);
      setHtmlPreview(nextPreview.finalHtml || "");
      setView("preview");
      setMessage("已刷新为最终发布效果，当前 HTML 预览与微信发布渲染一致。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新最终发布效果失败");
    } finally {
      setRefreshingPublishPreview(false);
    }
  }

  function resetWechatConnectDraft() {
    setWechatConnectAccountName("");
    setWechatConnectOriginalId("");
    setWechatConnectAppId("");
    setWechatConnectAppSecret("");
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
  }

  async function persistPendingPublishIntent(intentOverride?: PendingPublishIntent, options?: { silent?: boolean }) {
    const nextIntent = intentOverride ?? {
      documentId: document.id,
      createdAt: new Date().toISOString(),
      templateId: wechatTemplateId,
    } satisfies PendingPublishIntent;
    setPendingPublishIntent(nextIntent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(nextIntent));
    }
    try {
      const response = await fetch(`/api/documents/${document.id}/publish-intent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextIntent),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "待恢复发布意图保存失败");
      }
      const serverIntent = json.data?.pendingPublishIntent as PendingPublishIntent | null | undefined;
      if (serverIntent) {
        setPendingPublishIntent(serverIntent);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(serverIntent));
        }
      }
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "待恢复发布意图保存失败");
      }
    }
    return nextIntent;
  }

  async function clearPendingPublishIntent() {
    setPendingPublishIntent(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    }
    try {
      await fetch(`/api/documents/${document.id}/publish-intent`, {
        method: "DELETE",
      });
    } catch {}
  }

  async function openWechatConnectModal(continuePublish = false) {
    if (!canShowWechatControls) {
      setMessage(`${planName}套餐暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (continuePublish) {
      await persistPendingPublishIntent(undefined, { silent: true });
    }
    setContinuePublishAfterWechatConnect(continuePublish);
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
    setShowWechatConnectModal(true);
  }

  async function resumePendingPublishIntent() {
    if (!pendingPublishIntent) {
      setMessage("当前没有待恢复的发布意图。");
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true);
      return;
    }
    setMessage("正在恢复上次中断的发布流程。");
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function reloadWechatConnections() {
    const response = await fetch("/api/wechat/connections");
    const json = await response.json();
    if (!response.ok || !json.success || !Array.isArray(json.data)) {
      throw new Error(json.error || "公众号连接刷新失败");
    }
    const nextConnections = json.data as WechatConnectionItem[];
    setWechatConnections(nextConnections);
    return nextConnections;
  }

  async function continuePublishWithConnection(connectionId: number) {
    setPublishing(true);
    setMessage("");
    try {
      const saved = await saveDocument(undefined, undefined, false);
      if (!saved) {
        return false;
      }
      const response = await fetch("/api/wechat/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          wechatConnectionId: connectionId,
          templateId: wechatTemplateId,
        }),
      });
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        if (payload.data && typeof payload.data === "object" && "publishGuard" in payload.data) {
          const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
          if (nextPreview) {
            setPublishPreview(nextPreview);
            setView("preview");
          }
        }
        throw new Error(payload.message);
      }
      const json = await response.json().catch(() => null);
      await clearPendingPublishIntent();
      setStatus("published");
      setView("preview");
      await reloadDocumentMeta();
      refreshRouter(router);
      setMessage(
        json?.success && json?.data?.mediaId
          ? `已推送到微信草稿箱，媒体 ID：${json.data.mediaId}。当前页已刷新为发布后的工作流状态。`
          : "已推送到微信草稿箱，当前页已刷新为发布后的工作流状态。",
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "推送微信草稿箱失败");
      return false;
    } finally {
      setPublishing(false);
    }
  }

  async function submitWechatConnectionFromEditor(event: FormEvent) {
    event.preventDefault();
    setWechatConnectSubmitting(true);
    setWechatConnectMessage("");
    try {
      const response = await fetch("/api/wechat/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: wechatConnectAccountName,
          originalId: wechatConnectOriginalId,
          appId: wechatConnectAppId,
          appSecret: wechatConnectAppSecret,
          isDefault: wechatConnectIsDefault,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const nextConnections = await reloadWechatConnections();
      const preferredConnection =
        nextConnections.find((connection) => connection.isDefault) ??
        nextConnections.find((connection) => connection.accountName === wechatConnectAccountName.trim()) ??
        nextConnections[0];
      if (!preferredConnection) {
        throw new Error("公众号连接已创建，但未能获取到连接信息");
      }
      setSelectedConnectionId(String(preferredConnection.id));
      setShowWechatConnectModal(false);
      resetWechatConnectDraft();
      if (continuePublishAfterWechatConnect) {
        setContinuePublishAfterWechatConnect(false);
        setMessage("公众号已连接，继续推送到微信草稿箱。");
        await continuePublishWithConnection(preferredConnection.id);
        return;
      }
      setMessage("公众号连接已创建，可直接继续发布。");
    } catch (error) {
      setWechatConnectMessage(error instanceof Error ? error.message : "公众号连接失败");
    } finally {
      setWechatConnectSubmitting(false);
    }
  }

  async function generateCoverImage() {
    await updateWorkflow("coverImage", "set");
    setGeneratingCover(true);
    setMessage("");
    try {
      const response = await fetch("/api/images/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          title: title.trim() || document.title,
          referenceImageDataUrl: canUseCoverImageReference ? coverImageReferenceDataUrl : null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setMessage(json.error || "封面图生成失败");
        return;
      }
      setCoverImageCandidates(
        Array.isArray(json.data.candidates)
          ? json.data.candidates.map((item: { id: number; variantLabel: string; imageUrl: string; prompt: string }) => ({
              id: item.id,
              variantLabel: item.variantLabel,
              imageUrl: item.imageUrl,
              prompt: item.prompt,
              isSelected: false,
              createdAt: json.data.createdAt || new Date().toISOString(),
            }))
          : [],
      );
      if (json.data.quota) {
        setCoverImageQuota(json.data.quota);
      }
    } catch {
      setMessage("封面图生成失败");
    } finally {
      setGeneratingCover(false);
    }
  }

  async function selectCoverCandidate(candidateId: number) {
    setSelectingCoverCandidateId(candidateId);
    setMessage("");
    try {
      const response = await fetch("/api/images/cover/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "选择封面图失败");
      }
      setCoverImage({
        imageUrl: json.data.imageUrl,
        prompt: json.data.prompt,
        createdAt: json.data.createdAt || new Date().toISOString(),
      });
      setCoverImageCandidates((current) =>
        current.map((item) => ({
          ...item,
          isSelected: item.id === candidateId,
        })),
      );
      if (workflow.currentStageCode === "coverImage") {
        await updateWorkflow("coverImage", "complete", true);
        setMessage("封面图已选入文稿资产，已自动进入一键排版。");
      } else {
        setMessage("封面图已选入文稿资产");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择封面图失败");
    } finally {
      setSelectingCoverCandidateId(null);
    }
  }

  async function saveImagePromptAssets() {
    setSavingImagePrompts(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/image-prompts`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存配图 Prompt 失败");
      }
      setImagePrompts(json.data);
      setMessage("段落配图 Prompt 已保存到文稿资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配图 Prompt 失败");
    } finally {
      setSavingImagePrompts(false);
    }
  }

  function handleCoverReferenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setCoverImageReferenceDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCoverImageReferenceDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
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
        reorderKnowledgeCards(
          upsertKnowledgeCard(
            current,
            buildHighlightedKnowledgeCard(json.data, current.find((card) => card.id === cardId) ?? null),
          ),
          cardId,
        ),
      );
      setExpandedKnowledgeCardId(cardId);
      setHighlightedKnowledgeCardId(cardId);
      setMessage("主题档案已刷新");
    } catch {
      setMessage("主题档案刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  async function addFactCheckEvidenceSource(urlOverride?: string) {
    const url = (urlOverride ?? factCheckEvidenceUrl).trim();
    if (!url) {
      setMessage("先输入要补证的文章链接。");
      return;
    }
    const saved = await saveDocument(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setAddingFactCheckEvidence(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/fact-check-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: `${title || document.title} 补证链接`,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补证链接抓取失败");
      }
      setFactCheckEvidenceUrl("");
      if (json.data?.artifact) {
        setStageArtifacts((current) => upsertStageArtifact(current, json.data.artifact));
      }
      const refreshedKnowledgeCards = Array.isArray(json.data?.knowledgeCards) ? json.data.knowledgeCards : null;
      const refreshedKnowledgeCardId = typeof json.data?.compiledKnowledgeCard?.id === "number" ? json.data.compiledKnowledgeCard.id : null;
      if (refreshedKnowledgeCards) {
        setKnowledgeCardItems((current) => {
          const cards =
            refreshedKnowledgeCardId && json.data?.compiledKnowledgeCard
              ? upsertKnowledgeCard(
                  refreshedKnowledgeCards,
                  buildHighlightedKnowledgeCard(
                    json.data.compiledKnowledgeCard,
                    refreshedKnowledgeCards.find((card: KnowledgeCardPanelItem) => card.id === refreshedKnowledgeCardId) ??
                      current.find((card) => card.id === refreshedKnowledgeCardId) ??
                      null,
                  ),
                )
              : refreshedKnowledgeCards;
          return reorderKnowledgeCards(cards, refreshedKnowledgeCardId);
        });
      } else if (refreshedKnowledgeCardId && json.data?.compiledKnowledgeCard) {
        setKnowledgeCardItems((current) =>
          reorderKnowledgeCards(
            upsertKnowledgeCard(
              current,
              buildHighlightedKnowledgeCard(
                json.data.compiledKnowledgeCard,
                current.find((card) => card.id === refreshedKnowledgeCardId) ?? null,
              ),
            ),
            refreshedKnowledgeCardId,
          ),
        );
      }
      if (refreshedKnowledgeCardId) {
        setExpandedKnowledgeCardId(refreshedKnowledgeCardId);
        setHighlightedKnowledgeCardId(refreshedKnowledgeCardId);
      }
      await reloadDocumentMeta();
      if (json.data?.degradedReason) {
        const nextIssues = prependExternalFetchIssue(recentFactCheckEvidenceIssues, {
          documentId: document.id,
          context: "fact-check-evidence",
          title: `${title || document.title} 补证链接`,
          url,
          degradedReason: json.data.degradedReason,
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
        setRecentFactCheckEvidenceIssues(nextIssues);
        writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(document.id), nextIssues);
        setFactCheckEvidenceIssue({
          url,
          degradedReason: json.data.degradedReason,
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
      } else {
        const recovered = markExternalFetchIssueRecovered(recentFactCheckEvidenceIssues, {
          context: "fact-check-evidence",
          url,
        });
        if (recovered.recovered) {
          setRecentFactCheckEvidenceIssues(recovered.issues);
          writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(document.id), recovered.issues);
        }
        setFactCheckEvidenceIssue(null);
      }
      setMessage(
        json.data?.degradedReason
          ? `补证链接已入稿并刷新相关主题档案，但抓取存在降级：${json.data.degradedReason}`
          : "补证链接已入稿，事实核查与相关主题档案已刷新。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补证链接抓取失败");
    } finally {
      setAddingFactCheckEvidence(false);
    }
  }

  function dismissFactCheckEvidenceIssue(issueId: string) {
    const nextIssues = removeExternalFetchIssue(recentFactCheckEvidenceIssues, issueId);
    setRecentFactCheckEvidenceIssues(nextIssues);
    writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(document.id), nextIssues);
  }

  async function generateStageArtifact(stageCode: string) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      setMessage("当前阶段暂不支持结构化产物生成。");
      return;
    }
    const saved = await saveDocument(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setGeneratingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/${stageCode}`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "阶段产物生成失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      if (workflow.currentStageCode === stageCode) {
        await updateWorkflow(stageCode, "complete", true);
      }
      setMessage(`${GENERATABLE_STAGE_ACTIONS[stageCode].label}已完成`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "阶段产物生成失败");
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function prefetchStageArtifact(stageCode: string) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      return false;
    }
    setGeneratingStageArtifactCode(stageCode);
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/${stageCode}`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return false;
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      return true;
    } catch {
      return false;
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function applyStageArtifact(stageCode: string) {
    const action = GENERATABLE_STAGE_ACTIONS[stageCode];
    if (!action) {
      setMessage("当前阶段暂不支持应用到正文。");
      return;
    }
    const saved = await saveDocument(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setApplyingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/${stageCode}/apply`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "应用阶段产物失败");
      }
      const appliedTitle = String(json.data.title || "").trim() || title;
      setTitle(appliedTitle);
      setMarkdown(json.data.markdownContent || "");
      setHtmlPreview(json.data.htmlContent || "");
      setStatus(json.data.status || "reviewed");
      setView("edit");
      lastSavedRef.current = {
        title: appliedTitle,
        markdown: json.data.markdownContent || "",
        status: json.data.status || "reviewed",
        styleGenomeId,
        wechatTemplateId,
      };
      setSaveState("已应用到正文");
      if (stageCode === "factCheck") {
        await updateWorkflow("prosePolish", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入文笔润色。`);
      } else if (stageCode === "prosePolish") {
        await updateWorkflow("layout", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入一键排版。`);
      } else {
        setMessage(`${action.label}已写回正文`);
      }
      await reloadDocumentMeta();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "应用阶段产物失败");
    } finally {
      setApplyingStageArtifactCode(null);
    }
  }

  async function syncOutlineArtifactToNodes() {
    const saved = await saveDocument(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setSyncingOutlineArtifact(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/outlinePlanning/sync-outline`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "同步大纲树失败");
      }
      setNodes(json.data);
      await reloadDocumentMeta();
      setMessage("大纲规划已同步到左侧大纲树");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步大纲树失败");
    } finally {
      setSyncingOutlineArtifact(false);
    }
  }

  async function saveAudienceSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "audienceAnalysis") {
      setMessage("当前没有可保存的受众确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/audienceAnalysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedReaderLabel: audienceSelectionDraft.selectedReaderLabel || null,
              selectedLanguageGuidance: audienceSelectionDraft.selectedLanguageGuidance || null,
              selectedBackgroundAwareness: audienceSelectionDraft.selectedBackgroundAwareness || null,
              selectedReadabilityLevel: audienceSelectionDraft.selectedReadabilityLevel || null,
              selectedCallToAction: audienceSelectionDraft.selectedCallToAction.trim() || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存受众确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("outlinePlanning", "set", true);
      const prepared = await prefetchStageArtifact("outlinePlanning");
      setMessage(prepared ? "受众分析已确认，已自动进入大纲规划并生成首版大纲。" : "受众分析已确认，已自动进入大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存受众确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function saveOutlineSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "outlinePlanning") {
      setMessage("当前没有可保存的大纲确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/outlinePlanning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedTitle: outlineSelectionDraft.selectedTitle || null,
              selectedTitleStyle: outlineSelectionDraft.selectedTitleStyle || null,
              selectedOpeningHook: outlineSelectionDraft.selectedOpeningHook || null,
              selectedTargetEmotion: outlineSelectionDraft.selectedTargetEmotion || null,
              selectedEndingStrategy: outlineSelectionDraft.selectedEndingStrategy || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存大纲确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      const confirmedTitle = outlineSelectionDraft.selectedTitle.trim();
      if (confirmedTitle) {
        const saved = await saveDocument(undefined, undefined, true, confirmedTitle);
        if (!saved) {
          throw new Error("大纲确认已保存，但同步文稿标题失败");
        }
      }
      await updateWorkflow("deepWriting", "set", true);
      const prepared = await prefetchStageArtifact("deepWriting");
      setMessage(prepared ? "大纲规划已确认，已自动进入深度写作并生成写作执行卡。" : "大纲规划已确认，已自动进入深度写作。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存大纲确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  function updateFactCheckDecision(claim: string, status: string, patch: Partial<FactCheckClaimDecision>) {
    const normalizedClaim = String(claim || "").trim();
    if (!normalizedClaim) {
      return;
    }
    setFactCheckSelectionDraft((current) => {
      const existing = getFactCheckDecision(current, normalizedClaim, status);
      const nextDecision = {
        ...existing,
        ...patch,
        claim: normalizedClaim,
      } satisfies FactCheckClaimDecision;
      const others = current.claimDecisions.filter((item) => item.claim !== normalizedClaim);
      return {
        claimDecisions: [...others, nextDecision],
      };
    });
  }

  async function saveFactCheckSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "factCheck") {
      setMessage("当前没有可保存的核查处置结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${document.id}/stages/factCheck`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              claimDecisions: factCheckSelectionDraft.claimDecisions.map((item) => ({
                claim: item.claim,
                action: item.action,
                note: item.note.trim() || null,
              })),
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存核查处置失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("prosePolish", "set", true);
      const prepared = await prefetchStageArtifact("prosePolish");
      setMessage(prepared ? "事实核查处置已确认，已自动进入文笔润色并生成首版润色建议。" : "事实核查处置已确认，已自动进入文笔润色。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存核查处置失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function applyLayoutTemplate() {
    setApplyingLayout(true);
    setMessage("");
    try {
      const saved = await saveDocument(undefined, undefined, false);
      if (!saved) {
        return;
      }
      setView("preview");
      await updateWorkflow("layout", "complete", true);
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
        setHtmlPreview(nextPreview.finalHtml || "");
      }
      await reloadDocumentMeta();
      setMessage(
        selectedTemplate
          ? `已应用模板「${selectedTemplate.name}」，并自动生成发布最终预览。`
          : "已应用默认排版样式，并自动生成发布最终预览。",
      );
    } finally {
      setApplyingLayout(false);
    }
  }

  async function updateWorkflow(stageCode: string, action: "set" | "complete" | "fail" = "set", silent = false) {
    setUpdatingWorkflowCode(stageCode);
    try {
      const response = await fetch(`/api/documents/${document.id}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageCode, action }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "工作流更新失败");
      }
      setWorkflow(json.data);
    } catch (error) {
      if (!silent) {
        setMessage(error instanceof Error ? error.message : "工作流更新失败");
      }
    } finally {
      setUpdatingWorkflowCode(null);
    }
  }

  function renderCurrentStageArtifact() {
    if (!currentStage) {
      return <div className="mt-4 text-sm leading-7 text-stone-600">当前还没有可展示的工作流阶段。</div>;
    }
    if (currentStage.code === "deepWriting") {
      const selectedReferenceIds = new Set(selectedHistoryReferences.map((item) => item.referencedDocumentId));
      const deepWritingSections = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "sectionBlueprint") : [];
      const deepWritingVoiceChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "voiceChecklist") : [];
      const deepWritingMustUseFacts = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "mustUseFacts") : [];
      const deepWritingBannedWatchlist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "bannedWordWatchlist") : [];
      const deepWritingFinalChecklist = currentStageArtifact ? getPayloadStringArray(currentStageArtifact.payload, "finalChecklist") : [];
      const deepWritingHistoryPlans = currentStageArtifact ? getPayloadRecordArray(currentStageArtifact.payload, "historyReferencePlan") : [];
      return (
        <div className="mt-4 space-y-4">
          <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
            <div className="font-medium text-ink">{currentStageAction?.label || "生成写作执行卡"}</div>
            <div className="mt-2">
              深度写作继续沿用中间栏的 Markdown 编辑与流式生成。这里会先把标题、论点、段落推进、文风约束和关键事实整理成执行卡，再驱动正文生成。
            </div>
          </div>
          <button
            onClick={() => generateStageArtifact("deepWriting")}
            disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
            className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60"
          >
            {generatingStageArtifactCode === "deepWriting" ? "生成中..." : currentStageArtifact ? "刷新写作执行卡" : "生成写作执行卡"}
          </button>
          {currentStageArtifact ? (
            <div className="space-y-4 border border-stone-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-serifCn text-2xl text-ink">{currentStageArtifact.title}</div>
                  <div className="mt-1 text-xs text-stone-500">
                    {currentStageArtifact.updatedAt ? `更新于 ${new Date(currentStageArtifact.updatedAt).toLocaleString("zh-CN")}` : "暂无更新时间"}
                  </div>
                </div>
                <div className="text-xs text-stone-500">
                  {currentStageArtifact.provider || "local"}
                  {currentStageArtifact.model ? ` / ${currentStageArtifact.model}` : ""}
                </div>
              </div>
              {currentStageArtifact.summary ? (
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                  {currentStageArtifact.summary}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {String(currentStageArtifact.payload?.selectedTitle || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">采用标题</div>
                    <div className="mt-2 font-medium text-ink">{String(currentStageArtifact.payload?.selectedTitle)}</div>
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.writingAngle || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">写作角度</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.writingAngle)}</div>
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.openingStrategy || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">开头策略</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.openingStrategy)}</div>
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.endingStrategy || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">结尾策略</div>
                    <div className="mt-2">{String(currentStageArtifact.payload?.endingStrategy)}</div>
                  </div>
                ) : null}
              </div>
              {String(currentStageArtifact.payload?.centralThesis || "").trim() ? (
                <div className="text-sm leading-7 text-stone-700">核心观点：{String(currentStageArtifact.payload?.centralThesis)}</div>
              ) : null}
              {String(currentStageArtifact.payload?.targetEmotion || "").trim() ? (
                <div className="text-sm leading-7 text-stone-700">目标情绪：{String(currentStageArtifact.payload?.targetEmotion)}</div>
              ) : null}
              {deepWritingSections.length > 0 ? (
                <div className="space-y-3">
                  {deepWritingSections.map((section, index) => (
                    <div key={`${section.heading || index}`} className="border border-stone-300/60 px-4 py-4">
                      <div className="font-medium text-ink">{index + 1}. {String(section.heading || `章节 ${index + 1}`)}</div>
                      {String(section.goal || "").trim() ? <div className="mt-2 text-sm leading-7 text-stone-700">目标：{String(section.goal)}</div> : null}
                      {String(section.paragraphMission || "").trim() ? <div className="mt-1 text-sm leading-7 text-stone-700">段落任务：{String(section.paragraphMission)}</div> : null}
                      {getPayloadStringArray(section, "evidenceHints").length > 0 ? (
                        <div className="mt-2 text-xs leading-6 text-stone-500">
                          证据提示：{getPayloadStringArray(section, "evidenceHints").join("；")}
                        </div>
                      ) : null}
                      {String(section.transition || "").trim() ? (
                        <div className="mt-1 text-xs leading-6 text-stone-500">衔接：{String(section.transition)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {deepWritingMustUseFacts.length > 0 ? (
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">必须吃透的事实</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-700">
                    {deepWritingMustUseFacts.map((item) => (
                      <span key={item} className="border border-stone-300 bg-white px-3 py-2">{item}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {(deepWritingVoiceChecklist.length > 0 || deepWritingBannedWatchlist.length > 0 || deepWritingFinalChecklist.length > 0) ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {deepWritingVoiceChecklist.length > 0 ? (
                    <div className="border border-stone-300/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">表达约束</div>
                      <div className="mt-2 space-y-2 text-sm leading-7 text-stone-700">
                        {deepWritingVoiceChecklist.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deepWritingBannedWatchlist.length > 0 ? (
                    <div className="border border-stone-300/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">重点避开</div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-700">
                        {deepWritingBannedWatchlist.map((item) => (
                          <span key={item} className="border border-[#d8b0b2] bg-[#fff7f7] px-3 py-2 text-[#8f3136]">{item}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deepWritingFinalChecklist.length > 0 ? (
                    <div className="border border-stone-300/60 px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">终稿自检</div>
                      <div className="mt-2 space-y-2 text-sm leading-7 text-stone-700">
                        {deepWritingFinalChecklist.map((item) => (
                          <div key={item}>- {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {deepWritingHistoryPlans.length > 0 ? (
                <div className="border border-stone-300/60 bg-[#fff8eb] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">旧文自然引用计划</div>
                  <div className="mt-2 space-y-3 text-sm leading-7 text-stone-700">
                    {deepWritingHistoryPlans.map((item, index) => (
                      <div key={`${item.title || index}`}>
                        <div className="font-medium text-ink">《{String(item.title || `旧文 ${index + 1}`)}》</div>
                        {String(item.useWhen || "").trim() ? <div>使用时机：{String(item.useWhen)}</div> : null}
                        {String(item.bridgeSentence || "").trim() ? <div>桥接句：{String(item.bridgeSentence)}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {currentStageArtifact.errorMessage ? (
                <div className="border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-4 py-4 text-sm leading-7 text-[#8f3136]">
                  本次结果使用了降级产物：{currentStageArtifact.errorMessage}
                </div>
              ) : null}
            </div>
          ) : null}
          {!canUseHistoryReferences ? (
            <div className="border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-4 py-4 text-sm leading-7 text-[#8f3136]">
              {planName}套餐当前不支持历史文章自然引用。升级到 Pro 或更高套餐后，才可推荐、选择并保存最多 2 篇旧文作为正文内自然承接。
            </div>
          ) : null}
          {canUseHistoryReferences ? (
          <div className="border border-stone-300 bg-white px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">历史文章自然引用</div>
                <div className="mt-2 text-sm leading-7 text-stone-700">建议优先引用与你当前主题连续、判断互补的旧文。引用只作为自然上下文回带，不喧宾夺主。</div>
              </div>
              <button
                type="button"
                onClick={() => loadHistoryReferences(true)}
                disabled={loadingHistoryReferences || savingHistoryReferences}
                className="border border-stone-300 px-3 py-2 text-sm text-stone-700 disabled:opacity-60"
              >
                {loadingHistoryReferences ? "刷新中..." : "刷新建议"}
              </button>
            </div>
            {selectedHistoryReferences.length > 0 ? (
              <div className="mt-4 space-y-3">
                {selectedHistoryReferences.map((item) => (
                  <div key={item.referencedDocumentId} className="border border-[#dcc8a6] bg-[#fff8eb] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-ink">《{item.title}》</div>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedHistoryReferences((current) =>
                            current.filter((reference) => reference.referencedDocumentId !== item.referencedDocumentId),
                          )
                        }
                        className="text-xs text-stone-500 underline"
                      >
                        移除
                      </button>
                    </div>
                    <textarea
                      value={item.relationReason || ""}
                      onChange={(event) => updateHistoryReferenceField(item.referencedDocumentId, "relationReason", event.target.value)}
                      placeholder="这篇旧文和当前文章的关系，例如：之前谈过供给端，这次补需求端。"
                      className="mt-3 min-h-[72px] w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-7"
                    />
                    <textarea
                      value={item.bridgeSentence || ""}
                      onChange={(event) => updateHistoryReferenceField(item.referencedDocumentId, "bridgeSentence", event.target.value)}
                      placeholder="可选：给 AI 一个更自然的衔接句"
                      className="mt-3 min-h-[72px] w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-7"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={saveHistoryReferenceSelection}
                  disabled={savingHistoryReferences}
                  className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                >
                  {savingHistoryReferences ? "保存中..." : "保存自然引用设置"}
                </button>
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {loadingHistoryReferences ? (
                <div className="text-sm text-stone-600">正在加载历史文章建议...</div>
              ) : historyReferenceSuggestions.length > 0 ? (
                historyReferenceSuggestions.map((item) => {
                  const selected = selectedReferenceIds.has(item.referencedDocumentId);
                  return (
                    <div key={item.referencedDocumentId} className="border border-stone-300/60 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-ink">《{item.title}》</div>
                        <button
                          type="button"
                          onClick={() => toggleHistoryReferenceSelection(item)}
                          disabled={!selected && selectedHistoryReferences.length >= 2}
                          className={`border px-3 py-2 text-xs ${
                            selected
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 text-stone-700"
                          } disabled:opacity-60`}
                        >
                          {selected ? "已选中" : "加入引用"}
                        </button>
                      </div>
                      {item.relationReason ? <div className="mt-2 text-sm leading-7 text-stone-700">{item.relationReason}</div> : null}
                      {item.bridgeSentence ? <div className="mt-2 text-xs leading-6 text-stone-500">桥接句建议：{item.bridgeSentence}</div> : null}
                    </div>
                  );
                })
              ) : (
                <div className="border border-dashed border-stone-300 px-4 py-4 text-sm leading-7 text-stone-600">
                  当前没有可用的已发布旧文建议。先发布过往文章后，这里才会出现自然回带候选。
                </div>
              )}
            </div>
          </div>
          ) : null}
          <button onClick={generate} disabled={generating} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {generating ? "生成中..." : "开始深度写作"}
          </button>
        </div>
      );
    }
    if (currentStage.code === "layout") {
      return (
        <div className="mt-4 space-y-3">
          <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
            当前排版会把所选模板直接应用到 HTML 预览、导出 HTML 与后续微信稿箱渲染，尽量保持三者一致。
          </div>
          {selectedTemplate ? (
            <div className="border border-stone-300 bg-white px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                {selectedTemplate.meta || "模板"} · {selectedTemplate.version} · {formatTemplateAssetOwner(selectedTemplate)}
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink">{selectedTemplate.name}</div>
              <div className="mt-2 text-sm leading-7 text-stone-700">{selectedTemplate.description || "当前模板未填写说明。"} </div>
              <div className="mt-2 text-xs leading-6 text-stone-500">来源：{formatTemplateSourceSummary(selectedTemplate)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {formatTemplateConfigSummary(selectedTemplate).map((item) => (
                  <span key={`${selectedTemplate.id}-${item}`} className="border border-stone-300 bg-[#faf7f0] px-3 py-1 text-xs text-stone-700">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
              当前未显式选择模板，应用排版时会使用默认微信渲染样式。
            </div>
          )}
          <button onClick={applyLayoutTemplate} disabled={applyingLayout} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {applyingLayout ? "应用中..." : "应用排版并查看 HTML"}
          </button>
        </div>
      );
    }
    if (!currentStageAction) {
      return (
        <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
          当前阶段暂时没有结构化洞察卡。你仍可通过右侧其他模块继续配图、排版和发布。
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-4">
        <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
          <div className="font-medium text-ink">{currentStageAction.label}</div>
          <div className="mt-2">{currentStageAction.helper}</div>
        </div>
        <button
          onClick={() => generateStageArtifact(currentStage.code)}
          disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
          className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60"
        >
          {generatingStageArtifactCode === currentStage.code ? "生成中..." : currentStageArtifact ? "刷新阶段产物" : currentStageAction.label}
        </button>
        {currentStageArtifact ? (
          <div className="space-y-4 border border-stone-300 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-serifCn text-2xl text-ink">{currentStageArtifact.title}</div>
                <div className="mt-1 text-xs text-stone-500">
                  {currentStageArtifact.updatedAt ? `更新于 ${new Date(currentStageArtifact.updatedAt).toLocaleString("zh-CN")}` : "暂无更新时间"}
                </div>
              </div>
              <div className="text-xs text-stone-500">
                {currentStageArtifact.provider || "local"}
                {currentStageArtifact.model ? ` / ${currentStageArtifact.model}` : ""}
              </div>
            </div>

            {currentStageArtifact.summary ? (
              <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                {currentStageArtifact.summary}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => applyStageArtifact(currentStage.code)}
                disabled={Boolean(applyingStageArtifactCode) || Boolean(generatingStageArtifactCode)}
                className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
              >
                {applyingStageArtifactCode === currentStage.code ? "应用中..." : getStageApplyButtonLabel(currentStage.code)}
              </button>
              {currentStage.code === "outlinePlanning" ? (
                <button
                  onClick={syncOutlineArtifactToNodes}
                  disabled={syncingOutlineArtifact || Boolean(generatingStageArtifactCode) || Boolean(applyingStageArtifactCode)}
                  className="border border-stone-300 px-4 py-2 text-sm text-stone-700 disabled:opacity-60"
                >
                  {syncingOutlineArtifact ? "同步中..." : "同步到大纲树"}
                </button>
              ) : null}
            </div>

            {currentStage.code === "audienceAnalysis" ? (
              <>
                {String(currentStageArtifact.payload?.coreReaderLabel || "").trim() ? (
                  <div className="text-sm text-stone-700">核心受众：{String(currentStageArtifact.payload?.coreReaderLabel)}</div>
                ) : null}
                {audienceReaderSegments.length > 0 ? (
                  <div className="space-y-3">
                    {audienceReaderSegments.map((segment, index) => (
                      <div key={`${segment.label || index}`} className="border border-stone-300/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-ink">{String(segment.label || `人群 ${index + 1}`)}</div>
                          <button
                            type="button"
                            onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedReaderLabel: String(segment.label || "").trim() }))}
                            className={`border px-3 py-1 text-xs ${
                              audienceSelectionDraft.selectedReaderLabel === String(segment.label || "").trim()
                                ? "border-cinnabar bg-cinnabar text-white"
                                : "border-stone-300 text-stone-700"
                            }`}
                          >
                            {audienceSelectionDraft.selectedReaderLabel === String(segment.label || "").trim() ? "已选中" : "设为目标读者"}
                          </button>
                        </div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">痛点：{String(segment.painPoint || "暂无")}</div>
                        <div className="mt-1 text-sm leading-7 text-stone-700">动机：{String(segment.motivation || "暂无")}</div>
                        <div className="mt-1 text-sm leading-7 text-stone-700">推荐语气：{String(segment.preferredTone || "暂无")}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {audienceLanguageGuidance.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">表达建议确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceLanguageGuidance.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedLanguageGuidance: item }))}
                          className={`border px-3 py-2 text-left ${
                            audienceSelectionDraft.selectedLanguageGuidance === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {audienceBackgroundAwarenessOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">背景预设确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceBackgroundAwarenessOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedBackgroundAwareness: item }))}
                          className={`border px-3 py-2 text-left ${
                            audienceSelectionDraft.selectedBackgroundAwareness === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {audienceReadabilityOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">语言通俗度确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {audienceReadabilityOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedReadabilityLevel: item }))}
                          className={`border px-3 py-2 text-left ${
                            audienceSelectionDraft.selectedReadabilityLevel === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">结尾动作确认</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    {audienceCallToActionOptions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAudienceSelectionDraft((current) => ({ ...current, selectedCallToAction: item }))}
                        className={`border px-3 py-2 text-left ${
                          audienceSelectionDraft.selectedCallToAction === item
                            ? "border-cinnabar bg-cinnabar text-white"
                            : "border-stone-300 bg-white text-stone-700"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={audienceSelectionDraft.selectedCallToAction}
                    onChange={(event) => setAudienceSelectionDraft((current) => ({ ...current, selectedCallToAction: event.target.value }))}
                    placeholder="也可以手动补充你希望文末收束成什么动作"
                    className="mt-3 min-h-[88px] w-full border border-stone-300 px-3 py-2 text-sm leading-7"
                  />
                </div>
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                  <div>已确认目标读者：{audienceSelectionDraft.selectedReaderLabel || "未确认"}</div>
                  <div className="mt-1">已确认表达方式：{audienceSelectionDraft.selectedLanguageGuidance || "未确认"}</div>
                  <div className="mt-1">已确认背景预设：{audienceSelectionDraft.selectedBackgroundAwareness || "未确认"}</div>
                  <div className="mt-1">已确认语言通俗度：{audienceSelectionDraft.selectedReadabilityLevel || "未确认"}</div>
                  <div className="mt-1">已确认结尾动作：{audienceSelectionDraft.selectedCallToAction || "未确认"}</div>
                </div>
                <button
                  type="button"
                  onClick={saveAudienceSelection}
                  disabled={savingAudienceSelection}
                  className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                >
                  {savingAudienceSelection ? "保存中..." : "确认这组受众选择"}
                </button>
                {getPayloadStringArray(currentStageArtifact.payload, "contentWarnings").length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">注意事项</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-stone-700">
                      {getPayloadStringArray(currentStageArtifact.payload, "contentWarnings").map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "outlinePlanning" ? (
              <>
                <div className="space-y-4 border border-stone-300/60 bg-[#faf7f0] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">补充观点与素材注入</div>
                      <div className="mt-2 text-sm leading-7 text-stone-700">
                        这里的“用户观点”只作为补充校正，不会覆盖整篇文章的主判断。素材可以是可改写文字，也可以是必须原样插入的截图。
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loadOutlineMaterials(true)}
                      disabled={loadingOutlineMaterials || savingOutlineMaterials}
                      className="border border-stone-300 px-3 py-2 text-sm text-stone-700 disabled:opacity-60"
                    >
                      {loadingOutlineMaterials ? "刷新中..." : "刷新素材面板"}
                    </button>
                  </div>
                  <div className="grid gap-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <textarea
                        key={`viewpoint-${index}`}
                        value={supplementalViewpointsDraft[index] || ""}
                        onChange={(event) =>
                          setSupplementalViewpointsDraft((current) =>
                            Array.from({ length: 3 }, (_, draftIndex) =>
                              draftIndex === index ? event.target.value : current[draftIndex] || "",
                            ),
                          )
                        }
                        placeholder={`补充观点 ${index + 1}，例如：这篇不要只讲结论，要补清楚代价落在谁身上`}
                        className="min-h-[72px] w-full border border-stone-300 bg-white px-3 py-2 text-sm leading-7"
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={saveSupplementalViewpoints}
                    disabled={savingOutlineMaterials}
                    className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                  >
                    {savingOutlineMaterials ? "保存中..." : "保存补充观点"}
                  </button>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="border border-stone-300 bg-white px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">挂载已有素材</div>
                      <select
                        value={outlineMaterialNodeId}
                        onChange={(event) => setOutlineMaterialNodeId(event.target.value)}
                        className="mt-3 w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm"
                      >
                        <option value="">选择大纲节点</option>
                        {(outlineMaterials?.nodes ?? nodes).map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.title}
                          </option>
                        ))}
                      </select>
                      <select
                        value={outlineMaterialUsageMode}
                        onChange={(event) => setOutlineMaterialUsageMode(event.target.value === "image" ? "image" : "rewrite")}
                        className="mt-3 w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm"
                      >
                        <option value="rewrite">作为可改写素材</option>
                        <option value="image">作为原样截图插入</option>
                      </select>
                      <select
                        value={outlineMaterialFragmentId}
                        onChange={(event) => setOutlineMaterialFragmentId(event.target.value)}
                        className="mt-3 w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm"
                      >
                        <option value="">选择已有素材</option>
                        {fragmentPool
                          .filter((fragment) => {
                            const selectedNode = (outlineMaterials?.nodes ?? nodes).find((node) => String(node.id) === outlineMaterialNodeId);
                            return !selectedNode?.fragments.some((item) => item.id === fragment.id);
                          })
                          .map((fragment) => (
                            <option key={fragment.id} value={fragment.id}>
                              {fragment.shared ? "[共享] " : ""}
                              {fragment.title ? `${fragment.title} · ` : ""}
                              {formatFragmentSourceType(fragment.sourceType)} · {fragment.distilledContent.slice(0, 28)}
                            </option>
                          ))}
                      </select>
                      <div className="mt-2 text-xs leading-6 text-stone-500">如果截图已经在碎片库里，可直接在这里选择“原样截图插入”；也可以在右侧直接上传新截图。</div>
                      <button
                        type="button"
                        onClick={() => submitOutlineMaterial("attachExisting")}
                        disabled={savingOutlineMaterials}
                        className="mt-3 border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                      >
                        {savingOutlineMaterials ? "处理中..." : "挂到当前节点"}
                      </button>
                    </div>
                    <div className="border border-stone-300 bg-white px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("manual")}
                          className={`border px-3 py-2 text-sm ${outlineMaterialCreateMode === "manual" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 text-stone-700"}`}
                        >
                          新建文字素材
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("url")}
                          className={`border px-3 py-2 text-sm ${outlineMaterialCreateMode === "url" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 text-stone-700"}`}
                        >
                          新建链接素材
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutlineMaterialCreateMode("screenshot")}
                          className={`border px-3 py-2 text-sm ${outlineMaterialCreateMode === "screenshot" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 text-stone-700"}`}
                        >
                          新建截图素材
                        </button>
                      </div>
                      <input
                        value={outlineMaterialTitle}
                        onChange={(event) => setOutlineMaterialTitle(event.target.value)}
                        placeholder="素材标题，可选"
                        className="mt-3 w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm"
                      />
                      {outlineMaterialCreateMode === "manual" ? (
                        <textarea
                          value={outlineMaterialContent}
                          onChange={(event) => setOutlineMaterialContent(event.target.value)}
                          placeholder="输入要补进大纲的文字片段，系统会提纯后挂到节点。"
                          className="mt-3 min-h-[120px] w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm leading-7"
                        />
                      ) : outlineMaterialCreateMode === "url" ? (
                        <input
                          value={outlineMaterialUrl}
                          onChange={(event) => setOutlineMaterialUrl(event.target.value)}
                          placeholder="https://..."
                          className="mt-3 w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm"
                        />
                      ) : (
                        <div className="mt-3 space-y-3">
                          <input
                            ref={outlineMaterialScreenshotInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleOutlineMaterialScreenshotFileChange}
                            className="block w-full text-sm text-stone-600 file:mr-3 file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:text-white"
                          />
                          <div className="text-xs leading-6 text-stone-500">
                            {outlineMaterialScreenshotFileName
                              ? `已选择截图：${outlineMaterialScreenshotFileName}。创建后会自动以“原样截图插入”挂到当前节点。`
                              : "支持 png/jpg/webp，上传后会直接创建截图碎片并挂到当前节点。"}
                          </div>
                          <textarea
                            value={outlineMaterialContent}
                            onChange={(event) => setOutlineMaterialContent(event.target.value)}
                            placeholder="可选：补一句截图上下文，帮助后续视觉理解和节点归位。"
                            className="min-h-[96px] w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm leading-7"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          submitOutlineMaterial(
                            outlineMaterialCreateMode === "manual"
                              ? "createManual"
                              : outlineMaterialCreateMode === "url"
                                ? "createUrl"
                                : "createScreenshot",
                          )
                        }
                        disabled={savingOutlineMaterials}
                        className="mt-3 border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                      >
                        {savingOutlineMaterials ? "处理中..." : "创建并挂到节点"}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(outlineMaterials?.nodes ?? nodes).map((node) => (
                      <div key={`outline-material-node-${node.id}`} className="border border-stone-300 bg-white px-4 py-4">
                        <div className="font-medium text-ink">{node.title}</div>
                        {node.fragments.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {node.fragments.map((fragment) => (
                              <span key={`${node.id}-${fragment.id}`} className="border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs leading-6 text-stone-700">
                                {fragment.title || `素材 #${fragment.id}`} · {formatFragmentSourceType(fragment.sourceType)} · {formatFragmentUsageMode(fragment.usageMode)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-stone-500">这个节点还没有挂载素材。</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {outlineTitleOptions.length > 0 ? (
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-stone-500">标题三选一</div>
                      <div className="mt-2 text-sm leading-7 text-stone-700">确认后会同步文稿标题，深度写作默认沿用这个标题。</div>
                    </div>
                    <div className="grid gap-3">
                      {outlineTitleOptions.map((item, index) => {
                        const optionTitle = String(item.title || "").trim();
                        const optionStyle = String(item.styleLabel || "").trim();
                        const optionAngle = String(item.angle || "").trim();
                        const optionReason = String(item.reason || "").trim();
                        const optionRiskHint = String(item.riskHint || "").trim();
                        const isSelected = outlineSelectionDraft.selectedTitle === optionTitle;
                        return (
                          <button
                            key={`${optionTitle || index}`}
                            type="button"
                            onClick={() =>
                              setOutlineSelectionDraft((current) => ({
                                ...current,
                                selectedTitle: optionTitle,
                                selectedTitleStyle: optionStyle,
                              }))
                            }
                            className={`border px-4 py-4 text-left ${
                              isSelected ? "border-cinnabar bg-[#fff7f2]" : "border-stone-300 bg-white"
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`px-2 py-1 text-xs ${isSelected ? "bg-cinnabar text-white" : "bg-[#faf7f0] text-stone-600"}`}>
                                {optionStyle || `标题方案 ${index + 1}`}
                              </span>
                              {optionAngle ? <span className="text-xs text-stone-500">{optionAngle}</span> : null}
                            </div>
                            <div className="mt-3 text-base font-medium leading-7 text-ink">{optionTitle || `标题方案 ${index + 1}`}</div>
                            {optionReason ? <div className="mt-2 text-sm leading-7 text-stone-700">{optionReason}</div> : null}
                            {optionRiskHint ? (
                              <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                                风险提示：{optionRiskHint}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    {outlineTitleStrategyNotes.length > 0 ? (
                      <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                        {outlineTitleStrategyNotes.join("；")}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.centralThesis || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    核心观点：{String(currentStageArtifact.payload?.centralThesis)}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "supplementalViewpoints").length > 0 ? (
                  <div className="text-sm leading-7 text-stone-700">
                    补充观点：{getPayloadStringArray(currentStageArtifact.payload, "supplementalViewpoints").join("；")}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "viewpointIntegration").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "viewpointIntegration").map((item, index) => (
                      <div key={`${item.viewpoint || index}`} className="border border-stone-300/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(item.viewpoint || `补充观点 ${index + 1}`)}</div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">
                          处理方式：{String(item.action || "未说明")}；{String(item.note || "暂无说明")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "materialBundle").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "materialBundle").map((item, index) => (
                      <div key={`${item.fragmentId || index}`} className="border border-stone-300/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(item.title || `素材 ${index + 1}`)}</div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">
                          {formatFragmentSourceType(String(item.sourceType || ""))} · {formatFragmentUsageMode(String(item.usageMode || ""))}
                        </div>
                        {String(item.summary || "").trim() ? <div className="mt-2 text-sm leading-7 text-stone-700">{String(item.summary)}</div> : null}
                        {String(item.screenshotPath || "").trim() ? <div className="mt-2 text-xs text-stone-500">截图路径：{String(item.screenshotPath)}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {outlineOpeningHookOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">开头策略确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {outlineOpeningHookOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedOpeningHook: item }))}
                          className={`border px-3 py-2 text-left ${
                            outlineSelectionDraft.selectedOpeningHook === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {outlineTargetEmotionOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">目标情绪确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {outlineTargetEmotionOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedTargetEmotion: item }))}
                          className={`border px-3 py-2 text-left ${
                            outlineSelectionDraft.selectedTargetEmotion === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "outlineSections").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "outlineSections").map((section, index) => (
                      <div key={`${section.heading || index}`} className="border border-stone-300/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(section.heading || `章节 ${index + 1}`)}</div>
                        <div className="mt-2 text-sm leading-7 text-stone-700">目标：{String(section.goal || "暂无")}</div>
                        {getPayloadStringArray(section, "keyPoints").length > 0 ? (
                          <div className="mt-2 text-sm leading-7 text-stone-700">
                            关键点：{getPayloadStringArray(section, "keyPoints").join("；")}
                          </div>
                        ) : null}
                        {getPayloadStringArray(section, "evidenceHints").length > 0 ? (
                          <div className="mt-2 text-sm leading-7 text-stone-700">
                            证据提示：{getPayloadStringArray(section, "evidenceHints").join("；")}
                          </div>
                        ) : null}
                        {Array.isArray(section.materialRefs) && section.materialRefs.length > 0 ? (
                          <div className="mt-2 text-xs leading-6 text-stone-500">引用素材：{section.materialRefs.join("、")}</div>
                        ) : null}
                        {String(section.transition || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-stone-700">衔接：{String(section.transition)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "materialGapHints").length > 0 ? (
                  <div className="border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-4 py-4 text-sm leading-7 text-[#8f3136]">
                    {getPayloadStringArray(currentStageArtifact.payload, "materialGapHints").join("；")}
                  </div>
                ) : null}
                {outlineEndingStrategyOptions.length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">结尾策略确认</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-sm">
                      {outlineEndingStrategyOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setOutlineSelectionDraft((current) => ({ ...current, selectedEndingStrategy: item }))}
                          className={`border px-3 py-2 text-left ${
                            outlineSelectionDraft.selectedEndingStrategy === item
                              ? "border-cinnabar bg-cinnabar text-white"
                              : "border-stone-300 bg-white text-stone-700"
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                  <div>已确认标题：{outlineSelectionDraft.selectedTitle || String(currentStageArtifact.payload?.workingTitle || "").trim() || "未确认"}</div>
                  <div className="mt-1">标题风格：{outlineSelectionDraft.selectedTitleStyle || "未确认"}</div>
                  <div>已确认开头策略：{outlineSelectionDraft.selectedOpeningHook || "未确认"}</div>
                  <div className="mt-1">已确认目标情绪：{outlineSelectionDraft.selectedTargetEmotion || "未确认"}</div>
                  <div className="mt-1">已确认结尾策略：{outlineSelectionDraft.selectedEndingStrategy || "未确认"}</div>
                </div>
                <button
                  type="button"
                  onClick={saveOutlineSelection}
                  disabled={savingAudienceSelection || !outlineSelectionDraft.selectedTitle.trim()}
                  className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                >
                  {savingAudienceSelection ? "保存中..." : "确认这组大纲选择"}
                </button>
                {String(currentStageArtifact.payload?.endingStrategy || "").trim() ? (
                  <div className="text-sm leading-7 text-stone-700">结尾策略：{String(currentStageArtifact.payload?.endingStrategy)}</div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "factCheck" ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                  <span className="border border-stone-300 px-2 py-1">{formatFactRiskLabel(String(currentStageArtifact.payload?.overallRisk || ""))}</span>
                  {String(currentStageArtifact.payload?.topicAlignment || "").trim() ? (
                    <span className="border border-stone-300 px-2 py-1">主题匹配已评估</span>
                  ) : null}
                  <span className="border border-stone-300 px-2 py-1">已确认处置 {factCheckResolvedCount}/{factCheckChecks.length || 0}</span>
                </div>
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">补充外部证据</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">
                    输入一篇报道、公告或原始资料链接，系统会自动抓取、提纯并挂到当前文稿，再立即刷新事实核查结果。
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={factCheckEvidenceUrl}
                      onChange={(event) => setFactCheckEvidenceUrl(event.target.value)}
                      placeholder="https://..."
                      className="min-w-0 flex-1 border border-stone-300 bg-white px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => addFactCheckEvidenceSource()}
                      disabled={addingFactCheckEvidence}
                      className="bg-cinnabar px-4 py-2 text-sm text-white disabled:opacity-60"
                    >
                      {addingFactCheckEvidence ? "抓取中..." : "抓取补证并刷新核查"}
                    </button>
                  </div>
                  {factCheckEvidenceIssue ? (
                    <div className="mt-3 space-y-3 border border-[#dfd2b0] bg-[#fff8e8] px-4 py-4 text-sm leading-7 text-[#7d6430]">
                      <div className="text-xs uppercase tracking-[0.18em] text-[#7d6430]">补证链接降级</div>
                      <div>最近一次补证抓取已降级写入：{factCheckEvidenceIssue.degradedReason}</div>
                      <div className="break-all text-xs leading-6 text-stone-600">{factCheckEvidenceIssue.url}</div>
                      <div className="flex flex-wrap gap-2">
                        {factCheckEvidenceIssue.retryRecommended ? (
                          <button
                            type="button"
                            onClick={() => addFactCheckEvidenceSource(factCheckEvidenceIssue.url)}
                            disabled={addingFactCheckEvidence}
                            className="border border-cinnabar bg-white px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                          >
                            {addingFactCheckEvidence ? "重试中..." : "重试补证抓取"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setFactCheckEvidenceUrl(factCheckEvidenceIssue.url)}
                          className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
                        >
                          回填链接
                        </button>
                        <button
                          type="button"
                          onClick={() => setFactCheckEvidenceIssue(null)}
                          className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
                        >
                          清除提示
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {recentFactCheckEvidenceIssues.length > 0 ? (
                    <div className="mt-3 space-y-3 border border-stone-300/60 bg-white px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近补证异常记录</div>
                      <div className="text-xs leading-6 text-stone-500">
                        来源分类：事实核查补证 · 共 {recentFactCheckEvidenceIssues.length} 条 · 待重试 {factCheckRetryableCount} 条 · 最近恢复成功 {factCheckRecoveredCount} 次
                      </div>
                      {recentFactCheckEvidenceIssues.map((issue) => (
                        <div key={issue.id} className="border border-stone-300/60 bg-[#faf7f0] px-4 py-4 text-sm leading-7 text-stone-700">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="font-medium text-ink">{issue.title || "补证链接异常"}</div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                              <span>{new Date(issue.createdAt).toLocaleString("zh-CN")}</span>
                              <span className={`border px-2 py-1 ${issue.resolvedAt ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#dfd2b0] bg-[#fff8e8] text-[#7d6430]"}`}>
                                {issue.resolvedAt ? "已恢复" : "待处理"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2">{issue.degradedReason}</div>
                          <div className="mt-2 break-all text-xs leading-6 text-stone-500">{issue.url}</div>
                          {issue.resolvedAt ? (
                            <div className="mt-2 text-xs leading-6 text-emerald-700">
                              最近恢复：{new Date(issue.resolvedAt).toLocaleString("zh-CN")} · 成功恢复 {issue.recoveryCount} 次
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {issue.retryRecommended ? (
                              <button
                                type="button"
                                onClick={() => addFactCheckEvidenceSource(issue.url)}
                                disabled={addingFactCheckEvidence}
                                className="border border-cinnabar bg-white px-3 py-2 text-sm text-cinnabar disabled:opacity-60"
                              >
                                {addingFactCheckEvidence ? "重试中..." : "再次重试"}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setFactCheckEvidenceUrl(issue.url)}
                              className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                            >
                              回填链接
                            </button>
                            <button
                              type="button"
                              onClick={() => dismissFactCheckEvidenceIssue(issue.id)}
                              className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700"
                            >
                              删除记录
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                  每条核查项都可以单独指定处理策略。保存后，“精修高风险句子”会按这些策略回写正文，而不是统一保守弱化。
                </div>
                {factCheckChecks.length > 0 ? (
                  <div className="space-y-3">
                    {factCheckChecks.map((check, index) => {
                      const claim = String(check.claim || "").trim();
                      const status = String(check.status || "needs_source").trim();
                      const currentDecision = getFactCheckDecision(factCheckSelectionDraft, claim, status);
                      return (
                        <div key={`${check.claim || index}`} className="border border-stone-300/60 px-4 py-3">
                          <div className="font-medium text-ink">{String(check.claim || `核查项 ${index + 1}`)}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                            <span>状态：{status}</span>
                            <span className="border border-stone-300 px-2 py-1">当前处置：{formatFactCheckActionLabel(currentDecision.action)}</span>
                          </div>
                          <div className="mt-2 text-sm leading-7 text-stone-700">{String(check.suggestion || "暂无建议")}</div>
                          <div className="mt-4">
                            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">逐条处置策略</div>
                            <div className="mt-2 flex flex-wrap gap-2 text-sm">
                              {getFactCheckActionOptions(status).map((option) => (
                                <button
                                  key={`${claim}-${option.value}`}
                                  type="button"
                                  onClick={() => updateFactCheckDecision(claim, status, { action: option.value })}
                                  className={`border px-3 py-2 ${
                                    currentDecision.action === option.value
                                      ? "border-cinnabar bg-cinnabar text-white"
                                      : "border-stone-300 bg-white text-stone-700"
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={currentDecision.note}
                              onChange={(event) => updateFactCheckDecision(claim, status, { note: event.target.value })}
                              placeholder="可选：补充处理备注，例如“等官方公告出来再补数据”"
                              className="mt-3 min-h-[80px] w-full border border-stone-300 px-3 py-2 text-sm leading-7"
                            />
                          </div>
                          {(() => {
                            const evidenceCard = getPayloadRecordArray(currentStageArtifact.payload, "evidenceCards").find(
                              (item) => String(item.claim || "").trim() === String(check.claim || "").trim(),
                            );
                            const evidenceItems = getPayloadRecordArray(evidenceCard, "evidenceItems");
                            if (!evidenceCard) {
                              return null;
                            }
                            return (
                              <div className="mt-4 border-t border-stone-200 pt-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                                  <span className="uppercase tracking-[0.18em]">证据摘要卡</span>
                                  <span className="border border-stone-300 px-2 py-1">
                                    {formatEvidenceSupportLevel(String(evidenceCard.supportLevel || ""))}
                                  </span>
                                </div>
                                {evidenceItems.length > 0 ? (
                                  <div className="mt-3 space-y-3">
                                    {evidenceItems.map((item, evidenceIndex) => (
                                      <div key={`${item.title || evidenceIndex}`} className="border border-stone-300/60 bg-[#faf7f0] px-3 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="text-sm font-medium text-ink">{String(item.title || `证据 ${evidenceIndex + 1}`)}</div>
                                          <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">
                                            {String(item.sourceType || "manual")}
                                          </div>
                                        </div>
                                        <div className="mt-2 text-sm leading-7 text-stone-700">{String(item.excerpt || "暂无摘要")}</div>
                                        {String(item.rationale || "").trim() ? (
                                          <div className="mt-2 text-xs leading-6 text-stone-500">{String(item.rationale)}</div>
                                        ) : null}
                                        {String(item.sourceUrl || "").trim() ? (
                                          <a
                                            href={String(item.sourceUrl)}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-3 inline-block border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700"
                                          >
                                            打开原始链接
                                          </a>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-3 border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-3 py-3 text-xs leading-6 text-[#8f3136]">
                                    当前没有命中的可核对证据，建议补充原始链接、截图或数据来源。
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {factCheckSelectionDraft.claimDecisions.length > 0 ? (
                  <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                    {factCheckSelectionDraft.claimDecisions.slice(0, 6).map((item) => (
                      <div key={item.claim}>
                        {item.claim}：{formatFactCheckActionLabel(item.action)}{item.note ? `；备注：${item.note}` : ""}
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={saveFactCheckSelection}
                  disabled={savingAudienceSelection}
                  className="border border-cinnabar px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                >
                  {savingAudienceSelection ? "保存中..." : "确认这组核查处置"}
                </button>
                {String(currentStageArtifact.payload?.personaAlignment || "").trim() ? (
                  <div className="text-sm leading-7 text-stone-700">人设匹配：{String(currentStageArtifact.payload?.personaAlignment)}</div>
                ) : null}
                {String(currentStageArtifact.payload?.topicAlignment || "").trim() ? (
                  <div className="text-sm leading-7 text-stone-700">选题匹配：{String(currentStageArtifact.payload?.topicAlignment)}</div>
                ) : null}
              </>
            ) : null}

            {currentStage.code === "prosePolish" ? (
              <>
                {String(currentStageArtifact.payload?.overallDiagnosis || "").trim() ? (
                  <div className="border border-stone-300/60 px-4 py-3 text-sm leading-7 text-stone-700">
                    诊断：{String(currentStageArtifact.payload?.overallDiagnosis)}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "strengths").length > 0 ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">当前优点</div>
                    <div className="mt-2 space-y-2 text-sm leading-7 text-stone-700">
                      {getPayloadStringArray(currentStageArtifact.payload, "strengths").map((item) => (
                        <div key={item}>- {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "issues").length > 0 ? (
                  <div className="space-y-3">
                    {getPayloadRecordArray(currentStageArtifact.payload, "issues").map((issue, index) => (
                      <div key={`${issue.type || index}`} className="border border-stone-300/60 px-4 py-3">
                        <div className="font-medium text-ink">{String(issue.type || `问题 ${index + 1}`)}</div>
                        {String(issue.example || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-stone-700">示例：{String(issue.example)}</div>
                        ) : null}
                        <div className="mt-2 text-sm leading-7 text-stone-700">建议：{String(issue.suggestion || "暂无")}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {getPayloadRecordArray(currentStageArtifact.payload, "languageGuardHits").length > 0 ? (
                  <div className="space-y-3">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">死刑词与句式命中</div>
                    {getPayloadRecordArray(currentStageArtifact.payload, "languageGuardHits").map((hit, index) => (
                      <div key={`${hit.ruleId || hit.patternText || index}`} className="border border-[#d8b0b2] bg-[#fff7f7] px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#8f3136]">
                          <span className="border border-[#d8b0b2] px-2 py-1">
                            {String(hit.ruleKind || "") === "pattern" ? "句式" : "词语"}
                          </span>
                          <span className="border border-[#d8b0b2] px-2 py-1">
                            {String(hit.scope || "") === "system" ? "系统默认" : "自定义"}
                          </span>
                          <span className="border border-[#d8b0b2] px-2 py-1">命中：{String(hit.matchedText || hit.patternText || "未命名规则")}</span>
                        </div>
                        {String(hit.rewriteHint || "").trim() ? (
                          <div className="mt-2 text-sm leading-7 text-[#8f3136]">改写建议：{String(hit.rewriteHint)}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {String(currentStageArtifact.payload?.rewrittenLead || "").trim() ? (
                  <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                    首段改写建议：{String(currentStageArtifact.payload?.rewrittenLead)}
                  </div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "punchlines").length > 0 ? (
                  <div className="text-sm leading-7 text-stone-700">金句候选：{getPayloadStringArray(currentStageArtifact.payload, "punchlines").join("；")}</div>
                ) : null}
                {getPayloadStringArray(currentStageArtifact.payload, "rhythmAdvice").length > 0 ? (
                  <div className="text-sm leading-7 text-stone-700">节奏建议：{getPayloadStringArray(currentStageArtifact.payload, "rhythmAdvice").join("；")}</div>
                ) : null}
              </>
            ) : null}

            {currentStageArtifact.errorMessage ? (
              <div className="border border-[#dfd2b0] bg-[#fff8e8] px-4 py-3 text-sm leading-7 text-[#7d6430]">
                本次结果使用了降级产物：{currentStageArtifact.errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
            当前阶段还没有生成结构化产物。建议先保存正文，再生成对应洞察卡。
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
      <aside className="space-y-4 border border-stone-300/40 bg-[#f4efe6] p-5">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">大纲树与碎片挂载</div>
          <div className="mt-4">
            <DocumentOutlineClient documentId={document.id} nodes={nodes} fragments={fragmentPool} onChange={reloadDocumentMeta} />
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
            disabled={!canUseStyleGenomes}
            className="min-w-[220px] border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400"
          >
            <option value="">{canUseStyleGenomes ? "默认写作规则" : "当前套餐不可套用排版基因"}</option>
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
        {!canUseStyleGenomes ? (
          <div className="mt-4 border border-stone-300/40 bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
            当前套餐只能浏览排版基因，不能把它挂到文稿里。升级到 Pro 或更高套餐后，才可在这里套用自己 Fork 或创建的排版基因。
          </div>
        ) : null}
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
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">九段式工作流</div>
          <div className="mt-4 space-y-2">
            {workflow.stages.map((stage, index) => (
              <button
                key={stage.code}
                onClick={() => updateWorkflow(stage.code, "set")}
                disabled={updatingWorkflowCode !== null}
                className={`block w-full border px-4 py-3 text-left transition-colors ${
                  stage.status === "current"
                    ? "border-cinnabar bg-white"
                    : stage.status === "completed"
                      ? "border-stone-300 bg-white"
                      : stage.status === "failed"
                        ? "border-[#d8b0b2] bg-[#fff3f3]"
                        : "border-stone-300/40 bg-white/70"
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">
                    Step {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className={`text-xs ${stage.status === "failed" ? "text-[#8f3136]" : stage.status === "current" ? "text-cinnabar" : "text-stone-500"}`}>
                    {formatWorkflowStageStatus(stage.status)}
                  </div>
                </div>
                <div className="mt-2 font-serifCn text-xl text-ink">{stage.title}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs leading-6 text-stone-500">点击任一阶段即可切换当前进度；当前阶段之前的步骤会自动标记为已完成。</div>
        </div>
        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">阶段洞察卡</div>
              <div className="mt-2 text-sm leading-7 text-stone-600">
                {currentStage ? `当前阶段：${currentStage.title}` : "根据当前工作流阶段显示对应的结构化产物。"}
              </div>
            </div>
            <span className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-600">{stageArtifacts.length} 条</span>
          </div>
          {renderCurrentStageArtifact()}
        </div>
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
                const highlighted = highlightedKnowledgeCardId === card.id;
                return (
                  <article key={card.id} className={`border bg-white p-4 ${highlighted ? "border-cinnabar shadow-[0_0_0_1px_rgba(167,48,50,0.08)]" : "border-stone-300"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-serifCn text-xl text-ink">{card.title}</div>
                          {highlighted ? <span className="border border-cinnabar/30 bg-[#fff4f1] px-2 py-1 text-[11px] text-cinnabar">刚更新</span> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-stone-500">
                          <span className="border border-stone-300 px-2 py-1">{card.cardType}</span>
                          <span className="border border-stone-300 px-2 py-1">{formatKnowledgeStatus(card.status)}</span>
                          <span className="border border-stone-300 px-2 py-1">{card.workspaceScope === "personal" ? "个人作用域" : card.workspaceScope}</span>
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
                          onClick={() => {
                            setExpandedKnowledgeCardId(expanded ? null : card.id);
                            if (highlighted) {
                              setHighlightedKnowledgeCardId(null);
                            }
                          }}
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
                    {card.conflictFlags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {card.conflictFlags.map((flag) => (
                          <span key={`${card.id}-flag-${flag}`} className="border border-[#d8b0b2] bg-[#fff3f3] px-2 py-1 text-[11px] text-[#8f3136]">
                            {flag}
                          </span>
                        ))}
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
                        {card.relatedCards.length > 0 ? (
                          <div>
                            <div className="text-xs uppercase tracking-[0.2em] text-stone-500">关联档案</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {card.relatedCards.slice(0, 3).map((relatedCard) => (
                                <span
                                  key={`${card.id}-related-${relatedCard.id}`}
                                  className="border border-stone-200 bg-[#f7f3eb] px-3 py-2 text-xs leading-6 text-stone-700"
                                >
                                  <span className="mr-2 text-stone-500">{relatedCard.linkType}</span>
                                  {relatedCard.title}
                                </span>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">即时语言守卫命中</div>
            {liveLanguageGuardHits.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs text-stone-500">
                <span className="border border-stone-300 bg-white px-2 py-1">词语 {liveLanguageGuardSummary.tokenCount}</span>
                <span className="border border-stone-300 bg-white px-2 py-1">句式 {liveLanguageGuardSummary.patternCount}</span>
                <span className="border border-[#d8b0b2] bg-[#fff7f7] px-2 py-1 text-[#8f3136]">高风险 {liveLanguageGuardSummary.highSeverityCount}</span>
              </div>
            ) : null}
          </div>
          {liveLanguageGuardHits.length === 0 ? (
            <div className="mt-3 text-sm leading-7 text-stone-600">当前文稿未命中语言守卫规则。</div>
          ) : (
            <div className="mt-3 space-y-3">
              {liveLanguageGuardHits.map((hit, index) => (
                <div
                  key={`${hit.ruleId}-${hit.matchedText}-${index}`}
                  className={`border px-4 py-3 ${hit.severity === "high" ? "border-[#d8b0b2] bg-[#fff7f7]" : "border-stone-300 bg-white"}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-[#d8b0b2] text-[#8f3136]" : "border-stone-300 text-stone-600"}`}>
                      {hit.ruleKind === "pattern" ? "句式" : "词语"}
                    </span>
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-[#d8b0b2] text-[#8f3136]" : "border-stone-300 text-stone-600"}`}>
                      {hit.scope === "system" ? "系统默认" : "自定义"}
                    </span>
                    <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-[#d8b0b2] text-[#8f3136]" : "border-stone-300 text-stone-600"}`}>
                      {hit.severity === "high" ? "高风险" : "提醒"}
                    </span>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-ink">
                    命中内容：<span className="font-medium">{hit.matchedText || hit.patternText}</span>
                  </div>
                  {hit.ruleKind === "pattern" && hit.patternText !== hit.matchedText ? (
                    <div className="mt-1 text-xs leading-6 text-stone-500">句式模板：{hit.patternText}</div>
                  ) : null}
                  {hit.rewriteHint ? (
                    <div className={`mt-2 text-sm leading-7 ${hit.severity === "high" ? "text-[#8f3136]" : "text-stone-700"}`}>
                      改写建议：{hit.rewriteHint}
                    </div>
                  ) : null}
                </div>
              ))}
              {detectedBannedWords.length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3">
                  {detectedBannedWords.map((item) => (
                    <span key={item.word} className="border border-cinnabar px-3 py-1 text-xs text-cinnabar">
                      {item.word} × {item.count}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border border-dashed border-[#d0cfcb] bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">视觉联想引擎</div>
          <div className="mt-3 text-sm leading-7 text-stone-700">{visualSuggestion}</div>
          {nodeVisualSuggestions.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-stone-500">段落配图建议</div>
                <button
                  onClick={saveImagePromptAssets}
                  disabled={savingImagePrompts}
                  className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 disabled:opacity-60"
                >
                  {savingImagePrompts ? "保存中..." : "保存为资产"}
                </button>
              </div>
              {nodeVisualSuggestions.map((item) => (
                <div key={item.id} className="border border-stone-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">{item.prompt}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              onClick={generateCoverImage}
              disabled={coverImageButtonDisabled}
              className={`px-4 py-3 text-sm ${canGenerateCoverImage && !coverImageLimitReached ? "bg-cinnabar text-white" : "border border-stone-300 bg-white text-stone-400"}`}
            >
              {coverImageButtonLabel}
            </button>
          </div>
          {canUseCoverImageReference ? (
            <div className="mt-3 border border-dashed border-stone-300 bg-white px-4 py-4">
              <div className="text-xs uppercase tracking-[0.18em] text-stone-500">参考图垫图</div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleCoverReferenceFileChange}
                className="mt-3 w-full text-sm"
              />
              <div className="mt-2 text-xs leading-6 text-stone-500">藏锋套餐可上传参考图，封面生成会尽量继承主体、构图或风格线索。</div>
              {coverImageReferenceDataUrl ? (
                <img src={coverImageReferenceDataUrl} alt="封面图参考图" className="mt-3 aspect-[16/9] w-full border border-stone-300 object-cover" />
              ) : null}
            </div>
          ) : canGenerateCoverImage ? (
            <div className="mt-3 text-xs leading-6 text-stone-500">参考图垫图仅藏锋可用，当前套餐仍可直接按标题生成封面图。</div>
          ) : null}
          <div className="mt-3 text-xs leading-6 text-stone-500">
            今日封面图
            {coverImageQuota.limit == null
              ? ` ${coverImageQuota.used} / 不限`
              : ` ${coverImageQuota.used} / ${coverImageQuota.limit}`}
            {!canGenerateCoverImage
              ? "，当前套餐只输出配图 Prompt。"
              : coverImageLimitReached
                ? "，今日额度已耗尽。"
                : coverImageQuota.remaining != null
                  ? `，还可生成 ${coverImageQuota.remaining} 次。`
                  : "。"}
          </div>
          {coverImageCandidates.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-500">封面图候选</div>
              <div className="grid gap-3">
                {coverImageCandidates.map((candidate) => (
                  <div key={candidate.id} className="border border-stone-300 bg-white p-3">
                    <img src={candidate.imageUrl} alt={candidate.variantLabel} className="aspect-[16/9] w-full border border-stone-300 object-cover" />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-ink">{candidate.variantLabel}</div>
                        <div className="mt-1 text-xs text-stone-500">{candidate.isSelected ? "已入库" : "候选图"}</div>
                      </div>
                      <button
                        onClick={() => selectCoverCandidate(candidate.id)}
                        disabled={candidate.isSelected || selectingCoverCandidateId !== null}
                        className={`px-3 py-2 text-xs ${
                          candidate.isSelected ? "border border-stone-300 bg-white text-stone-400" : "bg-cinnabar text-white"
                        } disabled:opacity-60`}
                      >
                        {candidate.isSelected ? "已选择" : selectingCoverCandidateId === candidate.id ? "入库中..." : "选这张入库"}
                      </button>
                    </div>
                    <div className="mt-3 border border-stone-300 bg-[#faf7f0] px-3 py-3 text-xs leading-6 text-stone-600">
                      {candidate.prompt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
          {imagePrompts.length > 0 ? (
            <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-stone-500">已保存的文中配图 Prompt 资产</div>
              {imagePrompts.map((item) => (
                <div key={item.id} className="border border-stone-300 bg-white px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.title}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">{item.prompt}</div>
                  <div className="mt-2 text-xs text-stone-500">{new Date(item.updatedAt).toLocaleString("zh-CN")}</div>
                </div>
              ))}
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
              {canExportPdf ? "导出 PDF" : "PDF 需升级付费套餐"}
            </Link>
          </div>
        </div>

        <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发布到公众号</div>
          {canShowWechatControls ? (
            <>
              <div className="mt-3 border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                当前发布动作会把 Markdown 先渲染为微信兼容 HTML，再按所选模板推入公众号草稿箱。
              </div>
              <select value={wechatTemplateId ?? ""} onChange={(event) => setWechatTemplateId(event.target.value || null)} className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm">
                <option value="">选择微信模板（默认）</option>
                {templates.map((template) => (
                  <option key={`${template.id}-${template.version}`} value={template.id}>
                    [{template.ownerUserId == null ? "官方" : "私有"}] {template.name} · {template.version}
                  </option>
                ))}
              </select>
              <select value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm">
                <option value="">选择公众号连接</option>
                {wechatConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.accountName || `连接 ${connection.id}`}{connection.isDefault ? " · 默认" : ""}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  void openWechatConnectModal(false);
                }}
                className="mt-3 w-full border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700"
              >
                新增公众号连接
              </button>
              {selectedTemplate ? (
                <div className="mt-3 border border-stone-300 bg-white px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    {selectedTemplate.meta || "模板"} · {selectedTemplate.version} · {formatTemplateAssetOwner(selectedTemplate)}
                  </div>
                  <div className="mt-2 font-serifCn text-2xl text-ink">{selectedTemplate.name}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">{selectedTemplate.description || "当前模板未填写说明，但会参与微信 HTML 渲染。"}</div>
                  <div className="mt-2 text-xs leading-6 text-stone-500">来源：{formatTemplateSourceSummary(selectedTemplate)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formatTemplateConfigSummary(selectedTemplate).map((item) => (
                      <span key={`${selectedTemplate.id}-${item}`} className="border border-stone-300 bg-[#faf7f0] px-3 py-1 text-xs text-stone-700">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
                  当前未显式指定模板，将使用默认微信渲染样式。
                </div>
              )}
              {selectedConnection ? (
                <div className="mt-3 border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">目标公众号</div>
                  <div className="mt-2 font-serifCn text-2xl text-ink">{selectedConnection.accountName || `连接 ${selectedConnection.id}`}</div>
                  <div className="mt-2">
                    状态：{selectedConnection.status}
                    {selectedConnection.isDefault ? " · 默认连接" : ""}
                  </div>
                  <div className="text-stone-500">
                    {selectedConnection.accessTokenExpiresAt ? `Token 到期：${new Date(selectedConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录 Token 到期时间"}
                  </div>
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-[#d8b0b2] bg-[#fff3f3] px-4 py-4 text-sm leading-7 text-[#8f3136]">
                  当前还没有可用公众号连接。可直接在这里补录 AppID / AppSecret，完成后会继续当前发布流程。
                </div>
              )}
              {pendingPublishIntent ? (
                <div className="mt-3 border border-[#dfd2b0] bg-[#fff8e8] px-4 py-4 text-sm leading-7 text-[#7d6430]">
                  <div className="text-xs uppercase tracking-[0.18em] text-[#7d6430]">待恢复发布意图</div>
                  <div className="mt-2">
                    上一次发布在 {new Date(pendingPublishIntent.createdAt).toLocaleString("zh-CN")} 因缺少公众号凭证而中断。
                    {pendingPublishIntent.templateId ? " 这次恢复时会继续沿用当前编辑器里的模板和正文状态。" : " 恢复后会直接沿用当前编辑器里的正文状态继续发布。"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={resumePendingPublishIntent}
                      disabled={publishing}
                      className="border border-cinnabar bg-white px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                    >
                      {publishing ? "恢复中..." : "恢复继续发布"}
                    </button>
                    <button
                      onClick={() => {
                        void clearPendingPublishIntent();
                      }}
                      className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700"
                    >
                      清除待发布状态
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 border border-stone-300 bg-white px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">发布前最终预览</div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      这里展示的是当前标题、正文和模板组合后，真正会提交给微信草稿箱的最终 HTML。
                    </div>
                  </div>
                  <button
                    onClick={loadPublishPreview}
                    disabled={loadingPublishPreview}
                    className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:opacity-60"
                  >
                    {loadingPublishPreview ? "生成中..." : "生成最终预览"}
                  </button>
                </div>
                {hasUnsavedWechatRenderInputs ? (
                  <div className="mt-3 border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-3 py-3 text-xs leading-6 text-[#8f3136]">
                    检测到标题、正文或模板选择尚未保存。正式发布时系统会先保存，再按最终状态重新渲染。
                  </div>
                ) : null}
                {publishPreview ? (
                  <div className="mt-4 space-y-3 border-t border-stone-200 pt-4">
                    <div className={`border px-3 py-3 text-sm leading-7 ${
                      publishPreview.publishGuard.canPublish
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-[#d8b0b2] bg-[#fff3f3] text-[#8f3136]"
                    }`}>
                      {publishPreview.publishGuard.canPublish
                        ? "发布守门检查已通过。"
                        : `发布守门检查未通过：${publishPreview.publishGuard.blockers.join("；")}`}
                    </div>
                    <div className="grid gap-2">
                      {publishPreview.publishGuard.checks.map((check) => (
                        <div key={check.key} className="flex flex-wrap items-start justify-between gap-3 border border-stone-300 bg-[#faf7f0] px-3 py-3 text-sm">
                          <div>
                            <div className="font-medium text-ink">{check.label}</div>
                            <div className="mt-1 leading-6 text-stone-700">{check.detail}</div>
                          </div>
                          <div className={`shrink-0 text-xs ${
                            check.status === "passed"
                              ? "text-emerald-700"
                              : check.status === "warning"
                                ? "text-[#7d6430]"
                                : "text-[#8f3136]"
                          }`}>
                            {check.status === "passed" ? "通过" : check.status === "warning" ? "需关注" : "拦截"}
                          </div>
                        </div>
                      ))}
                    </div>
                    {publishPreview.publishGuard.warnings.length > 0 ? (
                      <div className="space-y-2">
                        {publishPreview.publishGuard.warnings.map((warning) => (
                          <div key={warning} className="border border-[#dfd2b0] bg-[#fff8e8] px-3 py-3 text-xs leading-6 text-[#7d6430]">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className={publishPreview.isConsistentWithSavedHtml ? "text-emerald-700" : "text-[#8f3136]"}>
                        {publishPreview.isConsistentWithSavedHtml ? "当前保存版与最终发布效果一致" : "当前保存版与最终发布效果不一致"}
                      </div>
                      <div className="text-xs text-stone-500">
                        {new Date(publishPreview.generatedAt).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(publishPreview.templateSummary.length ? publishPreview.templateSummary : ["默认微信渲染"]).map((item) => (
                        <span key={`publish-preview-${item}`} className="border border-stone-300 bg-[#faf7f0] px-3 py-1 text-xs text-stone-700">
                          {item}
                        </span>
                      ))}
                    </div>
                    {publishPreview.templateName ? (
                      <div className="text-xs text-stone-500">
                        模板：{publishPreview.templateName}{publishPreview.templateVersion ? ` · ${publishPreview.templateVersion}` : ""}
                        {publishPreview.templateOwnerLabel ? ` · ${publishPreview.templateOwnerLabel}` : ""}
                        {publishPreview.templateSourceLabel ? ` · 来源 ${publishPreview.templateSourceLabel}` : ""}
                      </div>
                    ) : null}
                    {publishPreview.mismatchWarnings.length ? (
                      <div className="space-y-2">
                        {publishPreview.mismatchWarnings.map((warning) => (
                          <div key={warning} className="border border-dashed border-[#d8b0b2] bg-[#fff7f7] px-3 py-3 text-xs leading-6 text-[#8f3136]">
                            {warning}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setView("preview")} className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">
                        在中间栏查看
                      </button>
                      {!publishPreview.isConsistentWithSavedHtml ? (
                        <button
                          onClick={refreshPublishPreviewRender}
                          disabled={refreshingPublishPreview}
                          className="border border-cinnabar bg-white px-4 py-2 text-sm text-cinnabar disabled:opacity-60"
                        >
                          {refreshingPublishPreview ? "刷新中..." : "刷新为最终发布效果"}
                        </button>
                      ) : null}
                    </div>
                    <div className="max-h-[280px] overflow-auto border border-stone-300 bg-[#fffdfa] p-4">
                      <div dangerouslySetInnerHTML={{ __html: publishPreview.finalHtml || "<p>暂无预览</p>" }} />
                    </div>
                  </div>
                ) : null}
              </div>
              <button onClick={publish} disabled={publishing} className="mt-4 w-full bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
                {publishing ? "推送中..." : "推送到微信草稿箱"}
              </button>
              <Link href="/settings" className="mt-3 block border border-stone-300 bg-white px-4 py-3 text-center text-sm text-stone-700">
                去设置页管理公众号连接
              </Link>
            </>
          ) : (
            <>
              <div className="mt-3 border border-dashed border-[#d8b0b2] bg-[#fff3f3] px-4 py-4 text-sm leading-7 text-[#8f3136]">
                {planName}套餐当前不支持微信草稿箱推送。你仍可继续编辑、导出 Markdown 或 HTML；升级到 Pro 或更高套餐后，才可绑定公众号并一键推送到草稿箱。
              </div>
              <Link href="/pricing" className="mt-3 block border border-cinnabar bg-white px-4 py-3 text-center text-sm text-cinnabar">
                查看套餐权限
              </Link>
            </>
          )}
          <div className="mt-4 border-t border-stone-200 pt-4">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">当前文稿最近同步</div>
            {latestSyncLog ? (
              <div className="mt-3 space-y-3">
                <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{latestSyncLog.connectionName || "未命名公众号"}</div>
                      <div className="text-stone-500">{new Date(latestSyncLog.createdAt).toLocaleString("zh-CN")}</div>
                    </div>
                    <div className={latestSyncLog.status === "success" ? "text-emerald-600" : "text-cinnabar"}>
                      {latestSyncLog.status === "success" ? "推送成功" : "推送失败"}
                    </div>
                  </div>
                  <div className="mt-3">
                    {latestSyncLog.status === "success"
                      ? latestSyncLog.mediaId
                        ? `草稿媒体 ID：${latestSyncLog.mediaId}`
                        : "微信已返回成功，但未回填媒体 ID。"
                      : latestSyncLog.failureReason || "未记录失败原因"}
                  </div>
                  {latestSyncLog.retryCount > 0 ? <div className="mt-2 text-xs text-stone-500">重试次数：{latestSyncLog.retryCount}</div> : null}
                </div>
                {(latestSyncLog.requestSummary || latestSyncLog.responseSummary) ? (
                  <div className="space-y-2">
                    {latestSyncLog.requestSummary ? (
                      <div className="border border-stone-300 bg-white px-3 py-3 text-xs leading-6 text-stone-600">
                        <div className="uppercase tracking-[0.18em] text-stone-500">请求摘要</div>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.requestSummary)}</pre>
                      </div>
                    ) : null}
                    {latestSyncLog.responseSummary ? (
                      <div className="border border-stone-300 bg-white px-3 py-3 text-xs leading-6 text-stone-600">
                        <div className="uppercase tracking-[0.18em] text-stone-500">响应摘要</div>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.responseSummary)}</pre>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <Link href="/sync/logs" className="block border border-stone-300 bg-white px-4 py-3 text-center text-sm text-stone-700">
                  查看完整同步日志
                </Link>
              </div>
            ) : (
              <div className="mt-3 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
                这篇文稿还没有同步记录。首次推送成功后，这里会显示最近一次请求与响应摘要。
              </div>
            )}
          </div>
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

      {showWechatConnectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-[560px] overflow-auto border border-stone-300 bg-[#fffdfa] p-6 shadow-ink">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">公众号快速配置</div>
                <div className="mt-2 font-serifCn text-3xl text-ink">
                  {continuePublishAfterWechatConnect ? "补录凭证后继续发布" : "新增公众号连接"}
                </div>
                <div className="mt-3 text-sm leading-7 text-stone-700">
                  这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取 access token。
                </div>
              </div>
              <button
                onClick={() => {
                  if (wechatConnectSubmitting) return;
                  setShowWechatConnectModal(false);
                  setContinuePublishAfterWechatConnect(false);
                  resetWechatConnectDraft();
                }}
                className="border border-stone-300 px-3 py-2 text-sm text-stone-700"
              >
                关闭
              </button>
            </div>
            <form onSubmit={submitWechatConnectionFromEditor} className="mt-5 space-y-3">
              <input
                value={wechatConnectAccountName}
                onChange={(event) => setWechatConnectAccountName(event.target.value)}
                placeholder="公众号名称"
                className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
              />
              <input
                value={wechatConnectOriginalId}
                onChange={(event) => setWechatConnectOriginalId(event.target.value)}
                placeholder="原始 ID"
                className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
              />
              <input
                value={wechatConnectAppId}
                onChange={(event) => setWechatConnectAppId(event.target.value)}
                placeholder="AppID"
                className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
              />
              <input
                value={wechatConnectAppSecret}
                onChange={(event) => setWechatConnectAppSecret(event.target.value)}
                placeholder="AppSecret"
                type="password"
                className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
              />
              <label className="flex items-center gap-3 border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={wechatConnectIsDefault}
                  onChange={(event) => setWechatConnectIsDefault(event.target.checked)}
                />
                保存后设为默认公众号
              </label>
              {wechatConnectMessage ? (
                <div className="border border-dashed border-[#d8b0b2] bg-[#fff3f3] px-4 py-3 text-sm leading-7 text-[#8f3136]">
                  {wechatConnectMessage}
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWechatConnectModal(false);
                    setContinuePublishAfterWechatConnect(false);
                    resetWechatConnectDraft();
                  }}
                  disabled={wechatConnectSubmitting}
                  className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700 disabled:opacity-60"
                >
                  先不配置
                </button>
                <button
                  type="submit"
                  disabled={wechatConnectSubmitting}
                  className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60"
                >
                  {wechatConnectSubmitting
                    ? continuePublishAfterWechatConnect
                      ? "校验并续发中..."
                      : "校验中..."
                    : continuePublishAfterWechatConnect
                      ? "保存并继续发布"
                      : "保存公众号连接"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
