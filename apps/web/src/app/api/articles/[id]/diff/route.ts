import { ensureUserSession } from "@/lib/auth";
import { buildLineDiff } from "@/lib/article-diff";
import { fail, ok } from "@/lib/http";
import { getSnapshotRetentionDays } from "@/lib/plan-access";
import { getArticleById, getArticleSnapshots } from "@/lib/repositories";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const snapshotId = Number(new URL(request.url).searchParams.get("snapshotId"));
  if (!snapshotId) {
    return fail("缺少 snapshotId", 400);
  }

  const retentionDays = await getSnapshotRetentionDays(session.userId);
  const snapshots = await getArticleSnapshots(article.id, { retentionDays });
  const snapshot = snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) {
    return fail("快照不存在", 404);
  }

  const diff = buildLineDiff(snapshot.markdown_content, article.markdown_content);
  return ok({
    snapshot: {
      id: snapshot.id,
      snapshotNote: snapshot.snapshot_note,
      createdAt: snapshot.created_at,
    },
    summary: diff.summary,
    lines: diff.lines,
  });
}
