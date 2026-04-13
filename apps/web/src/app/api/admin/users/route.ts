import { createUser, requireAdmin } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getReferralCodeForUser } from "@/lib/referrals";
import { getUsers } from "@/lib/repositories";

export async function GET() {
  try {
    await requireAdmin();
    const users = await getUsers();
    return ok(
      users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
        referralCode: getReferralCodeForUser(user),
        referredByUserId: user.referred_by_user_id,
        referredByUsername: user.referred_by_username,
        role: user.role,
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
    await requireAdmin();
    const body = await request.json();
    const user = await createUser({
      username: body.username,
      email: body.email || null,
      password: body.password || "REDACTED_ADMIN_PASSWORD",
      displayName: body.displayName || null,
      role: body.role || "user",
      planCode: body.planCode || "free",
      mustChangePassword: body.mustChangePassword ?? true,
      referralCode: body.referralCode || null,
    });
    return ok({
      id: user.id,
      username: user.username,
      referralCode: getReferralCodeForUser(user),
      role: user.role,
      planCode: user.plan_code,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建用户失败", 400);
  }
}
