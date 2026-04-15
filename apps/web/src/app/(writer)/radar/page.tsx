import { TopicRadarStarter } from "@/components/dashboard-client";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { WriterOverview } from "@/components/writer-views";
import { getAuthorPersonas, hasAuthorPersona } from "@/lib/author-personas";
import { getKnowledgeCards } from "@/lib/knowledge";
import { buildTopicAngleOptions, buildTopicJudgementShift, matchTopicToKnowledgeCards } from "@/lib/knowledge-match";
import { getCustomTopicSourceLimit, getUserPlanContext } from "@/lib/plan-access";
import { requireWriterSession } from "@/lib/page-auth";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";
import { getVisibleTopicSources } from "@/lib/topic-radar";

function parseStringList(value: string | string[] | null | undefined) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export default async function RadarPage() {
  const { session } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }
  const [topics, knowledgeCards, sources, planContext, personas] = await Promise.all([
    getVisibleTopicRecommendationsForUser(session.userId),
    getKnowledgeCards(session.userId),
    getVisibleTopicSources(session.userId),
    getUserPlanContext(session.userId),
    getAuthorPersonas(session.userId),
  ]);
  const canStart = planContext.effectivePlanCode !== "free";
  const canManageSources = ["pro", "ultra"].includes(planContext.effectivePlanCode);
  const customTopicSourceLimit = getCustomTopicSourceLimit(planContext.effectivePlanCode);
  const defaultPersona = personas.find((item) => item.isDefault) ?? personas[0] ?? null;
  const customTopicSources = sources.filter((source) => source.owner_user_id != null);
  const knowledgeMatches = Object.fromEntries(
    topics.map((topic) => [
      topic.id,
      matchTopicToKnowledgeCards(
        topic.title,
        knowledgeCards.map((card) => ({
          id: card.id,
          title: card.title,
          summary: card.summary,
          latestChangeSummary: card.latest_change_summary,
          overturnedJudgements: parseStringList(card.overturned_judgements_json),
          card_type: card.card_type,
          status: card.status,
          confidence_score: card.confidence_score,
          shared: Boolean((card as { shared?: boolean }).shared),
          owner_username: (card as { owner_username?: string | null }).owner_username ?? null,
        })),
      ),
    ]),
  );

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="情绪罗盘"
        title="不是再读一遍新闻，而是把热点改造成可落笔的情绪切角。"
        description="系统定时抓取资讯后，不产出流水线摘要，而是生成带情绪方向的大纲入口，让你直接开始组装。"
        metrics={[
          { label: "今日可见选题", value: String(topics.length), note: `当前已按 ${planContext.plan.name} 套餐限制可见范围，并用${defaultPersona ? `「${defaultPersona.name}」` : "当前人设"}参与排序。` },
          { label: "已生成切角", value: canStart ? String(topics.length * 3) : "仅 Pro+ 可见", note: canStart ? "每条热点默认给出三种进入角度，并附带推荐理由。" : "免费版只浏览 Top1 榜单标题，不展开情绪切角。" },
          { label: "一键落笔", value: canStart ? "实时生成" : "未开放", note: canStart ? "点击任意热点即可创建文稿并进入编辑器。" : "升级到 Pro 或更高套餐后解锁。" },
        ]}
        cards={[
          { title: "愤怒切角", description: "抓住利益受损、虚假叙事和失真话术。", meta: "Angle 01" },
          { title: "焦虑切角", description: "围绕职业处境、价格战和利润收缩来写。", meta: "Angle 02" },
          { title: "冷眼旁观", description: "拉开距离，写结构问题而不是发泄情绪。", meta: "Angle 03" },
        ]}
      />
      <TopicRadarStarter
        canStart={canStart}
        knowledgeMatches={knowledgeMatches}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          sourceName: topic.sourceName,
          sourceType: topic.sourceType,
          sourcePriority: topic.sourcePriority,
          sourceUrl: topic.sourceUrl,
          publishedAt: topic.publishedAt,
          recommendationType: topic.recommendationType,
          recommendationReason: topic.recommendationReason,
          matchedPersonaName: topic.matchedPersonaName,
          emotionLabels: topic.emotionLabels,
          angleOptions: buildTopicAngleOptions(
            topic.title,
            topic.angleOptions,
            knowledgeMatches[topic.id] ?? [],
          ),
          judgementShift: buildTopicJudgementShift(topic.title, knowledgeMatches[topic.id] ?? []),
        }))}
      />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Source Scope</div>
          <h2 className="mt-3 font-serifCn text-3xl text-ink">情绪罗盘现在支持自定义信息源，且只在你的可见作用域内生效。</h2>
          <div className="mt-6">
            <TopicSourceManagerClient
              canManage={canManageSources}
              currentCustomCount={customTopicSources.length}
              maxCustomCount={customTopicSourceLimit}
              planName={planContext.plan.name}
              sources={sources.map((source) => ({
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
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">权限边界</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>`free` 仅可见 Top10 的第 1 条，并只浏览标题榜单。</p>
            <p>`pro` 可见前 5 条，并可启用最多 5 个自定义信源。</p>
            <p>`ultra` 可见 Top10 全部，且最多可启用 20 个自定义信源与完整工作流。</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
