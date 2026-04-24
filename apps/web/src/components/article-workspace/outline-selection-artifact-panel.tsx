import { Button } from "@huoziwriter/ui";
import { getOutlineOpeningOptionCardClassName } from "@/lib/outline-opening-option-tone";

type OutlineTitleElement = {
  label: string;
  active: boolean;
};

type OutlineTitleOption = {
  title: string;
  style: string;
  angle: string;
  reason: string;
  riskHint: string;
  recommendReason: string;
  forbiddenHits: string[];
  score: number;
  scoreWidth: string;
  elements: OutlineTitleElement[];
  isSelected: boolean;
  isRecommended: boolean;
};

type OutlineOpeningDiagnoseBadge = {
  label: string;
  tone: "pass" | "warn" | "danger";
};

type OutlineOpeningOption = {
  value: string;
  patternLabel: string;
  qualityCeiling: string;
  recommendReason: string;
  forbiddenHits: string[];
  hookScore: number;
  hookScoreWidth: string;
  diagnoseBadges: OutlineOpeningDiagnoseBadge[];
  isSelected: boolean;
  isRecommended: boolean;
};

type OutlineViewpointIntegration = {
  viewpoint: string;
  actionLabel: string;
  note: string;
};

type OutlineMaterialBundleItem = {
  title: string;
  meta: string;
  summary: string;
  screenshotPath: string;
};

type OutlineResearchBackbone = {
  openingTimelineAnchor: string;
  middleComparisonAnchor: string;
  coreInsightAnchor: string;
  sequencingNote: string;
} | null;

type OutlineSectionItem = {
  heading: string;
  researchFocusLabel: string;
  goal: string;
  keyPoints: string[];
  evidenceHints: string[];
  materialRefs: string[];
  researchAnchor: string;
  transition: string;
};

type OutlineSelectionSummary = {
  selectedTitle: string;
  selectedTitleStyle: string;
  selectedOpeningHook: string;
  selectedTargetEmotion: string;
  selectedEndingStrategy: string;
};

type OutlineSelectionArtifactPanelProps = {
  titleOptions: OutlineTitleOption[];
  openingOptions: OutlineOpeningOption[];
  titleAuditTimestampLabel: string;
  regeneratingTitles: boolean;
  disableRegenerateTitles: boolean;
  onRegenerateTitles: () => void;
  regeneratingOpenings: boolean;
  disableRegenerateOpenings: boolean;
  onRegenerateOpenings: () => void;
  onSelectTitle: (title: string, style: string) => void;
  titleStrategyNotes: string[];
  centralThesis: string;
  supplementalViewpoints: string[];
  viewpointIntegration: OutlineViewpointIntegration[];
  materialBundle: OutlineMaterialBundleItem[];
  openingHookOptions: string[];
  selectedOpeningHook: string;
  onSelectOpeningHook: (value: string) => void;
  targetEmotionOptions: string[];
  selectedTargetEmotion: string;
  onSelectTargetEmotion: (value: string) => void;
  researchBackbone: OutlineResearchBackbone;
  outlineSections: OutlineSectionItem[];
  materialGapHints: string[];
  endingStrategyOptions: string[];
  selectedEndingStrategy: string;
  onSelectEndingStrategy: (value: string) => void;
  selectionSummary: OutlineSelectionSummary;
  savingSelection: boolean;
  saveDisabled: boolean;
  onSaveSelection: () => void;
  endingStrategyText: string;
};

