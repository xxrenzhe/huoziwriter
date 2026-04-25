import {
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
} from "../../lib/article-workspace-helpers";

export type AudienceSelectionDraft = {
  selectedReaderLabel: string;
  selectedLanguageGuidance: string;
  selectedBackgroundAwareness: string;
  selectedReadabilityLevel: string;
  selectedCallToAction: string;
};

export type OutlineSelectionDraft = {
  selectedTitle: string;
  selectedTitleStyle: string;
  selectedOpeningHook: string;
  selectedTargetEmotion: string;
  selectedEndingStrategy: string;
};

export function getOutlineOpeningOptionText(option: Record<string, unknown> | null | undefined) {
  return String(option?.opening || option?.text || option?.content || option?.value || "").trim();
}

export function getOutlineOpeningOptionPatternLabel(option: Record<string, unknown> | null | undefined) {
  return String(option?.patternLabel || option?.patternCode || option?.label || "").trim();
}

export function getOutlineOpeningOptionQualityCeiling(option: Record<string, unknown> | null | undefined) {
  return String(option?.qualityCeiling || option?.qualityCeilingLabel || "").trim();
}

export function getOutlineOpeningOptionHookScore(option: Record<string, unknown> | null | undefined) {
  const raw =
    typeof option?.hookScore === "number"
      ? option.hookScore
      : typeof option?.hookScore === "string" && option.hookScore.trim()
        ? Number(option.hookScore)
        : 0;
  return Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
}

export type FactCheckClaimDecision = {
  claim: string;
  action: "keep" | "source" | "soften" | "remove" | "mark_opinion";
  note: string;
};

export type FactCheckSelectionDraft = {
  claimDecisions: FactCheckClaimDecision[];
};

export function getAudienceSelectionDraft(payload: Record<string, unknown> | null | undefined): AudienceSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedReaderLabel: String(selection?.selectedReaderLabel || "").trim(),
    selectedLanguageGuidance: String(selection?.selectedLanguageGuidance || "").trim(),
    selectedBackgroundAwareness: String(selection?.selectedBackgroundAwareness || "").trim(),
    selectedReadabilityLevel: String(selection?.selectedReadabilityLevel || "").trim(),
    selectedCallToAction: String(selection?.selectedCallToAction || "").trim(),
  };
}

export function hydrateAudienceSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: AudienceSelectionDraft,
): AudienceSelectionDraft {
  const readerSegments = getPayloadRecordArray(payload, "readerSegments");
  const languageGuidance = getPayloadStringArray(payload, "languageGuidance");
  const backgroundAwarenessOptions = getPayloadStringArray(payload, "backgroundAwarenessOptions");
  const readabilityOptions = getPayloadStringArray(payload, "readabilityOptions");
  const recommendedCallToAction = String(payload?.recommendedCallToAction || "").trim();

  return {
    selectedReaderLabel: draft.selectedReaderLabel || String(readerSegments[0]?.label || "").trim(),
    selectedLanguageGuidance: draft.selectedLanguageGuidance || languageGuidance[0] || "",
    selectedBackgroundAwareness: draft.selectedBackgroundAwareness || backgroundAwarenessOptions[0] || "",
    selectedReadabilityLevel: draft.selectedReadabilityLevel || readabilityOptions[0] || "",
    selectedCallToAction: draft.selectedCallToAction || recommendedCallToAction,
  };
}

export function getOutlineSelectionDraft(payload: Record<string, unknown> | null | undefined): OutlineSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  return {
    selectedTitle: String(selection?.selectedTitle || "").trim(),
    selectedTitleStyle: String(selection?.selectedTitleStyle || "").trim(),
    selectedOpeningHook: String(selection?.selectedOpeningHook || "").trim(),
    selectedTargetEmotion: String(selection?.selectedTargetEmotion || "").trim(),
    selectedEndingStrategy: String(selection?.selectedEndingStrategy || "").trim(),
  };
}

