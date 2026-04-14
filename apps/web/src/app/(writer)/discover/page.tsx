import { DiscoverClient } from "@/components/discover-client";
import Link from "next/link";
import { WriterOverview } from "@/components/writer-views";
import { getActiveTemplates, getStyleGenomes } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import { canExtractPrivateTemplate, getCustomTemplateLimit, getTemplateAccessLimit, getUserPlanContext } from "@/lib/plan-access";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";

function formatTopicRecommendationType(type: "hot" | "persona" | "hybrid") {
  if (type === "persona") return "人设匹配";
  if (type === "hybrid") return "热点 × 人设";
  return "热点优先";
}

function formatTopicSourceType(type: string) {
  if (type === "youtube") return "YouTube";
  if (type === "reddit") return "Reddit";
  if (type === "x") return "X";
  if (type === "podcast") return "Podcast";
  if (type === "spotify") return "Spotify";
  if (type === "rss") return "RSS";
  if (type === "blog") return "Blog";
  return "News";
}

function formatTopicPublishedAt(value: string | null | undefined) {
  if (!value) return "时间未知";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseConfig(value: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function DiscoverPage() {
  const { session } = await requireWriterSession();
  const [topics, planContext, genomes, templates] = await Promise.all([
    getVisibleTopicRecommendationsForUser(session.userId),
    getUserPlanContext(session.userId),
    getStyleGenomes({ includePrivateForUserId: session.userId }),
    getActiveTemplates(session.userId),
  ]);
  const latestTopics = topics.slice(0, 3);
  const currentPlan = planContext.plan;
  const canSeeAngles = planContext.effectivePlanCode !== "free";
  const canForkGenomes = Boolean(currentPlan?.can_fork_genomes);
  const canPublishGenomes = Boolean(currentPlan?.can_publish_genomes);
  const canExtractTemplates = canExtractPrivateTemplate(planContext.effectivePlanCode);
  const customTemplateLimit = getCustomTemplateLimit(planContext.effectivePlanCode);
  const templateLimit = getTemplateAccessLimit(currentPlan.code as "free" | "pro" | "ultra");
  const accessibleTemplates = [
    ...templates.filter((template) => template.ownerUserId == null).slice(0, templateLimit),
    ...templates.filter((template) => template.ownerUserId === session.userId),
  ];
  const ownedTemplateCount = templates.filter((template) => template.ownerUserId === session.userId).length;
  const workflowHint = canSeeAngles
    ? "如果你现在要开始写，优先走“情绪罗盘 → 一键落笔 → 大纲节点挂载 → 编辑器生成 → 微信草稿箱”的主链路。"
    : "当前套餐在这里先浏览模板资产和热点标题；升级到 Pro 后，才会展开情绪切角并支持一键落笔。";

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="灵感集市"
        title="风格模板、切角库存和语言约束，应该像资产一样长期复用。"
        description={canSeeAngles ? "这里展示官方与个人排版基因，以及最新热点切角。现在已经支持套餐门禁下的 Fork 与发布。" : "这里展示官方与个人排版基因，以及最新热点标题。免费版先浏览热点榜单与模板资产，切角和落笔入口在 Pro 及以上套餐开放。"}
        metrics={[
          { label: "模板资产", value: String(genomes.length), note: "当前模板库优先覆盖专栏、评论和净化场景。" },
          { label: canSeeAngles ? "热点切角" : "热点标题", value: String(topics.length), note: canSeeAngles ? "由情绪罗盘沉淀，可直接转成写作入口。" : "免费版只展示榜单与标题，不展开情绪切角。" },
          { label: "已落地动作", value: canPublishGenomes ? "Fork / 发布" : canForkGenomes ? "Fork" : "浏览", note: "模板 Fork、公开发布和热点切角都已经按套餐门禁控制。" },
        ]}
        cards={genomes.slice(0, 3).map((genome) => ({
          title: genome.name,
          description: genome.description || "暂无说明",
          meta: genome.meta || "排版基因",
        }))}
      />
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Style Market</div>
          <h2 className="mt-3 font-serifCn text-3xl text-ink">排版基因与风格资产</h2>
          <div className="mt-6">
            <DiscoverClient
              canExtractTemplates={canExtractTemplates}
              canForkGenomes={canForkGenomes}
              canPublishGenomes={canPublishGenomes}
              customTemplateLimit={customTemplateLimit}
              genomes={genomes.map((genome) => ({
                id: genome.id,
                name: genome.name,
                description: genome.description,
                meta: genome.meta,
                config: parseConfig(genome.config_json),
                isPublic: Boolean(genome.is_public),
                isOfficial: Boolean(genome.is_official),
                ownerUserId: genome.owner_user_id,
                ownerUsername: genome.owner_username,
              }))}
              templates={accessibleTemplates.map((template) => ({
                id: template.id,
                version: template.version,
                name: template.name,
                description: template.description,
                meta: template.meta,
                ownerUserId: template.ownerUserId,
                sourceUrl: template.sourceUrl,
                config: template.config,
                usageCount: template.usageCount,
                lastUsedAt: template.lastUsedAt,
              }))}
              ownedTemplateCount={ownedTemplateCount}
            />
          </div>
        </div>
        <aside className="space-y-4">
          <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Latest Angles</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">{canSeeAngles ? "最新可落笔热点" : "最新热点榜单"}</h2>
            <div className="mt-6 space-y-4">
              {latestTopics.map((topic) => {
                const angles = topic.angleOptions;
                return (
                  <article key={topic.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.24em] text-stone-500">
                      <span>{topic.sourceName}</span>
                      <span className="border border-stone-300 bg-white px-2 py-1">{formatTopicRecommendationType(topic.recommendationType)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                      <span className="border border-stone-300 bg-white px-2 py-1">
                        信源类型 · {formatTopicSourceType(topic.sourceType)}
                      </span>
                      <span className="border border-stone-300 bg-white px-2 py-1">
                        优先级 · {topic.sourcePriority}
                      </span>
                      <span className="border border-stone-300 bg-white px-2 py-1">
                        发布时间 · {formatTopicPublishedAt(topic.publishedAt)}
                      </span>
                      {topic.sourceUrl ? (
                        <a
                          href={topic.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-stone-300 bg-white px-2 py-1 text-cinnabar"
                        >
                          查看原始链接
                        </a>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-serifCn text-2xl text-ink">{topic.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-stone-700">
                      {canSeeAngles ? topic.recommendationReason : "免费版先浏览热点标题与来源；升级到 Pro 后，这里会展开情绪切角和推荐理由。"}
                    </p>
                    {canSeeAngles ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {angles.slice(0, 3).map((angle) => (
                          <span key={angle} className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                            {angle}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 border border-dashed border-stone-300 bg-white px-3 py-3 text-xs leading-6 text-stone-500">
                        当前套餐不展开情绪切角。去套餐页可查看 Pro 及以上能力边界。
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
          <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">下一步</div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
              <p>官方排版基因可以直接 Fork；私有基因若要公开，需要满足套餐门禁。</p>
              <p>{workflowHint}</p>
            </div>
            <div className="mt-5 space-y-3">
              <Link href="/radar" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                去情绪罗盘挑热点
              </Link>
              {!canSeeAngles ? (
                <Link href="/pricing" className="block border border-cinnabar bg-white px-4 py-3 text-sm text-cinnabar">
                  查看套餐权限
                </Link>
              ) : null}
              <Link href="/dashboard" className="block border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white">
                返回工作台新建文稿
              </Link>
            </div>
          </aside>
        </aside>
      </section>
    </div>
  );
}
