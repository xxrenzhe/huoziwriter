"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, startTransition, useMemo, useRef, useState } from "react";
import { derivePersonaName } from "@/lib/persona-catalog";
import { formatPlanDisplayName } from "@/lib/plan-labels";

type PersonaItem = {
  id: number;
  name: string;
  summary?: string | null;
  identityTags: string[];
  writingStyleTags: string[];
  domainKeywords?: string[];
  argumentPreferences?: string[];
  toneConstraints?: string[];
  audienceHints?: string[];
  sourceMode?: string;
  boundWritingStyleProfileId?: number | null;
  boundWritingStyleProfileName?: string | null;
  isDefault: boolean;
  createdAt: string;
};

type PersonaAnalysisFileSource = {
  id: string;
  title: string;
  sourceText: string;
  fileName: string;
  mimeType: string | null;
};

type PersonaTagOption = {
  id: number;
  key: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
};

function toggleTag(current: string[], value: string) {
  if (current.includes(value)) {
    return current.filter((item) => item !== value);
  }
  if (current.length >= 3) {
    return current;
  }
  return [...current, value];
}

export function PersonaManager({
  initialPersonas,
  maxCount,
  currentPlanName,
  canAnalyzeFromSources = false,
  availableWritingStyles = [],
  tagCatalog,
  mandatory = false,
}: {
  initialPersonas: PersonaItem[];
  maxCount: number;
  currentPlanName: string;
  canAnalyzeFromSources?: boolean;
  availableWritingStyles?: Array<{ id: number; name: string }>;
  tagCatalog: {
    identity: PersonaTagOption[];
    writingStyle: PersonaTagOption[];
  };
  mandatory?: boolean;
}) {
  const router = useRouter();
  const displayPlanName = formatPlanDisplayName(currentPlanName);
  const [personas, setPersonas] = useState(initialPersonas);
  const [name, setName] = useState("");
  const [identityTags, setIdentityTags] = useState<string[]>([]);
  const [writingStyleTags, setWritingStyleTags] = useState<string[]>([]);
  const [boundWritingStyleProfileId, setBoundWritingStyleProfileId] = useState<string>("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFiles, setSourceFiles] = useState<PersonaAnalysisFileSource[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [analyzingSources, setAnalyzingSources] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);

  const reachedLimit = personas.length >= maxCount;
  const shouldBlock = mandatory && personas.length === 0;
  const identityOptions = tagCatalog.identity.map((item) => item.label);
  const writingStyleOptions = tagCatalog.writingStyle.map((item) => item.label);
  const resolvedName = useMemo(
    () => name.trim() || derivePersonaName(identityTags, writingStyleTags),
    [identityTags, name, writingStyleTags],
  );
  const analyzedSourceCount = (sourceText.trim() ? 1 : 0) + sourceFiles.length;
  const analyzedSourceCharacters = sourceText.trim().length + sourceFiles.reduce((sum, item) => sum + item.sourceText.length, 0);

  function normalizePersonaSourceText(file: File, text: string) {
    const normalized = String(text || "").trim();
    if (!normalized) return "";
    if (file.type === "text/html" || /\.html?$/i.test(file.name)) {
      return normalized.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    return normalized;
  }

  async function handleSourceFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) {
      setSourceFiles([]);
      return;
    }

    const supportedMimeTypes = new Set([
      "text/plain",
      "text/markdown",
      "text/html",
      "text/csv",
      "application/json",
      "application/ld+json",
    ]);
    const nextSources: PersonaAnalysisFileSource[] = [];
    const rejected: string[] = [];

    for (const file of files.slice(0, 5)) {
      const isSupported =
        supportedMimeTypes.has(file.type)
        || /\.(txt|md|markdown|html|htm|json|csv)$/i.test(file.name);
      if (!isSupported) {
        rejected.push(file.name);
        continue;
      }
      const fileText = normalizePersonaSourceText(file, await file.text());
      if (!fileText) {
        rejected.push(file.name);
        continue;
      }
      nextSources.push({
        id: `${file.name}-${file.lastModified}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        sourceText: fileText,
        fileName: file.name,
        mimeType: file.type || null,
      });
    }

    setSourceFiles(nextSources);
    if (rejected.length > 0) {
      setMessage(`以下文件暂不支持或内容为空：${rejected.join("、")}。当前支持 txt / md / html / json / csv。`);
    } else {
      setMessage("");
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (identityTags.length === 0 || writingStyleTags.length === 0) {
      setMessage("身份维度和写作风格都至少选择 1 项");
      return;
    }

    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/personas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: resolvedName,
        identityTags,
        writingStyleTags,
        boundWritingStyleProfileId: boundWritingStyleProfileId ? Number(boundWritingStyleProfileId) : null,
        isDefault: personas.length === 0,
      }),
    });
    const json = await response.json();
    setSubmitting(false);

    if (!response.ok || !json.success) {
      setMessage(json.error || "作者人设创建失败");
      return;
    }

    const nextPersonas = [...personas, json.data].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id);
    setPersonas(nextPersonas);
    setName("");
    setIdentityTags([]);
    setWritingStyleTags([]);
    setBoundWritingStyleProfileId("");
    setMessage(shouldBlock ? "人设已保存，正在进入写作区。" : "作者人设已保存。");
    startTransition(() => router.refresh());
  }

  async function handleAnalyzeSourcePersona() {
    if (!canAnalyzeFromSources) {
      setMessage(`${displayPlanName}暂不支持基于资料分析作者人设。升级到 Pro 或 Ultra 后可用。`);
      return;
    }
    const sources = [
      ...(sourceText.trim()
        ? [{
            sourceType: "text" as const,
            title: sourceTitle.trim() || null,
            sourceUrl: sourceUrl.trim() || null,
            sourceText: sourceText.trim(),
          }]
        : []),
      ...sourceFiles.map((file) => ({
        sourceType: "file" as const,
        title: file.title,
        sourceUrl: null,
        sourceText: file.sourceText,
        fileName: file.fileName,
        mimeType: file.mimeType,
      })),
    ];
    const mergedLength = sources.reduce((sum, source) => sum + source.sourceText.length, 0);
    if (sources.length === 0 || mergedLength < 80) {
      setMessage("至少提供一段较完整的资料正文，或上传 1 份可解析文本文件，再开始分析。");
      return;
    }

    setAnalyzingSources(true);
    setMessage("");
    const response = await fetch("/api/personas/analyze-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources,
        boundWritingStyleProfileId: boundWritingStyleProfileId ? Number(boundWritingStyleProfileId) : null,
        makeDefault: personas.length === 0,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setAnalyzingSources(false);

    if (!response.ok || !json?.success) {
      setMessage(json?.error || "作者资料分析失败");
      return;
    }

    const createdPersona = json.data as PersonaItem;
    const nextPersonas = [...personas, createdPersona].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id);
    setPersonas(nextPersonas);
    setSourceTitle("");
    setSourceUrl("");
    setSourceText("");
    setSourceFiles([]);
    if (sourceFileInputRef.current) sourceFileInputRef.current.value = "";
    setMessage(`已基于 ${analyzedSourceCount} 份资料沉淀作者人设，总字数约 ${analyzedSourceCharacters || mergedLength} 字。`);
    startTransition(() => router.refresh());
  }

  async function handleSetDefault(personaId: number) {
    setUpdatingId(personaId);
    setMessage("");
    const response = await fetch(`/api/personas/${personaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const json = await response.json();
    setUpdatingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "默认作者人设切换失败");
      return;
    }

    const updated = json.data as PersonaItem;
    setPersonas((prev) =>
      prev
        .map((item) => ({ ...item, isDefault: item.id === updated.id }))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id),
    );
    setMessage(`默认作者人设已切换为「${updated.name}」。`);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["总人设数", String(personas.length), "每个系列长期绑定固定身份，不再在稿件后期随手切换口吻。"] as const,
          ["默认人设", personas.find((item) => item.isDefault)?.name || "未设置", "账号级默认人设会作为未绑定系列时的兜底身份。"] as const,
          ["套餐额度", `${personas.length}/${maxCount}`, `当前套餐 ${displayPlanName} 可保留 ${maxCount} 套长期作者人设。`] as const,
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-300/40 bg-[#fffdfa] p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-3xl text-ink">{value}</div>
            <div className="mt-2 text-sm leading-6 text-stone-700">{note}</div>
          </article>
        ))}
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 border border-stone-300/40 bg-[#faf7f0] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">新建作者人设</div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="作者人设名称，例如：长期主义产业观察者"
            className="border border-stone-300 bg-white px-4 py-3 text-sm"
          />
          <select
            value={boundWritingStyleProfileId}
            onChange={(event) => setBoundWritingStyleProfileId(event.target.value)}
            className="border border-stone-300 bg-white px-4 py-3 text-sm"
          >
            <option value="">不绑定写作风格资产</option>
            {availableWritingStyles.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">身份维度</div>
            <div className="flex flex-wrap gap-2">
              {identityOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setIdentityTags((current) => toggleTag(current, option))}
                  className={`border px-3 py-2 text-sm ${identityTags.includes(option) ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-white text-stone-700"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">写作风格</div>
            <div className="flex flex-wrap gap-2">
              {writingStyleOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setWritingStyleTags((current) => toggleTag(current, option))}
                  className={`border px-3 py-2 text-sm ${writingStyleTags.includes(option) ? "border-ink bg-ink text-white" : "border-stone-300 bg-white text-stone-700"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-stone-600">当前将保存为：{resolvedName || "请先选择标签"}</div>
          <button
            type="submit"
            disabled={submitting || reachedLimit}
            className="border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "保存中..." : reachedLimit ? "已达到套餐额度" : "保存作者人设"}
          </button>
        </div>
      </form>

      <section className="grid gap-4 border border-stone-300/40 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">资料分析生成</div>
            <div className="mt-2 text-sm leading-7 text-stone-700">上传文章、访谈或自述资料，让系统抽取稳定身份、常见判断和表达偏好。</div>
          </div>
          <button
            type="button"
            onClick={handleAnalyzeSourcePersona}
            disabled={analyzingSources || reachedLimit}
            className="border border-ink bg-ink px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analyzingSources ? "分析中..." : reachedLimit ? "已达到套餐额度" : "分析并沉淀作者人设"}
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
            placeholder="资料标题，例如：近半年公众号文章合集"
            className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
          />
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="资料来源链接，可选"
            className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
          />
        </div>
        <textarea
          value={sourceText}
          onChange={(event) => setSourceText(event.target.value)}
          placeholder="粘贴较完整的文章、访谈、自述或多篇代表作片段。建议至少 80 字。"
          className="min-h-[160px] border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm leading-7"
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
          <input
            ref={sourceFileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.html,.htm,.json,.csv,text/plain,text/markdown,text/html,text/csv,application/json,application/ld+json"
            onChange={handleSourceFilesChange}
            className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm"
          />
          <div className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm text-stone-600">
            当前资料：{analyzedSourceCount} 份，约 {analyzedSourceCharacters} 字
          </div>
        </div>
      </section>

      <div className="space-y-3">
        {personas.map((persona) => (
          <article key={persona.id} className="border border-stone-300/40 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{persona.isDefault ? "默认作者人设" : "作者人设"}</div>
                <div className="mt-2 font-serifCn text-2xl text-ink">{persona.name}</div>
                {persona.summary ? <div className="mt-3 text-sm leading-7 text-stone-700">{persona.summary}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                  {persona.identityTags.map((tag) => <span key={`${persona.id}-identity-${tag}`} className="border border-stone-300 px-2 py-1">{tag}</span>)}
                  {persona.writingStyleTags.map((tag) => <span key={`${persona.id}-style-${tag}`} className="border border-stone-300 px-2 py-1">{tag}</span>)}
                  {persona.boundWritingStyleProfileName ? <span className="border border-cinnabar/40 px-2 py-1 text-cinnabar">绑定文风：{persona.boundWritingStyleProfileName}</span> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSetDefault(persona.id)}
                disabled={persona.isDefault || updatingId === persona.id}
                className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {persona.isDefault ? "当前默认" : updatingId === persona.id ? "切换中..." : "设为默认"}
              </button>
            </div>
          </article>
        ))}
      </div>

      {message ? <div className="border border-stone-300 bg-[#fffdfa] px-4 py-3 text-sm text-stone-700">{message}</div> : null}
    </div>
  );
}
