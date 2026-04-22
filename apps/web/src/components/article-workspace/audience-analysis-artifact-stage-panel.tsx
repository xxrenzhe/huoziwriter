import type { ComponentProps } from "react";
import {
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";
import { AudienceAnalysisArtifactPanel } from "./audience-analysis-artifact-panel";

type AudienceAnalysisArtifactPanelProps = ComponentProps<typeof AudienceAnalysisArtifactPanel>;

type AudienceAnalysisArtifactStagePanelProps = {
  payload: Record<string, unknown> | null;
  selection: AudienceAnalysisArtifactPanelProps["selection"];
  onSelectReaderLabel: AudienceAnalysisArtifactPanelProps["onSelectReaderLabel"];
  onSelectLanguageGuidance: AudienceAnalysisArtifactPanelProps["onSelectLanguageGuidance"];
  onSelectBackgroundAwareness: AudienceAnalysisArtifactPanelProps["onSelectBackgroundAwareness"];
  onSelectReadabilityLevel: AudienceAnalysisArtifactPanelProps["onSelectReadabilityLevel"];
  onSelectCallToAction: AudienceAnalysisArtifactPanelProps["onSelectCallToAction"];
  savingSelection: boolean;
  onSaveSelection: () => void;
};

export function AudienceAnalysisArtifactStagePanel({
  payload,
  selection,
  onSelectReaderLabel,
  onSelectLanguageGuidance,
  onSelectBackgroundAwareness,
  onSelectReadabilityLevel,
  onSelectCallToAction,
  savingSelection,
  onSaveSelection,
}: AudienceAnalysisArtifactStagePanelProps) {
  const callToActionOptions = Array.from(
    new Set(
      [
        String(payload?.recommendedCallToAction || "").trim(),
        "结尾给出下一步观察点和判断标准。",
        "结尾提示读者如何把这篇内容转成可执行动作。",
      ].map((item) => String(item || "").trim()).filter(Boolean),
    ),
  ).slice(0, 4);

  return (
    <AudienceAnalysisArtifactPanel
      coreReaderLabel={String(payload?.coreReaderLabel || "").trim()}
      readerSegments={getPayloadRecordArray(payload, "readerSegments").map((segment) => ({
        label: String(segment.label || "").trim(),
        painPoint: String(segment.painPoint || "").trim(),
        motivation: String(segment.motivation || "").trim(),
        preferredTone: String(segment.preferredTone || "").trim(),
      }))}
      languageGuidanceOptions={getPayloadStringArray(payload, "languageGuidance")}
      backgroundAwarenessOptions={getPayloadStringArray(payload, "backgroundAwarenessOptions")}
      readabilityOptions={getPayloadStringArray(payload, "readabilityOptions")}
      callToActionOptions={callToActionOptions}
      selection={selection}
      onSelectReaderLabel={onSelectReaderLabel}
      onSelectLanguageGuidance={onSelectLanguageGuidance}
      onSelectBackgroundAwareness={onSelectBackgroundAwareness}
      onSelectReadabilityLevel={onSelectReadabilityLevel}
      onSelectCallToAction={onSelectCallToAction}
      savingSelection={savingSelection}
      onSaveSelection={onSaveSelection}
      contentWarnings={getPayloadStringArray(payload, "contentWarnings")}
    />
  );
}
