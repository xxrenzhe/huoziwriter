"use client";

import { Button, Input, Select, buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatArticleStatusLabel } from "@/lib/article-status-label";

const writerPaperEmptyStateSurfaceClassName =
  "relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(196,138,58,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.86)_0%,var(--paper)_100%)]";
const writerPaperPromptCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "bg-surface/80 text-xs leading-6 text-inkSoft");
const writerPaperPrimaryActionClassName = buttonStyles({ variant: "primary" });
const writerPaperSecondaryActionClassName = buttonStyles({ variant: "secondary" });
const createArticleMessageClassName = "text-sm text-cinnabar";
const articleListCardClassName = cn("block", surfaceCardStyles({ padding: "md", interactive: true }));

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
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="输入稿件标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="输入稿件标题"
          className="min-w-[240px] flex-1"
        />
        <Select
          aria-label="select control"
          value={seriesId}
          onChange={(event) => setSeriesId(event.target.value)}
          className="min-w-[240px]"
        >
          <option value="">{seriesOptions.length > 0 ? "选择稿件归属系列" : "请先创建系列"}</option>
          {seriesOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
            </option>
          ))}
        </Select>
        <Button disabled={loading || seriesOptions.length === 0} type="submit" variant="primary">
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

  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <Link key={article.id} href={`/articles/${article.id}`} className={articleListCardClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="font-serifCn text-2xl text-ink text-balance">{article.title}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">{formatArticleStatusLabel(article.status)}</div>
          </div>
          {article.seriesName ? <div className="mt-3 text-sm text-inkSoft">归属系列：{article.seriesName}</div> : null}
          {article.targetPackage ? <div className="mt-2 text-sm text-inkSoft">目标包：{article.targetPackage}</div> : null}
          <div className="mt-3 text-sm text-inkMuted">最后更新：{new Date(article.updatedAt).toLocaleString("zh-CN")}</div>
        </Link>
      ))}
    </div>
  );
}
