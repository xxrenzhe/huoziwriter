import type { ComponentProps } from "react";
import { formatDeepWritingHistoryAdjustment } from "@/lib/article-workspace-formatters";
import {
  getDeepWritingHistorySignalSummary,
  getPayloadRecord,
  getPayloadRecordArray,
  getPayloadStringArray,
} from "@/lib/article-workspace-helpers";
import { normalizeOpeningOptions } from "@/lib/opening-patterns";
import type { WritingDiversityReport } from "@/lib/writing-diversity";
import { DeepWritingArtifactPanel } from "./deep-writing-artifact-panel";

type DeepWritingArtifactPanelProps = ComponentProps<typeof DeepWritingArtifactPanel>;

type DeepWritingArtifactItem = {
  title: string;
  updatedAt: string;
  provider: string | null;
  model: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  errorMessage: string | null;
};

type DeepWritingSeriesInsight = {
  label: string | null;
  reason: string | null;
  commonTerms: string[];
} | null;

type HistoryReferenceSelectionItem = {
  referencedArticleId: number;
  title: string;
  relationReason: string | null;
  bridgeSentence: string | null;
};

type HistoryReferenceSuggestionItem = HistoryReferenceSelectionItem & {
  seriesLabel?: string | null;
  consistencyHint?: string | null;
};

type DeepWritingExecutionCardInput = {
  articlePrototypeCode: string | null;
  articlePrototypeLabel: string | null;
  stateVariantCode: string | null;
  stateVariantLabel: string | null;
};

type DeepWritingPrototypeBatchInput = {
  stateVariantCode: string | null;
  prototypes: Array<{
    previewKey: string;
    articlePrototypeCode: string | null;
  }>;
};

type DeepWritingStateBatchInput = {
  articlePrototypeCode: string | null;
  states: Array<{
    previewKey: string;
    stateVariantCode: string | null;
  }>;
};

type DeepWritingOpeningPreviewInput = {
  previewKey: string;
  articlePrototypeCode: string | null;
  stateVariantCode: string | null;
};

type DeepWritingArtifactStagePanelProps = {
  introTitle: string;
  artifact: DeepWritingArtifactItem | null;
  prototypeOverride: string | null;
  onSelectPrototype: (value: string | null) => void;
  stateVariantOverride: string | null;
  onSelectStateVariant: (value: string | null) => void;
  openingPreviews: Record<string, string>;
  openingPreviewLoadingKey: string | null;
  openingCheckLoading: boolean;
  generatingStageArtifactCode: string | null;
  updatingWorkflowCode: string | null;
  applyingStageArtifactCode: string | null;
  onGenerateExecutionCard: (input: DeepWritingExecutionCardInput) => void;
  onSamplePrototypeOpenings: (input: DeepWritingPrototypeBatchInput) => void;
  onSampleStateOpenings: (input: DeepWritingStateBatchInput) => void;
  onLoadOpeningPreview: (input: DeepWritingOpeningPreviewInput) => void;
  onRunOpeningCheck: () => void;
  editorDiversityReport: WritingDiversityReport;
  seriesInsight: DeepWritingSeriesInsight;
  canUseHistoryReferences: boolean;
  displayPlanName: string;
  loadingHistoryReferences: boolean;
  savingHistoryReferences: boolean;
  onRefreshHistorySuggestions: () => void;
  selectedHistoryReferences: HistoryReferenceSelectionItem[];
  onRemoveHistoryReference: (referencedArticleId: number) => void;
  onChangeHistoryRelationReason: (referencedArticleId: number, value: string) => void;
  onChangeHistoryBridgeSentence: (referencedArticleId: number, value: string) => void;
  onSaveHistorySelection: () => void;
  historyReferenceSuggestions: HistoryReferenceSuggestionItem[];
  onToggleHistorySuggestion: (referencedArticleId: number) => void;
  generating: boolean;
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
  onStartWriting: () => void;
  onGoToResearch: () => void;
};

function formatHistorySummary(signal: Record<string, unknown> | null) {
  return getDeepWritingHistorySignalSummary(signal, formatDeepWritingHistoryAdjustment);
}

function normalizeOpeningBadgeTone(value: unknown): "pass" | "warn" | "danger" {
  return value === "pass" || value === "warn" || value === "danger" ? value : "danger";
}

