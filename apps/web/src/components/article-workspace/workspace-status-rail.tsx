import { Button, Input } from "@huoziwriter/ui";
import {
  formatArticleMainStepStatus,
  formatResearchStepSummaryStatus,
  formatStageChecklistStatus,
  type ArticleMainStepStatus,
  type PublishStageStatus,
} from "@/lib/article-workspace-formatters";
import type { WorkspaceResearchStepSummary, WorkspaceShellMainStep } from "./types";

type SnapshotLike = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type PlanCapabilityHint = {
  key: string;
  title: string;
  detail: string;
};

type EditorStageChecklistItem = {
  stepCode: string;
  title: string;
  detail: string;
  status: PublishStageStatus;
};

type WorkspaceStatusRailProps = {
  showCompactSixStepRail: boolean;
  currentArticleMainStepTitle: string;
  currentArticleMainStepDetail: string;
  articleMainSteps: WorkspaceShellMainStep[];
  updatingWorkflow: boolean;
  canOpenResultStep: boolean;
  onSelectMainStep: (stepCode: string) => void;
  showSnapshotManager: boolean;
  snapshotNote: string;
  onChangeSnapshotNote: (value: string) => void;
  onCreateSnapshot: () => void | Promise<void>;
  snapshots: SnapshotLike[];
  loadingDiffId: number | null;
  onLoadDiff: (snapshotId: number) => void | Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => void | Promise<void>;
  showResearchChecklistRail: boolean;
  researchStepSummary: WorkspaceResearchStepSummary;
  editorStageChecklist: EditorStageChecklistItem[];
  planCapabilityHints: PlanCapabilityHint[];
  currentStageTitle: string | null;
  stageArtifactsCount: number;
  articleStatusLabel: string;
};

function getMainStepButtonClass(statusLabel: WorkspaceShellMainStep["statusLabel"]) {
  if (statusLabel === "current") {
    return "border-cinnabar bg-surface text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar";
  }
  if (statusLabel === "completed") {
    return "border-lineStrong bg-surface text-inkSoft";
  }
  if (statusLabel === "needs_attention") {
    return "border-warning/40 bg-surfaceWarning text-warning hover:border-warning/40 hover:bg-surfaceWarning hover:text-warning";
  }
  return "border-lineStrong/50 bg-surface/70 text-inkMuted hover:border-lineStrong/50 hover:bg-surface/70 hover:text-inkMuted";
}

