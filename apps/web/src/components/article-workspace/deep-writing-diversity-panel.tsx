type DeepWritingLongTermDiversityReport = {
  status: "needs_attention" | "ready";
  summary: string;
  currentPrototypeLabel: string;
  currentStateVariantLabel: string;
  currentOpeningPatternLabel: string;
  currentSyntaxPatternLabel: string;
  currentEndingPatternLabel: string;
  issues: string[];
  suggestions: string[];
};

type DeepWritingArtifactDiversityConstraint = {
  summary: string;
  issues: string[];
  suggestions: string[];
};

type DeepWritingDiversityPanelProps = {
  longTermReport?: DeepWritingLongTermDiversityReport | null;
  artifactConstraint?: DeepWritingArtifactDiversityConstraint | null;
};

export function DeepWritingDiversityPanel({
  longTermReport,
  artifactConstraint,
}: DeepWritingDiversityPanelProps) {
  return (
    <>
      {longTermReport ? (
        <div className={`border px-4 py-4 text-sm leading-7 ${
          longTermReport.status === "needs_attention"
            ? "border-warning/30 bg-surfaceWarning text-inkSoft"
            : "border-lineStrong/60 bg-paperStrong text-inkSoft"
        }`}>
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">长期去重监控</div>
          <div className="mt-2">{longTermReport.summary}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-inkSoft">
            <span className="border border-lineStrong bg-surface px-3 py-2">当前原型：{longTermReport.currentPrototypeLabel || "未记录"}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">当前状态：{longTermReport.currentStateVariantLabel || "未记录"}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">当前开头：{longTermReport.currentOpeningPatternLabel}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">当前句法：{longTermReport.currentSyntaxPatternLabel}</span>
            <span className="border border-lineStrong bg-surface px-3 py-2">当前结尾：{longTermReport.currentEndingPatternLabel}</span>
          </div>
          {longTermReport.issues.length > 0 ? (
            <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
              {longTermReport.issues.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
          {longTermReport.suggestions.length > 0 ? (
            <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
              {longTermReport.suggestions[0]}
            </div>
          ) : null}
        </div>
      ) : null}

      {artifactConstraint ? (
        <div
          className={`border px-4 py-4 ${
            artifactConstraint.issues.length > 0
              ? "border-warning/30 bg-surfaceWarning"
              : "border-lineStrong/60 bg-paperStrong"
          }`}
        >
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">执行卡去重约束</div>
          {artifactConstraint.summary ? (
            <div className="mt-2 text-sm leading-7 text-inkSoft">{artifactConstraint.summary}</div>
          ) : null}
          {artifactConstraint.issues.length > 0 ? (
            <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
              {artifactConstraint.issues.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
          {artifactConstraint.suggestions.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
              {artifactConstraint.suggestions.map((item) => (
                <div key={item}>- {item}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
