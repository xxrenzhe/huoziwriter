import { assertPlanCodeExists, parseSubscriptionStatus } from "@/lib/ops-validation";
import { requireOpsAccess } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireOpsAccess();
    const body = await request.json();
    const db = getDatabase();
    const now = new Date().toISOString();
    const subscription = await db.queryOne<{ id: number; user_id: number }>("SELECT id, user_id FROM subscriptions WHERE id = ?", [Number(params.id)]);
    if (!subscription) {
      return fail("订阅不存在", 404);
    }
    const planCode = await assertPlanCodeExists(String(body.planCode || ""));
    const status = parseSubscriptionStatus(body.status, "active");
    await db.exec(
      `UPDATE subscriptions SET plan_code = ?, status = ?, end_at = ?, updated_at = ? WHERE id = ?`,
      [
        planCode,
        status,
        body.endAt ?? null,
        now,
        Number(params.id),
      ],
    );
    await db.exec(
      `UPDATE users SET plan_code = ?, updated_at = ? WHERE id = ?`,
      [planCode, now, subscription.user_id],
    );
    return ok({ updated: true });
  } catch {
    return fail("更新订阅失败", 400);
  }
}
