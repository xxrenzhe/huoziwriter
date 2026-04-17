import { getAccessibleArticleSnapshots } from "@/lib/article-snapshot-access";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifacts } from "@/lib/article-stage-artifacts";
import { getArticleWorkflow } from "@/lib/article-workflows";
import { fail, ok } from "@/lib/http";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const articleId = Number(params.id);
  const { article, retentionDays, snapshots } = await getAccessibleArticleSnapshots(session.userId, articleId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const [workflow, stageArtifacts] = await Promise.all([
    getArticleWorkflow(articleId, session.userId),
    getArticleStageArtifacts(articleId, session.userId),
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
