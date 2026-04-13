import { TopicRadarStarter } from "@/components/dashboard-client";
import { TopicSourceManagerClient } from "@/components/topic-source-client";
import { WriterOverview } from "@/components/writer-views";
import { getKnowledgeCards } from "@/lib/knowledge";
import { buildTopicAngleOptions, buildTopicJudgementShift, matchTopicToKnowledgeCards } from "@/lib/knowledge-match";
import { requireWriterSession } from "@/lib/page-auth";
import { getTopicItems } from "@/lib/repositories";
import { getVisibleTopicSources } from "@/lib/topic-radar";

export default async function RadarPage() {
  const { session, user } = await requireWriterSession();
  const [topics, knowledgeCards, sources] = await Promise.all([
    getTopicItems(session.userId),
    getKnowledgeCards(session.userId),
    getVisibleTopicSources(session.userId),
  ]);
  const canManageSources = ["ultra", "team"].includes(user.plan_code);
  const knowledgeMatches = Object.fromEntries(
    topics.map((topic) => [
      topic.id,
      matchTopicToKnowledgeCards(
        topic.title,
        knowledgeCards.map((card) => ({
          id: card.id,
          title: card.title,
          summary: card.summary,
          card_type: card.card_type,
          status: card.status,
          confidence_score: card.confidence_score,
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
          { label: "今日热点", value: String(topics.length), note: "当前从系统内置源与你的可见作用域自定义源实时汇总。" },
          { label: "已生成切角", value: String(topics.length * 3), note: "每条热点默认给出三种进入角度。" },
          { label: "一键落笔", value: "实时生成", note: "点击任意热点即可创建文稿并进入编辑器。" },
        ]}
        cards={[
          { title: "愤怒切角", description: "抓住利益受损、虚假叙事和失真话术。", meta: "Angle 01" },
          { title: "焦虑切角", description: "围绕职业处境、价格战和利润收缩来写。", meta: "Angle 02" },
          { title: "冷眼旁观", description: "拉开距离，写结构问题而不是发泄情绪。", meta: "Angle 03" },
        ]}
      />
      <TopicRadarStarter
        knowledgeMatches={knowledgeMatches}
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          sourceName: topic.source_name,
          emotionLabels: Array.isArray(topic.emotion_labels_json) ? topic.emotion_labels_json : JSON.parse(String(topic.emotion_labels_json ?? "[]")),
          angleOptions: buildTopicAngleOptions(
            topic.title,
            Array.isArray(topic.angle_options_json) ? topic.angle_options_json : JSON.parse(String(topic.angle_options_json ?? "[]")),
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
              sources={sources.map((source) => ({
                id: source.id,
                name: source.name,
                homepageUrl: source.homepage_url,
                scope: source.owner_user_id == null ? "system" : user.plan_code === "team" ? "team" : "custom",
              }))}
            />
          </div>
        </div>
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">权限边界</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>`free` 只能浏览系统源产出的热点。</p>
            <p>`pro` 可以一键落笔，但仍只读系统源。</p>
            <p>`ultra` 可新增自己的外部源，不会污染其他用户的热点池。</p>
            <p>`team` 新增的源会在团队共享作用域内可见。</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
