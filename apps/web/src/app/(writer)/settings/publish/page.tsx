import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { AppBanner } from "@/components/app-feedback";
import { WechatConnectionsManager } from "@/components/wechat-connections-manager";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import {
  formatConnectionStatus,
  formatPublishFailureCode,
  formatWechatSyncStatus,
  getPublishSettingsData,
  summarizeSyncPayload,
} from "../data";
import { SettingsSubpageShell } from "../shell";

const shellActionClassName = buttonStyles({ variant: "secondary" });
const sectionCardClassName = surfaceCardStyles({ padding: "lg" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const logCardClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "md" }),
  "flex h-full flex-col shadow-none",
);
const metaChipClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "px-3 py-1 text-xs text-inkSoft shadow-none",
);
const mutedChipClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "sm" }),
  "px-3 py-1 text-xs text-inkMuted shadow-none",
);
const payloadPanelClassName = cn(
  surfaceCardStyles({ padding: "sm" }),
  "text-xs leading-6 text-inkSoft shadow-none",
);
const emptyStateClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "border-dashed text-sm leading-7 text-inkSoft shadow-none",
);
const articleLinkClassName = buttonStyles({ variant: "secondary", size: "sm" });

function getSyncStatusChipClassName(status: string) {
  if (status === "success") {
    return cn(
      surfaceCardStyles({ tone: "success", padding: "sm" }),
      "px-3 py-1 text-xs text-emerald-700 shadow-none",
    );
  }
  if (status === "failed") {
    return cn(
      surfaceCardStyles({ tone: "warning", padding: "sm" }),
      "px-3 py-1 text-xs text-warning shadow-none",
    );
  }
  return mutedChipClassName;
}

