"use client";

import { Button, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
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
  sentenceLengthProfile?: string | null;
  paragraphBreathingPattern?: string | null;
  structurePatterns: string[];
  transitionPatterns?: string[];
  languageHabits: string[];
  openingPatterns: string[];
  endingPatterns: string[];
  punctuationHabits?: string[];
  tangentPatterns?: string[];
  callbackPatterns?: string[];
  verbatimPhraseBanks?: {
    transitionPhrases?: string[];
    judgementPhrases?: string[];
    selfDisclosurePhrases?: string[];
    emotionPhrases?: string[];
    readerBridgePhrases?: string[];
  };
  tabooPatterns?: string[];
  statePresets?: string[];
  antiOutlineRules?: string[];
  factDensity?: string | null;
  emotionalIntensity?: string | null;
  suitableTopics?: string[];
  reusablePromptFragments?: string[];
  doNotWrite: string[];
  imitationPrompt: string;
  sourceExcerpt: string | null;
  createdAt: string;
};

const returnLinkClassName = buttonStyles({ variant: "secondary" });
const emptyStateClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "border-dashed text-sm leading-7 text-inkMuted shadow-none",
);
const profileCardClassName = cn(surfaceCardStyles({ padding: "md" }), "shadow-none");
const highlightPanelClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "text-sm leading-7 text-inkSoft shadow-none");
const warmPanelClassName = cn(surfaceCardStyles({ tone: "warm", padding: "sm" }), "text-sm leading-7 text-inkSoft shadow-none");
const deleteButtonClassName = "min-h-0 border-danger/30 bg-surface px-3 py-2 text-xs text-danger hover:border-danger/40 hover:bg-surfaceHighlight hover:text-danger";
const messageClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "text-sm text-cinnabar");

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
    if (!window.confirm("确定要删除吗？")) return;

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
          <h3 className="mt-3 font-serifCn text-3xl text-ink text-balance">把抽取结果沉淀成可复用风格。</h3>
          <p className="mt-3 text-sm leading-7 text-inkSoft">
            当前已保存 {profiles.length} / {maxCount} 个风格资产。先在“作者与系列”补分析样本，再把结果沉淀到个人空间。
          </p>
        </div>
        <Link href="/settings/author" className={returnLinkClassName}>
          返回作者与系列
        </Link>
      </div>
      {profiles.length === 0 ? (
        <div className={emptyStateClassName}>
          还没有保存的写作风格。先在作者与系列里分析一篇文章，再把结果保存到个人空间。
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {profiles.map((profile) => (
            <article key={profile.id} className={profileCardClassName}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-serifCn text-2xl text-ink text-balance">{profile.name}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.2em] text-inkMuted">
                    {profile.sourceTitle || "外部文章"} · {new Date(profile.createdAt).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <Button
                  onClick={() => handleDelete(profile.id)}
                  disabled={deletingId === profile.id}
                  variant="secondary"
                  size="sm"
                  className={deleteButtonClassName}
                >
                  {deletingId === profile.id ? "删除中…" : "删除"}
                </Button>
              </div>
              <p className="mt-4 text-sm leading-7 text-inkSoft">{profile.summary}</p>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {profile.toneKeywords.map((item) => (
                    <span key={`${profile.id}-tone-${item}`} className="border border-warning/40 bg-surfaceWarning px-2 py-1 text-xs text-warning">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="text-sm leading-7 text-inkSoft">
                  <strong>结构：</strong>{profile.structurePatterns.join(" / ")}
                </div>
                {profile.transitionPatterns?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>过渡：</strong>{profile.transitionPatterns.join(" / ")}
                  </div>
                ) : null}
                <div className="text-sm leading-7 text-inkSoft">
                  <strong>语言习惯：</strong>{profile.languageHabits.join(" / ")}
                </div>
                {profile.sentenceRhythm ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>句长节奏：</strong>{profile.sentenceRhythm}
                  </div>
                ) : null}
                {profile.sentenceLengthProfile ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>句长分布：</strong>{profile.sentenceLengthProfile}
                  </div>
                ) : null}
                {profile.paragraphBreathingPattern ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>段落呼吸：</strong>{profile.paragraphBreathingPattern}
                  </div>
                ) : null}
                {profile.punctuationHabits?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>标点习惯：</strong>{profile.punctuationHabits.join(" / ")}
                  </div>
                ) : null}
                {profile.tangentPatterns?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>跑题方式：</strong>{profile.tangentPatterns.join(" / ")}
                  </div>
                ) : null}
                {profile.callbackPatterns?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>回环方式：</strong>{profile.callbackPatterns.join(" / ")}
                  </div>
                ) : null}
                {(profile.factDensity || profile.emotionalIntensity) ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>风格强度：</strong>
                    {[profile.factDensity ? `事实密度 ${profile.factDensity}` : null, profile.emotionalIntensity ? `情绪幅度 ${profile.emotionalIntensity}` : null]
                      .filter(Boolean)
                      .join(" / ")}
                  </div>
                ) : null}
                {profile.suitableTopics?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {profile.suitableTopics.map((item) => (
                      <span key={`${profile.id}-topic-${item}`} className="border border-lineStrong bg-surfaceWarm px-2 py-1 text-xs text-inkSoft">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {profile.reusablePromptFragments?.length ? (
                  <div className={highlightPanelClassName}>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">可复用提示片段</div>
                    <ul className="mt-2 space-y-1">
                      {profile.reusablePromptFragments.map((item) => (
                        <li key={`${profile.id}-fragment-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {profile.verbatimPhraseBanks ? (
                  <div className={warmPanelClassName}>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">逐字词组库</div>
                    {[
                      ["转场", profile.verbatimPhraseBanks.transitionPhrases],
                      ["判断", profile.verbatimPhraseBanks.judgementPhrases],
                      ["自我暴露", profile.verbatimPhraseBanks.selfDisclosurePhrases],
                      ["情绪", profile.verbatimPhraseBanks.emotionPhrases],
                      ["拉近读者", profile.verbatimPhraseBanks.readerBridgePhrases],
                    ].map(([label, values]) =>
                      values && values.length > 0 ? (
                        <div key={`${profile.id}-${label}`} className="mt-2">
                          <strong>{label}：</strong>{Array.isArray(values) ? values.join(" / ") : values}
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null}
                {profile.statePresets?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>状态预设：</strong>{profile.statePresets.join(" / ")}
                  </div>
                ) : null}
                {profile.antiOutlineRules?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>反结构规则：</strong>{profile.antiOutlineRules.join(" / ")}
                  </div>
                ) : null}
                {profile.tabooPatterns?.length ? (
                  <div className="text-sm leading-7 text-inkSoft">
                    <strong>禁忌写法：</strong>{profile.tabooPatterns.join(" / ")}
                  </div>
                ) : null}
                <div className={warmPanelClassName}>
                  <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">模仿提示</div>
                  <div className="mt-2">{profile.imitationPrompt}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {message ? <div className={messageClassName}>{message}</div> : null}
    </div>
  );
}
