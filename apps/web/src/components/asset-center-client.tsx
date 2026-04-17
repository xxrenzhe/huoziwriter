"use client";

import { refreshKnowledgeCardAction } from "@/app/(writer)/writer-actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

type FragmentAssetItem = {
  id: number;
  title: string | null;
  distilledContent: string;
  sourceType: string;
  sourceUrl: string | null;
  screenshotPath: string | null;
  createdAt: string;
  shared: boolean;
};

type KnowledgeAssetItem = {
  id: number;
  title: string;
  cardType: string;
  summary: string | null;
  conflictFlags: string[];
  latestChangeSummary: string | null;
  sourceFragmentCount: number;
  confidenceScore: number;
  status: string;
  lastCompiledAt: string | null;
  shared: boolean;
};

type ImageAssetItem = {
  id: number;
  articleId: number | null;
  articleTitle: string | null;
  assetScope: string;
  assetType: string;
  variantLabel: string | null;
  publicUrl: string | null;
  mimeType: string | null;
  byteLength: number | null;
  status: string;
  updatedAt: string;
};

function formatFragmentSourceType(value: string | null | undefined) {
  if (value === "screenshot") return "截图";
  if (value === "url") return "链接";
  if (value === "manual") return "手动记录";
  return value || "素材";
}

function formatKnowledgeStatus(status: string) {
  if (status === "active") return "正常";
  if (status === "conflicted") return "冲突";
  if (status === "stale") return "待刷新";
  if (status === "draft") return "草稿";
  if (status === "archived") return "归档";
  return status || "未知";
}

function formatImageAssetScope(value: string | null | undefined) {
  if (value === "cover") return "已选封面";
  if (value === "candidate") return "候选图";
  return value || "图片资产";
}

function formatImageAssetType(value: string | null | undefined) {
  if (value === "cover_image") return "封面图";
  if (value === "inline") return "文中配图";
  return value || "图片类型";
}

function formatImageAssetStatus(value: string | null | undefined) {
  if (value === "ready") return "可用";
  if (value === "pending") return "处理中";
  if (value === "failed") return "失败";
  return value || "未知";
}

function formatImageMimeType(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "image/*") return "图片格式待识别";
  return normalized;
}

function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function summarizeText(value: string | null | undefined, maxLength = 68) {
  const text = String(value || "").trim();
  if (!text) return "暂无摘要";
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
}