export function WorkspaceStatusRail({
  showCompactSixStepRail,
  currentArticleMainStepTitle,
  currentArticleMainStepDetail,
  articleMainSteps,
  updatingWorkflow,
  canOpenResultStep,
  onSelectMainStep,
  showSnapshotManager,
  snapshotNote,
  onChangeSnapshotNote,
  onCreateSnapshot,
  snapshots,
  loadingDiffId,
  onLoadDiff,
  onRestoreSnapshot,
  showResearchChecklistRail,
  researchStepSummary,
  editorStageChecklist,
  planCapabilityHints,
  currentStageTitle,
  stageArtifactsCount,
  articleStatusLabel,
}: WorkspaceStatusRailProps) {
  return (
    <>
      {showCompactSixStepRail ? (
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">当前链路</div>
          <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
            <div className="font-serifCn text-2xl text-ink">{currentArticleMainStepTitle}</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">{currentArticleMainStepDetail}</div>
          </div>
          <div className="mt-3 grid gap-2">
            {articleMainSteps.map((step) => (
              <Button
                key={step.code}
                type="button"
                onClick={() => onSelectMainStep(step.code)}
                disabled={updatingWorkflow || Boolean(step.disabled) || (step.code === "result" && !canOpenResultStep)}
                variant="secondary"
                size="sm"
                fullWidth
                title={step.disabledReason ?? undefined}
                iconRight={<span className="text-xs">{formatArticleMainStepStatus(step.statusLabel as ArticleMainStepStatus)}</span>}
                className={`justify-between px-3 py-3 text-left text-sm ${getMainStepButtonClass(step.statusLabel)}`}
              >
                {step.title}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {showSnapshotManager ? (
        <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">快照管理</div>
          <div className="mt-3 flex gap-2">
            <Input
              aria-label="快照备注"
              value={snapshotNote}
              onChange={(event) => onChangeSnapshotNote(event.target.value)}
              placeholder="快照备注"
              className="min-w-0 flex-1"
            />
            <Button onClick={() => void onCreateSnapshot()} variant="primary" size="sm">
              存档
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {snapshots.slice(0, 4).map((snapshot) => (
              <div key={snapshot.id} className="border border-lineStrong bg-surface p-3">
                <div className="text-sm text-ink">{snapshot.snapshotNote || "未命名快照"}</div>
                <div className="mt-1 text-xs text-inkMuted">{new Date(snapshot.createdAt).toLocaleString("zh-CN")}</div>
                <div className="mt-3 flex gap-2 text-xs">
                  <Button onClick={() => void onLoadDiff(snapshot.id)} variant="secondary" size="sm">
                    {loadingDiffId === snapshot.id ? "对比中…" : "差异"}
                  </Button>
                  <Button onClick={() => void onRestoreSnapshot(snapshot.id)} variant="secondary" size="sm">
                    回滚
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showResearchChecklistRail ? (
        <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">六步完成定义</div>
          <div className={`mt-3 border px-4 py-4 ${
            researchStepSummary.status === "ready"
              ? "border-emerald-200 bg-emerald-50"
              : researchStepSummary.status === "blocked"
                ? "border-danger/30 bg-surface"
                : "border-warning/40 bg-surfaceWarning"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究底座</div>
              <div className={`text-xs ${
                researchStepSummary.status === "ready"
                  ? "text-emerald-700"
                  : researchStepSummary.status === "blocked"
                    ? "text-danger"
                    : "text-warning"
              }`}>
                {formatResearchStepSummaryStatus(researchStepSummary.status)}
              </div>
            </div>
            <div className={`mt-2 text-sm leading-7 ${
              researchStepSummary.status === "blocked"
                ? "text-danger"
                : researchStepSummary.status === "needs_attention"
                  ? "text-warning"
                  : "text-inkSoft"
            }`}>
              {researchStepSummary.detail}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {editorStageChecklist.map((stage) => (
              <div key={stage.stepCode} className="border border-lineStrong bg-surface px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">{stage.title}</div>
                    <div className="mt-1 text-sm leading-6 text-inkSoft">{stage.detail}</div>
                  </div>
                  <div className={`text-xs ${
                    stage.status === "ready" ? "text-emerald-700" : stage.status === "blocked" ? "text-danger" : "text-warning"
                  }`}>
                    {formatStageChecklistStatus(stage.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {planCapabilityHints.length > 0 ? (
        <div className="border border-lineStrong/40 bg-surfaceWarm p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">权限前置提示</div>
          <div className="mt-3 space-y-2">
            {planCapabilityHints.map((hint) => (
              <div key={hint.key} className="border border-lineStrong bg-surface px-4 py-3 text-sm leading-7 text-inkSoft">
                <div className="font-medium text-ink">{hint.title}</div>
                <div className="mt-1">{hint.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">阶段洞察卡</div>
            <div className="mt-2 text-sm leading-7 text-inkMuted">
              {currentStageTitle
                ? `当前步骤：${currentArticleMainStepTitle} · 执行阶段：${currentStageTitle}`
                : "根据当前步骤显示对应的结构化产物。"}
            </div>
          </div>
          <span className="border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted">{stageArtifactsCount} 条</span>
        </div>
        <div className="mt-4 text-sm leading-7 text-inkMuted">请在中间主工作区的“阶段工作台”标签页中查看。</div>
      </div>

      <div className="hidden border border-lineStrong/40 bg-surfaceWarm p-5 md:block">
        <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">稿件状态</div>
        <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{articleStatusLabel}</div>
      </div>
    </>
  );
}
