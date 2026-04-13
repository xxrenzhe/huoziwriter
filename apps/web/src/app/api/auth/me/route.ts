import { ensureUserSession, findUserById, getEffectivePlanCodeForUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getReferralCodeForUser } from "@/lib/referrals";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const user = await findUserById(session.userId);
  if (!user) {
    return fail("用户不存在", 404);
  }
  return ok({
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    planCode: await getEffectivePlanCodeForUser(user.id, user.plan_code),
    referralCode: getReferralCodeForUser(user),
    mustChangePassword: Boolean(user.must_change_password),
  });
}
