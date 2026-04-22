import { buildStrategyCardItem, type StrategyCardItem } from "./article-workspace-client-data";

type ArticleWorkspaceStrategyStateDeps = {
  strategyCard: StrategyCardItem;
  outcomeTargetPackage: string;
  setStrategyCard: (value: StrategyCardItem) => void;
  setOutcomeTargetPackage: (value: string) => void;
  setPublishPreview: (value: null) => void;
  refreshRouter: () => void;
  setStrategyArchetype: (value: StrategyCardItem["archetype"]) => void;
  setStrategyMainstreamBelief: (value: string) => void;
  setStrategyTargetReader: (value: string) => void;
  setStrategyCoreAssertion: (value: string) => void;
  setStrategyWhyNow: (value: string) => void;
  setStrategyResearchHypothesis: (value: string) => void;
  setStrategyMarketPositionInsight: (value: string) => void;
  setStrategyHistoricalTurningPoint: (value: string) => void;
  setStrategyTargetPackage: (value: string) => void;
  setStrategyPublishWindow: (value: string) => void;
  setStrategyEndingAction: (value: string) => void;
  setStrategyFirstHandObservation: (value: string) => void;
  setStrategyFeltMoment: (value: string) => void;
  setStrategyWhyThisHitMe: (value: string) => void;
  setStrategyRealSceneOrDialogue: (value: string) => void;
  setStrategyWantToComplain: (value: string) => void;
  setStrategyNonDelegableTruth: (value: string) => void;
};

export function createArticleWorkspaceStrategyState({
  strategyCard,
  outcomeTargetPackage,
  setStrategyCard,
  setOutcomeTargetPackage,
  setPublishPreview,
  refreshRouter,
  setStrategyArchetype,
  setStrategyMainstreamBelief,
  setStrategyTargetReader,
  setStrategyCoreAssertion,
  setStrategyWhyNow,
  setStrategyResearchHypothesis,
  setStrategyMarketPositionInsight,
  setStrategyHistoricalTurningPoint,
  setStrategyTargetPackage,
  setStrategyPublishWindow,
  setStrategyEndingAction,
  setStrategyFirstHandObservation,
  setStrategyFeltMoment,
  setStrategyWhyThisHitMe,
  setStrategyRealSceneOrDialogue,
  setStrategyWantToComplain,
  setStrategyNonDelegableTruth,
}: ArticleWorkspaceStrategyStateDeps) {
  function hydrateStrategyCardFromApi(savedStrategySource: Partial<StrategyCardItem>) {
    return buildStrategyCardItem({
      base: {
        ...savedStrategySource,
        whyNowHints: strategyCard.whyNowHints,
      },
      archetype: String(savedStrategySource.archetype || ""),
      mainstreamBelief: String(savedStrategySource.mainstreamBelief || ""),
      targetReader: String(savedStrategySource.targetReader || ""),
      coreAssertion: String(savedStrategySource.coreAssertion || ""),
      whyNow: String(savedStrategySource.whyNow || ""),
      researchHypothesis: String(savedStrategySource.researchHypothesis || ""),
      marketPositionInsight: String(savedStrategySource.marketPositionInsight || ""),
      historicalTurningPoint: String(savedStrategySource.historicalTurningPoint || ""),
      targetPackage: String(savedStrategySource.targetPackage || ""),
      publishWindow: String(savedStrategySource.publishWindow || ""),
      endingAction: String(savedStrategySource.endingAction || ""),
      firstHandObservation: String(savedStrategySource.firstHandObservation || ""),
      feltMoment: String(savedStrategySource.feltMoment || ""),
      whyThisHitMe: String(savedStrategySource.whyThisHitMe || ""),
      realSceneOrDialogue: String(savedStrategySource.realSceneOrDialogue || ""),
      wantToComplain: String(savedStrategySource.wantToComplain || ""),
      nonDelegableTruth: String(savedStrategySource.nonDelegableTruth || ""),
      whyNowHints: strategyCard.whyNowHints,
    });
  }

  function syncStrategyCardDraftFields(nextDraft: StrategyCardItem) {
    setStrategyArchetype(nextDraft.archetype ?? null);
    setStrategyMainstreamBelief(nextDraft.mainstreamBelief ?? "");
    setStrategyTargetReader(nextDraft.targetReader ?? "");
    setStrategyCoreAssertion(nextDraft.coreAssertion ?? "");
    setStrategyWhyNow(nextDraft.whyNow ?? "");
    setStrategyResearchHypothesis(nextDraft.researchHypothesis ?? "");
    setStrategyMarketPositionInsight(nextDraft.marketPositionInsight ?? "");
    setStrategyHistoricalTurningPoint(nextDraft.historicalTurningPoint ?? "");
    setStrategyTargetPackage(nextDraft.targetPackage ?? "");
    setStrategyPublishWindow(nextDraft.publishWindow ?? "");
    setStrategyEndingAction(nextDraft.endingAction ?? "");
    setStrategyFirstHandObservation(nextDraft.firstHandObservation ?? "");
    setStrategyFeltMoment(nextDraft.feltMoment ?? "");
    setStrategyWhyThisHitMe(nextDraft.whyThisHitMe ?? "");
    setStrategyRealSceneOrDialogue(nextDraft.realSceneOrDialogue ?? "");
    setStrategyWantToComplain(nextDraft.wantToComplain ?? "");
    setStrategyNonDelegableTruth(nextDraft.nonDelegableTruth ?? "");
  }

  function commitSavedStrategyCard(savedStrategySource: Partial<StrategyCardItem>) {
    const savedStrategyCard = hydrateStrategyCardFromApi(savedStrategySource);
    syncStrategyCardDraftFields(savedStrategyCard);
    setStrategyCard(savedStrategyCard);
    if (!outcomeTargetPackage.trim() && savedStrategyCard.targetPackage) {
      setOutcomeTargetPackage(savedStrategyCard.targetPackage);
    }
    setPublishPreview(null);
    refreshRouter();
    return savedStrategyCard;
  }

  return {
    hydrateStrategyCardFromApi,
    syncStrategyCardDraftFields,
    commitSavedStrategyCard,
  };
}
