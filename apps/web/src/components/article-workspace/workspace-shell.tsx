import { Button } from "@huoziwriter/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatArticleMainStepStatus, formatResearchStepSummaryStatus } from "@/lib/article-workspace-formatters";
import type {
  WorkspaceCurrentTask,
  WorkspaceResearchCoverageRibbon,
  WorkspaceResearchStepSummary,
  WorkspaceShellAuthoringPhase,
  WorkspaceShellMainStep,
  WorkspaceStepPanels,
  WorkspaceView,
} from "./types";

const STEP_COMPONENTS = {
  opportunity: dynamic(() => import("./steps/step-opportunity")),
  strategy: dynamic(() => import("./steps/step-strategy")),
  evidence: dynamic(() => import("./steps/step-evidence")),
  draft: dynamic(() => import("./steps/step-draft")),
  publish: dynamic(() => import("./steps/step-publish")),
  result: dynamic(() => import("./steps/step-result")),
} as const;

type WorkspaceShellProps = {
  currentArticleLabel: string;
  currentArticleMainStep: {
    code: keyof typeof STEP_COMPONENTS;
    title: string;
    supportLabel: string;
  };
  currentArticleMainStepDetail: string;
  saveState: string;
  topbarActions?: ReactNode;
  theme: string;
  isFocusMode: boolean;
  onToggleTheme: () => void;
  onToggleFocusMode: () => void;
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
  researchStepSummary: WorkspaceResearchStepSummary;
  researchCoverageRibbon: WorkspaceResearchCoverageRibbon;
  currentArticleTask: WorkspaceCurrentTask;
  onGoToResearchStep: () => void;
  isUpdatingWorkflow: boolean;
  hideMainStepRail: boolean;
  articleMainSteps: WorkspaceShellMainStep[];
  onSelectMainStep: (step: WorkspaceShellMainStep) => void;
  canOpenResultStep: boolean;
  resultLeadPanel?: ReactNode;
  authoringPhases: WorkspaceShellAuthoringPhase[];
  currentAuthoringPhaseTitle: string;
  currentAuthoringPhaseHint: string;
  onSelectAuthoringPhase: (phase: WorkspaceShellAuthoringPhase) => void;
  controlsBar: ReactNode;
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  formatWorkspaceViewLabel: (view: WorkspaceView) => string;
  selectedSeriesNotice: ReactNode;
  workspaceStepPanels: WorkspaceStepPanels;
  editView: ReactNode;
  previewView: ReactNode;
  auditView: ReactNode;
  message?: ReactNode;
};

