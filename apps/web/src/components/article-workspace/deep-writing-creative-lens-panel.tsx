import { Button } from "@huoziwriter/ui";

type DeepWritingCreativeLensOption = {
  code: string;
  label: string;
  suitableWhen: string;
  narrativePosture: string;
  openingMove: string;
  sectionRhythm: string;
  evidenceMode: string;
  triggerReason: string;
  historySignal?: {
    sampleCount?: number;
    positiveSampleCount?: number;
    rankingAdjustment?: number;
    reason?: string;
  } | null;
  isRecommended?: boolean;
};

type DeepWritingCreativeLensPanelProps = {
  lensOptions: DeepWritingCreativeLensOption[];
  selectedLensCode: string | null;
  currentLensCode: string;
  currentLensLabel: string;
  selectedLensLabel: string;
  onSelectLens: (value: string | null) => void;
  regenerateDisabled: boolean;
  onRegenerateByLens: (code: string | null, label: string) => void;
};

export function DeepWritingCreativeLensPanel({
  lensOptions,
  selectedLensCode,
  currentLensCode,
  currentLensLabel,
  selectedLensLabel,
  onSelectLens,
  regenerateDisabled,
  onRegenerateByLens,
}: DeepWritingCreativeLensPanelProps) {
  if (lensOptions.length === 0) {
    return null;
  }

  return (
    <div className="border border-warning/30 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-inkSoft">
      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">创意镜头切换</div>
      <div className="mt-2">
        镜头决定文章从案例、现场、锐评、实测还是个人经历里长出来。默认由系统按题材和素材推荐；需要换叙事视角时，先切镜头再重生执行卡。
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => onSelectLens(null)}
          variant={!selectedLensCode ? "primary" : "secondary"}
          size="sm"
          className="text-xs"
        >
          自动推荐
        </Button>
        {lensOptions.map((item, index) => (
          <Button
            key={`deep-writing-creative-lens-${item.code || index}`}
            type="button"
            onClick={() => onSelectLens(item.code || null)}
            variant={selectedLensCode === item.code ? "primary" : "secondary"}
            size="sm"
            className="text-xs"
          >
            {item.label || item.code || `镜头 ${index + 1}`}
          </Button>
        ))}
      </div>
      <div className="mt-3 text-xs leading-6 text-inkMuted">
        {!selectedLensCode
          ? `当前保持自动推荐${currentLensLabel ? `，最近一次执行卡采用的是「${currentLensLabel}」` : ""}。`
          : `下次重生会强制切到「${selectedLensLabel || selectedLensCode}」。`}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {lensOptions.map((item, index) => (
          <div
            key={`deep-writing-creative-lens-card-${item.code || index}`}
            className={`border px-4 py-4 ${
              selectedLensCode === item.code || (!selectedLensCode && currentLensCode === item.code)
                ? "border-warning/30 bg-surface"
                : "border-lineStrong/60 bg-paperStrong"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-inkMuted">
              <span className="font-medium text-ink">{item.label || item.code || `镜头 ${index + 1}`}</span>
              {!selectedLensCode && currentLensCode === item.code ? (
                <span className="border border-lineStrong bg-surface px-2 py-1">当前执行卡</span>
              ) : null}
              {selectedLensCode === item.code ? (
                <span className="border border-lineStrong bg-surface px-2 py-1">已选中</span>
              ) : null}
              {item.isRecommended ? (
                <span className="border border-lineStrong bg-surface px-2 py-1">自动推荐</span>
              ) : null}
            </div>
            {item.suitableWhen ? <div className="mt-2 text-xs leading-6 text-inkMuted">适用：{item.suitableWhen}</div> : null}
            {item.triggerReason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.triggerReason}</div> : null}
            {item.historySignal?.reason ? (
              <div className="mt-2 text-xs leading-6 text-inkMuted">
                历史：{item.historySignal.reason}
              </div>
            ) : null}
            <div className="mt-3 space-y-1 text-xs leading-6 text-inkMuted">
              {item.narrativePosture ? <div>叙事姿态：{item.narrativePosture}</div> : null}
              {item.openingMove ? <div>起手方式：{item.openingMove}</div> : null}
              {item.sectionRhythm ? <div>推进节奏：{item.sectionRhythm}</div> : null}
              {item.evidenceMode ? <div>证据偏好：{item.evidenceMode}</div> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => onSelectLens(item.code || null)}
                variant={selectedLensCode === item.code ? "primary" : "secondary"}
                size="sm"
                className="text-xs"
              >
                {selectedLensCode === item.code ? "已选中" : "选这个镜头"}
              </Button>
              <Button
                type="button"
                onClick={() => onRegenerateByLens(item.code || null, item.label)}
                disabled={regenerateDisabled}
                variant="secondary"
                size="sm"
                className="text-xs"
              >
                直接按此重生
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
