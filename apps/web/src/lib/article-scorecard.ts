import { analyzeAiNoise } from "./ai-noise-scan";
import type { ArticleStageArtifact } from "./article-stage-artifacts";
import type { ArticleWorkflowStage } from "./article-workflows";

type ScorecardNodeFragment = {
  id: number;
  sourceType?: string | null;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string | null;
};

type ScorecardNode = {
  id: number;
  title: string;
  description: string | null;
  fragments: ScorecardNodeFragment[];
};

export type ArticleScorecard = {
  version: "v1";
  generatedAt: string;
  qualityScore: number;
  viralScore: number;
  riskPenalty: number;
  predictedScore: number;
  summary: string;
  blockers: string[];
  signalScores: {
    topicMomentumScore: number;
    headlineScore: number;
    hookScore: number;
    shareabilityScore: number;
    readerValueScore: number;
    noveltyScore: number;
    platformFitScore: number;
  };
  evidence: {
    fragmentCount: number;
    uniqueSourceTypeCount: number;
    externalEvidenceCount: number;
    screenshotEvidenceCount: number;
  };
  workflow: {
    currentStageCode: string;
    completedStageCount: number;
    completedMainStepCount: number;
  };
  aiNoise: {
    score: number;
    level: string;
  };
  attribution: {
    promptVersionRefs: string[];
    scoringProfileCode: string | null;
    scoringProfileName: string | null;
    layoutStrategyId: number | null;
    layoutStrategyCode: string | null;
    layoutStrategyName: string | null;
    layoutStrategyResolutionMode: string | null;
    layoutStrategyResolutionReason: string | null;
    applyCommandTemplateCode: string | null;
    applyCommandTemplateName: string | null;
    applyCommandResolutionMode: string | null;
    applyCommandResolutionReason: string | null;
  };
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueFragments(nodes: ScorecardNode[]) {
  const map = new Map<number, ScorecardNodeFragment>();
  for (const node of nodes) {
    for (const fragment of node.fragments) {
      map.set(fragment.id, fragment);
    }
  }
  return Array.from(map.values());
}

function sentenceCount(markdown: string) {
  return markdown
    .split(/[。！？!?；;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function paragraphCount(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function listItemCount(markdown: string) {
  return (markdown.match(/^\s*([-*]|\d+\.)\s+/gm) || []).length;
}

function containsContrast(text: string) {
  return /(不是|而是|真正|但|却|反而|问题在于|很多人|大多数)/.test(text);
}

function getArtifact(stageArtifacts: ArticleStageArtifact[], stageCode: ArticleStageArtifact["stageCode"]) {
  return stageArtifacts.find((item) => item.stageCode === stageCode) ?? null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRuntimeMetas(stageArtifacts: ArticleStageArtifact[]) {
  const orderedStageCodes: Array<ArticleStageArtifact["stageCode"]> = [
    "deepWriting",
    "prosePolish",
    "factCheck",
    "outlinePlanning",
    "audienceAnalysis",
    "researchBrief",
  ];
  const metas: Record<string, unknown>[] = [];
  for (const stageCode of orderedStageCodes) {
    const runtimeMeta = getRecord(getArtifact(stageArtifacts, stageCode)?.payload?.runtimeMeta);
    if (runtimeMeta) {
      metas.push(runtimeMeta);
    }
  }
  return metas;
}

function getPromptVersionRefs(runtimeMetas: Record<string, unknown>[]) {
  const refs = new Set<string>();
  for (const runtimeMeta of runtimeMetas) {
    const promptVersionRefs = Array.isArray(runtimeMeta.promptVersionRefs)
      ? runtimeMeta.promptVersionRefs.map((item) => getString(item)).filter(Boolean)
      : [];
    for (const ref of promptVersionRefs) {
      refs.add(ref);
    }
    const promptVersion = getRecord(runtimeMeta.promptVersion);
    const ref =
      getString(promptVersion?.ref)
      || (() => {
        const promptId = getString(promptVersion?.promptId);
        const version = getString(promptVersion?.version);
        return promptId && version ? `${promptId}@${version}` : "";
      })();
    if (ref) {
      refs.add(ref);
    }
  }
  return Array.from(refs);
}

function countCompletedMainSteps(workflowStages: ArticleWorkflowStage[]) {
  const currentIndex = workflowStages.findIndex((item) => item.status === "current");
  if (currentIndex < 0) {
    return workflowStages.filter((item) => item.status === "completed").length;
  }
  if (workflowStages[currentIndex]?.code === "publish") {
    return 5;
  }
  if (workflowStages[currentIndex]?.code === "deepWriting" || workflowStages[currentIndex]?.code === "prosePolish") {
    return 4;
  }
  if (workflowStages[currentIndex]?.code === "outlinePlanning" || workflowStages[currentIndex]?.code === "factCheck") {
    return 3;
  }
  if (workflowStages[currentIndex]?.code === "researchBrief" || workflowStages[currentIndex]?.code === "audienceAnalysis") {
    return 2;
  }
  return 1;
}

export function buildArticleScorecard(input: {
  title: string;
  markdownContent: string;
  status: string;
  activeScoringProfile?: {
    code: string;
    name: string;
  } | null;
  workflow: {
    currentStageCode: string;
    stages: ArticleWorkflowStage[];
  };
  stageArtifacts: ArticleStageArtifact[];
  nodes: ScorecardNode[];
}) {
  const title = input.title.trim();
  const markdown = input.markdownContent.trim();
  const aiNoise = analyzeAiNoise(markdown);
  const fragments = uniqueFragments(input.nodes);
  const uniqueSourceTypes = new Set(fragments.map((fragment) => String(fragment.sourceType || "manual")));
  const externalEvidenceCount = fragments.filter((fragment) => Boolean(fragment.sourceUrl)).length;
  const screenshotEvidenceCount = fragments.filter(
    (fragment) => Boolean(fragment.screenshotPath) || String(fragment.sourceType || "") === "screenshot" || String(fragment.usageMode || "") === "image",
  ).length;
  const completedStageCount = input.workflow.stages.filter((stage) => stage.status === "completed").length;
  const completedMainStepCount = countCompletedMainSteps(input.workflow.stages);
  const firstParagraph = markdown.split(/\n{2,}/).map((item) => item.trim()).find(Boolean) || "";
  const avgParagraphLength = average(
    markdown
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.length),
  );
  const factCheckReady = getArtifact(input.stageArtifacts, "factCheck")?.status === "ready";
  const prosePolishReady = getArtifact(input.stageArtifacts, "prosePolish")?.status === "ready";
  const outlineReady = getArtifact(input.stageArtifacts, "outlinePlanning")?.status === "ready";
  const audienceReady = getArtifact(input.stageArtifacts, "audienceAnalysis")?.status === "ready";
  const deepWritingReady = getArtifact(input.stageArtifacts, "deepWriting")?.status === "ready";
  const runtimeMetas = getRuntimeMetas(input.stageArtifacts);
  const runtimeMeta = runtimeMetas[0] ?? null;
  const scoringProfileMeta = getRecord(runtimeMeta?.scoringProfile);
  const layoutStrategyMeta = getRecord(runtimeMeta?.layoutStrategy);
  const applyCommandTemplateMeta = getRecord(runtimeMeta?.applyCommandTemplate);
  const promptVersionRefs = getPromptVersionRefs(runtimeMetas);

  const topicMomentumScore = clamp(
    35
      + (title ? 10 : -20)
      + (containsContrast(title) ? 18 : 0)
      + (outlineReady ? 10 : 0)
      + (audienceReady ? 7 : 0)
      + (fragments.length >= 3 ? 10 : fragments.length * 3)
      + (screenshotEvidenceCount > 0 ? 6 : 0),
  );
  const headlineScore = clamp(
    28
      + (title.length >= 12 && title.length <= 30 ? 24 : title.length >= 8 ? 14 : 0)
      + (/\d/.test(title) ? 10 : 0)
      + (containsContrast(title) ? 16 : 0)
      + (/[？?]/.test(title) ? 6 : 0),
  );
  const hookScore = clamp(
    25
      + (firstParagraph.length >= 45 && firstParagraph.length <= 180 ? 18 : firstParagraph.length > 0 ? 10 : 0)
      + (containsContrast(firstParagraph) ? 16 : 0)
      + (/[？?]/.test(firstParagraph) ? 8 : 0)
      + (paragraphCount(markdown) >= 5 ? 8 : 0),
  );
  const shareabilityScore = clamp(
    24
      + (listItemCount(markdown) >= 2 ? 16 : 0)
      + (paragraphCount(markdown) >= 6 ? 14 : paragraphCount(markdown) * 2)
      + (avgParagraphLength > 0 && avgParagraphLength <= 120 ? 14 : 6)
      + (containsContrast(markdown) ? 8 : 0),
  );
  const readerValueScore = clamp(
    26
      + (audienceReady ? 18 : 0)
      + (outlineReady ? 14 : 0)
      + (deepWritingReady ? 10 : 0)
      + (sentenceCount(markdown) >= 16 ? 12 : sentenceCount(markdown))
      + (factCheckReady ? 6 : 0),
  );
  const noveltyScore = clamp(
    22
      + (containsContrast(title) ? 18 : 0)
      + (containsContrast(firstParagraph) ? 16 : 0)
      + (/\d/.test(title) ? 8 : 0)
      + (screenshotEvidenceCount > 0 ? 10 : 0),
  );
  const platformFitScore = clamp(
    26
      + (avgParagraphLength > 0 && avgParagraphLength <= 110 ? 18 : 8)
      + (paragraphCount(markdown) >= 6 ? 14 : paragraphCount(markdown) * 2)
      + (input.status === "published" ? 14 : 0)
      + (prosePolishReady ? 10 : 0),
  );

  const signalScores = {
    topicMomentumScore: Math.round(topicMomentumScore),
    headlineScore: Math.round(headlineScore),
    hookScore: Math.round(hookScore),
    shareabilityScore: Math.round(shareabilityScore),
    readerValueScore: Math.round(readerValueScore),
    noveltyScore: Math.round(noveltyScore),
    platformFitScore: Math.round(platformFitScore),
  };

  const qualityScore = Math.round(
    clamp(
      30
        + completedStageCount * 4
        + (fragments.length >= 3 ? 16 : fragments.length * 4)
        + (uniqueSourceTypes.size >= 2 ? 12 : 0)
        + (externalEvidenceCount > 0 ? 8 : 0)
        + (factCheckReady ? 12 : 0)
        + (prosePolishReady ? 10 : 0)
        + (deepWritingReady ? 8 : 0)
        - aiNoise.score * 0.28,
    ),
  );

  const viralScore = Math.round(
    average([
      signalScores.topicMomentumScore,
      signalScores.headlineScore,
      signalScores.hookScore,
      signalScores.shareabilityScore,
      signalScores.readerValueScore,
      signalScores.noveltyScore,
      signalScores.platformFitScore,
    ]),
  );

  const riskPenalty = Math.round(
    clamp(
      aiNoise.score * 0.35
        + (fragments.length < 3 ? 12 : 0)
        + (externalEvidenceCount === 0 && screenshotEvidenceCount === 0 ? 10 : 0)
        + (!factCheckReady ? 12 : 0),
      0,
      40,
    ),
  );

  const predictedScore = Math.round(clamp(qualityScore * 0.45 + viralScore * 0.55 - riskPenalty));
  const blockers = [
    !title ? "标题仍为空，无法形成稳定预测。" : null,
    fragments.length < 3 ? "证据包仍未达到最小素材集。" : null,
    externalEvidenceCount === 0 && screenshotEvidenceCount === 0 ? "缺少外部来源或截图证据。" : null,
    !factCheckReady ? "事实核查尚未完成。" : null,
    aiNoise.score >= 70 ? "机器腔仍偏重，预测分会被持续压低。" : null,
  ].filter(Boolean) as string[];
  const summary = blockers.length > 0
    ? `当前预测分 ${predictedScore}。优先处理：${blockers.slice(0, 2).join("；")}`
    : `当前预测分 ${predictedScore}，质量 ${qualityScore} / 爆款 ${viralScore} / 风险扣分 ${riskPenalty}。`;

  return {
    version: "v1" as const,
    generatedAt: new Date().toISOString(),
    qualityScore,
    viralScore,
    riskPenalty,
    predictedScore,
    summary,
    blockers,
    signalScores,
    evidence: {
      fragmentCount: fragments.length,
      uniqueSourceTypeCount: uniqueSourceTypes.size,
      externalEvidenceCount,
      screenshotEvidenceCount,
    },
    workflow: {
      currentStageCode: input.workflow.currentStageCode,
      completedStageCount,
      completedMainStepCount,
    },
    aiNoise: {
      score: aiNoise.score,
      level: aiNoise.level,
    },
    attribution: {
      promptVersionRefs,
      scoringProfileCode: getString(scoringProfileMeta?.code) || input.activeScoringProfile?.code || null,
      scoringProfileName: getString(scoringProfileMeta?.name) || input.activeScoringProfile?.name || null,
      layoutStrategyId: getNumber(layoutStrategyMeta?.id) ?? null,
      layoutStrategyCode: getString(layoutStrategyMeta?.code) || null,
      layoutStrategyName: getString(layoutStrategyMeta?.name) || null,
      layoutStrategyResolutionMode: getString(layoutStrategyMeta?.resolutionMode) || null,
      layoutStrategyResolutionReason: getString(layoutStrategyMeta?.resolutionReason) || null,
      applyCommandTemplateCode: getString(applyCommandTemplateMeta?.code) || null,
      applyCommandTemplateName: getString(applyCommandTemplateMeta?.name) || null,
      applyCommandResolutionMode: getString(applyCommandTemplateMeta?.resolutionMode) || null,
      applyCommandResolutionReason: getString(applyCommandTemplateMeta?.resolutionReason) || null,
    },
  } satisfies ArticleScorecard;
}

export function computeObservedOutcomeScore(input: {
  hitStatus?: "pending" | "hit" | "near_miss" | "miss" | null;
  snapshots: Array<{
    readCount: number;
    shareCount: number;
    likeCount: number;
  }>;
}) {
  if (input.snapshots.length === 0) {
    return null;
  }
  const maxReadCount = Math.max(...input.snapshots.map((item) => Math.max(0, Number(item.readCount || 0))));
  const maxShareRate = Math.max(
    ...input.snapshots.map((item) => (item.readCount > 0 ? (Math.max(0, Number(item.shareCount || 0)) / item.readCount) * 100 : 0)),
  );
  const maxLikeRate = Math.max(
    ...input.snapshots.map((item) => (item.readCount > 0 ? (Math.max(0, Number(item.likeCount || 0)) / item.readCount) * 100 : 0)),
  );
  const readCurve = clamp(Math.log10(maxReadCount + 1) * 20);
  const engagementCurve = clamp(maxShareRate * 8 + maxLikeRate * 6);
  let observedScore = readCurve * 0.6 + engagementCurve * 0.4;
  if (input.hitStatus === "hit") observedScore = Math.max(observedScore, 78);
  if (input.hitStatus === "near_miss") observedScore = Math.max(observedScore, 62);
  if (input.hitStatus === "miss") observedScore = Math.min(observedScore, 54);
  return Number(clamp(observedScore).toFixed(2));
}
