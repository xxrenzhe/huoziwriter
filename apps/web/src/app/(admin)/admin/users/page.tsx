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
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        planCode: user.plan_code,
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        articleCount: user.article_count,
        publishedArticleCount: user.published_article_count,
        totalUsage: user.total_usage,
        lastUsageAt: user.last_usage_at,
        subscriptionHistory: user.subscription_history.map((item) => ({
          id: item.id,
          planCode: item.plan_code,
          status: item.status,
          startAt: item.start_at,
          endAt: item.end_at,
          source: item.source,
          updatedAt: item.updated_at,
        })),
      }))}
      initialPasswordHint="新建用户可手动输入初始密码；留空时会使用平台预设初始密码。首次登录后仍会强制改密。"
    />
  );
}
