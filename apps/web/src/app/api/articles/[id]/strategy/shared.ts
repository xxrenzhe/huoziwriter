import type { ArticleStrategyCard } from "@/lib/repositories";

export type StrategyCardPatch = {
  archetype?: "opinion" | "case" | "howto" | "hotTake" | "phenomenon" | null;
  mainstreamBelief?: string | null;
  targetReader?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
  researchHypothesis?: string | null;
  marketPositionInsight?: string | null;
  historicalTurningPoint?: string | null;
  targetPackage?: string | null;
  publishWindow?: string | null;
  endingAction?: string | null;
  firstHandObservation?: string | null;
  feltMoment?: string | null;
  whyThisHitMe?: string | null;
  realSceneOrDialogue?: string | null;
  wantToComplain?: string | null;
  nonDelegableTruth?: string | null;
};

function normalizeString(value: unknown) {
  return String(value || "").trim();
}

export function parseStrategyCardPatch(body: unknown): StrategyCardPatch {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return {
    archetype:
      source.archetype === "opinion" || source.archetype === "case" || source.archetype === "howto" || source.archetype === "hotTake" || source.archetype === "phenomenon"
        ? source.archetype
        : source.archetype === null
          ? null
          : undefined,
    mainstreamBelief: source.mainstreamBelief === undefined ? undefined : normalizeString(source.mainstreamBelief) || null,
    targetReader: source.targetReader === undefined ? undefined : normalizeString(source.targetReader) || null,
    coreAssertion: source.coreAssertion === undefined ? undefined : normalizeString(source.coreAssertion) || null,
    whyNow: source.whyNow === undefined ? undefined : normalizeString(source.whyNow) || null,
    researchHypothesis: source.researchHypothesis === undefined ? undefined : normalizeString(source.researchHypothesis) || null,
    marketPositionInsight: source.marketPositionInsight === undefined ? undefined : normalizeString(source.marketPositionInsight) || null,
    historicalTurningPoint: source.historicalTurningPoint === undefined ? undefined : normalizeString(source.historicalTurningPoint) || null,
    targetPackage: source.targetPackage === undefined ? undefined : normalizeString(source.targetPackage) || null,
    publishWindow: source.publishWindow === undefined ? undefined : normalizeString(source.publishWindow) || null,
    endingAction: source.endingAction === undefined ? undefined : normalizeString(source.endingAction) || null,
    firstHandObservation: source.firstHandObservation === undefined ? undefined : normalizeString(source.firstHandObservation) || null,
    feltMoment: source.feltMoment === undefined ? undefined : normalizeString(source.feltMoment) || null,
    whyThisHitMe: source.whyThisHitMe === undefined ? undefined : normalizeString(source.whyThisHitMe) || null,
    realSceneOrDialogue: source.realSceneOrDialogue === undefined ? undefined : normalizeString(source.realSceneOrDialogue) || null,
    wantToComplain: source.wantToComplain === undefined ? undefined : normalizeString(source.wantToComplain) || null,
    nonDelegableTruth: source.nonDelegableTruth === undefined ? undefined : normalizeString(source.nonDelegableTruth) || null,
  };
}

export function mergeStrategyCardPatch(current: ArticleStrategyCard | null, patch: StrategyCardPatch) {
  return {
    archetype: patch.archetype !== undefined ? patch.archetype : current?.archetype ?? null,
    mainstreamBelief: patch.mainstreamBelief !== undefined ? patch.mainstreamBelief : current?.mainstreamBelief ?? null,
    targetReader: patch.targetReader !== undefined ? patch.targetReader : current?.targetReader ?? null,
    coreAssertion: patch.coreAssertion !== undefined ? patch.coreAssertion : current?.coreAssertion ?? null,
    whyNow: patch.whyNow !== undefined ? patch.whyNow : current?.whyNow ?? null,
    researchHypothesis: patch.researchHypothesis !== undefined ? patch.researchHypothesis : current?.researchHypothesis ?? null,
    marketPositionInsight: patch.marketPositionInsight !== undefined ? patch.marketPositionInsight : current?.marketPositionInsight ?? null,
    historicalTurningPoint: patch.historicalTurningPoint !== undefined ? patch.historicalTurningPoint : current?.historicalTurningPoint ?? null,
    targetPackage: patch.targetPackage !== undefined ? patch.targetPackage : current?.targetPackage ?? null,
    publishWindow: patch.publishWindow !== undefined ? patch.publishWindow : current?.publishWindow ?? null,
    endingAction: patch.endingAction !== undefined ? patch.endingAction : current?.endingAction ?? null,
    firstHandObservation: patch.firstHandObservation !== undefined ? patch.firstHandObservation : current?.firstHandObservation ?? null,
    feltMoment: patch.feltMoment !== undefined ? patch.feltMoment : current?.feltMoment ?? null,
    whyThisHitMe: patch.whyThisHitMe !== undefined ? patch.whyThisHitMe : current?.whyThisHitMe ?? null,
    realSceneOrDialogue: patch.realSceneOrDialogue !== undefined ? patch.realSceneOrDialogue : current?.realSceneOrDialogue ?? null,
    wantToComplain: patch.wantToComplain !== undefined ? patch.wantToComplain : current?.wantToComplain ?? null,
    nonDelegableTruth: patch.nonDelegableTruth !== undefined ? patch.nonDelegableTruth : current?.nonDelegableTruth ?? null,
  };
}
