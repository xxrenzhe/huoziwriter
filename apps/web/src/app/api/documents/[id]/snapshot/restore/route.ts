import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getSnapshotRetentionDays } from "@/lib/plan-access";
import { getDocumentSnapshots, restoreDocumentSnapshot } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const body = await request.json();
  const retentionDays = await getSnapshotRetentionDays(session.userId);
  const snapshots = await getDocumentSnapshots(Number(params.id), { retentionDays });
  if (!snapshots.some((snapshot) => snapshot.id === body.snapshotId)) {
    return fail("快照不存在或当前套餐不可访问", 404);
  }
  await restoreDocumentSnapshot(Number(params.id), body.snapshotId, session.userId);
  return ok({ restored: true });
}
