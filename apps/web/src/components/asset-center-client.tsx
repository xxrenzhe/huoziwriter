"use client";

import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
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
  reusablePrompt?: {
    prompt: string;
    negativePrompt: string | null;
    promptHash: string | null;
    provider: string | null;
    model: string | null;
    aspectRatio: string | null;
  } | null;
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
  if (value === "inline" || value === "inline_image") return "文中配图";
  if (value === "infographic") return "信息图";
  if (value === "diagram_svg" || value === "diagram_png") return "图解";
  if (value === "comic") return "漫画图";
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
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "时间未知";
  return new Date(value).toLocaleString("zh-CN");
}

const sectionClassName = cn(surfaceCardStyles({ padding: "md" }), "flex h-full flex-col gap-5");
const sectionHeaderClassName = "flex items-start justify-between gap-4";
const sectionEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-cinnabar";
const sectionTitleClassName = "mt-2 font-serifCn text-2xl text-ink text-balance";
const countBadgeClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "min-w-[88px] shrink-0 text-right shadow-none",
);
const itemCardClassName = cn(
  surfaceCardStyles({ tone: "warm", padding: "sm" }),
  "space-y-3 shadow-none",
);
const emptyStateClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "border-dashed text-sm leading-7 text-inkSoft shadow-none",
);
const statusMessageClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "sm" }),
  "text-sm text-inkSoft shadow-none",
);
const imagePreviewFallbackClassName = cn(
  surfaceCardStyles({ tone: "subtle", padding: "none" }),
  "flex aspect-[16/9] items-center justify-center border-dashed text-xs text-inkMuted shadow-none",
);
const chipClassName = "inline-flex items-center rounded-full border border-lineStrong bg-surface px-3 py-1 text-xs text-inkSoft";
const mutedChipClassName = "inline-flex items-center rounded-full border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted";
const warningChipClassName =
  "inline-flex items-center rounded-full border border-warning/40 bg-surfaceWarning px-2.5 py-1 text-xs text-warning";
const actionClassName = buttonStyles({ variant: "secondary", size: "sm" });

function getKnowledgeStatusChipClassName(status: string) {
  if (status === "active") {
    return "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700";
  }
  if (status === "conflicted") {
    return "inline-flex items-center rounded-full border border-warning/40 bg-surfaceWarning px-3 py-1 text-xs text-warning";
  }
  if (status === "stale") {
    return "inline-flex items-center rounded-full border border-lineStrong bg-surfaceWarm px-3 py-1 text-xs text-inkSoft";
  }
  if (status === "draft" || status === "archived") {
    return "inline-flex items-center rounded-full border border-lineStrong bg-surface px-3 py-1 text-xs text-inkMuted";
  }
  return chipClassName;
}

