"use client";

import { Button, Input, Textarea, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
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
  sampleCount?: number;
  sampleUrls?: string[];
  sampleTitles?: string[];
  sampleSources?: Array<{
    url: string;
    title: string;
    summary: string;
    degradedReason: string | null;
  }>;
  confidenceProfile?: Record<string, number> | null;
  createdAt: string;
};

type WritingStyleAnalysisPreview = Omit<WritingStyleProfileItem, "id" | "createdAt" | "name"> & {
  styleName: string;
  degradedReason?: string | null;
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
const composeCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "space-y-3 shadow-none");

const CONFIDENCE_LABELS: Record<string, string> = {
  toneKeywords: "语气关键词",
  structurePatterns: "结构习惯",
  languageHabits: "语言习惯",
  openingPatterns: "开头动作",
  endingPatterns: "结尾动作",
  sentenceRhythm: "句长节奏",
  sentenceLengthProfile: "句长分布",
  paragraphBreathingPattern: "段落呼吸",
  punctuationHabits: "标点习惯",
  tangentPatterns: "跑题方式",
  callbackPatterns: "回环方式",
  statePresets: "状态预设",
  antiOutlineRules: "反结构规则",
  verbatimPhraseBanks: "逐字词组",
};

function formatConfidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getConfidenceHeatTone(value: number) {
  if (value >= 0.85) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (value >= 0.7) return "border-warning/40 bg-surfaceWarning text-warning";
  if (value >= 0.5) return "border-lineStrong bg-surfaceWarm text-inkSoft";
  return "border-danger/20 bg-red-50 text-danger";
}

function getConfidenceBarTone(value: number) {
  if (value >= 0.85) return "bg-emerald-500";
  if (value >= 0.7) return "bg-warning";
  if (value >= 0.5) return "bg-cinnabar/60";
  return "bg-danger";
}

function getConfidenceSummaryLabel(value: number) {
  if (value >= 0.85) return "高稳定";
  if (value >= 0.7) return "基本稳定";
  if (value >= 0.5) return "波动偏高";
  return "待复核";
}