export function hydrateOutlineSelectionDraft(
  payload: Record<string, unknown> | null | undefined,
  draft: OutlineSelectionDraft,
): OutlineSelectionDraft {
  const titleOptions = getPayloadRecordArray(payload, "titleOptions");
  const openingOptions = getPayloadRecordArray(payload, "openingOptions");
  const workingTitle = String(payload?.workingTitle || "").trim();
  const selectedTitleOption = titleOptions.find(
    (item) => String(item.title || "").trim() === draft.selectedTitle,
  );
  const recommendedOpeningOption =
    openingOptions.find((item) => Boolean(item.isRecommended) && getOutlineOpeningOptionText(item))
    ?? openingOptions.find((item) => getOutlineOpeningOptionText(item))
    ?? null;
  const openingHook = String(payload?.openingHook || "").trim();
  const openingHookOptions = getPayloadStringArray(payload, "openingHookOptions");
  const targetEmotion = String(payload?.targetEmotion || "").trim();
  const targetEmotionOptions = getPayloadStringArray(payload, "targetEmotionOptions");
  const endingStrategy = String(payload?.endingStrategy || "").trim();
  const endingStrategyOptions = getPayloadStringArray(payload, "endingStrategyOptions");

  return {
    selectedTitle: draft.selectedTitle || String(titleOptions[0]?.title || "").trim() || workingTitle,
    selectedTitleStyle:
      draft.selectedTitleStyle
      || String(selectedTitleOption?.styleLabel || "").trim()
      || String(titleOptions[0]?.styleLabel || "").trim(),
    selectedOpeningHook: draft.selectedOpeningHook || getOutlineOpeningOptionText(recommendedOpeningOption) || openingHook || openingHookOptions[0] || "",
    selectedTargetEmotion: draft.selectedTargetEmotion || targetEmotion || targetEmotionOptions[0] || "",
    selectedEndingStrategy: draft.selectedEndingStrategy || endingStrategy || endingStrategyOptions[0] || "",
  };
}

function getDefaultFactCheckAction(status: string): FactCheckClaimDecision["action"] {
  if (status === "needs_source") return "source";
  if (status === "risky") return "soften";
  if (status === "opinion") return "mark_opinion";
  return "keep";
}

export function getFactCheckSelectionDraft(payload: Record<string, unknown> | null | undefined): FactCheckSelectionDraft {
  const selection = getPayloadRecord(payload, "selection");
  const existingDecisions = Array.isArray(selection?.claimDecisions)
    ? selection.claimDecisions
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
          claim: String(item.claim || "").trim(),
          action: String(item.action || "").trim() as FactCheckClaimDecision["action"],
          note: String(item.note || "").trim(),
        }))
        .filter((item) => item.claim)
    : [];
  const existingMap = new Map(existingDecisions.map((item) => [item.claim, item]));
  const checks = getPayloadRecordArray(payload, "checks");
  const claimDecisions = checks
    .map((item) => {
      const claim = String(item.claim || "").trim();
      if (!claim) {
        return null;
      }
      const status = String(item.status || "").trim();
      const existing = existingMap.get(claim);
      return {
        claim,
        action: existing?.action || getDefaultFactCheckAction(status),
        note: existing?.note || "",
      } satisfies FactCheckClaimDecision;
    })
    .filter(Boolean) as FactCheckClaimDecision[];
  return { claimDecisions };
}

export function getFactCheckDecision(
  draft: FactCheckSelectionDraft,
  claim: string,
  status: string,
): FactCheckClaimDecision {
  const normalizedClaim = String(claim || "").trim();
  return (
    draft.claimDecisions.find((item) => item.claim === normalizedClaim) ?? {
      claim: normalizedClaim,
      action: getDefaultFactCheckAction(status),
      note: "",
    }
  );
}

export function getFactCheckActionOptions(status: string) {
  if (status === "needs_source") {
    return [
      { value: "source", label: "补来源锚点" },
      { value: "soften", label: "改判断语气" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "risky") {
    return [
      { value: "soften", label: "保守改写" },
      { value: "remove", label: "删除该表述" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  if (status === "opinion") {
    return [
      { value: "mark_opinion", label: "明确为观点" },
      { value: "keep", label: "保持原样" },
    ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
  }
  return [
    { value: "keep", label: "保持原样" },
    { value: "source", label: "补来源锚点" },
  ] as Array<{ value: FactCheckClaimDecision["action"]; label: string }>;
}
