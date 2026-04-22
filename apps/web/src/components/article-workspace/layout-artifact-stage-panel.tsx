import { formatTemplateAssetOwner, formatTemplateConfigSummary, formatTemplateSourceSummary } from "@/lib/article-workspace-formatters";
import { LayoutArtifactPanel } from "./layout-artifact-panel";

type LayoutTemplateItem = {
  version: string;
  name: string;
  description: string | null;
  meta: string | null;
  ownerUserId: number | null;
  sourceUrl: string | null;
  config?: Record<string, unknown>;
};

type LayoutArtifactStagePanelProps = {
  selectedTemplate: LayoutTemplateItem | null;
  applyingLayout: boolean;
  onApplyLayout: () => void;
};

export function LayoutArtifactStagePanel({
  selectedTemplate,
  applyingLayout,
  onApplyLayout,
}: LayoutArtifactStagePanelProps) {
  return (
    <LayoutArtifactPanel
      selectedTemplate={selectedTemplate ? {
        metaLabel: `${selectedTemplate.meta || "模板"} · ${selectedTemplate.version} · ${formatTemplateAssetOwner(selectedTemplate)}`,
        name: selectedTemplate.name,
        description: selectedTemplate.description || "",
        sourceSummary: formatTemplateSourceSummary(selectedTemplate),
        configSummary: formatTemplateConfigSummary(selectedTemplate),
      } : null}
      applyingLayout={applyingLayout}
      onApplyLayout={onApplyLayout}
    />
  );
}
