type DeepWritingSeriesInsightPanelProps = {
  label: string;
  reason: string;
  commonTerms: string[];
  checklist: string[];
};

export function DeepWritingSeriesInsightPanel({
  label,
  reason,
  commonTerms,
  checklist,
}: DeepWritingSeriesInsightPanelProps) {
  return (
    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前文章所属系列</div>
      <div className="mt-2 font-medium text-ink">{label || "连续观察主题"}</div>
      {reason ? (
        <div className="mt-2 text-sm leading-7 text-inkSoft">{reason}</div>
      ) : null}
      {commonTerms.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
          {commonTerms.map((item) => (
            <span key={`series-term-${item}`} className="border border-lineStrong bg-surface px-3 py-2">{item}</span>
          ))}
        </div>
      ) : null}
      {checklist.length > 0 ? (
        <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
          {checklist.map((item) => (
            <div key={item}>- {item}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