export function WriterAssetCenterClient({
  fragments,
  knowledgeCards: initialKnowledgeCards,
  imageAssets,
}: {
  fragments: FragmentAssetItem[];
  knowledgeCards: KnowledgeAssetItem[];
  imageAssets: ImageAssetItem[];
}) {
  const router = useRouter();
  const [knowledgeCards, setKnowledgeCards] = useState(initialKnowledgeCards);
  const [refreshingKnowledgeId, setRefreshingKnowledgeId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function refreshKnowledgeCard(cardId: number) {
    setRefreshingKnowledgeId(cardId);
    setMessage("");
    try {
      const detail = await refreshKnowledgeCardAction(cardId);
      setKnowledgeCards((current) =>
        current.map((item) =>
          item.id === cardId
            ? {
                ...item,
                summary: detail.summary ?? item.summary,
                conflictFlags: Array.isArray(detail.conflictFlags) ? detail.conflictFlags : item.conflictFlags,
                latestChangeSummary: detail.latestChangeSummary ?? item.latestChangeSummary,
                sourceFragmentCount:
                  typeof detail.sourceFragmentIds?.length === "number" ? detail.sourceFragmentIds.length : item.sourceFragmentCount,
                confidenceScore:
                  typeof detail.confidenceScore === "number" ? detail.confidenceScore : item.confidenceScore,
                status: typeof detail.status === "string" ? detail.status : item.status,
                lastCompiledAt: typeof detail.lastCompiledAt === "string" ? detail.lastCompiledAt : item.lastCompiledAt,
              }
            : item,
        ),
      );
      setMessage("主题档案已刷新。");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "主题档案刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="border border-stone-300/40 bg-[#fffdfa] px-4 py-3 text-sm text-stone-700">
          {message}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <section className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">碎片库</div>
              <div className="mt-2 font-serifCn text-2xl text-ink">最近素材</div>
            </div>
            <div className="text-sm text-stone-500">{fragments.length} 条</div>
          </div>
          <div className="mt-4 space-y-3">
            {fragments.length > 0 ? (
              fragments.map((fragment) => (
                <article key={fragment.id} className="border border-stone-300/40 bg-[#faf7f0] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                      {formatFragmentSourceType(fragment.sourceType)} · {new Date(fragment.createdAt).toLocaleString("zh-CN")}
                    </div>
                    <div className="text-xs text-stone-500">{fragment.shared ? "共享素材" : `#${fragment.id}`}</div>
                  </div>
                  <div className="mt-2 font-medium text-ink">{fragment.title || `素材 #${fragment.id}`}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">{summarizeText(fragment.distilledContent, 72)}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {fragment.sourceUrl ? (
                      <a href={fragment.sourceUrl} target="_blank" rel="noreferrer" className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                        打开来源
                      </a>
                    ) : null}
                    {fragment.screenshotPath ? (
                      <span className="border border-stone-300 bg-white px-3 py-1 text-xs text-stone-700">
                        含截图
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="border border-dashed border-stone-300 bg-[#fffdfa] px-4 py-4 text-sm leading-7 text-stone-600">
                当前还没有素材。先去任一稿件的「证据」步骤挂 2 条最小素材集。
              </div>
            )}
          </div>
        </section>

        <section className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">主题档案</div>
              <div className="mt-2 font-serifCn text-2xl text-ink">最近档案</div>
            </div>
            <div className="text-sm text-stone-500">{knowledgeCards.length} 张</div>
          </div>
          <div className="mt-4 space-y-3">
            {knowledgeCards.length > 0 ? (
              knowledgeCards.map((card) => (
                <article key={card.id} className="border border-stone-300/40 bg-[#faf7f0] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-stone-500">
                        {card.cardType} · {formatKnowledgeStatus(card.status)}
                      </div>
                      <div className="mt-2 font-medium text-ink">{card.title}</div>
                    </div>
                    <div className="text-xs text-stone-500">置信度 {Math.round(card.confidenceScore * 100)}%</div>
                  </div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">{summarizeText(card.summary || card.latestChangeSummary, 72)}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                    <span className="border border-stone-300 bg-white px-3 py-1">来源素材 {card.sourceFragmentCount} 条</span>
                    <span className="border border-stone-300 bg-white px-3 py-1">{card.shared ? "共享档案" : "个人档案"}</span>
                    {card.lastCompiledAt ? (
                      <span className="border border-stone-300 bg-white px-3 py-1">
                        最近编译 {new Date(card.lastCompiledAt).toLocaleString("zh-CN")}
                      </span>
                    ) : null}
                  </div>
                  {card.conflictFlags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.conflictFlags.slice(0, 3).map((flag) => (
                        <span key={`${card.id}-${flag}`} className="border border-[#dfd2b0] bg-[#fff8e8] px-2 py-1 text-xs text-[#7d6430]">
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void refreshKnowledgeCard(card.id)}
                      disabled={refreshingKnowledgeId === card.id}
                      className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 disabled:opacity-60"
                    >
                      {refreshingKnowledgeId === card.id ? "刷新中..." : "刷新档案"}
                    </button>
                    <Link href="/articles" className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                      去稿件区调用
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className="border border-dashed border-stone-300 bg-[#fffdfa] px-4 py-4 text-sm leading-7 text-stone-600">
                当前还没有主题档案。系统在稿件写作和补证时命中相关素材后，会逐步在这里沉淀。
              </div>
            )}
          </div>
        </section>

        <section className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">图片资产</div>
              <div className="mt-2 font-serifCn text-2xl text-ink">最近封面与配图</div>
            </div>
            <div className="text-sm text-stone-500">{imageAssets.length} 项</div>
          </div>
          <div className="mt-4 space-y-3">
            {imageAssets.length > 0 ? (
              imageAssets.map((asset) => (
                <article key={asset.id} className="border border-stone-300/40 bg-[#faf7f0] p-4">
                  {asset.publicUrl ? (
                    <img src={asset.publicUrl} alt={asset.articleTitle || "图片资产"} className="aspect-[16/9] w-full border border-stone-300 object-cover" />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center border border-dashed border-stone-300 bg-white text-xs text-stone-500">
                      暂无可预览地址
                    </div>
                  )}
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-stone-500">
                    {formatImageAssetScope(asset.assetScope)} · {formatImageAssetType(asset.assetType)}{asset.variantLabel ? ` · ${asset.variantLabel}` : ""}
                  </div>
                  <div className="mt-2 font-medium text-ink">{asset.articleTitle || "未绑定稿件"}</div>
                  <div className="mt-2 text-sm leading-7 text-stone-700">
                    状态 {formatImageAssetStatus(asset.status)} · {formatImageMimeType(asset.mimeType)} · {formatBytes(asset.byteLength)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {asset.articleId ? (
                      <Link href={`/articles/${asset.articleId}?step=publish`} className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                        打开对应稿件
                      </Link>
                    ) : null}
                    {asset.publicUrl ? (
                      <a href={asset.publicUrl} target="_blank" rel="noreferrer" className="border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700">
                        查看原图
                      </a>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="border border-dashed border-stone-300 bg-[#fffdfa] px-4 py-4 text-sm leading-7 text-stone-600">
                当前还没有图片资产。去稿件的「发布」步骤生成封面图后，这里会集中沉淀。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
