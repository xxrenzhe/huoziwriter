import type { ComponentProps } from "react";
import type { FourPointAuditDimension } from "@/lib/article-strategy";
import { StrategyCardPanel } from "./strategy-card-panel";

type StrategyCardDraftLike = ComponentProps<typeof StrategyCardPanel>["strategyCardDraft"];
type StrategyViewMode = ComponentProps<typeof StrategyCardPanel>["strategyViewMode"];

type StrategySuggestedValues = {
  targetReader: string;
  coreAssertion: string;
  whyNow: string;
  targetPackage: string;
  publishWindow: string;
  endingAction: string;
};

type StrategyWorkspaceSectionProps = {
  strategyCardIsComplete: boolean;
  savedStrategyCardIsComplete: boolean;
  strategyCardHasUnsavedChanges: boolean;
  strategyCardMissingFields: string[];
  strategyViewMode: StrategyViewMode;
  onChangeStrategyViewMode: (mode: StrategyViewMode) => void;
  strategyArchetype: string | null;
  onChangeStrategyArchetype: (value: string | null) => void;
  strategyTargetReader: string;
  onChangeStrategyTargetReader: (value: string) => void;
  strategyCoreAssertion: string;
  onChangeStrategyCoreAssertion: (value: string) => void;
  strategyWhyNow: string;
  onChangeStrategyWhyNow: (value: string) => void;
  strategyTargetPackage: string;
  onChangeStrategyTargetPackage: (value: string) => void;
  strategyPublishWindow: string;
  onChangeStrategyPublishWindow: (value: string) => void;
  strategyEndingAction: string;
  onChangeStrategyEndingAction: (value: string) => void;
  strategySuggestedValues: StrategySuggestedValues;
  strategyMainstreamBelief: string;
  onChangeStrategyMainstreamBelief: (value: string) => void;
  strategyCardDraft: StrategyCardDraftLike;
  savingStrategyCard: boolean;
  auditingStrategyCard: boolean;
  lockingStrategyCard: boolean;
  onRunStrategyAudit: () => void | Promise<unknown>;
  onLockStrategyCard: (force: boolean) => void | Promise<unknown>;
  strategyFourPointDrafts: Record<FourPointAuditDimension, string>;
  onChangeStrategyFourPointDraft: (key: FourPointAuditDimension, value: string) => void;
  reversingStrategyCardDimension: FourPointAuditDimension | null;
  onApplyStrategyFourPointReverseWriteback: (key: FourPointAuditDimension) => void | Promise<unknown>;
  strategyResearchHypothesis: string;
  onChangeStrategyResearchHypothesis: (value: string) => void;
  strategyMarketPositionInsight: string;
  onChangeStrategyMarketPositionInsight: (value: string) => void;
  strategyHistoricalTurningPoint: string;
  onChangeStrategyHistoricalTurningPoint: (value: string) => void;
  strategyFirstHandObservation: string;
  onChangeStrategyFirstHandObservation: (value: string) => void;
  strategyFeltMoment: string;
  onChangeStrategyFeltMoment: (value: string) => void;
  strategyWhyThisHitMe: string;
  onChangeStrategyWhyThisHitMe: (value: string) => void;
  strategyRealSceneOrDialogue: string;
  onChangeStrategyRealSceneOrDialogue: (value: string) => void;
  strategyWantToComplain: string;
  onChangeStrategyWantToComplain: (value: string) => void;
  strategyNonDelegableTruth: string;
  onChangeStrategyNonDelegableTruth: (value: string) => void;
  onAppendWhyNowHint: (value: string) => void;
  onSaveStrategyCard: () => void | Promise<unknown>;
};

