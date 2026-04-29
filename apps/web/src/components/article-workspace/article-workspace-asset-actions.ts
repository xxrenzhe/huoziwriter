import type { Dispatch, SetStateAction } from "react";
import { parseResponseMessage } from "./article-workspace-client-data";
import type { WorkspacePublishPreviewState, WorkspaceView } from "./types";

type ArticleOutcomeItem = {
  id: number;
  articleId: number;
  userId: number;
  targetPackage: string | null;
  scorecard: Record<string, unknown>;
  attribution: Record<string, unknown> | null;
  hitStatus: "pending" | "hit" | "near_miss" | "miss";
  expressionFeedback: {
    likeMe: boolean;
    unlikeMe: boolean;
    tooHard: boolean;
    tooSoft: boolean;
    tooTutorial: boolean;
    tooCommentary: boolean;
  } | null;
  reviewSummary: string | null;
  nextAction: string | null;
  playbookTags: string[];
  createdAt: string;
  updatedAt: string;
} | null;

type ArticleOutcomeSnapshotItem = {
  id: number;
  outcomeId: number;
  articleId: number;
  userId: number;
  windowCode: "24h" | "72h" | "7d";
  readCount: number;
  shareCount: number;
  likeCount: number;
  notes: string | null;
  writingStateFeedback: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ArticleOutcomeBundleItem = {
  outcome: ArticleOutcomeItem;
  snapshots: ArticleOutcomeSnapshotItem[];
  completedWindowCodes: Array<"24h" | "72h" | "7d">;
  missingWindowCodes: Array<"24h" | "72h" | "7d">;
  nextWindowCode: "24h" | "72h" | "7d" | null;
};

type CoverImageCandidateItem = {
  id: number;
  variantLabel: string;
  imageUrl: string;
  prompt: string;
  isSelected: boolean;
  createdAt: string;
};

type AssetQuota = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  assetRecordCount: number;
  readyAssetRecordCount: number;
  uniqueObjectCount: number;
  reservedGenerationBytes: number;
};

type CoverQuota = { used: number; limit: number | null; remaining: number | null };

type CoverImageState = { imageUrl: string; prompt: string; createdAt: string } | null;

type RequestPublishPreview = (options?: {
  silent?: boolean;
  setLoading?: boolean;
}) => Promise<WorkspacePublishPreviewState | null>;

type SaveArticleDraft = (
  nextStatus?: string,
  nextMarkdown?: string,
  silent?: boolean,
  nextTitle?: string,
  options?: {
    usageSource?: string | null;
    usageToken?: string | null;
  },
) => Promise<boolean>;

type ArticleWorkspaceAssetActionsDeps = {
  articleId: number;
  articleTitle: string;
  canUseCoverImageReference: boolean;
  coverImageReferenceDataUrl: string | null;
  workflowCurrentStageCode: string;
  status: string;
  selectedOutcomeWindowCode: "24h" | "72h" | "7d";
  outcomeReadCount: string;
  outcomeShareCount: string;
  outcomeLikeCount: string;
  outcomeNotes: string;
  outcomeTargetPackage: string;
  outcomeHitStatus: "pending" | "hit" | "near_miss" | "miss";
  outcomeExpressionFeedback: NonNullable<ArticleOutcomeItem>["expressionFeedback"];
  outcomeReviewSummary: string;
  outcomeNextAction: string;
  outcomePlaybookTagsInput: string;
  outcomeWindows: Array<{ code: "24h" | "72h" | "7d"; label: string }>;
  title: string;
  selectedTemplate: { name: string } | null;
  setSavingOutcomeSnapshot: (value: boolean) => void;
  setMessage: (value: string) => void;
  setArticleOutcomeBundle: (value: ArticleOutcomeBundleItem) => void;
  setSelectedOutcomeWindowCode: (value: "24h" | "72h" | "7d") => void;
  refreshRouter: () => void;
  setGeneratingCover: (value: boolean) => void;
  setCoverImageCandidates: Dispatch<SetStateAction<CoverImageCandidateItem[]>>;
  setCoverImageQuota: (value: CoverQuota) => void;
  setImageAssetQuota: (value: AssetQuota) => void;
  setSelectingCoverCandidateId: (value: number | null) => void;
  setCoverImage: (value: CoverImageState) => void;
  setSavingImagePrompts: (value: boolean) => void;
  setGeneratingInlineImages: (value: boolean) => void;
  setInsertingVisualAssets: (value: boolean) => void;
  setImagePrompts: (value: Array<Record<string, unknown>>) => void;
  setApplyingLayout: (value: boolean) => void;
  updateWorkflow: (stageCode: string, action?: "set" | "complete" | "fail", silent?: boolean) => Promise<void>;
  saveArticleDraft: SaveArticleDraft;
  requestPublishPreview: RequestPublishPreview;
  setView: (value: WorkspaceView) => void;
  setPublishPreview: (value: WorkspacePublishPreviewState | null) => void;
  setHtmlPreview: (value: string) => void;
  reloadArticleMeta: () => Promise<void>;
  generateCoverImageAction: (input: {
    articleId: number;
    title: string;
    referenceImageDataUrl: string | null;
  }) => Promise<{
    candidates?: Array<{ id: number; variantLabel: string; imageUrl: string; prompt: string }>;
    createdAt?: string;
    quota?: CoverQuota;
    storageQuota?: AssetQuota;
  }>;
  selectCoverCandidateAction: (candidateId: number) => Promise<{
    imageUrl: string;
    prompt: string;
    createdAt?: string;
  }>;
};

