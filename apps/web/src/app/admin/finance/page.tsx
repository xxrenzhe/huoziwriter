import { AdminFinanceClient } from "@/components/admin-client";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminFinanceOverview, getAdminSubscriptions, getResolvedPlans } from "@/lib/repositories";

export default async function AdminFinancePage() {
  await requireAdminSession();
  const [plans, subscriptions, overview] = await Promise.all([getResolvedPlans(), getAdminSubscriptions(), getAdminFinanceOverview()]);
  return (
    <AdminFinanceClient
      plans={plans}
      subscriptions={subscriptions.map((subscription) => ({
        id: subscription.id,
        userId: subscription.user_id,
        username: subscription.username,
        displayName: subscription.display_name,
        planCode: subscription.plan_code,
        planName: subscription.plan_name,
        status: subscription.status,
        startAt: subscription.start_at,
        endAt: subscription.end_at,
      }))}
      overview={overview}
    />
  );
}
