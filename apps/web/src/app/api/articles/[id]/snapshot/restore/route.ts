import { getAccessibleArticleSnapshots } from "@/lib/article-snapshot-access";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { restoreArticleSnapshot } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const body = await request.json();
  const articleId = Number(params.id);
  const { article, snapshots } = await getAccessibleArticleSnapshots(session.userId, articleId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  if (!snapshots.some((snapshot) => snapshot.id === body.snapshotId)) {
    return fail("快照不存在或当前套餐不可访问", 404);
  }
  await restoreArticleSnapshot(articleId, body.snapshotId, session.userId);
  return ok({ restored: true });
}
