import { WriterAssetCenterClient } from "@/components/asset-center-client";
import { LogoutButton } from "@/components/auth-client";
import { PersonaManager } from "@/components/persona-client";
import { SeriesManager } from "@/components/series-client";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { WritingStyleProfilesPanel } from "@/components/writing-style-profiles-client";
import { WechatConnectionsManager } from "@/components/article-workspace-client";
import { SettingsOverviewCards } from "@/components/settings-overview-cards";
import { getKnowledgeCards } from "@/lib/knowledge";
import { getActiveTemplates } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import {
  canExtractPrivateTemplate,
  getCoverImageQuotaStatus,
  getCustomTemplateLimit,
  getCustomTopicSourceLimit,
  getImageAssetStorageQuotaStatus,
  getUserPlanContext,
  getWritingStyleProfileLimit,
} from "@/lib/plan-access";
import { getPersonaCatalog, getPersonaLimitForUser, getPersonas, hasPersona } from "@/lib/personas";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getVisibleTopicSources } from "@/lib/topic-radar";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getAssetFilesByUser, getCurrentSubscriptionForUser, getFragmentsByUser, getUserWorkspaceAssetSummary, getWechatConnections, getWechatSyncLogs } from "@/lib/repositories";
import { getSeries } from "@/lib/series";
import { summarizeTemplateRenderConfig } from "@/lib/template-rendering";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";
import Link from "next/link";

function summarizeTemplateTone(config: Record<string, unknown> | undefined) {
  return String(config?.tone || "默认").trim() || "默认";
}

function summarizeTemplateParagraphLength(config: Record<string, unknown> | undefined) {
  const value = String(config?.paragraphLength || "medium");
  if (value === "short") return "短段落";
  if (value === "long") return "长段落";
  return "中段落";
}

