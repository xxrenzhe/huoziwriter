"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ViewerState = {
  planCode: "free" | "pro" | "ultra" | null;
  username?: string;
};

type StyleExtractResult = {
  sourceUrl: string;
  sourceTitle: string;
  styleName: string;
  summary: string;
  toneKeywords: string[];
  sentenceRhythm: string;
  structurePatterns: string[];
  transitionPatterns: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  factDensity: string;
  emotionalIntensity: string;
  suitableTopics: string[];
  reusablePromptFragments: string[];
  doNotWrite: string[];
  imitationPrompt: string;
  sourceExcerpt: string;
  model: string;
  provider: string;
  degradedReason: string | null;
  quota: { used: number; limit: number; remaining: number };
  canSaveProfile: boolean;
  viewerPlanCode: "free" | "pro" | "ultra" | null;
};

export function StyleExtractorClient() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<StyleExtractResult | null>(null);
  const [viewer, setViewer] = useState<ViewerState>({ planCode: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (json?.success) {
          setViewer({
            planCode: json.data.planCode,
            username: json.data.username,
          });
        }
      })
      .catch(() => {});
  }, []);

  async function handleAnalyze() {
    setLoading(true);
    setMessage("");
    setError("");
    setResult(null);
    const response = await fetch("/api/tools/style-extractor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const json = await response.json();
    setLoading(false);
    if (!response.ok || !json.success) {
      setError(json.error || "文风提取失败");
      return;
    }
    setResult(json.data);
    setViewer((current) => ({ ...current, planCode: json.data.viewerPlanCode ?? current.planCode ?? null }));
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/writing-style-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis: result, name: result.styleName }),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok || !json.success) {
      setError(json.error || "保存失败");
      return;
    }
    setMessage("风格已保存到你的个人空间。");
  }

  const saveHint =
    viewer.planCode === "pro" || viewer.planCode === "ultra"
      ? "当前账号可直接把分析结果保存到个人空间。"
      : viewer.planCode === "free"
        ? "免费套餐可以分析，但不能保存；升级到 Pro 或 Ultra 后可保存为个人风格资产。"
        : "游客可免费分析 1 次/日；登录后按套餐获得更高额度，并支持保存到个人空间。";

  return (
    <div className="space-y-8">
      <section className="border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Style Extractor</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink md:text-5xl">输入一篇文章链接，拆出它真正的写作风格。</h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-stone-700">
          系统会先抓取正文，再分析语气、结构、句式习惯、开头结尾和模仿提示。它不是抽象夸奖器，而是把可复用的表达规律拆出来。
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">输入链接</div>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="粘贴公众号文章或网页文章链接"
            className="mt-4 w-full border border-stone-300 bg-[#faf7f0] px-4 py-4 text-sm"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={handleAnalyze} disabled={loading} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
              {loading ? "分析中..." : "开始提取"}
            </button>
            {result?.canSaveProfile ? (
              <button onClick={handleSave} disabled={saving} className="border border-stone-300 bg-white px-5 py-3 text-sm text-stone-700 disabled:opacity-60">
                {saving ? "保存中..." : "保存到个人空间"}
              </button>
            ) : null}
          </div>
          <div className="mt-4 text-sm leading-7 text-stone-700">{saveHint}</div>
          {result ? (
            <div className="mt-4 border border-stone-300/40 bg-[#faf7f0] px-4 py-4 text-sm leading-7 text-stone-700">
              今日已用 {result.quota.used} / {result.quota.limit} 次，还剩 {result.quota.remaining} 次。
              {result.degradedReason ? ` 当前结果为降级分析：${result.degradedReason}。` : ""}
            </div>
          ) : null}
          {message ? <div className="mt-4 text-sm text-emerald-700">{message}</div> : null}
          {error ? <div className="mt-4 text-sm text-cinnabar">{error}</div> : null}
        </div>

        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">说明</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>游客：1 次/日。</p>
            <p>`free`：3 次/日，可分析不可保存。</p>
            <p>`pro`：20 次/日，可保存到个人空间。</p>
            <p>`ultra`：100 次/日，可保存更多风格资产。</p>
          </div>
          <div className="mt-5 space-y-3">
            {viewer.planCode ? (
              <Link href="/settings" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                去设置页查看个人风格资产
              </Link>
            ) : (
              <Link href="/login" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                登录后保存分析结果
              </Link>
            )}
          </div>
        </aside>
      </section>

      {result ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{result.sourceTitle || "外部文章"}</div>
              <h2 className="mt-3 font-serifCn text-3xl text-ink">{result.styleName}</h2>
              <p className="mt-4 text-sm leading-7 text-stone-700">{result.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.toneKeywords.map((item) => (
                  <span key={item} className="border border-[#dcc8a6] bg-[#fff8eb] px-3 py-1 text-xs text-[#7d6430]">
                    {item}
                  </span>
                ))}
              </div>
            </article>

            <article className="grid gap-4 md:grid-cols-2">
              {([
                ["句长节奏", [result.sentenceRhythm]],
                ["结构习惯", result.structurePatterns],
                ["过渡方式", result.transitionPatterns],
                ["语言习惯", result.languageHabits],
                ["开头方式", result.openingPatterns],
                ["结尾方式", result.endingPatterns],
              ] as Array<[string, string[]]>).map(([title, items]) => (
                <div key={title} className="border border-stone-300/40 bg-white p-5 shadow-ink">
                  <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{title}</div>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                    {items.map((item) => (
                      <li key={`${title}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>

            <article className="grid gap-4 md:grid-cols-2">
              <div className="border border-stone-300/40 bg-white p-5 shadow-ink">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">事实密度</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">{result.factDensity}</div>
              </div>
              <div className="border border-stone-300/40 bg-white p-5 shadow-ink">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">情绪幅度</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">{result.emotionalIntensity}</div>
              </div>
            </article>

            <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模仿提示</div>
              <div className="mt-4 border border-stone-300/40 bg-[#faf7f0] p-4 text-sm leading-7 text-stone-700">
                {result.imitationPrompt}
              </div>
            </article>
          </div>

          <aside className="space-y-4">
            <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">适合主题</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.suitableTopics.map((item) => (
                  <span key={item} className="border border-[#dcc8a6] bg-[#fff8eb] px-3 py-1 text-xs text-[#7d6430]">
                    {item}
                  </span>
                ))}
              </div>
            </article>
            <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">可复用 Prompt 片段</div>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                {result.reusablePromptFragments.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">不要模仿</div>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                {result.doNotWrite.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">正文摘录</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">{result.sourceExcerpt}</div>
            </article>
          </aside>
        </section>
      ) : null}
    </div>
  );
}
