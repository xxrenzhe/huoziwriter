import { AdminUsersClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getUsers } from "@/lib/repositories";

export default async function AdminUsersPage() {
  await requireAdminSession();
  const users = await getUsers();
  return (
    <AdminUsersClient
      users={users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        planCode: user.plan_code,
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
      }))}
      initialPasswordHint="新建用户可手动输入密码；留空时会读取服务端 DEFAULT_ADMIN_PASSWORD。首次登录后仍会强制改密。"
    />
  );
}
