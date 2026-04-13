import { AdminUsersClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getReferralCodeForUser } from "@/lib/referrals";
import { getUsers } from "@/lib/repositories";

export default async function AdminUsersPage() {
  await requireAdminSession();
  const users = await getUsers();
  return (
    <AdminUsersClient
      users={users.map((user) => ({
        id: user.id,
        username: user.username,
        referralCode: getReferralCodeForUser(user),
        referredByUsername: user.referred_by_username,
        role: user.role,
        planCode: user.plan_code,
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
      }))}
    />
  );
}
