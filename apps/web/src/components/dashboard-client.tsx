"use client";

import { Button, Input, Select, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { formatArticleStatusLabel } from "@/lib/article-status-label";

const writerPaperEmptyStateSurfaceClassName =
  "relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.86)_0%,var(--paper)_100%)]";
const writerPaperPromptCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surface/80 text-xs leading-6 text-inkSoft");
const writerPaperPrimaryActionClassName = buttonStyles({ variant: "primary" });
const writerPaperSecondaryActionClassName = buttonStyles({ variant: "secondary" });
const createArticleMessageClassName = "text-sm text-cinnabar";
const articleTableShellClassName = cn(surfaceCardStyles(), "overflow-hidden border-lineStrong bg-surface shadow-none");
const articleTableDesktopClassName = "hidden overflow-x-auto lg:block";
const articleTableMobileListClassName = "grid gap-3 p-4 lg:hidden";
const articleTableHeadCellClassName = "px-5 py-4 text-left text-xs uppercase tracking-[0.2em] text-inkMuted";
const articleTableBodyCellClassName = "px-5 py-4 align-top";
const articleTableRowBaseClassName = "border-t border-line transition-colors";
const articleListMetaChipClassName = cn(surfaceCardStyles({ tone: "subtle", padding: "sm" }), "px-2.5 py-1 text-[11px] text-inkSoft shadow-none");
const articleListStatusChipBaseClassName = "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium";
const articleListOpenLinkClassName = buttonStyles({ variant: "secondary" });
const articleListCreateLinkClassName = buttonStyles({ variant: "primary" });
const articleListMobileCardClassName = cn(surfaceCardStyles({ padding: "md", interactive: true }), "border-lineStrong bg-surface shadow-none");

function formatArticleUpdatedAt(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return {
      shortLabel: "更新时间未知",
      fullLabel: value,
    };
  }
  const diffMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const fullLabel = new Date(value).toLocaleString("zh-CN");
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return {
      shortLabel: `${minutes} 分钟前`,
      fullLabel,
    };
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return {
      shortLabel: `${hours} 小时前`,
      fullLabel,
    };
  }
  const days = Math.max(1, Math.floor(diffMs / day));
  return {
    shortLabel: `${days} 天前`,
    fullLabel,
  };
}

function getArticleStatusChipClassName(status: string) {
  if (status === "published" || status === "published_synced" || status === "result_reviewed") {
    return cn(articleListStatusChipBaseClassName, "border-emerald-200 bg-emerald-50 text-emerald-700");
  }
  if (status === "draft" || status === "writing") {
    return cn(articleListStatusChipBaseClassName, "border-amber-200 bg-amber-50 text-amber-700");
  }
  if (status === "archived") {
    return cn(articleListStatusChipBaseClassName, "border-slate-200 bg-slate-100 text-slate-600");
  }
  return cn(articleListStatusChipBaseClassName, "border-cinnabar/20 bg-cinnabar/5 text-cinnabar");
}

function handleSelectableArticleKeyDown(event: KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  onOpen();
}

type WriterPaperEmptyStateProps = {
  eyebrow: string;
  title: string;
  detail: string;
  prompts?: string[];
  actionHref?: string;
  actionLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  compact?: boolean;
};

