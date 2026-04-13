"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

type GenomeItem = {
  id: number;
  name: string;
  description: string | null;
  meta: string | null;
  config?: Record<string, unknown>;
  isPublic: boolean;
  isOfficial: boolean;
  ownerUserId: number | null;
  ownerUsername: string | null;
};

type TemplateItem = {
  id: string;
  version: string;
  name: string;
  description: string | null;
  meta: string | null;
  config?: Record<string, unknown>;
};

export function DiscoverClient({
  genomes,
  templates,
  canForkGenomes,
  canPublishGenomes,
}: {
  genomes: GenomeItem[];
  templates: TemplateItem[];
  canForkGenomes: boolean;
  canPublishGenomes: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id ?? "");
  const [templateUrl, setTemplateUrl] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    meta: "自定义",
    tone: "克制表达",
    paragraphLength: "short",
    titleStyle: "plain",
    bannedWords: "",
    bannedPunctuation: "",
  });

  function summarizeConfig(config?: Record<string, unknown>) {
    if (!config) return [] as string[];
    const summary = [
      config.tone ? `语气：${String(config.tone)}` : null,
      config.paragraphLength ? `段落：${String(config.paragraphLength)}` : null,
      config.titleStyle ? `标题：${String(config.titleStyle)}` : null,
      Array.isArray(config.bannedWords) && config.bannedWords.length ? `禁词：${config.bannedWords.slice(0, 3).join(" / ")}` : null,
      Array.isArray(config.bannedPunctuation) && config.bannedPunctuation.length ? `禁用标点：${config.bannedPunctuation.join(" ")}` : null,
    ].filter(Boolean) as string[];
    return summary;
  }

  function buildTemplatePreview(template?: TemplateItem | null) {
    if (!template) {
      return {
        eyebrow: "未选择模板",
        title: "先从左侧模板列表挑一个。",
        lead: "模板预览会把标题、强调句、引用区和代码区的版式倾向直观地展示出来。",
        emphasis: "当前还没有可预览模板。",
      };
    }

    const config = template.config || {};
    const tone = String(config.tone || template.meta || "模板");
    const paragraphLength = String(config.paragraphLength || "medium");
    const titleStyle = String(config.titleStyle || "plain");

    return {
      eyebrow: `${template.meta || "模板"} · ${template.version}`,
      title:
        titleStyle === "serif"
          ? "长文标题更稳，更像一篇被认真排版过的专栏。"
          : titleStyle === "sharp"
            ? "标题更利落，适合报道、评论和判断句直接起手。"
            : "标题保持平直，把注意力让给事实本身。",
      lead:
        paragraphLength === "short"
          ? "正文更碎片化，利于公众号阅读场景快速扫读。"
          : paragraphLength === "long"
            ? "正文段落更完整，适合长篇论述和连贯叙事。"
            : "段落长度居中，兼顾阅读速度和论证连续性。",
      emphasis: `当前模板倾向：${tone}。发布时会把这套规则带入微信 HTML 渲染链路。`,
    };
  }

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null;
  const templatePreview = buildTemplatePreview(selectedTemplate);

  async function createGenome() {
    if (!canForkGenomes) {
      setMessage("当前套餐仅可浏览灵感集市。升级到 Pro 或更高套餐后，才可新建私有排版基因。");
      return;
    }
    setCreating(true);
    const response = await fetch("/api/style-genomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        meta: form.meta,
        config: {
          tone: form.tone,
          paragraphLength: form.paragraphLength,
          titleStyle: form.titleStyle,
          bannedWords: form.bannedWords.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
          bannedPunctuation: form.bannedPunctuation.split(/[\s,，\n]/).map((item) => item.trim()).filter(Boolean),
        },
      }),
    });
    const json = await response.json();
    setCreating(false);
    if (!response.ok) {
      setMessage(json.error || "创建失败");
      return;
    }
    setForm({
      name: "",
      description: "",
      meta: "自定义",
      tone: "克制表达",
      paragraphLength: "short",
      titleStyle: "plain",
      bannedWords: "",
      bannedPunctuation: "",
    });
    setMessage("新的私有排版基因已创建");
    startTransition(() => router.refresh());
  }

  async function extractTemplate() {
    if (!canForkGenomes) {
      setMessage("当前套餐仅可浏览模板资产。升级到 Pro 或更高套餐后，才可从 URL 抽取模板。");
      return;
    }
    setExtracting(true);
    const response = await fetch("/api/templates/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: templateUrl }),
    });
    const json = await response.json();
    setExtracting(false);
    if (!response.ok) {
      setMessage(json.error || "模板提取失败");
      return;
    }
    setTemplateUrl("");
    setMessage(`模板“${json.data.name}”已提取入库`);
    startTransition(() => router.refresh());
  }

  async function forkGenome(id: number) {
    if (!canForkGenomes) {
      setMessage("当前套餐只能浏览排版基因。升级到 Pro 或更高套餐后，才可 Fork 到自己的私有资产库。");
      return;
    }
    const response = await fetch(`/api/style-genomes/${id}/fork`, { method: "POST" });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "Fork 失败");
      return;
    }
    setMessage("已 Fork 到你的私有排版基因");
    startTransition(() => router.refresh());
  }

  async function publishGenome(id: number) {
    if (!canPublishGenomes) {
      setMessage("当前套餐不支持发布排版基因。升级到藏锋或团队版后，才可把私有基因公开到集市。");
      return;
    }
    const response = await fetch(`/api/style-genomes/${id}/publish`, { method: "POST" });
    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error || "发布失败");
      return;
    }
    setMessage("已发布到公开集市");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <section className="border border-stone-300/40 bg-[#faf7f0] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">新建私有基因</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={form.name} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="基因名称" className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
          <input value={form.meta} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, meta: event.target.value }))} placeholder="标签，如：评论 / 版式 / 词库" className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
          <input value={form.tone} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))} placeholder="语气，例如：冷静、纪实、克制" className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
          <select value={form.paragraphLength} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, paragraphLength: event.target.value }))} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400">
            <option value="short">短段落</option>
            <option value="medium">中段落</option>
            <option value="long">长段落</option>
          </select>
          <select value={form.titleStyle} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, titleStyle: event.target.value }))} className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400">
            <option value="plain">平直标题</option>
            <option value="sharp">锐利标题</option>
            <option value="serif">衬线标题</option>
          </select>
          <input value={form.bannedPunctuation} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, bannedPunctuation: event.target.value }))} placeholder="禁用标点，空格或逗号分隔" className="border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        </div>
        <textarea value={form.description} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="这套排版基因适合什么写法、什么场景" className="mt-3 min-h-[96px] w-full border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <textarea value={form.bannedWords} disabled={!canForkGenomes} onChange={(event) => setForm((prev) => ({ ...prev, bannedWords: event.target.value }))} placeholder="可选：额外禁词，支持逗号或换行分隔" className="mt-3 min-h-[80px] w-full border border-stone-300 bg-white px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs leading-6 text-stone-500">{canForkGenomes ? "新建后默认为私有，可继续修改，满足套餐门禁后再发布到公开集市。" : "免费版当前只开放集市浏览；升级到 Pro 后，才可新建私有基因并应用到文稿。"} </div>
          <button onClick={createGenome} disabled={creating || !canForkGenomes} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {!canForkGenomes ? "仅 Pro+ 可新建" : creating ? "创建中..." : "创建私有基因"}
          </button>
        </div>
      </section>
      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模板系统</div>
        <div className="mt-4 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="text-sm leading-7 text-stone-700">
              把你看到的优质公众号或网页版式抽成模板候选，进入 `template_versions`，后续可继续人工微调。
            </div>
            <input
              value={templateUrl}
              disabled={!canForkGenomes}
              onChange={(event) => setTemplateUrl(event.target.value)}
              placeholder="粘贴要提取模板的 URL"
              className="w-full border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm disabled:bg-stone-100 disabled:text-stone-400"
            />
            <button onClick={extractTemplate} disabled={extracting || !canForkGenomes} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
              {!canForkGenomes ? "仅 Pro+ 可提取" : extracting ? "提取中..." : "从 URL 提取模板"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <article
                key={`${template.id}-${template.version}`}
                className={`border p-4 ${selectedTemplate?.id === template.id ? "border-cinnabar bg-[#fff7f2]" : "border-stone-300/40 bg-[#faf7f0]"}`}
              >
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">
                  {template.meta || "模板"} · {template.version}
                </div>
                <div className="mt-2 font-serifCn text-2xl text-ink">{template.name}</div>
                <p className="mt-2 text-sm leading-7 text-stone-700">{template.description || "暂无说明"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {summarizeConfig(template.config).map((item) => (
                    <span key={`${template.id}-${item}`} className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                      {item}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setSelectedTemplateId(template.id)}
                  className={`mt-4 px-3 py-2 text-sm ${selectedTemplate?.id === template.id ? "bg-cinnabar text-white" : "border border-stone-300 bg-white text-stone-700"}`}
                >
                  {selectedTemplate?.id === template.id ? "当前预览" : "预览模板"}
                </button>
              </article>
            ))}
          </div>
          <aside className="border border-stone-300/40 bg-[#f4efe6] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模板预览</div>
            {selectedTemplate ? (
              <div className="mt-4 space-y-4">
                <div className="border border-stone-300 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{templatePreview.eyebrow}</div>
                  <div className={`mt-3 text-3xl text-ink ${selectedTemplate.config?.titleStyle === "serif" ? "font-serifCn" : "font-sansCn font-semibold"}`}>
                    {templatePreview.title}
                  </div>
                  <p className={`mt-4 text-stone-700 ${selectedTemplate.config?.paragraphLength === "short" ? "space-y-3 text-sm leading-7" : selectedTemplate.config?.paragraphLength === "long" ? "space-y-5 text-base leading-9" : "space-y-4 text-sm leading-8"}`}>
                    {templatePreview.lead}
                  </p>
                  <div className="mt-4 border-l-4 border-cinnabar bg-[#faf7f0] px-4 py-3 text-sm leading-7 text-stone-700">
                    {templatePreview.emphasis}
                  </div>
                  <div className="mt-4 border border-stone-300 bg-[#111111] px-4 py-3 text-xs leading-6 text-stone-200">
                    code block / quote / 强调句都会按当前模板的微信 HTML 规则渲染
                  </div>
                </div>
                <div className="border border-stone-300 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">发布提示</div>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                    <div>模板 ID：{selectedTemplate.id}</div>
                    <div>模板名称：{selectedTemplate.name}</div>
                    <div>适用语气：{String(selectedTemplate.config?.tone || "默认")}</div>
                    <div>禁词数：{Array.isArray(selectedTemplate.config?.bannedWords) ? selectedTemplate.config?.bannedWords.length : 0}</div>
                    <div>禁用标点：{Array.isArray(selectedTemplate.config?.bannedPunctuation) && selectedTemplate.config?.bannedPunctuation.length ? selectedTemplate.config?.bannedPunctuation.join(" / ") : "无"}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 border border-dashed border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
                当前还没有模板资产，先从左侧输入 URL 提取一个真实模板。
              </div>
            )}
          </aside>
        </div>
      </section>
      {genomes.map((genome) => (
        <article key={genome.id} className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">
                {genome.meta || "排版基因"} {genome.isOfficial ? "· 官方" : genome.isPublic ? "· 已公开" : "· 私有"}
              </div>
              <h3 className="mt-3 font-serifCn text-2xl text-ink">{genome.name}</h3>
              <p className="mt-3 text-sm leading-7 text-stone-700">{genome.description || "暂无说明"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {summarizeConfig(genome.config).map((item) => (
                  <span key={item} className="border border-stone-300 bg-[#faf7f0] px-3 py-1 text-xs text-stone-700">
                    {item}
                  </span>
                ))}
              </div>
              {!genome.isOfficial && genome.ownerUsername ? (
                <div className="mt-3 text-xs uppercase tracking-[0.2em] text-stone-500">
                  <Link href={`/creator/${genome.ownerUsername}`} className="hover:text-cinnabar">
                    创作者：{genome.ownerUsername}
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => forkGenome(genome.id)}
                disabled={!canForkGenomes}
                className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 disabled:text-stone-400"
              >
                {canForkGenomes ? "Fork" : "仅 Pro+ 可 Fork"}
              </button>
              {!genome.isOfficial && !genome.isPublic && genome.ownerUserId ? (
                <button
                  onClick={() => publishGenome(genome.id)}
                  disabled={!canPublishGenomes}
                  className="bg-cinnabar px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  {canPublishGenomes ? "发布" : "仅藏锋/团队可发布"}
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
