import { AdminOverview } from "@/components/admin-views";
import { getDatabase } from "@/lib/db";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminBusinessOverview, getModelRoutes, getPlans, getPromptVersions, getRecentSupportMessages, getSupportMessageCount, getUsers } from "@/lib/repositories";

export default async function AdminOverviewPage() {
  await requireAdminSession();
  const [users, plans, prompts, routes, imageEngine, business, supportCount, supportMessages] = await Promise.all([
    getUsers(),
    getPlans(),
    getPromptVersions(),
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getAdminBusinessOverview(),
    getSupportMessageCount(),
    getRecentSupportMessages(5),
  ]);
  const db = getDatabase();
  const [documents, fragments, syncSuccess, knowledgeCards, auditLogs, queueRows, failedJobs, expiredTokens, invalidTokens, expiringTokens, failedSyncs, recentAuditLogs] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM documents"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM audit_logs"),
    db.query<{ status: string; count: number }>("SELECT status, COUNT(*) as count FROM job_queue GROUP BY status ORDER BY status ASC"),
    db.query<{ id: number; job_type: string; attempts: number; last_error: string | null; updated_at: string }>(
      `SELECT id, job_type, attempts, last_error, updated_at
       FROM job_queue
       WHERE status = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 6`,
      ["failed"],
    ),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["expired"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["invalid"]),
    db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM wechat_connections
       WHERE status = ? AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= ?`,
      ["valid", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()],
    ),
    db.query<{ id: number; failure_reason: string | null; created_at: string; title: string }>(
      `SELECT l.id, l.failure_reason, l.created_at, d.title
       FROM wechat_sync_logs l
       INNER JOIN documents d ON d.id = l.document_id
       WHERE l.status = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 6`,
      ["failed"],
    ),
    db.query<{ id: number; action: string; target_type: string; created_at: string }>(
      `SELECT id, action, target_type, created_at
       FROM audit_logs
       ORDER BY id DESC
       LIMIT 6`,
    ),
  ]);

  const activeUsers = users.filter((user) => Boolean(user.is_active)).length;
  const activePromptVersions = prompts.filter((prompt) => Boolean(prompt.is_active)).length;
  const queueSummary = new Map(queueRows.map((row) => [row.status, row.count]));

  return (
    <div className="space-y-8">
      <AdminOverview
        title="后台既要看经营指标，也要看写作主链路有没有真的跑起来。"
        description="当前后台已经接入用户管理、套餐结构、Prompt 版本、模型路由和微信草稿箱发布统计，默认管理员为 huozi。"
        metrics={[
          { label: "激活用户", value: String(activeUsers), note: `总用户 ${users.length} 个，全部由后台手动创建。` },
          { label: "写作资产", value: String((documents?.count ?? 0) + (fragments?.count ?? 0)), note: `文稿 ${(documents?.count ?? 0)} 篇，碎片 ${(fragments?.count ?? 0)} 条。` },
          { label: "主题档案", value: String(knowledgeCards?.count ?? 0), note: "系统已沉淀的结构化主题档案数量。" },
          { label: "微信成功推送", value: String(syncSuccess?.count ?? 0), note: "这里统计真实写入公众号草稿箱成功的次数。" },
          { label: "审计事件", value: String(auditLogs?.count ?? 0), note: "配置变更、重编译、排版基因 Fork/发布等关键动作都会写入审计日志。" },
          { label: "归因转化", value: String(business.activePaidReferralCount), note: `有效付费归因 ${business.activePaidReferralCount} 个，预计月佣金 ￥${business.estimatedMonthlyCommissionCny}。` },
          { label: "生图引擎", value: imageEngine.hasApiKey ? "已配置" : "未配置", note: imageEngine.baseUrl ? `${imageEngine.model} · ${imageEngine.baseUrl}` : "封面图生成仍需管理员补充 Base_URL 与 API Key。" },
          { label: "支持单", value: String(supportCount?.count ?? 0), note: "来自 /support 页的联系与问题提交。" },
        ]}
        panels={[
          { title: "用户与权限", description: "默认管理员 huozi，普通用户不开放自助注册，所有账号都走后台发放。", meta: "Users" },
          { title: "主题档案治理", description: "冲突、过期、低置信度档案可以在后台统一重编译和调整状态。", meta: "Knowledge" },
          { title: "审计日志", description: "后台可以按动作、目标类型和操作人回看关键改动，避免把配置治理和业务动作混在口头描述里。", meta: "Audit" },
          { title: "Prompt 版本", description: `当前共 ${prompts.length} 条 Prompt 版本记录，正在生效的版本 ${activePromptVersions} 条。`, meta: "Prompts" },
          { title: "模型与路由", description: `当前维护 ${routes.length} 条模型路由，套餐结构已初始化 ${plans.length} 档。`, meta: "Ops" },
          { title: "经营面", description: `当前累计归因用户 ${business.referredUserCount} 个，分销榜单可在业务总览继续查看。`, meta: "Growth" },
          { title: "生图 AI 引擎", description: imageEngine.hasApiKey ? `当前默认模型 ${imageEngine.model}，最后更新于 ${imageEngine.updatedAt ? new Date(imageEngine.updatedAt).toLocaleString("zh-CN") : "未记录"}。` : "全局生图引擎尚未配置，封面图生成会失败。", meta: "Image" },
        ]}
      />
      <section className="grid gap-4 xl:grid-cols-3">
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Celery 任务队列</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">后台任务运行态</h2>
          <div className="mt-6 grid gap-3 text-sm text-stone-300">
            <div className="flex items-center justify-between border border-stone-800 bg-stone-950 px-4 py-3">
              <span>Queued</span>
              <span>{queueSummary.get("queued") ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border border-stone-800 bg-stone-950 px-4 py-3">
              <span>Running</span>
              <span>{queueSummary.get("running") ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border border-stone-800 bg-stone-950 px-4 py-3">
              <span>Completed</span>
              <span>{queueSummary.get("completed") ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border border-stone-800 bg-stone-950 px-4 py-3 text-cinnabar">
              <span>Failed</span>
              <span>{queueSummary.get("failed") ?? 0}</span>
            </div>
          </div>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Token 刷新引擎状态</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">公众号连接健康度</h2>
          <div className="mt-6 space-y-3 text-sm text-stone-300">
            <div className="border border-stone-800 bg-stone-950 px-4 py-3">即将过期（24h 内）：{expiringTokens?.count ?? 0}</div>
            <div className="border border-stone-800 bg-stone-950 px-4 py-3">已过期：{expiredTokens?.count ?? 0}</div>
            <div className="border border-stone-800 bg-stone-950 px-4 py-3">凭证失效：{invalidTokens?.count ?? 0}</div>
            <div className="border border-stone-800 bg-stone-950 px-4 py-3">
              当前异常总量：{(expiredTokens?.count ?? 0) + (invalidTokens?.count ?? 0)}
            </div>
          </div>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">System Pulse</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">运行提醒</h2>
          <ul className="mt-6 space-y-3 text-sm leading-7 text-stone-300">
            <li>失败任务 {failedJobs.length} 条，优先检查知识刷新与热点抓取。</li>
            <li>微信失败推送 {failedSyncs.length} 条，建议先排查 token 与草稿内容。</li>
            <li>最近审计动作 {recentAuditLogs.length} 条，可回看后台治理操作。</li>
          </ul>
        </article>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Queue Errors</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">最近失败任务</h2>
          <div className="mt-5 space-y-3">
            {failedJobs.length === 0 ? (
              <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">当前没有失败任务。</div>
            ) : (
              failedJobs.map((job) => (
                <div key={job.id} className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-300">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium text-stone-100">{job.job_type}</div>
                    <div className="text-xs text-stone-500">{new Date(job.updated_at).toLocaleString("zh-CN")}</div>
                  </div>
                  <div className="mt-2 text-xs text-stone-500">Job #{job.id} · attempts {job.attempts}</div>
                  <div className="mt-3 font-mono text-xs leading-6 text-cinnabar">{job.last_error || "未记录错误详情"}</div>
                </div>
              ))
            )}
          </div>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Terminal Logs</div>
          <h2 className="mt-4 font-serifCn text-3xl text-stone-100">最近异常与审计</h2>
          <div className="mt-5 border border-stone-800 bg-[#0b0b0c] p-4 font-mono text-xs leading-7 text-stone-300">
            {failedSyncs.length === 0 && recentAuditLogs.length === 0 ? (
              <div>[system] no recent logs</div>
            ) : (
              <>
                {failedSyncs.map((log) => (
                  <div key={`sync-${log.id}`} className="text-cinnabar">
                    [WeChat Sync] {new Date(log.created_at).toLocaleString("zh-CN")} {log.title} :: {log.failure_reason || "未知错误"}
                  </div>
                ))}
                {recentAuditLogs.map((log) => (
                  <div key={`audit-${log.id}`}>
                    [Audit] {new Date(log.created_at).toLocaleString("zh-CN")} {log.action} :: {log.target_type}
                  </div>
                ))}
              </>
            )}
          </div>
        </article>
      </section>
      <section className="border border-stone-800 bg-[#171718] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Support Inbox</div>
        <h2 className="mt-4 font-serifCn text-3xl text-stone-100">最近支持消息</h2>
        <div className="mt-5 grid gap-3">
          {supportMessages.length === 0 ? (
            <div className="border border-stone-800 bg-stone-950 px-4 py-4 text-sm text-stone-400">当前还没有新的支持提交。</div>
          ) : (
            supportMessages.map((message) => (
              <div key={message.id} className="border border-stone-800 bg-stone-950 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-stone-100">{message.name} · {message.email}</div>
                  <div className="text-xs text-stone-500">{new Date(message.created_at).toLocaleString("zh-CN")}</div>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-cinnabar">{message.issue_type}</div>
                <div className="mt-3 text-sm leading-7 text-stone-300">{message.description}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