export default async function SettingsPublishPage() {
  const data = await getPublishSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, connections, syncLogs, articles } = data;
  const { plan, planSnapshot, effectivePlanCode } = planContext;
  const defaultConnection = connections.find((item) => item.is_default) ?? connections[0] ?? null;
  const recentSyncLogs = syncLogs.slice(0, 6);
  const recentPublishedArticles = articles.filter((article) => article.status === "published").slice(0, 3);
  const recentWorkingArticles = articles.filter((article) => article.status !== "published").slice(0, 3);
  const exportReadyArticle = articles.find((article) => String(article.markdown_content || article.html_content || "").trim().length > 0) ?? null;
  const defaultConnectionName =
    defaultConnection?.account_name || defaultConnection?.original_id || "未命名公众号";
  const connectionIssues = connections.filter((item) =>
    item.status === "expired" || item.status === "invalid" || item.status === "disabled",
  );
  const failedSyncLogs = syncLogs.filter((item) => item.status === "failed").slice(0, 4);
  const pendingSyncLogs = syncLogs.filter((item) => item.status === "pending").slice(0, 3);
  const publishIssueCount =
    (defaultConnection ? 0 : 1) +
    connectionIssues.length +
    failedSyncLogs.length +
    pendingSyncLogs.length;

  return (
    <SettingsSubpageShell
      current="publish"
      description="把公众号连接和最近发布诊断收进同一处维护。发布流程只消费这里的授权结果与默认连接。"
      stats={[
        {
          label: "公众号连接",
          value: planSnapshot.canPublishToWechat ? String(connections.length) : "未开放",
          note: planSnapshot.canPublishToWechat
            ? defaultConnection
              ? `默认连接：${defaultConnectionName}`
              : "还没有默认公众号"
            : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
        },
        {
          label: "默认状态",
          value: defaultConnection ? formatConnectionStatus(defaultConnection.status) : "未设置",
          note: defaultConnection?.access_token_expires_at
            ? `令牌到期：${new Date(defaultConnection.access_token_expires_at).toLocaleString("zh-CN")}`
            : "尚未记录令牌到期时间",
        },
        {
          label: "最近同步",
          value: String(recentSyncLogs.length),
          note: recentSyncLogs[0]
            ? `最近一次：${formatWechatSyncStatus(recentSyncLogs[0].status)}`
            : "还没有同步记录",
        },
        {
          label: "PDF 导出",
          value: planSnapshot.canExportPdf ? "已开放" : "未开放",
          note: planSnapshot.canExportPdf
            ? "到任意稿件详情的发布阶段即可导出 PDF。"
            : `当前套餐 ${formatPlanDisplayName(plan?.name || effectivePlanCode)} 暂未开放`,
        },
      ]}
      actions={
        <Link href="/articles" className={shellActionClassName}>
          去稿件区
        </Link>
      }
    >
      <section id="publishing-connections" className="space-y-4 scroll-mt-8">
        <div className={sectionCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">发布连接</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
            把公众号连接和最近发布诊断收进同一处维护。
          </div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">
            默认公众号、授权状态和同步恢复动作都统一在这里处理，稿件发布阶段只消费这里的连接结果。
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              {
                label: "已授权连接",
                value: planSnapshot.canPublishToWechat ? String(connections.length) : "未开放",
                note: planSnapshot.canPublishToWechat ? "连接数和默认号维护都统一收口到这里。" : "当前套餐不支持绑定公众号。",
              },
              {
                label: "默认公众号",
                value: defaultConnection ? defaultConnectionName : "未设置",
                note: defaultConnection ? "发布动作会优先消费这个默认连接。" : "先完成授权，再指定默认公众号。",
              },
              {
                label: "最近诊断",
                value: recentSyncLogs[0] ? formatWechatSyncStatus(recentSyncLogs[0].status) : "暂无",
                note: recentSyncLogs[0] ? `最近记录于 ${new Date(recentSyncLogs[0].createdAt).toLocaleString("zh-CN")}` : "首次推送后会在这里回流诊断结果。",
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
          <AppBanner
            tone={planSnapshot.canPublishToWechat ? "success" : "warning"}
            className="mb-4"
            description={
              planSnapshot.canPublishToWechat
                ? `已授权公众号：${connections.length > 0 ? ` ${defaultConnectionName}` : " 暂无"}`
                : `当前套餐为 ${formatPlanDisplayName(plan?.name || effectivePlanCode)}，升级到 Pro 或更高套餐后才可绑定公众号。`
            }
          />
          <WechatConnectionsManager
            canManage={planSnapshot.canPublishToWechat}
            connections={connections.map((connection) => ({
              id: connection.id,
              accountName: connection.account_name,
              originalId: connection.original_id,
              status: connection.status,
              isDefault: Boolean(connection.is_default),
              accessTokenExpiresAt: connection.access_token_expires_at,
              updatedAt: connection.updated_at,
            }))}
            planName={plan?.name || effectivePlanCode}
          />
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理发布任务</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
              把异常连接、失败同步和待完成推送先分流出来处理。
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              设置页不再只展示最近日志。这里优先列出真正会阻断发布的事项，并给出直达连接维护或稿件发布阶段的入口。
            </div>
          </div>
          <div className={summaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前待处理</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{String(publishIssueCount)}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">
              {publishIssueCount > 0 ? "先清掉这些阻塞，再去发布动作里执行。" : "当前没有明显阻塞，连接与同步链路处于可用状态。"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {!defaultConnection ? (
            <article className={logCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">默认公众号缺失</div>
              <div className="mt-2 font-medium text-ink">当前还没有默认发布连接</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                稿件发布阶段会优先消费默认公众号。先在连接区补齐授权并设定默认连接，避免进入发布步骤后才发现无目标账号。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="#publishing-connections" className={articleLinkClassName}>
                  去设置默认公众号
                </Link>
                <Link href="/articles" className={articleLinkClassName}>
                  查看待发布稿件
                </Link>
              </div>
            </article>
          ) : null}

          {connectionIssues.map((connection) => (
            <article key={`publish-issue-connection-${connection.id}`} className={logCardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">连接待处理</div>
                  <div className="mt-2 font-medium text-ink">
                    {connection.account_name || connection.original_id || `连接 #${connection.id}`}
                  </div>
                </div>
                <div className={getSyncStatusChipClassName(connection.status === "expired" ? "failed" : "pending")}>
                  {formatConnectionStatus(connection.status)}
                </div>
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {connection.status === "expired"
                  ? "访问令牌已经过期，下一次推送大概率会失败。建议先编辑并重新校验凭证。"
                  : connection.status === "invalid"
                    ? "当前连接已失效，必须重新录入可用凭证或改用其他已授权公众号。"
                    : "这个连接已停用，不会再参与默认发布。若仍需继续投递，先恢复或重新新增连接。"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {connection.access_token_expires_at ? (
                  <span className={metaChipClassName}>
                    到期时间：{new Date(connection.access_token_expires_at).toLocaleString("zh-CN")}
                  </span>
                ) : null}
                {connection.is_default ? <span className={mutedChipClassName}>当前默认连接</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="#publishing-connections" className={articleLinkClassName}>
                  去维护连接
                </Link>
                <Link href="/articles" className={articleLinkClassName}>
                  回到稿件区
                </Link>
              </div>
            </article>
          ))}

          {failedSyncLogs.map((log) => (
            <article key={`publish-issue-log-${log.id}`} className={logCardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">失败同步待处理</div>
                  <div className="mt-2 font-medium text-ink">{log.title || "未命名稿件"}</div>
                </div>
                <div className={getSyncStatusChipClassName(log.status)}>{formatWechatSyncStatus(log.status)}</div>
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                {log.failureReason || "未记录失败原因"}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {log.failureCode ? (
                  <span className={metaChipClassName}>失败分类：{formatPublishFailureCode(log.failureCode)}</span>
                ) : null}
                {log.connectionName ? <span className={mutedChipClassName}>公众号：{log.connectionName}</span> : null}
                {log.retryCount > 0 ? <span className={mutedChipClassName}>已重试 {log.retryCount} 次</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/articles/${log.articleId}?step=publish`} className={articleLinkClassName}>
                  回到发布阶段
                </Link>
                <Link href="#publishing-connections" className={articleLinkClassName}>
                  检查连接状态
                </Link>
              </div>
            </article>
          ))}

          {pendingSyncLogs.map((log) => (
            <article key={`publish-pending-log-${log.id}`} className={logCardClassName}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">等待回流</div>
                  <div className="mt-2 font-medium text-ink">{log.title || "未命名稿件"}</div>
                </div>
                <div className={getSyncStatusChipClassName(log.status)}>{formatWechatSyncStatus(log.status)}</div>
              </div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                这篇稿件仍在等待同步结果回流。若长时间停留在等待中，优先检查默认连接与对应稿件的发布阶段。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {log.connectionName ? <span className={metaChipClassName}>公众号：{log.connectionName}</span> : null}
                <span className={mutedChipClassName}>{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/articles/${log.articleId}?step=publish`} className={articleLinkClassName}>
                  打开发布阶段
                </Link>
                <Link href="#publishing-connections" className={articleLinkClassName}>
                  查看连接
                </Link>
              </div>
            </article>
          ))}

          {publishIssueCount === 0 ? (
            <article className={logCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">链路健康</div>
              <div className="mt-2 font-medium text-ink">默认公众号与最近同步记录均处于可用状态</div>
              <div className="mt-3 text-sm leading-7 text-inkSoft">
                当前没有需要优先处理的发布阻塞。可以直接回到稿件区，进入发布阶段执行微信推送或导出动作。
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/articles" className={articleLinkClassName}>
                  去稿件区
                </Link>
                {exportReadyArticle ? (
                  <Link href={`/articles/${exportReadyArticle.id}?step=publish`} className={articleLinkClassName}>
                    打开最近可导出稿件
                  </Link>
                ) : null}
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">导出通道</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
              PDF 导出仍走稿件发布阶段，但配置状态在这里统一确认。
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              导出动作不会单独生成一套设置页工作流。这里负责确认套餐是否开放、给出替代路径，并把你带回实际执行导出的稿件页面。
            </div>
          </div>
          <div className={summaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前状态</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              {planSnapshot.canExportPdf ? "可导出" : "需升级"}
            </div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">
              {planSnapshot.canExportPdf
                ? "发布阶段会直接出现 PDF 导出按钮。"
                : "未开放时仍可先导出 HTML 或 Markdown。"}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <article className={logCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">可用路径</div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              从稿件详情进入发布阶段后，系统会按当前套餐判断是否开放 PDF；已开放时可直接导出，未开放时会给出升级与替代导出提示。
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={metaChipClassName}>稿件详情</span>
              <span className={metaChipClassName}>发布阶段</span>
              <span className={mutedChipClassName}>权限随套餐读取</span>
            </div>
          </article>
          <article className={logCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">执行入口</div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              这里不直接执行导出；它只负责把发布连接、同步诊断与导出权限放在同一处确认，避免你在真正导出前才发现权限或连接问题。
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/articles" className={articleLinkClassName}>
                打开稿件列表
              </Link>
              <Link href="/settings/account" className={articleLinkClassName}>
                查看套餐能力
              </Link>
            </div>
          </article>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <article className={logCardClassName}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近可导出稿件</div>
                <div className="mt-2 font-serifCn text-2xl text-ink text-balance">
                  {exportReadyArticle?.title || "暂时还没有可导出正文"}
                </div>
              </div>
              <div className={summaryCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前推荐</div>
                <div className="mt-2 text-sm text-inkSoft">{exportReadyArticle ? "直接执行" : "先去写稿"}</div>
              </div>
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              {exportReadyArticle
                ? "这篇稿件已经有正文，可直接回到稿件详情的发布阶段，或从这里走 Markdown / HTML / PDF 导出。"
                : "当前还没有带正文的稿件。先去稿纸写出一段内容，导出通道才会真正变得可用。"}
            </div>
            {exportReadyArticle ? (
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href={`/articles/${exportReadyArticle.id}?step=publish`} className={articleLinkClassName}>
                  进入发布阶段
                </Link>
                <Link href={`/api/articles/${exportReadyArticle.id}/export?format=markdown`} className={articleLinkClassName}>
                  导出 Markdown
                </Link>
                <Link href={`/api/articles/${exportReadyArticle.id}/export?format=html`} className={articleLinkClassName}>
                  导出 HTML
                </Link>
                <Link
                  href={`/api/articles/${exportReadyArticle.id}/export?format=pdf`}
                  className={articleLinkClassName}
                >
                  {planSnapshot.canExportPdf ? "导出 PDF" : "PDF 需升级套餐"}
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                <Link href="/articles" className={articleLinkClassName}>
                  去稿件区
                </Link>
              </div>
            )}
          </article>
          <article className={logCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近稿件入口</div>
            <div className="mt-3 space-y-3">
              {[...recentWorkingArticles, ...recentPublishedArticles].slice(0, 4).map((article) => (
                <div key={article.id} className={payloadPanelClassName}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-ink">{article.title || `未命名稿件 #${article.id}`}</div>
                      <div className="mt-1 text-xs text-inkMuted">
                        {article.status === "published" ? "已发布" : "未发布"} · {new Date(article.updated_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/articles/${article.id}`} className={articleLinkClassName}>
                        打开稿件
                      </Link>
                      <Link href={`/articles/${article.id}?step=publish`} className={articleLinkClassName}>
                        去发布
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
              {recentWorkingArticles.length === 0 && recentPublishedArticles.length === 0 ? (
                <div className={emptyStateClassName}>
                  还没有最近稿件。先创建 1 篇稿件，发布和导出面板才会出现真正的直达入口。
                </div>
              ) : null}
            </div>
          </article>
        </div>
      </section>

      <section className={sectionCardClassName}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">最近同步记录</div>
            <div className="mt-3 font-serifCn text-3xl text-ink text-balance">
              最近请求与响应摘要集中展示在这里。
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              这里仅保留最近几次公众号同步诊断，方便快速判断是连接问题、素材问题还是内容格式问题。
            </div>
          </div>
          <div className={summaryCardClassName}>
            <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近记录</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{recentSyncLogs.length}</div>
            <div className="mt-2 text-sm leading-6 text-inkSoft">只保留最近 6 次发布回流诊断。</div>
          </div>
        </div>

        {recentSyncLogs.length > 0 ? (
          <div className="mt-6 grid gap-4 xl:grid-cols-2">
            {recentSyncLogs.map((log) => {
              const requestSummary = summarizeSyncPayload(log.requestSummary);
              const responseSummary = summarizeSyncPayload(log.responseSummary);

              return (
                <article key={log.id} className={logCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                        {log.connectionName || "未命名公众号"} · {new Date(log.createdAt).toLocaleString("zh-CN")}
                      </div>
                      <div className="mt-2 font-medium text-ink">{log.title || "未命名稿件"}</div>
                    </div>
                    <div className={getSyncStatusChipClassName(log.status)}>
                      {formatWechatSyncStatus(log.status)}
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-7 text-inkSoft">
                    {log.status === "success"
                      ? log.mediaId
                        ? `草稿媒体 ID：${log.mediaId}`
                        : "微信已返回成功，但未回填媒体 ID。"
                      : log.failureReason || "未记录失败原因"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {log.failureCode ? (
                      <span className={metaChipClassName}>
                        失败分类：{formatPublishFailureCode(log.failureCode)}
                      </span>
                    ) : null}
                    {log.retryCount > 0 ? <span className={mutedChipClassName}>重试 {log.retryCount} 次</span> : null}
                    {log.templateId ? <span className={mutedChipClassName}>模板 {log.templateId}</span> : null}
                  </div>
                  {requestSummary || responseSummary ? (
                    <div className="mt-4 space-y-2">
                      {requestSummary ? (
                        <div className={payloadPanelClassName}>
                          <div className="uppercase tracking-[0.18em] text-inkMuted">请求摘要</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{requestSummary}</pre>
                        </div>
                      ) : null}
                      {responseSummary ? (
                        <div className={payloadPanelClassName}>
                          <div className="uppercase tracking-[0.18em] text-inkMuted">响应摘要</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{responseSummary}</pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <Link href={`/articles/${log.articleId}`} className={articleLinkClassName}>
                      查看这篇稿件
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={cn("mt-6", emptyStateClassName)}>
            当前还没有公众号同步记录。首次推送成功或失败后，这里会显示最近一次请求与响应摘要。
          </div>
        )}
      </section>
    </SettingsSubpageShell>
  );
}
