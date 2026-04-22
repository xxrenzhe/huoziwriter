import type { ImageAuthoringStyleContext } from "@/lib/image-authoring-context";
import { buildNodeVisualSuggestion } from "@/lib/image-prompting";
import { GENERATABLE_STAGE_ACTIONS } from "./authoring-phase";
import { buildAuthoringUiState } from "./article-workspace-authoring-state";
import { extractPlainText, type ArticleFragmentItem, type OutlineMaterialNodeItem, type StageArtifactItem } from "./article-workspace-client-data";
import {
  buildArticleMainSteps,
  buildAuthoringPhases,
  buildEditorStageChecklist,
  buildPlanCapabilityHints,
  type EditorStageChecklistItem,
  getWorkspaceGridClass,
} from "./article-workspace-shell-state";

type CurrentArticleMainStepInput = {
  code: string;
  title: string;
};

type CurrentStageInput = {
  code: string;
} | null;

type SelectedConnectionInput = {
  status: string;
} | null;

type EvidenceStatsInput = {
  ready: boolean;
  flags: string[];
};

type OutlineMaterialReadinessInput = {
  status: string;
  detail: string;
  flags: string[];
};

type CoverImageQuotaInput = {
  used: number;
  limit: number | null;
};

type ImageAssetQuotaInput = {
  remainingBytes: number;
  reservedGenerationBytes: number;
};

type BuildArticleWorkspaceShellDerivedStateInput = {
  article: { id: number; title: string };
  title: string;
  markdown: string;
  htmlPreview: string;
  currentArticleMainStep: CurrentArticleMainStepInput;
  workflowCurrentStageCode: string;
  currentStage: CurrentStageInput;
  outlineArtifact: StageArtifactItem | null;
  deepWritingArtifact: StageArtifactItem | null;
  researchArtifact: StageArtifactItem | null;
  selectedConnection: SelectedConnectionInput;
  canPublishToWechat: boolean;
  canUseHistoryReferences: boolean;
  canGenerateCoverImage: boolean;
  canUseCoverImageReference: boolean;
  canExportPdf: boolean;
  displayPlanName: string;
  coverImage: unknown | null;
  coverImageQuota: CoverImageQuotaInput;
  imageAssetQuota: ImageAssetQuotaInput;
  generatingCover: boolean;
  titleConfirmedForGuide: boolean;
  researchCoverageSufficiencyForGuide: string;
  researchInsightCountForGuide: number;
  researchTimelineCountForGuide: number;
  researchComparisonCountForGuide: number;
  outlineGapHintsForGuide: string[];
  outlineMaterialReadiness: OutlineMaterialReadinessInput;
  evidenceDraftStats: EvidenceStatsInput;
  savedEvidenceStats: EvidenceStatsInput;
  evidenceHasUnsavedChanges: boolean;
  factCheckReady: boolean;
  prosePolishReady: boolean;
  activeAiNoiseScore: number;
  historyPlanCount: number;
  articleOutcomeMissingWindowCodes: string[];
  currentArticleOutcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
  strategyCardIsComplete: boolean;
  strategyCardHasUnsavedChanges: boolean;
  strategyCardMissingFields: string[];
  savedStrategyCardIsComplete: boolean;
  savedStrategyCardMissingFields: string[];
  liveLanguageGuardHitsCount: number;
  fragmentPool: ArticleFragmentItem[];
  isFocusMode: boolean;
  nodes: OutlineMaterialNodeItem[];
  authoringContext: ImageAuthoringStyleContext | null;
  status: string;
  wechatTemplateId: string | null;
  lastSavedTitle: string;
  lastSavedMarkdown: string;
  lastSavedWechatTemplateId: string | null;
};

