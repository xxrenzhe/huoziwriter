import { buildFourPointAudit } from "@/lib/article-strategy";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertPersonaReady } from "@/lib/personas";
import { createArticle, getArticleStrategyCard, getArticlesByUser, upsertArticleStrategyCard } from "@/lib/repositories";
import { buildFallbackStrategyCardAutoDraft, generateStrategyCardAutoDraft, type StrategyCardAutoDraft } from "@/lib/strategy-card-auto-draft";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const articles = await getArticlesByUser(session.userId);
  return ok(
    articles.map((article) => ({
      id: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
      htmlContent: article.html_content,
      status: normalizeArticleStatus(article.status),
      seriesId: article.series_id,
      updatedAt: article.updated_at,
      createdAt: article.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertPersonaReady(session.userId);
    const body = await request.json();
    const title = String(body.title || "未命名稿件").trim() || "未命名稿件";
    const article = await createArticle(session.userId, title, body.seriesId);
    if (article?.id) {
      const currentStrategyCard = await getArticleStrategyCard(Number(article.id), session.userId);
      const fallbackDraft = buildFallbackStrategyCardAutoDraft({
        title,
        strategyCard: currentStrategyCard ?? null,
      });
      const autoDraft: StrategyCardAutoDraft = await generateStrategyCardAutoDraft({
        title,
        summary: title === "未命名稿件" ? null : `新建稿件标题：${title}`,
        sourceName: "手动新建稿件",
        readerSnapshotHint: title === "未命名稿件" ? null : `读者刚看到“${title}”时会怎么理解、误判或犹豫`,
        strategyCard: currentStrategyCard ?? null,
      }).catch(() => ({} as StrategyCardAutoDraft));
      const nextStrategyCard = {
        ...fallbackDraft,
        ...autoDraft,
        archetype: currentStrategyCard?.archetype ?? autoDraft.archetype ?? fallbackDraft.archetype,
        mainstreamBelief: currentStrategyCard?.mainstreamBelief ?? autoDraft.mainstreamBelief ?? fallbackDraft.mainstreamBelief,
        targetReader: currentStrategyCard?.targetReader ?? autoDraft.targetReader ?? fallbackDraft.targetReader,
        coreAssertion: currentStrategyCard?.coreAssertion ?? autoDraft.coreAssertion ?? fallbackDraft.coreAssertion,
        whyNow: currentStrategyCard?.whyNow ?? autoDraft.whyNow ?? fallbackDraft.whyNow,
        targetPackage: currentStrategyCard?.targetPackage ?? autoDraft.targetPackage,
        realSceneOrDialogue: currentStrategyCard?.realSceneOrDialogue ?? autoDraft.realSceneOrDialogue ?? fallbackDraft.realSceneOrDialogue,
        feltMoment: currentStrategyCard?.feltMoment ?? autoDraft.feltMoment ?? fallbackDraft.feltMoment,
        wantToComplain: currentStrategyCard?.wantToComplain ?? autoDraft.wantToComplain ?? fallbackDraft.wantToComplain,
        nonDelegableTruth: currentStrategyCard?.nonDelegableTruth ?? autoDraft.nonDelegableTruth ?? fallbackDraft.nonDelegableTruth,
      };
      await upsertArticleStrategyCard({
        articleId: Number(article.id),
        userId: session.userId,
        ...nextStrategyCard,
        fourPointAudit: buildFourPointAudit(nextStrategyCard),
      });
    }
    return ok({
      id: article?.id,
      title: article?.title,
      status: normalizeArticleStatus(article?.status),
      seriesId: article?.series_id ?? null,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建稿件失败", 400);
  }
}
