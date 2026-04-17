import { getArticleSnapshotAccessContext } from "@/lib/article-snapshot-access";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createArticleSnapshot } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const articleId = Number(params.id);
  const { article, retentionDays } = await getArticleSnapshotAccessContext(session.userId, articleId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const body = await request.json().catch(() => ({}));
  const snapshot = await createArticleSnapshot(article.id, body.note || "手动快照");
  return ok({
    id: snapshot?.id,
    snapshotNote: snapshot?.snapshot_note,
    createdAt: snapshot?.created_at,
    retentionDays,
  });
}