export function WriterPaperEmptyState({
  eyebrow,
  title,
  detail,
  prompts = [],
  actionHref,
  actionLabel,
  secondaryHref,
  secondaryLabel,
  compact = false,
}: WriterPaperEmptyStateProps) {
  return (
    <div
      className={cn(surfaceCardStyles({ tone: "highlight", padding: compact ? "sm" : "md" }), writerPaperEmptyStateSurfaceClassName)}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0))]" />
      <div className="relative">
        <div className="inline-flex items-center border border-lineStrong/70 bg-surface/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-inkMuted">
          {eyebrow}
        </div>
        <div className={`mt-4 font-serifCn text-ink text-balance ${compact ? "text-2xl" : "text-3xl"}`}>{title}</div>
        <div className={`mt-3 max-w-3xl text-inkSoft ${compact ? "text-sm leading-7" : "text-sm leading-8"}`}>{detail}</div>
        {prompts.length > 0 ? (
          <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-2" : "md:grid-cols-3"}`}>
            {prompts.map((prompt) => (
              <div key={prompt} className={writerPaperPromptCardClassName}>
                {prompt}
              </div>
            ))}
          </div>
        ) : null}
        {actionHref || secondaryHref ? (
          <div className="mt-5 flex flex-wrap gap-3">
            {actionHref && actionLabel ? (
              <Link href={actionHref} className={writerPaperPrimaryActionClassName}>
                {actionLabel}
              </Link>
            ) : null}
            {secondaryHref && secondaryLabel ? (
              <Link href={secondaryHref} className={writerPaperSecondaryActionClassName}>
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CreateArticleForm({
  seriesOptions = [],
}: {
  seriesOptions?: Array<{ id: number; name: string; personaName: string; activeStatus: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [seriesId, setSeriesId] = useState(() => (seriesOptions.length === 1 ? String(seriesOptions[0].id) : ""));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!seriesId) {
      setMessage(seriesOptions.length > 0 ? "先给新稿件选一个系列，再开始写。" : "请先去设置创建至少 1 个系列，再开始写稿。");
      return;
    }
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || "未命名稿件", seriesId: Number(seriesId) }),
    });
    const json = await response.json();
    setLoading(false);
    if (response.ok && json.success) {
      router.push(`/articles/${json.data.id}`);
      router.refresh();
      return;
    }
    setMessage(json.error || "创建稿件失败");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,260px)_auto]">
        <Input
          aria-label="输入稿件标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="输入稿件标题"
          className="min-w-0 w-full"
        />
        <Select
          aria-label="select control"
          value={seriesId}
          onChange={(event) => setSeriesId(event.target.value)}
          className="min-w-0 w-full"
        >
          <option value="">{seriesOptions.length > 0 ? "选择稿件归属系列" : "请先创建系列"}</option>
          {seriesOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
            </option>
          ))}
        </Select>
        <Button disabled={loading || seriesOptions.length === 0} type="submit" variant="primary" className="w-full md:w-auto">
          {loading ? "创建中…" : "新建稿件"}
        </Button>
      </div>
      {seriesOptions.length === 0 ? (
        <WriterPaperEmptyState
          eyebrow="起稿前置"
          title="先立一个长期系列，再开始写第一篇稿。"
          detail="稿件不会脱离系列独立存在。先把长期主题、人设和经营方向定下来，后面的策略、证据和结果回流才有稳定挂点。"
          prompts={[
            "先定长期主题，再补第一篇标题。",
            "系列最好直接对应一个持续经营的人设或问题域。",
            "有了系列后，新稿会自动落进完整六步链路。",
          ]}
          actionHref="/settings"
          actionLabel="去设置页建系列"
          compact
        />
      ) : null}
      {message ? <div className={createArticleMessageClassName}>{message}</div> : null}
    </form>
  );
}

