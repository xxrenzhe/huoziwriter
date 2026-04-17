import { ensureUserSession } from "@/lib/auth";
import { saveArticleDraft } from "@/lib/article-draft";
import { buildArticleArtifactRuntimeMetaPatch, getArticleStageArtifact, buildStageArtifactApplyCommand, isSupportedArticleArtifactStage, updateArticleStageArtifactPayload } from "@/lib/article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "@/lib/article-rollout";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { buildCommandRewrite, buildFactCheckTargetedRewrite, buildProsePolishTargetedRewrite } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { consumeDailyGenerationQuota, getUserPlanContext } from "@/lib/plan-access";
import { createArticleSnapshot, getArticleById } from "@/lib/repositories";
import { getActiveWritingEvalScoringProfile } from "@/lib/writing-eval";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    if (!isSupportedArticleArtifactStage(params.stageCode)) {
      return fail("当前阶段暂不支持应用到正文", 400);
    }

    await consumeDailyGenerationQuota(session.userId);

    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const artifact = await getArticleStageArtifact(article.id, session.userId, params.stageCode);
    if (!artifact?.payload) {
      return fail("当前阶段还没有可应用的结构化产物", 400);
    }

    const selectedTitle =
      artifact.payload.selection &&
      typeof artifact.payload.selection === "object" &&
      !Array.isArray(artifact.payload.selection)
        ? String((artifact.payload.selection as Record<string, unknown>).selectedTitle || "").trim()
        : "";
    const effectiveTitle = selectedTitle || article.title;

    const [planContext, writingContext, languageGuardRules, authoringStyleContext, researchBriefArtifact, deepWritingArtifact, activeScoringProfile] = await Promise.all([
      getUserPlanContext(session.userId),
      getArticleWritingContext({
        userId: session.userId,
        articleId: article.id,
        title: effectiveTitle,
        markdownContent: article.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      getArticleAuthoringStyleContext(session.userId, article.id),
      getArticleStageArtifact(article.id, session.userId, "researchBrief"),
      getArticleStageArtifact(article.id, session.userId, "deepWriting"),
      getActiveWritingEvalScoringProfile(),
    ]);
    const bannedWords = getLanguageGuardTokenBlacklist(languageGuardRules);

    const [layoutStrategy, applyCommandTemplate] = await Promise.all([
      resolveArticleLayoutStrategy({
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      }),
      artifact.stageCode === "deepWriting"
        ? resolveArticleApplyCommandTemplate({
            userId: session.userId,
            role: session.role,
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
      userId: session.userId,
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
              userId: session.userId,
              role: session.role,
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
                userId: session.userId,
                role: session.role,
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
              userId: session.userId,
              role: session.role,
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
        userId: session.userId,
        stageCode: artifact.stageCode,
        payloadPatch: buildArticleArtifactRuntimeMetaPatch({
          promptVersionRefs: rewritten.promptVersionRefs,
        }),
      });
    }

    await createArticleSnapshot(article.id, `阶段产物应用前快照：${artifact.title}`);
    const saved = await saveArticleDraft({
      articleId: article.id,
      userId: session.userId,
      body: {
        title: effectiveTitle,
        markdownContent: rewritten.markdown,
        status: "ready",
      },
    });

    return ok({
      id: saved?.id,
      markdownContent: saved?.markdown_content,
      htmlContent: saved?.html_content,
      status: saved?.status,
      title: saved?.title,
      command,
      stageCode: artifact.stageCode,
      stageTitle: artifact.title,
      applyMode: ["factCheck", "prosePolish"].includes(artifact.stageCode) ? "targeted" : "rewrite",
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "应用阶段产物失败", 400);
  }
}
