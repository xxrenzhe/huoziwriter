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
const queueCardClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "md" }),
  "flex h-full flex-col shadow-none",
);
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
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
  const coverUsagePercent =
    coverImageQuota.limit && coverImageQuota.limit > 0
      ? Math.min(100, Math.round((coverImageQuota.used / coverImageQuota.limit) * 100))
      : 0;
  const imageStoragePercent =
    imageAssetQuota.limitBytes && imageAssetQuota.limitBytes > 0
      ? Math.min(100, Math.round((imageAssetQuota.usedBytes / imageAssetQuota.limitBytes) * 100))
      : 0;
  const connectionUsagePercent =
    planSnapshot.maxWechatConnections && planSnapshot.maxWechatConnections > 0
      ? Math.min(100, Math.round((connections.length / planSnapshot.maxWechatConnections) * 100))
      : 0;
  const generationNearLimit =
    planSnapshot.dailyGenerationLimit != null && planSnapshot.dailyGenerationLimit > 0 && usagePercent >= 80;
  const coverNearLimit = coverImageQuota.limit != null && coverImageQuota.limit > 0 && coverUsagePercent >= 80;
  const imageStorageNearLimit = imageAssetQuota.limitBytes > 0 && imageStoragePercent >= 80;
  const connectionNearLimit =
    planSnapshot.maxWechatConnections != null
    && planSnapshot.maxWechatConnections > 0
    && connectionUsagePercent >= 80;
  const accountIssueCount =
    (user.must_change_password ? 1 : 0) +
    (subscription?.status === "inactive" ? 1 : 0) +
    (generationNearLimit ? 1 : 0) +
    (coverNearLimit ? 1 : 0) +
    (imageStorageNearLimit ? 1 : 0) +
    (connectionNearLimit ? 1 : 0);
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
      <section className={accountCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理账号与配额风险</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              把登录安全、订阅状态和高占用配额先分流出来，避免写作中途才撞到边界。
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              账号页不只展示数字。这里优先列出会阻断生成、发布或资产沉淀的风险，并给出直达支持、发布连接和资产库存的入口。
            </div>
          </div>
          <div className={summaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前待处理</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{String(accountIssueCount)}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">
              {accountIssueCount > 0 ? "先处理这些边界，再继续高频写作。" : "当前账号安全与配额边界都处于可用状态。"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {user.must_change_password ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">登录安全待处理</div>
              <div className="mt-2 font-medium text-ink">当前账号被标记为需要尽快更新密码</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                这通常意味着账号仍在使用临时密码或历史口令。先完成密码更新，再继续保留当前设备登录。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>影响：登录安全</span>
                <span className={mutedChipClassName}>建议立即处理</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/change-password" className={supportLinkClassName}>
                  去修改密码
                </Link>
              </div>
            </article>
          ) : null}

          {subscription?.status === "inactive" ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">订阅状态异常</div>
              <div className="mt-2 font-medium text-ink">当前订阅状态为已停用</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                套餐停用后，后续配额与能力边界可能收紧。先确认账单或支持工单，避免写作中途发现能力降级。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>当前套餐：{displayPlanName}</span>
                <span className={mutedChipClassName}>来源：{formatSubscriptionSourceLabel(subscription?.source)}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/support?type=billing" className={supportLinkClassName}>
                  处理账单
                </Link>
              </div>
            </article>
          ) : null}

          {generationNearLimit ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">生成额度逼近上限</div>
              <div className="mt-2 font-medium text-ink">今日生成已使用 {dailyUsageLabel}</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                今日生成配额已经接近上限。若继续批量生成，后续起稿与改写可能直接被额度阻断。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>占用 {usagePercent}% </span>
                <span className={mutedChipClassName}>建议优先处理高价值稿件</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/articles" className={supportLinkClassName}>
                  回稿件区
                </Link>
                <Link href="/support?type=billing" className={supportLinkClassName}>
                  查看套餐
                </Link>
              </div>
            </article>
          ) : null}

          {coverNearLimit ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">封面图额度逼近上限</div>
              <div className="mt-2 font-medium text-ink">
                封面图额度已使用 {coverImageQuota.used}{coverImageQuota.limit == null ? "" : ` / ${coverImageQuota.limit}`}
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                封面图额度已接近边界。继续大量生成封面，可能在发布前卡住图片链路。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>占用 {coverUsagePercent}%</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/settings/assets#asset-center" className={supportLinkClassName}>
                  去整理资产
                </Link>
              </div>
            </article>
          ) : null}

          {imageStorageNearLimit ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">图片空间逼近上限</div>
              <div className="mt-2 font-medium text-ink">图片资产空间已使用 {imageStorageLabel}</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                图片库存接近空间上限。若不先清理低价值候选图，后续封面、配图和导出都会被空间边界影响。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>占用 {imageStoragePercent}%</span>
                <span className={mutedChipClassName}>唯一对象 {imageAssetQuota.uniqueObjectCount} 个</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/settings/assets#asset-center" className={supportLinkClassName}>
                  去整理资产
                </Link>
              </div>
            </article>
          ) : null}

          {connectionNearLimit ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">发布连接逼近上限</div>
              <div className="mt-2 font-medium text-ink">公众号连接已使用 {connectionsLabel}</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                连接数量已接近套餐边界。继续新增公众号前，先清理失效连接或确认是否需要扩容。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={metaChipClassName}>占用 {connectionUsagePercent}%</span>
                <span className={mutedChipClassName}>当前连接 {connections.length} 个</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/settings/publish#publishing-connections" className={supportLinkClassName}>
                  去看发布连接
                </Link>
              </div>
            </article>
          ) : null}

          {accountIssueCount === 0 ? (
            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">边界健康</div>
              <div className="mt-2 font-medium text-ink">登录安全、订阅状态和主要配额都处于可用区间</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                当前没有需要优先处理的账号边界风险。可以直接回到作战台、稿件区或发布页继续推进业务动作。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/warroom" className={supportLinkClassName}>
                  去作战台
                </Link>
                <Link href="/articles" className={supportLinkClassName}>
                  去稿件区
                </Link>
              </div>
            </article>
          ) : null}
        </div>
      </section>

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