function summarizeTemplateSource(sourceUrl: string | null) {
  if (!sourceUrl) return "系统模板库";
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

function formatTemplateLastUsed(value: string | null | undefined) {
  if (!value) return "暂未使用";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAssetDate(value: string | null | undefined) {
  if (!value) return "暂未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function formatConnectionStatus(status: string) {
  if (status === "valid") return "可发布";
  if (status === "expired") return "待刷新";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

function formatWechatSyncStatus(status: string) {
  if (status === "success") return "推送成功";
  if (status === "failed") return "推送失败";
  if (status === "pending") return "等待中";
  return status || "未知状态";
}

function formatPublishFailureCode(code: string | null | undefined) {
  if (!code) return "未分类";
  if (code === "auth_failed") return "凭证失败";
  if (code === "media_failed") return "媒体素材失败";
  if (code === "rate_limited") return "频率限制";
  if (code === "content_invalid") return "内容格式问题";
  return "上游异常";
}

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (!value) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeSyncPayload(value: string | Record<string, unknown> | null, maxLength = 180) {
  const summary = stringifySummary(value);
  if (!summary) return null;
  return summary.length > maxLength ? `${summary.slice(0, maxLength).trimEnd()}...` : summary;
}

function parseStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) {
    return [] as string[];
  }
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function formatSourceTypeLabel(value: string | null | undefined) {
  if (value === "youtube") return "YouTube";
  if (value === "reddit") return "Reddit";
  if (value === "x") return "X";
  if (value === "podcast") return "播客";
  if (value === "spotify") return "Spotify";
  if (value === "rss") return "RSS";
  if (value === "blog") return "博客";
  return "资讯";
}

function formatSubscriptionSourceLabel(value: string | null | undefined) {
  if (value === "manual" || !String(value || "").trim()) return "手动配置";
  if (value === "stripe") return "Stripe";
  if (value === "apple") return "Apple";
  if (value === "wechat") return "微信支付";
  return String(value);
}

export default async function SettingsPage() {
  const { session, user } = await requireWriterSession();
  if (!(await hasPersona(session.userId))) {
    return null;
  }
  const [connections, syncLogs, fragments, knowledgeCards, assetFiles, dailyGenerationUsage, topicSources, subscription, coverImageQuota, imageAssetQuota, planContext, personas, personaLimit, personaCatalog, series, writingStyleProfiles, workspaceAssets, templates] = await Promise.all([
    getWechatConnections(session.userId),
    getWechatSyncLogs(session.userId),
    getFragmentsByUser(session.userId),
    getKnowledgeCards(session.userId),
    getAssetFilesByUser(session.userId),
    getDailyGenerationUsage(session.userId),
    getVisibleTopicSources(session.userId),
    getCurrentSubscriptionForUser(session.userId),
    getCoverImageQuotaStatus(session.userId),
    getImageAssetStorageQuotaStatus(session.userId),
    getUserPlanContext(session.userId),
    getPersonas(session.userId),
    getPersonaLimitForUser(session.userId),
    getPersonaCatalog(),
    getSeries(session.userId),
    getWritingStyleProfiles(session.userId),
    getUserWorkspaceAssetSummary(session.userId),
    getActiveTemplates(session.userId),
  ]);
  const effectivePlanCode = planContext.effectivePlanCode;
  const currentPlan = planContext.plan;
  const displayPlanName = formatPlanDisplayName(currentPlan?.name || effectivePlanCode);
  const canManageWechatConnections = (currentPlan?.max_wechat_connections ?? 0) > 0;
  const canManageSources = ["pro", "ultra"].includes(effectivePlanCode);
  const canExtractTemplates = canExtractPrivateTemplate(effectivePlanCode);
  const customTemplateLimit = getCustomTemplateLimit(effectivePlanCode);
  const customTopicSourceLimit = getCustomTopicSourceLimit(effectivePlanCode);
  const usagePercent =
    currentPlan?.daily_generation_limit && currentPlan.daily_generation_limit > 0
      ? Math.min(100, Math.round((dailyGenerationUsage / currentPlan.daily_generation_limit) * 100))
      : 0;
  const subscriptionStatus = subscription?.status === "active" ? "使用中" : subscription?.status === "inactive" ? "已停用" : "人工维护中";
  const nextBillingAt =
    subscription?.start_at && currentPlan?.price_cny
      ? new Date(new Date(subscription.start_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("zh-CN")
      : null;
  const customTopicSources = topicSources.filter((source) => source.owner_user_id != null);
  const systemTopicSources = topicSources.filter((source) => source.owner_user_id == null);
  const ownedTemplates = templates.filter((template) => template.ownerUserId === session.userId);
  const defaultPersona = personas.find((item) => item.isDefault) ?? personas[0] ?? null;
  const latestSeries = series[0] ?? null;
  const defaultConnection = connections.find((item) => item.is_default) ?? connections[0] ?? null;
  const latestWritingStyle = writingStyleProfiles[0] ?? null;
  const latestOwnedTemplate = ownedTemplates[0] ?? null;
  const latestCustomSource = customTopicSources[0] ?? null;
  const recentSyncLogs = syncLogs.slice(0, 5);
  const recentFragments = fragments.slice(0, 6);
  const recentKnowledgeCards = knowledgeCards.slice(0, 6);
  const recentImageAssets = assetFiles
    .filter((item) => item.assetType === "cover_image" || String(item.mimeType || "").startsWith("image/"))
    .slice(0, 6);
  const workspaceTodos = [
    personas.length === 0
      ? {
          key: "persona",
          level: "blocked",
          label: "先补默认作者人设",
          detail: "没有作者人设时，选题、受众分析和写作约束都无法稳定继承。",
          href: "#personas-series",
        }
      : null,
    series.length === 0
      ? {
          key: "series",
          level: "blocked",
          label: "还没有内容系列",
          detail: "先补 1 个系列并绑定固定作者人设，后续稿件才不会在中途失去长期判断线。",
          href: "#personas-series",
        }
      : null,
    getWritingStyleProfileLimit(effectivePlanCode) > 0 && writingStyleProfiles.length === 0
      ? {
          key: "style",
          level: "warning",
          label: "还没有沉淀写作风格资产",
          detail: "至少保存 1 个文风资产，后续人设绑定和模仿写作才真正可复用。",
          href: "#personas-series",
        }
      : null,
    canExtractTemplates && ownedTemplates.length === 0
      ? {
          key: "template",
          level: "warning",
          label: "模板库还是空的",
          detail: "先在资产中心沉淀一份私有模板，后续发布阶段才有稳定版式可选。",
          href: "#asset-center",
        }
      : null,
    workspaceAssets.conflictedKnowledgeCardsCount > 0
      ? {
          key: "knowledge",
          level: "warning",
          label: `有 ${workspaceAssets.conflictedKnowledgeCardsCount} 张主题档案待处理`,
          detail: "主题档案存在冲突时，事实核查和后续论证容易继承旧结论。",
          href: "/dashboard",
        }
      : null,
    canManageSources && customTopicSources.length === 0
      ? {
          key: "source",
          level: "warning",
          label: "还没有自定义选题雷达信源",
          detail: "付费套餐建议至少补 1 个自定义源，避免选题长期只依赖系统默认信源。",
          href: "#asset-center",
        }
      : null,
    canManageWechatConnections && connections.length === 0
      ? {
          key: "wechat",
          level: "warning",
          label: "还没有公众号发布连接",
          detail: "没有连接时，一键发布只能停在 HTML 预览，无法真正推送到草稿箱。",
          href: "#publishing-connections",
        }
      : null,
    canManageWechatConnections && connections.length > 0 && !connections.some((item) => item.is_default)
      ? {
          key: "wechat-default",
          level: "warning",
          label: "公众号连接未设置默认值",
          detail: "恢复发布和快捷发布都更依赖默认连接，建议设置 1 个默认公众号。",
          href: "#publishing-connections",
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; level: "blocked" | "warning"; label: string; detail: string; href: string }>;
  const workspaceHealthStats = [
    {
      label: "可直接复用",
      value:
        workspaceAssets.personasCount +
        workspaceAssets.writingStyleProfilesCount +
        workspaceAssets.customTemplatesCount +
        workspaceAssets.wechatConnectionsCount,
      note: "人设、文风、模板、发布连接",
    },
    {
      label: "待处理事项",
      value: workspaceTodos.length,
      note: workspaceTodos.length > 0 ? "建议先清空再进入高频生产" : "当前资产状态稳定",
    },
    {
      label: "高优先级风险",
      value: workspaceTodos.filter((item) => item.level === "blocked").length,
      note: "会直接拖慢主链路或卡住发布",
    },
  ];
  const settingsSections = [
    {
      title: "作者与系列",
      href: "#personas-series",
      metric: `${series.length} / ${personas.length}`,
      note: "系列 / 人设",
      description:
        series.length > 0
          ? `当前已建立 ${series.length} 个系列，默认作者人设为 ${defaultPersona?.name || "未命名"}。稿件应始终从系列继承身份和风格约束。`
          : "先补至少 1 个系列并绑定固定人设，后续稿件才不会在中途失去长期判断线。",
    },
    {
      title: "资产中心",
      href: "#asset-center",
      metric: `${workspaceAssets.fragmentsCount + workspaceAssets.customTemplatesCount + workspaceAssets.knowledgeCardsCount}`,
      note: "素材 / 模板 / 档案",
      description:
        `当前已沉淀素材 ${workspaceAssets.fragmentsCount} 条、主题档案 ${workspaceAssets.knowledgeCardsCount} 张、私有模板 ${workspaceAssets.customTemplatesCount} 个。所有长期资产统一回到这里管理。`,
    },
    {
      title: "发布连接",
      href: "#publishing-connections",
      metric: canManageWechatConnections ? String(connections.length) : "未开放",
      note: canManageWechatConnections ? "公众号连接数" : displayPlanName,
      description:
        canManageWechatConnections
          ? `当前已绑定 ${connections.length} 个公众号连接${defaultConnection ? `，默认连接为 ${defaultConnection.account_name || defaultConnection.original_id || "未命名公众号"}` : ""}${recentSyncLogs[0] ? `；最近一次同步为 ${formatWechatSyncStatus(recentSyncLogs[0].status)}` : ""}。`
          : `当前套餐为 ${displayPlanName}，暂不开放公众号连接与草稿箱推送。`,
    },
    {
      title: "账号安全与套餐",
      href: "#account-security",
      metric: displayPlanName,
      note: user.must_change_password ? "需关注登录安全" : "套餐与安全边界",
      description:
        `今日生成 ${dailyGenerationUsage}${currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}，封面图 ${coverImageQuota.used}${coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}，图片资产 ${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}。`,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <SettingsOverviewCards items={settingsSections.map((item) => ({ ...item }))} />
      <section className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit border border-stone-300/40 bg-[#f4efe6] p-5 shadow-ink xl:sticky xl:top-8">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">设置分区</div>
          <div className="mt-4 space-y-2 text-sm">
            {[
              ["作者与系列", "#personas-series"],
              ["资产中心", "#asset-center"],
              ["发布连接", "#publishing-connections"],
              ["账号安全与套餐", "#account-security"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="block border border-transparent bg-white px-4 py-3 text-stone-700 transition-colors hover:border-cinnabar hover:text-cinnabar">
                {label}
              </a>
            ))}
          </div>
        </aside>
        <div className="space-y-6">
          <section id="personas-series" className="space-y-4 scroll-mt-8">
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">作者与系列</div>
              <div className="mt-3 font-serifCn text-3xl text-ink">先固定写作身份，再沉淀可复用的文风资产。</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                每篇稿件都应该先归属一个长期经营的系列，再从系列绑定的人设和风格资产继承约束，而不是在后期随手切换口气。这里负责维护系列、默认人设和写作风格沉淀。
              </div>
            </div>
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <SeriesManager
                initialSeries={series.map((item) => ({
                  id: item.id,
                  name: item.name,
                  personaId: item.personaId,
                  personaName: item.personaName,
                  thesis: item.thesis,
                  targetAudience: item.targetAudience,
                  activeStatus: item.activeStatus,
                  createdAt: item.createdAt,
                  updatedAt: item.updatedAt,
                }))}
                personas={personas.map((item) => ({ id: item.id, name: item.name }))}
              />
            </div>
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <PersonaManager
                initialPersonas={personas}
                maxCount={personaLimit}
                currentPlanName={currentPlan?.name || effectivePlanCode}
                canAnalyzeFromSources={effectivePlanCode !== "free"}
                availableWritingStyles={writingStyleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
                tagCatalog={personaCatalog}
              />
            </div>
            {getWritingStyleProfileLimit(effectivePlanCode) > 0 ? (
              <div id="style-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
                <WritingStyleProfilesPanel
                  profiles={writingStyleProfiles}
                  maxCount={getWritingStyleProfileLimit(effectivePlanCode)}
                />
              </div>
            ) : (
              <div id="style-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">写作风格资产</div>
                <div className="mt-4 text-sm leading-7 text-stone-700">
                  当前套餐支持在作者与系列里分析文章，但暂不支持保存到个人空间。升级到 Pro 或 Ultra 后可长期沉淀为风格资产。
                </div>
                <div className="mt-4">
                  <Link href="/settings#personas-series" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                    回到作者与系列
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section id="asset-center" className="space-y-4 scroll-mt-8">
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">资产中心</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">把长期沉淀的素材、模板、图像和信源集中管理。</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">
                  你的个人空间已经沉淀了 {workspaceAssets.articlesCount} 篇稿件、{workspaceAssets.fragmentsCount} 条素材、{workspaceAssets.seriesCount} 个系列、{workspaceAssets.personasCount} 个作者人设、{workspaceAssets.customTemplatesCount} 个私有模板和 {workspaceAssets.wechatConnectionsCount} 个发布连接。
                </div>
              </div>
              <Link href="/dashboard" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                返回作战台
              </Link>
            </div>
            <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_420px]">
              <div className="border border-stone-300/40 bg-[#fffdfa] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">资产状态</div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {workspaceHealthStats.map((item) => (
                    <div key={item.label} className="border border-stone-300/40 bg-white px-4 py-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">{item.label}</div>
                      <div className="mt-3 font-serifCn text-3xl text-ink">{item.value}</div>
                      <div className="mt-2 text-sm leading-6 text-stone-700">{item.note}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  <div className="text-xs uppercase tracking-[0.24em] text-stone-500">待处理事项</div>
                  {workspaceTodos.length > 0 ? (
                    workspaceTodos.map((item) => (
                      <a
                        key={item.key}
                        href={item.href}
                        className={`block border px-4 py-4 transition-colors ${
                          item.level === "blocked"
                            ? "border-[#d8b0b2] bg-[#fff3f3] text-[#8f3136]"
                            : "border-[#dfd2b0] bg-[#fff8e8] text-[#7d6430]"
                        }`}
                      >
                        <div className="text-sm font-medium">{item.label}</div>
                        <div className="mt-2 text-sm leading-7">{item.detail}</div>
                      </a>
                    ))
                  ) : (
                    <div className="border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-7 text-emerald-700">
                      当前个人空间资产已经形成基本闭环，可以直接进入高频写作和发布阶段。
                    </div>
                  )}
                </div>
              </div>
              <div className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">最近沉淀</div>
                <div className="mt-4 space-y-3">
                  <article className="border border-stone-300/40 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近系列</div>
                    <div className="mt-2 font-medium text-ink">{latestSeries?.name || "尚未建立"}</div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      {latestSeries
                        ? `${latestSeries.personaName} · ${latestSeries.thesis || "未写核心判断"}`
                        : "先补 1 个系列后，稿件区和作战台才能稳定按长期主题运转。"}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">最近更新：{formatAssetDate(latestSeries?.updatedAt || latestSeries?.createdAt)}</div>
                  </article>
                  <article className="border border-stone-300/40 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">默认作者人设</div>
                    <div className="mt-2 font-medium text-ink">{defaultPersona?.name || "尚未配置"}</div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      {defaultPersona
                        ? `${defaultPersona.identityTags.join(" / ")} · ${defaultPersona.writingStyleTags.join(" / ")}`
                        : "补 1 个默认人设后，写作区主链路才会稳定继承身份和风格约束。"}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">更新时间：{formatAssetDate(defaultPersona?.updatedAt || defaultPersona?.createdAt)}</div>
                  </article>
                  <article className="border border-stone-300/40 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最新文风资产</div>
                    <div className="mt-2 font-medium text-ink">{latestWritingStyle?.name || "尚未保存"}</div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      {latestWritingStyle
                        ? latestWritingStyle.toneKeywords.slice(0, 3).join(" / ") || latestWritingStyle.summary
                        : "先在作者与系列分析一篇文章后，这里会出现最近沉淀的风格资产。"}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">创建时间：{formatAssetDate(latestWritingStyle?.createdAt)}</div>
                  </article>
                  <article className="border border-stone-300/40 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">最近模板资产</div>
                    <div className="mt-2 font-medium text-ink">{latestOwnedTemplate?.name || "尚未提取"}</div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      {latestOwnedTemplate
                        ? summarizeTemplateRenderConfig(latestOwnedTemplate, 3).join("；")
                        : canExtractTemplates
                          ? "去资产中心粘贴一篇真实文章版式后，这里会显示最新模板。"
                          : "当前套餐暂不保存私有模板资产。"}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">最近使用：{formatTemplateLastUsed(latestOwnedTemplate?.lastUsedAt)}</div>
                  </article>
                  <article className="border border-stone-300/40 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">发布与信源</div>
                    <div className="mt-2 font-medium text-ink">
                      {defaultConnection?.account_name || defaultConnection?.original_id || "尚未配置默认公众号"}
                    </div>
                    <div className="mt-2 text-sm leading-7 text-stone-700">
                      {defaultConnection
                        ? `默认连接状态：${formatConnectionStatus(defaultConnection.status)}`
                        : canManageWechatConnections
                          ? "补 1 个默认公众号连接后，恢复发布和一键推送会更顺。"
                          : "当前套餐暂不开放公众号连接。"}
                      {latestCustomSource
                        ? ` 当前最近可用自定义源：${latestCustomSource.name} · ${formatSourceTypeLabel(latestCustomSource.source_type)}。`
                        : canManageSources
                          ? " 你还没有自定义选题雷达信源。"
                          : ""}
                    </div>
                    <div className="mt-2 text-xs text-stone-500">
                      最近连接更新：{formatAssetDate(defaultConnection?.updated_at)}{latestCustomSource ? ` · 最近信源：${latestCustomSource.name}` : ""}
                    </div>
                  </article>
                </div>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">写作库存</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.articlesCount + workspaceAssets.fragmentsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">稿件 {workspaceAssets.articlesCount} 篇，素材 {workspaceAssets.fragmentsCount} 条。所有后续大纲、写作和核查都从这里取材。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">主题档案</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.knowledgeCardsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">已激活 {workspaceAssets.activeKnowledgeCardsCount} 张，待处理冲突 {workspaceAssets.conflictedKnowledgeCardsCount} 张。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">人设与文风</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.seriesCount + workspaceAssets.personasCount + workspaceAssets.writingStyleProfilesCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">系列 {workspaceAssets.seriesCount} 个，作者人设 {workspaceAssets.personasCount} 个，写作风格资产 {workspaceAssets.writingStyleProfilesCount} 个，持续影响选题与写作输出。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模板资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.customTemplatesCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">私有模板 {workspaceAssets.customTemplatesCount} 个，可直接用于预览、排版与发布。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">图像资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.coverImagesCount + workspaceAssets.imagePromptsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">封面图 {workspaceAssets.coverImagesCount} 张，文中配图提示词 {workspaceAssets.imagePromptsCount} 条。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">选题雷达信源</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.customTopicSourcesCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">自定义源 {workspaceAssets.customTopicSourcesCount} 个，系统默认源 {systemTopicSources.length} 个；付费套餐可继续扩充个人来源池。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">发布连接</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.wechatConnectionsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">已绑定公众号 {workspaceAssets.wechatConnectionsCount} 个，后续发布、恢复发布和草稿箱同步都依赖这里的连接资产。</div>
              </article>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                `作者资产：系列 ${workspaceAssets.seriesCount} / 人设 ${workspaceAssets.personasCount} / 文风 ${workspaceAssets.writingStyleProfilesCount}`,
                `模板资产：私有模板 ${workspaceAssets.customTemplatesCount}`,
                `图像资产：封面 ${workspaceAssets.coverImagesCount} / 配图提示词 ${workspaceAssets.imagePromptsCount}`,
                `素材资产：稿件 ${workspaceAssets.articlesCount} / 素材 ${workspaceAssets.fragmentsCount}`,
                `信息资产：主题档案 ${workspaceAssets.knowledgeCardsCount} / 自定义信源 ${workspaceAssets.customTopicSourcesCount}`,
                `发布资产：公众号连接 ${workspaceAssets.wechatConnectionsCount}`,
              ].map((item) => (
                <div key={item} className="border border-stone-300/40 bg-[#fffdfa] px-4 py-3 text-sm leading-7 text-stone-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#template-assets" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看模板资产
              </a>
              <a href="#topic-sources" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看信源配置
              </a>
              <a href="#publishing-connections" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看发布连接
              </a>
              <Link href="/articles" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                回到稿件区
              </Link>
              <a href="#personas-series" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看作者与系列
              </a>
            </div>
            </div>
            <WriterAssetCenterClient
              fragments={recentFragments.map((fragment) => ({
                id: fragment.id,
                title: fragment.title,
                distilledContent: fragment.distilled_content,
                sourceType: fragment.source_type,
                sourceUrl: fragment.source_url,
                screenshotPath: fragment.screenshot_path,
                createdAt: fragment.created_at,
                shared: fragment.user_id !== session.userId,
              }))}
              knowledgeCards={recentKnowledgeCards.map((card) => ({
                id: card.id,
                title: card.title,
                cardType: card.card_type,
                summary: card.summary,
                conflictFlags: parseStringList(card.conflict_flags_json),
                latestChangeSummary: card.latest_change_summary,
                sourceFragmentCount: card.source_fragment_count,
                confidenceScore: card.confidence_score,
                status: card.status,
                lastCompiledAt: card.last_compiled_at,
                shared: Boolean(card.shared),
              }))}
              imageAssets={recentImageAssets.map((asset) => ({
                id: asset.id,
                articleId: asset.articleId,
                articleTitle: asset.articleTitle,
                assetScope: asset.assetScope,
                assetType: asset.assetType,
                variantLabel: asset.variantLabel,
                publicUrl: asset.publicUrl,
                mimeType: asset.mimeType,
                byteLength: asset.byteLength,
                status: asset.status,
                updatedAt: asset.updatedAt,
              }))}
            />
            <div id="template-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">模板资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">把模板提取结果沉淀为你自己的排版资产。</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">
                  当前个人空间中共有 {ownedTemplates.length}{customTemplateLimit > 0 ? ` / ${customTemplateLimit}` : ""} 个私有模板。
                  {canExtractTemplates
                    ? " 你现在可以在发布阶段沉淀并复用私有模板。"
                    : " 当前套餐仅支持浏览官方模板；升级到 Pro 或 Ultra 后，才可把外部链接提取为私有模板。"}
                </div>
              </div>
              <a href="#asset-center" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">返回资产中心总览</a>
            </div>
            {ownedTemplates.length > 0 ? (
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {ownedTemplates.slice(0, 6).map((template) => (
                  <article key={`${template.id}-${template.version}`} className="border border-stone-300/40 bg-[#faf7f0] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-stone-500">
                      私有模板 · {template.version}
                    </div>
                    <div className="mt-3 font-serifCn text-2xl text-ink">{template.name}</div>
                    <div className="mt-3 text-sm leading-7 text-stone-700">{template.description || "暂无说明"}</div>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600">
                      <span className="border border-stone-300 bg-white px-3 py-1">语气 {summarizeTemplateTone(template.config)}</span>
                      <span className="border border-stone-300 bg-white px-3 py-1">{summarizeTemplateParagraphLength(template.config)}</span>
                      <span className="border border-stone-300 bg-white px-3 py-1">来源 {summarizeTemplateSource(template.sourceUrl)}</span>
                      <span className="border border-stone-300 bg-white px-3 py-1">使用 {template.usageCount ?? 0} 次</span>
                      <span className="border border-stone-300 bg-white px-3 py-1">最近使用 {formatTemplateLastUsed(template.lastUsedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-6 border border-dashed border-stone-300 bg-[#fffdfa] px-5 py-5 text-sm leading-7 text-stone-700">
                {canExtractTemplates
                  ? "你还没有私有模板资产。去资产中心粘贴一篇公众号或网页文章链接，系统会先抓取页面，再提取可复用版式并沉淀到个人空间。"
                  : "你还没有私有模板资产。当前套餐不会保存模板提取结果，先浏览官方模板；如需建立个人模板库，请升级到 Pro 或 Ultra。"}
              </div>
            )}
            </div>
            <div id="topic-sources" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">选题雷达信源</div>
            <div className="mt-3 font-serifCn text-3xl text-ink">把系统源和你的个人来源池分开管理。</div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              当前可见 {topicSources.length} 个信息源，其中系统源 {systemTopicSources.length} 个、自定义源 {customTopicSources.length} 个。新的信源类型与优先级会直接影响热点排序。
              {customTopicSourceLimit > 0 ? ` 当前套餐最多可启用 ${customTopicSourceLimit} 个自定义源。` : " 当前套餐仅可浏览系统默认源。"}
            </div>
            <div className="mt-6">
              <TopicSourceManagerClient
                canManage={canManageSources}
                currentCustomCount={customTopicSources.length}
                maxCustomCount={customTopicSourceLimit}
                planName={currentPlan?.name || effectivePlanCode}
                sources={topicSources.map((source) => ({
                  id: source.id,
                  name: source.name,
                  homepageUrl: source.homepage_url,
                  sourceType: source.source_type ?? "news",
                  priority: source.priority ?? 100,
                  scope: source.owner_user_id == null ? "system" : "custom",
                  status: source.connector_status ?? "healthy",
                  attemptCount: source.connector_attempt_count ?? 0,
                  consecutiveFailures: source.connector_consecutive_failures ?? 0,
                  lastError: source.connector_last_error,
                  lastHttpStatus: source.connector_last_http_status,
                  nextRetryAt: source.connector_next_retry_at,
                  healthScore: source.connector_health_score ?? 100,
                  degradedReason: source.connector_degraded_reason,
                }))}
              />
            </div>
            </div>
          </section>

          <section id="publishing-connections" className="space-y-4 scroll-mt-8">
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">发布连接</div>
              <div className="mt-3 font-serifCn text-3xl text-ink">把公众号连接和最近发布诊断收进同一处维护。</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                默认公众号、授权状态和同步恢复动作都统一在这里处理，稿件发布阶段只消费这里的连接结果。
              </div>
            </div>
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className={`mb-4 px-4 py-3 text-sm ${canManageWechatConnections ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-[#dfd2b0] bg-[#fff8e8] text-[#7d6430]"}`}>
                {canManageWechatConnections
                  ? `已授权公众号：${connections.length > 0 ? ` ${connections.find((item) => item.is_default)?.account_name || connections[0]?.account_name || "未命名公众号"}` : " 暂无"}`
                  : `当前套餐为 ${displayPlanName}，升级到 Pro 或更高套餐后才可绑定公众号。`}
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
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近同步记录</div>
                  <div className="mt-3 font-serifCn text-3xl text-ink">最近请求与响应摘要直接集中展示在这里。</div>
                  <div className="mt-3 text-sm leading-7 text-stone-700">
                    这里仅保留最近几次公众号同步诊断，方便快速判断是连接问题、素材问题还是内容格式问题；单篇更细的记录仍回到具体稿件查看。
                  </div>
                </div>
                <div className="border border-stone-300/40 bg-[#faf7f0] px-4 py-3 text-sm text-stone-700">
                  最近记录 {recentSyncLogs.length} 条
                </div>
              </div>
              {recentSyncLogs.length > 0 ? (
                <div className="mt-6 grid gap-4 xl:grid-cols-2">
                  {recentSyncLogs.map((log) => {
                    const requestSummary = summarizeSyncPayload(log.requestSummary);
                    const responseSummary = summarizeSyncPayload(log.responseSummary);
                    return (
                      <article key={log.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                              {log.connectionName || "未命名公众号"} · {new Date(log.createdAt).toLocaleString("zh-CN")}
                            </div>
                            <div className="mt-2 font-medium text-ink">{log.title || "未命名稿件"}</div>
                          </div>
                          <div className={log.status === "success" ? "text-emerald-600" : log.status === "failed" ? "text-cinnabar" : "text-stone-500"}>
                            {formatWechatSyncStatus(log.status)}
                          </div>
                        </div>
                        <div className="mt-3 text-sm leading-7 text-stone-700">
                          {log.status === "success"
                            ? log.mediaId
                              ? `草稿媒体 ID：${log.mediaId}`
                              : "微信已返回成功，但未回填媒体 ID。"
                            : log.failureReason || "未记录失败原因"}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                          {log.failureCode ? <span className="border border-stone-300 bg-white px-3 py-1">失败分类：{formatPublishFailureCode(log.failureCode)}</span> : null}
                          {log.retryCount > 0 ? <span className="border border-stone-300 bg-white px-3 py-1">重试 {log.retryCount} 次</span> : null}
                          {log.templateId ? <span className="border border-stone-300 bg-white px-3 py-1">模板 {log.templateId}</span> : null}
                          {log.articleVersionHash ? <span className="border border-stone-300 bg-white px-3 py-1">版本 {log.articleVersionHash.slice(0, 12)}</span> : null}
                        </div>
                        {requestSummary || responseSummary ? (
                          <div className="mt-4 space-y-2">
                            {requestSummary ? (
                              <div className="border border-stone-300/40 bg-white px-3 py-3 text-xs leading-6 text-stone-600">
                                <div className="uppercase tracking-[0.18em] text-stone-500">请求摘要</div>
                                <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{requestSummary}</pre>
                              </div>
                            ) : null}
                            {responseSummary ? (
                              <div className="border border-stone-300/40 bg-white px-3 py-3 text-xs leading-6 text-stone-600">
                                <div className="uppercase tracking-[0.18em] text-stone-500">响应摘要</div>
                                <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{responseSummary}</pre>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-4">
                          <Link href={`/articles/${log.articleId}`} className="border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">
                            查看这篇稿件
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 border border-dashed border-stone-300 bg-[#fffdfa] px-5 py-5 text-sm leading-7 text-stone-700">
                  当前还没有公众号同步记录。首次推送成功或失败后，这里会显示最近一次请求与响应摘要，帮助你直接在设置里定位连接与发布问题。
                </div>
              )}
            </div>
          </section>

          <section id="account-security" className="space-y-4 scroll-mt-8">
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">账号安全与套餐</div>
              <div className="mt-3 font-serifCn text-3xl text-ink">把身份、登录安全和套餐配额放回统一的账户管理区。</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                这里不再承担产品叙事，只负责账号信息、退出登录、订阅状态和配额边界，让写作主链路保持干净。
              </div>
            </div>
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">账号信息</div>
              <div className="mt-4 font-serifCn text-3xl text-ink">{user.display_name || user.username}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">
                用户名：{user.username}<br />
                角色：{user.role}<br />
                套餐：{displayPlanName}
              </div>
              <div className="mt-4">
                <LogoutButton />
              </div>
            </div>
            <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">订阅与配额</div>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="font-serifCn text-3xl text-ink">{formatPlanDisplayName(currentPlan?.name || subscription?.plan_name || effectivePlanCode)}</div>
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
                <div>素材容量：{currentPlan?.fragment_limit == null ? "不限" : `${currentPlan.fragment_limit} 条`}</div>
                <div>语言规则上限：{currentPlan?.languageGuardRuleLimit == null ? "不限" : `${currentPlan.languageGuardRuleLimit} 个`}</div>
                <div>封面图额度：{coverImageQuota.used}{coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}</div>
                <div>图片资产空间：{formatBytes(imageAssetQuota.usedBytes)} / {formatBytes(imageAssetQuota.limitBytes)}</div>
                <div>私有模板资产：{customTemplateLimit > 0 ? `${ownedTemplates.length} / ${customTemplateLimit}` : "未开放"}</div>
                <div>自定义信源：{customTopicSourceLimit > 0 ? `${customTopicSources.length} / ${customTopicSourceLimit}` : "未开放"}</div>
                <div>唯一图片对象：{imageAssetQuota.uniqueObjectCount} 个</div>
                <div>订阅来源：{formatSubscriptionSourceLabel(subscription?.source)}</div>
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
          </section>
        </div>
      </section>
    </div>
  );
}
