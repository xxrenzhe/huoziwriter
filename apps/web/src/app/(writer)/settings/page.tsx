import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import {
  Blocks,
  BookUser,
  Globe2,
  Send,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { SettingsOverviewCards } from "@/components/settings-overview-cards";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { formatBytes, formatConnectionStatus, getSettingsHubData } from "./data";
import { settingsSections, type SettingsSectionKey } from "./sections";

const sectionIcons: Record<SettingsSectionKey, JSX.Element> = {
  author: <BookUser className="h-5 w-5" />,
  assets: <Blocks className="h-5 w-5" />,
  sources: <Globe2 className="h-5 w-5" />,
  publish: <Send className="h-5 w-5" />,
  account: <WalletCards className="h-5 w-5" />,
  "language-guard": <ShieldAlert className="h-5 w-5" />,
};

const heroCardClassName = surfaceCardStyles({ tone: "warm", padding: "lg" });
const shellActionClassName = buttonStyles({ variant: "secondary" });
const summaryCardClassName = surfaceCardStyles({ padding: "sm" });
const setupQueueCardClassName = cn(
  surfaceCardStyles({ tone: "warning", padding: "md", interactive: true }),
  "text-warning",
);
const settingsReadyBannerClassName = cn(
  surfaceCardStyles({ tone: "success", padding: "sm" }),
  "text-sm leading-7 text-emerald-700",
);
const detailPanelClassName = surfaceCardStyles({ padding: "md" });
const detailCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const recentItemClassName = cn(surfaceCardStyles({ tone: "warm", padding: "sm" }), "shadow-none");

export default async function SettingsPage() {
  const data = await getSettingsHubData();
  if (!data) {
    return null;
  }

  const {
    user,
    planContext,
    dailyGenerationUsage,
    workspaceAssets,
    connections,
    topicSources,
    languageGuardRules,
    fragments,
    knowledgeCards,
    assetFiles,
    articles,
    imageAssetQuota,
  } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const displayPlanName = formatPlanDisplayName(plan?.name || effectivePlanCode);
  const customTopicSources = topicSources.filter((source) => source.owner_user_id != null);
  const userLanguageRules = languageGuardRules.filter((rule) => rule.scope === "user");
  const recentFragments = fragments.slice(0, 2);
  const recentKnowledgeCards = knowledgeCards.slice(0, 2);
  const recentArticles = articles.slice(0, 2);
  const recentImageAssets = assetFiles
    .filter((item) => item.assetType === "cover_image" || String(item.mimeType || "").startsWith("image/"))
    .slice(0, 2);
  const recentConnections = connections.slice(0, 2);
  const reusableAssetCount =
    workspaceAssets.personasCount +
    workspaceAssets.seriesCount +
    workspaceAssets.writingStyleProfilesCount +
    workspaceAssets.fragmentsCount +
    workspaceAssets.knowledgeCardsCount +
    workspaceAssets.customTemplatesCount +
    workspaceAssets.wechatConnectionsCount +
    workspaceAssets.customTopicSourcesCount;
  const isFirstTimeWorkspace =
    workspaceAssets.personasCount === 0 &&
    workspaceAssets.seriesCount === 0 &&
    workspaceAssets.fragmentsCount === 0 &&
    workspaceAssets.knowledgeCardsCount === 0 &&
    connections.length === 0 &&
    customTopicSources.length === 0 &&
    userLanguageRules.length === 0;
  const heroEyebrow = isFirstTimeWorkspace ? "First Setup" : "Settings Hub";
  const heroTitle = isFirstTimeWorkspace
    ? "先把作者资产搭起来，再进入高频写作。"
    : "把设置从大杂烩拆成稳定入口。";
  const heroDescription = isFirstTimeWorkspace
    ? "第一次进入个人空间时，不应该落在空白页。先补默认作者人设、系列、死刑词规则和发布连接，后续作战台与稿件区才会稳定继承你的判断线。"
    : "这里不再堆叠所有管理面板，而是只保留总览和分区入口。需要改作者资产、库存、发布连接或死刑词库时，直接进入对应子页处理。";

  const setupQueue = [
    workspaceAssets.personasCount === 0
      ? {
          label: "先补默认作者人设",
          detail: "没有作者人设时，选题、受众分析和写作约束都无法稳定继承。",
          href: "/settings/author",
        }
      : null,
    workspaceAssets.seriesCount === 0
      ? {
          label: "还没有内容系列",
          detail: "先补 1 个系列并绑定固定作者人设，稿件才不会在中途失去长期判断线。",
          href: "/settings/author",
        }
      : null,
    planSnapshot.canManageTopicSources && customTopicSources.length === 0
      ? {
          label: "补 1 个自定义机会信源",
          detail: "避免选题长期只依赖系统默认源，让作战台能体现你的长期来源偏好。",
          href: "/settings/sources",
        }
      : null,
    planSnapshot.canPublishToWechat && connections.length === 0
      ? {
          label: "还没有公众号发布连接",
          detail: "没有连接时，一键发布只能停在 HTML 预览，无法真正推送到草稿箱。",
          href: "/settings/publish",
        }
      : null,
    userLanguageRules.length === 0
      ? {
          label: "补 3 到 5 条死刑词规则",
          detail: "先把你最常见的机器腔词收进规则库，写作链路的约束感会更稳定。",
          href: "/settings/language-guard",
        }
      : null,
    workspaceAssets.conflictedKnowledgeCardsCount > 0
      ? {
          label: `有 ${workspaceAssets.conflictedKnowledgeCardsCount} 张背景卡待处理`,
          detail: "背景卡存在冲突时，事实核查和后续论证容易继承旧结论。",
          href: "/settings/assets",
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; detail: string; href: string }>;

  const sectionCards = {
    author: {
      metric: `${workspaceAssets.personasCount + workspaceAssets.seriesCount + workspaceAssets.writingStyleProfilesCount}`,
      note: "人设 / 系列 / 文风",
      description: "固定写作身份，维护长期经营的系列，并沉淀可复用的写作风格资产。",
    },
    assets: {
      metric: `${workspaceAssets.fragmentsCount + workspaceAssets.knowledgeCardsCount + workspaceAssets.customTemplatesCount}`,
      note: "素材 / 背景卡 / 模板",
      description: "把素材、背景卡、模板和图像收回到统一库存，减少写作阶段的上下文切换。",
    },
    sources: {
      metric: planSnapshot.canManageTopicSources ? `${customTopicSources.length}` : "未开放",
      note: planSnapshot.canManageTopicSources ? "自定义信源" : displayPlanName,
      description: "管理系统源与个人来源池，直接影响热点排序和作战台里的机会质量。",
    },
    publish: {
      metric: planSnapshot.canPublishToWechat ? `${connections.length}` : "未开放",
      note: planSnapshot.canPublishToWechat ? "公众号连接数" : displayPlanName,
      description: "维护默认公众号、授权状态和最近同步诊断，把发布问题集中到一处处理。",
    },
    account: {
      metric: displayPlanName,
      note: user.must_change_password ? "需关注登录安全" : "账号与配额",
      description: `今日生成 ${dailyGenerationUsage}${planSnapshot.dailyGenerationLimit == null ? " / 不限" : ` / ${planSnapshot.dailyGenerationLimit}`}，让套餐、账单和安全边界保持清晰。`,
    },
    "language-guard": {
      metric: planSnapshot.languageGuardRuleLimit == null ? `${userLanguageRules.length}` : `${userLanguageRules.length} / ${planSnapshot.languageGuardRuleLimit}`,
      note: "自定义死刑词库",
      description: "把最常见的机器腔词和句式模板收进规则库，在生成、审校和编辑阶段统一拦截。",
    },
  } satisfies Record<SettingsSectionKey, { metric: string; note: string; description: string }>;
  const recentSettlements = [
    ...recentKnowledgeCards.map((card) => ({
      label: "背景卡",
      title: card.title,
      note: card.summary || card.latest_change_summary || "已进入资产中心",
    })),
    ...recentImageAssets.map((asset) => ({
      label: "图片资产",
      title: asset.articleTitle || `图片资产 #${asset.id}`,
      note: `${asset.variantLabel || "封面候选"} · ${formatBytes(asset.byteLength)}`,
    })),
    ...recentArticles.map((article) => ({
      label: "稿件",
      title: article.title,
      note: `最近状态：${article.status}`,
    })),
    ...recentFragments.map((fragment) => ({
      label: "碎片资产",
      title: fragment.title || `素材 #${fragment.id}`,
      note: fragment.distilled_content,
    })),
    ...recentConnections.map((connection) => ({
      label: "发布连接",
      title: connection.account_name || "未命名公众号",
      note: formatConnectionStatus(connection.status),
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-8">
      <section className={heroCardClassName}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">{heroEyebrow}</div>
            <h1 className="mt-3 font-serifCn text-4xl text-ink text-balance">{heroTitle}</h1>
            <p className="mt-4 text-sm leading-7 text-inkSoft">
              {heroDescription}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {isFirstTimeWorkspace ? (
              <>
                <Link href="/settings/author" className={shellActionClassName}>
                  先建作者资产
                </Link>
                <Link href="/settings/language-guard" className={shellActionClassName}>
                  补死刑词规则
                </Link>
              </>
            ) : (
              <>
                <Link href="/warroom" className={shellActionClassName}>
                  去作战台
                </Link>
                <Link href="/articles" className={shellActionClassName}>
                  去稿件区
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ["可复用资产", String(reusableAssetCount), "来自人设、系列、素材、背景卡、模板、信源和发布连接"] as const,
            ["待处理事项", String(setupQueue.length), setupQueue.length > 0 ? "建议先清掉关键阻塞，再进入高频生产" : "当前设置状态稳定，可直接回到写作链路"] as const,
            ["当前套餐", displayPlanName, user.display_name || user.username] as const,
          ].map(([label, value, note]) => (
            <article key={label} className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{label}</div>
              <div className="mt-3 font-serifCn text-3xl text-ink text-balance">{value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{note}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理事项</div>
        {setupQueue.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {setupQueue.slice(0, 4).map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={setupQueueCardClassName}
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="mt-2 text-sm leading-7">{item.detail}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={settingsReadyBannerClassName}>
            当前个人空间资产已经形成基本闭环，可以直接进入高频写作和发布阶段。
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <article className={detailPanelClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">资产状态</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">把主流程会复用的库存直接暴露在设置首页。</div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              {
                label: "背景卡",
                value: String(workspaceAssets.knowledgeCardsCount),
                note: `已激活 ${workspaceAssets.activeKnowledgeCardsCount} 张，待处理 ${workspaceAssets.conflictedKnowledgeCardsCount} 张`,
              },
              {
                label: "图片资产",
                value: String(workspaceAssets.coverImagesCount + workspaceAssets.imagePromptsCount),
                note: `封面 ${workspaceAssets.coverImagesCount} 张，提示词 ${workspaceAssets.imagePromptsCount} 条`,
              },
              {
                label: "图片资产空间",
                value: `${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}`,
                note: `唯一对象 ${imageAssetQuota.uniqueObjectCount} 个`,
              },
              {
                label: "发布连接",
                value: String(connections.length),
                note: connections.length > 0 ? (connections[0].account_name || "已配置公众号") : "当前还没有公众号连接",
              },
            ].map((item) => (
              <div key={item.label} className={detailCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              </div>
            ))}
          </div>
        </article>

        <article className={detailPanelClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近沉淀</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">最近形成的作者资产、稿件与发布连接。</div>
          <div className="mt-4 space-y-3">
            {recentSettlements.length > 0 ? (
              recentSettlements.map((item) => (
                <div key={`${item.label}-${item.title}`} className={recentItemClassName}>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                  <div className="mt-2 text-base font-medium text-ink">{item.title}</div>
                  <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
                </div>
              ))
            ) : (
              <div className={recentItemClassName}>
                <div className="text-sm leading-7 text-inkSoft">
                  当前还没有新的沉淀项。先去稿件区补素材、背景卡或封面图，这里会自动回流。
                </div>
              </div>
            )}
          </div>
        </article>
      </section>

      <SettingsOverviewCards
        items={settingsSections.map((section) => ({
          anchorId: section.legacyAnchorId,
          eyebrow: section.eyebrow,
          title: section.title,
          href: section.href,
          icon: sectionIcons[section.key],
          ctaLabel: "进入分区",
          ...sectionCards[section.key],
        }))}
      />
    </div>
  );
}
