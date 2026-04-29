import React from "react";
import type { PersonalEffectiveWritingProfile } from "@/lib/author-outcome-feedback-ledger";

type PersonalEffectiveWritingRailProps = {
  effectiveWritingProfile: PersonalEffectiveWritingProfile;
};

function getConfidenceLabel(confidence: "early" | "medium" | "high") {
  if (confidence === "high") return "高置信";
  if (confidence === "medium") return "中置信";
  return "早期样本";
}

export function PersonalEffectiveWritingRail({
  effectiveWritingProfile,
}: PersonalEffectiveWritingRailProps) {
  const facets = effectiveWritingProfile
    ? [
        effectiveWritingProfile.opening
          ? { key: "opening", eyebrow: "开头方式", facet: effectiveWritingProfile.opening }
          : null,
        effectiveWritingProfile.judgement
          ? { key: "judgement", eyebrow: "判断强度", facet: effectiveWritingProfile.judgement }
          : null,
        effectiveWritingProfile.rhythm
          ? { key: "rhythm", eyebrow: "段落节奏", facet: effectiveWritingProfile.rhythm }
          : null,
        effectiveWritingProfile.prototype
          ? { key: "prototype", eyebrow: "文章原型", facet: effectiveWritingProfile.prototype }
          : null,
      ].filter((item): item is {
        key: string;
        eyebrow: string;
        facet: NonNullable<NonNullable<PersonalEffectiveWritingProfile>[keyof Omit<NonNullable<PersonalEffectiveWritingProfile>, "summary" | "updatedAt">]>;
      } => Boolean(item))
    : [];

  return (
    <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">个人有效写法</div>
          <div className="mt-2 text-sm leading-7 text-inkMuted">
            {effectiveWritingProfile
              ? "把作者级高命中写法直接放在稿件旁边，写这一篇时就能立即参考。"
              : "结果样本还不够，先继续补回流快照和命中判定，系统才会收敛出作者级有效写法。"}
          </div>
        </div>
        <a
          href={effectiveWritingProfile ? "/reviews#effective-writing-profile" : "/reviews#outcome-tagging"}
          className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft transition hover:border-cinnabar hover:text-cinnabar"
        >
          {effectiveWritingProfile ? "去复盘页" : "去补结果"}
        </a>
      </div>

      {effectiveWritingProfile ? (
        <>
          <div className="mt-4 border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            {effectiveWritingProfile.summary}
          </div>
          <div className="mt-3 space-y-3">
            {facets.map((item) => (
              <article key={item.key} className="border border-lineStrong bg-surface px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.eyebrow}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkMuted">
                  <span className="border border-lineStrong bg-paperStrong px-2 py-1">{item.facet.label}</span>
                  <span className="border border-lineStrong bg-paperStrong px-2 py-1">{getConfidenceLabel(item.facet.confidence)}</span>
                  <span className="border border-lineStrong bg-paperStrong px-2 py-1">样本 {item.facet.sampleCount}</span>
                  <span className="border border-lineStrong bg-paperStrong px-2 py-1">正向 {item.facet.positiveSampleCount}</span>
                </div>
                <div className="mt-3 font-medium text-ink">{item.facet.summary}</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">{item.facet.reason}</div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
          等同一作者积累起更多结果样本后，这里会直接提示更适合他的开头、判断强度、段落节奏和文章原型。
        </div>
      )}
    </div>
  );
}
