import { saveArticleDraft } from "./article-draft";
import {
  buildArticleArtifactRuntimeMetaPatch,
  buildStageArtifactApplyCommand,
  getArticleStageArtifact,
  updateArticleStageArtifactPayload,
} from "./article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "./article-authoring-style-context";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "./article-rollout";
import { getArticleWritingContext } from "./article-writing-context";
import type { ArticleArtifactStageCode } from "./article-workflow-registry";
import { buildCommandRewrite, buildFactCheckTargetedRewrite, buildProsePolishTargetedRewrite } from "./generation";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "./language-guard";
import { consumeDailyGenerationQuota, getUserPlanContext } from "./plan-access";
import { createArticleSnapshot, getArticleById } from "./repositories";
import { getActiveWritingEvalScoringProfile } from "./writing-eval";
import { appendWritingStyleProfileUsageEvent } from "./writing-style-profiles";

export type ApplyArticleStageArtifactResult = {
  id: number;
  markdownContent: string;
  htmlContent: string;
  status: string;
  title: string;
  command: string;
  stageCode: ArticleArtifactStageCode;
  stageTitle: string;
  applyMode: "targeted" | "rewrite";
};

export async function applyArticleStageArtifact(input: {
  articleId: number;
  userId: number;
  role: string | null;
  stageCode: ArticleArtifactStageCode;
}): Promise<ApplyArticleStageArtifactResult> {
  await consumeDailyGenerationQuota(input.userId);

  const article = await getArticleById(input.articleId, input.userId);
  if (!article) {
    throw new Error("稿件不存在");
  }
  const artifact = await getArticleStageArtifact(article.id, input.userId, input.stageCode);
  if (!artifact?.payload) {
    throw new Error("当前阶段还没有可应用的结构化产物");
  }

  const selectedTitle =
    artifact.payload.selection &&
    typeof artifact.payload.selection === "object" &&
    !Array.isArray(artifact.payload.selection)
      ? String((artifact.payload.selection as Record<string, unknown>).selectedTitle || "").trim()
      : "";
  const effectiveTitle = selectedTitle || article.title;

  const [
    planContext,
    writingContext,
    languageGuardRules,
    authoringStyleContext,
    researchBriefArtifact,
    deepWritingArtifact,
    activeScoringProfile,
  ] = await Promise.all([
    getUserPlanContext(input.userId),
    getArticleWritingContext({
      userId: input.userId,
      articleId: article.id,
      title: effectiveTitle,
      markdownContent: article.markdown_content,
    }),
    getLanguageGuardRules(input.userId),
    getArticleAuthoringStyleContext(input.userId, article.id),
    getArticleStageArtifact(article.id, input.userId, "researchBrief"),
    getArticleStageArtifact(article.id, input.userId, "deepWriting"),
    getActiveWritingEvalScoringProfile(),
  ]);
  const bannedWords = getLanguageGuardTokenBlacklist(languageGuardRules);

  const [layoutStrategy, applyCommandTemplate] = await Promise.all([
    resolveArticleLayoutStrategy({
      userId: input.userId,
      role: input.role,
      planCode: planContext.effectivePlanCode,
    }),
    artifact.stageCode === "deepWriting"
      ? resolveArticleApplyCommandTemplate({
          userId: input.userId,
          role: input.role,
          planCode: planContext.effectivePlanCode,
        })
      : Promise.resolve(null),
  ]);
  const layoutStrategyConfig = layoutStrategy
    ? {
        name: layoutStrategy.name,
        ...layoutStrategy.config,
      }
    : null;
  const command = buildStageArtifactApplyCommand(artifact, {
    templateCode: applyCommandTemplate?.code ?? null,
    strategyCard: writingContext.strategyCard ?? null,
  });
  await updateArticleStageArtifactPayload({
    articleId: article.id,
    userId: input.userId,
    stageCode: artifact.stageCode,
    payloadPatch: buildArticleArtifactRuntimeMetaPatch({
      scoringProfile: activeScoringProfile
        ? {
            code: activeScoringProfile.code,
            name: activeScoringProfile.name,
          }
        : null,
      layoutStrategy: layoutStrategy
        ? {
            id: layoutStrategy.id,
            code: layoutStrategy.code,
            name: layoutStrategy.name,
            resolutionMode: layoutStrategy.resolutionMode,
            resolutionReason: layoutStrategy.resolutionReason,
          }
        : null,
      applyCommandTemplate: applyCommandTemplate
        ? {
            code: applyCommandTemplate.code,
            name: applyCommandTemplate.name,
            resolutionMode: applyCommandTemplate.resolutionMode,
            resolutionReason: applyCommandTemplate.resolutionReason,
          }
        : null,
    }),
  });
  const rewritten =
    artifact.stageCode === "factCheck"
      ? await buildFactCheckTargetedRewrite({
          title: effectiveTitle,
          markdownContent: article.markdown_content,
          fragments: writingContext.fragments,
          bannedWords,
          promptContext: {
            userId: input.userId,
            role: input.role,
            planCode: planContext.effectivePlanCode,
          },
          persona: authoringStyleContext.persona,
          writingStyleProfile: authoringStyleContext.writingStyleProfile,
          strategyCard: writingContext.strategyCard,
          seriesInsight: writingContext.seriesInsight,
          researchBrief: researchBriefArtifact?.payload || null,
          humanSignals: writingContext.humanSignals,
          checks: Array.isArray(artifact.payload.checks)
            ? artifact.payload.checks
                .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                .filter(Boolean)
                .map((item) => ({
                  claim: String(item?.claim || "").trim(),
                  status: String(item?.status || "").trim(),
                  suggestion: String(item?.suggestion || "").trim(),
                }))
            : [],
          claimDecisions:
            artifact.payload.selection &&
            typeof artifact.payload.selection === "object" &&
            !Array.isArray(artifact.payload.selection) &&
            Array.isArray((artifact.payload.selection as Record<string, unknown>).claimDecisions)
              ? ((artifact.payload.selection as Record<string, unknown>).claimDecisions as unknown[])
                  .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                  .filter(Boolean)
                  .map((item) => ({
                    claim: String(item?.claim || "").trim(),
                    action: String(item?.action || "").trim(),
                    note: String(item?.note || "").trim(),
                  }))
                  .filter((item) => item.claim && item.action)
              : [],
          evidenceCards: Array.isArray(artifact.payload.evidenceCards)
            ? artifact.payload.evidenceCards
                .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                .filter(Boolean)
                .map((item) => ({
                  claim: String(item?.claim || "").trim(),
                  supportLevel: String(item?.supportLevel || "").trim(),
                  supportingEvidence: Array.isArray(item?.supportingEvidence)
                    ? item.supportingEvidence
                        .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                        .filter(Boolean)
                        .map((evidence) => ({
                          title: String(evidence?.title || "").trim(),
                          excerpt: String(evidence?.excerpt || "").trim(),
                          sourceType: String(evidence?.sourceType || "").trim(),
                          sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                          rationale: String(evidence?.rationale || "").trim(),
                        }))
                    : Array.isArray(item?.evidenceItems)
                      ? item.evidenceItems
                          .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                          .filter(Boolean)
                          .map((evidence) => ({
                            title: String(evidence?.title || "").trim(),
                            excerpt: String(evidence?.excerpt || "").trim(),
                            sourceType: String(evidence?.sourceType || "").trim(),
                            sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                            rationale: String(evidence?.rationale || "").trim(),
                          }))
                      : [],
                  counterEvidence: Array.isArray(item?.counterEvidence)
                    ? item.counterEvidence
                        .map((evidence) => (evidence && typeof evidence === "object" ? evidence as Record<string, unknown> : null))
                        .filter(Boolean)
                        .map((evidence) => ({
                          title: String(evidence?.title || "").trim(),
                          excerpt: String(evidence?.excerpt || "").trim(),
                          sourceType: String(evidence?.sourceType || "").trim(),
                          sourceUrl: String(evidence?.sourceUrl || "").trim() || null,
                          rationale: String(evidence?.rationale || "").trim(),
                        }))
                    : [],
                }))
            : [],
          outlineNodes: writingContext.outlineNodes,
          knowledgeCards: writingContext.knowledgeCards,
          deepWritingPayload: deepWritingArtifact?.payload || null,
          layoutStrategy: layoutStrategyConfig,
        })
      : artifact.stageCode === "prosePolish"
        ? await buildProsePolishTargetedRewrite({
            title: effectiveTitle,
            markdownContent: article.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            promptContext: {
              userId: input.userId,
              role: input.role,
              planCode: planContext.effectivePlanCode,
            },
            rewrittenLead: String(artifact.payload.rewrittenLead || "").trim() || null,
            issues: Array.isArray(artifact.payload.issues)
              ? artifact.payload.issues
                  .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
                  .filter(Boolean)
                  .map((item) => ({
                    type: String(item?.type || "").trim(),
                    example: String(item?.example || "").trim(),
                    suggestion: String(item?.suggestion || "").trim(),
                  }))
              : [],
            punchlines: Array.isArray(artifact.payload.punchlines)
              ? artifact.payload.punchlines.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            rhythmAdvice: Array.isArray(artifact.payload.rhythmAdvice)
              ? artifact.payload.rhythmAdvice.map((item) => String(item || "").trim()).filter(Boolean)
              : [],
            persona: authoringStyleContext.persona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
            strategyCard: writingContext.strategyCard,
            seriesInsight: writingContext.seriesInsight,
            researchBrief: researchBriefArtifact?.payload || null,
            humanSignals: writingContext.humanSignals,
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            deepWritingPayload: deepWritingArtifact?.payload || null,
            layoutStrategy: layoutStrategyConfig,
          })
        : await buildCommandRewrite({
            title: effectiveTitle,
            markdownContent: article.markdown_content,
            fragments: writingContext.fragments,
            bannedWords,
            command,
            promptContext: {
              userId: input.userId,
              role: input.role,
              planCode: planContext.effectivePlanCode,
            },
            persona: authoringStyleContext.persona,
            writingStyleProfile: authoringStyleContext.writingStyleProfile,
            strategyCard: writingContext.strategyCard,
            seriesInsight: writingContext.seriesInsight,
            researchBrief: researchBriefArtifact?.payload || null,
            humanSignals: writingContext.humanSignals,
            outlineNodes: writingContext.outlineNodes,
            knowledgeCards: writingContext.knowledgeCards,
            deepWritingPayload: (artifact.stageCode === "deepWriting" ? artifact.payload : deepWritingArtifact?.payload) || null,
            layoutStrategy: layoutStrategyConfig,
          });
  if (rewritten.promptVersionRefs.length > 0) {
    await updateArticleStageArtifactPayload({
      articleId: article.id,
      userId: input.userId,
      stageCode: artifact.stageCode,
      payloadPatch: buildArticleArtifactRuntimeMetaPatch({
        promptVersionRefs: rewritten.promptVersionRefs,
      }),
    });
  }

  await createArticleSnapshot(article.id, `阶段产物应用前快照：${artifact.title}`);
  const saved = await saveArticleDraft({
    articleId: article.id,
    userId: input.userId,
    body: {
      title: effectiveTitle,
      markdownContent: rewritten.markdown,
      status: "ready",
    },
  });
  if (!saved) {
    throw new Error("稿件不存在");
  }
  if (authoringStyleContext.writingStyleProfile?.id) {
    await appendWritingStyleProfileUsageEvent({
      userId: input.userId,
      profileId: authoringStyleContext.writingStyleProfile.id,
      articleId: article.id,
      usageSource: `article.stage.apply.${artifact.stageCode}`,
      profileName: authoringStyleContext.writingStyleProfile.name,
      sampleCount: authoringStyleContext.writingStyleProfile.sampleCount,
    });
  }

  return {
    id: saved.id,
    markdownContent: saved.markdown_content || "",
    htmlContent: saved.html_content || "",
    status: saved.status || "ready",
    title: saved.title || effectiveTitle,
    command,
    stageCode: artifact.stageCode,
    stageTitle: artifact.title,
    applyMode: ["factCheck", "prosePolish"].includes(artifact.stageCode) ? "targeted" : "rewrite",
  };
}
