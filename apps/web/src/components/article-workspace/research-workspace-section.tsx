import type { ArticleMainStepCode } from "@/lib/article-workflow-registry";
import {
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";
import { GENERATABLE_STAGE_ACTIONS } from "./authoring-phase";
import { ResearchWorkspacePanel } from "./research-workspace-panel";

type ResearchArtifactLike = {
  updatedAt?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
} | null;

type ResearchWorkspaceSectionProps = {
  researchArtifact: ResearchArtifactLike;
  currentArticleMainStepCode: ArticleMainStepCode;
  strategyTargetReader: string;
  strategyCoreAssertion: string;
  strategyWhyNow: string;
  strategyResearchHypothesis: string;
  strategyMarketPositionInsight: string;
  strategyHistoricalTurningPoint: string;
  generatingStageArtifactCode: string | null;
  updatingWorkflowCode: string | null;
  applyingStageArtifactCode: string | null;
  savingStrategyCard: boolean;
  savingEvidenceItems: boolean;
  suggestedEvidenceItemsCount: number;
  onGenerateResearchBrief: () => void | Promise<unknown>;
  onApplyStrategyWriteback: () => void | Promise<unknown>;
  onApplySuggestedEvidence: () => void | Promise<unknown>;
};

export function ResearchWorkspaceSection({
  researchArtifact,
  currentArticleMainStepCode,
  strategyTargetReader,
  strategyCoreAssertion,
  strategyWhyNow,
  strategyResearchHypothesis,
  strategyMarketPositionInsight,
  strategyHistoricalTurningPoint,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  applyingStageArtifactCode,
  savingStrategyCard,
  savingEvidenceItems,
  suggestedEvidenceItemsCount,
  onGenerateResearchBrief,
  onApplyStrategyWriteback,
  onApplySuggestedEvidence,
}: ResearchWorkspaceSectionProps) {
  const researchAction = GENERATABLE_STAGE_ACTIONS.researchBrief;
  const researchSourceCoverage = getPayloadRecord(researchArtifact?.payload, "sourceCoverage");
  const researchStrategyWriteback = getPayloadRecord(researchArtifact?.payload, "strategyWriteback");
  const researchTimelineCards = getPayloadRecordArray(researchArtifact?.payload, "timelineCards");
  const researchComparisonCards = getPayloadRecordArray(researchArtifact?.payload, "comparisonCards");
  const researchIntersectionInsights = getPayloadRecordArray(researchArtifact?.payload, "intersectionInsights");
  const researchMustCoverAngles = getPayloadStringArray(researchArtifact?.payload, "mustCoverAngles");
  const researchHypothesesToVerify = getPayloadStringArray(researchArtifact?.payload, "hypothesesToVerify");
  const researchForbiddenConclusions = getPayloadStringArray(researchArtifact?.payload, "forbiddenConclusions");
  const researchCoverageSufficiency = String(researchSourceCoverage?.sufficiency || "").trim();
  const researchCoverageTone = researchCoverageSufficiency === "ready"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : researchCoverageSufficiency === "limited"
      ? "border-warning/40 bg-surfaceWarning text-warning"
      : "border-danger/30 bg-surface text-danger";
  const researchCoverageItems = [
    { key: "official", label: "官方源" },
    { key: "industry", label: "行业源" },
    { key: "comparison", label: "同类源" },
    { key: "userVoice", label: "用户源" },
    { key: "timeline", label: "时间源" },
  ].map((item) => ({
    ...item,
    signals: getPayloadStringArray(researchSourceCoverage, item.key),
  }));
  const researchCoverageMissing = getPayloadStringArray(researchSourceCoverage, "missingCategories");
  const strategyWritebackFields = [
    {
      key: "targetReader",
      label: "目标读者",
      value: String(researchStrategyWriteback?.targetReader || "").trim(),
      currentValue: strategyTargetReader.trim(),
    },
    {
      key: "coreAssertion",
      label: "主判断",
      value: String(researchStrategyWriteback?.coreAssertion || "").trim(),
      currentValue: strategyCoreAssertion.trim(),
    },
    {
      key: "whyNow",
      label: "Why Now",
      value: String(researchStrategyWriteback?.whyNow || "").trim(),
      currentValue: strategyWhyNow.trim(),
    },
    {
      key: "researchHypothesis",
      label: "研究假设",
      value: String(researchStrategyWriteback?.researchHypothesis || "").trim(),
      currentValue: strategyResearchHypothesis.trim(),
    },
    {
      key: "marketPositionInsight",
      label: "位置洞察",
      value: String(researchStrategyWriteback?.marketPositionInsight || "").trim(),
      currentValue: strategyMarketPositionInsight.trim(),
    },
    {
      key: "historicalTurningPoint",
      label: "历史转折点",
      value: String(researchStrategyWriteback?.historicalTurningPoint || "").trim(),
      currentValue: strategyHistoricalTurningPoint.trim(),
    },
  ].filter((item) => item.value);

  return (
    <ResearchWorkspacePanel
      researchArtifact={researchArtifact}
      researchActionLabel={researchAction.label}
      generatingResearchBrief={generatingStageArtifactCode === "researchBrief"}
      disableGenerateResearchBrief={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
      onGenerateResearchBrief={() => void onGenerateResearchBrief()}
      researchCoverageTone={researchCoverageTone}
      researchCoverageSufficiency={researchCoverageSufficiency}
      researchSourceCoverageNote={String(researchSourceCoverage?.note || "").trim()}
      researchCoverageItems={researchCoverageItems}
      researchCoverageMissing={researchCoverageMissing}
      researchMustCoverAngles={researchMustCoverAngles}
      researchHypothesesToVerify={researchHypothesesToVerify}
      researchForbiddenConclusions={researchForbiddenConclusions}
      researchTimelineCards={researchTimelineCards}
      researchComparisonCards={researchComparisonCards}
      researchIntersectionInsights={researchIntersectionInsights}
      currentArticleMainStepCode={currentArticleMainStepCode}
      strategyWritebackFields={strategyWritebackFields}
      savingStrategyCard={savingStrategyCard}
      onApplyStrategyWriteback={() => void onApplyStrategyWriteback()}
      suggestedEvidenceItemsCount={suggestedEvidenceItemsCount}
      savingEvidenceItems={savingEvidenceItems}
      onApplySuggestedEvidence={() => void onApplySuggestedEvidence()}
    />
  );
}
