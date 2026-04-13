import { LogoutButton } from "@/components/auth-client";
import { WechatConnectionsManager } from "@/components/writer-client";
import { SettingsOverviewCards } from "@/components/writer-views";
import { getUserAccessScope } from "@/lib/access-scope";
import { requireWriterSession } from "@/lib/page-auth";
import { getCoverImageQuotaStatus, getUserPlanContext } from "@/lib/plan-access";
import { getVisibleTopicSources } from "@/lib/topic-radar";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getAffiliateOverview, getCurrentSubscriptionForUser, getWechatConnections } from "@/lib/repositories";
import Link from "next/link";

export default async function SettingsPage() {
  const { session, user } = await requireWriterSession();
  const [connections, scope, dailyGenerationUsage, affiliate, topicSources, subscription, coverImageQuota, planContext] = await Promise.all([
    getWechatConnections(session.userId),
    getUserAccessScope(session.userId),
    getDailyGenerationUsage(session.userId),
    getAffiliateOverview(session.userId),
    getVisibleTopicSources(session.userId),
    getCurrentSubscriptionForUser(session.userId),
    getCoverImageQuotaStatus(session.userId),
    getUserPlanContext(session.userId),
  ]);
  const effectivePlanCode = planContext.effectivePlanCode;
  const currentPlan = planContext.plan;
  const canManageWechatConnections = (currentPlan?.max_wechat_connections ?? 0) > 0;
  const usagePercent =
    currentPlan?.daily_generation_limit && currentPlan.daily_generation_limit > 0
      ? Math.min(100, Math.round((dailyGenerationUsage / currentPlan.daily_generation_limit) * 100))
      : 0;
  const subscriptionStatus = subscription?.status === "active" ? "使用中" : subscription?.status === "inactive" ? "已停用" : "人工维护中";
  const nextBillingAt =
    subscription?.start_at && currentPlan?.price_cny
      ? new Date(new Date(subscription.start_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN")
      : null;

  return (
    <div className="space-y-8">
      <SettingsOverviewCards
        items={[
          ["微信公众号授权", canManageWechatConnections ? `当前已绑定 ${connections.length} 个公众号连接，默认连接可直接用于草稿箱推送。` : `当前套餐为 ${currentPlan?.name || effectivePlanCode}，暂不开放公众号连接与草稿箱推送。`],
          [
            "订阅与配额",
            `当前套餐为 ${currentPlan?.name || effectivePlanCode}，今日生成 ${dailyGenerationUsage}${currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}，封面图 ${coverImageQuota.used}${coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}。`,
          ],
          [
            "推荐与增长",
            `你的推荐码是 ${affiliate.referralCode}，当前累计归因 ${affiliate.referredUserCount} 个用户，其中有效付费 ${affiliate.activePaidReferralCount} 个。`,
          ],
          [
            "账号安全",
            user.must_change_password
              ? "该账号仍处于首次登录后的强制改密状态，当前版本由管理员重置密码后继续接管。"
              : "当前账号未命中强制改密标记，仍建议定期由管理员轮换密码。",
          ],
          [
            "信息源作用域",
            `当前可见 ${topicSources.length} 个情绪罗盘信息源，${scope.isTeamShared ? "其中团队共享源会在 team 作用域内复用。" : "当前仅系统源和你自己的自定义源可见。"}`,
          ],
          [
            "团队共享",
            scope.isTeamShared
              ? `已启用团队共享，你会与 ${scope.userIds.length} 个账号共享碎片、死刑词与主题档案读取范围。`
              : "当前不是 team 套餐，碎片、死刑词和热点源都保持个人作用域。",
          ],
        ]}
      />
      <section className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit border border-stone-300/40 bg-[#f4efe6] p-5 shadow-ink xl:sticky xl:top-8">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">设置分区</div>
          <div className="mt-4 space-y-2 text-sm">
            {["个人资料", "订阅与账单", "专属死刑词库", "第三方授权"].map((item) => (
              <div
                key={item}
                className={`border px-4 py-3 ${
                  item === "订阅与账单"
                    ? "border-cinnabar bg-white text-cinnabar"
                    : "border-transparent bg-white text-stone-700"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
        </aside>
        <div className="space-y-4">
          {scope.isTeamShared ? (
            <div className="border border-stone-300/40 bg-white p-6 text-sm leading-7 text-stone-700 shadow-ink">
              团队共享已启用。当前账号会与 {scope.userIds.length} 个团队成员共享碎片池、死刑词库和主题档案读取范围。
            </div>
          ) : null}
          <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">账号信息</div>
            <div className="mt-4 font-serifCn text-3xl text-ink">{user.display_name || user.username}</div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              用户名：{user.username}<br />
              角色：{user.role}<br />
              套餐：{currentPlan?.name || effectivePlanCode}<br />
              推荐码：{affiliate.referralCode}
            </div>
            <div className="mt-4">
              <LogoutButton />
            </div>
          </div>
          <div id="billing-center" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">订阅与配额</div>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="font-serifCn text-3xl text-ink">{currentPlan?.name || subscription?.plan_name || effectivePlanCode}</div>
                <div className="mt-2 text-sm text-stone-700">
                  {currentPlan?.price_cny ? `￥${currentPlan.price_cny}/月` : "免费套餐"}
                </div>
              </div>
              <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {subscriptionStatus}
                {nextBillingAt ? ` · 下次续期检查：${nextBillingAt}` : " · 当前无自动扣费"}
              </div>
            </div>
            <div className="mt-6">
              <div className="flex items-center justify-between text-sm text-stone-700">
                <span>已用生成次数</span>
                <span>
                  {dailyGenerationUsage}
                  {currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}
                </span>
              </div>
              <div className="mt-3 h-3 overflow-hidden border border-stone-200 bg-[#f4efe6]">
                <div
                  className="h-full bg-cinnabar transition-all"
                  style={{ width: currentPlan?.daily_generation_limit == null ? "38%" : `${usagePercent}%` }}
                />
              </div>
            </div>
            <div className="mt-6 grid gap-3 text-sm leading-7 text-stone-700 md:grid-cols-2">
              <div>公众号连接：{connections.length}{currentPlan?.max_wechat_connections == null ? " / 不限" : ` / ${currentPlan.max_wechat_connections}`}</div>
              <div>碎片容量：{currentPlan?.fragment_limit == null ? "不限" : `${currentPlan.fragment_limit} 条`}</div>
              <div>死刑词上限：{currentPlan?.custom_banned_word_limit == null ? "不限" : `${currentPlan.custom_banned_word_limit} 个`}</div>
              <div>封面图额度：{coverImageQuota.used}{coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}</div>
              <div>订阅来源：{subscription?.source || "manual"}</div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/support?type=billing" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                管理账单信息
              </Link>
              <Link href="/support?type=billing" className="bg-stone-900 px-4 py-3 text-sm text-white">
                取消订阅
              </Link>
            </div>
          </div>
          <div id="wechat-connections">
            <div className={`mb-4 px-4 py-3 text-sm ${canManageWechatConnections ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-[#dfd2b0] bg-[#fff8e8] text-[#7d6430]"}`}>
              {canManageWechatConnections
                ? `已授权公众号：${connections.length > 0 ? ` ${connections.find((item) => item.is_default)?.account_name || connections[0]?.account_name || "未命名公众号"}` : " 暂无"}`
                : `当前套餐为 ${currentPlan?.name || effectivePlanCode}，升级到 Pro 或更高套餐后才可绑定公众号。`}
            </div>
            <WechatConnectionsManager
              canManage={canManageWechatConnections}
              connections={connections.map((connection) => ({
                id: connection.id,
                accountName: connection.account_name,
                originalId: connection.original_id,
                status: connection.status,
                isDefault: Boolean(connection.is_default),
                accessTokenExpiresAt: connection.access_token_expires_at,
                updatedAt: connection.updated_at,
              }))}
              planName={currentPlan?.name || effectivePlanCode}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
