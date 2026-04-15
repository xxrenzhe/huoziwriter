"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, startTransition, useMemo, useRef, useState } from "react";
import { deriveAuthorPersonaName } from "@/lib/persona-catalog";

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

export function AuthorPersonaManager({
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
    () => name.trim() || deriveAuthorPersonaName(identityTags, writingStyleTags),
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
    const response = await fetch("/api/author-personas", {
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
      setMessage(`${currentPlanName}套餐暂不支持基于资料分析作者人设。升级到 Pro 或 Ultra 后可用。`);
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
    const response = await fetch("/api/author-personas/analyze-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || null,
        sources,
        isDefault: personas.length === 0,
      }),
    });
    const json = await response.json();
    setAnalyzingSources(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "资料人设分析失败");
      return;
    }

    const nextPersonas = [...personas, json.data].sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id);
    setPersonas(nextPersonas);
    setSourceTitle("");
    setSourceUrl("");
    setSourceText("");
    setSourceFiles([]);
    if (sourceFileInputRef.current) {
      sourceFileInputRef.current.value = "";
    }
    setName("");
    setMessage("资料已分析并生成为作者人设。");
    startTransition(() => router.refresh());
  }

  async function handleSetDefault(id: number) {
    setUpdatingId(id);
    setMessage("");
    const response = await fetch(`/api/author-personas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    const json = await response.json();
    setUpdatingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "默认人设设置失败");
      return;
    }
    setPersonas((current) =>
      current
        .map((item) => ({ ...item, isDefault: item.id === id }))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id),
    );
    startTransition(() => router.refresh());
  }

  async function handleBindWritingStyle(personaId: number, profileId: string) {
    setUpdatingId(personaId);
    setMessage("");
    const response = await fetch(`/api/author-personas/${personaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boundWritingStyleProfileId: profileId ? Number(profileId) : null,
      }),
    });
    const json = await response.json();
    setUpdatingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "绑定写作风格资产失败");
      return;
    }
    setPersonas((current) =>
      current
        .map((item) => (item.id === personaId ? json.data : item))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id),
    );
    startTransition(() => router.refresh());
  }

  async function handleDelete(id: number) {
    setUpdatingId(id);
    setMessage("");
    const response = await fetch(`/api/author-personas/${id}`, {
      method: "DELETE",
    });
    const json = await response.json();
    setUpdatingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "作者人设删除失败");
      return;
    }
    setPersonas((current) => current.filter((item) => item.id !== id));
    startTransition(() => router.refresh());
  }

  const content = (
    <div className={`${shouldBlock ? "mx-auto w-full max-w-5xl border border-stone-300/50 bg-[#fbf7ef] shadow-ink" : "space-y-6"}`}>
      <div className={`${shouldBlock ? "grid gap-6 p-6 md:grid-cols-[minmax(0,1.1fr)_420px] md:p-8" : "space-y-6"}`}>
        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">{shouldBlock ? "Author Setup" : "作者资产"}</div>
            <h2 className="mt-3 font-serifCn text-4xl text-ink">{shouldBlock ? "先配置你的写作身份，再进入系统。" : "作者人设"}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
              人设不是展示标签，而是后续选题、受众分析、写作和润色的默认约束。当前套餐为 {currentPlanName}，最多可配置 {maxCount} 个作者人设。
            </p>
            {shouldBlock ? (
              <div className="mt-4 space-y-3">
                <div className="border border-[#d8b0b2] bg-[#fff3f3] px-4 py-4 text-sm leading-7 text-[#8f3136]">
                  这是首次进入写作系统的必经步骤。未完成至少 1 个默认作者人设前，不能跳过也不能进入其他写作页面。
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {[
                    ["Free", "最多 1 个"],
                    ["Pro", "最多 3 个"],
                    ["Ultra", "最多 10 个"],
                  ].map(([planLabel, limitText]) => (
                    <span key={planLabel} className="border border-stone-300 bg-white px-3 py-2 text-stone-700">
                      {planLabel} · {limitText}
                    </span>
                  ))}
                </div>
                <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                  完成后建议按最短路径开始：
                  <div className="mt-2">1. 先去采集页补 2-3 条素材。</div>
                  <div>2. 再去情绪罗盘挑一个切口，不要直接空白开写。</div>
                  <div>3. 进入编辑器后先确认标题和大纲，再写正文。</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {personas.length === 0 ? (
              <div className="md:col-span-3 border border-dashed border-stone-300 bg-white px-4 py-5 text-sm leading-7 text-stone-600">
                还没有作者人设。先选 1 个身份维度和 1 个写作风格维度，系统会把它设为默认人设。
              </div>
            ) : (
              personas.map((persona) => (
                <article key={persona.id} className="border border-stone-300/40 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-serifCn text-2xl text-ink">{persona.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {persona.sourceMode === "analyzed" ? (
                        <span className="border border-[#dcc8a6] bg-[#fff8eb] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7d6430]">资料建模</span>
                      ) : null}
                      {persona.isDefault ? (
                        <span className="border border-cinnabar bg-cinnabar px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-white">默认</span>
                      ) : null}
                    </div>
                  </div>
                  {persona.summary ? (
                    <div className="mt-3 text-sm leading-7 text-stone-700">{persona.summary}</div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {persona.identityTags.map((tag) => (
                      <span key={`${persona.id}-identity-${tag}`} className="border border-stone-300 bg-[#faf7f0] px-2 py-1 text-xs text-stone-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {persona.writingStyleTags.map((tag) => (
                      <span key={`${persona.id}-style-${tag}`} className="border border-[#dcc8a6] bg-[#fff7e6] px-2 py-1 text-xs text-[#7d6430]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {persona.domainKeywords?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {persona.domainKeywords.slice(0, 4).map((tag) => (
                        <span key={`${persona.id}-domain-${tag}`} className="border border-stone-200 bg-[#f7f3eb] px-2 py-1 text-xs text-stone-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {persona.boundWritingStyleProfileName ? (
                    <div className="mt-3 text-xs leading-6 text-stone-500">
                      绑定文风资产：{persona.boundWritingStyleProfileName}
                    </div>
                  ) : null}
                  {availableWritingStyles.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500">绑定写作风格资产</div>
                      <select
                        value={persona.boundWritingStyleProfileId ? String(persona.boundWritingStyleProfileId) : ""}
                        onChange={(event) => handleBindWritingStyle(persona.id, event.target.value)}
                        disabled={updatingId === persona.id}
                        className="w-full border border-stone-300 bg-[#faf7f0] px-3 py-2 text-sm disabled:bg-stone-100"
                      >
                        <option value="">暂不绑定，仍只按标签约束</option>
                        {availableWritingStyles.map((profile) => (
                          <option key={`${persona.id}-${profile.id}`} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="mt-5 flex flex-wrap gap-2 text-xs">
                    {!persona.isDefault ? (
                      <button
                        onClick={() => handleSetDefault(persona.id)}
                        disabled={updatingId === persona.id}
                        className="border border-stone-300 px-3 py-2 text-stone-700 disabled:opacity-60"
                      >
                        设为默认
                      </button>
                    ) : null}
                    {personas.length > 1 ? (
                      <button
                        onClick={() => handleDelete(persona.id)}
                        disabled={updatingId === persona.id}
                        className="border border-[#d8b0b2] px-3 py-2 text-[#8f3136] disabled:opacity-60"
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-5 border border-stone-300/40 bg-white p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建人设</div>
            <div className="mt-3 text-sm leading-7 text-stone-600">
              每个维度至少选 1 项，最多 3 项。名称可留空，系统会根据标签自动生成。
            </div>
          </div>

          <div className="border border-stone-300/40 bg-[#faf7f0] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">资料建人设</div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              粘贴你的个人介绍、项目说明、历史文章片段或内部文档，系统会自动提炼身份、论证偏好和语气约束，直接生成一个更贴近真实表达的人设。
            </div>
            {canAnalyzeFromSources ? (
              <div className="mt-4 space-y-3">
                <input
                  value={sourceTitle}
                  onChange={(event) => setSourceTitle(event.target.value)}
                  placeholder="资料标题，可选，例如 AutoAds 项目说明"
                  className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
                />
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="资料链接，可选"
                  className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
                />
                <textarea
                  value={sourceText}
                  onChange={(event) => setSourceText(event.target.value)}
                  placeholder="粘贴资料正文，建议至少 80 字，例如你的产品定位、做事方式、常写主题、表达习惯等。"
                  className="min-h-[180px] w-full border border-stone-300 bg-white px-4 py-3 text-sm leading-7"
                />
                <div className="border border-stone-300/60 bg-[#faf7f0] px-4 py-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">文件资料</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">
                    可额外上传最多 5 份文本类文件，系统会和上面的正文一起合并分析。当前支持 `txt / md / html / json / csv`。
                  </div>
                  <input
                    ref={sourceFileInputRef}
                    type="file"
                    multiple
                    accept=".txt,.md,.markdown,.html,.htm,.json,.csv,text/plain,text/markdown,text/html,application/json,text/csv"
                    onChange={(event) => void handleSourceFilesChange(event)}
                    className="mt-3 block w-full text-sm text-stone-600 file:mr-3 file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:text-white"
                  />
                  {sourceFiles.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {sourceFiles.map((file) => (
                        <div key={file.id} className="border border-stone-300 bg-white px-3 py-3 text-sm leading-7 text-stone-700">
                          <div className="font-medium text-ink">{file.fileName}</div>
                          <div className="text-xs text-stone-500">已解析 {file.sourceText.length} 字符</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="border border-stone-300/40 bg-white px-4 py-3 text-xs leading-6 text-stone-500">
                  当前待分析资料：{analyzedSourceCount} 份，合计约 {analyzedSourceCharacters} 字符。
                </div>
                <button
                  type="button"
                  onClick={() => void handleAnalyzeSourcePersona()}
                  disabled={analyzingSources || reachedLimit}
                  className="w-full border border-cinnabar px-4 py-3 text-sm text-cinnabar disabled:opacity-60"
                >
                  {reachedLimit ? "当前套餐人设已达上限" : analyzingSources ? "分析中..." : "分析资料并直接生成人设"}
                </button>
              </div>
            ) : (
              <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
                当前套餐仅支持手动标签建人设。升级到 Pro 或 Ultra 后，可直接基于资料分析出更具体的人设画像。
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-[0.24em] text-stone-500">人设名称</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={resolvedName}
              className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
            />
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">身份维度</div>
            <div className="flex flex-wrap gap-2">
              {tagCatalog.identity.map((option) => {
                const active = identityTags.includes(option.label);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setIdentityTags((current) => toggleTag(current, option.label))}
                    className={`border px-3 py-2 text-sm ${
                      active ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-[#faf7f0] text-stone-700"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">写作风格</div>
            <div className="flex flex-wrap gap-2">
              {tagCatalog.writingStyle.map((option) => {
                const active = writingStyleTags.includes(option.label);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setWritingStyleTags((current) => toggleTag(current, option.label))}
                    className={`border px-3 py-2 text-sm ${
                      active ? "border-cinnabar bg-cinnabar text-white" : "border-stone-300 bg-[#faf7f0] text-stone-700"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {availableWritingStyles.length > 0 ? (
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.24em] text-stone-500">绑定写作风格资产</label>
              <select
                value={boundWritingStyleProfileId}
                onChange={(event) => setBoundWritingStyleProfileId(event.target.value)}
                className="w-full border border-stone-300 bg-white px-4 py-3 text-sm"
              >
                <option value="">暂不绑定，仍只按标签约束</option>
                {availableWritingStyles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <div className="text-xs leading-6 text-stone-500">
                绑定后，这个人设会优先参考你保存过的文风资产，后续受众分析、大纲和写作会沿用这份风格约束。
              </div>
            </div>
          ) : null}

          <div className="border border-stone-300/40 bg-[#faf7f0] px-4 py-4 text-sm leading-7 text-stone-700">
            当前已配置 {personas.length} / {maxCount} 个。默认命名预览：{resolvedName}
          </div>

          <button
            type="submit"
            disabled={submitting || reachedLimit}
            className="w-full bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60"
          >
            {reachedLimit ? "当前套餐人设已达上限" : submitting ? "保存中..." : shouldBlock ? "保存并进入写作区" : "保存作者人设"}
          </button>
          {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
        </form>
      </div>
    </div>
  );

  if (mandatory && !shouldBlock) {
    return null;
  }

  if (!shouldBlock) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[rgba(36,28,20,0.58)] px-4 py-8 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center">
        {content}
      </div>
    </div>
  );
}
