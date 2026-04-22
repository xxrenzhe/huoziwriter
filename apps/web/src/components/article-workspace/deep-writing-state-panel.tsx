import { Button } from "@huoziwriter/ui";

type DeepWritingStateOption = {
  code: string;
  label: string;
};

type DeepWritingStateComparison = {
  code: string;
  label: string;
  suitableWhen: string;
  reason: string;
  openingPatternLabel: string;
  syntaxPatternLabel: string;
  endingPatternLabel: string;
  progressiveRevealLabel: string;
  historySummary: string;
  diversitySummary: string;
  diversitySuggestions: string[];
  isCurrent: boolean;
  isSelected: boolean;
  isRecommended: boolean;
  previewKey: string;
  previewText: string;
};

type DeepWritingStatePanelProps = {
  stateOptions: DeepWritingStateOption[];
  selectedStateCode: string | null;
  currentStateLabel: string;
  selectedStateLabel: string;
  onSelectState: (value: string | null) => void;
  stateComparisons: DeepWritingStateComparison[];
  openingPreviewLoadingKey: string | null;
  previewActionsDisabled: boolean;
  regenerateDisabled: boolean;
  onSampleStateOpenings: () => void;
  onRegenerateByState: (code: string | null, label: string) => void;
  onLoadStatePreview: (previewKey: string, code: string | null) => void;
};

export function DeepWritingStatePanel({
  stateOptions,
  selectedStateCode,
  currentStateLabel,
  selectedStateLabel,
  onSelectState,
  stateComparisons,
  openingPreviewLoadingKey,
  previewActionsDisabled,
  regenerateDisabled,
  onSampleStateOpenings,
  onRegenerateByState,
  onLoadStatePreview,
}: DeepWritingStatePanelProps) {
  return (
    <>
      {stateOptions.length > 0 ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-inkSoft">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">风格变体切换</div>
          <div className="mt-2">
            默认按系统推荐状态生成；如果你想避免同一篇总写成一个声部，可以强制切到别的写作状态后重生执行卡。
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onSelectState(null)}
              variant={!selectedStateCode ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              自动推荐
            </Button>
            {stateOptions.map((item, index) => (
              <Button
                key={`deep-writing-variant-${item.code || index}`}
                type="button"
                onClick={() => onSelectState(item.code || null)}
                variant={selectedStateCode === item.code ? "primary" : "secondary"}
                size="sm"
                className="text-xs"
              >
                {item.label || item.code || `状态 ${index + 1}`}
              </Button>
            ))}
          </div>
          <div className="mt-3 text-xs leading-6 text-inkMuted">
            {!selectedStateCode
              ? `当前保持自动推荐${currentStateLabel ? `，最近一次执行卡采用的是「${currentStateLabel}」` : ""}。`
              : `下次重生会强制切到「${selectedStateLabel || selectedStateCode}」。`}
          </div>
        </div>
      ) : null}

      {stateComparisons.length > 0 ? (
        <div className="border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">状态对比预览</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                先看 2-3 个可用声部的差异，再决定是否切状态重生执行卡。第一张默认就是当前推荐。
              </div>
            </div>
            <Button
              type="button"
              onClick={onSampleStateOpenings}
              disabled={previewActionsDisabled}
              variant="secondary"
              size="sm"
              className="text-xs"
            >
              {openingPreviewLoadingKey === "state-batch" ? "采样中…" : "一键采样 3 个状态开头"}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {stateComparisons.map((item, index) => (
              <div
                key={`deep-writing-comparison-${item.code || index}`}
                className={`border px-4 py-4 ${
                  item.isCurrent || item.isRecommended
                    ? "border-warning/30 bg-surfaceWarning"
                    : "border-lineStrong/60 bg-paperStrong"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                  <span className="font-medium text-ink">{item.label || item.code || `状态 ${index + 1}`}</span>
                  {item.isCurrent ? <span className="border border-lineStrong bg-surface px-2 py-1">当前执行卡</span> : null}
                  {!item.isCurrent && item.isRecommended ? <span className="border border-lineStrong bg-surface px-2 py-1">系统推荐</span> : null}
                </div>
                {item.suitableWhen ? <div className="mt-2 text-xs leading-6 text-inkMuted">适用：{item.suitableWhen}</div> : null}
                {item.reason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.reason}</div> : null}
                <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                  {item.openingPatternLabel ? <div>开头模式：{item.openingPatternLabel}</div> : null}
                  {item.syntaxPatternLabel ? <div>句法模式：{item.syntaxPatternLabel}</div> : null}
                  {item.endingPatternLabel ? <div>结尾模式：{item.endingPatternLabel}</div> : null}
                  {item.progressiveRevealLabel ? <div>节奏插件：{item.progressiveRevealLabel}</div> : null}
                  {item.historySummary ? <div>历史验证：{item.historySummary}</div> : null}
                </div>
                {item.diversitySummary ? (
                  <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-xs leading-6 text-inkSoft">
                    {item.diversitySummary}
                  </div>
                ) : null}
                {item.diversitySuggestions.length > 0 ? (
                  <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                    {item.diversitySuggestions.map((suggestion) => (
                      <div key={suggestion}>- {suggestion}</div>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => onSelectState(item.code || null)}
                    variant={item.isSelected ? "primary" : "secondary"}
                    size="sm"
                    className="text-xs"
                  >
                    {item.isSelected ? "已选中" : "选这个状态"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onRegenerateByState(item.code || null, item.label)}
                    disabled={regenerateDisabled}
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    直接按此重生
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onLoadStatePreview(item.previewKey, item.code || null)}
                    disabled={previewActionsDisabled}
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    {openingPreviewLoadingKey === item.previewKey ? "生成中…" : "看开头预览"}
                  </Button>
                </div>
                {item.previewText ? (
                  <div className="mt-3 border border-lineStrong/60 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft whitespace-pre-wrap">
                    {item.previewText}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
