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
}: {
  genomes: GenomeItem[];
  templates: TemplateItem[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);
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

  async function createGenome() {
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
          <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="基因名称" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
          <input value={form.meta} onChange={(event) => setForm((prev) => ({ ...prev, meta: event.target.value }))} placeholder="标签，如：评论 / 版式 / 词库" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
          <input value={form.tone} onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value }))} placeholder="语气，例如：冷静、纪实、克制" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
          <select value={form.paragraphLength} onChange={(event) => setForm((prev) => ({ ...prev, paragraphLength: event.target.value }))} className="border border-stone-300 bg-white px-4 py-3 text-sm">
            <option value="short">短段落</option>
            <option value="medium">中段落</option>
            <option value="long">长段落</option>
          </select>
          <select value={form.titleStyle} onChange={(event) => setForm((prev) => ({ ...prev, titleStyle: event.target.value }))} className="border border-stone-300 bg-white px-4 py-3 text-sm">
            <option value="plain">平直标题</option>
            <option value="sharp">锐利标题</option>
            <option value="serif">衬线标题</option>
          </select>
          <input value={form.bannedPunctuation} onChange={(event) => setForm((prev) => ({ ...prev, bannedPunctuation: event.target.value }))} placeholder="禁用标点，空格或逗号分隔" className="border border-stone-300 bg-white px-4 py-3 text-sm" />
        </div>
        <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="这套排版基因适合什么写法、什么场景" className="mt-3 min-h-[96px] w-full border border-stone-300 bg-white px-4 py-3 text-sm" />
        <textarea value={form.bannedWords} onChange={(event) => setForm((prev) => ({ ...prev, bannedWords: event.target.value }))} placeholder="可选：额外禁词，支持逗号或换行分隔" className="mt-3 min-h-[80px] w-full border border-stone-300 bg-white px-4 py-3 text-sm" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs leading-6 text-stone-500">新建后默认为私有，可继续修改，满足套餐门禁后再发布到公开集市。</div>
          <button onClick={createGenome} disabled={creating} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
            {creating ? "创建中..." : "创建私有基因"}
          </button>
        </div>
      </section>
      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模板系统</div>
        <div className="mt-4 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="text-sm leading-7 text-stone-700">
              把你看到的优质公众号或网页版式抽成模板候选，进入 `template_versions`，后续可继续人工微调。
            </div>
            <input
              value={templateUrl}
              onChange={(event) => setTemplateUrl(event.target.value)}
              placeholder="粘贴要提取模板的 URL"
              className="w-full border border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm"
            />
            <button onClick={extractTemplate} disabled={extracting} className="bg-cinnabar px-4 py-3 text-sm text-white disabled:opacity-60">
              {extracting ? "提取中..." : "从 URL 提取模板"}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <article key={`${template.id}-${template.version}`} className="border border-stone-300/40 bg-[#faf7f0] p-4">
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
              </article>
            ))}
          </div>
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
              <button onClick={() => forkGenome(genome.id)} className="border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700">
                Fork
              </button>
              {!genome.isOfficial && !genome.isPublic && genome.ownerUserId ? (
                <button onClick={() => publishGenome(genome.id)} className="bg-cinnabar px-3 py-2 text-sm text-white">
                  发布
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
