import { formatOutcomeHitStatus, type ArticleMainStepStatus } from "@/lib/article-workspace-formatters";
import { ARTICLE_MAIN_STEPS } from "./article-workspace-client-data";
import { AUTHORING_PHASES, getAuthoringPhaseCode } from "./authoring-phase";

export type EditorStageChecklistItem = {
  stepCode: string;
  stageCode: string;
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  detail: string;
};

type BuildEditorStageChecklistInput = {
  strategyCardIsComplete: boolean;
  strategyCardHasUnsavedChanges: boolean;
  strategyCardMissingFields: string[];
  savedStrategyCardIsComplete: boolean;
  savedStrategyCardMissingFields: string[];
  titleConfirmedForGuide: boolean;
  researchNeedsAttention: boolean;
  researchGuideHint: string;
  outlineArtifactReady: boolean;
  audienceArtifactReady: boolean;
  evidenceDraftReady: boolean;
  evidenceDraftFlags: string[];
  savedEvidenceReady: boolean;
  savedEvidenceFlags: string[];
  evidenceHasUnsavedChanges: boolean;
  outlineMaterialReadinessStatus: string;
  outlineMaterialReadinessDetail: string;
  outlineMaterialReadinessFlags: string[];
  outlineGapHintsForGuide: string[];
  factCheckReady: boolean;
  deepWritingReady: boolean;
  prosePolishReady: boolean;
  activeAiNoiseScore: number;
  liveLanguageGuardHitsCount: number;
  canUseHistoryReferences: boolean;
  historyPlanCount: number;
  canPublishToWechat: boolean;
  publishBlockedByCover: boolean;
  publishBlockedByConnection: boolean;
  status: string;
  articleOutcomeMissingWindowCodes: string[];
  currentArticleOutcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
};

