import { Button, Textarea } from "@huoziwriter/ui";

type SelectedHistoryReference = {
  referencedArticleId: number;
  title: string;
  relationReason: string;
  bridgeSentence: string;
};

type HistoryReferenceSuggestion = {
  referencedArticleId: number;
  title: string;
  seriesLabel: string;
  relationReason: string;
  consistencyHint: string;
  bridgeSentence: string;
  selected: boolean;
  selectionDisabled: boolean;
};

type DeepWritingHistoryReferencePanelProps = {
  canUseHistoryReferences: boolean;
  unavailableMessage: string;
  loadingSuggestions: boolean;
  savingSelection: boolean;
  onRefreshSuggestions: () => void;
  selectedReferences: SelectedHistoryReference[];
  onRemoveReference: (referencedArticleId: number) => void;
  onChangeRelationReason: (referencedArticleId: number, value: string) => void;
  onChangeBridgeSentence: (referencedArticleId: number, value: string) => void;
  onSaveSelection: () => void;
  suggestions: HistoryReferenceSuggestion[];
  onToggleSuggestion: (referencedArticleId: number) => void;
};

export function DeepWritingHistoryReferencePanel({
  canUseHistoryReferences,
  unavailableMessage,
  loadingSuggestions,
  savingSelection,
  onRefreshSuggestions,
  selectedReferences,
  onRemoveReference,
  onChangeRelationReason,
  onChangeBridgeSentence,
  onSaveSelection,
  suggestions,
  onToggleSuggestion,
}: DeepWritingHistoryReferencePanelProps) {
  if (!canUseHistoryReferences) {
    return (
      <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
        {unavailableMessage}
      </div>
    );
  }

  return (
    <div className="border border-lineStrong bg-surface px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">历史文章自然引用</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">建议优先引用与你当前主题连续、判断互补的旧文。引用只作为自然上下文回带，不喧宾夺主。</div>
        </div>
        <Button
          type="button"
          onClick={onRefreshSuggestions}
          disabled={loadingSuggestions || savingSelection}
          variant="secondary"
          size="sm"
        >
          {loadingSuggestions ? "刷新中…" : "刷新建议"}
        </Button>
      </div>

      {selectedReferences.length > 0 ? (
        <div className="mt-4 space-y-3">
          {selectedReferences.map((item) => (
            <div key={item.referencedArticleId} className="border border-warning/30 bg-surfaceWarning px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-ink">《{item.title}》</div>
                <Button
                  type="button"
                  onClick={() => onRemoveReference(item.referencedArticleId)}
                  variant="link"
                  size="sm"
                  className="min-h-0 text-xs text-inkMuted hover:text-ink"
                >
                  移除
                </Button>
              </div>
              <Textarea
                aria-label="这篇旧文和当前文章的关系，例如：之前谈过供给端，这次补需求端。"
                value={item.relationReason}
                onChange={(event) => onChangeRelationReason(item.referencedArticleId, event.target.value)}
                placeholder="这篇旧文和当前文章的关系，例如：之前谈过供给端，这次补需求端。"
                className="mt-3 min-h-[72px] px-3 py-2"
              />
              <Textarea
                aria-label="可选：给 AI 一个更自然的衔接句"
                value={item.bridgeSentence}
                onChange={(event) => onChangeBridgeSentence(item.referencedArticleId, event.target.value)}
                placeholder="可选：给 AI 一个更自然的衔接句"
                className="mt-3 min-h-[72px] px-3 py-2"
              />
            </div>
          ))}
          <Button
            type="button"
            onClick={onSaveSelection}
            disabled={savingSelection}
            variant="secondary"
            className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
          >
            {savingSelection ? "保存中…" : "保存自然引用设置"}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {loadingSuggestions ? (
          <div className="text-sm text-inkMuted">正在加载历史文章建议…</div>
        ) : suggestions.length > 0 ? (
          suggestions.map((item) => (
            <div key={item.referencedArticleId} className="border border-lineStrong/60 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-ink">《{item.title}》</div>
                  {item.seriesLabel ? <div className="mt-1 text-xs text-inkMuted">{item.seriesLabel}</div> : null}
                </div>
                <Button
                  type="button"
                  onClick={() => onToggleSuggestion(item.referencedArticleId)}
                  disabled={item.selectionDisabled}
                  variant={item.selected ? "primary" : "secondary"}
                  size="sm"
                >
                  {item.selected ? "已选中" : "加入引用"}
                </Button>
              </div>
              {item.relationReason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{item.relationReason}</div> : null}
              {item.consistencyHint ? <div className="mt-2 text-xs leading-6 text-warning">{item.consistencyHint}</div> : null}
              {item.bridgeSentence ? <div className="mt-2 text-xs leading-6 text-inkMuted">桥接句建议：{item.bridgeSentence}</div> : null}
            </div>
          ))
        ) : (
          <div className="border border-dashed border-lineStrong px-4 py-4 text-sm leading-7 text-inkMuted">
            当前没有可用的已发布旧文建议。先发布过往文章后，这里才会出现自然回带候选。
          </div>
        )}
      </div>
    </div>
  );
}
