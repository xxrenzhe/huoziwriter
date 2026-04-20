import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { ImaConnectionsManager } from "@/components/ima-connections-manager";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getIntelligenceSettingsData } from "../data";
import { SettingsSubpageShell } from "../shell";

const sectionCardClassName = surfaceCardStyles({ padding: "lg" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");

export default async function SettingsIntelligenceKbPage() {
  const data = await getIntelligenceSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, connections } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const validConnections = connections.filter((item) => item.status === "valid");
  const enabledKnowledgeBases = connections.flatMap((item) => item.knowledgeBases).filter((item) => item.isEnabled);
  const defaultKnowledgeBase = enabledKnowledgeBases.find((item) => item.isDefault) ?? null;

  return (
    <SettingsSubpageShell
      current="intelligence-kb"
      description="把 IMA 个人智库接进作战台和证据面板。这里只负责绑定凭证、同步知识库和维护默认库。"
      stats={[
        {
          label: "IMA 连接",
          value: planSnapshot.canManageTopicSources ? String(connections.length) : "未开放",
          note: planSnapshot.canManageTopicSources
            ? validConnections.length > 0
              ? `可用连接 ${validConnections.length} 个`
              : "还没有可用连接"
            : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
        },
        {
          label: "启用知识库",
          value: planSnapshot.canManageTopicSources ? String(enabledKnowledgeBases.length) : "未开放",
          note: defaultKnowledgeBase ? `默认库：${defaultKnowledgeBase.kbName}` : "还没有默认知识库",
        },
        {
          label: "接入范围",
          value: "Warroom + 证据",
          note: "裂变候选可切到 IMA 真实爆款；证据面板可直接从 IMA 检索。",
        },
      ]}
    >
      <section id="ima-integration" className="space-y-4 scroll-mt-8">
        <div className={sectionCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">智库信源</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
            把 IMA 知识库作为高价值信源接进既有工作流。
          </div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">
            这里不做周期同步，也不把 IMA 塞进机会信源抓取管道。它只服务两件事：Warroom 裂变时提供真实爆款语料，证据面板里提供同赛道检索入口。
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "接入方式",
                value: "按需检索",
                note: "只在你主动发起裂变或证据检索时调用 IMA。",
              },
              {
                label: "凭证安全",
                value: "加密存储",
                note: "前端只拿到标签、状态和知识库元数据，不返回明文凭证。",
              },
              {
                label: "默认知识库",
                value: defaultKnowledgeBase?.kbName || "未设置",
                note: defaultKnowledgeBase ? "Warroom 和证据检索默认优先使用它。" : "先启用至少一个知识库，并设为默认。",
              },
            ].map((item) => (
              <article key={item.label} className={summaryCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              </article>
            ))}
          </div>
        </div>

        <div className={sectionCardClassName}>
          <ImaConnectionsManager
            canManage={planSnapshot.canManageTopicSources}
            connections={connections}
            planName={plan?.name || effectivePlanCode}
          />
        </div>
      </section>
    </SettingsSubpageShell>
  );
}
