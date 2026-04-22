import { randomUUID } from "node:crypto";
import { ensureUserSession } from "@/lib/auth";
import { buildArticleArtifactRuntimeMetaPatch, buildStageArtifactApplyCommand, getArticleStageArtifact, updateArticleStageArtifactPayload } from "@/lib/article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { getSavedArticleHistoryReferences } from "@/lib/article-history-references";
import { getResearchBriefGenerationGate } from "@/lib/article-research";
import { resolveArticleApplyCommandTemplate, resolveArticleLayoutStrategy } from "@/lib/article-rollout";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { buildGeneratedArticleDraft, splitIntoChunks } from "@/lib/generation";
import { fail } from "@/lib/http";
import { consumeDailyGenerationQuota, getUserPlanContext } from "@/lib/plan-access";
import { createArticleSnapshot, getArticleById } from "@/lib/repositories";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { getActiveWritingEvalScoringProfile } from "@/lib/writing-eval";
import { createPendingWritingStyleProfileStreamUsage } from "@/lib/writing-style-profiles";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
    if (!session) {
      return fail("未登录", 401);
    }
  try {
    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const researchArtifactPromise = getArticleStageArtifact(article.id, session.userId, "researchBrief");
    const outlineArtifactPromise = getArticleStageArtifact(article.id, session.userId, "outlinePlanning");
    const deepWritingArtifactPromise = getArticleStageArtifact(article.id, session.userId, "deepWriting");
    const [planContext, researchArtifact, outlineArtifact, deepWritingArtifact, writingContext, languageGuardRules, authoringStyleContext, historyReferences, activeScoringProfile] = await Promise.all([
      getUserPlanContext(session.userId),
      researchArtifactPromise,
      outlineArtifactPromise,
      deepWritingArtifactPromise,
      getArticleWritingContext({
        userId: session.userId,
        articleId: article.id,
        title: article.title,
        markdownContent: article.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      getArticleAuthoringStyleContext(session.userId, article.id),
      getSavedArticleHistoryReferences(article.id),
      getActiveWritingEvalScoringProfile(),
    ]);
    const researchGate = getResearchBriefGenerationGate(researchArtifact?.payload ?? null);
    if (researchGate.generationBlocked) {
      return fail(researchGate.generationBlockReason, 409);
    }
    await consumeDailyGenerationQuota(session.userId);
    const usableHistoryReferences = planContext.planSnapshot.canUseHistoryReferences ? historyReferences : [];
    const [layoutStrategy, applyCommandTemplate] = await Promise.all([
      resolveArticleLayoutStrategy({
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      }),
      deepWritingArtifact?.payload
        ? resolveArticleApplyCommandTemplate({
            userId: session.userId,
            role: session.role,
            planCode: planContext.effectivePlanCode,
          })
        : Promise.resolve(null),
    ]);
    const deepWritingGuide = deepWritingArtifact?.payload
      ? buildStageArtifactApplyCommand(deepWritingArtifact, {
          templateCode: applyCommandTemplate?.code ?? null,
        })
      : "";
    if (deepWritingArtifact?.payload) {
      await updateArticleStageArtifactPayload({
        articleId: article.id,
        userId: session.userId,
        stageCode: "deepWriting",
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
    }
    const preferredTitle = (() => {
      const selection = outlineArtifact?.payload?.selection;
      return selection && typeof selection === "object" && !Array.isArray(selection)
        ? String((selection as Record<string, unknown>).selectedTitle || "").trim() || article.title
        : article.title;
    })();
    await createArticleSnapshot(article.id, "流式生成前快照");
    const generated = await buildGeneratedArticleDraft({
      title: preferredTitle,
      fragments: writingContext.fragments,
      bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
      promptContext: {
        userId: session.userId,
        role: session.role,
        planCode: planContext.effectivePlanCode,
      },
      persona: authoringStyleContext.persona,
      writingStyleProfile: authoringStyleContext.writingStyleProfile,
      strategyCard: writingContext.strategyCard,
      seriesInsight: writingContext.seriesInsight,
      researchBrief: researchArtifact?.payload ?? null,
      humanSignals: writingContext.humanSignals,
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
      imageFragments: writingContext.imageFragments
        .filter((item): item is typeof item & { screenshotPath: string } => Boolean(item.screenshotPath))
        .map((item) => ({
          id: item.id,
          title: item.title,
          screenshotPath: item.screenshotPath,
        })),
      historyReferences: usableHistoryReferences.map((item) => ({
        title: item.title,
        relationReason: item.relationReason,
        bridgeSentence: item.bridgeSentence,
      })),
      deepWritingPayload: deepWritingArtifact?.payload ?? null,
      deepWritingGuide,
      layoutStrategy: layoutStrategy
        ? {
            name: layoutStrategy.name,
            ...layoutStrategy.config,
          }
        : null,
    });
    if (deepWritingArtifact?.payload && generated.promptVersionRefs.length > 0) {
      await updateArticleStageArtifactPayload({
        articleId: article.id,
        userId: session.userId,
        stageCode: "deepWriting",
        payloadPatch: buildArticleArtifactRuntimeMetaPatch({
          promptVersionRefs: generated.promptVersionRefs,
        }),
      });
    }
    const chunks = splitIntoChunks(generated.markdown);
    const usageToken = authoringStyleContext.writingStyleProfile?.id ? randomUUID() : null;
    if (usageToken && authoringStyleContext.writingStyleProfile?.id) {
      await createPendingWritingStyleProfileStreamUsage({
        userId: session.userId,
        profileId: authoringStyleContext.writingStyleProfile.id,
        articleId: article.id,
        usageToken,
        profileName: authoringStyleContext.writingStyleProfile.name,
        sampleCount: authoringStyleContext.writingStyleProfile.sampleCount,
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(`data: ${JSON.stringify({ status: "start", usageToken })}\n\n`);
        for (const chunk of chunks) {
          controller.enqueue(`data: ${JSON.stringify({ status: "writing", delta: chunk })}\n\n`);
        }
        controller.enqueue(`data: ${JSON.stringify({ status: "done", usageToken })}\n\n`);
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "流式生成失败", 400);
  }
}
