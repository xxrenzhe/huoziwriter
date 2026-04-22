type DeepWritingHistoryPlan = {
  title: string;
  useWhen: string;
  bridgeSentence: string;
};

type DeepWritingChecklistPanelProps = {
  mustUseFacts: string[];
  voiceChecklist: string[];
  bannedWatchlist: string[];
  finalChecklist: string[];
  historyPlans: DeepWritingHistoryPlan[];
};

export function DeepWritingChecklistPanel({
  mustUseFacts,
  voiceChecklist,
  bannedWatchlist,
  finalChecklist,
  historyPlans,
}: DeepWritingChecklistPanelProps) {
  return (
    <>
      {mustUseFacts.length > 0 ? (
        <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">必须吃透的事实</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkSoft">
            {mustUseFacts.map((item) => (
              <span key={item} className="border border-lineStrong bg-surface px-3 py-2">{item}</span>
            ))}
          </div>
        </div>
      ) : null}

      {(voiceChecklist.length > 0 || bannedWatchlist.length > 0 || finalChecklist.length > 0) ? (
        <div className="grid gap-3 md:grid-cols-3">
          {voiceChecklist.length > 0 ? (
            <div className="border border-lineStrong/60 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">表达约束</div>
              <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                {voiceChecklist.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            </div>
          ) : null}
          {bannedWatchlist.length > 0 ? (
            <div className="border border-lineStrong/60 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">重点避开</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-inkSoft">
                {bannedWatchlist.map((item) => (
                  <span key={item} className="border border-danger/30 bg-surface px-3 py-2 text-danger">{item}</span>
                ))}
              </div>
            </div>
          ) : null}
          {finalChecklist.length > 0 ? (
            <div className="border border-lineStrong/60 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">终稿自检</div>
              <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                {finalChecklist.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {historyPlans.length > 0 ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">旧文自然引用计划</div>
          <div className="mt-2 space-y-3 text-sm leading-7 text-inkSoft">
            {historyPlans.map((item, index) => (
              <div key={`${item.title || index}`}>
                <div className="font-medium text-ink">《{item.title || `旧文 ${index + 1}`}》</div>
                {item.useWhen ? <div>使用时机：{item.useWhen}</div> : null}
                {item.bridgeSentence ? <div>桥接句：{item.bridgeSentence}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
