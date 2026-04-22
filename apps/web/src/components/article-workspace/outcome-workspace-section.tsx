import { OutcomeWorkspacePanel } from "./outcome-workspace-panel";

type OutcomeWindowCode = "24h" | "72h" | "7d";

const OUTCOME_WINDOWS: Array<{ code: OutcomeWindowCode; label: string }> = [
  { code: "24h", label: "24h" },
  { code: "72h", label: "72h" },
  { code: "7d", label: "7d" },
];

type OutcomeBundleLike = {
  outcome: {
    hitStatus?: "pending" | "hit" | "near_miss" | "miss";
    targetPackage?: string | null;
    reviewSummary?: string | null;
    nextAction?: string | null;
    playbookTags?: string[] | null;
  } | null;
  snapshots: Array<{
    windowCode: OutcomeWindowCode;
    readCount: number;
    shareCount: number;
    likeCount: number;
    updatedAt: string;
    writingStateFeedback?: Record<string, unknown> | null;
  }>;
  completedWindowCodes: string[];
  missingWindowCodes: string[];
};

type SelectedSeriesLike = {
  name: string;
  personaName: string;
} | null;

type OutcomeWorkspaceSectionProps = {
  status: string;
  articleOutcomeBundle: OutcomeBundleLike;
  currentOutcomeSnapshot: {
    writingStateFeedback?: Record<string, unknown> | null;
  } | null;
  articleScorecardSummary: Parameters<typeof OutcomeWorkspacePanel>[0]["articleScorecardSummary"];
  articleOutcomeAttributionSummary: Parameters<typeof OutcomeWorkspacePanel>[0]["articleOutcomeAttributionSummary"];
  latestSyncLog: Parameters<typeof OutcomeWorkspacePanel>[0]["latestSyncLog"];
  selectedOutcomeWindowCode: OutcomeWindowCode;
  onSelectOutcomeWindowCode: (code: OutcomeWindowCode) => void;
  selectedSeries: SelectedSeriesLike;
  loadingSeriesPlaybook: boolean;
  seriesPlaybook: Parameters<typeof OutcomeWorkspacePanel>[0]["seriesPlaybook"];
  outcomeReadCount: string;
  onChangeOutcomeReadCount: (value: string) => void;
  outcomeShareCount: string;
  onChangeOutcomeShareCount: (value: string) => void;
  outcomeLikeCount: string;
  onChangeOutcomeLikeCount: (value: string) => void;
  outcomeNotes: string;
  onChangeOutcomeNotes: (value: string) => void;
  outcomeTargetPackage: string;
  onChangeOutcomeTargetPackage: (value: string) => void;
  outcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
  onChangeOutcomeHitStatus: (value: "pending" | "hit" | "near_miss" | "miss") => void;
  outcomeReviewSummary: string;
  onChangeOutcomeReviewSummary: (value: string) => void;
  outcomeNextAction: string;
  onChangeOutcomeNextAction: (value: string) => void;
  outcomePlaybookTagsInput: string;
  onChangeOutcomePlaybookTagsInput: (value: string) => void;
  savingOutcomeSnapshot: boolean;
  onSaveOutcomeSnapshot: () => void | Promise<unknown>;
};

export function OutcomeWorkspaceSection({
  status,
  articleOutcomeBundle,
  currentOutcomeSnapshot,
  articleScorecardSummary,
  articleOutcomeAttributionSummary,
  latestSyncLog,
  selectedOutcomeWindowCode,
  onSelectOutcomeWindowCode,
  selectedSeries,
  loadingSeriesPlaybook,
  seriesPlaybook,
  outcomeReadCount,
  onChangeOutcomeReadCount,
  outcomeShareCount,
  onChangeOutcomeShareCount,
  outcomeLikeCount,
  onChangeOutcomeLikeCount,
  outcomeNotes,
  onChangeOutcomeNotes,
  outcomeTargetPackage,
  onChangeOutcomeTargetPackage,
  outcomeHitStatus,
  onChangeOutcomeHitStatus,
  outcomeReviewSummary,
  onChangeOutcomeReviewSummary,
  outcomeNextAction,
  onChangeOutcomeNextAction,
  outcomePlaybookTagsInput,
  onChangeOutcomePlaybookTagsInput,
  savingOutcomeSnapshot,
  onSaveOutcomeSnapshot,
}: OutcomeWorkspaceSectionProps) {
  if (status !== "published") {
    return (
      <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
        稿件还没正式发布，结果阶段暂不可录入。发布完成后，这里会接管 24h / 72h / 7d 快照、命中判定和复盘建议。
      </div>
    );
  }

  const currentArticleOutcome = articleOutcomeBundle.outcome;
  const outcomeWindowCards = OUTCOME_WINDOWS.map((windowItem) => ({
    code: windowItem.code,
    label: windowItem.label,
    snapshot: articleOutcomeBundle.snapshots.find((item) => item.windowCode === windowItem.code) ?? null,
  }));

  return (
    <OutcomeWorkspacePanel
      currentHitStatus={currentArticleOutcome?.hitStatus ?? "pending"}
      currentTargetPackage={currentArticleOutcome?.targetPackage || ""}
      completedWindowCodes={articleOutcomeBundle.completedWindowCodes}
      missingWindowCodes={articleOutcomeBundle.missingWindowCodes}
      currentReviewSummary={currentArticleOutcome?.reviewSummary || ""}
      currentNextAction={currentArticleOutcome?.nextAction || ""}
      currentPlaybookTags={currentArticleOutcome?.playbookTags || []}
      writingStateFeedback={(currentOutcomeSnapshot?.writingStateFeedback as Parameters<typeof OutcomeWorkspacePanel>[0]["writingStateFeedback"]) ?? null}
      articleScorecardSummary={articleScorecardSummary}
      articleOutcomeAttributionSummary={articleOutcomeAttributionSummary}
      latestSyncLog={latestSyncLog}
      outcomeWindowCards={outcomeWindowCards}
      selectedOutcomeWindowCode={selectedOutcomeWindowCode}
      onSelectOutcomeWindowCode={onSelectOutcomeWindowCode}
      selectedSeries={selectedSeries}
      loadingSeriesPlaybook={loadingSeriesPlaybook}
      seriesPlaybook={seriesPlaybook}
      outcomeReadCount={outcomeReadCount}
      onChangeOutcomeReadCount={onChangeOutcomeReadCount}
      outcomeShareCount={outcomeShareCount}
      onChangeOutcomeShareCount={onChangeOutcomeShareCount}
      outcomeLikeCount={outcomeLikeCount}
      onChangeOutcomeLikeCount={onChangeOutcomeLikeCount}
      outcomeNotes={outcomeNotes}
      onChangeOutcomeNotes={onChangeOutcomeNotes}
      outcomeTargetPackage={outcomeTargetPackage}
      onChangeOutcomeTargetPackage={onChangeOutcomeTargetPackage}
      outcomeHitStatus={outcomeHitStatus}
      onChangeOutcomeHitStatus={onChangeOutcomeHitStatus}
      outcomeReviewSummary={outcomeReviewSummary}
      onChangeOutcomeReviewSummary={onChangeOutcomeReviewSummary}
      outcomeNextAction={outcomeNextAction}
      onChangeOutcomeNextAction={onChangeOutcomeNextAction}
      outcomePlaybookTagsInput={outcomePlaybookTagsInput}
      onChangeOutcomePlaybookTagsInput={onChangeOutcomePlaybookTagsInput}
      savingOutcomeSnapshot={savingOutcomeSnapshot}
      onSaveOutcomeSnapshot={() => void onSaveOutcomeSnapshot()}
    />
  );
}