function ConfidenceHeatmap({
  confidenceProfile,
  sampleCount,
  className = "",
}: {
  confidenceProfile: Record<string, number>;
  sampleCount?: number;
  className?: string;
}) {
  const entries = Object.entries(confidenceProfile)
    .filter(([, score]) => typeof score === "number" && Number.isFinite(score))
    .sort((left, right) => right[1] - left[1]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={cn(highlightPanelClassName, className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">稳定性热力图</div>
          <div className="mt-2 text-sm leading-6 text-inkSoft">
            {sampleCount && sampleCount >= 3
              ? `当前基于 ${sampleCount} 篇样本交叉聚合，颜色越深说明这一维越稳定。`
              : "样本还偏少，热力图只做参考，最好补到 3 篇以上再判断。"}
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {entries.map(([key, score]) => (
          <div key={key} className={cn("border px-3 py-3", getConfidenceHeatTone(score))}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.16em]">{CONFIDENCE_LABELS[key] || key}</div>
              <div className="text-xs">{formatConfidence(score)}</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/60">
              <div
                className={cn("h-full rounded-full", getConfidenceBarTone(score))}
                style={{ width: `${Math.max(8, Math.round(score * 100))}%` }}
              />
            </div>
            <div className="mt-3 text-xs leading-6">{getConfidenceSummaryLabel(score)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WritingStyleProfilesPanel({
  profiles,
  maxCount,
  sampleLimit,
}: {
  profiles: WritingStyleProfileItem[];
  maxCount: number;
  sampleLimit: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sourceUrls, setSourceUrls] = useState("");
  const [draftName, setDraftName] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<WritingStyleAnalysisPreview | null>(null);

  async function handleAnalyze() {
    const urls = Array.from(new Set(sourceUrls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)));
    if (urls.length < 3) {
      setMessage("交叉分析至少需要 3 篇文章链接。");
      return;
    }
    setAnalyzing(true);
    setMessage("");
    const response = await fetch("/api/writing-style-profiles/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const json = await response.json().catch(() => ({}));
    setAnalyzing(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "文风分析失败");
      return;
    }
    setPreview(json.data.analysis as WritingStyleAnalysisPreview);
    setDraftName(String((json.data.analysis as WritingStyleAnalysisPreview)?.styleName || ""));
    setMessage(
      json.data.quota?.limit
        ? `文风分析完成。今日已用 ${json.data.quota.used} / ${json.data.quota.limit} 次。`
        : "文风分析完成。",
    );
  }

  async function handleSavePreview() {
    if (!preview) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/writing-style-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        analysis: preview,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok || !json.success) {
      setMessage(json.error || "写作风格资产保存失败");
      return;
    }
    setPreview(null);
    setDraftName("");
    setSourceUrls("");
    setMessage("写作风格资产已保存。");
    startTransition(() => router.refresh());
  }

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
      <div className={composeCardClassName}>
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">交叉分析</div>
        <div className="text-sm leading-7 text-inkSoft">
          一次粘贴 3-{sampleLimit} 篇同作者或同赛道文章链接，系统会先逐篇抽取，再做稳定性聚合，并输出稳定性热力图。
        </div>
        <Textarea
          value={sourceUrls}
          onChange={(event) => setSourceUrls(event.target.value)}
          placeholder={"每行 1 个链接\nhttps://example.com/post-1\nhttps://example.com/post-2\nhttps://example.com/post-3"}
          className="min-h-[132px] bg-surface"
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary">
            {analyzing ? "分析中…" : "开始交叉分析"}
          </Button>
        </div>
        {preview ? (
          <div className={profileCardClassName}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-serifCn text-2xl text-ink text-balance">{preview.styleName}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.2em] text-inkMuted">
                  样本 {preview.sampleCount || preview.sampleSources?.length || 1} 篇
                </div>
              </div>
              <div className="min-w-[240px] space-y-2">
                <Input
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="保存后的风格资产名称"
                  className="bg-surface"
                />
                <Button onClick={handleSavePreview} disabled={saving} variant="secondary">
                  {saving ? "保存中…" : "保存为风格资产"}
                </Button>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-inkSoft">{preview.summary}</p>
            {preview.confidenceProfile ? (
              <ConfidenceHeatmap confidenceProfile={preview.confidenceProfile} sampleCount={preview.sampleCount} className="mt-4" />
            ) : null}
            {preview.sampleSources?.length ? (
              <div className={highlightPanelClassName}>
                <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">样本来源</div>
                <div className="mt-2 space-y-2">
                  {preview.sampleSources.map((item) => (
                    <div key={`${item.url}-${item.title}`}>
                      <div className="font-medium text-ink">{item.title || item.url}</div>
                      <div>{item.summary}</div>
                      {item.degradedReason ? <div className="text-cinnabar">降级：{item.degradedReason}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {preview.degradedReason ? <div className="text-sm text-cinnabar">{preview.degradedReason}</div> : null}
          </div>
        ) : null}
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
                  {profile.sampleCount && profile.sampleCount > 1 ? (
                    <div className="mt-2 text-xs text-inkMuted">交叉样本 {profile.sampleCount} 篇</div>
                  ) : null}
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
                {profile.confidenceProfile ? (
                  <ConfidenceHeatmap confidenceProfile={profile.confidenceProfile} sampleCount={profile.sampleCount} />
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
                {profile.sampleSources?.length ? (
                  <div className={highlightPanelClassName}>
                    <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">交叉样本</div>
                    <div className="mt-2 space-y-2">
                      {profile.sampleSources.slice(0, 5).map((item) => (
                        <div key={`${profile.id}-${item.url}-${item.title}`}>
                          <strong>{item.title || item.url}</strong>
                          <div>{item.summary}</div>
                        </div>
                      ))}
                    </div>
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
