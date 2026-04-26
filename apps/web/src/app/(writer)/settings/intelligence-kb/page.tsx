import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { ImaConnectionsManager } from "@/components/ima-connections-manager";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { getIntelligenceSettingsData } from "../data";
import { SettingsSubpageShell } from "../shell";

const sectionCardClassName = surfaceCardStyles({ padding: "lg" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const queueCardClassName = cn(surfaceCardStyles({ tone: "warm", padding: "md" }), "flex h-full flex-col shadow-none");
const actionClassName = buttonStyles({ variant: "secondary", size: "sm" });
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
);

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
  const invalidConnections = connections.filter((item) => item.status === "invalid");
  const disabledConnections = connections.filter((item) => item.status === "disabled");
  const connectionsWithoutKnowledgeBases = validConnections.filter((item) => item.knowledgeBases.length === 0);
  const disabledKnowledgeBases = connections.flatMap((item) =>
    item.knowledgeBases
      .filter((kb) => !kb.isEnabled)
      .map((kb) => ({
        connectionLabel: item.label,
        ...kb,
      })),
  );
  const intelligenceIssueCount =
    (connections.length === 0 ? 1 : 0) +
    (connections.length > 0 && validConnections.length === 0 ? 1 : 0) +
    (validConnections.length > 0 && enabledKnowledgeBases.length === 0 ? 1 : 0) +
    invalidConnections.length +
    disabledConnections.length +
    connectionsWithoutKnowledgeBases.length +
    (disabledKnowledgeBases.length > 0 ? 1 : 0);
  const disabledKnowledgeBasePreview = disabledKnowledgeBases
    .slice(0, 3)
    .map((item) => item.kbName)
    .join("、");

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
          value: "Warroom + 自动研究 + 证据",
          note: "裂变候选、自动研究补源、证据面板检索都会优先使用默认 IMA 知识库。",
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
            这里仍不做周期同步，也不把 IMA 塞进热点抓取管道；但在稿件自动研究阶段，系统会优先用默认 IMA 知识库补高价值素材，再决定是否需要外部搜索。
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "接入方式",
                value: "按需检索",
                note: "在 Warroom、自动研究和证据检索中按需调用，不做后台噪声同步。",
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理智库入口</div>
              <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
                先把失效连接、未启用知识库和默认库缺口收口，再回到真实使用场景。
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                设置页不再只停留在总览。这里把当前真正阻断 Warroom 裂变与证据检索的事项单独列出，并保留回跳到业务场景的入口。
              </div>
            </div>
            <div className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前待处理</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{String(intelligenceIssueCount)}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">
                {intelligenceIssueCount > 0 ? "先清掉这些阻塞，IMA 才能稳定进入 Warroom 与证据面板。" : "当前连接、知识库与默认库均已处于可用状态。"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {connections.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">尚未绑定 IMA</div>
                <div className="mt-2 font-medium text-ink">当前还没有任何 IMA 连接</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  裂变候选与证据检索都还拿不到你的个人智库。先添加一条可用连接，再回到业务场景使用 IMA 真实语料。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去添加连接
                  </Link>
                  <Link href="/warroom" className={actionClassName}>
                    查看作战台
                  </Link>
                </div>
              </article>
            ) : null}

            {connections.length > 0 && validConnections.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">无可用连接</div>
                <div className="mt-2 font-medium text-ink">已有 IMA 连接，但当前没有一条可正常使用</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  Warroom 与证据检索不会消费失效或停用连接。先在下方刷新凭证、重建连接，或清理已停用连接。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去处理连接
                  </Link>
                </div>
              </article>
            ) : null}

            {validConnections.length > 0 && enabledKnowledgeBases.length === 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">无启用知识库</div>
                <div className="mt-2 font-medium text-ink">当前没有启用中的知识库</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  即使连接可用，只要没有启用知识库，裂变与证据检索仍然无法真正落到 IMA 语料。先启用至少一个 KB，并设为默认。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去启用 KB
                  </Link>
                </div>
              </article>
            ) : null}

            {invalidConnections.map((connection) => (
              <article key={`ima-invalid-${connection.id}`} className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">失效连接</div>
                <div className="mt-2 font-medium text-ink">{connection.label}</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  {connection.lastError || "最近一次校验失败，请重新刷新知识库或重建连接。"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={metaChipClassName}>状态：凭证失效</span>
                  {connection.lastVerifiedAt ? (
                    <span className={mutedChipClassName}>
                      最近校验：{new Date(connection.lastVerifiedAt).toLocaleString("zh-CN")}
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去刷新连接
                  </Link>
                </div>
              </article>
            ))}

            {disabledConnections.map((connection) => (
              <article key={`ima-disabled-${connection.id}`} className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">停用连接</div>
                <div className="mt-2 font-medium text-ink">{connection.label}</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  这个连接已被停用，不会再参与任何 IMA 检索链路。如果仍需保留这条智库入口，建议重新绑定并刷新知识库。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去处理连接
                  </Link>
                </div>
              </article>
            ))}

            {connectionsWithoutKnowledgeBases.map((connection) => (
              <article key={`ima-no-kb-${connection.id}`} className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">待同步知识库</div>
                <div className="mt-2 font-medium text-ink">{connection.label}</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  这条连接本身可用，但还没有同步出任何知识库。先执行一次“刷新 KB”，否则业务面板看不到任何可用语料。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去刷新 KB
                  </Link>
                </div>
              </article>
            ))}

            {disabledKnowledgeBases.length > 0 ? (
              <article className={queueCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">待启用知识库</div>
                <div className="mt-2 font-medium text-ink">有 {disabledKnowledgeBases.length} 个知识库处于停用态</div>
                <div className="mt-3 text-sm leading-7 text-inkSoft">
                  {disabledKnowledgeBasePreview
                    ? `最近停用的包括 ${disabledKnowledgeBasePreview}。`
                    : "存在已同步但未启用的知识库。"}
                  需要重新启用时，可直接在下方连接卡片内勾选启用，并把最常用的一条设为默认。
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link href="#ima-integration" className={actionClassName}>
                    去启用 KB
                  </Link>
                </div>
              </article>
            ) : null}

            <article className={queueCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">业务落点</div>
              <div className="mt-2 font-medium text-ink">
                {defaultKnowledgeBase ? `当前默认库：${defaultKnowledgeBase.kbName}` : "设置完成后可直接回到业务场景使用"}
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                IMA 只服务两类高价值动作：Warroom 裂变时补真实爆款语料，以及稿件证据面板里的赛道检索。配置完成后，直接回到这两个场景继续工作。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/warroom" className={actionClassName}>
                  去作战台
                </Link>
                <Link href="/articles" className={actionClassName}>
                  去稿件区
                </Link>
              </div>
            </article>
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
