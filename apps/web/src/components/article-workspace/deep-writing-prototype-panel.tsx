import { Button } from "@huoziwriter/ui";

type DeepWritingPrototypeOption = {
  code: string;
  label: string;
};

type DeepWritingPrototypeComparison = {
  code: string;
  label: string;
  suitableWhen: string;
  reason: string;
  recommendedStateVariantLabel: string;
  openingPatternLabel: string;
  syntaxPatternLabel: string;
  endingPatternLabel: string;
  progressiveRevealLabel: string;
  historySummary: string;
  diversitySummary: string;
  isCurrent: boolean;
  isSelected: boolean;
  isRecommended: boolean;
  previewKey: string;
  previewText: string;
};

type DeepWritingPrototypePanelProps = {
  prototypeOptions: DeepWritingPrototypeOption[];
  selectedPrototypeCode: string | null;
  currentPrototypeLabel: string;
  selectedPrototypeLabel: string;
  onSelectPrototype: (value: string | null) => void;
  prototypeComparisons: DeepWritingPrototypeComparison[];
  openingPreviewLoadingKey: string | null;
  previewActionsDisabled: boolean;
  regenerateDisabled: boolean;
  onSamplePrototypeOpenings: () => void;
  onRegenerateByPrototype: (code: string | null, label: string) => void;
  onLoadPrototypePreview: (previewKey: string, code: string | null) => void;
};

export function DeepWritingPrototypePanel({
  prototypeOptions,
  selectedPrototypeCode,
  currentPrototypeLabel,
  selectedPrototypeLabel,
  onSelectPrototype,
  prototypeComparisons,
  openingPreviewLoadingKey,
  previewActionsDisabled,
  regenerateDisabled,
  onSamplePrototypeOpenings,
  onRegenerateByPrototype,
  onLoadPrototypePreview,
}: DeepWritingPrototypePanelProps) {
  return (
    <>
      {prototypeOptions.length > 0 ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-inkSoft">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">文章原型切换</div>
          <div className="mt-2">
            先定这篇到底按哪种推进骨架写，再决定具体声部。默认按系统推荐原型生成；如果你想主动换掉题型骨架，可以先切原型再重生执行卡。
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onSelectPrototype(null)}
              variant={!selectedPrototypeCode ? "primary" : "secondary"}
              size="sm"
              className="text-xs"
            >
              自动推荐
            </Button>
            {prototypeOptions.map((item, index) => (
              <Button
                key={`deep-writing-prototype-${item.code || index}`}
                type="button"
                onClick={() => onSelectPrototype(item.code || null)}
                variant={selectedPrototypeCode === item.code ? "primary" : "secondary"}
                size="sm"
                className="text-xs"
              >
                {item.label || item.code || `原型 ${index + 1}`}
              </Button>
            ))}
          </div>
          <div className="mt-3 text-xs leading-6 text-inkMuted">
            {!selectedPrototypeCode
              ? `当前保持自动推荐${currentPrototypeLabel ? `，最近一次执行卡采用的是「${currentPrototypeLabel}」` : ""}。`
              : `下次重生会强制切到「${selectedPrototypeLabel || selectedPrototypeCode}」。`}
          </div>
        </div>
      ) : null}

      {prototypeComparisons.length > 0 ? (
        <div className="border border-lineStrong/60 bg-surface px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">原型对比预览</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                先看 2-3 个可用题型骨架的差异，再决定这篇更适合调查、体验、解读还是方法论。第一张默认就是当前推荐。
              </div>
            </div>
            <Button
              type="button"
              onClick={onSamplePrototypeOpenings}
              disabled={previewActionsDisabled}
              variant="secondary"
              size="sm"
              className="text-xs"
            >
              {openingPreviewLoadingKey === "prototype-batch" ? "采样中…" : "一键采样 3 个原型开头"}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {prototypeComparisons.map((item, index) => (
              <div
                key={`deep-writing-prototype-comparison-${item.code || index}`}
                className={`border px-4 py-4 ${
                  item.isCurrent || item.isRecommended
                    ? "border-warning/30 bg-surfaceWarning"
                    : "border-lineStrong/60 bg-paperStrong"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
                  <span className="font-medium text-ink">{item.label || item.code || `原型 ${index + 1}`}</span>
                  {item.isCurrent ? <span className="border border-lineStrong bg-surface px-2 py-1">当前执行卡</span> : null}
                  {!item.isCurrent && item.isRecommended ? <span className="border border-lineStrong bg-surface px-2 py-1">系统推荐</span> : null}
                </div>
                {item.suitableWhen ? <div className="mt-2 text-xs leading-6 text-inkMuted">适用：{item.suitableWhen}</div> : null}
                {item.reason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.reason}</div> : null}
                <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
                  {item.recommendedStateVariantLabel ? <div>默认状态：{item.recommendedStateVariantLabel}</div> : null}
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => onSelectPrototype(item.code || null)}
                    variant={item.isSelected ? "primary" : "secondary"}
                    size="sm"
                    className="text-xs"
                  >
                    {item.isSelected ? "已选中" : "选这个原型"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onRegenerateByPrototype(item.code || null, item.label)}
                    disabled={regenerateDisabled}
                    variant="secondary"
                    size="sm"
                    className="text-xs"
                  >
                    直接按此重生
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onLoadPrototypePreview(item.previewKey, item.code || null)}
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