export function DeepWritingArtifactStagePanel({
  introTitle,
  artifact,
  prototypeOverride,
  onSelectPrototype,
  stateVariantOverride,
  onSelectStateVariant,
  openingPreviews,
  openingPreviewLoadingKey,
  openingCheckLoading,
  generatingStageArtifactCode,
  updatingWorkflowCode,
  applyingStageArtifactCode,
  onGenerateExecutionCard,
  onSamplePrototypeOpenings,
  onSampleStateOpenings,
  onLoadOpeningPreview,
  onRunOpeningCheck,
  editorDiversityReport,
  seriesInsight,
  canUseHistoryReferences,
  displayPlanName,
  loadingHistoryReferences,
  savingHistoryReferences,
  onRefreshHistorySuggestions,
  selectedHistoryReferences,
  onRemoveHistoryReference,
  onChangeHistoryRelationReason,
  onChangeHistoryBridgeSentence,
  onSaveHistorySelection,
  historyReferenceSuggestions,
  onToggleHistorySuggestion,
  generating,
  generateBlockedByResearch,
  generateBlockedMessage,
  onStartWriting,
  onGoToResearch,
}: DeepWritingArtifactStagePanelProps) {
  const payload = artifact?.payload ?? null;
  const selectedReferenceIds = new Set(selectedHistoryReferences.map((item) => item.referencedArticleId));
  const deepWritingSections = getPayloadRecordArray(payload, "sectionBlueprint");
  const deepWritingPrototypeOptions = getPayloadRecordArray(payload, "prototypeOptions");
  const deepWritingPrototypeComparisons = getPayloadRecordArray(payload, "prototypeComparisons");
  const deepWritingStateOptions = getPayloadRecordArray(payload, "stateOptions");
  const deepWritingStateComparisons = getPayloadRecordArray(payload, "stateComparisons");
  const deepWritingStateChecklist = getPayloadStringArray(payload, "stateChecklist");
  const deepWritingProgressiveRevealSteps = getPayloadRecordArray(payload, "progressiveRevealSteps");
  const deepWritingDiversitySummary = String(payload?.diversitySummary || "").trim();
  const deepWritingDiversityIssues = getPayloadStringArray(payload, "diversityIssues");
  const deepWritingDiversitySuggestions = getPayloadStringArray(payload, "diversitySuggestions");
  const deepWritingOpeningPatternLabel = String(payload?.openingPatternLabel || "").trim();
  const deepWritingSyntaxPatternLabel = String(payload?.syntaxPatternLabel || "").trim();
  const deepWritingEndingPatternLabel = String(payload?.endingPatternLabel || "").trim();
  const deepWritingVoiceChecklist = getPayloadStringArray(payload, "voiceChecklist");
  const deepWritingMustUseFacts = getPayloadStringArray(payload, "mustUseFacts");
  const deepWritingResearchFocus = String(payload?.researchFocus || "").trim();
  const deepWritingResearchLens = String(payload?.researchLens || "").trim();
  const deepWritingOpeningStrategy = String(payload?.openingStrategy || "").trim();
  const deepWritingBannedWatchlist = getPayloadStringArray(payload, "bannedWordWatchlist");
  const deepWritingSeriesChecklist = getPayloadStringArray(payload, "seriesChecklist");
  const deepWritingSeriesInsight = getPayloadRecord(payload, "seriesInsight");
  const deepWritingFinalChecklist = getPayloadStringArray(payload, "finalChecklist");
  const deepWritingHistoryPlans = getPayloadRecordArray(payload, "historyReferencePlan");
  const deepWritingPrototypeHistorySignal = getPayloadRecord(payload, "prototypeHistorySignal");
  const deepWritingStateHistorySignal = getPayloadRecord(payload, "stateHistorySignal");
  const deepWritingCurrentPrototypeCode = String(payload?.articlePrototype || "").trim();
  const deepWritingCurrentPrototypeLabel = String(payload?.articlePrototypeLabel || "").trim();
  const deepWritingCurrentVariantCode = String(payload?.stateVariantCode || "").trim();
  const deepWritingCurrentVariantLabel = String(payload?.stateVariantLabel || "").trim();
  const deepWritingSelectedPrototypeOption = deepWritingPrototypeOptions.find(
    (item) => String(item.code || "").trim() === prototypeOverride,
  );
  const deepWritingSelectedVariantOption = deepWritingStateOptions.find(
    (item) => String(item.code || "").trim() === stateVariantOverride,
  );
  const previewActionsDisabled = Boolean(openingPreviewLoadingKey) || Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode);
  const regenerateDisabled = Boolean(generatingStageArtifactCode) || Boolean(updatingWorkflowCode) || Boolean(applyingStageArtifactCode);
  const openingCheckDisabled = openingCheckLoading || regenerateDisabled || !deepWritingOpeningStrategy;
  const selectedPrototypeLabel = String(deepWritingSelectedPrototypeOption?.label || prototypeOverride || "").trim();
  const selectedStateLabel = String(deepWritingSelectedVariantOption?.label || stateVariantOverride || "").trim();
  const executionCardRefreshLabel =
    generatingStageArtifactCode === "deepWriting"
      ? "生成中…"
      : prototypeOverride || stateVariantOverride
        ? `按「${[selectedPrototypeLabel, selectedStateLabel].filter(Boolean).join(" / ")}」重生写作执行卡`
        : artifact
          ? "刷新写作执行卡"
          : "生成写作执行卡";
  const prototypeHistorySummary = formatHistorySummary(deepWritingPrototypeHistorySignal);
  const stateHistorySummary = formatHistorySummary(deepWritingStateHistorySignal);
  const deepWritingOpeningCheck = getPayloadRecord(payload, "openingCheck");
  const deepWritingOpeningDiagnosePanel = (() => {
    if (!deepWritingOpeningStrategy) {
      return null;
    }
    const savedOpeningText = String(deepWritingOpeningCheck?.openingText || "").trim();
    const savedDiagnose = getPayloadRecord(deepWritingOpeningCheck, "diagnose");
    const savedRewriteDirections = getPayloadStringArray(deepWritingOpeningCheck, "rewriteDirections");
    if (savedOpeningText && savedOpeningText === deepWritingOpeningStrategy && savedDiagnose) {
      return {
        openingText: savedOpeningText,
        patternLabel: String(deepWritingOpeningCheck?.patternLabel || deepWritingOpeningPatternLabel || "").trim(),
        qualityCeiling: String(deepWritingOpeningCheck?.qualityCeiling || "").trim(),
        hookScore: Number(deepWritingOpeningCheck?.hookScore || 0),
        forbiddenHits: getPayloadStringArray(deepWritingOpeningCheck, "forbiddenHits"),
        recommendReason: String(deepWritingOpeningCheck?.recommendReason || "").trim(),
        checkedAtLabel: String(deepWritingOpeningCheck?.checkedAt || "").trim()
          ? `最近体检：${new Date(String(deepWritingOpeningCheck?.checkedAt)).toLocaleString("zh-CN")}`
          : "",
        recommendedDirection: String(deepWritingOpeningCheck?.recommendedDirection || "").trim(),
        rewriteDirections: savedRewriteDirections,
        diagnoseBadges: [
          {
            label: `抽象度 ${savedDiagnose.abstractLevel === "pass" ? "通过" : savedDiagnose.abstractLevel === "warn" ? "关注" : "危险"}`,
            tone: normalizeOpeningBadgeTone(savedDiagnose.abstractLevel),
          },
          {
            label: `铺垫度 ${savedDiagnose.paddingLevel === "pass" ? "通过" : savedDiagnose.paddingLevel === "warn" ? "关注" : "危险"}`,
            tone: normalizeOpeningBadgeTone(savedDiagnose.paddingLevel),
          },
          {
            label: `钩子浓度 ${savedDiagnose.hookDensity === "pass" ? "通过" : savedDiagnose.hookDensity === "warn" ? "关注" : "危险"}`,
            tone: normalizeOpeningBadgeTone(savedDiagnose.hookDensity),
          },
          {
            label: `信息前置 ${savedDiagnose.informationFrontLoading === "pass" ? "通过" : savedDiagnose.informationFrontLoading === "warn" ? "关注" : "危险"}`,
            tone: normalizeOpeningBadgeTone(savedDiagnose.informationFrontLoading),
          },
        ],
      };
    }
    const option = normalizeOpeningOptions(
      [{
        opening: deepWritingOpeningStrategy,
        patternLabel: deepWritingOpeningPatternLabel || undefined,
      }],
      [],
      1,
    )[0];
    if (!option) {
      return null;
    }
    return {
      openingText: option.opening,
      patternLabel: option.patternLabel,
      qualityCeiling: option.qualityCeiling,
      hookScore: option.hookScore,
      forbiddenHits: option.forbiddenHits,
      recommendReason: option.recommendReason,
      checkedAtLabel: "",
      recommendedDirection: "",
      rewriteDirections: [],
      diagnoseBadges: [
        {
          label: `抽象度 ${option.diagnose.abstractLevel === "pass" ? "通过" : option.diagnose.abstractLevel === "warn" ? "关注" : "危险"}`,
          tone: option.diagnose.abstractLevel,
        },
        {
          label: `铺垫度 ${option.diagnose.paddingLevel === "pass" ? "通过" : option.diagnose.paddingLevel === "warn" ? "关注" : "危险"}`,
          tone: option.diagnose.paddingLevel,
        },
        {
          label: `钩子浓度 ${option.diagnose.hookDensity === "pass" ? "通过" : option.diagnose.hookDensity === "warn" ? "关注" : "危险"}`,
          tone: option.diagnose.hookDensity,
        },
        {
          label: `信息前置 ${option.diagnose.informationFrontLoading === "pass" ? "通过" : option.diagnose.informationFrontLoading === "warn" ? "关注" : "危险"}`,
          tone: option.diagnose.informationFrontLoading,
        },
      ],
    };
  })();
  const seriesInsightTerms = (
    Array.isArray(deepWritingSeriesInsight?.commonTerms)
      ? deepWritingSeriesInsight.commonTerms
      : seriesInsight?.commonTerms ?? []
  )
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const executionCardPanel: DeepWritingArtifactPanelProps["executionCardPanel"] = artifact
    ? {
        title: artifact.title,
        updatedAtLabel: artifact.updatedAt ? `更新于 ${new Date(artifact.updatedAt).toLocaleString("zh-CN")}` : "",
        providerLabel: `${artifact.provider || "local"}${artifact.model ? ` / ${artifact.model}` : ""}`,
        summary: artifact.summary || "",
        overviewCards: [
          String(payload?.selectedTitle || "").trim()
            ? {
                eyebrow: "采用标题",
                title: String(payload?.selectedTitle),
                body: "",
                hint: "",
              }
            : null,
          String(payload?.writingAngle || "").trim()
            ? {
                eyebrow: "写作角度",
                title: String(payload?.writingAngle),
                body: "",
                hint: "",
              }
            : null,
          String(payload?.articlePrototypeLabel || payload?.articlePrototype || "").trim()
            ? {
                eyebrow: "文章原型",
                title: String(payload?.articlePrototypeLabel || payload?.articlePrototype),
                body: "",
                hint: [
                  String(payload?.articlePrototypeReason || "").trim(),
                  prototypeHistorySummary ? `历史验证：${prototypeHistorySummary}` : "",
                  String(payload?.sectionRhythm || "").trim(),
                ].filter(Boolean).join(" "),
              }
            : null,
          String(payload?.stateVariantLabel || "").trim()
            ? {
                eyebrow: "当前状态",
                title: String(payload?.stateVariantLabel),
                body: "",
                hint: [
                  String(payload?.stateVariantReason || "").trim(),
                  stateHistorySummary ? `历史验证：${stateHistorySummary}` : "",
                ].filter(Boolean).join(" "),
                tone: "warning" as const,
              }
            : null,
          String(payload?.openingStrategy || "").trim()
            ? {
                eyebrow: "开头策略",
                title: String(payload?.openingStrategy),
                body: "",
                hint: String(payload?.openingMove || "").trim(),
              }
            : null,
          String(payload?.endingStrategy || "").trim()
            ? {
                eyebrow: "结尾策略",
                title: String(payload?.endingStrategy),
                body: "",
                hint: "",
              }
            : null,
        ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        centralThesis: String(payload?.centralThesis || "").trim(),
        targetEmotion: String(payload?.targetEmotion || "").trim(),
        patternCards: [
          deepWritingOpeningPatternLabel ? { label: "开头模式", value: deepWritingOpeningPatternLabel } : null,
          deepWritingSyntaxPatternLabel ? { label: "句法模式", value: deepWritingSyntaxPatternLabel } : null,
          deepWritingEndingPatternLabel ? { label: "结尾模式", value: deepWritingEndingPatternLabel } : null,
        ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        evidenceMode: String(payload?.evidenceMode || "").trim(),
        researchCards: [
          deepWritingResearchFocus ? { label: "研究焦点", value: deepWritingResearchFocus } : null,
          deepWritingResearchLens ? { label: "研究镜头", value: deepWritingResearchLens } : null,
          String(payload?.openingMove || "").trim()
            ? { label: "研究驱动起手", value: String(payload?.openingMove) }
            : null,
        ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        progressiveReveal: (() => {
          const label = String(payload?.progressiveRevealLabel || "").trim();
          const reason = String(payload?.progressiveRevealReason || "").trim();
          const climaxPlacement = String(payload?.climaxPlacement || "").trim();
          const escalationRule = String(payload?.escalationRule || "").trim();
          if (!label && !reason && !climaxPlacement && !escalationRule && deepWritingProgressiveRevealSteps.length === 0) {
            return null;
          }
          return {
            label,
            reason,
            climaxPlacement,
            escalationRule,
            steps: deepWritingProgressiveRevealSteps.map((item, index) => ({
              label: String(item.label || `步骤 ${index + 1}`).trim(),
              instruction: String(item.instruction || "").trim(),
            })),
          };
        })(),
        stateChecklist: deepWritingStateChecklist,
        stateCandidates: deepWritingStateOptions.map((item, index) => ({
          prefix: String(item.code || "").trim() === deepWritingCurrentVariantCode
            ? "当前采用："
            : index === 0
              ? "系统推荐："
              : "备选：",
          label: String(item.label || item.code || `状态 ${index + 1}`).trim(),
          suitableWhen: String(item.suitableWhen || "").trim(),
          triggerReason: String(item.triggerReason || "").trim(),
        })),
        sections: deepWritingSections.map((section, index) => ({
          heading: String(section.heading || `章节 ${index + 1}`).trim(),
          revealRole: String(section.revealRole || "").trim(),
          goal: String(section.goal || "").trim(),
          paragraphMission: String(section.paragraphMission || "").trim(),
          evidenceHints: getPayloadStringArray(section, "evidenceHints"),
          transition: String(section.transition || "").trim(),
        })),
        errorMessage: artifact.errorMessage || "",
      }
    : null;

  return (
    <DeepWritingArtifactPanel
      introTitle={introTitle}
      introHelper="深度写作继续沿用中间栏的 Markdown 编辑与流式生成。这里会先把标题、论点、段落推进、文风约束和关键事实整理成执行卡，再驱动正文生成。"
      prototypePanel={{
        prototypeOptions: deepWritingPrototypeOptions.map((item, index) => {
          const optionCode = String(item.code || "").trim();
          return {
            code: optionCode,
            label: String(item.label || optionCode || `原型 ${index + 1}`),
          };
        }),
        selectedPrototypeCode: prototypeOverride,
        currentPrototypeLabel: deepWritingCurrentPrototypeLabel,
        selectedPrototypeLabel,
        onSelectPrototype,
        prototypeComparisons: deepWritingPrototypeComparisons.map((item, index) => {
          const comparisonCode = String(item.code || "").trim();
          return {
            code: comparisonCode,
            label: String(item.label || comparisonCode || `原型 ${index + 1}`),
            suitableWhen: String(item.suitableWhen || "").trim(),
            reason: String(item.reason || "").trim(),
            recommendedStateVariantLabel: String(item.recommendedStateVariantLabel || "").trim(),
            openingPatternLabel: String(item.openingPatternLabel || "").trim(),
            syntaxPatternLabel: String(item.syntaxPatternLabel || "").trim(),
            endingPatternLabel: String(item.endingPatternLabel || "").trim(),
            progressiveRevealLabel: String(item.progressiveRevealLabel || "").trim(),
            historySummary: formatHistorySummary(getPayloadRecord(item, "historySignal")),
            diversitySummary: String(item.diversitySummary || "").trim(),
            isCurrent: comparisonCode === deepWritingCurrentPrototypeCode,
            isSelected: prototypeOverride === comparisonCode,
            isRecommended: Boolean(item.isRecommended),
            previewKey: `prototype:${comparisonCode || index}`,
            previewText: String(openingPreviews[`prototype:${comparisonCode || index}`] || "").trim(),
          };
        }),
        openingPreviewLoadingKey,
        previewActionsDisabled,
        regenerateDisabled,
        onSamplePrototypeOpenings: () =>
          onSamplePrototypeOpenings({
            stateVariantCode: deepWritingCurrentVariantCode || null,
            prototypes: deepWritingPrototypeComparisons
              .slice(0, 3)
              .map((item, index) => ({
                previewKey: `prototype:${String(item.code || "").trim() || index}`,
                articlePrototypeCode: String(item.code || "").trim() || null,
              }))
              .filter((item) => item.articlePrototypeCode),
          }),
        onRegenerateByPrototype: (code, label) => {
          onGenerateExecutionCard({
            articlePrototypeCode: code,
            articlePrototypeLabel: label,
            stateVariantCode: null,
            stateVariantLabel: null,
          });
        },
        onLoadPrototypePreview: (previewKey, code) => {
          onLoadOpeningPreview({
            previewKey,
            articlePrototypeCode: code,
            stateVariantCode: deepWritingCurrentVariantCode || null,
          });
        },
      }}
      statePanel={{
        stateOptions: deepWritingStateOptions.map((item, index) => {
          const optionCode = String(item.code || "").trim();
          return {
            code: optionCode,
            label: String(item.label || optionCode || `状态 ${index + 1}`),
          };
        }),
        selectedStateCode: stateVariantOverride,
        currentStateLabel: deepWritingCurrentVariantLabel,
        selectedStateLabel,
        onSelectState: onSelectStateVariant,
        stateComparisons: deepWritingStateComparisons.map((item, index) => {
          const comparisonCode = String(item.code || "").trim();
          return {
            code: comparisonCode,
            label: String(item.label || comparisonCode || `状态 ${index + 1}`),
            suitableWhen: String(item.suitableWhen || "").trim(),
            reason: String(item.reason || "").trim(),
            openingPatternLabel: String(item.openingPatternLabel || "").trim(),
            syntaxPatternLabel: String(item.syntaxPatternLabel || "").trim(),
            endingPatternLabel: String(item.endingPatternLabel || "").trim(),
            progressiveRevealLabel: String(item.progressiveRevealLabel || "").trim(),
            historySummary: formatHistorySummary(getPayloadRecord(item, "historySignal")),
            diversitySummary: String(item.diversitySummary || "").trim(),
            diversitySuggestions: getPayloadStringArray(item, "diversitySuggestions"),
            isCurrent: comparisonCode === deepWritingCurrentVariantCode,
            isSelected: stateVariantOverride === comparisonCode,
            isRecommended: Boolean(item.isRecommended),
            previewKey: `state:${comparisonCode || index}`,
            previewText: String(openingPreviews[`state:${comparisonCode || index}`] || "").trim(),
          };
        }),
        openingPreviewLoadingKey,
        previewActionsDisabled,
        regenerateDisabled,
        onSampleStateOpenings: () =>
          onSampleStateOpenings({
            articlePrototypeCode: deepWritingCurrentPrototypeCode || null,
            states: deepWritingStateComparisons
              .slice(0, 3)
              .map((item, index) => ({
                previewKey: `state:${String(item.code || "").trim() || index}`,
                stateVariantCode: String(item.code || "").trim() || null,
              }))
              .filter((item) => item.stateVariantCode),
          }),
        onRegenerateByState: (code, label) => {
          onGenerateExecutionCard({
            articlePrototypeCode: prototypeOverride,
            articlePrototypeLabel: String(deepWritingSelectedPrototypeOption?.label || "").trim() || null,
            stateVariantCode: code,
            stateVariantLabel: label,
          });
        },
        onLoadStatePreview: (previewKey, code) => {
          onLoadOpeningPreview({
            previewKey,
            articlePrototypeCode: deepWritingCurrentPrototypeCode || null,
            stateVariantCode: code,
          });
        },
      }}
      longTermDiversityPanel={{
        longTermReport: {
          status: editorDiversityReport.status === "needs_attention" ? "needs_attention" : "ready",
          summary: editorDiversityReport.summary,
          currentPrototypeLabel: editorDiversityReport.currentPrototypeLabel || "",
          currentStateVariantLabel: editorDiversityReport.currentStateVariantLabel || "",
          currentOpeningPatternLabel: editorDiversityReport.currentOpeningPatternLabel,
          currentSyntaxPatternLabel: editorDiversityReport.currentSyntaxPatternLabel,
          currentEndingPatternLabel: editorDiversityReport.currentEndingPatternLabel,
          issues: editorDiversityReport.issues,
          suggestions: editorDiversityReport.suggestions,
        },
      }}
      executionCardRefreshLabel={executionCardRefreshLabel}
      executionCardRefreshDisabled={regenerateDisabled}
      onRefreshExecutionCard={() => {
        onGenerateExecutionCard({
          articlePrototypeCode: prototypeOverride,
          articlePrototypeLabel: String(deepWritingSelectedPrototypeOption?.label || "").trim() || null,
          stateVariantCode: stateVariantOverride,
          stateVariantLabel: String(deepWritingSelectedVariantOption?.label || "").trim() || null,
        });
      }}
      executionCardPanel={executionCardPanel}
      openingDiagnosePanel={deepWritingOpeningDiagnosePanel}
      openingCheckActionLabel={openingCheckLoading ? "体检中…" : deepWritingOpeningCheck ? "重新体检开头" : "开头体检"}
      openingCheckActionDisabled={openingCheckDisabled}
      onRunOpeningCheck={onRunOpeningCheck}
      artifactDiversityPanel={artifact && (deepWritingDiversitySummary || deepWritingDiversityIssues.length > 0 || deepWritingDiversitySuggestions.length > 0)
        ? {
            artifactConstraint: {
              summary: deepWritingDiversitySummary,
              issues: deepWritingDiversityIssues,
              suggestions: deepWritingDiversitySuggestions,
            },
          }
        : null}
      seriesInsightPanel={artifact && (seriesInsight || deepWritingSeriesInsight)
        ? {
            label: String(deepWritingSeriesInsight?.label ?? seriesInsight?.label ?? "连续观察主题"),
            reason: String(deepWritingSeriesInsight?.reason ?? seriesInsight?.reason ?? "").trim(),
            commonTerms: seriesInsightTerms,
            checklist: deepWritingSeriesChecklist,
          }
        : null}
      checklistPanel={artifact
        ? {
            mustUseFacts: deepWritingMustUseFacts,
            voiceChecklist: deepWritingVoiceChecklist,
            bannedWatchlist: deepWritingBannedWatchlist,
            finalChecklist: deepWritingFinalChecklist,
            historyPlans: deepWritingHistoryPlans.map((item, index) => ({
              title: String(item.title || `旧文 ${index + 1}`).trim(),
              useWhen: String(item.useWhen || "").trim(),
              bridgeSentence: String(item.bridgeSentence || "").trim(),
            })),
          }
        : null}
      historyReferencePanel={{
        canUseHistoryReferences,
        unavailableMessage: `${displayPlanName}当前不支持历史文章自然引用。升级到 Pro 或更高套餐后，才可推荐、选择并保存最多 2 篇旧文作为正文内自然承接。`,
        loadingSuggestions: loadingHistoryReferences,
        savingSelection: savingHistoryReferences,
        onRefreshSuggestions: onRefreshHistorySuggestions,
        selectedReferences: selectedHistoryReferences.map((item) => ({
          referencedArticleId: item.referencedArticleId,
          title: item.title,
          relationReason: item.relationReason || "",
          bridgeSentence: item.bridgeSentence || "",
        })),
        onRemoveReference: onRemoveHistoryReference,
        onChangeRelationReason: onChangeHistoryRelationReason,
        onChangeBridgeSentence: onChangeHistoryBridgeSentence,
        onSaveSelection: onSaveHistorySelection,
        suggestions: historyReferenceSuggestions.map((item) => ({
          referencedArticleId: item.referencedArticleId,
          title: item.title,
          seriesLabel: item.seriesLabel || "",
          relationReason: item.relationReason || "",
          consistencyHint: item.consistencyHint || "",
          bridgeSentence: item.bridgeSentence || "",
          selected: selectedReferenceIds.has(item.referencedArticleId),
          selectionDisabled: !selectedReferenceIds.has(item.referencedArticleId) && selectedHistoryReferences.length >= 2,
        })),
        onToggleSuggestion: onToggleHistorySuggestion,
      }}
      startWritingLabel={generating ? "生成中…" : generateBlockedByResearch ? "先补研究信源" : "开始深度写作"}
      startWritingDisabled={generating || generateBlockedByResearch}
      onStartWriting={onStartWriting}
      showGoToResearch={generateBlockedByResearch}
      onGoToResearch={onGoToResearch}
      goToResearchDisabled={Boolean(updatingWorkflowCode)}
      blockedMessage={generateBlockedByResearch ? (generateBlockedMessage || "研究层信源覆盖仍不足，请先补研究简报。") : ""}
    />
  );
}
