import { Button } from "@huoziwriter/ui";
import type { ComponentProps } from "react";
import { DeepWritingChecklistPanel } from "./deep-writing-checklist-panel";
import { DeepWritingDiversityPanel } from "./deep-writing-diversity-panel";
import { DeepWritingExecutionCardPanel } from "./deep-writing-execution-card-panel";
import { DeepWritingHistoryReferencePanel } from "./deep-writing-history-reference-panel";
import { DeepWritingCreativeLensPanel } from "./deep-writing-creative-lens-panel";
import { DeepWritingPrototypePanel } from "./deep-writing-prototype-panel";
import { DeepWritingSeriesInsightPanel } from "./deep-writing-series-insight-panel";
import { DeepWritingStatePanel } from "./deep-writing-state-panel";

type DeepWritingOpeningDiagnosePanel = {
  openingText: string;
  patternLabel: string;
  qualityCeiling: string;
  hookScore: number;
  forbiddenHits: string[];
  recommendReason: string;
  checkedAtLabel?: string;
  recommendedDirection?: string;
  rewriteDirections?: string[];
  diagnoseBadges: Array<{
    label: string;
    tone: "pass" | "warn" | "danger";
  }>;
};

type DeepWritingArtifactPanelProps = {
  introTitle: string;
  introHelper: string;
  prototypePanel: ComponentProps<typeof DeepWritingPrototypePanel>;
  statePanel: ComponentProps<typeof DeepWritingStatePanel>;
  creativeLensPanel: ComponentProps<typeof DeepWritingCreativeLensPanel> | null;
  longTermDiversityPanel: ComponentProps<typeof DeepWritingDiversityPanel>;
  executionCardRefreshLabel: string;
  executionCardRefreshDisabled: boolean;
  onRefreshExecutionCard: () => void;
  executionCardPanel: ComponentProps<typeof DeepWritingExecutionCardPanel> | null;
  openingDiagnosePanel: DeepWritingOpeningDiagnosePanel | null;
  openingCheckActionLabel: string;
  openingCheckActionDisabled: boolean;
  onRunOpeningCheck: () => void;
  artifactDiversityPanel: ComponentProps<typeof DeepWritingDiversityPanel> | null;
  seriesInsightPanel: ComponentProps<typeof DeepWritingSeriesInsightPanel> | null;
  checklistPanel: ComponentProps<typeof DeepWritingChecklistPanel> | null;
  historyReferencePanel: ComponentProps<typeof DeepWritingHistoryReferencePanel>;
  startWritingLabel: string;
  startWritingDisabled: boolean;
  onStartWriting: () => void;
  showGoToResearch: boolean;
  onGoToResearch: () => void;
  goToResearchDisabled: boolean;
  blockedMessage: string;
};

