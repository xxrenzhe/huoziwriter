import Link from "next/link";
import { ArrowRight, Bot, Image, Link2, RefreshCcw, Wand2 } from "lucide-react";

type Metric = {
  label: string;
  value: string;
  note: string;
};

type CardItem = {
  title: string;
  description: string;
  meta?: string;
};

export function WriterOverview({
  eyebrow,
  title,
  description,
  metrics,
  cards,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: Metric[];
  cards: CardItem[];
}) {
  return (
    <div className="space-y-8">
      <section className="border border-stone-300/40 bg-[rgba(255,255,255,0.72)] p-6 shadow-ink md:p-8">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">{eyebrow}</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-stone-700">{description}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.label} className="border border-stone-300/40 bg-white p-5 shadow-ink">
            <div className="text-xs uppercase tracking-[0.26em] text-stone-500">{metric.label}</div>
            <div className="mt-3 font-serifCn text-4xl text-ink">{metric.value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-700">{metric.note}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{card.meta ?? "工作台模块"}</div>
            <h2 className="mt-4 font-serifCn text-2xl font-semibold text-ink">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-stone-700">{card.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

export function CaptureStudio() {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_380px]">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Capture Intake</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink">把链接、手打灵感、截图扔进同一个入口。</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["URL 穿透解析", "粘贴公众号或外部链接，系统抓正文、摘要和元信息。", Link2],
            ["手动文本碎片", "会议记录、朋友圈一句话、脑内闪念，直接写入。", Wand2],
            ["截图上传", "用于 OCR 和事实抽取，保留源图供回溯。", Image],
          ].map(([title, description, Icon]) => (
            <div key={title as string} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="flex h-10 w-10 items-center justify-center border border-stone-300 bg-white text-cinnabar">
                <Icon size={18} />
              </div>
              <h2 className="mt-4 font-serifCn text-2xl text-ink">{title as string}</h2>
              <p className="mt-3 text-sm leading-7 text-stone-700">{description as string}</p>
            </div>
          ))}
        </div>
      </div>
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">脱水流程</div>
        <ol className="mt-5 space-y-4 text-sm leading-7 text-stone-700">
          <li>1. Playwright 抓取正文和截图</li>
          <li>2. 提取标题、来源、作者、时间</li>
          <li>3. AI 生成原子事实碎片</li>
          <li>4. Embedding 建索引等待召回</li>
        </ol>
      </aside>
    </section>
  );
}