export function ArticleList({
  articles,
  emptyState,
}: {
  articles: Array<{
    id: number;
    title: string;
    status: string;
    updatedAt: string;
    seriesName?: string | null;
    targetPackage?: string | null;
    topicBacklogName?: string | null;
    topicBacklogBatchId?: string | null;
  }>;
  emptyState?: WriterPaperEmptyStateProps;
}) {
  if (articles.length === 0) {
    return (
      <WriterPaperEmptyState
        eyebrow={emptyState?.eyebrow || "稿件案头"}
        title={emptyState?.title || "案头暂时没有墨迹。"}
        detail={emptyState?.detail || "从上方新建一篇稿件，六步链路就会从这里开始承接。"}
        prompts={emptyState?.prompts || ["先立一篇稿件对象，再挂素材和证据。", "已经筛过题时，优先把最值得写的一篇立起来。"]}
        actionHref={emptyState?.actionHref || "/articles#create-article"}
        actionLabel={emptyState?.actionLabel || "去新建稿件"}
        secondaryHref={emptyState?.secondaryHref}
        secondaryLabel={emptyState?.secondaryLabel}
        compact
      />
    );
  }

  const router = useRouter();

  return (
    <div className={articleTableShellClassName}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">DataTable</div>
          <div className="mt-2 text-sm text-inkSoft">桌面端优先扫读标题、系列、状态与更新时间；移动端自动切成紧凑稿件卡片。</div>
        </div>
        <Link href="/articles#create-article" className={articleListCreateLinkClassName}>
          新建稿件
        </Link>
      </div>

      <div className={articleTableDesktopClassName}>
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-paper/70">
            <tr>
              <th className={articleTableHeadCellClassName}>标题</th>
              <th className={articleTableHeadCellClassName}>系列</th>
              <th className={articleTableHeadCellClassName}>状态</th>
              <th className={articleTableHeadCellClassName}>目标 / 选题</th>
              <th className={articleTableHeadCellClassName}>更新时间</th>
              <th className={articleTableHeadCellClassName}>操作</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const href = `/articles/${article.id}`;
              const updatedAt = formatArticleUpdatedAt(article.updatedAt);
              return (
                <tr
                  key={article.id}
                  role="link"
                  tabIndex={0}
                  className={cn(articleTableRowBaseClassName, "cursor-pointer hover:bg-paper/70 focus-visible:bg-paper/70")}
                  onClick={() => router.push(href)}
                  onDoubleClick={() => window.open(href, "_blank", "noopener,noreferrer")}
                  onKeyDown={(event) => handleSelectableArticleKeyDown(event, () => router.push(href))}
                >
                  <td className={articleTableBodyCellClassName}>
                    <div className="max-w-[360px]">
                      <div className="font-serifCn text-xl text-ink text-balance">{article.title}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {article.topicBacklogName ? <span className={articleListMetaChipClassName}>选题库：{article.topicBacklogName}</span> : null}
                        {article.topicBacklogBatchId ? <span className={articleListMetaChipClassName}>批次：{article.topicBacklogBatchId}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td className={articleTableBodyCellClassName}>
                    <div className="text-sm text-ink">{article.seriesName || "未归属系列"}</div>
                  </td>
                  <td className={articleTableBodyCellClassName}>
                    <span className={getArticleStatusChipClassName(article.status)}>{formatArticleStatusLabel(article.status)}</span>
                  </td>
                  <td className={articleTableBodyCellClassName}>
                    <div className="space-y-2">
                      <div className="text-sm text-ink">{article.targetPackage || "未设置目标包"}</div>
                      <div className="text-xs text-inkMuted">优先从这里判断这篇稿当前服务的结果目标。</div>
                    </div>
                  </td>
                  <td className={articleTableBodyCellClassName}>
                    <time dateTime={article.updatedAt} title={updatedAt.fullLabel} className="block text-sm text-ink">
                      {updatedAt.shortLabel}
                    </time>
                    <div className="mt-1 text-xs text-inkMuted">{updatedAt.fullLabel}</div>
                  </td>
                  <td className={articleTableBodyCellClassName}>
                    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <Link href={href} className={articleListOpenLinkClassName}>
                        打开
                      </Link>
                      <Link href={`${href}?step=strategy`} className={articleListOpenLinkClassName}>
                        继续推进
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={articleTableMobileListClassName}>
        {articles.map((article) => {
          const href = `/articles/${article.id}`;
          const updatedAt = formatArticleUpdatedAt(article.updatedAt);
          return (
            <article
              key={article.id}
              role="link"
              tabIndex={0}
              onClick={() => router.push(href)}
              onKeyDown={(event) => handleSelectableArticleKeyDown(event, () => router.push(href))}
              className={articleListMobileCardClassName}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-serifCn text-2xl text-ink text-balance">{article.title}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={articleListMetaChipClassName}>{article.seriesName || "未归属系列"}</span>
                    <span className={getArticleStatusChipClassName(article.status)}>{formatArticleStatusLabel(article.status)}</span>
                    {article.targetPackage ? <span className={articleListMetaChipClassName}>{article.targetPackage}</span> : null}
                  </div>
                  <div className="mt-3 text-sm text-inkSoft">
                    {article.topicBacklogName ? `选题库：${article.topicBacklogName}` : "还没挂到选题库"}
                    {article.topicBacklogBatchId ? ` · 批次：${article.topicBacklogBatchId}` : ""}
                  </div>
                  <time dateTime={article.updatedAt} title={updatedAt.fullLabel} className="mt-3 block text-xs text-inkMuted">
                    更新于 {updatedAt.shortLabel}
                  </time>
                </div>
                <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                  <Link href={href} className={articleListOpenLinkClassName}>
                    打开
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
