import { Button } from "@huoziwriter/ui";
import type { ChangeEvent } from "react";
import { formatBytes } from "@/lib/article-workspace-helpers";

type VisualSuggestionItemLike = {
  id: number;
  title: string;
  prompt: string;
};

type CoverImageCandidateLike = {
  id: number;
  variantLabel: string;
  imageUrl: string;
  prompt: string;
  isSelected: boolean;
};

type ArticleImagePromptLike = {
  id: number;
  title: string;
  prompt: string;
  assetType?: string | null;
  status?: string | null;
  visualBriefId?: number | null;
  updatedAt: string;
};

type CoverImageLike = {
  imageUrl: string;
  prompt: string;
  createdAt: string;
} | null;

type VisualEngineRailProps = {
  visualSuggestion: string;
  nodeVisualSuggestions: VisualSuggestionItemLike[];
  onSaveImagePromptAssets: () => void | Promise<void>;
  savingImagePrompts: boolean;
  onGenerateInlineImages: () => void | Promise<void>;
  generatingInlineImages: boolean;
  onInsertVisualAssets: () => void | Promise<void>;
  insertingVisualAssets: boolean;
  onGenerateCoverImage: () => void | Promise<void>;
  coverImageButtonDisabled: boolean;
  coverImageButtonVariant: "primary" | "secondary";
  coverImageButtonMuted: boolean;
  coverImageButtonLabel: string;
  canUseCoverImageReference: boolean;
  onCoverReferenceFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  coverImageReferenceDataUrl: string | null;
  canGenerateCoverImage: boolean;
  coverImageQuota: { used: number; limit: number | null; remaining: number | null };
  imageAssetQuota: {
    usedBytes: number;
    limitBytes: number;
    remainingBytes: number;
    reservedGenerationBytes: number;
  };
  imageAssetStorageLimitReached: boolean;
  coverImageLimitReached: boolean;
  coverImageCandidates: CoverImageCandidateLike[];
  onSelectCoverCandidate: (candidateId: number) => void | Promise<void>;
  selectingCoverCandidateId: number | null;
  coverImage: CoverImageLike;
  imagePrompts: ArticleImagePromptLike[];
};

