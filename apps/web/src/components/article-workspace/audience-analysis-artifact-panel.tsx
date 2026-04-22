import { Button, Textarea } from "@huoziwriter/ui";

type AudienceReaderSegment = {
  label: string;
  painPoint: string;
  motivation: string;
  preferredTone: string;
};

type AudienceSelection = {
  selectedReaderLabel: string;
  selectedLanguageGuidance: string;
  selectedBackgroundAwareness: string;
  selectedReadabilityLevel: string;
  selectedCallToAction: string;
};

type AudienceAnalysisArtifactPanelProps = {
  coreReaderLabel: string;
  readerSegments: AudienceReaderSegment[];
  languageGuidanceOptions: string[];
  backgroundAwarenessOptions: string[];
  readabilityOptions: string[];
  callToActionOptions: string[];
  selection: AudienceSelection;
  onSelectReaderLabel: (value: string) => void;
  onSelectLanguageGuidance: (value: string) => void;
  onSelectBackgroundAwareness: (value: string) => void;
  onSelectReadabilityLevel: (value: string) => void;
  onSelectCallToAction: (value: string) => void;
  savingSelection: boolean;
  onSaveSelection: () => void;
  contentWarnings: string[];
};

export function AudienceAnalysisArtifactPanel({
  coreReaderLabel,
  readerSegments,
  languageGuidanceOptions,
  backgroundAwarenessOptions,
  readabilityOptions,
  callToActionOptions,
  selection,
  onSelectReaderLabel,
  onSelectLanguageGuidance,
  onSelectBackgroundAwareness,
  onSelectReadabilityLevel,
  onSelectCallToAction,
  savingSelection,
  onSaveSelection,
  contentWarnings,
}: AudienceAnalysisArtifactPanelProps) {
  return (
    <>
      {coreReaderLabel ? <div className="text-sm text-inkSoft">核心受众：{coreReaderLabel}</div> : null}
      {readerSegments.length > 0 ? (
        <div className="space-y-3">
          {readerSegments.map((segment, index) => {
            const segmentLabel = segment.label || `人群 ${index + 1}`;
            const isSelected = selection.selectedReaderLabel === segment.label;
            return (
              <div key={`${segment.label || index}`} className="border border-lineStrong/60 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-ink">{segmentLabel}</div>
                  <Button
                    type="button"
                    onClick={() => onSelectReaderLabel(segment.label)}
                    variant={isSelected ? "primary" : "secondary"}
                    size="sm"
                    className="min-h-0 px-3 py-1 text-xs"
                  >
                    {isSelected ? "已选中" : "设为目标读者"}
                  </Button>
                </div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">痛点：{segment.painPoint || "暂无"}</div>
                <div className="mt-1 text-sm leading-7 text-inkSoft">动机：{segment.motivation || "暂无"}</div>
                <div className="mt-1 text-sm leading-7 text-inkSoft">推荐语气：{segment.preferredTone || "暂无"}</div>
              </div>
            );
          })}
        </div>
      ) : null}
      {languageGuidanceOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">表达建议确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {languageGuidanceOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectLanguageGuidance(item)}
                variant={selection.selectedLanguageGuidance === item ? "primary" : "secondary"}
                size="sm"
                className="text-left"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {backgroundAwarenessOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">背景预设确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {backgroundAwarenessOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectBackgroundAwareness(item)}
                variant={selection.selectedBackgroundAwareness === item ? "primary" : "secondary"}
                size="sm"
                className="text-left"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {readabilityOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">语言通俗度确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {readabilityOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectReadabilityLevel(item)}
                variant={selection.selectedReadabilityLevel === item ? "primary" : "secondary"}
                size="sm"
                className="text-left"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾动作确认</div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {callToActionOptions.map((item) => (
            <Button
              key={item}
              type="button"
              onClick={() => onSelectCallToAction(item)}
              variant={selection.selectedCallToAction === item ? "primary" : "secondary"}
              size="sm"
              className="text-left"
            >
              {item}
            </Button>
          ))}
        </div>
        <Textarea
          aria-label="也可以手动补充你希望文末收束成什么动作"
          value={selection.selectedCallToAction}
          onChange={(event) => onSelectCallToAction(event.target.value)}
          placeholder="也可以手动补充你希望文末收束成什么动作"
          className="mt-3 min-h-[88px] px-3 py-2"
        />
      </div>
      <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
        <div>已确认目标读者：{selection.selectedReaderLabel || "未确认"}</div>
        <div className="mt-1">已确认表达方式：{selection.selectedLanguageGuidance || "未确认"}</div>
        <div className="mt-1">已确认背景预设：{selection.selectedBackgroundAwareness || "未确认"}</div>
        <div className="mt-1">已确认语言通俗度：{selection.selectedReadabilityLevel || "未确认"}</div>
        <div className="mt-1">已确认结尾动作：{selection.selectedCallToAction || "未确认"}</div>
      </div>
      <Button
        type="button"
        onClick={onSaveSelection}
        disabled={savingSelection}
        variant="secondary"
        className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
      >
        {savingSelection ? "保存中…" : "确认这组受众选择"}
      </Button>
      {contentWarnings.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">注意事项</div>
          <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
            {contentWarnings.map((item) => (
              <div key={item}>- {item}</div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
