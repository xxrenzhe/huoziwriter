import { analyzeAiNoise } from "./ai-noise-scan";
import { evaluateArchetypeRhythmConsistency } from "./archetype-rhythm";
import { EVIDENCE_HOOK_TAG_OPTIONS, getArticleEvidenceStats } from "./article-evidence";
import { getHumanSignalScore, getStrategyCardMissingFields, isStrategyCardComplete, STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import { getArticleNodes } from "./article-outline";
import { getArticleStageArtifact, getArticleStageArtifactsByDocumentIds } from "./article-stage-artifacts";
import { getActiveTemplateById } from "./layout-templates";
import { evaluateOpeningGuardChecks as evaluateOpeningPatternGuardChecks } from "./opening-patterns";
import { getArticleById, getArticleEvidenceItems, getArticlesByUser, getArticleStrategyCard, getLatestArticleCoverImage, getLatestWechatSyncLogForArticle, getWechatConnectionRaw } from "./repositories";
import { evaluateTitleGuardChecks } from "./title-patterns";
import { buildWritingDiversityReport } from "./writing-diversity";
import { buildWritingQualityPanel } from "./writing-quality";

type GuardStatus = "passed" | "warning" | "blocked";
type GuardSeverity = "blocking" | "warning" | "suggestion";

type PublishGuardCheck = {
  key: string;
  label: string;
  status: GuardStatus;
  severity: GuardSeverity;
  detail: string;
  targetStageCode?: string;
  actionLabel?: string;
};

type StageReadiness = {
  stageCode: string;
  title: string;
  status: "ready" | "needs_attention" | "blocked";
  detail: string;
};

export type PublishGuardResult = {
  canPublish: boolean;
  blockers: string[];
  warnings: string[];
  suggestions: string[];
  checks: PublishGuardCheck[];
  stageReadiness: StageReadiness[];
  aiNoise: {
    score: number;
    level: string;
    findings: string[];
    suggestions: string[];
  };
  qualityPanel: ReturnType<typeof buildWritingQualityPanel>;
  materialReadiness: {
    attachedFragmentCount: number;
    uniqueSourceTypeCount: number;
    screenshotCount: number;
  };
  connectionHealth: {
    connectionName: string | null;
    status: string;
    detail: string;
    tokenExpiresAt: string | null;
  };
  latestAttempt: {
    status: string;
    createdAt: string;
    failureReason: string | null;
    failureCode: string | null;
    retryCount: number;
    mediaId: string | null;
  } | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : [];
}

function getStringArray(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, limit) : [];
}

function getNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hasArtifactPayload(value: { payload?: Record<string, unknown> | null } | null) {
  return Boolean(value?.payload && Object.keys(value.payload).length > 0);
}

function pushCheck(
  list: PublishGuardCheck[],
  blockers: string[],
  warnings: string[],
  suggestions: string[],
  input: PublishGuardCheck,
) {
  list.push(input);
  if (input.severity === "blocking" || input.status === "blocked") {
    blockers.push(input.detail);
    return;
  }
  if (input.severity === "warning" || input.status === "warning") {
    warnings.push(input.detail);
    return;
  }
  suggestions.push(input.detail);
}

function getWeakestQualityLayerTargetStage(code: ReturnType<typeof buildWritingQualityPanel>["weakestLayerCode"]) {
  if (code === "hard_rules") return "prosePolish";
  if (code === "style_consistency") return "deepWriting";
  if (code === "content_quality") return "factCheck";
  if (code === "humanity") return "audienceAnalysis";
  return undefined;
}

