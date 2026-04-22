type DeepWritingExecutionOverviewCard = {
  eyebrow: string;
  title: string;
  body: string;
  hint: string;
  tone?: "default" | "warning";
};

type DeepWritingPatternCard = {
  label: string;
  value: string;
};

type DeepWritingResearchCard = {
  label: string;
  value: string;
};

type DeepWritingProgressiveRevealStep = {
  label: string;
  instruction: string;
};

type DeepWritingStateCandidate = {
  prefix: string;
  label: string;
  suitableWhen: string;
  triggerReason: string;
};

type DeepWritingSectionCard = {
  heading: string;
  revealRole: string;
  goal: string;
  paragraphMission: string;
  evidenceHints: string[];
  transition: string;
};

type DeepWritingExecutionCardPanelProps = {
  title: string;
  updatedAtLabel: string;
  providerLabel: string;
  summary: string;
  overviewCards: DeepWritingExecutionOverviewCard[];
  centralThesis: string;
  targetEmotion: string;
  patternCards: DeepWritingPatternCard[];
  evidenceMode: string;
  researchCards: DeepWritingResearchCard[];
  progressiveReveal: {
    label: string;
    reason: string;
    climaxPlacement: string;
    escalationRule: string;
    steps: DeepWritingProgressiveRevealStep[];
  } | null;
  stateChecklist: string[];
  stateCandidates: DeepWritingStateCandidate[];
  sections: DeepWritingSectionCard[];
  errorMessage: string;
};

export function DeepWritingExecutionCardPanel({
  title,
  updatedAtLabel,
  providerLabel,
  summary,
  overviewCards,
  centralThesis,
  targetEmotion,
  patternCards,
  evidenceMode,
  researchCards,
  progressiveReveal,
  stateChecklist,
  stateCandidates,
  sections,
  errorMessage,
}: DeepWritingExecutionCardPanelProps) {
  return (
    <div className="space-y-4 border border-lineStrong bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-serifCn text-2xl text-ink text-balance">{title}</div>
          <div className="mt-1 text-xs text-inkMuted">{updatedAtLabel || "暂无更新时间"}</div>
        </div>
        <div className="text-xs text-inkMuted">{providerLabel || "local"}</div>
      </div>

      {summary ? (
        <div className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
          {summary}
        </div>
      ) : null}

      {overviewCards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {overviewCards.map((card, index) => (
            <div
              key={`${card.eyebrow}-${card.title || index}`}
              className={`border px-4 py-3 text-sm leading-7 ${
                card.tone === "warning"
                  ? "border-warning/30 bg-surfaceWarning text-inkSoft"
                  : "border-lineStrong/60 text-inkSoft"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">{card.eyebrow}</div>
              <div className="mt-2 font-medium text-ink">{card.title}</div>
              {card.body ? <div className="mt-2">{card.body}</div> : null}
              {card.hint ? <div className="mt-2 text-xs leading-6 text-inkMuted">{card.hint}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {centralThesis ? <div className="text-sm leading-7 text-inkSoft">核心观点：{centralThesis}</div> : null}
      {targetEmotion ? <div className="text-sm leading-7 text-inkSoft">目标情绪：{targetEmotion}</div> : null}

      {patternCards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {patternCards.map((card) => (
            <div key={card.label} className="border border-lineStrong/60 bg-paperStrong px-4 py-3 text-sm leading-7 text-inkSoft">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">{card.label}</div>
              <div className="mt-2 text-ink">{card.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {evidenceMode ? <div className="text-sm leading-7 text-inkSoft">证据组织：{evidenceMode}</div> : null}

      {researchCards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {researchCards.map((card) => (
            <div key={card.label} className="border border-warning/30 bg-surfaceWarning px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">{card.label}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{card.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {progressiveReveal ? (
        <div className="border border-warning/30 bg-surfaceWarning px-4 py-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">节奏插件</div>
          {progressiveReveal.label ? <div className="mt-2 font-medium text-ink">{progressiveReveal.label}</div> : null}
          {progressiveReveal.reason ? <div className="mt-2 text-sm leading-7 text-inkSoft">{progressiveReveal.reason}</div> : null}
          {progressiveReveal.climaxPlacement ? (
            <div className="mt-2 text-xs leading-6 text-inkMuted">高潮位置：{progressiveReveal.climaxPlacement}</div>
          ) : null}
          {progressiveReveal.escalationRule ? (
            <div className="mt-1 text-xs leading-6 text-inkMuted">升番规则：{progressiveReveal.escalationRule}</div>
          ) : null}
          {progressiveReveal.steps.length > 0 ? (
            <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
              {progressiveReveal.steps.map((item, index) => (
                <div key={`${item.label || index}`}>
                  <span className="font-medium text-ink">{item.label || `步骤 ${index + 1}`}</span>
                  <span>：{item.instruction}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {(stateChecklist.length > 0 || stateCandidates.length > 0) ? (
        <div className="grid gap-3 md:grid-cols-2">
          {stateChecklist.length > 0 ? (
            <div className="border border-lineStrong/60 bg-paperStrong px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">状态自检</div>
              <div className="mt-2 space-y-2 text-sm leading-7 text-inkSoft">
                {stateChecklist.map((item) => (
                  <div key={item}>- {item}</div>
                ))}
              </div>
            </div>
          ) : null}
          {stateCandidates.length > 0 ? (
            <div className="border border-lineStrong/60 bg-surface px-4 py-4">
              <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">状态候选</div>
              <div className="mt-2 space-y-3 text-sm leading-7 text-inkSoft">
                {stateCandidates.map((item, index) => (
                  <div key={`${item.label || index}`}>
                    <div className="font-medium text-ink">{item.prefix}{item.label}</div>
                    {item.suitableWhen ? <div className="text-xs leading-6 text-inkMuted">适用：{item.suitableWhen}</div> : null}
                    {item.triggerReason ? <div className="text-xs leading-6 text-inkMuted">触发：{item.triggerReason}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {sections.length > 0 ? (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <div key={`${section.heading || index}`} className="border border-lineStrong/60 px-4 py-4">
              <div className="font-medium text-ink">{index + 1}. {section.heading || `章节 ${index + 1}`}</div>
              {section.revealRole ? (
                <div className="mt-2 inline-flex border border-warning/30 bg-surfaceWarning px-2 py-1 text-xs text-inkSoft">
                  节奏角色：{section.revealRole}
                </div>
              ) : null}
              {section.goal ? <div className="mt-2 text-sm leading-7 text-inkSoft">目标：{section.goal}</div> : null}
              {section.paragraphMission ? <div className="mt-1 text-sm leading-7 text-inkSoft">段落任务：{section.paragraphMission}</div> : null}
              {section.evidenceHints.length > 0 ? (
                <div className="mt-2 text-xs leading-6 text-inkMuted">证据提示：{section.evidenceHints.join("；")}</div>
              ) : null}
              {section.transition ? <div className="mt-1 text-xs leading-6 text-inkMuted">衔接：{section.transition}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          本次结果使用了降级产物：{errorMessage}
        </div>
      ) : null}
    </div>
  );
}