function buildResearchGuideHint({
  researchArtifact,
  researchCoverageSufficiencyForGuide,
  researchInsightCountForGuide,
  researchTimelineCountForGuide,
  researchComparisonCountForGuide,
}: Pick<
  BuildArticleWorkspaceShellDerivedStateInput,
  | "researchArtifact"
  | "researchCoverageSufficiencyForGuide"
  | "researchInsightCountForGuide"
  | "researchTimelineCountForGuide"
  | "researchComparisonCountForGuide"
>) {
  if (!researchArtifact?.payload) {
    return "研究简报还没生成，建议先补时间脉络、横向比较和交汇洞察。";
  }
  if (researchCoverageSufficiencyForGuide === "blocked") {
    return "研究简报已生成，但信源覆盖仍不足，当前更像观点草稿，不适合直接写硬判断。";
  }
  if (researchInsightCountForGuide === 0) {
    return "研究简报已有骨架，但还缺交汇洞察，主判断还没有真正被研究层写硬。";
  }
  if (researchTimelineCountForGuide === 0 || researchComparisonCountForGuide === 0) {
    return `研究简报还缺${[
      researchTimelineCountForGuide === 0 ? "时间脉络" : null,
      researchComparisonCountForGuide === 0 ? "横向比较" : null,
    ]
      .filter(Boolean)
      .join("和")}，建议先补齐。`;
  }
  return "";
}