export function createArticleWorkspaceAssetActions({
  articleId,
  articleTitle,
  canUseCoverImageReference,
  coverImageReferenceDataUrl,
  workflowCurrentStageCode,
  status,
  selectedOutcomeWindowCode,
  outcomeReadCount,
  outcomeShareCount,
  outcomeLikeCount,
  outcomeNotes,
  outcomeTargetPackage,
  outcomeHitStatus,
  outcomeExpressionFeedback,
  outcomeReviewSummary,
  outcomeNextAction,
  outcomePlaybookTagsInput,
  outcomeWindows,
  title,
  selectedTemplate,
  setSavingOutcomeSnapshot,
  setMessage,
  setArticleOutcomeBundle,
  setSelectedOutcomeWindowCode,
  refreshRouter,
  setGeneratingCover,
  setCoverImageCandidates,
  setCoverImageQuota,
  setImageAssetQuota,
  setSelectingCoverCandidateId,
  setCoverImage,
  setSavingImagePrompts,
  setGeneratingInlineImages,
  setInsertingVisualAssets,
  setImagePrompts,
  setApplyingLayout,
  updateWorkflow,
  saveArticleDraft,
  requestPublishPreview,
  setView,
  setPublishPreview,
  setHtmlPreview,
  reloadArticleMeta,
  generateCoverImageAction,
  selectCoverCandidateAction,
}: ArticleWorkspaceAssetActionsDeps) {
  async function saveOutcomeSnapshot() {
    if (status !== "published") {
      setMessage("请先完成发布，再录入结果回流。");
      return;
    }
    setSavingOutcomeSnapshot(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/outcomes/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          windowCode: selectedOutcomeWindowCode,
          readCount: Number(outcomeReadCount || 0),
          shareCount: Number(outcomeShareCount || 0),
          likeCount: Number(outcomeLikeCount || 0),
          notes: outcomeNotes,
          targetPackage: outcomeTargetPackage,
          hitStatus: outcomeHitStatus,
          expressionFeedback: outcomeExpressionFeedback,
          reviewSummary: outcomeReviewSummary,
          nextAction: outcomeNextAction,
          playbookTags: outcomePlaybookTagsInput
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "结果快照保存失败");
      }
      const bundle = json.data as ArticleOutcomeBundleItem;
      setArticleOutcomeBundle(bundle);
      if (bundle.nextWindowCode) {
        setSelectedOutcomeWindowCode(bundle.nextWindowCode);
      }
      setMessage(
        `已保存 ${outcomeWindows.find((item) => item.code === selectedOutcomeWindowCode)?.label || selectedOutcomeWindowCode} 结果快照。`,
      );
      refreshRouter();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "结果快照保存失败");
    } finally {
      setSavingOutcomeSnapshot(false);
    }
  }

  async function generateCoverImage() {
    await updateWorkflow("coverImage", "set");
    setGeneratingCover(true);
    setMessage("");
    try {
      const data = await generateCoverImageAction({
        articleId,
        title: title.trim() || articleTitle,
        referenceImageDataUrl: canUseCoverImageReference ? coverImageReferenceDataUrl : null,
      });
      setCoverImageCandidates(
        Array.isArray(data.candidates)
          ? data.candidates.map((item) => ({
              id: item.id,
              variantLabel: item.variantLabel,
              imageUrl: item.imageUrl,
              prompt: item.prompt,
              isSelected: false,
              createdAt: data.createdAt || new Date().toISOString(),
            }))
          : [],
      );
      if (data.quota) {
        setCoverImageQuota(data.quota);
      }
      if (data.storageQuota) {
        setImageAssetQuota(data.storageQuota);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "封面图生成失败");
    } finally {
      setGeneratingCover(false);
    }
  }

  async function selectCoverCandidate(candidateId: number) {
    setSelectingCoverCandidateId(candidateId);
    setMessage("");
    try {
      const data = await selectCoverCandidateAction(candidateId);
      setCoverImage({
        imageUrl: data.imageUrl,
        prompt: data.prompt,
        createdAt: data.createdAt || new Date().toISOString(),
      });
      setCoverImageCandidates((current) =>
        current.map((item) => ({
          ...item,
          isSelected: item.id === candidateId,
        })),
      );
      if (workflowCurrentStageCode === "coverImage") {
        await updateWorkflow("coverImage", "complete", true);
        setMessage("封面图已选入稿件资产，已自动进入一键排版。");
      } else {
        setMessage("封面图已选入稿件资产");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "选择封面图失败");
    } finally {
      setSelectingCoverCandidateId(null);
    }
  }

  async function saveImagePromptAssets() {
    setSavingImagePrompts(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/image-prompts`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存配图提示词失败");
      }
      setImagePrompts(json.data);
      setMessage("段落配图提示词已保存到稿件资产");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存配图提示词失败");
    } finally {
      setSavingImagePrompts(false);
    }
  }

  async function generateInlineImages() {
    setGeneratingInlineImages(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/visuals/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "inline", insert: false }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "文中配图生成失败");
      }
      const generatedCount = Array.isArray(json.data?.generated) ? json.data.generated.length : 0;
      const warningCount = Array.isArray(json.data?.warnings) ? json.data.warnings.length : 0;
      refreshRouter();
      setMessage(
        warningCount > 0
          ? `已生成 ${generatedCount} 张文中图，${warningCount} 个警告可在视觉资产中查看。`
          : `已生成 ${generatedCount} 张文中图。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "文中配图生成失败");
    } finally {
      setGeneratingInlineImages(false);
    }
  }

  async function insertVisualAssets() {
    setInsertingVisualAssets(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/visuals/insert`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "插入视觉资产失败");
      }
      const insertedCount = Array.isArray(json.data?.inserted) ? json.data.inserted.length : 0;
      await reloadArticleMeta();
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
        setHtmlPreview(nextPreview.finalHtml || "");
      }
      refreshRouter();
      setMessage(insertedCount > 0 ? `已插入 ${insertedCount} 张文中图并刷新排版预览。` : "没有需要插入的新文中图。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "插入视觉资产失败");
    } finally {
      setInsertingVisualAssets(false);
    }
  }

  async function applyLayoutTemplate() {
    setApplyingLayout(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      setView("preview");
      await updateWorkflow("layout", "complete", true);
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
        setHtmlPreview(nextPreview.finalHtml || "");
      }
      await reloadArticleMeta();
      setMessage(
        selectedTemplate
          ? `已应用模板「${selectedTemplate.name}」，并自动生成发布最终预览。`
          : "已应用默认排版样式，并自动生成发布最终预览。",
      );
    } finally {
      setApplyingLayout(false);
    }
  }

  return {
    saveOutcomeSnapshot,
    generateCoverImage,
    selectCoverCandidate,
    saveImagePromptAssets,
    generateInlineImages,
    insertVisualAssets,
    applyLayoutTemplate,
  };
}
