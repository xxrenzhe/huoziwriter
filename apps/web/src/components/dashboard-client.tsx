"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatArticleStatusLabel } from "@/lib/article-status-label";

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
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="输入稿件标题"
          className="min-w-[240px] flex-1 border border-stone-300 bg-white px-4 py-3 text-sm"
        />
        <select
          value={seriesId}
          onChange={(event) => setSeriesId(event.target.value)}
          className="min-w-[240px] border border-stone-300 bg-white px-4 py-3 text-sm"
        >
          <option value="">{seriesOptions.length > 0 ? "选择稿件归属系列" : "请先创建系列"}</option>
          {seriesOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} · {item.personaName}{item.activeStatus !== "active" ? " · 非经营中" : ""}
            </option>
          ))}
        </select>
        <button disabled={loading || seriesOptions.length === 0} className="bg-cinnabar px-5 py-3 text-sm text-white disabled:opacity-60">
          {loading ? "创建中..." : "新建稿件"}
        </button>
      </div>
      {seriesOptions.length === 0 ? (
        <div className="text-sm leading-7 text-stone-600">当前还没有系列。先去设置里补 1 个长期系列，再开始创建稿件。</div>
      ) : null}
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
    </form>
  );
}

export function ArticleList({
  articles,
}: {
  articles: Array<{
    id: number;
    title: string;
    status: string;
    updatedAt: string;
    seriesName?: string | null;
    targetPackage?: string | null;
  }>;
}) {
  return (
    <div className="space-y-3">
      {articles.map((article) => (
        <Link
          key={article.id}
          href={`/articles/${article.id}`}
          className="block border border-stone-300/40 bg-white p-5 shadow-ink transition-colors hover:bg-[#fffdfa]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-serifCn text-2xl text-ink">{article.title}</div>
              <div className="text-xs uppercase tracking-[0.2em] text-stone-500">{formatArticleStatusLabel(article.status)}</div>
            </div>
          {article.seriesName ? <div className="mt-3 text-sm text-stone-700">归属系列：{article.seriesName}</div> : null}
          {article.targetPackage ? <div className="mt-2 text-sm text-stone-700">目标包：{article.targetPackage}</div> : null}
          <div className="mt-3 text-sm text-stone-600">最后更新：{new Date(article.updatedAt).toLocaleString("zh-CN")}</div>
        </Link>
      ))}
      {articles.length === 0 ? <div className="border border-dashed border-stone-300 p-5 text-sm text-stone-600">还没有稿件，先创建一篇。</div> : null}
    </div>
  );
}