export function VisualEngineRail({
  visualSuggestion,
  nodeVisualSuggestions,
  onSaveImagePromptAssets,
  savingImagePrompts,
  onGenerateInlineImages,
  generatingInlineImages,
  onInsertVisualAssets,
  insertingVisualAssets,
  onGenerateCoverImage,
  coverImageButtonDisabled,
  coverImageButtonVariant,
  coverImageButtonMuted,
  coverImageButtonLabel,
  canUseCoverImageReference,
  onCoverReferenceFileChange,
  coverImageReferenceDataUrl,
  canGenerateCoverImage,
  coverImageQuota,
  imageAssetQuota,
  imageAssetStorageLimitReached,
  coverImageLimitReached,
  coverImageCandidates,
  onSelectCoverCandidate,
  selectingCoverCandidateId,
  coverImage,
  imagePrompts,
}: VisualEngineRailProps) {
  return (
    <div className="hidden border border-dashed border-lineStrong bg-surfaceWarm p-5 md:block">
      <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">视觉联想引擎</div>
      <div className="mt-3 text-sm leading-7 text-inkSoft">{visualSuggestion}</div>
      {nodeVisualSuggestions.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">段落配图建议</div>
            <Button
              onClick={() => void onSaveImagePromptAssets()}
              disabled={savingImagePrompts}
              variant="secondary"
              size="sm"
            >
              {savingImagePrompts ? "规划中…" : "规划 brief"}
            </Button>
          </div>
          {nodeVisualSuggestions.map((item) => (
            <div key={item.id} className="border border-lineStrong bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.title}</div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{item.prompt}</div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button
          onClick={() => void onGenerateCoverImage()}
          disabled={coverImageButtonDisabled}
          variant={coverImageButtonVariant}
          className={coverImageButtonMuted ? "text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-inkMuted" : ""}
        >
          {coverImageButtonLabel}
        </Button>
        <Button
          onClick={() => void onGenerateInlineImages()}
          disabled={generatingInlineImages || imageAssetStorageLimitReached}
          variant="secondary"
        >
          {generatingInlineImages ? "生成中…" : "生成文中图"}
        </Button>
        <Button
          onClick={() => void onInsertVisualAssets()}
          disabled={insertingVisualAssets}
          variant="secondary"
        >
          {insertingVisualAssets ? "插入中…" : "插入终稿"}
        </Button>
      </div>
      {canUseCoverImageReference ? (
        <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">参考图垫图</div>
          <input
            aria-label="input control"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onCoverReferenceFileChange}
            className="mt-3 w-full text-sm"
          />
          <div className="mt-2 text-xs leading-6 text-inkMuted">藏锋套餐可上传参考图，封面生成会尽量继承主体、构图或风格线索。</div>
          {coverImageReferenceDataUrl ? (
            <img src={coverImageReferenceDataUrl} alt="封面图参考图" width={800} height={450} className="mt-3 aspect-[16/9] w-full border border-lineStrong object-cover" />
          ) : null}
        </div>
      ) : canGenerateCoverImage ? (
        <div className="mt-3 text-xs leading-6 text-inkMuted">参考图垫图仅藏锋可用，当前套餐仍可直接按标题生成封面图。</div>
      ) : null}
      <div className="mt-3 text-xs leading-6 text-inkMuted">
        今日封面图
        {coverImageQuota.limit == null
          ? ` ${coverImageQuota.used} / 不限`
          : ` ${coverImageQuota.used} / ${coverImageQuota.limit}`}
        {!canGenerateCoverImage
          ? "，当前套餐只输出配图提示词。"
          : coverImageLimitReached
            ? "，今日额度已耗尽。"
            : imageAssetStorageLimitReached
              ? `，图片资产空间不足，当前已用 ${formatBytes(imageAssetQuota.usedBytes)} / ${formatBytes(imageAssetQuota.limitBytes)}。`
              : coverImageQuota.remaining != null
                ? `，还可生成 ${coverImageQuota.remaining} 次。`
                : "。"}
      </div>
      <div className="mt-1 text-xs leading-6 text-inkMuted">
        图片资产空间 {formatBytes(imageAssetQuota.usedBytes)} / {formatBytes(imageAssetQuota.limitBytes)}
        {imageAssetStorageLimitReached
          ? `，本次生成至少还需预留 ${formatBytes(imageAssetQuota.reservedGenerationBytes)}。`
          : `，当前还剩 ${formatBytes(imageAssetQuota.remainingBytes)}。`}
      </div>
      {coverImageCandidates.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">封面图候选</div>
          <div className="grid gap-3">
            {coverImageCandidates.map((candidate) => (
              <div key={candidate.id} className="border border-lineStrong bg-surface p-3">
                <img src={candidate.imageUrl} alt={candidate.variantLabel} width={800} height={450} className="aspect-[16/9] w-full border border-lineStrong object-cover" />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{candidate.variantLabel}</div>
                    <div className="mt-1 text-xs text-inkMuted">{candidate.isSelected ? "已入库" : "候选图"}</div>
                  </div>
                  <Button
                    onClick={() => void onSelectCoverCandidate(candidate.id)}
                    disabled={candidate.isSelected || selectingCoverCandidateId !== null}
                    variant={candidate.isSelected ? "secondary" : "primary"}
                    size="sm"
                    className={candidate.isSelected ? "text-inkMuted hover:border-lineStrong hover:bg-surface hover:text-inkMuted" : ""}
                  >
                    {candidate.isSelected ? "已选择" : selectingCoverCandidateId === candidate.id ? "入库中…" : "选这张入库"}
                  </Button>
                </div>
                <div className="mt-3 border border-lineStrong bg-paperStrong px-3 py-3 text-xs leading-6 text-inkMuted">
                  {candidate.prompt}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {coverImage ? (
        <div className="mt-4 space-y-3">
          <img src={coverImage.imageUrl} alt="AI 生成封面图" width={800} height={450} className="aspect-[16/9] w-full border border-lineStrong object-cover" />
          <div className="border border-lineStrong bg-surface px-4 py-3 text-xs leading-6 text-inkMuted">
            <div className="font-medium text-ink">最近一次封面图提示词</div>
            <div className="mt-2">{coverImage.prompt}</div>
            <div className="mt-2 text-inkMuted">{new Date(coverImage.createdAt).toLocaleString("zh-CN")}</div>
          </div>
        </div>
      ) : null}
      {imagePrompts.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.2em] text-inkMuted">已保存的文中配图视觉 brief</div>
            <Button onClick={() => void onGenerateInlineImages()} disabled={generatingInlineImages} variant="secondary" size="sm">
              {generatingInlineImages ? "生成中…" : "批量生成"}
            </Button>
          </div>
          {imagePrompts.map((item) => (
            <div key={item.id} className="border border-lineStrong bg-surface px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
                {item.title} · {item.assetType || "inline"} · {item.status || "prompt_ready"}
              </div>
              <div className="mt-2 text-sm leading-7 text-inkSoft">{item.prompt}</div>
              <div className="mt-2 text-xs text-inkMuted">{new Date(item.updatedAt).toLocaleString("zh-CN")}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
