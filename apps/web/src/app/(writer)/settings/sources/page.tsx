import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { formatSourceTypeLabel, getSourcesSettingsData } from "../data";
import { LanguageGuardManager } from "../language-guard-manager";
import { SettingsSubpageShell } from "../shell";

const introCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "shadow-none");
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const managerSectionClassName = cn(surfaceCardStyles({ padding: "md" }), "space-y-4");
const queueCardClassName = cn(surfaceCardStyles({ tone: "warning", padding: "md" }), "shadow-none");
const chipClassName = cn(surfaceCardStyles({ padding: "sm" }), "px-3 py-1 text-xs text-inkSoft shadow-none");

export default async function SettingsSourcesPage() {
  const data = await getSourcesSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, topicSources, languageGuardRules } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const customTopicSources = topicSources.filter((source) => source.owner_user_id != null);
  const activeCustomTopicSources = customTopicSources.filter((source) => Boolean(source.is_active));
  const inactiveCustomTopicSources = customTopicSources.filter((source) => !Boolean(source.is_active));
  const systemTopicSources = topicSources.filter((source) => source.owner_user_id == null);
  const activeTopicSources = topicSources.filter((source) => Boolean(source.is_active));
  const degradedTopicSources = topicSources.filter((source) => {
    const status = String(source.connector_status || "healthy");
    return status !== "healthy" || Number(source.connector_consecutive_failures || 0) > 0 || Number(source.connector_health_score ?? 100) < 80;
  });
  const topPrioritySources = [...activeTopicSources]
    .sort((left, right) => (right.priority ?? 100) - (left.priority ?? 100))
    .slice(0, 5);
  const sourceTypeSummary = Array.from(
    activeTopicSources.reduce((map, source) => {
      const key = formatSourceTypeLabel(source.source_type);
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4);
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
  const shouldAddCustomSourceTask = canManageTopicSources && customTopicSources.length === 0;
  const shouldRestoreSourcesTask = inactiveCustomTopicSources.length > 0;
  const shouldFixHealthTask = degradedTopicSources.length > 0;
  const shouldDiversifySourcesTask = activeTopicSources.length > 0 && sourceTypeSummary.length < 2;
  const sourceQueueCount =
    (shouldAddCustomSourceTask ? 1 : 0)
    + (shouldRestoreSourcesTask ? 1 : 0)
    + (shouldFixHealthTask ? 1 : 0)
    + (shouldDiversifySourcesTask ? 1 : 0);

  return (
    <SettingsSubpageShell
      current="sources"
      description="统一维护系统源与自定义来源池。热点排序和作战台观察只消费这里的优先级、类型与启停状态。"
      stats={[
        {
          label: "可见信源",
          value: String(activeTopicSources.length),
          note: `系统源 ${systemTopicSources.length} 个，自定义启用 ${activeCustomTopicSources.length} 个`,
        },
        {
          label: "自定义额度",
          value: customSourceUsageLabel,
          note:
            planSnapshot.customTopicSourceLimit > 0
              ? inactiveCustomTopicSources.length > 0
                ? `已停用 ${inactiveCustomTopicSources.length} 个，可随时恢复`
                : "停用旧源后会释放名额"
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

        <section className={managerSectionClassName}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理信源任务</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
                先决定是补来源、恢复旧来源，还是先修异常来源。
              </div>
            </div>
            <div className="text-sm text-inkMuted">当前 {sourceQueueCount} 类待处理入口</div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {shouldAddCustomSourceTask ? (
              <article className={queueCardClassName}>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClassName}>自定义来源</span>
                  <span className={chipClassName}>待补 1 类</span>
                </div>
                <div className="mt-4 font-serifCn text-2xl text-ink text-balance">先补 1 个长期稳定来源，别只靠系统默认源。</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  现在还没有任何自定义来源，作战台机会排序只能沿用系统覆盖。先补一条长期观察线，后续热点优先级才会真正带上你的判断。
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/settings/sources#source-manager" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去补自定义来源
                  </Link>
                </div>
              </article>
            ) : null}

            {shouldRestoreSourcesTask ? (
              <article className={queueCardClassName}>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClassName}>停用来源</span>
                  <span className={chipClassName}>待恢复 {inactiveCustomTopicSources.length} 个</span>
                </div>
                <div className="mt-4 font-serifCn text-2xl text-ink text-balance">有些长期来源已经停用，先决定要不要恢复。</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  停用来源不会再参与机会排序，但可能正好占着你的长期观察位。先回来源池判断哪些该恢复，避免热点视角突然断线。
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/settings/sources#source-manager" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去恢复停用来源
                  </Link>
                </div>
              </article>
            ) : null}

            {shouldFixHealthTask ? (
              <article className={queueCardClassName}>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClassName}>来源健康</span>
                  <span className={chipClassName}>待处理 {degradedTopicSources.length} 个</span>
                </div>
                <div className="mt-4 font-serifCn text-2xl text-ink text-balance">先修健康度下降的来源，再看热点偏好。</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  只要来源连续失败或健康度掉下去，排序结果本身就不稳定。优先处理异常来源，后面的优先级和类型策略才有意义。
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/settings/sources#source-health" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去看异常来源
                  </Link>
                </div>
              </article>
            ) : null}

            {shouldDiversifySourcesTask ? (
              <article className={queueCardClassName}>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClassName}>类型分布</span>
                  <span className={chipClassName}>当前仅 {sourceTypeSummary.length} 类</span>
                </div>
                <div className="mt-4 font-serifCn text-2xl text-ink text-balance">来源类型过于单一，先补一条不同类型的观察线。</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  当前激活来源主要集中在同一类型，容易把机会排序变成单一视角。优先补一条不同类型的来源，让热点判断更立体。
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/settings/sources#source-manager" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去补来源类型
                  </Link>
                </div>
              </article>
            ) : null}

            {sourceQueueCount === 0 ? (
              <article className={queueCardClassName}>
                <div className="flex flex-wrap gap-2">
                  <span className={chipClassName}>来源池健康</span>
                </div>
                <div className="mt-4 font-serifCn text-2xl text-ink text-balance">当前没有明显待处理的信源阻塞。</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  来源池已经具备可用覆盖、健康度和类型分布。接下来可以继续在优先级区微调排序，或者直接回作战台看机会。
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/settings/sources#source-priority" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去看高优先级来源
                  </Link>
                  <Link href="/warroom" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    去作战台
                  </Link>
                </div>
              </article>
            ) : null}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <article id="source-priority" className={managerSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">热点偏好</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
              现在真正影响热点排序的，就是这批来源的优先级、启停状态和健康度。
            </div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              不再额外做一层抽象配置。高优先级、持续启用且健康度稳定的来源，会更早进入作战台机会排序；当前这块直接给你看正在起作用的来源快照。
            </div>
            <div className="mt-4 grid gap-3">
              {topPrioritySources.length > 0 ? (
                topPrioritySources.map((source) => (
                  <div key={source.id} className="border border-lineStrong bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-ink">{source.name}</div>
                        <div className="mt-1 text-xs text-inkMuted">
                          {formatSourceTypeLabel(source.source_type)} · {source.owner_user_id == null ? "系统源" : "自定义源"}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
                        <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">优先级 {source.priority ?? 100}</span>
                        <span className="border border-lineStrong bg-surfaceWarm px-3 py-2">健康 {Math.round(Number(source.connector_health_score ?? 100))}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前还没有激活来源。先至少启用 1 个长期稳定来源，再让作战台更快出现可用机会。
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-inkMuted">
              {sourceTypeSummary.length > 0 ? (
                sourceTypeSummary.map(([label, count]) => (
                  <span key={label} className="border border-lineStrong bg-surface px-3 py-2">
                    {label} {count}
                  </span>
                ))
              ) : (
                <span className="border border-lineStrong bg-surface px-3 py-2">暂无类型分布</span>
              )}
            </div>
          </article>
          <article className={managerSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">AI 噪声治理</div>
            <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
              噪声治理已经收口到语言守卫同一套规则，这里可以直接维护。
            </div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              “AI 噪声字典”不再单独分叉存一份。这里直接维护与你的语言守卫同源的禁词和句式模板，让信源判断、写作约束和发布守门始终共享同一套规则。
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-lineStrong bg-surface px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">规则总数</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{languageGuardRules.length}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">系统默认词与自定义禁词都从语言守卫页统一维护。</div>
              </div>
              <div className="border border-lineStrong bg-surface px-4 py-4">
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前风险来源</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{degradedTopicSources.length}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">来源端先保证健康，语言端再做硬规则治理，发布阶段才不会同时爆雷。</div>
              </div>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl text-sm leading-7 text-inkSoft">
                  这里直接补最常见的机器腔词和句式模板；完整语言守卫页仍然保留，方便你从“信源治理”或“规则总览”两个入口进入同一套规则库。
                </div>
                <Link href="/settings/language-guard" className={buttonStyles({ variant: "secondary" })}>
                  打开完整规则页
                </Link>
              </div>
              <div className="mt-4">
                <LanguageGuardManager
                  initialRules={languageGuardRules}
                  limit={planContext.planSnapshot.languageGuardRuleLimit}
                />
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className={managerSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前高优先级来源</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这几条来源会最先影响作战台的机会排序。想让某条长期观察线更靠前，就直接调整这里的优先级。
            </div>
            <div className="space-y-3">
              {topPrioritySources.map((source) => (
                <div key={`priority-${source.id}`} className="border border-lineStrong bg-surface px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-ink">{source.name}</div>
                      <div className="mt-1 text-xs text-inkMuted">{source.homepage_url || "未配置主页地址"}</div>
                    </div>
                    <span className="border border-lineStrong bg-surfaceWarm px-3 py-2 text-xs text-inkMuted">
                      P{source.priority ?? 100}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article id="source-health" className={managerSectionClassName}>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">需要处理的来源</div>
            <div className="mt-2 text-sm leading-7 text-inkSoft">
              这里直接暴露健康度下降或连续失败的来源。先修来源，再谈热点偏好，否则排序结果本身就不稳定。
            </div>
            <div className="space-y-3">
              {degradedTopicSources.length > 0 ? (
                degradedTopicSources.slice(0, 5).map((source) => (
                  <div key={`degraded-${source.id}`} className="border border-warning/40 bg-surfaceWarning px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{source.name}</div>
                        <div className="mt-1 text-xs text-warning">
                          {source.connector_degraded_reason || source.connector_last_error || "来源健康度下降，需要检查。"}
                        </div>
                      </div>
                      <span className="border border-warning/40 bg-surface px-3 py-2 text-xs text-warning">
                        健康 {Math.round(Number(source.connector_health_score ?? 100))}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                  当前没有明显异常来源，热点排序会优先按优先级和类型分层工作。
                </div>
              )}
            </div>
          </article>
        </div>

        <div id="source-manager" className={managerSectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">来源池管理</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
                在这里维护真正参与排序的来源清单。
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">
                {canManageTopicSources
                  ? "新增、停用、恢复和优先级调整都会直接影响热点排序，作战台只读取这里的最新结果。"
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
            currentCustomCount={activeCustomTopicSources.length}
            maxCustomCount={planSnapshot.customTopicSourceLimit}
            planName={plan?.name || effectivePlanCode}
            sources={topicSources.map((source) => ({
              id: source.id,
              name: source.name,
              homepageUrl: source.homepage_url,
              sourceType: source.source_type ?? "news",
              priority: source.priority ?? 100,
              scope: source.owner_user_id == null ? "system" : "custom",
              isActive: Boolean(source.is_active),
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