export function StrategyWorkspaceSection({
  strategyCardIsComplete,
  savedStrategyCardIsComplete,
  strategyCardHasUnsavedChanges,
  strategyCardMissingFields,
  strategyViewMode,
  onChangeStrategyViewMode,
  strategyArchetype,
  onChangeStrategyArchetype,
  strategyTargetReader,
  onChangeStrategyTargetReader,
  strategyCoreAssertion,
  onChangeStrategyCoreAssertion,
  strategyWhyNow,
  onChangeStrategyWhyNow,
  strategyTargetPackage,
  onChangeStrategyTargetPackage,
  strategyPublishWindow,
  onChangeStrategyPublishWindow,
  strategyEndingAction,
  onChangeStrategyEndingAction,
  strategySuggestedValues,
  strategyMainstreamBelief,
  onChangeStrategyMainstreamBelief,
  strategyCardDraft,
  savingStrategyCard,
  auditingStrategyCard,
  lockingStrategyCard,
  onRunStrategyAudit,
  onLockStrategyCard,
  strategyFourPointDrafts,
  onChangeStrategyFourPointDraft,
  reversingStrategyCardDimension,
  onApplyStrategyFourPointReverseWriteback,
  strategyResearchHypothesis,
  onChangeStrategyResearchHypothesis,
  strategyMarketPositionInsight,
  onChangeStrategyMarketPositionInsight,
  strategyHistoricalTurningPoint,
  onChangeStrategyHistoricalTurningPoint,
  strategyFirstHandObservation,
  onChangeStrategyFirstHandObservation,
  strategyFeltMoment,
  onChangeStrategyFeltMoment,
  strategyWhyThisHitMe,
  onChangeStrategyWhyThisHitMe,
  strategyRealSceneOrDialogue,
  onChangeStrategyRealSceneOrDialogue,
  strategyWantToComplain,
  onChangeStrategyWantToComplain,
  strategyNonDelegableTruth,
  onChangeStrategyNonDelegableTruth,
  onAppendWhyNowHint,
  onSaveStrategyCard,
}: StrategyWorkspaceSectionProps) {
  const strategyStatusTone = !strategyCardIsComplete
    ? "border-danger/30 bg-surface text-danger"
    : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
      ? "border-warning/40 bg-surfaceWarning text-warning"
      : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const strategyStatusText = !strategyCardIsComplete
    ? `还缺 ${strategyCardMissingFields.length} 个必填项`
    : !savedStrategyCardIsComplete || strategyCardHasUnsavedChanges
      ? "已补齐，待确认保存"
      : "已确认保存";
  const strategyFields: ComponentProps<typeof StrategyCardPanel>["strategyFields"] = [
    {
      key: "archetype",
      value: strategyArchetype || "",
      setValue: (value) => onChangeStrategyArchetype(value || null),
      placeholder: "先确定文章原型。",
      suggestion: "",
    },
    {
      key: "targetReader",
      value: strategyTargetReader,
      setValue: onChangeStrategyTargetReader,
      placeholder: "这篇真正写给谁看，别写成泛用户。",
      suggestion: strategySuggestedValues.targetReader,
      multiline: true,
    },
    {
      key: "coreAssertion",
      value: strategyCoreAssertion,
      setValue: onChangeStrategyCoreAssertion,
      placeholder: "这篇文章最想成立的判断是什么。",
      suggestion: strategySuggestedValues.coreAssertion,
      multiline: true,
    },
    {
      key: "whyNow",
      value: strategyWhyNow,
      setValue: onChangeStrategyWhyNow,
      placeholder: "为什么这周值得写，而不是以后再说。",
      suggestion: strategySuggestedValues.whyNow,
      multiline: true,
    },
    {
      key: "targetPackage",
      value: strategyTargetPackage,
      setValue: onChangeStrategyTargetPackage,
      placeholder: "例如：5k / 10w+ / 高转发讨论。",
      suggestion: strategySuggestedValues.targetPackage,
    },
    {
      key: "publishWindow",
      value: strategyPublishWindow,
      setValue: onChangeStrategyPublishWindow,
      placeholder: "例如：周二早高峰 / 财报发布后 24 小时内。",
      suggestion: strategySuggestedValues.publishWindow,
    },
    {
      key: "endingAction",
      value: strategyEndingAction,
      setValue: onChangeStrategyEndingAction,
      placeholder: "希望读者读完后采取什么动作。",
      suggestion: strategySuggestedValues.endingAction,
      multiline: true,
    },
  ];
  const strategyResearchFields: ComponentProps<typeof StrategyCardPanel>["strategyResearchFields"] = [
    {
      key: "researchHypothesis",
      label: "研究假设",
      value: strategyResearchHypothesis,
      setValue: onChangeStrategyResearchHypothesis,
      placeholder: "这篇判断在研究层最需要验证的假设，不要直接写成已证实结论。",
    },
    {
      key: "marketPositionInsight",
      label: "位置洞察",
      value: strategyMarketPositionInsight,
      setValue: onChangeStrategyMarketPositionInsight,
      placeholder: "真正决定差异的位置、组织能力或用户结构判断。",
    },
    {
      key: "historicalTurningPoint",
      label: "历史转折点",
      value: strategyHistoricalTurningPoint,
      setValue: onChangeStrategyHistoricalTurningPoint,
      placeholder: "最适合开场、也最能解释今天处境的那个历史节点。",
    },
  ];
  const humanSignalFields: ComponentProps<typeof StrategyCardPanel>["humanSignalFields"] = [
    {
      key: "firstHandObservation",
      value: strategyFirstHandObservation,
      setValue: onChangeStrategyFirstHandObservation,
      placeholder: "这篇里你亲眼看到、亲手试过或亲自经历的具体观察。",
    },
    {
      key: "feltMoment",
      value: strategyFeltMoment,
      setValue: onChangeStrategyFeltMoment,
      placeholder: "哪个瞬间最有体感，比如愣住、上头、别扭、兴奋。",
    },
    {
      key: "whyThisHitMe",
      value: strategyWhyThisHitMe,
      setValue: onChangeStrategyWhyThisHitMe,
      placeholder: "为什么这件事会打到你，而不是只是一条信息。",
    },
    {
      key: "realSceneOrDialogue",
      value: strategyRealSceneOrDialogue,
      setValue: onChangeStrategyRealSceneOrDialogue,
      placeholder: "一个真实场景、原话或你记得的细节片段。",
    },
    {
      key: "wantToComplain",
      value: strategyWantToComplain,
      setValue: onChangeStrategyWantToComplain,
      placeholder: "这篇里你最想吐槽、反驳或拆掉的点。",
    },
    {
      key: "nonDelegableTruth",
      value: strategyNonDelegableTruth,
      setValue: onChangeStrategyNonDelegableTruth,
      placeholder: "一条不能交给 AI 编的真话，宁可不漂亮也要真。",
    },
  ];
  const humanSignalTone = strategyCardDraft.humanSignalScore >= 3
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : strategyCardDraft.humanSignalScore >= 2
      ? "border-warning/40 bg-surfaceWarning text-warning"
      : "border-danger/30 bg-surface text-danger";

  return (
    <StrategyCardPanel
      strategyStatusTone={strategyStatusTone}
      strategyStatusText={strategyStatusText}
      strategyCardIsComplete={strategyCardIsComplete}
      savedStrategyCardIsComplete={savedStrategyCardIsComplete}
      strategyCardHasUnsavedChanges={strategyCardHasUnsavedChanges}
      strategyCardMissingFields={strategyCardMissingFields}
      strategyViewMode={strategyViewMode}
      onChangeStrategyViewMode={onChangeStrategyViewMode}
      strategyFields={strategyFields}
      strategyMainstreamBelief={strategyMainstreamBelief}
      onChangeStrategyMainstreamBelief={onChangeStrategyMainstreamBelief}
      strategyCardDraft={strategyCardDraft}
      savingStrategyCard={savingStrategyCard}
      auditingStrategyCard={auditingStrategyCard}
      lockingStrategyCard={lockingStrategyCard}
      onRunStrategyAudit={() => void onRunStrategyAudit()}
      onLockStrategyCard={(force) => void onLockStrategyCard(force)}
      strategyFourPointDrafts={strategyFourPointDrafts}
      onChangeStrategyFourPointDraft={(key, value) => onChangeStrategyFourPointDraft(key as FourPointAuditDimension, value)}
      reversingStrategyCardDimension={reversingStrategyCardDimension}
      onApplyStrategyFourPointReverseWriteback={(key) => void onApplyStrategyFourPointReverseWriteback(key as FourPointAuditDimension)}
      strategyResearchFields={strategyResearchFields}
      humanSignalTone={humanSignalTone}
      humanSignalFields={humanSignalFields}
      onAppendWhyNowHint={onAppendWhyNowHint}
      onSaveStrategyCard={() => void onSaveStrategyCard()}
    />
  );
}
