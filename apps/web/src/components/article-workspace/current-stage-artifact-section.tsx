import type { ReactNode } from "react";
import { Button } from "@huoziwriter/ui";
import type { WorkspaceView } from "./types";
import { ArtifactStageShell } from "./artifact-stage-shell";
import { AuthoringBlankSlate } from "./authoring-phase";

type CurrentStageLike = {
  code: string;
  title: string;
} | null;

type CurrentStageActionLike = {
  label: string;
  helper: string;
} | null;

type CurrentStageArtifactLike = {
  title: string;
  updatedAt: string | null;
  provider: string | null;
  model: string | null;
  summary: string | null;
  errorMessage: string | null;
} | null;

type WorkspaceBlankSlateLike = {
  eyebrow: string;
  title: string;
  detail: string;
  prompts?: string[];
};

type CurrentStageArtifactSectionProps = {
  isResultStep: boolean;
  currentStage: CurrentStageLike;
  currentStageAction: CurrentStageActionLike;
  currentStageArtifact: CurrentStageArtifactLike;
  workspaceBlankSlate: WorkspaceBlankSlateLike;
  currentAuthoringDefaultView: WorkspaceView;
  formatWorkspaceViewLabel: (view: WorkspaceView) => string;
  onReturnToDefaultView: () => void;
  generatingStageArtifactCode: string | null;
  updatingWorkflowCode: string | null;
  applyingStageArtifactCode: string | null;
  onGenerateCurrentStageArtifact: () => void;
  onApplyCurrentStageArtifact: () => void;
  currentStageApplyButtonLabel: string;
  showOutlineSyncAction: boolean;
  syncingOutlineArtifact: boolean;
  onSyncOutlineArtifactToNodes: () => void;
  deepWritingContent?: ReactNode;
  layoutContent?: ReactNode;
  stageArtifactChildren?: ReactNode;
};

export function CurrentStageArtifactSection({
  isResultStep,
  currentStage,
  currentStageAction,
  currentStageArtifact,
  workspaceBlankSlate,
  currentAuthoringDefaultView,
  formatWorkspaceViewLabel,
  onReturnToDefaultView,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  applyingStageArtifactCode,
  onGenerateCurrentStageArtifact,
  onApplyCurrentStageArtifact,
  currentStageApplyButtonLabel,
  showOutlineSyncAction,
  syncingOutlineArtifact,
  onSyncOutlineArtifactToNodes,
  deepWritingContent,
  layoutContent,
  stageArtifactChildren,
}: CurrentStageArtifactSectionProps) {
  if (isResultStep) {
    return (
      <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
        结果阶段不再生成结构化阶段产物。这里的重点已经切到真实回流、命中判定和下一篇可复用的打法。
      </div>
    );
  }

  if (!currentStage) {
    return (
      <AuthoringBlankSlate
        eyebrow={workspaceBlankSlate.eyebrow}
        title="先把当前链路走到一个明确步骤"
        detail="阶段工作台会跟着六步链路展示对应产物。只要当前步骤尚未落定，这里就不该强行塞一张空卡片。"
        prompts={["先在右侧链路里确认当前步骤", "研究与写作会映射到不同工作台", "步骤明确后，这里会自动切到对应结构化产物"]}
      />
    );
  }

  if (currentStage.code === "deepWriting") {
    return deepWritingContent;
  }

  if (currentStage.code === "layout") {
    return layoutContent;
  }

  if (!currentStageAction) {
    return (
      <div className="mt-4 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
        当前步骤暂时没有可生成的结构化洞察卡。你仍可通过右侧其他模块继续配图、排版和发布。
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
        <div className="font-medium text-ink">{currentStageAction.label}</div>
        <div className="mt-2">{currentStageAction.helper}</div>
      </div>
      <Button
        onClick={onGenerateCurrentStageArtifact}
        disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
        variant="primary"
      >
        {generatingStageArtifactCode === currentStage.code ? "生成中…" : currentStageArtifact ? "刷新阶段产物" : currentStageAction.label}
      </Button>
      {currentStageArtifact ? (
        <ArtifactStageShell
          title={currentStageArtifact.title}
          updatedAtLabel={currentStageArtifact.updatedAt ? `更新于 ${new Date(currentStageArtifact.updatedAt).toLocaleString("zh-CN")}` : "暂无更新时间"}
          providerLabel={`${currentStageArtifact.provider || "local"}${currentStageArtifact.model ? ` / ${currentStageArtifact.model}` : ""}`}
          summary={currentStageArtifact.summary || ""}
          primaryActionLabel={applyingStageArtifactCode === currentStage.code ? "应用中…" : currentStageApplyButtonLabel}
          primaryActionDisabled={Boolean(applyingStageArtifactCode) || Boolean(generatingStageArtifactCode)}
          onPrimaryAction={onApplyCurrentStageArtifact}
          extraActions={showOutlineSyncAction ? (
            <Button
              type="button"
              onClick={onSyncOutlineArtifactToNodes}
              disabled={syncingOutlineArtifact || Boolean(generatingStageArtifactCode) || Boolean(applyingStageArtifactCode)}
              variant="secondary"
            >
              {syncingOutlineArtifact ? "同步中…" : "同步到大纲树"}
            </Button>
          ) : null}
          errorMessage={currentStageArtifact.errorMessage || ""}
        >
          {stageArtifactChildren}
        </ArtifactStageShell>
      ) : (
        <AuthoringBlankSlate
          eyebrow={workspaceBlankSlate.eyebrow}
          title={workspaceBlankSlate.title}
          detail={currentStageAction.helper || workspaceBlankSlate.detail}
          prompts={workspaceBlankSlate.prompts}
        >
          <Button
            type="button"
            onClick={onGenerateCurrentStageArtifact}
            disabled={Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode)}
            variant="primary"
          >
            {generatingStageArtifactCode === currentStage.code ? `${currentStageAction.label}中…` : currentStageAction.label}
          </Button>
          <Button type="button" onClick={onReturnToDefaultView} variant="secondary">
            先回到{formatWorkspaceViewLabel(currentAuthoringDefaultView)}
          </Button>
        </AuthoringBlankSlate>
      )}
    </div>
  );
}