export function buildArticleWorkspaceShellDerivedState({
  article,
  title,
  markdown,
  htmlPreview,
  currentArticleMainStep,
  workflowCurrentStageCode,
  currentStage,
  outlineArtifact,
  deepWritingArtifact,
  researchArtifact,
  selectedConnection,
  canPublishToWechat,
  canUseHistoryReferences,
  canGenerateCoverImage,
  canUseCoverImageReference,
  canExportPdf,
  displayPlanName,
  coverImage,
  coverImageQuota,
  imageAssetQuota,
  generatingCover,
  titleConfirmedForGuide,
  researchCoverageSufficiencyForGuide,
  researchInsightCountForGuide,
  researchTimelineCountForGuide,
  researchComparisonCountForGuide,
  outlineGapHintsForGuide,
  outlineMaterialReadiness,
  evidenceDraftStats,
  savedEvidenceStats,
  evidenceHasUnsavedChanges,
  factCheckReady,
  prosePolishReady,
  activeAiNoiseScore,
  historyPlanCount,
  articleOutcomeMissingWindowCodes,
  currentArticleOutcomeHitStatus,
  strategyCardIsComplete,
  strategyCardHasUnsavedChanges,
  strategyCardMissingFields,
  savedStrategyCardIsComplete,
  savedStrategyCardMissingFields,
  liveLanguageGuardHitsCount,
  fragmentPool,
  isFocusMode,
  nodes,
  authoringContext,
  status,
  wechatTemplateId,
  lastSavedTitle,
  lastSavedMarkdown,
  lastSavedWechatTemplateId,
}: BuildArticleWorkspaceShellDerivedStateInput) {
  const topicReady = Boolean(title.trim() && title.trim() !== "未命名稿件");
  const outlineReady = Boolean(outlineArtifact?.status === "ready" && outlineArtifact?.payload);
  const deepWritingReady = Boolean(deepWritingArtifact?.status === "ready" && deepWritingArtifact?.payload);
  const publishBlockedByConnection = canPublishToWechat && (!selectedConnection || selectedConnection.status !== "valid");
  const publishBlockedByCover = !coverImage;
  const researchGuideHint = buildResearchGuideHint({
    researchArtifact,
    researchCoverageSufficiencyForGuide,
    researchInsightCountForGuide,
    researchTimelineCountForGuide,
    researchComparisonCountForGuide,
  });

  const editorStageChecklist: EditorStageChecklistItem[] = buildEditorStageChecklist({
    strategyCardIsComplete,
    strategyCardHasUnsavedChanges,
    strategyCardMissingFields,
    savedStrategyCardIsComplete,
    savedStrategyCardMissingFields,
    titleConfirmedForGuide,
    researchNeedsAttention: Boolean(researchGuideHint),
    researchGuideHint,
    outlineArtifactReady: outlineReady,
    audienceArtifactReady: topicReady,
    evidenceDraftReady: evidenceDraftStats.ready,
    evidenceDraftFlags: evidenceDraftStats.flags,
    savedEvidenceReady: savedEvidenceStats.ready,
    savedEvidenceFlags: savedEvidenceStats.flags,
    evidenceHasUnsavedChanges,
    outlineMaterialReadinessStatus: outlineMaterialReadiness.status,
    outlineMaterialReadinessDetail: outlineMaterialReadiness.detail,
    outlineMaterialReadinessFlags: outlineMaterialReadiness.flags,
    outlineGapHintsForGuide,
    factCheckReady,
    deepWritingReady,
    prosePolishReady,
    activeAiNoiseScore,
    liveLanguageGuardHitsCount,
    canUseHistoryReferences,
    historyPlanCount,
    canPublishToWechat,
    publishBlockedByCover,
    publishBlockedByConnection,
    status,
    articleOutcomeMissingWindowCodes,
    currentArticleOutcomeHitStatus,
  });

  const articleMainSteps = buildArticleMainSteps(currentArticleMainStep.code, editorStageChecklist);
  const currentArticleMainStepDisplay =
    articleMainSteps.find((step) => step.code === currentArticleMainStep.code) ?? null;
  const { currentAuthoringPhase, authoringPhases } = buildAuthoringPhases(
    articleMainSteps,
    currentArticleMainStep.code,
    workflowCurrentStageCode,
  );
  const hasDraftContent = markdown.trim().length > 0;
  const plainTextPreview = extractPlainText(htmlPreview);
  const hasPreviewContent =
    plainTextPreview.length > 0 || /<(img|blockquote|h[1-6])\b/i.test(String(htmlPreview || ""));
  const currentArticleLabel = title.trim() || article.title || "未命名稿件";
  const authoringUiState = buildAuthoringUiState({
    phaseCode: currentAuthoringPhase.code,
    currentStepTitle: currentArticleMainStep.title,
    articleId: article.id,
    title,
    fragmentPool,
    isFocusMode,
    liveLanguageGuardHitsCount,
  });
  const workspaceGridClass = getWorkspaceGridClass(
    isFocusMode,
    authoringUiState.isWritePhase,
    authoringUiState.isPolishPhase,
  );
  const planCapabilityHints = buildPlanCapabilityHints({
    canUseHistoryReferences,
    canGenerateCoverImage,
    canUseCoverImageReference,
    canPublishToWechat,
    canExportPdf,
    displayPlanName,
  });
  const currentStageAction = currentStage ? GENERATABLE_STAGE_ACTIONS[currentStage.code] : null;
  const coverImageLimitReached =
    coverImageQuota.limit != null && coverImageQuota.used >= coverImageQuota.limit;
  const imageAssetStorageLimitReached =
    imageAssetQuota.remainingBytes < imageAssetQuota.reservedGenerationBytes;
  const canShowWechatControls = canPublishToWechat;
  const hasUnsavedWechatRenderInputs =
    title !== lastSavedTitle
    || markdown !== lastSavedMarkdown
    || wechatTemplateId !== lastSavedWechatTemplateId;
  const coverImageButtonDisabled =
    !canGenerateCoverImage
    || generatingCover
    || coverImageLimitReached
    || imageAssetStorageLimitReached;
  const coverImageButtonLabel = !canGenerateCoverImage
    ? "当前套餐仅提供文本配图建议"
    : coverImageLimitReached
      ? "今日封面图额度已用尽"
      : imageAssetStorageLimitReached
        ? "图片资产空间不足"
        : generatingCover
          ? "封面图生成中…"
          : "生成 16:9 封面图";
  const nodeVisualSuggestions = nodes
    .filter((node) => node.title.trim())
    .slice(0, 4)
    .map((node) => ({
      id: node.id,
      title: node.title,
      prompt: buildNodeVisualSuggestion({
        articleTitle: title,
        nodeTitle: node.title,
        nodeDescription: node.description,
        fragments: node.fragments,
        authoringContext,
      }),
    }));

  return {
    editorStageChecklist,
    articleMainSteps,
    currentArticleMainStepDisplay,
    currentAuthoringPhase,
    authoringPhases,
    hasDraftContent,
    hasPreviewContent,
    currentArticleLabel,
    ...authoringUiState,
    workspaceGridClass,
    planCapabilityHints,
    currentStageAction,
    coverImageLimitReached,
    imageAssetStorageLimitReached,
    canShowWechatControls,
    hasUnsavedWechatRenderInputs,
    coverImageButtonDisabled,
    coverImageButtonLabel,
    nodeVisualSuggestions,
  };
}
