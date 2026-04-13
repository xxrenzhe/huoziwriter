import { CreateDocumentForm, DocumentList, KnowledgeCardsPanel } from "@/components/dashboard-client";
import { getUserAccessScope } from "@/lib/access-scope";
import { getKnowledgeCards } from "@/lib/knowledge";
import { getUserPlanContext } from "@/lib/plan-access";
import { WriterOverview } from "@/components/writer-views";
import { requireWriterSession } from "@/lib/page-auth";
import { getDocumentsByUser, getFragmentsByUser, getTopicItems, getWechatSyncLogs } from "@/lib/repositories";

function parseStringList(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const { session } = await requireWriterSession();
  const [documents, fragments, syncLogs, topics, knowledgeCards, scope, planContext] = await Promise.all([
    getDocumentsByUser(session.userId),
    getFragmentsByUser(session.userId),
    getWechatSyncLogs(session.userId),
    getTopicItems(session.userId),
    getKnowledgeCards(session.userId),
    getUserAccessScope(session.userId),
    getUserPlanContext(session.userId),
  ]);
  const canStartRadar = planContext.effectivePlanCode !== "free";
  const sharedFragmentCount = fragments.filter((fragment) => fragment.user_id !== session.userId).length;
  const sharedCardCount = knowledgeCards.filter((card) => Boolean((card as { shared?: boolean }).shared)).length;

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="用户工作台"
        title="今天该写什么，先看你手里有什么碎片。"
        description="这里显示最近文稿、已收录碎片、微信同步记录和快捷入口，先把生产状态拉直，再决定写哪一篇。"
        metrics={[
          { label: "文稿数", value: String(documents.length), note: "你当前可以继续编辑或新建文稿。" },
          { label: "碎片库", value: String(fragments.length), note: "所有手动、URL、截图输入都统一进这里。" },
          { label: "已同步微信", value: String(syncLogs.filter((item) => item.status === "success").length), note: "这里统计已成功推送到公众号草稿箱的次数。" },
        ]}
        cards={[
          { title: "最近文稿", description: "继续未完成的草稿、查看状态与最后编辑时间。", meta: "Drafts" },
          {
            title: "情绪罗盘",
            description: canStartRadar ? `当前已准备 ${topics.length} 条热点可一键落笔。` : `当前已准备 ${topics.length} 条热点可浏览；升级到 Pro 后可一键落笔。`,
            meta: "Radar",
          },
          { title: "快捷入口", description: "新建空白文稿、打开命令面板、查看同步日志。", meta: "Actions" },
        ]}
      />
      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Create</div>
        <h2 className="mt-3 font-serifCn text-3xl text-ink">新建文稿</h2>
        <div className="mt-5">
          <CreateDocumentForm />
        </div>
      </section>
      {scope.isTeamShared ? (
        <section className="border border-stone-300/40 bg-white p-5 text-sm leading-7 text-stone-700 shadow-ink">
          当前为团队共享工作台。你在这里看到的热点、碎片与主题档案，会自动混合团队内 {scope.userIds.length} 个账号的可见范围。
        </section>
      ) : null}
      <section>
        <div className="mb-4 text-xs uppercase tracking-[0.28em] text-stone-500">最近文稿</div>
        <DocumentList
          documents={documents.map((document) => ({
            id: document.id,
            title: document.title,
            status: document.status,
            updatedAt: document.updated_at,
          }))}
        />
      </section>
      <KnowledgeCardsPanel
        cards={knowledgeCards.slice(0, 6).map((card) => ({
          id: card.id,
          title: card.title,
          cardType: card.card_type,
          workspaceScope: card.workspace_scope,
          summary: card.summary,
          conflictFlags: parseStringList(card.conflict_flags_json),
          confidenceScore: card.confidence_score,
          status: card.status,
          lastCompiledAt: card.last_compiled_at,
          sourceFragmentCount: card.source_fragment_count,
          shared: Boolean((card as { shared?: boolean }).shared),
          ownerUsername: (card as { owner_username?: string | null }).owner_username ?? null,
        }))}
        canCompile={fragments.length > 0}
        fragmentCount={fragments.length}
        isTeamShared={scope.isTeamShared}
        sharedFragmentCount={sharedFragmentCount}
        sharedCardCount={sharedCardCount}
        sharedMemberCount={scope.userIds.length}
      />
    </div>
  );
}
