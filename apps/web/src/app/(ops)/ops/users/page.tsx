import { OpsUsersClient } from "@/components/ops-client";
import { requireOpsSession } from "@/lib/page-auth";
import { getUsers } from "@/lib/repositories";

export default async function OpsUsersPage() {
  await requireOpsSession();
  const users = await getUsers();
  return (
    <OpsUsersClient
      users={users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        planCode: user.plan_code,
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
      }))}
      initialPasswordHint="新建用户的初始密码读取服务端 DEFAULT_OPS_PASSWORD；如果未配置，则回退为 REDACTED_ADMIN_PASSWORD。首次登录后仍会强制改密。"
    />
  );
}