export function buildEditorStageChecklist({
  strategyCardIsComplete,
  strategyCardHasUnsavedChanges,
  strategyCardMissingFields,
  savedStrategyCardIsComplete,
  savedStrategyCardMissingFields,
  titleConfirmedForGuide,
  researchNeedsAttention,
  researchGuideHint,
  outlineArtifactReady,
  audienceArtifactReady,
  evidenceDraftReady,
  evidenceDraftFlags,
  savedEvidenceReady,
  savedEvidenceFlags,
  evidenceHasUnsavedChanges,
  outlineMaterialReadinessStatus,
  outlineMaterialReadinessDetail,
  outlineMaterialReadinessFlags,
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
}: BuildEditorStageChecklistInput): EditorStageChecklistItem[] {
  return [
    {
      stepCode: "opportunity",
      stageCode: "researchBrief",
      title: "机会",
      status: !strategyCardIsComplete ? "blocked" : strategyCardHasUnsavedChanges || researchNeedsAttention ? "needs_attention" : "ready",
      detail: !strategyCardIsComplete
        ? `策略卡还没补齐，当前仍缺：${strategyCardMissingFields.join("、")}。`
        : strategyCardHasUnsavedChanges
          ? "策略卡草稿已更新，但还没保存，后续阶段仍会读取旧判断。"
          : researchNeedsAttention
            ? `研究底座仍有缺口：${researchGuideHint}`
            : "方向、研究与主判断都已具备。",
    },
    {
      stepCode: "strategy",
      stageCode: "audienceAnalysis",
      title: "策略",
      status: !savedStrategyCardIsComplete || !audienceArtifactReady || !outlineArtifactReady
        ? "blocked"
        : !titleConfirmedForGuide
          ? "needs_attention"
          : "ready",
      detail: !savedStrategyCardIsComplete
        ? `策略阶段仍缺保存确认：${savedStrategyCardMissingFields.join("、")}。`
        : !audienceArtifactReady
          ? "还没有受众分析结果。"
          : !outlineArtifactReady
            ? "还没有生成大纲规划。"
            : !titleConfirmedForGuide
              ? "大纲已生成，但还没确认最终标题。"
              : "受众、标题和大纲都已确认。",
    },
    {
      stepCode: "evidence",
      stageCode: "outlinePlanning",
      title: "证据",
      status: !evidenceDraftReady
        ? "blocked"
        : !savedEvidenceReady || evidenceHasUnsavedChanges || researchNeedsAttention || !factCheckReady || outlineMaterialReadinessStatus !== "passed" || outlineGapHintsForGuide.length > 0
          ? "needs_attention"
          : "ready",
      detail: !evidenceDraftReady
        ? `当前证据包未达最低标准：${evidenceDraftFlags.join("、")}。`
        : !savedEvidenceReady || evidenceHasUnsavedChanges
          ? "证据包草稿已补齐，但还没确认保存，发布守门仍不会放行。"
          : researchNeedsAttention
            ? `证据包已开始整理，但研究底座仍有缺口：${researchGuideHint}`
            : outlineMaterialReadinessStatus !== "passed"
              ? `${outlineMaterialReadinessDetail}${outlineMaterialReadinessFlags.length ? ` 当前缺口：${outlineMaterialReadinessFlags.join("、")}。` : ""}`
              : !factCheckReady
                ? "证据包已确认，但事实核查还没生成证据判断。"
                : outlineGapHintsForGuide.length > 0
                  ? `已进入证据阶段，但仍提示这些素材缺口：${outlineGapHintsForGuide.join("；")}`
                  : "已确认的证据包和事实核查都已具备。",
    },
    {
      stepCode: "draft",
      stageCode: "deepWriting",
      title: "成稿",
      status: !deepWritingReady
        ? "blocked"
        : !prosePolishReady || activeAiNoiseScore >= 70 || liveLanguageGuardHitsCount > 0 || (canUseHistoryReferences && historyPlanCount === 0)
          ? "needs_attention"
          : "ready",
      detail: !deepWritingReady
        ? "还没有生成正文执行卡。"
        : !prosePolishReady
          ? "正文已经进入成稿区，但还没完成润色收口。"
          : canUseHistoryReferences && historyPlanCount === 0
            ? "正文与润色已完成，但系列旧文承接还没补进去。"
            : activeAiNoiseScore >= 70
              ? `AI 噪声得分 ${activeAiNoiseScore}，仍有明显空话或模板句需要重写。`
              : liveLanguageGuardHitsCount > 0
                ? `仍命中 ${liveLanguageGuardHitsCount} 条语言守卫规则，建议先清理机器味。`
                : "正文、润色和语言守卫都已收口。",
    },
    {
      stepCode: "publish",
      stageCode: "publish",
      title: "发布",
      status: !savedStrategyCardIsComplete || !savedEvidenceReady || !titleConfirmedForGuide || !factCheckReady
        ? "blocked"
        : publishBlockedByCover || publishBlockedByConnection
          ? "needs_attention"
          : "ready",
      detail: !savedStrategyCardIsComplete
        ? `发布前需要先确认并保存策略卡，当前仍缺：${savedStrategyCardMissingFields.join("、")}。`
        : !savedEvidenceReady
          ? `发布前需要先确认并保存证据包，当前仍缺：${savedEvidenceFlags.join("、")}。`
          : !titleConfirmedForGuide
            ? "发布前还没确认最终标题。"
            : !factCheckReady
              ? "发布前需要先跑完事实核查。"
              : canPublishToWechat
                ? publishBlockedByCover
                  ? "微信推送前还缺封面图。"
                  : publishBlockedByConnection
                    ? "微信推送能力已开放，但当前还没有可用公众号连接。"
                    : "微信连接、封面图和正文已具备发布条件。"
                : publishBlockedByCover
                  ? "当前套餐不推微信，但仍建议补一张封面图再导出交付。"
                  : "当前套餐走导出交付路径即可，不必等到发布页才发现不可用。",
    },
    {
      stepCode: "result",
      stageCode: "publish",
      title: "结果",
      status: status !== "published"
        ? "blocked"
        : articleOutcomeMissingWindowCodes.length > 0 || currentArticleOutcomeHitStatus === "pending"
          ? "needs_attention"
          : "ready",
      detail: status !== "published"
        ? "稿件还没正式发布，结果阶段尚未开始。"
        : articleOutcomeMissingWindowCodes.length > 0
          ? `还缺 ${articleOutcomeMissingWindowCodes.join(" / ")} 结果快照。`
          : currentArticleOutcomeHitStatus === "pending"
            ? "24h / 72h / 7d 快照已补齐，但还没完成命中判定与复盘结论。"
            : `结果回流已闭环，当前判定：${formatOutcomeHitStatus(currentArticleOutcomeHitStatus)}。`,
    },
  ];
}

export function buildArticleMainSteps(currentArticleMainStepCode: string, editorStageChecklist: EditorStageChecklistItem[]) {
  const currentStepIndex = ARTICLE_MAIN_STEPS.findIndex((step) => step.code === currentArticleMainStepCode);
  return ARTICLE_MAIN_STEPS.map((step, index) => {
    const checklistItem = editorStageChecklist.find((item) => item.stepCode === step.code);
    let statusLabel: ArticleMainStepStatus = "pending";
    if (step.code === currentArticleMainStepCode) {
      statusLabel = "current";
    } else if (checklistItem?.status === "ready") {
      statusLabel = "completed";
    } else if (checklistItem?.status === "needs_attention" || checklistItem?.status === "blocked") {
      statusLabel = index < currentStepIndex ? "needs_attention" : "pending";
    }
    if (step.code === "result" && checklistItem?.status === "needs_attention") {
      statusLabel = "needs_attention";
    }
    return {
      ...step,
      statusLabel,
      detail: checklistItem?.detail || "当前步骤说明暂未生成。",
    };
  });
}

