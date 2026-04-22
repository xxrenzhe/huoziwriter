import { Button } from "@huoziwriter/ui";
import { formatWritingQualityStatus } from "@/lib/article-workspace-formatters";

type WritingQualityLayer = {
  code: string;
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  score: number;
  summary: string;
  issues: string[];
  suggestions: string[];
};

type WeakestLayerSummary = {
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  suggestion: string;
} | null;

type ProsePolishIssue = {
  type: string;
  example: string;
  suggestion: string;
};

type ProsePolishLanguageGuardHit = {
  ruleId: string;
  patternText: string;
  ruleKind: string;
  scope: string;
  matchedText: string;
  rewriteHint: string;
};

type ProsePolishAiNoise = {
  score: string;
  level: string;
  findings: string[];
  reasonDetails: Array<{
    label: string;
    count: number;
    reason: string;
    suggestion: string;
  }>;
} | null;

type ProsePolishArtifactPanelProps = {
  overallDiagnosis: string;
  selectedTitle: string;
  titleAuditTimestampLabel: string;
  titleOptionCount: number;
  regeneratingTitles: boolean;
  onRegenerateTitles: () => void;
  weakestLayer: WeakestLayerSummary;
  overallScore: number;
  qualityLayers: WritingQualityLayer[];
  strengths: string[];
  issues: ProsePolishIssue[];
  languageGuardHits: ProsePolishLanguageGuardHit[];
  rewrittenLead: string;
  punchlines: string[];
  rhythmAdvice: string[];
  aiNoise: ProsePolishAiNoise;
};