export function OutlineSelectionArtifactPanel({
  titleOptions,
  openingOptions,
  titleAuditTimestampLabel,
  regeneratingTitles,
  disableRegenerateTitles,
  onRegenerateTitles,
  regeneratingOpenings,
  disableRegenerateOpenings,
  onRegenerateOpenings,
  onSelectTitle,
  titleStrategyNotes,
  centralThesis,
  supplementalViewpoints,
  viewpointIntegration,
  materialBundle,
  openingHookOptions,
  selectedOpeningHook,
  onSelectOpeningHook,
  targetEmotionOptions,
  selectedTargetEmotion,
  onSelectTargetEmotion,
  researchBackbone,
  outlineSections,
  materialGapHints,
  endingStrategyOptions,
  selectedEndingStrategy,
  onSelectEndingStrategy,
  selectionSummary,
  savingSelection,
  saveDisabled,
  onSaveSelection,
  endingStrategyText,
}: OutlineSelectionArtifactPanelProps) {
  return (
    <>
      {titleOptions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">标题六选一</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">确认后会同步稿件标题，深度写作默认沿用这个标题。</div>
              {titleAuditTimestampLabel ? <div className="mt-2 text-xs leading-6 text-inkMuted">最近体检：{titleAuditTimestampLabel}</div> : null}
            </div>
            <Button
              type="button"
              onClick={onRegenerateTitles}
              disabled={disableRegenerateTitles}
              variant="secondary"
              size="sm"
              className="text-xs"
            >
              {regeneratingTitles ? "优化中…" : "重新优化标题"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {titleOptions.map((item, index) => (
              <Button
                key={`${item.title || index}`}
                type="button"
                onClick={() => onSelectTitle(item.title, item.style)}
                variant="secondary"
                fullWidth
                className={`h-auto whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  getOutlineOpeningOptionCardClassName({
                    isSelected: item.isSelected,
                    forbiddenHits: item.forbiddenHits,
                  })
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-1 text-xs ${item.isSelected ? "bg-cinnabar text-white" : "bg-paperStrong text-inkMuted"}`}>
                    {item.style || `标题方案 ${index + 1}`}
                  </span>
                  {item.isRecommended ? <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-xs text-warning">⭐ 推荐</span> : null}
                  {item.angle ? <span className="text-xs text-inkMuted">{item.angle}</span> : null}
                </span>
                <span className="mt-3 text-base font-medium leading-7 text-ink">{item.title || `标题方案 ${index + 1}`}</span>
                <span className="mt-3 block w-full">
                  <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-inkMuted">
                    <span>打开率分</span>
                    <span>{item.score}/50</span>
                  </span>
                  <span className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-paperStrong">
                    <span className="block h-full rounded-full bg-warning" style={{ width: item.scoreWidth }} />
                  </span>
                </span>
                <span className="mt-3 flex flex-wrap gap-2">
                  {item.elements.map((element) => (
                    <span
                      key={`${item.title || index}-${element.label}`}
                      className={`border px-2 py-1 text-[11px] ${
                        element.active
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-lineStrong bg-paperStrong text-inkMuted"
                      }`}
                    >
                      {element.label}
                    </span>
                  ))}
                </span>
                {item.reason ? <span className="mt-2 text-sm leading-7 text-inkSoft">{item.reason}</span> : null}
                {item.isRecommended && item.recommendReason ? (
                  <span className="mt-3 block border border-warning/30 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                    推荐理由：{item.recommendReason}
                  </span>
                ) : null}
                {item.riskHint ? (
                  <span className="mt-3 block border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-6 text-amber-900">
                    风险提示：{item.riskHint}
                  </span>
                ) : null}
                {item.forbiddenHits.length > 0 ? (
                  <span className="mt-3 block border border-danger/30 bg-red-50 px-3 py-2 text-xs leading-6 text-danger">
                    禁止清单：{item.forbiddenHits.join("、")}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
          {titleStrategyNotes.length > 0 ? (
            <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
              {titleStrategyNotes.join("；")}
            </div>
          ) : null}
        </div>
      ) : null}

      {openingOptions.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头三选一</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                先把前 200 字定下来，再继续确认开头策略和后续章节推进。选中的方案会直接写进当前大纲选择。
              </div>
            </div>
            <Button
              type="button"
              onClick={onRegenerateOpenings}
              disabled={disableRegenerateOpenings}
              variant="secondary"
              size="sm"
              className="text-xs"
            >
              {regeneratingOpenings ? "优化中…" : "重新优化开头"}
            </Button>
          </div>
          <div className="grid gap-3">
            {openingOptions.map((item, index) => (
              <Button
                key={`${item.patternLabel || "opening"}-${index}`}
                type="button"
                onClick={() => onSelectOpeningHook(item.value)}
                variant="secondary"
                fullWidth
                className={`h-auto whitespace-normal px-4 py-4 text-left [&>span]:flex [&>span]:w-full [&>span]:flex-col [&>span]:items-start ${
                  item.isSelected
                    ? "border-cinnabar bg-surfaceWarning hover:border-cinnabar hover:bg-surfaceWarning"
                    : "border-lineStrong bg-surface"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  {item.patternLabel ? (
                    <span className={`px-2 py-1 text-xs ${item.isSelected ? "bg-cinnabar text-white" : "bg-paperStrong text-inkMuted"}`}>
                      {item.patternLabel}
                    </span>
                  ) : null}
                  {item.qualityCeiling ? <span className="text-xs text-inkMuted">质量上限 {item.qualityCeiling}</span> : null}
                  {item.isRecommended ? <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-xs text-warning">⭐ 推荐</span> : null}
                </span>
                <span className="mt-3 whitespace-pre-wrap text-sm leading-7 text-ink">{item.value || `开头方案 ${index + 1}`}</span>
                <span className="mt-3 block w-full">
                  <span className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-inkMuted">
                    <span>钩子分</span>
                    <span>{item.hookScore}</span>
                  </span>
                  <span className="mt-2 block h-2 w-full overflow-hidden rounded-full bg-paperStrong">
                    <span className="block h-full rounded-full bg-warning" style={{ width: item.hookScoreWidth }} />
                  </span>
                </span>
                {item.diagnoseBadges.length > 0 ? (
                  <span className="mt-3 flex flex-wrap gap-2">
                    {item.diagnoseBadges.map((badge) => (
                      <span
                        key={`${item.patternLabel || "opening"}-${index}-${badge.label}`}
                        className={`border px-2 py-1 text-[11px] ${
                          badge.tone === "danger"
                            ? "border-danger/30 bg-red-50 text-danger"
                            : badge.tone === "warn"
                              ? "border-warning/30 bg-surfaceWarning text-warning"
                              : "border-emerald-300 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </span>
                ) : null}
                {item.isRecommended && item.recommendReason ? (
                  <span className="mt-3 block border border-warning/30 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                    推荐理由：{item.recommendReason}
                  </span>
                ) : null}
                {item.forbiddenHits.length > 0 ? (
                  <span className="mt-3 block border border-danger/30 bg-red-50 px-3 py-2 text-xs leading-6 text-danger">
                    风险提示：{item.forbiddenHits.join("、")}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {centralThesis ? (
        <div className="border border-lineStrong/60 px-4 py-3 text-sm leading-7 text-inkSoft">
          核心观点：{centralThesis}
        </div>
      ) : null}

      {supplementalViewpoints.length > 0 ? (
        <div className="text-sm leading-7 text-inkSoft">补充观点：{supplementalViewpoints.join("；")}</div>
      ) : null}

      {viewpointIntegration.length > 0 ? (
        <div className="space-y-3">
          {viewpointIntegration.map((item, index) => (
            <div key={`${item.viewpoint || index}`} className="border border-lineStrong/60 px-4 py-3">
              <div className="font-medium text-ink">{item.viewpoint || `补充观点 ${index + 1}`}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                处理方式：{item.actionLabel}；采纳理由：{item.note || "暂无说明"}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {materialBundle.length > 0 ? (
        <div className="space-y-3">
          {materialBundle.map((item, index) => (
            <div key={`${item.title || index}`} className="border border-lineStrong/60 px-4 py-3">
              <div className="font-medium text-ink">{item.title || `素材 ${index + 1}`}</div>
              {item.meta ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.meta}</div> : null}
              {item.summary ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.summary}</div> : null}
              {item.screenshotPath ? <div className="mt-2 text-xs text-inkMuted">截图路径：{item.screenshotPath}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {openingHookOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">开头策略确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {openingHookOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectOpeningHook(item)}
                variant={selectedOpeningHook === item ? "primary" : "secondary"}
                size="sm"
                className="text-sm"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {targetEmotionOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">目标情绪确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {targetEmotionOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectTargetEmotion(item)}
                variant={selectedTargetEmotion === item ? "primary" : "secondary"}
                size="sm"
                className="text-sm"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {researchBackbone ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">研究锚点骨架</div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {researchBackbone.openingTimelineAnchor ? (
              <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">开场历史节点</div>
                <div className="mt-2">{researchBackbone.openingTimelineAnchor}</div>
              </div>
            ) : null}
            {researchBackbone.middleComparisonAnchor ? (
              <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">中段横向比较</div>
                <div className="mt-2">{researchBackbone.middleComparisonAnchor}</div>
              </div>
            ) : null}
            {researchBackbone.coreInsightAnchor ? (
              <div className="border border-warning/20 bg-surface px-3 py-3 text-sm leading-7 text-inkSoft">
                <div className="text-xs uppercase tracking-[0.14em] text-inkMuted">核心交汇洞察</div>
                <div className="mt-2">{researchBackbone.coreInsightAnchor}</div>
              </div>
            ) : null}
          </div>
          {researchBackbone.sequencingNote ? (
            <div className="mt-3 border border-warning/20 bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
              排序理由：{researchBackbone.sequencingNote}
            </div>
          ) : null}
        </div>
      ) : null}

      {outlineSections.length > 0 ? (
        <div className="space-y-3">
          {outlineSections.map((section, index) => (
            <div key={`${section.heading || index}`} className="border border-lineStrong/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium text-ink">{section.heading || `章节 ${index + 1}`}</div>
                {section.researchFocusLabel ? (
                  <span className="border border-warning/30 bg-surfaceWarning px-2 py-1 text-[11px] text-inkSoft">
                    {section.researchFocusLabel}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">目标：{section.goal || "暂无"}</div>
              {section.keyPoints.length > 0 ? (
                <div className="mt-2 text-sm leading-7 text-inkSoft">关键点：{section.keyPoints.join("；")}</div>
              ) : null}
              {section.evidenceHints.length > 0 ? (
                <div className="mt-2 text-sm leading-7 text-inkSoft">证据提示：{section.evidenceHints.join("；")}</div>
              ) : null}
              {section.materialRefs.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-inkMuted">引用素材：{section.materialRefs.join("、")}</div>
              ) : null}
              {section.researchAnchor ? (
                <div className="mt-2 border border-warning/40 bg-surfaceWarning px-3 py-2 text-xs leading-6 text-warning">
                  研究锚点：{section.researchAnchor}
                </div>
              ) : null}
              {section.transition ? <div className="mt-2 text-sm leading-7 text-inkSoft">衔接：{section.transition}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {materialGapHints.length > 0 ? (
        <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          {materialGapHints.join("；")}
        </div>
      ) : null}

      {endingStrategyOptions.length > 0 ? (
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">结尾策略确认</div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {endingStrategyOptions.map((item) => (
              <Button
                key={item}
                type="button"
                onClick={() => onSelectEndingStrategy(item)}
                variant={selectedEndingStrategy === item ? "primary" : "secondary"}
                size="sm"
                className="text-sm"
              >
                {item}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
        <div>已确认标题：{selectionSummary.selectedTitle || "未确认"}</div>
        <div className="mt-1">标题风格：{selectionSummary.selectedTitleStyle || "未确认"}</div>
        <div>已确认开头策略：{selectionSummary.selectedOpeningHook || "未确认"}</div>
        <div className="mt-1">已确认目标情绪：{selectionSummary.selectedTargetEmotion || "未确认"}</div>
        <div className="mt-1">已确认结尾策略：{selectionSummary.selectedEndingStrategy || "未确认"}</div>
      </div>

      <Button
        type="button"
        onClick={onSaveSelection}
        disabled={saveDisabled}
        variant="primary"
      >
        {savingSelection ? "保存中…" : "确认这组大纲选择"}
      </Button>

      {endingStrategyText ? <div className="text-sm leading-7 text-inkSoft">结尾策略：{endingStrategyText}</div> : null}
    </>
  );
}
