import { AuthorPersonaManager } from "@/components/author-persona-client";
import { LogoutButton } from "@/components/auth-client";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { WritingStyleProfilesPanel } from "@/components/writing-style-profiles-client";
import { WechatConnectionsManager } from "@/components/writer-client";
import { SettingsOverviewCards } from "@/components/writer-views";
import { getActiveTemplates } from "@/lib/marketplace";
import { getAuthorPersonaCatalog, getAuthorPersonas, getAuthorPersonaLimitForUser, hasAuthorPersona } from "@/lib/author-personas";
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
import { getVisibleTopicSources } from "@/lib/topic-radar";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getAffiliateOverview, getCurrentSubscriptionForUser, getUserWorkspaceAssetSummary, getWechatConnections } from "@/lib/repositories";
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

function formatSourceTypeLabel(value: string | null | undefined) {
  if (value === "youtube") return "YouTube";
  if (value === "reddit") return "Reddit";
  if (value === "x") return "X";
  if (value === "podcast") return "Podcast";
  if (value === "spotify") return "Spotify";
  if (value === "rss") return "RSS";
  if (value === "blog") return "Blog";
  return "News";
}

export default async function SettingsPage() {
  const { session, user } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }
  const [connections, dailyGenerationUsage, affiliate, topicSources, subscription, coverImageQuota, imageAssetQuota, planContext, personas, personaLimit, personaCatalog, writingStyleProfiles, workspaceAssets, templates] = await Promise.all([
    getWechatConnections(session.userId),
    getDailyGenerationUsage(session.userId),
    getAffiliateOverview(session.userId),
    getVisibleTopicSources(session.userId),
    getCurrentSubscriptionForUser(session.userId),
    getCoverImageQuotaStatus(session.userId),
    getImageAssetStorageQuotaStatus(session.userId),
    getUserPlanContext(session.userId),
    getAuthorPersonas(session.userId),
    getAuthorPersonaLimitForUser(session.userId),
    getAuthorPersonaCatalog(),
    getWritingStyleProfiles(session.userId),
    getUserWorkspaceAssetSummary(session.userId),
    getActiveTemplates(session.userId),
  ]);
  const effectivePlanCode = planContext.effectivePlanCode;
  const currentPlan = planContext.plan;
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
  const defaultConnection = connections.find((item) => item.is_default) ?? connections[0] ?? null;
  const latestWritingStyle = writingStyleProfiles[0] ?? null;
  const latestOwnedTemplate = ownedTemplates[0] ?? null;
  const latestCustomSource = customTopicSources[0] ?? null;
  const workspaceTodos = [
    personas.length === 0
      ? {
          key: "persona",
          level: "blocked",
          label: "先补默认作者人设",
          detail: "没有作者人设时，选题、受众分析和写作约束都无法稳定继承。",
          href: "#persona-assets",
        }
      : null,
    getWritingStyleProfileLimit(effectivePlanCode) > 0 && writingStyleProfiles.length === 0
      ? {
          key: "style",
          level: "warning",
          label: "还没有沉淀写作风格资产",
          detail: "至少保存 1 个文风资产，后续人设绑定和模仿写作才真正可复用。",
          href: "#style-assets",
        }
      : null,
    canExtractTemplates && ownedTemplates.length === 0
      ? {
          key: "template",
          level: "warning",
          label: "模板库还是空的",
          detail: "去灵感集市提取一篇真实文章的版式，后续排版才有私有模板可选。",
          href: "#template-assets",
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
          label: "还没有自定义情绪罗盘信息源",
          detail: "付费套餐建议至少补 1 个自定义源，避免选题长期只依赖系统默认信源。",
          href: "#topic-sources",
        }
      : null,
    canManageWechatConnections && connections.length === 0
      ? {
          key: "wechat",
          level: "warning",
          label: "还没有公众号发布连接",
          detail: "没有连接时，一键发布只能停在 HTML 预览，无法真正推送到草稿箱。",
          href: "#wechat-connections",
        }
      : null,
    canManageWechatConnections && connections.length > 0 && !connections.some((item) => item.is_default)
      ? {
          key: "wechat-default",
          level: "warning",
          label: "公众号连接未设置默认值",
          detail: "恢复发布和快捷发布都更依赖默认连接，建议设置 1 个默认公众号。",
          href: "#wechat-connections",
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; level: "blocked" | "warning"; label: string; detail: string; href: string }>;
  const workspaceHealthStats = [
    {
      label: "可直接复用",
      value:
        workspaceAssets.authorPersonasCount +
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

  return (
    <div className="space-y-8">
      <SettingsOverviewCards
        items={[
          ["微信公众号授权", canManageWechatConnections ? `当前已绑定 ${connections.length} 个公众号连接，默认连接可直接用于草稿箱推送。` : `当前套餐为 ${currentPlan?.name || effectivePlanCode}，暂不开放公众号连接与草稿箱推送。`],
          [
            "订阅与配额",
            `当前套餐为 ${currentPlan?.name || effectivePlanCode}，今日生成 ${dailyGenerationUsage}${currentPlan?.daily_generation_limit == null ? " / 不限" : ` / ${currentPlan.daily_generation_limit}`}，封面图 ${coverImageQuota.used}${coverImageQuota.limit == null ? " / 不限" : ` / ${coverImageQuota.limit}`}，图片资产空间 ${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}。`,
          ],
          [
            "推荐与增长",
            `你的推荐码是 ${affiliate.referralCode}，当前累计归因 ${affiliate.referredUserCount} 个用户，其中有效付费 ${affiliate.activePaidReferralCount} 个。`,
          ],
          [
            "作者人设",
            personas.length > 0 ? `当前已配置 ${personas.length} / ${personaLimit} 个作者人设，默认人设为 ${personas.find((item) => item.isDefault)?.name || personas[0]?.name}。` : `当前尚未配置作者人设，进入写作区时会强制引导你先完成配置。`,
          ],
          [
            "写作风格资产",
            getWritingStyleProfileLimit(effectivePlanCode) > 0
              ? `当前已保存 ${writingStyleProfiles.length} / ${getWritingStyleProfileLimit(effectivePlanCode)} 个写作风格资产。`
              : "当前套餐仅支持风格分析，不支持保存到个人空间。",
          ],
          [
            "账号安全",
            user.must_change_password
              ? "该账号仍处于首次登录后的强制改密状态，当前版本由管理员重置密码后继续接管。"
              : "当前账号未命中强制改密标记，仍建议定期由管理员轮换密码。",
          ],
          [
            "信息源作用域",
            `当前可见 ${topicSources.length} 个情绪罗盘信息源；已启用自定义源 ${customTopicSources.length}${customTopicSourceLimit > 0 ? ` / ${customTopicSourceLimit}` : ""}。`,
          ],
        ]}
      />
      <section className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit border border-stone-300/40 bg-[#f4efe6] p-5 shadow-ink xl:sticky xl:top-8">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">设置分区</div>
          <div className="mt-4 space-y-2 text-sm">
            {[
              ["个人空间资产", "#workspace-assets"],
              ["作者人设", "#persona-assets"],
              ["写作风格", "#style-assets"],
              ["模板资产", "#template-assets"],
              ["碎片素材", "/fragments"],
              ["主题档案", "/knowledge"],
              ["图片资产", "/assets"],
              ["信息源配置", "#topic-sources"],
              ["账号信息", "#account-profile"],
              ["订阅与账单", "#billing-center"],
              ["第三方授权", "#wechat-connections"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="block border border-transparent bg-white px-4 py-3 text-stone-700 transition-colors hover:border-cinnabar hover:text-cinnabar">
                {label}
              </a>
            ))}
          </div>
        </aside>
        <div className="space-y-4">
          <div id="workspace-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">个人空间资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">把可复用的人设、信息、模板和图像集中管理。</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">
                  你的个人空间已经沉淀了 {workspaceAssets.documentsCount} 篇文稿、{workspaceAssets.fragmentsCount} 条碎片、{workspaceAssets.authorPersonasCount} 个作者人设、{workspaceAssets.customTemplatesCount} 个私有模板和 {workspaceAssets.wechatConnectionsCount} 个发布连接。
                </div>
              </div>
              <Link href="/dashboard" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                返回工作台
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
                        : "去文风提取器分析一篇文章后，这里会出现最近沉淀的风格资产。"}
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
                          ? "去灵感集市提取一篇真实文章版式后，这里会显示最新模板。"
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
                          ? " 你还没有自定义情绪罗盘信息源。"
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
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.documentsCount + workspaceAssets.fragmentsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">文稿 {workspaceAssets.documentsCount} 篇，碎片 {workspaceAssets.fragmentsCount} 条。所有后续大纲、写作和核查都从这里取材。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">主题档案</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.knowledgeCardsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">已激活 {workspaceAssets.activeKnowledgeCardsCount} 张，待处理冲突 {workspaceAssets.conflictedKnowledgeCardsCount} 张。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">人设与文风</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.authorPersonasCount + workspaceAssets.writingStyleProfilesCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">作者人设 {workspaceAssets.authorPersonasCount} 个，写作风格资产 {workspaceAssets.writingStyleProfilesCount} 个，持续影响选题与写作输出。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">模板与排版基因</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.customTemplatesCount + workspaceAssets.ownedStyleGenomesCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">私有模板 {workspaceAssets.customTemplatesCount} 个，排版基因 {workspaceAssets.ownedStyleGenomesCount} 个，其中已公开 {workspaceAssets.publishedStyleGenomesCount} 个。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">图像资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">{workspaceAssets.coverImagesCount + workspaceAssets.imagePromptsCount}</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">封面图 {workspaceAssets.coverImagesCount} 张，文中配图 Prompt {workspaceAssets.imagePromptsCount} 条。</div>
              </article>
              <article className="border border-stone-300/40 bg-[#faf7f0] p-5">
                <div className="text-xs uppercase tracking-[0.24em] text-stone-500">情绪罗盘信息源</div>
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
                `作者资产：人设 ${workspaceAssets.authorPersonasCount} / 文风 ${workspaceAssets.writingStyleProfilesCount}`,
                `模板资产：私有模板 ${workspaceAssets.customTemplatesCount} / 排版基因 ${workspaceAssets.ownedStyleGenomesCount}`,
                `图像资产：封面 ${workspaceAssets.coverImagesCount} / 配图 Prompt ${workspaceAssets.imagePromptsCount}`,
                `素材资产：文稿 ${workspaceAssets.documentsCount} / 碎片 ${workspaceAssets.fragmentsCount}`,
                `信息资产：主题档案 ${workspaceAssets.knowledgeCardsCount} / 自定义信源 ${workspaceAssets.customTopicSourcesCount}`,
                `发布资产：公众号连接 ${workspaceAssets.wechatConnectionsCount}`,
              ].map((item) => (
                <div key={item} className="border border-stone-300/40 bg-[#fffdfa] px-4 py-3 text-sm leading-7 text-stone-700">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/discover" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                管理模板与排版基因
              </Link>
              <Link href="/knowledge" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看主题档案
              </Link>
              <Link href="/assets" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                打开图片资产
              </Link>
              <Link href="/fragments" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看碎片素材
              </Link>
              <Link href="/connections" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                管理发布连接
              </Link>
              <Link href="/radar" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                去情绪罗盘
              </Link>
              <a href="#wechat-connections" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                查看发布连接
              </a>
              <Link href="/tools/style-extractor" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                打开文风提取器
              </Link>
            </div>
          </div>
          <div id="persona-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <AuthorPersonaManager
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
                当前套餐支持去文风提取器分析文章，但暂不支持保存到个人空间。升级到 Pro 或 Ultra 后可长期沉淀为风格资产。
              </div>
              <div className="mt-4">
                <Link href="/tools/style-extractor" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                  打开文风提取器
                </Link>
              </div>
            </div>
          )}
          <div id="template-assets" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">模板资产</div>
                <div className="mt-3 font-serifCn text-3xl text-ink">把模板提取结果沉淀为你自己的排版资产。</div>
                <div className="mt-3 text-sm leading-7 text-stone-700">
                  当前个人空间中共有 {ownedTemplates.length}{customTemplateLimit > 0 ? ` / ${customTemplateLimit}` : ""} 个私有模板。
                  {canExtractTemplates
                    ? " 你现在可以在灵感集市输入文章链接，提取模板后自动保存到这里。"
                    : " 当前套餐仅支持浏览官方模板；升级到 Pro 或 Ultra 后，才可把外部链接提取为私有模板。"}
                </div>
              </div>
              <Link href="/discover" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
                去管理模板
              </Link>
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
                  ? "你还没有私有模板资产。去灵感集市粘贴一篇公众号或网页文章链接，系统会先抓取页面，再提取可复用版式并沉淀到个人空间。"
                  : "你还没有私有模板资产。当前套餐不会保存模板提取结果，先浏览官方模板；如需建立个人模板库，请升级到 Pro 或 Ultra。"}
              </div>
            )}
          </div>
          <div id="topic-sources" className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">情绪罗盘信息源</div>
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
          <div id="account-profile" className="border border-stone-300/40 bg-white p-6 shadow-ink">
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
              <div>图片资产空间：{formatBytes(imageAssetQuota.usedBytes)} / {formatBytes(imageAssetQuota.limitBytes)}</div>
              <div>私有模板资产：{customTemplateLimit > 0 ? `${ownedTemplates.length} / ${customTemplateLimit}` : "未开放"}</div>
              <div>自定义信源：{customTopicSourceLimit > 0 ? `${customTopicSources.length} / ${customTopicSourceLimit}` : "未开放"}</div>
              <div>唯一图片对象：{imageAssetQuota.uniqueObjectCount} 个</div>
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