export function WorkspaceShell({
  currentArticleLabel,
  currentArticleMainStep,
  currentArticleMainStepDetail,
  saveState,
  topbarActions,
  theme,
  isFocusMode,
  onToggleTheme,
  onToggleFocusMode,
  generateBlockedByResearch,
  generateBlockedMessage,
  researchStepSummary,
  researchCoverageRibbon,
  currentArticleTask,
  onGoToResearchStep,
  isUpdatingWorkflow,
  hideMainStepRail,
  articleMainSteps,
  onSelectMainStep,
  canOpenResultStep,
  resultLeadPanel,
  authoringPhases,
  currentAuthoringPhaseTitle,
  currentAuthoringPhaseHint,
  onSelectAuthoringPhase,
  controlsBar,
  view,
  onViewChange,
  formatWorkspaceViewLabel,
  selectedSeriesNotice,
  workspaceStepPanels,
  editView,
  previewView,
  auditView,
  message,
}: WorkspaceShellProps) {
  const StepComponent = STEP_COMPONENTS[currentArticleMainStep.code];
  const currentTaskStep =
    currentArticleTask.targetStepCode
      ? articleMainSteps.find((step) => step.code === currentArticleTask.targetStepCode) ?? null
      : null;
  const currentTaskToneClass =
    currentArticleTask.tone === "danger"
      ? {
          container: "border-danger/30 bg-surface",
          badge: "border-danger/20 bg-surface text-danger",
          detail: "text-danger",
        }
      : currentArticleTask.tone === "ready"
        ? {
            container: "border-emerald-200 bg-emerald-50",
            badge: "border-emerald-200 bg-surface text-emerald-700",
            detail: "text-inkSoft",
          }
        : {
            container: "border-warning/40 bg-surfaceWarning",
            badge: "border-warning/30 bg-surface text-warning",
            detail: "text-warning",
          };

  return (
    <section className="min-w-0 border border-lineStrong/40 bg-surface p-6 shadow-ink">
        <div
          data-command-chrome="true"
          className="sticky top-0 z-10 mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-line bg-surface/95 pb-5 backdrop-blur-sm"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-inkMuted">
              <Link href="/articles" className="transition-colors hover:text-ink">
                稿件
              </Link>
              <span>/</span>
              <span className="max-w-[32rem] truncate normal-case tracking-normal text-inkSoft">
                《{currentArticleLabel}》
              </span>
              <span>/</span>
              <span className="text-cinnabar">{currentArticleMainStep.title}</span>
            </div>
            <div className="mt-3 font-serifCn text-2xl text-ink text-balance md:text-3xl">《{currentArticleLabel}》</div>
            <div className="mt-2 max-w-3xl text-sm leading-7 text-inkMuted">
              {currentArticleMainStepDetail}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {topbarActions}
            <span className="border border-lineStrong/70 bg-paperStrong px-3 py-2 text-inkMuted">{saveState}</span>
            <Button type="button" onClick={onToggleTheme} variant="secondary" size="sm" className="text-xs">
              {theme === "night" ? "切回日间" : "切到夜读"}
            </Button>
            <Button
              type="button"
              onClick={onToggleFocusMode}
              variant={isFocusMode ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              {isFocusMode ? "退出沉浸" : "沉浸模式"}
            </Button>
          </div>
        </div>

        <div
          className={`mt-4 border px-4 py-4 ${
            generateBlockedByResearch
              ? "border-danger/30 bg-surface"
              : researchStepSummary.status === "ready"
                ? "border-emerald-200 bg-emerald-50"
                : "border-warning/40 bg-surfaceWarning"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">研究覆盖</div>
                <div
                  className={`text-xs ${
                    generateBlockedByResearch
                      ? "text-danger"
                      : researchStepSummary.status === "ready"
                        ? "text-emerald-700"
                        : "text-warning"
                  }`}
                >
                  {researchCoverageRibbon.coveredCount}/{researchCoverageRibbon.totalCount} 维已覆盖
                </div>
                <div className="border border-current/15 bg-surface/70 px-2 py-1 text-xs text-inkSoft">
                  {researchCoverageRibbon.sufficiencyLabel}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="font-medium text-ink">{researchStepSummary.title}</div>
                <div
                  className={`text-xs ${
                    generateBlockedByResearch
                      ? "text-danger"
                      : researchStepSummary.status === "ready"
                        ? "text-emerald-700"
                        : "text-warning"
                  }`}
                >
                  {formatResearchStepSummaryStatus(researchStepSummary.status)}
                </div>
              </div>
              <div
                className={`mt-2 text-sm leading-7 ${
                  generateBlockedByResearch
                    ? "text-danger"
                    : researchStepSummary.status === "ready"
                      ? "text-inkSoft"
                      : "text-warning"
                }`}
              >
                {generateBlockedByResearch ? generateBlockedMessage || researchStepSummary.detail : researchStepSummary.detail}
              </div>
              {researchCoverageRibbon.note ? (
                <div className="mt-2 text-xs leading-6 text-inkMuted">{researchCoverageRibbon.note}</div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {generateBlockedByResearch ? (
                <Button type="button" disabled variant="primary" size="sm">
                  后续生成已锁定
                </Button>
              ) : null}
              {(generateBlockedByResearch
                || (currentArticleMainStep.code !== "strategy" && currentArticleMainStep.code !== "evidence")) ? (
                <Button type="button" onClick={onGoToResearchStep} disabled={isUpdatingWorkflow} variant="secondary" size="sm">
                  {generateBlockedByResearch ? "去补研究层" : "查看研究层"}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {researchCoverageRibbon.dimensions.map((item) => (
              <span
                key={item.key}
                className={`border px-3 py-2 ${
                  item.covered
                    ? "border-emerald-200 bg-surface text-emerald-700"
                    : "border-lineStrong/70 bg-paperStrong text-inkMuted"
                }`}
              >
                {item.label} · {item.covered ? "已覆盖" : "待补"}
              </span>
            ))}
            {researchCoverageRibbon.gaps.length > 0 ? (
              <span className="border border-danger/20 bg-surface px-3 py-2 text-danger">
                缺口：{researchCoverageRibbon.gaps.join("、")}
              </span>
            ) : null}
          </div>
        </div>

        <div className={`mt-4 border px-4 py-4 ${currentTaskToneClass.container}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前稿件任务</div>
                <div className={`border px-2 py-1 text-xs ${currentTaskToneClass.badge}`}>{currentArticleTask.badge}</div>
              </div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{currentArticleTask.title}</div>
              <div className={`mt-2 text-sm leading-7 ${currentTaskToneClass.detail}`}>{currentArticleTask.detail}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentArticleTask.actionKind === "goto-research" ? (
                <Button type="button" onClick={onGoToResearchStep} disabled={isUpdatingWorkflow} variant="primary" size="sm">
                  {currentArticleTask.actionLabel}
                </Button>
              ) : currentTaskStep ? (
                <Button
                  type="button"
                  onClick={() => onSelectMainStep(currentTaskStep)}
                  disabled={isUpdatingWorkflow || Boolean(currentTaskStep.disabled)}
                  variant="primary"
                  size="sm"
                  title={currentTaskStep.disabledReason ?? undefined}
                >
                  {currentArticleTask.actionLabel}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div data-command-chrome="true" className={`border-b border-line pb-4 ${hideMainStepRail ? "hidden" : ""}`}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">稿件六步链路</div>
          <div className="mt-3 space-y-3 md:hidden">
            <div className="border border-lineStrong bg-surfaceWarm px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">
                    步骤 {String(articleMainSteps.findIndex((step) => step.code === currentArticleMainStep.code) + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-2 font-serifCn text-2xl text-ink">{currentArticleMainStep.title}</div>
                </div>
                <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
                  {formatArticleMainStepStatus(
                    (articleMainSteps.find((step) => step.code === currentArticleMainStep.code)?.statusLabel || "current") as
                      | "pending"
                      | "current"
                      | "completed"
                      | "needs_attention",
                  )}
                </div>
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {currentArticleMainStep.supportLabel}
              </div>
            </div>
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
              {articleMainSteps.map((step, index) => (
                <Button
                  key={step.code}
                  type="button"
                  onClick={() => onSelectMainStep(step)}
                  disabled={isUpdatingWorkflow || Boolean(step.disabled) || (step.code === "result" && !canOpenResultStep)}
                  variant="secondary"
                  title={step.disabledReason ?? undefined}
                  className={`min-w-[220px] shrink-0 snap-start whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                    step.statusLabel === "current"
                      ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                      : step.statusLabel === "completed"
                        ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                        : step.statusLabel === "needs_attention"
                          ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                          : "border-lineStrong/60 bg-surface"
                  } ${step.code === "result" && !canOpenResultStep ? "cursor-default" : ""}`}
                >
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                      步骤 {String(index + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-xs ${
                        step.statusLabel === "current"
                          ? "text-cinnabar"
                          : step.statusLabel === "completed"
                            ? "text-emerald-700"
                            : step.statusLabel === "needs_attention"
                              ? "text-warning"
                              : "text-inkMuted"
                      }`}
                    >
                      {formatArticleMainStepStatus(step.statusLabel as "pending" | "current" | "completed" | "needs_attention")}
                    </span>
                  </span>
                  <span className="mt-2 font-serifCn text-xl text-ink">{step.title}</span>
                  <span className="mt-2 text-xs leading-6 text-inkMuted">{step.supportLabel}</span>
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 hidden gap-3 xl:grid-cols-6 md:grid">
            {articleMainSteps.map((step, index) => (
              <Button
                key={step.code}
                type="button"
                onClick={() => onSelectMainStep(step)}
                disabled={isUpdatingWorkflow || Boolean(step.disabled) || (step.code === "result" && !canOpenResultStep)}
                variant="secondary"
                title={step.disabledReason ?? undefined}
                fullWidth
                className={`h-full whitespace-normal px-4 py-3 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  step.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : step.statusLabel === "completed"
                      ? "border-lineStrong bg-paperStrong hover:border-lineStrong hover:bg-paperStrong"
                      : step.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                } ${step.code === "result" && !canOpenResultStep ? "cursor-default" : ""}`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                    步骤 {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-xs ${
                      step.statusLabel === "current"
                        ? "text-cinnabar"
                        : step.statusLabel === "completed"
                          ? "text-emerald-700"
                          : step.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(step.statusLabel as "pending" | "current" | "completed" | "needs_attention")}
                  </span>
                </span>
                <span className="mt-2 font-serifCn text-xl text-ink">{step.title}</span>
                <span className="mt-1 text-xs text-inkMuted">{step.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-3 text-sm leading-7 text-inkMuted">
            当前稿件停留在「{currentArticleMainStep.title}」。底层仍沿用现有执行阶段，但作者视角固定只看这 6 步。
          </div>
        </div>

        {resultLeadPanel}

        <div className="mt-4 border border-lineStrong/60 bg-surfaceWarm p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">作者阶段</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                把复杂控制项折叠成写作者真正关心的 4 个阶段，只在当前阶段强调必要动作。
              </div>
            </div>
            <div className="border border-lineStrong bg-surface px-3 py-2 text-xs text-inkSoft">
              当前：{currentAuthoringPhaseTitle}
            </div>
          </div>
          <div className="mt-4 -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:hidden">
            {authoringPhases.map((phase) => (
              <Button
                key={phase.code}
                type="button"
                onClick={() => onSelectAuthoringPhase(phase)}
                disabled={isUpdatingWorkflow}
                variant="secondary"
                className={`min-w-[220px] shrink-0 snap-start whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  phase.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : phase.statusLabel === "completed"
                      ? "border-lineStrong bg-surface"
                      : phase.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-serifCn text-xl text-ink">{phase.title}</span>
                  <span
                    className={`text-xs ${
                      phase.statusLabel === "current"
                        ? "text-cinnabar"
                        : phase.statusLabel === "completed"
                          ? "text-emerald-700"
                          : phase.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(phase.statusLabel as "pending" | "current" | "completed" | "needs_attention")}
                  </span>
                </span>
                <span className="mt-2 text-sm leading-7 text-inkSoft">{phase.summary}</span>
                <span className="mt-3 text-xs text-inkMuted">{phase.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-4 hidden gap-3 xl:grid-cols-4 md:grid">
            {authoringPhases.map((phase) => (
              <Button
                key={phase.code}
                type="button"
                onClick={() => onSelectAuthoringPhase(phase)}
                disabled={isUpdatingWorkflow}
                variant="secondary"
                fullWidth
                className={`h-full whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  phase.statusLabel === "current"
                    ? "border-cinnabar bg-surfaceWarm hover:border-cinnabar hover:bg-surfaceWarm"
                    : phase.statusLabel === "completed"
                      ? "border-lineStrong bg-surface"
                      : phase.statusLabel === "needs_attention"
                        ? "border-warning/40 bg-surfaceWarning hover:border-warning/40 hover:bg-surfaceWarning"
                        : "border-lineStrong/60 bg-surface"
                }`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="font-serifCn text-2xl text-ink">{phase.title}</span>
                  <span
                    className={`text-xs ${
                      phase.statusLabel === "current"
                        ? "text-cinnabar"
                        : phase.statusLabel === "completed"
                          ? "text-emerald-700"
                          : phase.statusLabel === "needs_attention"
                            ? "text-warning"
                            : "text-inkMuted"
                    }`}
                  >
                    {formatArticleMainStepStatus(phase.statusLabel as "pending" | "current" | "completed" | "needs_attention")}
                  </span>
                </span>
                <span className="mt-2 text-sm leading-7 text-inkSoft">{phase.summary}</span>
                <span className="mt-3 text-xs text-inkMuted">{phase.supportLabel}</span>
              </Button>
            ))}
          </div>
          <div className="mt-4 border border-lineStrong/70 bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            {currentAuthoringPhaseHint}
          </div>
        </div>

        <div id="workspace-metadata" data-command-chrome="true" className="mt-4 scroll-mt-24">
          {controlsBar}
        </div>
        {generateBlockedByResearch ? (
          <div data-command-chrome="true" className="mt-3 border border-danger/30 bg-surface px-4 py-3 text-sm leading-7 text-danger">
            后续生成已禁用：{generateBlockedMessage || "研究层信源覆盖仍不足，请先补研究简报。"}
          </div>
        ) : null}

        <div data-command-chrome="true" className="mt-4 border-b border-line pb-3">
          <div className="md:hidden">
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前视图</div>
            <div className="mt-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {(["workspace", "edit", "preview", "audit"] as const).map((workspaceView) => (
                <Button
                  key={workspaceView}
                  aria-label={`移动端视图按钮-${workspaceView}`}
                  onClick={() => onViewChange(workspaceView)}
                  variant={view === workspaceView ? "primary" : "secondary"}
                  size="sm"
                  className="shrink-0"
                >
                  {formatWorkspaceViewLabel(workspaceView)}
                </Button>
              ))}
            </div>
            <div className="mt-3 text-sm text-inkMuted">
              当前视图：{formatWorkspaceViewLabel(view)}
            </div>
          </div>
          <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
            <div className="flex flex-wrap gap-2">
              {(["workspace", "edit", "preview", "audit"] as const).map((workspaceView) => (
                <Button
                  key={workspaceView}
                  onClick={() => onViewChange(workspaceView)}
                  variant={view === workspaceView ? "primary" : "secondary"}
                  size="sm"
                >
                  {formatWorkspaceViewLabel(workspaceView)}
                </Button>
              ))}
            </div>
            <div className="text-sm text-inkMuted">
              当前视图：{formatWorkspaceViewLabel(view)}
            </div>
          </div>
        </div>

        {selectedSeriesNotice}

        {view === "workspace" ? (
          <div className="mt-4 min-h-[420px] border border-lineStrong bg-surface p-4 md:min-h-[560px] md:p-6">
            <div className="mb-4 text-xs uppercase tracking-[0.24em] text-inkMuted">阶段配置与执行产物</div>
            <StepComponent {...workspaceStepPanels} />
          </div>
        ) : view === "edit" ? (
          editView
        ) : view === "preview" ? (
          previewView
        ) : (
          auditView
        )}

        {message}
    </section>
  );
}
