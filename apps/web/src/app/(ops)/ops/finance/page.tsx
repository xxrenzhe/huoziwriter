import { OpsFinanceClient } from "@/components/ops-client";
import { requireOpsSession } from "@/lib/page-auth";
import { getOpsSubscriptions, getPlans } from "@/lib/repositories";

export default async function OpsFinancePage() {
  await requireOpsSession();
  const [plans, subscriptions] = await Promise.all([getPlans(), getOpsSubscriptions()]);
  return (
    <OpsFinanceClient
      plans={plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        priceCny: plan.price_cny,
        dailyGenerationLimit: plan.daily_generation_limit,
        fragmentLimit: plan.fragment_limit,
        languageGuardRuleLimit: plan.languageGuardRuleLimit,
        maxWechatConnections: plan.max_wechat_connections,
        canGenerateCoverImage: Boolean(plan.can_generate_cover_image),
        canExportPdf: Boolean(plan.can_export_pdf),
        isPublic: Boolean(plan.is_public),
      }))}
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
    />
  );
}