function getImageStatusChipClassName(status: string) {
  if (status === "ready") {
    return "inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700";
  }
  if (status === "failed") {
    return "inline-flex items-center rounded-full border border-warning/40 bg-surfaceWarning px-3 py-1 text-xs text-warning";
  }
  if (status === "pending") {
    return "inline-flex items-center rounded-full border border-lineStrong bg-surfaceWarm px-3 py-1 text-xs text-inkSoft";
  }
  return chipClassName;
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
  const [copiedPromptId, setCopiedPromptId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const recentFragments = fragments.slice(0, 6);
  const recentKnowledgeCards = knowledgeCards.slice(0, 6);
  const recentImageAssets = imageAssets.slice(0, 6);
  const conflictedKnowledgeCards = knowledgeCards.filter((card) => card.status === "conflicted");
  const staleKnowledgeCards = knowledgeCards.filter((card) => card.status === "stale");
  const problematicImageAssets = imageAssets.filter((asset) => asset.status !== "ready");

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
      setMessage("背景卡已刷新。");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "背景卡刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  async function copyImagePrompt(asset: ImageAssetItem) {
    const prompt = asset.reusablePrompt?.prompt?.trim();
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopiedPromptId(asset.id);
    setMessage("图片 prompt 已复制。");
    window.setTimeout(() => {
      setCopiedPromptId((current) => (current === asset.id ? null : current));
    }, 1800);
  }

  return (
    <div className="space-y-5">
      {message ? (
        <div aria-live="polite" className={statusMessageClassName}>
          {message}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <section id="asset-queue-conflicted-knowledge" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>待处理库存</div>
              <h2 className={sectionTitleClassName}>冲突背景卡</h2>
            </div>
            <div aria-label={`冲突背景卡共 ${conflictedKnowledgeCards.length} 张`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{conflictedKnowledgeCards.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">张</div>
            </div>
          </div>
          <div className="space-y-4">
            {conflictedKnowledgeCards.length > 0 ? (
              conflictedKnowledgeCards.slice(0, 4).map((card) => (
                <article key={`conflicted-${card.id}`} className={itemCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className={getKnowledgeStatusChipClassName(card.status)}>{formatKnowledgeStatus(card.status)}</div>
                      <h3 className="mt-2 font-medium text-ink">{card.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshKnowledgeCard(card.id)}
                      disabled={refreshingKnowledgeId === card.id}
                      className={actionClassName}
                    >
                      {refreshingKnowledgeId === card.id ? "刷新中…" : "立即刷新"}
                    </button>
                  </div>
                  <p className="text-sm leading-7 text-inkSoft">{summarizeText(card.latestChangeSummary || card.summary, 72)}</p>
                  <div className="flex flex-wrap gap-2">
                    {card.conflictFlags.slice(0, 3).map((flag) => (
                      <span key={`${card.id}-${flag}`} className={warningChipClassName}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>当前没有冲突背景卡，背景知识状态相对稳定。</div>
            )}
          </div>
        </section>

        <section id="asset-queue-stale-knowledge" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>待处理库存</div>
              <h2 className={sectionTitleClassName}>待刷新背景卡</h2>
            </div>
            <div aria-label={`待刷新背景卡共 ${staleKnowledgeCards.length} 张`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{staleKnowledgeCards.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">张</div>
            </div>
          </div>
          <div className="space-y-4">
            {staleKnowledgeCards.length > 0 ? (
              staleKnowledgeCards.slice(0, 4).map((card) => (
                <article key={`stale-${card.id}`} className={itemCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className={getKnowledgeStatusChipClassName(card.status)}>{formatKnowledgeStatus(card.status)}</div>
                      <h3 className="mt-2 font-medium text-ink">{card.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshKnowledgeCard(card.id)}
                      disabled={refreshingKnowledgeId === card.id}
                      className={actionClassName}
                    >
                      {refreshingKnowledgeId === card.id ? "刷新中…" : "立即刷新"}
                    </button>
                  </div>
                  <p className="text-sm leading-7 text-inkSoft">{summarizeText(card.summary || card.latestChangeSummary, 72)}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className={mutedChipClassName}>来源素材 {card.sourceFragmentCount} 条</span>
                    {card.lastCompiledAt ? <span className={mutedChipClassName}>最近编译 {formatDateTime(card.lastCompiledAt)}</span> : null}
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>当前没有待刷新的背景卡。</div>
            )}
          </div>
        </section>

        <section id="asset-queue-problematic-images" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>待处理库存</div>
              <h2 className={sectionTitleClassName}>待处理图片</h2>
            </div>
            <div aria-label={`待处理图片共 ${problematicImageAssets.length} 项`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{problematicImageAssets.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">项</div>
            </div>
          </div>
          <div className="space-y-4">
            {problematicImageAssets.length > 0 ? (
              problematicImageAssets.slice(0, 4).map((asset) => (
                <article key={`problematic-image-${asset.id}`} className={itemCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className={getImageStatusChipClassName(asset.status)}>{formatImageAssetStatus(asset.status)}</div>
                      <h3 className="mt-2 font-medium text-ink">{asset.articleTitle || "未绑定稿件"}</h3>
                    </div>
                    <time dateTime={asset.updatedAt} className="text-xs tabular-nums text-inkMuted">
                      {formatDateTime(asset.updatedAt)}
                    </time>
                  </div>
                  <p className="text-sm leading-7 text-inkSoft">
                    {formatImageAssetType(asset.assetType)} · {asset.variantLabel || formatImageAssetScope(asset.assetScope)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {asset.articleId ? (
                      <Link href={`/articles/${asset.articleId}?step=publish`} className={actionClassName}>
                        回到发布步骤
                      </Link>
                    ) : null}
                    {asset.publicUrl ? (
                      <a href={asset.publicUrl} target="_blank" rel="noreferrer" className={actionClassName}>
                        查看原图
                      </a>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>当前没有待处理图片资产。</div>
            )}
          </div>
        </section>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section aria-labelledby="asset-center-fragments-title" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>素材库</div>
              <h2 id="asset-center-fragments-title" className={sectionTitleClassName}>
                素材库存
              </h2>
            </div>
            <div aria-label={`素材库存共 ${fragments.length} 条`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{fragments.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">条</div>
            </div>
          </div>
          <div className="space-y-4">
            {recentFragments.length > 0 ? (
              recentFragments.map((fragment) => (
                <article key={fragment.id} className={itemCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={chipClassName}>{formatFragmentSourceType(fragment.sourceType)}</span>
                      <span className={mutedChipClassName}>{fragment.shared ? "共享素材" : `#${fragment.id}`}</span>
                    </div>
                    <time dateTime={fragment.createdAt} className="text-xs tabular-nums text-inkMuted">
                      {formatDateTime(fragment.createdAt)}
                    </time>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-medium text-ink">{fragment.title || `素材 #${fragment.id}`}</h3>
                    <p className="text-sm leading-7 text-inkSoft">{summarizeText(fragment.distilledContent, 72)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fragment.sourceUrl ? (
                      <a href={fragment.sourceUrl} target="_blank" rel="noreferrer" className={actionClassName}>
                        打开来源
                      </a>
                    ) : null}
                    {fragment.screenshotPath ? (
                      <span className={mutedChipClassName}>含截图</span>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>
                当前还没有素材。先去任一稿件的「证据」步骤挂 2 条最小素材集。
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="asset-center-knowledge-title" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>背景卡</div>
              <h2 id="asset-center-knowledge-title" className={sectionTitleClassName}>
                背景卡库存
              </h2>
            </div>
            <div aria-label={`背景卡库存共 ${knowledgeCards.length} 张`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{knowledgeCards.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">张</div>
            </div>
          </div>
          <div className="space-y-4">
            {recentKnowledgeCards.length > 0 ? (
              recentKnowledgeCards.map((card) => (
                <article key={card.id} className={itemCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={chipClassName}>{card.cardType}</span>
                        <span className={getKnowledgeStatusChipClassName(card.status)}>
                          {formatKnowledgeStatus(card.status)}
                        </span>
                      </div>
                      <h3 className="font-medium text-ink">{card.title}</h3>
                    </div>
                    <div className="min-w-[72px] text-right">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-inkMuted">置信度</div>
                      <div className="mt-1 text-sm font-medium tabular-nums text-ink">
                        {Math.round(card.confidenceScore * 100)}%
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-7 text-inkSoft">
                    {summarizeText(card.summary || card.latestChangeSummary, 72)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className={mutedChipClassName}>来源素材 {card.sourceFragmentCount} 条</span>
                    <span className={mutedChipClassName}>{card.shared ? "共享背景卡" : "个人背景卡"}</span>
                    {card.lastCompiledAt ? (
                      <span className={mutedChipClassName}>
                        最近编译 {formatDateTime(card.lastCompiledAt)}
                      </span>
                    ) : null}
                  </div>
                  {card.conflictFlags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {card.conflictFlags.slice(0, 3).map((flag) => (
                        <span key={`${card.id}-${flag}`} className={warningChipClassName}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      aria-busy={refreshingKnowledgeId === card.id || undefined}
                      type="button"
                      onClick={() => void refreshKnowledgeCard(card.id)}
                      disabled={refreshingKnowledgeId === card.id}
                      className={actionClassName}
                    >
                      {refreshingKnowledgeId === card.id ? "刷新中…" : "刷新背景卡"}
                    </button>
                    <Link href="/articles" className={actionClassName}>
                      去稿件区调用
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>
                当前还没有背景卡。系统在稿件写作和补证时命中相关素材后，会逐步在这里沉淀。
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="asset-center-images-title" className={sectionClassName}>
          <div className={sectionHeaderClassName}>
            <div>
              <div className={sectionEyebrowClassName}>图片资产</div>
              <h2 id="asset-center-images-title" className={sectionTitleClassName}>
                图片库存
              </h2>
            </div>
            <div aria-label={`图片资产共 ${imageAssets.length} 项`} className={countBadgeClassName}>
              <div className="text-lg font-semibold tabular-nums text-ink">{imageAssets.length}</div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-inkMuted">项</div>
            </div>
          </div>
          <div className="space-y-4">
            {recentImageAssets.length > 0 ? (
              recentImageAssets.map((asset) => (
                <article key={asset.id} className={itemCardClassName}>
                  {asset.publicUrl ? (
                    <div className="overflow-hidden border border-lineStrong bg-surface">
                      <img
                        src={asset.publicUrl}
                        alt={`${asset.articleTitle || "未绑定稿件"}${formatImageAssetType(asset.assetType)}`}
                        width={800}
                        height={450}
                        className="aspect-[16/9] w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className={imagePreviewFallbackClassName}>
                      暂无可预览地址
                    </div>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={chipClassName}>{formatImageAssetScope(asset.assetScope)}</span>
                      <span className={mutedChipClassName}>
                        {formatImageAssetType(asset.assetType)}
                        {asset.variantLabel ? ` · ${asset.variantLabel}` : ""}
                      </span>
                      <span className={getImageStatusChipClassName(asset.status)}>
                        {formatImageAssetStatus(asset.status)}
                      </span>
                    </div>
                    <time dateTime={asset.updatedAt} className="text-xs tabular-nums text-inkMuted">
                      {formatDateTime(asset.updatedAt)}
                    </time>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-medium text-ink">{asset.articleTitle || "未绑定稿件"}</h3>
                    <p className="text-sm leading-7 text-inkSoft">
                      {formatImageMimeType(asset.mimeType)} · {formatBytes(asset.byteLength)}
                    </p>
                    {asset.reusablePrompt ? (
                      <p className="border border-lineStrong bg-paperStrong px-3 py-2 text-xs leading-6 text-inkSoft">
                        Prompt：{summarizeText(asset.reusablePrompt.prompt, 92)}
                      </p>
                    ) : null}
                  </div>
                  {asset.reusablePrompt ? (
                    <div className="flex flex-wrap gap-2">
                      {asset.reusablePrompt.model ? <span className={mutedChipClassName}>模型 {asset.reusablePrompt.model}</span> : null}
                      {asset.reusablePrompt.provider ? <span className={mutedChipClassName}>服务 {asset.reusablePrompt.provider}</span> : null}
                      {asset.reusablePrompt.aspectRatio ? <span className={mutedChipClassName}>比例 {asset.reusablePrompt.aspectRatio}</span> : null}
                      {asset.reusablePrompt.promptHash ? <span className={mutedChipClassName}>Hash {asset.reusablePrompt.promptHash}</span> : null}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {asset.articleId ? (
                      <Link href={`/articles/${asset.articleId}?step=publish`} className={actionClassName}>
                        打开对应稿件
                      </Link>
                    ) : null}
                    {asset.publicUrl ? (
                      <a href={asset.publicUrl} target="_blank" rel="noreferrer" className={actionClassName}>
                        查看原图
                      </a>
                    ) : null}
                    {asset.reusablePrompt ? (
                      <button type="button" onClick={() => void copyImagePrompt(asset)} className={actionClassName}>
                        {copiedPromptId === asset.id ? "已复制" : "复用 Prompt"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className={emptyStateClassName}>
                当前还没有图片资产。去稿件的「发布」步骤生成封面图后，这里会集中沉淀。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
