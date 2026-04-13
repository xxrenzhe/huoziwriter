import { DiscoverClient } from "@/components/discover-client";
import Link from "next/link";
import { WriterOverview } from "@/components/writer-views";
import { getActiveTemplates, getStyleGenomes } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import { getTopicItems } from "@/lib/repositories";

function parseArray(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
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
  const topics = await getTopicItems(session.userId);
  const [genomes, templates] = await Promise.all([
    getStyleGenomes({ includePrivateForUserId: session.userId }),
    getActiveTemplates(),
  ]);
  const latestTopics = topics.slice(0, 3);

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="灵感集市"
        title="风格模板、切角库存和语言约束，应该像资产一样长期复用。"
        description="这里展示官方与个人排版基因，以及最新热点切角。现在已经支持套餐门禁下的 Fork 与发布。"
        metrics={[
          { label: "模板资产", value: String(genomes.length), note: "当前模板库优先覆盖专栏、评论和净化场景。" },
          { label: "热点切角", value: String(topics.length), note: "由情绪罗盘沉淀，可直接转成写作入口。" },
          { label: "已落地动作", value: "Fork / 发布", note: "Fork 与发布已经受套餐门禁控制并写入数据库。" },
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
              templates={templates.map((template) => ({
                id: template.id,
                version: template.version,
                name: template.name,
                description: template.description,
                meta: template.meta,
                config: template.config,
              }))}
            />
          </div>
        </div>
        <aside className="space-y-4">
          <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Latest Angles</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">最新可落笔热点</h2>
            <div className="mt-6 space-y-4">
              {latestTopics.map((topic) => {
                const angles = parseArray(topic.angle_options_json);
                return (
                  <article key={topic.id} className="border border-stone-300/40 bg-[#faf7f0] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{topic.source_name}</div>
                    <h3 className="mt-3 font-serifCn text-2xl text-ink">{topic.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-stone-700">{topic.summary || "暂无摘要，建议直接从事实冲突切入。"}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {angles.slice(0, 3).map((angle) => (
                        <span key={angle} className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                          {angle}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">下一步</div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
              <p>官方排版基因可以直接 Fork；私有基因若要公开，需要满足套餐门禁。</p>
              <p>如果你现在要开始写，优先走“情绪罗盘 → 一键落笔 → 大纲节点挂载 → 编辑器生成 → 微信草稿箱”的主链路。</p>
            </div>
            <div className="mt-5 space-y-3">
              <Link href="/radar" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                去情绪罗盘挑热点
              </Link>
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
