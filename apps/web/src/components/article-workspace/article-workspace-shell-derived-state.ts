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
import type { WorkspaceCurrentTask } from "./types";

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

type LatestSyncLogInput = {
  status: string;
  failureReason: string | null;
  failureCode: string | null;
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
  latestSyncLog: LatestSyncLogInput;
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
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
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

function buildCurrentArticleTask(input: {
  currentArticleMainStepCode: string;
  editorStageChecklist: EditorStageChecklistItem[];
  status: string;
  articleOutcomeMissingWindowCodes: string[];
  currentArticleOutcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
  canPublishToWechat: boolean;
  selectedConnection: SelectedConnectionInput;
  coverImage: unknown | null;
  latestSyncLog: LatestSyncLogInput;
  hasUnsavedWechatRenderInputs: boolean;
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
  researchGuideHint: string;
  hasDraftContent: boolean;
  deepWritingReady: boolean;
}): WorkspaceCurrentTask {
  const currentChecklist =
    input.editorStageChecklist.find((item) => item.stepCode === input.currentArticleMainStepCode) ?? null;
  const isPublishMoment = input.currentArticleMainStepCode === "publish" || input.status === "published";

  if (input.status === "published" && input.articleOutcomeMissingWindowCodes.length > 0) {
    return {
      title: "先补结果快照，别让复盘断档",
      detail: `这篇稿件还缺 ${input.articleOutcomeMissingWindowCodes.join(" / ")} 结果快照，打法复盘和命中判断还没闭环。`,
      badge: "结果待回流",
      tone: "danger",
      actionLabel: "去补结果阶段",
      actionKind: "goto-step",
      targetStepCode: "result",
    };
  }

  if (input.status === "published" && input.currentArticleOutcomeHitStatus === "pending") {
    return {
      title: "先完成命中判定，再沉淀这篇稿件",
      detail: "结果窗口已补齐，但这篇稿件还没写完命中判定与复盘结论，系列打法还不能沉淀回流。",
      badge: "待写复盘",
      tone: "warning",
      actionLabel: "去写结果结论",
      actionKind: "goto-step",
      targetStepCode: "result",
    };
  }

  if (isPublishMoment && input.latestSyncLog?.status === "failed") {
    return {
      title: "先处理最近一次发布失败",
      detail: input.latestSyncLog.failureReason
        ? `最近一次微信推送失败：${input.latestSyncLog.failureReason}`
        : "最近一次微信推送失败，但还没有写回明确原因，先回到发布阶段处理。",
      badge: "发布失败",
      tone: "danger",
      actionLabel: "去修发布阶段",
      actionKind: "goto-step",
      targetStepCode: "publish",
    };
  }

  if (isPublishMoment && input.canPublishToWechat && (!input.selectedConnection || input.selectedConnection.status !== "valid")) {
    return {
      title: "先补可用公众号连接，再谈推送",
      detail: "当前稿件已经来到发布环节，但没有可用公众号连接，微信草稿箱推送会被直接拦住。",
      badge: "连接阻塞",
      tone: "danger",
      actionLabel: "去处理发布连接",
      actionKind: "goto-step",
      targetStepCode: "publish",
    };
  }

  if (isPublishMoment && input.canPublishToWechat && !input.coverImage) {
    return {
      title: "先补封面图，发布守门还没放行",
      detail: "当前稿件已经来到发布环节，但还没有 16:9 封面图，微信预览与推送检查都不会放行。",
      badge: "缺封面",
      tone: "warning",
      actionLabel: "去补发布素材",
      actionKind: "goto-step",
      targetStepCode: "publish",
    };
  }

  if (isPublishMoment && input.hasUnsavedWechatRenderInputs) {
    return {
      title: "先刷新发布预览一致性",
      detail: "标题、正文或模板已改动，但当前微信预览还没按最新稿件重新确认，发布前检查结果可能已经过时。",
      badge: "预览待刷新",
      tone: "warning",
      actionLabel: "去确认发布预览",
      actionKind: "goto-step",
      targetStepCode: "publish",
    };
  }

  if (input.generateBlockedByResearch) {
    return {
      title: "先补研究层，后续生成已经锁定",
      detail: input.generateBlockedMessage || input.researchGuideHint || "研究底座仍有关键缺口，继续写正文只会放大偏差。",
      badge: "研究阻塞",
      tone: "danger",
      actionLabel: "去补研究层",
      actionKind: "goto-research",
    };
  }

  if (input.researchGuideHint) {
    return {
      title: "先补研究底座，再推进后续阶段",
      detail: input.researchGuideHint,
      badge: "研究待补",
      tone: "warning",
      actionLabel: "去补研究层",
      actionKind: "goto-research",
    };
  }

  if (input.currentArticleMainStepCode === "draft" && !input.hasDraftContent) {
    return {
      title: input.deepWritingReady ? "先把正文真正落到稿纸上" : "先生成正文执行卡，再进入成稿",
      detail: input.deepWritingReady
        ? "成稿阶段已经打开，但稿纸还是空的，先把正文骨架写出来，后面的润色和审校才有对象。"
        : "当前还没有生成正文执行卡，成稿阶段还没有真正开始。",
      badge: "正文待写",
      tone: "warning",
      actionLabel: "去处理成稿阶段",
      actionKind: "goto-step",
      targetStepCode: "draft",
    };
  }

  if (currentChecklist && currentChecklist.status !== "ready") {
    return {
      title: `先处理「${currentChecklist.title}」阶段的阻塞项`,
      detail: currentChecklist.detail,
      badge: currentChecklist.status === "blocked" ? "当前阻塞" : "当前待处理",
      tone: currentChecklist.status === "blocked" ? "danger" : "warning",
      actionLabel: `去处理${currentChecklist.title}`,
      actionKind: "goto-step",
      targetStepCode: currentChecklist.stepCode as WorkspaceCurrentTask["targetStepCode"],
    };
  }

  return {
    title: `继续推进「${currentChecklist?.title || "当前步骤"}」`,
    detail: currentChecklist?.detail || "当前步骤已具备继续推进条件，可以直接往下完成产物与收口。",
    badge: "可继续推进",
    tone: "ready",
    actionLabel: `查看${currentChecklist?.title || "当前"}阶段`,
    actionKind: "goto-step",
    targetStepCode: (currentChecklist?.stepCode || input.currentArticleMainStepCode) as WorkspaceCurrentTask["targetStepCode"],
  };
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
  latestSyncLog,
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
  generateBlockedByResearch,
  generateBlockedMessage,
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
  const currentArticleTask = buildCurrentArticleTask({
    currentArticleMainStepCode: currentArticleMainStep.code,
    editorStageChecklist,
    status,
    articleOutcomeMissingWindowCodes,
    currentArticleOutcomeHitStatus,
    canPublishToWechat,
    selectedConnection,
    coverImage,
    latestSyncLog,
    hasUnsavedWechatRenderInputs,
    generateBlockedByResearch,
    generateBlockedMessage,
    researchGuideHint,
    hasDraftContent,
    deepWritingReady,
  });
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
    currentArticleTask,
    coverImageButtonDisabled,
    coverImageButtonLabel,
    nodeVisualSuggestions,
  };
}
