import type { ComponentProps } from "react";
import { formatTitleAuditTimestamp } from "@/lib/article-workspace-formatters";
import {
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";
import { ProsePolishArtifactPanel } from "./prose-polish-artifact-panel";

type ProsePolishArtifactPanelProps = ComponentProps<typeof ProsePolishArtifactPanel>;

type ProsePolishArtifactStagePanelProps = {
  payload: Record<string, unknown> | null;
  selectedTitle: string;
  outlinePayload: Record<string, unknown> | null;
  titleOptionCount: number;
  regeneratingTitles: boolean;
  onRegenerateTitles: () => void;
  weakestLayer: ProsePolishArtifactPanelProps["weakestLayer"];
  editorQualityPanel: {
    overallScore: number;
    layers: ProsePolishArtifactPanelProps["qualityLayers"];
  };
};

export function ProsePolishArtifactStagePanel({
  payload,
  selectedTitle,
  outlinePayload,
  titleOptionCount,
  regeneratingTitles,
  onRegenerateTitles,
  weakestLayer,
  editorQualityPanel,
}: ProsePolishArtifactStagePanelProps) {
  const aiNoise = getPayloadRecord(payload, "aiNoise");

  return (
    <ProsePolishArtifactPanel
      overallDiagnosis={String(payload?.overallDiagnosis || "").trim()}
      selectedTitle={selectedTitle}
      titleAuditTimestampLabel={formatTitleAuditTimestamp(String(outlinePayload?.titleAuditedAt || "")) || ""}
      titleOptionCount={titleOptionCount}
      regeneratingTitles={regeneratingTitles}
      onRegenerateTitles={onRegenerateTitles}
      weakestLayer={weakestLayer}
      overallScore={editorQualityPanel.overallScore}
      qualityLayers={editorQualityPanel.layers}
      strengths={getPayloadStringArray(payload, "strengths")}
      issues={getPayloadRecordArray(payload, "issues").map((issue) => ({
        type: String(issue.type || "").trim(),
        example: String(issue.example || "").trim(),
        suggestion: String(issue.suggestion || "").trim(),
      }))}
      languageGuardHits={getPayloadRecordArray(payload, "languageGuardHits").map((hit) => ({
        ruleId: String(hit.ruleId || "").trim(),
        patternText: String(hit.patternText || "").trim(),
        ruleKind: String(hit.ruleKind || "").trim(),
        scope: String(hit.scope || "").trim(),
        matchedText: String(hit.matchedText || "").trim(),
        rewriteHint: String(hit.rewriteHint || "").trim(),
      }))}
      rewrittenLead={String(payload?.rewrittenLead || "").trim()}
      punchlines={getPayloadStringArray(payload, "punchlines")}
      rhythmAdvice={getPayloadStringArray(payload, "rhythmAdvice")}
      aiNoise={aiNoise ? {
        score: String(aiNoise.score || "0"),
        level: String(aiNoise.level || "unknown"),
        findings: (Array.isArray(aiNoise.findings) ? aiNoise.findings : []).map((item) => String(item || "").trim()).filter(Boolean),
        reasonDetails: (Array.isArray(aiNoise.reasonDetails) ? aiNoise.reasonDetails : [])
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
          .map((item) => ({
            label: String(item.label || "").trim(),
            count: Number(item.count || 0),
            reason: String(item.reason || "").trim(),
            suggestion: String(item.suggestion || "").trim(),
          })),
      } : null}
    />
  );
}
