import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { LogoutButton } from "@/components/auth-client";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import {
  formatBytes,
  formatSubscriptionSourceLabel,
  getAccountSettingsData,
} from "../data";
import { SettingsSubpageShell } from "../shell";

const accountCardClassName = surfaceCardStyles({ padding: "lg" });
const secondaryPanelClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "shadow-none");
const successPanelClassName = cn(surfaceCardStyles({ tone: "success", padding: "sm" }), "text-sm text-emerald-700 shadow-none");
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const supportLinkClassName = buttonStyles({ variant: "secondary" });
const dangerLinkClassName = buttonStyles({ variant: "danger" });
const quotaItemClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "flex h-full flex-col justify-between text-sm leading-7 text-inkSoft shadow-none",
);
const progressTrackClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "none" }),
  "mt-3 h-3 overflow-hidden border-line bg-paperStrong shadow-none",
);

export default async function SettingsAccountPage() {
  const data = await getAccountSettingsData();
  if (!data) {
    return null;
  }

  const {
    user,
    planContext,
    dailyGenerationUsage,
    subscription,
    coverImageQuota,
    imageAssetQuota,
    workspaceAssets,
    connections,
  } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const displayPlanName = formatPlanDisplayName(plan?.name || effectivePlanCode);
  const usagePercent =
    planSnapshot.dailyGenerationLimit && planSnapshot.dailyGenerationLimit > 0
      ? Math.min(100, Math.round((dailyGenerationUsage / planSnapshot.dailyGenerationLimit) * 100))
      : 0;
  const subscriptionStatus =
    subscription?.status === "active"
      ? "使用中"
      : subscription?.status === "inactive"
        ? "已停用"
        : "人工维护中";
  const nextBillingAt =
    subscription?.start_at && planSnapshot.priceCny
      ? new Date(
          new Date(subscription.start_at).getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toLocaleDateString("zh-CN")
      : null;
  const dailyUsageLabel =
    planSnapshot.dailyGenerationLimit == null ? `${dailyGenerationUsage} / 不限` : `${dailyGenerationUsage} / ${planSnapshot.dailyGenerationLimit}`;
  const imageStorageLabel = `${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}`;
  const connectionsLabel =
    planSnapshot.maxWechatConnections == null ? `${connections.length} / 不限` : `${connections.length} / ${planSnapshot.maxWechatConnections}`;
  const quotaItems = [
    `公众号连接：${connections.length}${planSnapshot.maxWechatConnections == null ? " / 不限" : ` / ${planSnapshot.maxWechatConnections}`}`,
    `素材容量：${planSnapshot.fragmentLimit == null ? "不限" : `${planSnapshot.fragmentLimit} 条`}`,
    `语言规则上限：${planSnapshot.languageGuardRuleLimit == null ? "不限" : `${planSnapshot.languageGuardRuleLimit} 个`}`,
    `封面图额度：${coverImageQuota.used}${coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}`,
    `图片资产空间：${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}`,
    `私有模板资产：${planSnapshot.customTemplateLimit > 0 ? `${workspaceAssets.customTemplatesCount} / ${planSnapshot.customTemplateLimit}` : "未开放"}`,
    `自定义信源：${planSnapshot.customTopicSourceLimit > 0 ? `${workspaceAssets.customTopicSourcesCount} / ${planSnapshot.customTopicSourceLimit}` : "未开放"}`,
    `唯一图片对象：${imageAssetQuota.uniqueObjectCount} 个`,
    `订阅来源：${formatSubscriptionSourceLabel(subscription?.source)}`,
  ];

  return (
    <SettingsSubpageShell
      current="account"
      description="这里不承担产品叙事，只负责账号身份、登录安全和套餐配额，让写作主链路保持干净。"
      stats={[
        {
          label: "当前套餐",
          value: displayPlanName,
          note: planSnapshot.priceCny ? `￥${planSnapshot.priceCny}/月` : "免费套餐",
        },
        {
          label: "今日生成",
          value: dailyUsageLabel,
          note: user.must_change_password ? "需关注登录安全" : "保持账号与配额边界清晰",
        },
        {
          label: "图片空间",
          value: imageStorageLabel,
          note: `唯一图片对象 ${imageAssetQuota.uniqueObjectCount} 个`,
        },
      ]}
    >
      <section id="account-security" className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] scroll-mt-8">
        <div className="space-y-4">
          <div className={accountCardClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">账号信息</div>
            <div className="mt-4 font-serifCn text-3xl text-ink text-balance">
              {user.display_name || user.username}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={metaChipClassName}>用户名 {user.username}</span>
              <span className={metaChipClassName}>角色 {user.role}</span>
              <span className={metaChipClassName}>套餐 {displayPlanName}</span>
            </div>
            <div className="mt-4 text-sm leading-7 text-inkSoft">
              这里仅保留账号身份与安全边界，避免把写作决策和配额维护混在同一条链路里。
            </div>
            <div className="mt-4">
              <LogoutButton />
            </div>
          </div>

          <div className={secondaryPanelClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">订阅与安全提醒</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={successPanelClassName}>{subscriptionStatus}</span>
              <span className={metaChipClassName}>
                {user.must_change_password ? "需尽快更新密码" : "当前登录安全正常"}
              </span>
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              {nextBillingAt ? `下次续期检查：${nextBillingAt}` : "当前无自动扣费"}
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              订阅来源：{formatSubscriptionSourceLabel(subscription?.source)}
            </div>
          </div>
        </div>

        <div className={accountCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">订阅与配额</div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="font-serifCn text-3xl text-ink text-balance">{displayPlanName}</div>
              <div className="mt-2 text-sm text-inkSoft">
                {planSnapshot.priceCny ? `￥${planSnapshot.priceCny}/月` : "免费套餐"}
              </div>
            </div>
            <div className={successPanelClassName}>
              {subscriptionStatus}
              {nextBillingAt ? ` · 下次续期检查：${nextBillingAt}` : " · 当前无自动扣费"}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "生成进度",
                value: planSnapshot.dailyGenerationLimit == null ? "不限" : `${usagePercent}%`,
                note: `今日已用 ${dailyUsageLabel}`,
              },
              {
                label: "公众号连接",
                value: connectionsLabel,
                note: connections.length > 0 ? "账单与发布会共享这里的连接上限。" : "当前还没有公众号连接。",
              },
              {
                label: "图片对象",
                value: String(imageAssetQuota.uniqueObjectCount),
                note: `图片空间 ${imageStorageLabel}`,
              },
            ].map((item) => (
              <article key={item.label} className={summaryCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              </article>
            ))}
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-inkSoft">
              <span>已用生成次数</span>
              <span>
                {dailyUsageLabel}
              </span>
            </div>
            <div className={progressTrackClassName}>
              <div
                className="h-full bg-cinnabar transition-[width] duration-300"
                style={{
                  width: planSnapshot.dailyGenerationLimit == null ? "38%" : `${usagePercent}%`,
                }}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {quotaItems.map((item) => (
              <div key={item} className={quotaItemClassName}>
                {item}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/support?type=billing" className={supportLinkClassName}>
              管理账单信息
            </Link>
            <Link href="/support?type=billing" className={dangerLinkClassName}>
              取消订阅
            </Link>
          </div>
        </div>
      </section>
    </SettingsSubpageShell>
  );
}