export function buildAuthoringPhases(articleMainSteps: Array<(typeof ARTICLE_MAIN_STEPS)[number] & { statusLabel: ArticleMainStepStatus; detail: string }>, currentArticleMainStepCode: string, workflowCurrentStageCode: string) {
  const currentAuthoringPhase =
    AUTHORING_PHASES.find((phase) => phase.code === getAuthoringPhaseCode(currentArticleMainStepCode, workflowCurrentStageCode)) ?? AUTHORING_PHASES[0];
  const currentPhaseIndex = AUTHORING_PHASES.findIndex((phase) => phase.code === currentAuthoringPhase.code);
  const authoringPhases = AUTHORING_PHASES.map((phase, index) => {
    const steps = articleMainSteps.filter((step) => getAuthoringPhaseCode(step.code, step.primaryStageCode) === phase.code);
    const isCurrent = phase.code === currentAuthoringPhase.code;
    const hasNeedsAttention = steps.some((step) => step.statusLabel === "needs_attention");
    const isCompleted = steps.length > 0 && steps.every((step) => step.statusLabel === "completed");
    return {
      ...phase,
      statusLabel: isCurrent ? "current" : isCompleted ? "completed" : hasNeedsAttention || index < currentPhaseIndex ? "needs_attention" : "pending",
      steps,
    };
  });
  return { currentAuthoringPhase, authoringPhases };
}

export function getCurrentAuthoringPhaseHint(phaseCode: string, liveLanguageGuardHitsCount: number) {
  if (phaseCode === "collect") {
    return "先把研究、素材和证据挂齐，再考虑漂亮句子。";
  }
  if (phaseCode === "think") {
    return "这一段只看论点、读者和结构，减少正文噪音。";
  }
  if (phaseCode === "write") {
    return "进入写作后，优先留在稿纸和节奏图里，不必频繁切预览。";
  }
  return liveLanguageGuardHitsCount > 0
    ? `当前还命中 ${liveLanguageGuardHitsCount} 条语言守卫，先清红笔，再看微信预览。`
    : "正文已进入收口区，先用红笔检查，再用微信预览确认最终体感。";
}

export function getWorkspaceGridClass(isFocusMode: boolean, isWritePhase: boolean, isPolishPhase: boolean) {
  if (isFocusMode) {
    return "xl:grid-cols-1";
  }
  if (isWritePhase || isPolishPhase) {
    return "xl:grid-cols-[minmax(0,1fr)_340px]";
  }
  return "xl:grid-cols-[260px_minmax(0,1fr)_360px]";
}

export function buildPlanCapabilityHints(input: {
  canUseHistoryReferences: boolean;
  canGenerateCoverImage: boolean;
  canUseCoverImageReference: boolean;
  canPublishToWechat: boolean;
  canExportPdf: boolean;
  displayPlanName: string;
}) {
  const {
    canUseHistoryReferences,
    canGenerateCoverImage,
    canUseCoverImageReference,
    canPublishToWechat,
    canExportPdf,
    displayPlanName,
  } = input;

  return [
    !canUseHistoryReferences
      ? {
          key: "history-reference",
          title: "历史文章自然引用",
          detail: `${displayPlanName}当前不支持旧文自然引用。替代路径：在深写执行卡里手动补 1 句桥接句，把旧判断写进正文。`,
        }
      : null,
    !canGenerateCoverImage
      ? {
          key: "cover-generate",
          title: "封面图生成",
          detail: `${displayPlanName}当前只开放配图提示词。替代路径：先保存提示词或导出 HTML，再用外部工具生成封面图。`,
        }
      : null,
    canGenerateCoverImage && !canUseCoverImageReference
      ? {
          key: "cover-reference",
          title: "参考图垫图",
          detail: `${displayPlanName}当前可直接生成封面图，但不能上传参考图。替代路径：先生成候选图，再从候选图里挑一张入库。`,
        }
      : null,
    !canPublishToWechat
      ? {
          key: "wechat-publish",
          title: "微信草稿箱推送",
          detail: `${displayPlanName}当前不开放公众号推送。替代路径：继续走 HTML / Markdown 导出，不要等到发布页才发现不可用。`,
        }
      : null,
    !canExportPdf
      ? {
          key: "pdf-export",
          title: "PDF 导出",
          detail: `${displayPlanName}当前不开放 PDF。替代路径：优先导出 HTML 或 Markdown，再做外部排版。`,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; detail: string }>;
}
