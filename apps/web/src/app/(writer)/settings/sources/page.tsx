import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getSourcesSettingsData } from "../data";
import { SettingsSubpageShell } from "../shell";

const introCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "shadow-none");
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const managerSectionClassName = cn(surfaceCardStyles({ padding: "md" }), "space-y-4");

export default async function SettingsSourcesPage() {
  const data = await getSourcesSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, topicSources } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const customTopicSources = topicSources.filter((source) => source.owner_user_id != null);
  const systemTopicSources = topicSources.filter((source) => source.owner_user_id == null);
  const displayPlanName = formatPlanDisplayName(plan?.name || effectivePlanCode);
  const canManageTopicSources = planSnapshot.canManageTopicSources;
  const customSourceUsageLabel =
    planSnapshot.customTopicSourceLimit > 0
      ? `${customTopicSources.length} / ${planSnapshot.customTopicSourceLimit}`
      : "未开放";
  const remainingCustomSourceSlots =
    planSnapshot.customTopicSourceLimit > 0
      ? Math.max(planSnapshot.customTopicSourceLimit - customTopicSources.length, 0)
      : 0;

  return (
    <SettingsSubpageShell
      current="sources"
      description="统一维护系统源与自定义来源池。热点排序和作战台观察只消费这里的优先级、类型与启停状态。"
      stats={[
        {
          label: "可见信源",
          value: String(topicSources.length),
          note: `系统源 ${systemTopicSources.length} 个，自定义源 ${customTopicSources.length} 个`,
        },
        {
          label: "自定义额度",
          value: customSourceUsageLabel,
          note:
            planSnapshot.customTopicSourceLimit > 0
              ? "停用旧源后会释放名额"
              : `当前套餐 ${displayPlanName} 暂未开放`,
        },
        {
          label: "优先级影响",
          value: customTopicSources.length > 0 ? "已启用" : "待补充",
          note: customTopicSources.length > 0 ? "高优先级源会更早进入热点排序" : "建议至少补 1 个长期稳定来源",
        },
      ]}
      actions={
        <Link href="/warroom" className={buttonStyles({ variant: "secondary" })}>
          去作战台
        </Link>
      }
    >
      <section id="topic-sources" className="space-y-4 scroll-mt-8">
        <div className={introCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">信源总览</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
            把系统默认源和你的长期观察池分层维护。
          </div>
          <div className="mt-3 max-w-3xl text-sm leading-7 text-inkSoft">
            系统源负责基础覆盖，自定义源补足你的长期判断线；排序、类型和启停状态都只在这里维护。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: "系统覆盖",
              value: String(systemTopicSources.length),
              note:
                systemTopicSources.length > 0
                  ? "系统默认源始终可见，不占自定义额度。"
                  : "当前没有可展示的系统默认源。",
            },
            {
              label: "自定义池",
              value: customSourceUsageLabel,
              note:
                planSnapshot.customTopicSourceLimit > 0
                  ? `还可新增 ${remainingCustomSourceSlots} 个来源。`
                  : `当前套餐 ${displayPlanName} 仅支持浏览系统默认源。`,
            },
            {
              label: "排序信号",
              value: customTopicSources.length > 0 ? "已接入" : "待补充",
              note:
                customTopicSources.length > 0
                  ? "高优先级源会更早进入机会排序与热点视角。"
                  : "建议先补 1 个长期稳定来源作为判断基线。",
            },
          ].map((item) => (
            <article key={item.label} className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
            </article>
          ))}
        </div>

        <div className={managerSectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">来源池管理</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
                在这里维护真正参与排序的来源清单。
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {canManageTopicSources
                  ? "新增、停用和优先级调整都会直接影响热点排序，作战台只读取这里的最新结果。"
                  : "当前套餐只能浏览系统默认源；升级后才可维护自己的长期来源池。"}
              </div>
            </div>
            <div className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                {canManageTopicSources ? "剩余名额" : "当前模式"}
              </div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
                {canManageTopicSources ? String(remainingCustomSourceSlots) : "只读"}
              </div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">
                {canManageTopicSources
                  ? `当前套餐 ${displayPlanName} 最多可启用 ${planSnapshot.customTopicSourceLimit} 个自定义源。`
                  : `当前套餐 ${displayPlanName} 暂未开放自定义信源。`}
              </div>
            </div>
          </div>

          <TopicSourceManagerClient
            canManage={canManageTopicSources}
            currentCustomCount={customTopicSources.length}
            maxCustomCount={planSnapshot.customTopicSourceLimit}
            planName={plan?.name || effectivePlanCode}
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
      </section>
    </SettingsSubpageShell>
  );
}