export async function evaluatePublishGuard(input: {
  articleId: number;
  userId: number;
  templateId?: string | null;
  wechatConnectionId?: number | null;
}): Promise<PublishGuardResult> {
  const [article, recentArticles, strategyCard, evidenceItems, researchArtifact, outlineArtifact, deepWritingArtifact, factCheckArtifact, prosePolishArtifact, nodes, coverImage, connection, template, latestAttempt] = await Promise.all([
    getArticleById(input.articleId, input.userId),
    getArticlesByUser(input.userId),
    getArticleStrategyCard(input.articleId, input.userId),
    getArticleEvidenceItems(input.articleId, input.userId),
    getArticleStageArtifact(input.articleId, input.userId, "researchBrief"),
    getArticleStageArtifact(input.articleId, input.userId, "outlinePlanning"),
    getArticleStageArtifact(input.articleId, input.userId, "deepWriting"),
    getArticleStageArtifact(input.articleId, input.userId, "factCheck"),
    getArticleStageArtifact(input.articleId, input.userId, "prosePolish"),
    getArticleNodes(input.articleId),
    getLatestArticleCoverImage(input.userId, input.articleId),
    input.wechatConnectionId ? getWechatConnectionRaw(input.wechatConnectionId, input.userId) : Promise.resolve(null),
    input.templateId ? getActiveTemplateById(input.templateId, input.userId) : Promise.resolve(null),
    getLatestWechatSyncLogForArticle({
      userId: input.userId,
      articleId: input.articleId,
      wechatConnectionId: input.wechatConnectionId ?? null,
    }),
  ]);

  const checks: PublishGuardCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const allFragments = nodes.flatMap((node) => node.fragments);
  const uniqueFragmentIds = new Set(allFragments.map((fragment) => fragment.id));
  const uniqueSourceTypes = new Set(allFragments.map((fragment) => String(fragment.sourceType || "manual")));
  const screenshotCount = allFragments.filter((fragment) => String(fragment.sourceType || "") === "screenshot" || String(fragment.usageMode || "") === "image").length;
  const materialReadiness = {
    attachedFragmentCount: uniqueFragmentIds.size,
    uniqueSourceTypeCount: uniqueSourceTypes.size,
    screenshotCount,
  };

  const outlineSelection = getRecord(outlineArtifact?.payload?.selection);
  const selectedTitle = getString(outlineSelection?.selectedTitle) || getString(outlineArtifact?.payload?.workingTitle);
  const selectedTitleOption = getRecordArray(outlineArtifact?.payload?.titleOptions).find(
    (item) => getString(item.title) === selectedTitle,
  ) ?? null;
  const titleGuardEvaluation = evaluateTitleGuardChecks({
    selectedTitle,
    selectedTitleOption,
    titleAuditedAt: outlineArtifact?.payload?.titleAuditedAt,
    outlineUpdatedAt: outlineArtifact?.payload?.outlineUpdatedAt,
  });
  const selectedOpeningHook = getString(outlineSelection?.selectedOpeningHook) || getString(outlineArtifact?.payload?.openingHook);
  const selectedOpeningOption = getRecordArray(outlineArtifact?.payload?.openingOptions).find((item) => {
    const optionOpening = getString(item.opening) || getString(item.text) || getString(item.content) || getString(item.value);
    return optionOpening === selectedOpeningHook;
  }) ?? null;
  const openingGuardEvaluation = evaluateOpeningPatternGuardChecks({
    selectedOpening:
      getString(article?.markdown_content)
      || getString(deepWritingArtifact?.payload?.openingStrategy)
      || selectedOpeningHook,
    selectedOpeningHook,
    selectedOpeningOption,
    openingAuditedAt: outlineArtifact?.payload?.openingAuditedAt,
    outlineUpdatedAt: outlineArtifact?.payload?.outlineUpdatedAt,
  });
  const { titleConfirmed } = titleGuardEvaluation;
  const openingHasBlockingIssues = openingGuardEvaluation.checks.some((item) => item.status === "blocked" || item.severity === "blocking");
  const openingNeedsAttention =
    openingHasBlockingIssues || openingGuardEvaluation.checks.some((item) => item.status === "warning" || item.severity === "warning");
  const outlineGapHints = getStringArray(outlineArtifact?.payload?.materialGapHints, 4);
  const historyReferencePlan = getStringArray(deepWritingArtifact?.payload?.historyReferencePlan ? ["history"] : [], 1);
  const languageGuardHits = Array.isArray(prosePolishArtifact?.payload?.languageGuardHits)
    ? (prosePolishArtifact?.payload?.languageGuardHits as unknown[])
    : [];
  const localAiNoise = analyzeAiNoise(article?.markdown_content || "");
  const aiNoiseRecord = getRecord(prosePolishArtifact?.payload?.aiNoise);
  const aiNoiseScore = Number(aiNoiseRecord?.score ?? localAiNoise.score ?? 0);
  const aiNoiseLevel =
    getString(aiNoiseRecord?.level) || getString(localAiNoise.level) || (aiNoiseScore >= 70 ? "high" : aiNoiseScore >= 40 ? "medium" : "low");
  const aiNoiseFindings = getStringArray(aiNoiseRecord?.findings, 6).length
    ? getStringArray(aiNoiseRecord?.findings, 6)
    : getStringArray(localAiNoise.findings, 6);
  const aiNoiseSuggestions = getStringArray(aiNoiseRecord?.suggestions, 4).length
    ? getStringArray(aiNoiseRecord?.suggestions, 4)
    : getStringArray(localAiNoise.suggestions, 4);
  const aiNoiseHasRigidOutline = localAiNoise.outlineRigidityRisk === "high";
  const aiNoiseHasSummaryEnding = localAiNoise.summaryEndingRisk === "high";
  const aiNoiseNeedsAttention = aiNoiseScore >= 70 || aiNoiseHasRigidOutline || aiNoiseHasSummaryEnding;
  const missingEvidence = getStringArray(factCheckArtifact?.payload?.missingEvidence, 6);
  const overallRisk = getString(factCheckArtifact?.payload?.overallRisk);
  const personaAlignment = getString(factCheckArtifact?.payload?.personaAlignment);
  const topicAlignment = getString(factCheckArtifact?.payload?.topicAlignment);
  const researchSourceCoverage = getRecord(researchArtifact?.payload?.sourceCoverage);
  const researchCoveredCategoryCount = ["official", "industry", "comparison", "userVoice", "timeline"]
    .filter((key) => getStringArray(researchSourceCoverage?.[key], 4).length > 0)
    .length;
  const researchSufficiency = getString(researchSourceCoverage?.sufficiency);
  const researchMissingCategories = getStringArray(researchSourceCoverage?.missingCategories, 5);
  const researchTimelineCount = getRecordArray(researchArtifact?.payload?.timelineCards).length;
  const researchComparisonCount = getRecordArray(researchArtifact?.payload?.comparisonCards).length;
  const researchInsightCount = getRecordArray(researchArtifact?.payload?.intersectionInsights).length;
  const researchCoverageBlocked = researchSufficiency === "blocked" || researchCoveredCategoryCount <= 1;
  const researchTimelineMissing = researchTimelineCount === 0;
  const researchComparisonMissing = researchComparisonCount === 0;
  const researchInsightMissing = researchInsightCount === 0;
  const factCheckCounterEvidenceCount = getRecordArray(factCheckArtifact?.payload?.evidenceCards).reduce((sum, card) => {
    return sum + getRecordArray(card.counterEvidence).length;
  }, 0);
  const researchReady = researchArtifact?.status === "ready" && hasArtifactPayload(researchArtifact);
  const strategyCardMissingFields = getStrategyCardMissingFields(strategyCard);
  const strategyCardReady = isStrategyCardComplete(strategyCard);
  const humanSignalScore = getHumanSignalScore(strategyCard);
  const evidenceStats = getArticleEvidenceStats(evidenceItems);
  const hookCoverageReady = evidenceStats.hookTagCoverageCount >= 2;
  const missingHookTags = EVIDENCE_HOOK_TAG_OPTIONS.filter((tag) => !evidenceStats.hookTagCoverage.includes(tag));
  const fourPointAudit = getRecord(strategyCard?.fourPointAudit);
  const fourPointScores = [
    { key: "cognitiveFlip", label: "认知翻转", score: getNumericValue(getRecord(fourPointAudit?.cognitiveFlip)?.score) },
    { key: "readerSnapshot", label: "读者快照", score: getNumericValue(getRecord(fourPointAudit?.readerSnapshot)?.score) },
    { key: "coreTension", label: "核心张力", score: getNumericValue(getRecord(fourPointAudit?.coreTension)?.score) },
    { key: "impactVector", label: "发力方向", score: getNumericValue(getRecord(fourPointAudit?.impactVector)?.score) },
  ] as const;
  const fourPointAuditReady = fourPointScores.every((item) => item.score !== null);
  const fourPointAuditLockable = fourPointAuditReady && fourPointScores.every((item) => (item.score ?? 0) >= 3);
  const fourPointWeakLabels = fourPointScores.filter((item) => item.score !== null && (item.score ?? 0) < 3).map((item) => item.label);
  const fourPointScoreSummary = fourPointScores
    .filter((item) => item.score !== null)
    .map((item) => `${item.label} ${item.score}/5`)
    .join("，");
  const expectedPrototype = STRATEGY_ARCHETYPE_OPTIONS.find((item) => item.key === strategyCard?.archetype) ?? null;
  const actualPrototypeCode = getString(deepWritingArtifact?.payload?.articlePrototype);
  const actualPrototypeLabel = getString(deepWritingArtifact?.payload?.articlePrototypeLabel) || actualPrototypeCode;
  const rhythmConsistency = evaluateArchetypeRhythmConsistency({
    archetype: strategyCard?.archetype ?? null,
    expectedPrototypeCode: expectedPrototype?.prototypeCode ?? null,
    actualPrototypeCode: actualPrototypeCode || null,
    markdownContent: article?.markdown_content || "",
    deepWritingPayload: deepWritingArtifact?.payload || null,
  });
  const rhythmConsistencyReady = rhythmConsistency.status === "aligned";
  const rhythmConsistencyNeedsAttention = Boolean(strategyCard?.archetype) && rhythmConsistency.status !== "aligned";
  const hasCounterEvidence = evidenceStats.counterEvidenceCount > 0 || factCheckCounterEvidenceCount > 0;
  const researchHollowRiskItems = [
    !researchReady ? "研究简报尚未生成，当前还无法确认内容是不是只有表达没有研究。" : null,
    researchReady && researchCoverageBlocked
      ? `研究层仍只覆盖 ${researchCoveredCategoryCount} 类信源，当前更像单口径观点草稿。`
      : null,
    researchReady && researchTimelineMissing ? "缺少时间脉络卡，文章容易把现象写成凭空发生。" : null,
    researchReady && researchComparisonMissing ? "缺少横向比较卡，判断容易停在单点观察。" : null,
    researchReady && researchInsightMissing ? "高风险：缺少交汇洞察，正文仍容易退化成资料整理。" : null,
    evidenceStats.itemCount > 0 && !hasCounterEvidence ? "只有支持性证据，缺少反证或反例。" : null,
  ].filter(Boolean) as string[];
  const researchHollowRiskStatus: GuardStatus =
    researchReady && researchCoverageBlocked
      ? "blocked"
      : researchHollowRiskItems.length > 0
        ? "warning"
        : "passed";
  const researchHollowRiskTargetStage =
    !researchReady || researchCoverageBlocked || researchTimelineMissing || researchComparisonMissing || researchInsightMissing
      ? "researchBrief"
      : evidenceStats.itemCount > 0 && !hasCounterEvidence
        ? "factCheck"
        : undefined;
  const researchHollowRiskActionLabel =
    researchHollowRiskTargetStage === "researchBrief"
      ? "去补研究底座"
      : researchHollowRiskTargetStage === "factCheck"
        ? "去补反证"
        : undefined;
  const recentArticleItems = recentArticles
    .filter((item) => item.id !== input.articleId)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      markdownContent: item.markdown_content,
    }));
  const recentDeepWritingStates = recentArticleItems.length
    ? await getArticleStageArtifactsByDocumentIds({
        userId: input.userId,
        articleIds: recentArticleItems.map((item) => item.id),
        stageCode: "deepWriting",
      })
    : [];
  const diversityReport = buildWritingDiversityReport({
    currentArticle: {
      id: article?.id ?? input.articleId,
      title: article?.title ?? "",
      markdownContent: article?.markdown_content || "",
    },
    deepWritingPayload: deepWritingArtifact?.payload || null,
    recentArticles: recentArticleItems,
    recentDeepWritingStates: recentDeepWritingStates.map((item) => ({
      id: item.articleId,
      title: item.title,
      payload: item.artifact.payload,
    })),
  });
  const qualityPanel = buildWritingQualityPanel({
    markdownContent: article?.markdown_content || "",
    aiNoise: localAiNoise,
    languageGuardHitsCount: languageGuardHits.length,
    humanSignalScore,
    hasRealScene: Boolean(String(strategyCard?.firstHandObservation || "").trim() || String(strategyCard?.realSceneOrDialogue || "").trim()),
    hasNonDelegableTruth: Boolean(String(strategyCard?.nonDelegableTruth || "").trim()),
    materialReadiness,
    evidenceStats: {
      ready: evidenceStats.ready,
      itemCount: evidenceStats.itemCount,
      flags: evidenceStats.flags,
    },
    missingEvidenceCount: missingEvidence.length,
    deepWritingPayload: deepWritingArtifact?.payload || null,
    researchBriefPayload: researchArtifact?.payload || null,
    diversityReport,
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "writingDiversity",
    label: "写法去重",
    status: diversityReport.status === "needs_attention" ? "warning" : "passed",
    severity: diversityReport.status === "needs_attention" ? "warning" : "suggestion",
    detail: diversityReport.status === "needs_attention" ? diversityReport.issues[0] || diversityReport.summary : diversityReport.summary,
    targetStageCode: "deepWriting",
    actionLabel: diversityReport.status === "needs_attention" ? "去换写法" : undefined,
  });

  const weakestQualityLayer = qualityPanel.layers.find((item) => item.code === qualityPanel.weakestLayerCode) ?? null;
  if (weakestQualityLayer) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "writingQualityFocus",
      label: "当前最弱质检层",
      status:
        weakestQualityLayer.status === "blocked"
          ? "blocked"
          : weakestQualityLayer.status === "needs_attention"
            ? "warning"
            : "passed",
      severity:
        weakestQualityLayer.status === "blocked"
          ? "blocking"
          : weakestQualityLayer.status === "needs_attention"
            ? "warning"
            : "suggestion",
      detail: `当前最弱层是「${weakestQualityLayer.title}」：${weakestQualityLayer.suggestions[0] || weakestQualityLayer.summary}`,
      targetStageCode: getWeakestQualityLayerTargetStage(qualityPanel.weakestLayerCode),
      actionLabel:
        weakestQualityLayer.status === "ready"
          ? undefined
          : weakestQualityLayer.code === "hard_rules"
            ? "先清硬伤"
            : weakestQualityLayer.code === "style_consistency"
              ? "先换执行卡"
              : weakestQualityLayer.code === "content_quality"
                ? "先补证据"
                : "先补真人信号",
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "strategyCard",
    label: "策略卡",
    status: strategyCardReady ? "passed" : "blocked",
    severity: strategyCardReady ? "suggestion" : "blocking",
    detail: strategyCardReady
      ? "策略卡已确认，读者、判断、目标包和发布时间窗都已锁定。"
      : strategyCard
        ? `策略卡还缺这些必填项：${strategyCardMissingFields.join("；")}。`
        : "发布前需要先确认并保存策略卡。",
    targetStageCode: "audienceAnalysis",
    actionLabel: strategyCardReady ? undefined : "去补策略卡",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "fourPointAudit",
    label: "策略卡四元强度",
    status:
      !strategyCard
        ? "warning"
        : fourPointAuditLockable
          ? "passed"
          : "warning",
    severity:
      !strategyCard || !fourPointAuditLockable
        ? "warning"
        : "suggestion",
    detail:
      !strategyCard
        ? "策略卡还没保存，暂时无法评估四元强度。"
        : !fourPointAuditReady
          ? "四元强度还未跑完，当前无法确认是否达到可锁定标准。"
          : fourPointAuditLockable
            ? `四元强度已过线：${fourPointScoreSummary}。当前策略已满足锁定条件。`
            : `${strategyCard.strategyOverride ? "当前策略已标记强行锁定。" : "当前策略还没达到锁定线。"} ${fourPointScoreSummary}。建议优先补强：${fourPointWeakLabels.join("、")}。`,
    targetStageCode: "audienceAnalysis",
    actionLabel: fourPointAuditLockable ? undefined : "去补四元强度",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "evidencePackage",
    label: "证据包",
    status: evidenceStats.ready ? "passed" : "blocked",
    severity: evidenceStats.ready ? (evidenceStats.status === "warning" ? "warning" : "suggestion") : "blocking",
    detail: evidenceStats.ready
      ? evidenceStats.status === "warning"
        ? `证据包已确认，但仍有这些缺口：${evidenceStats.flags.join("；")}。`
        : `证据包已确认，共 ${evidenceStats.itemCount} 条。`
      : `证据包未达发布标准：${evidenceStats.flags.join("；") || evidenceStats.detail}`,
    targetStageCode: "outlinePlanning",
    actionLabel: evidenceStats.ready ? undefined : "去补证据包",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "hookCoverage",
    label: "爆点覆盖度",
    status:
      evidenceStats.itemCount === 0
        ? "warning"
        : hookCoverageReady
          ? "passed"
          : "warning",
    severity:
      evidenceStats.itemCount === 0 || !hookCoverageReady
        ? "warning"
        : "suggestion",
    detail:
      evidenceStats.itemCount === 0
        ? "证据包还没确认，暂时无法评估爆点覆盖度。"
        : hookCoverageReady
          ? `证据包已覆盖 ${evidenceStats.hookTagCoverageCount} 类爆点标签：${evidenceStats.hookTagCoverage.join("、")}。`
          : `当前只覆盖 ${evidenceStats.hookTagCoverageCount} 类爆点标签，至少需要 2 类。建议补：${missingHookTags.slice(0, 2).join("、") || "反常识或具身细节"}。`,
    targetStageCode: "evidence",
    actionLabel: hookCoverageReady ? undefined : "去补爆点标签",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "humanSignals",
    label: "人类信号",
    status: humanSignalScore >= 3 ? "passed" : humanSignalScore >= 2 ? "warning" : "blocked",
    severity: humanSignalScore >= 3 ? "suggestion" : humanSignalScore >= 2 ? "warning" : "blocking",
    detail:
      humanSignalScore >= 3
        ? `已补 ${humanSignalScore} / 6 条人类信号，正文可以更稳地落在你的观察、体感和真实场景上。`
        : humanSignalScore >= 2
          ? `当前只补了 ${humanSignalScore} / 6 条人类信号，勉强够用，但正文仍容易滑回“结构正确、呼吸感不足”的写法。`
          : `当前只补了 ${humanSignalScore} / 6 条人类信号。发布前至少补到 2 条，最好到 3 条以上。`,
    targetStageCode: "audienceAnalysis",
    actionLabel: humanSignalScore >= 3 ? undefined : "去补人类信号",
  });

  for (const check of titleGuardEvaluation.checks) {
    pushCheck(checks, blockers, warnings, suggestions, check);
  }

  for (const check of openingGuardEvaluation.checks) {
    pushCheck(checks, blockers, warnings, suggestions, check);
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "researchBrief",
    label: "研究简报",
    status:
      !researchReady
        ? "warning"
        : researchCoverageBlocked
          ? "blocked"
          : researchTimelineMissing || researchComparisonMissing || researchInsightMissing
            ? "warning"
            : "passed",
    severity:
      !researchReady
        ? "warning"
        : researchCoverageBlocked
          ? "blocking"
          : researchTimelineMissing || researchComparisonMissing || researchInsightMissing
            ? "warning"
            : "suggestion",
    detail:
      !researchReady
        ? "建议先生成研究简报，把核心问题、时间脉络、横向比较和交汇洞察补齐后再把判断写硬。"
        : researchCoverageBlocked
          ? `研究层仍未达到最低信源覆盖度${researchMissingCategories.length ? `，当前还缺：${researchMissingCategories.join("、")}` : ""}。`
          : researchTimelineMissing || researchComparisonMissing || researchInsightMissing
            ? `研究简报已生成，但仍有这些空洞风险：${[
                researchTimelineMissing ? "缺少时间脉络卡" : null,
                researchComparisonMissing ? "缺少横向比较卡" : null,
                researchInsightMissing ? "缺少交汇洞察" : null,
              ]
                .filter(Boolean)
                .join("；")}。`
            : "研究简报已完成，纵向与横向研究底座可用于后续判断。",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "researchHollowRisk",
    label: "内容空洞风险",
    status: researchHollowRiskStatus,
    severity:
      researchHollowRiskStatus === "blocked"
        ? "blocking"
        : researchHollowRiskStatus === "warning"
          ? "warning"
          : "suggestion",
    detail:
      researchHollowRiskStatus === "blocked"
        ? `内容空洞风险已触发阻断：${researchHollowRiskItems.join("；")}`
        : researchHollowRiskStatus === "warning"
          ? `当前仍有这些内容空洞风险：${researchHollowRiskItems.join("；")}`
          : "纵向脉络、横向比较、交汇洞察与反证都已覆盖，内容空洞风险可控。",
    targetStageCode: researchHollowRiskTargetStage,
    actionLabel: researchHollowRiskActionLabel,
  });

  if (researchReady) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "researchSourceCoverage",
      label: "研究信源覆盖",
      status: researchCoverageBlocked ? "blocked" : "passed",
      severity: researchCoverageBlocked ? "blocking" : "suggestion",
      detail: researchCoverageBlocked
        ? `研究信源覆盖仍不足${researchMissingCategories.length ? `，当前还缺：${researchMissingCategories.join("、")}` : ""}。`
        : `研究层已覆盖 ${researchCoveredCategoryCount} 类信源，当前可以支撑判断型正文。`,
      targetStageCode: "researchBrief",
      actionLabel: researchCoverageBlocked ? "去补研究信源" : undefined,
    });

    pushCheck(checks, blockers, warnings, suggestions, {
      key: "researchTimeline",
      label: "时间脉络",
      status: researchTimelineMissing ? "warning" : "passed",
      severity: researchTimelineMissing ? "warning" : "suggestion",
      detail: researchTimelineMissing
        ? "研究层还缺时间脉络卡，文章容易把现象写成凭空发生。"
        : `已沉淀 ${researchTimelineCount} 张时间脉络卡，能解释事情为什么会走到今天。`,
      targetStageCode: "researchBrief",
      actionLabel: researchTimelineMissing ? "去补时间脉络" : undefined,
    });

    pushCheck(checks, blockers, warnings, suggestions, {
      key: "researchComparison",
      label: "横向比较",
      status: researchComparisonMissing ? "warning" : "passed",
      severity: researchComparisonMissing ? "warning" : "suggestion",
      detail: researchComparisonMissing
        ? "研究层还缺横向比较卡，判断仍然容易停留在单点观察。"
        : `已沉淀 ${researchComparisonCount} 张横向比较卡，当前能把判断放回结构性对比里。`,
      targetStageCode: "researchBrief",
      actionLabel: researchComparisonMissing ? "去补横向比较" : undefined,
    });

    pushCheck(checks, blockers, warnings, suggestions, {
      key: "researchIntersection",
      label: "交汇洞察",
      status: researchInsightMissing ? "warning" : "passed",
      severity: researchInsightMissing ? "warning" : "suggestion",
      detail: researchInsightMissing
        ? "研究层还没有交汇洞察，正文仍容易停在资料整理层，而不是“为什么会这样发生”。"
        : `已沉淀 ${researchInsightCount} 条交汇洞察，可直接支撑 why now 和核心判断。`,
      targetStageCode: "researchBrief",
      actionLabel: researchInsightMissing ? "去补交汇洞察" : undefined,
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "counterEvidence",
    label: "反证与反例",
    status: evidenceStats.itemCount === 0 ? "warning" : hasCounterEvidence ? "passed" : "warning",
    severity: evidenceStats.itemCount === 0 ? "warning" : hasCounterEvidence ? "suggestion" : "warning",
    detail:
      evidenceStats.itemCount === 0
        ? "证据包还没确认，暂时无法判断是否覆盖反证或反例。"
        : hasCounterEvidence
          ? "证据包或事实核查中已保留反证/反例，判断不容易滑向单边结论。"
          : "当前只有支持性证据，没有反证或反例。发布前建议至少补 1 条反向材料，避免把判断写成单边定论。",
    targetStageCode: "factCheck",
    actionLabel: hasCounterEvidence ? undefined : "去补反证",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "outlinePlanning",
    label: "大纲规划",
    status: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "passed" : "blocked",
    severity: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "suggestion" : "blocking",
    detail:
      outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact)
        ? "大纲规划已完成，发布主结构可追踪。"
        : "发布前需要先完成大纲规划。",
    targetStageCode: "outlinePlanning",
    actionLabel: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? undefined : "去补大纲",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "deepWriting",
    label: "深度写作",
    status: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? "passed" : "blocked",
    severity: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? "suggestion" : "blocking",
    detail:
      deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
        ? "深度写作执行卡已完成。"
        : "发布前需要先完成深度写作。",
    targetStageCode: "deepWriting",
    actionLabel: deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact) ? undefined : "去补执行卡",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "archetypeRhythmConsistency",
    label: "原型节奏一致性",
    status:
      !strategyCard?.archetype || !expectedPrototype?.prototypeCode
        ? "warning"
        : rhythmConsistencyReady
          ? "passed"
          : "warning",
    severity:
      !strategyCard?.archetype || !expectedPrototype?.prototypeCode || !rhythmConsistencyReady
        ? "warning"
        : "suggestion",
    detail:
      !strategyCard?.archetype || !expectedPrototype?.prototypeCode
        ? "策略原型还没锁定，暂时无法校验执行卡和原型节奏是否一致。"
        : rhythmConsistencyReady
          ? `当前策略原型是「${expectedPrototype.label}」，执行卡按「${actualPrototypeLabel || actualPrototypeCode || expectedPrototype.prototypeCode}」推进；${rhythmConsistency.detail}`
          : `当前策略原型是「${expectedPrototype.label}」，执行卡按「${actualPrototypeLabel || actualPrototypeCode || "未标明"}」推进；${rhythmConsistency.detail}`,
    targetStageCode: "deepWriting",
    actionLabel: rhythmConsistencyReady ? undefined : "去校准执行卡",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "factCheck",
    label: "事实核查",
    status:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact) && missingEvidence.length === 0 && overallRisk !== "high"
        ? "passed"
        : factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? "warning"
          : "blocked",
    severity:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
        ? missingEvidence.length > 0 || overallRisk === "high"
          ? "warning"
          : "suggestion"
        : "blocking",
    detail:
      factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
        ? missingEvidence.length > 0
          ? `事实核查已跑完，但仍缺这些关键证据：${missingEvidence.join("；")}`
          : overallRisk === "high"
            ? "事实核查已完成，但仍存在高风险表述，建议先处理。"
            : "事实核查已完成。"
        : "发布前需要先完成事实核查。",
    targetStageCode: "factCheck",
    actionLabel: "去处理核查项",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "alignment",
    label: "系列口径与选题对齐",
    status: personaAlignment && topicAlignment ? "passed" : "warning",
    severity: personaAlignment && topicAlignment ? "suggestion" : "warning",
    detail:
      personaAlignment && topicAlignment
        ? `人设与选题已对齐：${personaAlignment} / ${topicAlignment}`
        : "尚未明确记录人设/主题对齐结论，建议回到事实核查阶段补齐。",
    targetStageCode: "factCheck",
    actionLabel: "去补对齐结论",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "material",
    label: "素材可用性",
    status:
      materialReadiness.attachedFragmentCount === 0 ? "warning" : materialReadiness.uniqueSourceTypeCount <= 1 ? "warning" : "passed",
    severity:
      materialReadiness.attachedFragmentCount === 0 ? "warning" : materialReadiness.uniqueSourceTypeCount <= 1 ? "warning" : "suggestion",
    detail:
      materialReadiness.attachedFragmentCount === 0
        ? "当前稿件没有挂载素材，发布前至少补 2 条可核对素材。"
        : materialReadiness.uniqueSourceTypeCount <= 1
          ? `当前只覆盖 ${materialReadiness.uniqueSourceTypeCount} 类来源，建议补链接或截图证据，避免单一信源。`
          : `当前已挂载 ${materialReadiness.attachedFragmentCount} 条素材，覆盖 ${materialReadiness.uniqueSourceTypeCount} 类来源。`,
    targetStageCode: "outlinePlanning",
    actionLabel: materialReadiness.attachedFragmentCount === 0 ? "去补素材" : materialReadiness.uniqueSourceTypeCount <= 1 ? "去补证据" : undefined,
  });

  if (outlineGapHints.length > 0) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "outline_material_gap",
      label: "大纲证据缺口",
      status: "warning",
      severity: "warning",
      detail: `大纲阶段仍提示这些素材缺口：${outlineGapHints.join("；")}`,
      targetStageCode: "outlinePlanning",
      actionLabel: "去补节点素材",
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "history_reference",
    label: "历史文章自然引用",
    status: historyReferencePlan.length > 0 ? "passed" : "warning",
    severity: historyReferencePlan.length > 0 ? "suggestion" : "warning",
    detail: historyReferencePlan.length > 0 ? "已配置旧文自然引用计划。" : "还没有旧文自然引用计划，若这是系列文章，建议补 1-2 篇旧文承接。",
    targetStageCode: "deepWriting",
    actionLabel: historyReferencePlan.length > 0 ? undefined : "去补旧文引用",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "prosePolish",
    label: "文笔润色",
    status: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? "passed" : "warning",
    severity: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? "suggestion" : "warning",
    detail:
      prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
        ? "润色与表达诊断已完成。"
        : "建议在发布前完成文笔润色，减少机器腔和节奏问题。",
    targetStageCode: "prosePolish",
    actionLabel: prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact) ? undefined : "去润色",
  });

  if (languageGuardHits.length > 0) {
    pushCheck(checks, blockers, warnings, suggestions, {
      key: "language_guard",
      label: "语言守卫",
      status: "warning",
      severity: "warning",
      detail: `当前仍命中 ${languageGuardHits.length} 条语言守卫规则，建议先清理明显机器味。`,
      targetStageCode: "prosePolish",
      actionLabel: "去清理措辞",
    });
  }

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "ai_noise",
    label: "AI 噪声",
    status: aiNoiseNeedsAttention ? "warning" : "passed",
    severity: aiNoiseNeedsAttention ? "warning" : "suggestion",
    detail:
      aiNoiseNeedsAttention
        ? [
            `AI 噪声得分 ${aiNoiseScore}`,
            aiNoiseScore >= 70 ? "空话或模板痕迹偏重" : null,
            aiNoiseHasRigidOutline ? "段落推进过于工整，像按施工图展开" : null,
            aiNoiseHasSummaryEnding ? "结尾仍带明显总结腔" : null,
          ].filter(Boolean).join("，")
        : `AI 噪声得分 ${aiNoiseScore}，当前风险可控。`,
    targetStageCode: "prosePolish",
    actionLabel: aiNoiseNeedsAttention ? "去精修段落" : undefined,
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "coverImage",
    label: "封面图",
    status: coverImage ? "passed" : "blocked",
    severity: coverImage ? "suggestion" : "blocking",
    detail: coverImage ? "封面图已准备。" : "发布前需要先选择封面图。",
    targetStageCode: "coverImage",
    actionLabel: coverImage ? undefined : "去选封面图",
  });

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "template",
    label: "排版模板",
    status: input.templateId ? (template ? "passed" : "warning") : "warning",
    severity: input.templateId ? (template ? "suggestion" : "warning") : "suggestion",
    detail: input.templateId ? (template ? "排版模板可用。" : "当前模板不可用，将回退到默认渲染。") : "未显式选择模板，将使用默认微信渲染样式。",
    targetStageCode: "layout",
    actionLabel: template ? undefined : "去检查模板",
  });

  const connectionHealth =
    connection == null
      ? {
          connectionName: null,
          status: "missing",
          detail: "尚未选择微信公众号连接。",
          tokenExpiresAt: null,
        }
      : connection.status === "disabled"
        ? {
            connectionName: connection.account_name ?? "未命名公众号",
            status: "disabled",
            detail: "当前微信公众号连接已停用，不能发布。",
            tokenExpiresAt: connection.access_token_expires_at,
          }
        : connection.status === "valid"
          ? {
              connectionName: connection.account_name ?? "未命名公众号",
              status: "valid",
              detail:
                latestAttempt?.status === "failed" && latestAttempt.failure_code === "auth_failed"
                  ? "连接配置存在最近一次鉴权失败记录，建议先重试校验。"
                  : "连接状态正常，可直接推送。",
              tokenExpiresAt: connection.access_token_expires_at,
            }
          : {
              connectionName: connection.account_name ?? "未命名公众号",
              status: connection.status,
              detail: "公众号连接已配置，但 Token 可能过期，建议先做自检或直接重试一次。",
              tokenExpiresAt: connection.access_token_expires_at,
            };

  pushCheck(checks, blockers, warnings, suggestions, {
    key: "wechatConnection",
    label: "微信公众号连接",
    status:
      connectionHealth.status === "valid"
        ? "passed"
        : connectionHealth.status === "missing" || connectionHealth.status === "disabled"
          ? "blocked"
          : "warning",
    severity:
      connectionHealth.status === "valid"
        ? "suggestion"
        : connectionHealth.status === "missing" || connectionHealth.status === "disabled"
          ? "blocking"
          : "warning",
    detail: connectionHealth.detail,
    actionLabel: connectionHealth.status === "valid" ? undefined : "去检查连接",
  });

  const stageReadiness: StageReadiness[] = [
    {
      stageCode: "researchBrief",
      title: "研究简报",
      status:
        !researchReady
          ? "needs_attention"
          : researchCoverageBlocked
            ? "blocked"
            : researchTimelineMissing || researchComparisonMissing || researchInsightMissing
              ? "needs_attention"
              : "ready",
      detail:
        !researchReady
          ? "建议先补研究问题、信源覆盖和交汇洞察，再把判断写硬。"
          : researchCoverageBlocked
            ? "研究层信源覆盖过窄，当前只适合观点草稿，不适合判断型长文。"
            : researchTimelineMissing || researchComparisonMissing || researchInsightMissing
              ? `研究简报已生成，但仍缺：${[
                  researchTimelineMissing ? "时间脉络" : null,
                  researchComparisonMissing ? "横向比较" : null,
                  researchInsightMissing ? "交汇洞察" : null,
                ]
                  .filter(Boolean)
                  .join("、")}。`
              : "研究层已补齐，可为策略和大纲提供结构判断。",
    },
    {
      stageCode: "audienceAnalysis",
      title: "策略卡",
      status:
        !strategyCardReady
          ? "blocked"
          : humanSignalScore < 2
            ? "blocked"
            : humanSignalScore >= 3 && fourPointAuditLockable
              ? "ready"
              : "needs_attention",
      detail: strategyCardReady
        ? humanSignalScore < 2
          ? "策略卡已确认，但人类信号不足，发布前需要先补。"
          : !fourPointAuditReady
            ? "策略卡已确认，但四元强度还没跑完，暂时不建议锁定。"
            : !fourPointAuditLockable
              ? `策略卡已确认，但四元强度仍偏弱：${fourPointWeakLabels.join("、")}。`
              : humanSignalScore >= 3
                ? "目标读者、核心判断、人类信号和四元强度都已到位。"
                : "策略卡已确认，四元强度达标，但人类信号仍偏薄，建议继续补真实观察和体感。"
        : strategyCard
          ? `策略卡仍缺：${strategyCardMissingFields.join("；")}。`
          : "先补并保存策略卡，再进入发布守门。",
    },
    {
      stageCode: "evidence",
      title: "证据包",
      status:
        evidenceStats.ready
          ? evidenceStats.status === "warning" || !hookCoverageReady
            ? "needs_attention"
            : "ready"
          : "blocked",
      detail: evidenceStats.ready
        ? evidenceStats.status === "warning"
          ? `证据包已确认，但仍建议处理：${evidenceStats.flags.join("；")}。`
          : !hookCoverageReady
            ? `证据包已确认，但爆点标签只覆盖 ${evidenceStats.hookTagCoverageCount} 类，建议继续补到至少 2 类。`
            : `已确认 ${evidenceStats.itemCount} 条证据，并覆盖 ${evidenceStats.hookTagCoverageCount} 类爆点标签。`
        : evidenceStats.detail,
    },
    {
      stageCode: "outlinePlanning",
      title: "大纲规划",
      status: outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact) ? "ready" : "blocked",
      detail:
        outlineArtifact?.status === "ready" && hasArtifactPayload(outlineArtifact)
          ? titleConfirmed
            ? "已确认标题、结构与素材入口。"
            : "大纲已生成，但标题还没明确确认。"
          : "先完成标题和结构规划。",
    },
    {
      stageCode: "deepWriting",
      title: "深度写作",
      status:
        deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
          ? historyReferencePlan.length > 0 && !rhythmConsistencyNeedsAttention && !openingNeedsAttention
            ? "ready"
            : "needs_attention"
          : "blocked",
      detail:
        deepWritingArtifact?.status === "ready" && hasArtifactPayload(deepWritingArtifact)
          ? openingHasBlockingIssues
            ? "执行卡已准备，但开头体检仍命中阻断项。"
            : openingNeedsAttention
              ? "执行卡已准备，但开头首段仍建议继续收紧钩子与第一屏节奏。"
            : rhythmConsistencyNeedsAttention
            ? "执行卡已准备，但当前正文原型和策略原型还没完全对齐。"
            : historyReferencePlan.length > 0
              ? "执行卡、系列承接与关键事实都已准备。"
              : "执行卡已准备，但系列旧文承接仍可补强。"
          : "先生成写作执行卡。",
    },
    {
      stageCode: "factCheck",
      title: "事实核查",
      status:
        factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? missingEvidence.length > 0 || overallRisk === "high"
            ? "needs_attention"
            : "ready"
          : "blocked",
      detail:
        factCheckArtifact?.status === "ready" && hasArtifactPayload(factCheckArtifact)
          ? missingEvidence.length > 0
            ? `仍有 ${missingEvidence.length} 个关键证据缺口待补。`
            : overallRisk === "high"
              ? "核查已完成，但仍存在高风险表述。"
              : "核查结果可用于发布前放行。"
          : "先完成事实核查。",
    },
    {
      stageCode: "prosePolish",
      title: "文笔润色",
      status:
        prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
          ? aiNoiseNeedsAttention || languageGuardHits.length > 0
            ? "needs_attention"
            : "ready"
          : "needs_attention",
      detail:
        prosePolishArtifact?.status === "ready" && hasArtifactPayload(prosePolishArtifact)
          ? aiNoiseNeedsAttention || languageGuardHits.length > 0
            ? "润色已完成，但仍建议处理 AI 噪声、结构过整齐或总结式收尾问题。"
            : "表达质量已基本收口。"
          : "可直接发布，但建议先做一次润色收口。",
    },
    {
      stageCode: "publish",
      title: "发布准备",
      status:
        !strategyCardReady
          || humanSignalScore < 2
          || !evidenceStats.ready
          || openingHasBlockingIssues
          ? "blocked"
          : coverImage
            && connectionHealth.status === "valid"
            && hookCoverageReady
            && fourPointAuditLockable
            && !rhythmConsistencyNeedsAttention
            && !openingNeedsAttention
            ? "ready"
            : coverImage
              || connectionHealth.status === "valid"
              || !hookCoverageReady
              || !fourPointAuditLockable
              || rhythmConsistencyNeedsAttention
              || openingNeedsAttention
              ? "needs_attention"
              : "blocked",
      detail:
        !strategyCardReady
          ? "策略卡尚未确认完成，发布仍处于阻断状态。"
          : humanSignalScore < 2
            ? "人类信号不足，正文还没有稳固的作者真实感，发布仍处于阻断状态。"
          : !evidenceStats.ready
            ? "证据包尚未确认到发布标准，发布仍处于阻断状态。"
          : openingHasBlockingIssues
            ? "开头体检未通过，发布仍处于阻断状态。"
          : coverImage
            && connectionHealth.status === "valid"
            && hookCoverageReady
            && fourPointAuditLockable
            && !rhythmConsistencyNeedsAttention
            && !openingNeedsAttention
            ? "连接、封面和模板已准备。"
            : `发布前仍建议处理这些方法论闸门：${[
                openingNeedsAttention ? "开头体检待处理" : null,
                !hookCoverageReady ? "爆点覆盖度不足" : null,
                !fourPointAuditLockable ? "四元强度未达锁定线" : null,
                rhythmConsistencyNeedsAttention ? "原型节奏还未对齐" : null,
                !coverImage ? "缺封面图" : null,
                connectionHealth.status !== "valid" ? "公众号连接待确认" : null,
              ]
                .filter(Boolean)
                .join("、")}。`,
    },
  ];

  return {
    canPublish: blockers.length === 0,
    blockers,
    warnings,
    suggestions,
    checks,
    stageReadiness,
    aiNoise: {
      score: Number.isFinite(aiNoiseScore) ? aiNoiseScore : 0,
      level: aiNoiseLevel || "unknown",
      findings: aiNoiseFindings,
      suggestions: aiNoiseSuggestions,
    },
    qualityPanel,
    materialReadiness,
    connectionHealth,
    latestAttempt: latestAttempt
      ? {
          status: latestAttempt.status,
          createdAt: latestAttempt.created_at,
          failureReason: latestAttempt.failure_reason,
          failureCode: latestAttempt.failure_code,
          retryCount: latestAttempt.retry_count ?? 0,
          mediaId: latestAttempt.media_id,
        }
      : null,
  };
}

export async function evaluateArticlePublishGuard(input: {
  articleId: number;
  userId: number;
  templateId?: string | null;
  wechatConnectionId?: number | null;
}) {
  return evaluatePublishGuard({
    articleId: input.articleId,
    userId: input.userId,
    templateId: input.templateId,
    wechatConnectionId: input.wechatConnectionId,
  });
}
