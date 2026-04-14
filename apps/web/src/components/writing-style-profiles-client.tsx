"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

type WritingStyleProfileItem = {
  id: number;
  name: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  summary: string;
  toneKeywords: string[];
  sentenceRhythm?: string | null;
  structurePatterns: string[];
  transitionPatterns?: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  factDensity?: string | null;
  emotionalIntensity?: string | null;
  suitableTopics?: string[];
  reusablePromptFragments?: string[];
  doNotWrite: string[];
  imitationPrompt: string;
  sourceExcerpt: string | null;
  createdAt: string;
};

export function WritingStyleProfilesPanel({
  profiles,
  maxCount,
}: {
  profiles: WritingStyleProfileItem[];
  maxCount: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    setDeletingId(id);
    setMessage("");
    const response = await fetch(`/api/writing-style-profiles/${id}`, { method: "DELETE" });
    const json = await response.json();
    setDeletingId(null);
    if (!response.ok || !json.success) {
      setMessage(json.error || "删除失败");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">写作风格资产</div>
          <h3 className="mt-3 font-serifCn text-3xl text-ink">把抽取结果沉淀成可复用风格。</h3>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            当前已保存 {profiles.length} / {maxCount} 个风格资产。你可以在外部工具页先分析，再保存到个人空间。
          </p>
        </div>
        <a href="/tools/style-extractor" className="border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
          打开风格提取器
        </a>
      </div>
      {profiles.length === 0 ? (
        <div className="border border-dashed border-stone-300 bg-[#faf7f0] px-4 py-5 text-sm leading-7 text-stone-600">
          还没有保存的写作风格。先去风格提取器输入文章链接，分析后再一键保存到个人空间。
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {profiles.map((profile) => (
            <article key={profile.id} className="border border-stone-300/40 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-serifCn text-2xl text-ink">{profile.name}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-500">
                    {profile.sourceTitle || "外部文章"} · {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(profile.id)}
                  disabled={deletingId === profile.id}
                  className="border border-[#d8b0b2] px-3 py-2 text-xs text-[#8f3136] disabled:opacity-60"
                >
                  {deletingId === profile.id ? "删除中..." : "删除"}
                </button>
              </div>
              <p className="mt-4 text-sm leading-7 text-stone-700">{profile.summary}</p>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {profile.toneKeywords.map((item) => (
                    <span key={`${profile.id}-tone-${item}`} className="border border-[#dcc8a6] bg-[#fff8eb] px-2 py-1 text-xs text-[#7d6430]">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="text-sm leading-7 text-stone-700">
                  <strong>结构：</strong>{profile.structurePatterns.join(" / ")}
                </div>
                {profile.transitionPatterns?.length ? (
                  <div className="text-sm leading-7 text-stone-700">
                    <strong>过渡：</strong>{profile.transitionPatterns.join(" / ")}
                  </div>
                ) : null}
                <div className="text-sm leading-7 text-stone-700">
                  <strong>语言习惯：</strong>{profile.languageHabits.join(" / ")}
                </div>
                {profile.sentenceRhythm ? (
                  <div className="text-sm leading-7 text-stone-700">
                    <strong>句长节奏：</strong>{profile.sentenceRhythm}
                  </div>
                ) : null}
                {(profile.factDensity || profile.emotionalIntensity) ? (
                  <div className="text-sm leading-7 text-stone-700">
                    <strong>风格强度：</strong>
                    {[profile.factDensity ? `事实密度 ${profile.factDensity}` : null, profile.emotionalIntensity ? `情绪幅度 ${profile.emotionalIntensity}` : null]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                ) : null}
                {profile.suitableTopics?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.suitableTopics.map((item) => (
                      <span key={`${profile.id}-topic-${item}`} className="border border-stone-300 bg-[#faf7f0] px-2 py-1 text-xs text-stone-700">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {profile.reusablePromptFragments?.length ? (
                  <div className="border border-stone-300/40 bg-[#fffdfa] p-4 text-sm leading-7 text-stone-700">
                    <div className="text-xs uppercase tracking-[0.2em] text-stone-500">可复用 Prompt 片段</div>
                    <ul className="mt-2 space-y-1">
                      {profile.reusablePromptFragments.map((item) => (
                        <li key={`${profile.id}-fragment-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="border border-stone-300/40 bg-[#faf7f0] p-4 text-sm leading-7 text-stone-700">
                  <div className="text-xs uppercase tracking-[0.2em] text-stone-500">模仿提示</div>
                  <div className="mt-2">{profile.imitationPrompt}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </div>
  );
}