export function WorkspacePreview() {
  return (
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-5">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">大纲节点</div>
        <div className="mt-4 space-y-3">
          {["痛点引入", "数据反转", "底层原因", "行动建议"].map((item, index) => (
            <div
              key={item}
              className={`border-l-4 p-4 ${
                index === 1 ? "border-cinnabar bg-white shadow-ink" : "border-stone-300 bg-white"
              }`}
            >
              <div className="font-serifCn text-xl text-ink">{item}</div>
              <div className="mt-2 text-xs uppercase tracking-[0.2em] text-stone-500">魂印 · {index + 1}</div>
            </div>
          ))}
        </div>
      </aside>
      <article className="border border-stone-300/40 bg-white px-6 py-8 shadow-ink md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">沉浸式画布</div>
            <h1 className="mt-2 font-serifCn text-3xl text-ink">为什么公众号作者已经无法容忍机器语气</h1>
          </div>
          <div className="flex items-center gap-2 border border-cinnabar/30 bg-cinnabar/5 px-3 py-2 text-sm text-cinnabar">
            <RefreshCcw size={14} />
            正在流式生成
          </div>
        </div>
        <div className="mt-8 space-y-6 text-lg leading-[2.15] text-stone-800">
          <p>会议室里，第一个说“赋能”的人通常最早离开现实。</p>
          <p>他不必解释成本，也不必承担亏损，只要把所有具体问题抹成一层抽象的油彩。</p>
          <div className="inline-flex items-center gap-2 border border-dashed border-stone-300 bg-[#faf7f0] px-4 py-3 text-sm text-stone-700">
            <Bot size={16} className="text-cinnabar" />
            AI 配图建议：一间灯光过亮的会议室，白板上写满空话，黑白高反差摄影。
          </div>
          <p className="inline-flex items-center">
            当语言开始替现实打掩护，写作者首先该做的不是修辞，而是拆穿。
            <span className="ml-2 h-6 w-[2px] bg-cinnabar animate-pulse" />
          </p>
        </div>
      </article>
      <aside className="border border-stone-300/40 bg-[#faf7f0] p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">灵感匣</div>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">选题雷达</div>
        </div>
        <div className="mt-5 space-y-3">
          {[
            "今天开会又听到“赋能”这个词，想吐。",
            "芯片价格下跌后，媒体仍然在用增长叙事掩盖利润崩塌。",
            "公众号排版再精致，也救不了一篇没有事实的文章。",
          ].map((note) => (
            <div key={note} className="border border-[#eadfb9] bg-[#fdf6d7] p-4 text-sm leading-7 text-stone-700">
              {note}
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}

export function CommandCenter() {
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Command Palette</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink">把“扩写、改写、净化、补事实”压进同一个命令面板。</h1>
        <div className="mt-8 space-y-3">
          {[
            "净化这一段的机器腔调",
            "基于碎片库补充一个反常识例子",
            "输出 3 个更锋利的小标题",
            "为本段生成配图提示词，不直接绘图",
          ].map((command) => (
            <div key={command} className="flex items-center justify-between border border-stone-300/40 px-4 py-4 text-sm">
              <span>{command}</span>
              <ArrowRight size={16} className="text-stone-500" />
            </div>
          ))}
        </div>
      </div>
      <aside className="border border-stone-300/40 bg-[#1a1a1a] p-5 text-stone-100">
        <div className="text-xs uppercase tracking-[0.26em] text-stone-500">命令输出</div>
        <div className="mt-4 border border-stone-800 bg-[#101011] p-4 text-sm leading-7 text-stone-300">
          建议把“不可否认”改成具体判断。当前段落缺事实锚点，可挂载 3 月 21 日芯片报价下探数据。
        </div>
      </aside>
    </section>
  );
}

export function BannedWordsStudio() {
  return (
    <section className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-5">
        <div className="text-xs uppercase tracking-[0.26em] text-stone-500">设置分区</div>
        <div className="mt-4 space-y-2 text-sm">
          {["个人资料", "订阅与账单", "专属死刑词库", "第三方授权"].map((item) => (
            <div
              key={item}
              className={`border px-4 py-3 ${item === "专属死刑词库" ? "border-cinnabar bg-white text-cinnabar" : "border-transparent bg-white text-stone-700"}`}
            >
              {item}
            </div>
          ))}
        </div>
      </aside>
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Banned Words Engine</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink">添加你厌恶的套话，给语言装上物理约束。</h1>
        <div className="mt-6 flex flex-wrap gap-3">
          {["不可否认", "赋能", "颗粒度", "底层逻辑", "毋庸置疑", "瞬息万变"].map((word) => (
            <div key={word} className="border border-cinnabar px-4 py-2 text-sm text-cinnabar line-through">
              {word}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SettingsOverview() {
  return (
    <SettingsOverviewCards
      items={[
        ["微信公众号授权", "手动录入 appId / appSecret，完成 access token 获取与草稿箱推送。"],
        ["订阅与配额", "当前套餐、用量、公众号连接额度，以及后台手动调整后的订阅状态。"],
        ["排版基因", "段落长度、语气规则、禁用标点和结尾句法。"],
        ["账号安全", "仅管理员发号，用户首次登录强制改密。"],
      ]}
    />
  );
}

export function SettingsOverviewCards({
  items,
}: {
  items: Array<[string, string]>;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {items.map(([title, description]) => (
        <article key={title} className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <h2 className="font-serifCn text-2xl text-ink">{title}</h2>
          <p className="mt-4 text-sm leading-7 text-stone-700">{description}</p>
        </article>
      ))}
    </section>
  );
}

type SyncLogRow = {
  id: number;
  documentId: number;
  title: string;
  connectionName: string | null;
  mediaId: string | null;
  status: string;
  requestSummary: string | Record<string, unknown> | null;
  responseSummary: string | Record<string, unknown> | null;
  failureReason: string | null;
  failureCode?: string | null;
  retryCount: number;
  documentVersionHash?: string | null;
  templateId?: string | null;
  createdAt: string;
};

function formatSyncFailureCode(code: string | null | undefined) {
  if (!code) return null;
  if (code === "auth_failed") return "凭证失败";
  if (code === "media_failed") return "媒体素材失败";
  if (code === "rate_limited") return "频率限制";
  if (code === "content_invalid") return "内容格式问题";
  return "上游异常";
}

function renderSyncAction(log: SyncLogRow, canPublishToWechat: boolean) {
  if (log.status === "success") {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href={`/editor/${log.documentId}`} className="border border-stone-300 px-3 py-2 text-xs text-ink">
          回到文稿
        </Link>
        <a
          href="https://mp.weixin.qq.com/"
          target="_blank"
          rel="noreferrer"
          className="border border-cinnabar bg-cinnabar px-3 py-2 text-xs text-white"
        >
          在微信中预览
        </a>
      </div>
    );
  }
  if (!canPublishToWechat) {
    return (
      <div className="flex flex-wrap gap-2">
        <Link href="/pricing" className="border border-cinnabar px-3 py-2 text-xs text-cinnabar">
          查看套餐权限
        </Link>
        <Link href={`/editor/${log.documentId}`} className="border border-stone-300 px-3 py-2 text-xs text-ink">
          回到文稿
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/settings#wechat-connections" className="border border-cinnabar px-3 py-2 text-xs text-cinnabar">
        重新授权
      </Link>
      <Link href={`/editor/${log.documentId}`} className="border border-stone-300 px-3 py-2 text-xs text-ink">
        回到文稿重试
      </Link>
    </div>
  );
}

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function SyncLogTable({
  logs,
  canPublishToWechat,
}: {
  logs: SyncLogRow[];
  canPublishToWechat: boolean;
}) {
  return (
    <section className="border border-stone-300/40 bg-white shadow-ink">
      <div className="border-b border-stone-200 px-6 py-5">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Sync Logs</div>
        <h1 className="mt-3 font-serifCn text-3xl text-ink">发布日志</h1>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#faf7f0] text-stone-500">
            <tr>
              {["文章标题", "目标公众号", "同步时间", "状态", "操作"].map((head) => (
                <th key={head} className="px-6 py-4 font-medium">{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr className="border-t border-stone-200/80">
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-stone-500">
                  {canPublishToWechat ? "还没有推送记录。先从编辑器把文稿推送到微信公众号草稿箱。" : "当前套餐未开放微信草稿箱推送，因此这里暂时不会产生同步日志。"}
                </td>
              </tr>
            ) : null}
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-stone-200/80">
                <td className="px-6 py-4">
                  <div className="font-medium text-ink">{log.title}</div>
                  {log.mediaId ? <div className="mt-2 text-xs text-stone-500">草稿媒体 ID：{log.mediaId}</div> : null}
                </td>
                <td className="px-6 py-4 text-stone-600">
                  <div>{log.connectionName || "未命名公众号"}</div>
                  {log.retryCount > 0 ? <div className="mt-2 text-xs text-stone-500">重试次数：{log.retryCount}</div> : null}
                  {log.templateId ? <div className="mt-1 text-xs text-stone-500">模板：{log.templateId}</div> : null}
                </td>
                <td className="px-6 py-4 text-stone-600">
                  <div>{new Date(log.createdAt).toLocaleString("zh-CN")}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={log.status === "success" ? "text-emerald-600" : "text-cinnabar"}>
                    {log.status === "success" ? "✅ 推送成功" : `❌ ${log.failureReason || "推送失败"}`}
                  </span>
                  {log.failureReason ? <div className="mt-2 text-xs leading-6 text-cinnabar">{log.failureReason}</div> : null}
                  {log.failureCode ? <div className="mt-2 text-xs leading-6 text-stone-500">失败分类：{formatSyncFailureCode(log.failureCode)}</div> : null}
                  {log.documentVersionHash ? <div className="mt-1 text-xs leading-6 text-stone-500">版本哈希：{log.documentVersionHash.slice(0, 12)}</div> : null}
                </td>
                <td className="px-6 py-4 text-cinnabar">
                  {renderSyncAction(log, canPublishToWechat)}
                  {log.requestSummary || log.responseSummary ? (
                    <div className="mt-3 space-y-2 text-left">
                      {log.requestSummary ? (
                        <div className="border border-stone-200 bg-[#faf7f0] px-3 py-2 text-xs leading-6 text-stone-600">
                          <div className="uppercase tracking-[0.18em] text-stone-500">请求摘要</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(log.requestSummary)}</pre>
                        </div>
                      ) : null}
                      {log.responseSummary ? (
                        <div className="border border-stone-200 bg-[#faf7f0] px-3 py-2 text-xs leading-6 text-stone-600">
                          <div className="uppercase tracking-[0.18em] text-stone-500">响应摘要</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(log.responseSummary)}</pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AffiliateCenter() {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Affiliate</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink">把排版基因和推荐码做成可持续分销。</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            ["本月带来注册", "28", "管理员手动发号后，归因给推荐人"],
            ["预计佣金", "￥2,160", "支付能力未接外部渠道，先保留账务结构"],
            ["已发布基因", "6", "被 Fork 时触发积分与佣金结算"],
          ].map(([label, value, note]) => (
            <div key={label} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
              <div className="mt-3 font-serifCn text-4xl text-ink">{value}</div>
              <div className="mt-3 text-sm leading-7 text-stone-700">{note}</div>
            </div>
          ))}
        </div>
      </div>
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">推荐动作</div>
        <div className="mt-4 space-y-3 text-sm">
          <Link href="/creator/ashui" className="flex items-center justify-between border border-stone-300 bg-white px-4 py-3">
            查看公开创作者主页
            <ArrowRight size={16} />
          </Link>
          <button className="w-full border border-stone-300 bg-white px-4 py-3 text-left">复制专属推荐链接</button>
        </div>
      </aside>
    </section>
  );
}
