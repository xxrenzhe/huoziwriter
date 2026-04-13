import { LogoutButton } from "@/components/auth-client";
import { WechatConnectionsManager } from "@/components/writer-client";
import { SettingsOverviewCards } from "@/components/writer-views";
import { getUserAccessScope } from "@/lib/access-scope";
import { requireWriterSession } from "@/lib/page-auth";
import { getVisibleTopicSources } from "@/lib/topic-radar";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getAffiliateOverview, getPlans, getWechatConnections } from "@/lib/repositories";

export default async function SettingsPage() {
  const { session, user } = await requireWriterSession();
  const [plans, connections, scope, dailyGenerationUsage, affiliate, topicSources] = await Promise.all([
    getPlans(),
    getWechatConnections(session.userId),
    getUserAccessScope(session.userId),
    getDailyGenerationUsage(session.userId),
    getAffiliateOverview(session.userId),
    getVisibleTopicSources(session.userId),
  ]);
  const currentPlan = plans.find((item) => item.code === user.plan_code);

  return (
    <div className="space-y-8">
      <SettingsOverviewCards
        items={[
          ["微信公众号授权", `当前已绑定 ${connections.length} 个公众号连接，默认连接可直接用于草稿箱推送。`],
          [
            "订阅与配额",
            `当前套餐为 ${currentPlan?.name || user.plan_code}，今日生成 ${dailyGenerationUsage}${currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}。`,
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
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
              套餐：{currentPlan?.name || user.plan_code}<br />
              推荐码：{affiliate.referralCode}
            </div>
            <div className="mt-4">
              <LogoutButton />
            </div>
          </div>
          <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">订阅与配额</div>
            <div className="mt-4 font-serifCn text-3xl text-ink">{currentPlan?.name || user.plan_code}</div>
            <div className="mt-4 space-y-2 text-sm leading-7 text-stone-700">
              <div>今日生成：{dailyGenerationUsage}{currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}</div>
              <div>公众号连接：{connections.length}{currentPlan?.max_wechat_connections == null ? " / 不限" : ` / ${currentPlan.max_wechat_connections}`}</div>
              <div>碎片容量：{currentPlan?.fragment_limit == null ? "不限" : `${currentPlan.fragment_limit} 条`}</div>
              <div>死刑词上限：{currentPlan?.custom_banned_word_limit == null ? "不限" : `${currentPlan.custom_banned_word_limit} 个`}</div>
            </div>
          </div>
          <WechatConnectionsManager
            connections={connections.map((connection) => ({
              id: connection.id,
              accountName: connection.account_name,
              status: connection.status,
              isDefault: Boolean(connection.is_default),
              accessTokenExpiresAt: connection.access_token_expires_at,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