export function ProsePolishArtifactPanel({
  overallDiagnosis,
  selectedTitle,
  titleAuditTimestampLabel,
  titleOptionCount,
  regeneratingTitles,
  onRegenerateTitles,
  weakestLayer,
  overallScore,
  qualityLayers,
  strengths,
  issues,
  languageGuardHits,
  rewrittenLead,
  punchlines,
  rhythmAdvice,
  aiNoise,
}: ProsePolishArtifactPanelProps) {
  return (
    <>
      {overallDiagnosis ? (
        <div className="border border-lineStrong/60 bg-surface px-4 py-3 text-sm leading-7 text-inkSoft">
          诊断：{overallDiagnosis}
        </div>
      ) : null}
      <div className="space-y-3 border border-lineStrong/60 bg-surface px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">标题复检</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              润色前后如果判断标题不够稳，可以直接在这里重生成 6 个标题候选，不改大纲和正文。
            </div>
            <div className="mt-2 text-xs leading-6 text-inkMuted">已确认标题：{selectedTitle || "未确认"}</div>
            {titleAuditTimestampLabel ? <div className="mt-1 text-xs leading-6 text-inkMuted">最近体检：{titleAuditTimestampLabel}</div> : null}
          </div>
          <Button
            type="button"
            onClick={onRegenerateTitles}
            disabled={regeneratingTitles}
            variant="secondary"
            size="sm"
            className="text-xs"
          >
            {regeneratingTitles ? "重生成中…" : "重生成 6 标题"}
          </Button>
        </div>
        {titleOptionCount > 0 ? (
          <div className="text-xs leading-6 text-inkMuted">
            当前可选 {titleOptionCount} 个标题候选；标题刷新后，回到大纲阶段可继续切换已确认标题。
          </div>
        ) : null}
      </div>
      <div className="space-y-3 border border-lineStrong/60 bg-surfaceWarm px-4 py-4">
        {weakestLayer ? (
          <div className={`border px-4 py-3 text-sm leading-7 ${
            weakestLayer.status === "blocked"
              ? "border-danger/30 bg-surface text-danger"
              : weakestLayer.status === "needs_attention"
                ? "border-warning/40 bg-surfaceWarning text-warning"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}>
            当前优先修复：{weakestLayer.title}。{weakestLayer.suggestion}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">四层质检</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              当前正文会同时看硬规则、风格一致性、内容质量和活人感，不再只盯 AI 噪声。
            </div>
          </div>
          <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">总分 {overallScore}</div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {qualityLayers.map((layer) => (
            <div key={layer.code} className="border border-lineStrong bg-surface px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium text-ink">{layer.title}</div>
                <div className={`text-xs ${
                  layer.status === "ready" ? "text-emerald-700" : layer.status === "blocked" ? "text-danger" : "text-warning"
                }`}>
                  {formatWritingQualityStatus(layer.status)} · {layer.score}
                </div>
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{layer.summary}</div>
              {layer.issues.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                  {layer.issues.map((item) => (
                    <div key={item}>- {item}</div>
                  ))}
                </div>
              ) : null}
              {layer.suggestions.length > 0 ? (
                <div className="mt-3 border border-lineStrong/60 bg-paperStrong px-3 py-3 text-xs leading-6 text-inkSoft">
                  {layer.suggestions[0]}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {strengths.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">当前优点</div>
          <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
            {strengths.map((item) => (
              <div key={item}>- {item}</div>
            ))}
          </div>
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="space-y-3">
          {issues.map((issue, index) => (
            <div key={`${issue.type || index}`} className="border border-lineStrong/60 bg-surface px-4 py-3">
              <div className="font-medium text-ink">{issue.type || `问题 ${index + 1}`}</div>
              {issue.example ? <div className="mt-2 text-sm leading-7 text-inkSoft">示例：{issue.example}</div> : null}
              <div className="mt-2 text-sm leading-7 text-inkSoft">建议：{issue.suggestion || "暂无"}</div>
            </div>
          ))}
        </div>
      ) : null}
      {languageGuardHits.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">语言守卫与句式命中</div>
          {languageGuardHits.map((hit, index) => (
            <div key={`${hit.ruleId || hit.patternText || index}`} className="border border-danger/30 bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-danger">
                <span className="border border-danger/30 px-2 py-1">{hit.ruleKind === "pattern" ? "句式" : "词语"}</span>
                <span className="border border-danger/30 px-2 py-1">{hit.scope === "system" ? "系统默认" : "自定义"}</span>
                <span className="border border-danger/30 px-2 py-1">命中：{hit.matchedText || hit.patternText || "未命名规则"}</span>
              </div>
              {hit.rewriteHint ? <div className="mt-2 text-sm leading-7 text-danger">改写建议：{hit.rewriteHint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {rewrittenLead ? (
        <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
          首段改写建议：{rewrittenLead}
        </div>
      ) : null}
      {punchlines.length > 0 ? <div className="text-sm leading-7 text-inkSoft">金句候选：{punchlines.join("；")}</div> : null}
      {rhythmAdvice.length > 0 ? <div className="text-sm leading-7 text-inkSoft">节奏建议：{rhythmAdvice.join("；")}</div> : null}
      {aiNoise ? (
        <div className="border border-lineStrong/60 bg-surfaceWarm px-4 py-3 text-sm leading-7 text-inkSoft">
          <div>AI 噪声分数：{aiNoise.score || "0"}</div>
          <div className="mt-1">噪声等级：{aiNoise.level || "unknown"}</div>
          {aiNoise.findings.length > 0 ? <div className="mt-2 text-xs leading-6 text-inkMuted">{aiNoise.findings.join("；")}</div> : null}
          {aiNoise.reasonDetails.length > 0 ? (
            <div className="mt-3 space-y-2">
              {aiNoise.reasonDetails.map((item, index) => (
                <div key={`${item.label || index}`} className="border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                  <div className="font-medium text-ink">
                    {item.label || `原因 ${index + 1}`}
                    {item.count > 0 ? ` · ${item.count}` : ""}
                  </div>
                  <div className="mt-1">{item.reason || "暂无解释"}</div>
                  {item.suggestion ? <div className="mt-1 text-inkMuted">建议：{item.suggestion}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
