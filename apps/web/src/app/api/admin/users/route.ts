import { createUser, normalizeManagedUserRole, requireAdminAccess } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertPlanCodeExists, parseManagedRole } from "@/lib/admin-validation";
import { getUsers } from "@/lib/repositories";

export async function GET() {
  try {
    await requireAdminAccess();
    const users = await getUsers();
    return ok(
      users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        role: normalizeManagedUserRole(user.role),
        planCode: user.plan_code,
        isActive: Boolean(user.is_active),
        mustChangePassword: Boolean(user.must_change_password),
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
      })),
    );
  } catch {
    return fail("无权限访问", 401);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminAccess();
    const body = await request.json();
    const planCode = await assertPlanCodeExists(String(body.planCode || "free"));
    const role = parseManagedRole(body.role, "user");
    const password = String(body.password || process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
    if (!password) {
      throw new Error("创建用户需要显式提供密码，或在服务端配置 DEFAULT_ADMIN_PASSWORD");
    }
    const user = await createUser({
      username: body.username,
      email: body.email || null,
      password,
      displayName: body.displayName || null,
      role: role as "admin" | "user",
      planCode,
      mustChangePassword: body.mustChangePassword ?? true,
    });
    return ok({
      id: user.id,
      username: user.username,
      role: user.role,
      planCode: user.plan_code,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建用户失败", 400);
  }
}
