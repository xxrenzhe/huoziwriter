import { requireAdmin, syncUserSubscription } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await request.json();
    const db = getDatabase();
    const current = await db.queryOne<{
      role: string;
      plan_code: string;
      is_active: number | boolean;
      must_change_password: number | boolean;
    }>("SELECT role, plan_code, is_active, must_change_password FROM users WHERE id = ?", [Number(params.id)]);
    if (!current) {
      return fail("用户不存在", 404);
    }
    const now = new Date().toISOString();
    await db.exec(
      `UPDATE users
       SET role = ?, plan_code = ?, is_active = ?, must_change_password = ?, updated_at = ?
       WHERE id = ?`,
      [
        body.role ?? current.role,
        body.planCode ?? current.plan_code,
        body.isActive ?? current.is_active,
        body.mustChangePassword ?? current.must_change_password,
        now,
        Number(params.id),
      ],
    );
    await syncUserSubscription(
      Number(params.id),
      body.planCode ?? current.plan_code,
      body.isActive ?? Boolean(current.is_active),
    );
    return ok({ updated: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "更新用户失败", 400);
  }
}
