import { saveArticleDraft } from "@/lib/article-draft";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { getArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { ensureUserSession } from "@/lib/auth";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { resolveArticleLayoutStrategy } from "@/lib/article-rollout";
import { buildCommandRewrite } from "@/lib/generation";
import { fail, ok } from "@/lib/http";
import { getLanguageGuardRules, getLanguageGuardTokenBlacklist } from "@/lib/language-guard";
import { getUserPlanContext } from "@/lib/plan-access";
import { createArticleSnapshot, getArticleById } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const command = String(body.command || "").trim();
    if (!command) {
      return fail("缺少 command", 400);
    }

    const article = await getArticleById(Number(params.id), session.userId);
    if (!article) {
      return fail("稿件不存在", 404);
    }

    const planContext = await getUserPlanContext(session.userId);
    const [writingContext, authoringStyleContext, languageGuardRules, researchBriefArtifact, deepWritingArtifact, layoutStrategy] =
      await Promise.all([
        getArticleWritingContext({
          userId: session.userId,
          articleId: article.id,
          title: article.title,
          markdownContent: article.markdown_content,
        }),
        getArticleAuthoringStyleContext(session.userId, article.id),
        getLanguageGuardRules(session.userId),
        getArticleStageArtifact(article.id, session.userId, "researchBrief"),
        getArticleStageArtifact(article.id, session.userId, "deepWriting"),
        resolveArticleLayoutStrategy({
          userId: session.userId,
          role: session.role,
          planCode: planContext.effectivePlanCode,
        }),
      ]);

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
      researchBrief: researchBriefArtifact?.payload ?? null,
      humanSignals: writingContext.humanSignals,
      outlineNodes: writingContext.outlineNodes,
      knowledgeCards: writingContext.knowledgeCards,
      deepWritingPayload: deepWritingArtifact?.payload ?? null,
      layoutStrategy: layoutStrategy
        ? {
            name: layoutStrategy.name,
            ...layoutStrategy.config,
          }
        : null,
    });

    await createArticleSnapshot(article.id, "旧 command API 兼容改写前快照");
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
      title: saved?.title,
      markdownContent: saved?.markdown_content,
      htmlContent: saved?.html_content,
      status: saved?.status,
      command,
      promptVersionRefs: rewritten.promptVersionRefs,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "执行旧 command API 兼容改写失败", 400);
  }
}
