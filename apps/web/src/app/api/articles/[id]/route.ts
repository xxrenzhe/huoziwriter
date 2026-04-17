import { saveArticleDraft, serializeArticleDraft } from "@/lib/article-draft";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifacts } from "@/lib/article-stage-artifacts";
import { getArticleWorkflow } from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";
import { getSnapshotRetentionDays } from "@/lib/plan-access";
import { getArticleById, getArticleSnapshots } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const retentionDays = await getSnapshotRetentionDays(session.userId);
  const [snapshots, workflow, stageArtifacts] = await Promise.all([
    getArticleSnapshots(Number(params.id), { retentionDays }),
    getArticleWorkflow(Number(params.id), session.userId),
    getArticleStageArtifacts(Number(params.id), session.userId),
  ]);
  return ok({
    id: article.id,
    title: article.title,
    markdownContent: article.markdown_content,
    htmlContent: article.html_content,
    status: normalizeArticleStatus(article.status),
    seriesId: article.series_id,
    wechatTemplateId: article.wechat_template_id,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      snapshotNote: snapshot.snapshot_note,
      createdAt: snapshot.created_at,
    })),
    snapshotRetentionDays: retentionDays,
    workflow,
    stageArtifacts,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json();
    const articleId = Number(params.id);
    const savedArticle = await saveArticleDraft({
      articleId,
      userId: session.userId,
      body,
    });
    if (!savedArticle) {
      return fail("稿件不存在", 404);
    }
    return ok(serializeArticleDraft(savedArticle));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "稿件保存失败", 400);
  }
}
