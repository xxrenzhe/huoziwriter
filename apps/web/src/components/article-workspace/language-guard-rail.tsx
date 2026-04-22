import type { LanguageGuardHit } from "@/lib/language-guard-core";

type LanguageGuardRailProps = {
  liveLanguageGuardHits: LanguageGuardHit[];
  liveLanguageGuardSummary: {
    tokenCount: number;
    patternCount: number;
    highSeverityCount: number;
  };
  detectedBannedWords: Array<{ word: string; count: number }>;
};

export function LanguageGuardRail({
  liveLanguageGuardHits,
  liveLanguageGuardSummary,
  detectedBannedWords,
}: LanguageGuardRailProps) {
  return (
    <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">即时语言守卫命中</div>
        {liveLanguageGuardHits.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
            <span className="border border-lineStrong bg-surface px-2 py-1">词语 {liveLanguageGuardSummary.tokenCount}</span>
            <span className="border border-lineStrong bg-surface px-2 py-1">句式 {liveLanguageGuardSummary.patternCount}</span>
            <span className="border border-danger/30 bg-surface px-2 py-1 text-danger">高风险 {liveLanguageGuardSummary.highSeverityCount}</span>
          </div>
        ) : null}
      </div>
      {liveLanguageGuardHits.length === 0 ? (
        <div className="mt-3 text-sm leading-7 text-inkMuted">当前稿件未命中语言守卫规则。</div>
      ) : (
        <div className="mt-3 space-y-3">
          {liveLanguageGuardHits.map((hit, index) => (
            <div
              key={`${hit.ruleId}-${hit.matchedText}-${index}`}
              className={`border px-4 py-3 ${hit.severity === "high" ? "border-danger/30 bg-surface" : "border-lineStrong bg-surface"}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                  {hit.ruleKind === "pattern" ? "句式" : "词语"}
                </span>
                <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                  {hit.scope === "system" ? "系统默认" : "自定义"}
                </span>
                <span className={`border px-2 py-1 ${hit.severity === "high" ? "border-danger/30 text-danger" : "border-lineStrong text-inkMuted"}`}>
                  {hit.severity === "high" ? "高风险" : "提醒"}
                </span>
              </div>
              <div className="mt-3 text-sm leading-7 text-ink">
                命中内容：<span className="font-medium">{hit.matchedText || hit.patternText}</span>
              </div>
              {hit.ruleKind === "pattern" && hit.patternText !== hit.matchedText ? (
                <div className="mt-1 text-xs leading-6 text-inkMuted">句式模板：{hit.patternText}</div>
              ) : null}
              {hit.rewriteHint ? (
                <div className={`mt-2 text-sm leading-7 ${hit.severity === "high" ? "text-danger" : "text-inkSoft"}`}>
                  改写建议：{hit.rewriteHint}
                </div>
              ) : null}
            </div>
          ))}
          {detectedBannedWords.length > 0 ? (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
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
  );
}
