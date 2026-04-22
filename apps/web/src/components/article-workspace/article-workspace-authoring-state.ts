import { buildBlankSlateInspirationCards, getAuthoringBlankSlateCopy, getDraftStarterOptions, type AuthoringPhaseCode } from "./authoring-phase";
import type { ArticleFragmentItem } from "./article-workspace-client-data";

type BuildAuthoringUiStateInput = {
  phaseCode: AuthoringPhaseCode;
  currentStepTitle: string;
  articleId: number;
  title: string;
  fragmentPool: ArticleFragmentItem[];
  isFocusMode: boolean;
  liveLanguageGuardHitsCount: number;
};

export function buildAuthoringUiState({
  phaseCode,
  currentStepTitle,
  articleId,
  title,
  fragmentPool,
  isFocusMode,
  liveLanguageGuardHitsCount,
}: BuildAuthoringUiStateInput) {
  const draftStarterOptions = getDraftStarterOptions(phaseCode, title);
  const draftBlankSlate = getAuthoringBlankSlateCopy({
    phase: phaseCode,
    surface: "paper",
    stepTitle: currentStepTitle,
  });
  const draftBlankSlateInspirations = buildBlankSlateInspirationCards({
    fragments: fragmentPool,
    phase: phaseCode,
    articleId,
    title,
  });
  const workspaceBlankSlate = getAuthoringBlankSlateCopy({
    phase: phaseCode,
    surface: "workspace",
    stepTitle: currentStepTitle,
  });
  const reviewBlankSlate = getAuthoringBlankSlateCopy({
    phase: phaseCode,
    surface: "review",
    stepTitle: currentStepTitle,
  });
  const knowledgeBlankSlate = getAuthoringBlankSlateCopy({
    phase: phaseCode,
    surface: "knowledge",
    stepTitle: currentStepTitle,
  });

  const isCollectPhase = phaseCode === "collect";
  const isThinkPhase = phaseCode === "think";
  const isWritePhase = phaseCode === "write";
  const isPolishPhase = phaseCode === "polish";
  const showLeftWorkspaceRail = !isFocusMode && (isCollectPhase || isThinkPhase);
  const showResearchChecklistRail = isCollectPhase || isThinkPhase;
  const showKnowledgeCardsRail = isCollectPhase || isThinkPhase;
  const showLanguageGuardRail = isWritePhase || isPolishPhase;
  const showVisualEngineRail = isCollectPhase || isThinkPhase || isWritePhase;
  const showDeliveryRail = isPolishPhase;
  const showCompactSixStepRail = !showResearchChecklistRail;
  const showMobileInspectorEntry =
    !isFocusMode
    && (showCompactSixStepRail || !showLeftWorkspaceRail || showKnowledgeCardsRail || showLanguageGuardRail || showVisualEngineRail);

  const currentAuthoringPhaseHint =
    phaseCode === "collect"
      ? "先把研究、素材和证据挂齐，再考虑漂亮句子。"
      : phaseCode === "think"
        ? "这一段只看论点、读者和结构，减少正文噪音。"
        : phaseCode === "write"
          ? "进入写作后，优先留在稿纸和节奏图里，不必频繁切预览。"
          : liveLanguageGuardHitsCount > 0
            ? `当前还命中 ${liveLanguageGuardHitsCount} 条语言守卫，先清红笔，再看微信预览。`
            : "正文已进入收口区，先用红笔检查，再用微信预览确认最终体感。";

  return {
    draftStarterOptions,
    draftBlankSlate,
    draftBlankSlateInspirations,
    workspaceBlankSlate,
    reviewBlankSlate,
    knowledgeBlankSlate,
    isCollectPhase,
    isThinkPhase,
    isWritePhase,
    isPolishPhase,
    showLeftWorkspaceRail,
    showResearchChecklistRail,
    showKnowledgeCardsRail,
    showLanguageGuardRail,
    showVisualEngineRail,
    showDeliveryRail,
    showCompactSixStepRail,
    showMobileInspectorEntry,
    currentAuthoringPhaseHint,
  };
}
