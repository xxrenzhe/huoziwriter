import { ensureUserSession } from "@/lib/auth";
import { saveArticleDraft } from "@/lib/article-draft";
import { buildArticleArtifactRuntimeMetaPatch, getArticleStageArtifact, updateArticleStageArtifactPayload } from "@/lib/article-stage-artifacts";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { resolveArticleLayoutStrategy } from "@/lib/article-rollout";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { buildCommandRewrite } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { consumeDailyGenerationQuota, getUserPlanContext } from "@/lib/plan-access";
import { createArticleSnapshot, getArticleById } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await consumeDailyGenerationQuota(session.userId);
    const body = await request.json();
    const command = String(body.command || "").trim();
    if (!command) {
      return fail("命令不能为空", 400);
    }

    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }
    const [planContext, writingContext, languageGuardRules, authoringStyleContext, deepWritingArtifact, researchBriefArtifact, prosePolishArtifact] = await Promise.all([
      getUserPlanContext(session.userId),
      getArticleWritingContext({
        userId: session.userId,
        articleId: article.id,
        title: article.title,
        markdownContent: article.markdown_content,
      }),
      getLanguageGuardRules(session.userId),
      getArticleAuthoringStyleContext(session.userId, article.id),
      getArticleStageArtifact(article.id, session.userId, "deepWriting"),
      getArticleStageArtifact(article.id, session.userId, "researchBrief"),
      getArticleStageArtifact(article.id, session.userId, "prosePolish"),
    ]);
    const layoutStrategy = await resolveArticleLayoutStrategy({
      userId: session.userId,
      role: session.role,
      planCode: planContext.effectivePlanCode,
    });

    const rewritten = await buildCommandRewrite({
      title: article.title,
      markdownContent: article.markdown_content,
      fragments: writingContext.fragments,
      bannedWords: getLanguageGuardTokenBlacklist(languageGuardRules),
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
      deepWritingPayload: deepWritingArtifact?.payload || null,
      layoutStrategy: layoutStrategy
        ? {
            name: layoutStrategy.name,
            ...layoutStrategy.config,
          }
        : null,
    });
    const runtimeAttributionStageCode = deepWritingArtifact?.payload ? "deepWriting" : prosePolishArtifact?.payload ? "prosePolish" : null;
    if (runtimeAttributionStageCode && rewritten.promptVersionRefs.length > 0) {
      await updateArticleStageArtifactPayload({
        articleId: article.id,
        userId: session.userId,
        stageCode: runtimeAttributionStageCode,
        payloadPatch: buildArticleArtifactRuntimeMetaPatch({
          promptVersionRefs: rewritten.promptVersionRefs,
        }),
      });
    }

    await createArticleSnapshot(article.id, `命令执行前快照：${command.slice(0, 24)}`);
    const saved = await saveArticleDraft({
      articleId: article.id,
      userId: session.userId,
      body: {
        markdownContent: rewritten.markdown,
        status: "ready",
      },
    });

    return ok({
      id: saved?.id,
      markdownContent: saved?.markdown_content,
      htmlContent: saved?.html_content,
      status: saved?.status,
      command,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "命令执行失败", 400);
  }
}
