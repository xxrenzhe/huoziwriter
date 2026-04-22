import type { ComponentProps } from "react";
import {
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";
import { FactCheckArtifactPanel } from "./fact-check-artifact-panel";

type FactCheckArtifactPanelProps = ComponentProps<typeof FactCheckArtifactPanel>;
type FactCheckAction = FactCheckArtifactPanelProps["checks"][number]["currentDecision"]["action"];

type FactCheckSelectionDraft = {
  claimDecisions: Array<{
    claim: string;
    action: FactCheckAction;
    note: string;
  }>;
};

type FactCheckArtifactStagePanelProps = {
  payload: Record<string, unknown> | null;
  factCheckChecks: Record<string, unknown>[];
  factCheckSelectionDraft: FactCheckSelectionDraft;
  getFactCheckDecision: (
    draft: FactCheckSelectionDraft,
    claim: string,
    status: string,
  ) => FactCheckArtifactPanelProps["checks"][number]["currentDecision"];
  getFactCheckActionOptions: (status: string) => FactCheckArtifactPanelProps["checks"][number]["actionOptions"];
  factCheckResolvedCount: number;
  evidenceUrl: string;
  onChangeEvidenceUrl: (value: string) => void;
  addingEvidence: boolean;
  onAddEvidenceSource: (urlOverride?: string) => void;
  evidenceIssue: FactCheckArtifactPanelProps["evidenceIssue"];
  onClearEvidenceIssue: () => void;
  recentEvidenceIssues: FactCheckArtifactPanelProps["recentEvidenceIssues"];
  retryableIssueCount: number;
  recoveredIssueCount: number;
  onDismissEvidenceIssue: (issueId: string) => void;
  onUpdateCheckDecision: FactCheckArtifactPanelProps["onUpdateCheckDecision"];
  onOpenKnowledgeCard: (knowledgeCardId: number) => void;
  savingSelection: boolean;
  onSaveSelection: () => void;
};

export function FactCheckArtifactStagePanel({
  payload,
  factCheckChecks,
  factCheckSelectionDraft,
  getFactCheckDecision,
  getFactCheckActionOptions,
  factCheckResolvedCount,
  evidenceUrl,
  onChangeEvidenceUrl,
  addingEvidence,
  onAddEvidenceSource,
  evidenceIssue,
  onClearEvidenceIssue,
  recentEvidenceIssues,
  retryableIssueCount,
  recoveredIssueCount,
  onDismissEvidenceIssue,
  onUpdateCheckDecision,
  onOpenKnowledgeCard,
  savingSelection,
  onSaveSelection,
}: FactCheckArtifactStagePanelProps) {
  const researchReview = getPayloadRecord(payload, "researchReview");
  const reviewGaps = getPayloadStringArray(researchReview, "gaps");
  const evidenceCards = getPayloadRecordArray(payload, "evidenceCards");
  const checks: FactCheckArtifactPanelProps["checks"] = factCheckChecks.map((check) => {
    const claim = String(check.claim || "").trim();
    const status = String(check.status || "needs_source").trim();
    const currentDecision = getFactCheckDecision(factCheckSelectionDraft, claim, status);
    const evidenceCard = evidenceCards.find((item) => String(item.claim || "").trim() === claim) ?? null;
    return {
      claim,
      status,
      suggestion: String(check.suggestion || "").trim(),
      currentDecision,
      actionOptions: getFactCheckActionOptions(status),
      evidenceCard: evidenceCard
        ? {
            supportLevel: String(evidenceCard.supportLevel || "").trim(),
            supportingEvidence: getPayloadRecordArray(evidenceCard, "supportingEvidence").map((item) => ({
              title: String(item.title || "").trim(),
              sourceType: String(item.sourceType || "").trim(),
              evidenceRole: String(item.evidenceRole || "").trim(),
              researchTag: String(item.researchTag || "").trim(),
              confidenceLabel: String(item.confidenceLabel || "").trim(),
              excerpt: String(item.excerpt || "").trim(),
              rationale: String(item.rationale || "").trim(),
              fragmentId: Number(item.fragmentId || 0),
              knowledgeTitle: String(item.knowledgeTitle || "").trim(),
              knowledgeCardId: Number(item.knowledgeCardId || 0),
              sourceUrl: String(item.sourceUrl || "").trim(),
            })),
            counterEvidence: getPayloadRecordArray(evidenceCard, "counterEvidence").map((item) => ({
              title: String(item.title || "").trim(),
              sourceType: String(item.sourceType || "").trim(),
              evidenceRole: String(item.evidenceRole || "").trim(),
              researchTag: String(item.researchTag || "").trim(),
              confidenceLabel: String(item.confidenceLabel || "").trim(),
              excerpt: String(item.excerpt || "").trim(),
              rationale: String(item.rationale || "").trim(),
              fragmentId: Number(item.fragmentId || 0),
              knowledgeTitle: String(item.knowledgeTitle || "").trim(),
              knowledgeCardId: Number(item.knowledgeCardId || 0),
              sourceUrl: String(item.sourceUrl || "").trim(),
            })),
          }
        : null,
    };
  });

  return (
    <FactCheckArtifactPanel
      overallRisk={String(payload?.overallRisk || "").trim()}
      hasResearchReviewSummary={Boolean(String(researchReview?.summary || "").trim())}
      hasTopicAlignment={Boolean(String(payload?.topicAlignment || "").trim())}
      resolvedCount={factCheckResolvedCount}
      totalCount={factCheckChecks.length || 0}
      researchReview={researchReview ? {
        summary: String(researchReview.summary || "").trim(),
        sourceCoverage: String(researchReview.sourceCoverage || "").trim(),
        timelineSupport: String(researchReview.timelineSupport || "").trim(),
        comparisonSupport: String(researchReview.comparisonSupport || "").trim(),
        intersectionSupport: String(researchReview.intersectionSupport || "").trim(),
        strongestAnchor: String(researchReview.strongestAnchor || "").trim(),
        gaps: reviewGaps,
        isWarning: reviewGaps.length > 0 || String(researchReview.sourceCoverage || "").trim() === "blocked",
      } : null}
      evidenceUrl={evidenceUrl}
      onChangeEvidenceUrl={onChangeEvidenceUrl}
      addingEvidence={addingEvidence}
      onAddEvidenceSource={onAddEvidenceSource}
      evidenceIssue={evidenceIssue}
      onClearEvidenceIssue={onClearEvidenceIssue}
      recentEvidenceIssues={recentEvidenceIssues}
      retryableIssueCount={retryableIssueCount}
      recoveredIssueCount={recoveredIssueCount}
      onDismissEvidenceIssue={onDismissEvidenceIssue}
      checks={checks}
      onUpdateCheckDecision={onUpdateCheckDecision}
      onOpenKnowledgeCard={onOpenKnowledgeCard}
      selectionPreview={factCheckSelectionDraft.claimDecisions.slice(0, 6)}
      savingSelection={savingSelection}
      onSaveSelection={onSaveSelection}
      personaAlignment={String(payload?.personaAlignment || "").trim()}
      topicAlignment={String(payload?.topicAlignment || "").trim()}
    />
  );
}
