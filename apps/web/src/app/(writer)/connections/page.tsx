import { WechatConnectionsManager } from "@/components/writer-client";
import { WriterOverview } from "@/components/writer-views";
import { hasAuthorPersona } from "@/lib/author-personas";
import { requireWriterSession } from "@/lib/page-auth";
import { getUserPlanContext } from "@/lib/plan-access";
import { getWechatConnections } from "@/lib/repositories";

export default async function ConnectionsPage() {
  const { session } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }

  const [connections, planContext] = await Promise.all([
    getWechatConnections(session.userId),
    getUserPlanContext(session.userId),
  ]);
  const canManageWechatConnections = (planContext.plan.max_wechat_connections ?? 0) > 0;
  const defaultCount = connections.filter((item) => Boolean(item.is_default)).length;
  const validCount = connections.filter((item) => item.status === "valid").length;

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="发布连接"
        title="公众号连接不是一次性配置，而是可恢复发布链路的基础资产。"
        description="这里集中管理微信草稿箱发布所依赖的公众号连接。默认连接、Token 到期时间和连接状态，都会直接影响发布前守门和恢复发布。"
        metrics={[
          { label: "已绑定连接", value: String(connections.length), note: canManageWechatConnections ? "当前套餐支持管理公众号连接。" : "当前套餐不开放公众号连接。" },
          { label: "可直接发布", value: String(validCount), note: validCount > 0 ? "这些连接当前状态可用于草稿箱推送。" : "当前没有可直接发布的连接。" },
          { label: "默认连接", value: String(defaultCount), note: defaultCount > 0 ? "恢复发布会优先依赖默认连接。" : "建议至少保留 1 个默认连接。" },
        ]}
        cards={[
          { title: "先保默认值", description: "默认连接能减少恢复发布时的额外选择成本。", meta: "Default" },
          { title: "再看有效期", description: "Token 到期和凭证失效应该被及时发现，而不是等到最后一公里报错。", meta: "Health" },
          { title: "最后谈恢复", description: "当发布被中断后，连接资产决定了你能否无损继续推送。", meta: "Recovery" },
        ]}
      />

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">连接管理</div>
        <div className="mt-3 font-serifCn text-3xl text-ink">把默认公众号、凭证有效期和发布状态放在同一个地方维护。</div>
        <div className="mt-3 text-sm leading-7 text-stone-700">
          当前套餐为 {planContext.plan.name}。{canManageWechatConnections ? "你可以直接新增、编辑、删除并切换默认公众号连接。" : "当前套餐只能浏览连接说明，真正的公众号授权和草稿箱推送需要升级到 Pro 或 Ultra。"}
        </div>
        <div className="mt-6">
          <WechatConnectionsManager
            connections={connections.map((connection) => ({
              id: connection.id,
              accountName: connection.account_name,
              originalId: connection.original_id,
              status: connection.status,
              isDefault: Boolean(connection.is_default),
              accessTokenExpiresAt: connection.access_token_expires_at,
              updatedAt: connection.updated_at,
            }))}
            canManage={canManageWechatConnections}
            planName={planContext.plan.name}
          />
        </div>
      </section>
    </div>
  );
}