export function DeepWritingArtifactPanel({
  introTitle,
  introHelper,
  prototypePanel,
  statePanel,
  creativeLensPanel,
  longTermDiversityPanel,
  executionCardRefreshLabel,
  executionCardRefreshDisabled,
  onRefreshExecutionCard,
  executionCardPanel,
  openingDiagnosePanel,
  openingCheckActionLabel,
  openingCheckActionDisabled,
  onRunOpeningCheck,
  artifactDiversityPanel,
  seriesInsightPanel,
  checklistPanel,
  historyReferencePanel,
  startWritingLabel,
  startWritingDisabled,
  onStartWriting,
  showGoToResearch,
  onGoToResearch,
  goToResearchDisabled,
  blockedMessage,
}: DeepWritingArtifactPanelProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
        <div className="font-medium text-ink">{introTitle}</div>
        <div className="mt-2">{introHelper}</div>
      </div>
      <DeepWritingPrototypePanel {...prototypePanel} />
      <DeepWritingStatePanel {...statePanel} />
      {creativeLensPanel ? <DeepWritingCreativeLensPanel {...creativeLensPanel} /> : null}
      <DeepWritingDiversityPanel {...longTermDiversityPanel} />
      <Button
        onClick={onRefreshExecutionCard}
        disabled={executionCardRefreshDisabled}
        variant="primary"
      >
        {executionCardRefreshLabel}
      </Button>
      {executionCardPanel ? <DeepWritingExecutionCardPanel {...executionCardPanel} /> : null}
      {openingDiagnosePanel ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头体检</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                当前执行卡里的开头策略已经按公众号开头规则做了显式诊断，方便你在落正文前先看前三秒留存风险。
              </div>
              {openingDiagnosePanel.checkedAtLabel ? (
                <div className="mt-2 text-xs leading-6 text-inkMuted">{openingDiagnosePanel.checkedAtLabel}</div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-2 text-xs text-inkMuted">
                {openingDiagnosePanel.patternLabel ? (
                  <span className="border border-lineStrong/60 bg-surface px-3 py-1">
                    模式：{openingDiagnosePanel.patternLabel}
                  </span>
                ) : null}
                {openingDiagnosePanel.qualityCeiling ? (
                  <span className="border border-lineStrong/60 bg-surface px-3 py-1">
                    上限：{openingDiagnosePanel.qualityCeiling}
                  </span>
                ) : null}
                <span className="border border-lineStrong/60 bg-surface px-3 py-1">
                  钩子分：{openingDiagnosePanel.hookScore}
                </span>
              </div>
              <Button
                type="button"
                onClick={onRunOpeningCheck}
                disabled={openingCheckActionDisabled}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                {openingCheckActionLabel}
              </Button>
            </div>
          </div>
          <div className="mt-3 whitespace-pre-wrap border border-warning/20 bg-surface px-4 py-3 text-sm leading-7 text-ink">
            {openingDiagnosePanel.openingText}
          </div>
          {openingDiagnosePanel.diagnoseBadges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {openingDiagnosePanel.diagnoseBadges.map((badge) => (
                <span
                  key={badge.label}
                  className={`border px-2 py-1 text-[11px] ${
                    badge.tone === "danger"
                      ? "border-danger/30 bg-red-50 text-danger"
                      : badge.tone === "warn"
                        ? "border-warning/30 bg-surface px-2 py-1 text-warning"
                        : "border-emerald-300 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          ) : null}
          {openingDiagnosePanel.recommendReason ? (
            <div className="mt-3 text-xs leading-6 text-inkMuted">
              推荐理由：{openingDiagnosePanel.recommendReason}
            </div>
          ) : null}
          {openingDiagnosePanel.recommendedDirection ? (
            <div className="mt-3 border border-warning/20 bg-surface px-3 py-2 text-xs leading-6 text-warning">
              推荐改写方向：{openingDiagnosePanel.recommendedDirection}
            </div>
          ) : null}
          {openingDiagnosePanel.rewriteDirections && openingDiagnosePanel.rewriteDirections.length > 0 ? (
            <div className="mt-3 space-y-2">
              {openingDiagnosePanel.rewriteDirections.map((direction) => (
                <div key={direction} className="border border-lineStrong/60 bg-surface px-3 py-2 text-xs leading-6 text-inkSoft">
                  {direction}
                </div>
              ))}
            </div>
          ) : null}
          {openingDiagnosePanel.forbiddenHits.length > 0 ? (
            <div className="mt-3 border border-danger/30 bg-red-50 px-3 py-2 text-xs leading-6 text-danger">
              风险提示：{openingDiagnosePanel.forbiddenHits.join("、")}
            </div>
          ) : null}
        </div>
      ) : null}
      {artifactDiversityPanel ? <DeepWritingDiversityPanel {...artifactDiversityPanel} /> : null}
      {seriesInsightPanel ? <DeepWritingSeriesInsightPanel {...seriesInsightPanel} /> : null}
      {checklistPanel ? <DeepWritingChecklistPanel {...checklistPanel} /> : null}
      <DeepWritingHistoryReferencePanel {...historyReferencePanel} />
      <div className="flex flex-wrap gap-3">
        <Button onClick={onStartWriting} disabled={startWritingDisabled} variant="primary">
          {startWritingLabel}
        </Button>
        {showGoToResearch ? (
          <Button type="button" onClick={onGoToResearch} disabled={goToResearchDisabled} variant="secondary">
            去补研究层
          </Button>
        ) : null}
      </div>
      {blockedMessage ? (
        <div className="border border-danger/30 bg-surface px-4 py-3 text-sm leading-7 text-danger">
          后续生成已禁用：{blockedMessage}
        </div>
      ) : null}
    </div>
  );
}
