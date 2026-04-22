import type { MutableRefObject, RefObject } from "react";
import type { ArticleStatus } from "@/lib/domain";
import {
  normalizeOutlineMaterialNode,
  parseResponseMessage,
  type OutlineMaterialNodeItem,
  type PendingPublishIntent,
  type StageArtifactItem,
  upsertStageArtifact,
} from "./article-workspace-client-data";

type SnapshotMeta = {
  id: number;
  snapshotNote: string | null;
  createdAt: string;
};

type DiffState = {
  snapshotId: number;
  snapshotNote: string | null;
  createdAt: string;
  summary: {
    added: number;
    removed: number;
    unchanged: number;
  };
  lines: Array<{ type: "added" | "removed" | "unchanged"; content: string }>;
} | null;

type OutlineMaterialsState = {
  supplementalViewpoints: string[];
  nodes: OutlineMaterialNodeItem[];
};

type WorkflowState = {
  currentStageCode: string;
  stages: Array<{ code: string; title: string; status: "pending" | "current" | "completed" | "failed" }>;
  pendingPublishIntent?: PendingPublishIntent | null;
  updatedAt: string;
};

type LastSavedDraftState = {
  title: string;
  markdown: string;
  status: ArticleStatus;
  seriesId: number | null;
  wechatTemplateId: string | null;
};

type SubmitOutlineMaterialAction =
  | "attachExisting"
  | "createManual"
  | "createUrl"
  | "createScreenshot";

type ArticleWorkspaceRuntimeActionsDeps = {
  articleId: number;
  title: string;
  loadingOutlineMaterials: boolean;
  supplementalViewpointsDraft: string[];
  outlineMaterialNodeId: string;
  outlineMaterialFragmentId: string;
  outlineMaterialUsageMode: "rewrite" | "image";
  outlineMaterialTitle: string;
  outlineMaterialContent: string;
  outlineMaterialUrl: string;
  outlineMaterialImageDataUrl: string | null;
  outlineMaterialScreenshotInputRef: RefObject<HTMLInputElement | null>;
  snapshotNote: string;
  setLoadingOutlineMaterials: (value: boolean) => void;
  setSavingOutlineMaterials: (value: boolean) => void;
  setMessage: (value: string) => void;
  setOutlineMaterials: React.Dispatch<React.SetStateAction<OutlineMaterialsState | null>>;
  setSupplementalViewpointsDraft: React.Dispatch<React.SetStateAction<string[]>>;
  setOutlineMaterialNodeId: React.Dispatch<React.SetStateAction<string>>;
  setStageArtifacts: React.Dispatch<React.SetStateAction<StageArtifactItem[]>>;
  setNodes: React.Dispatch<React.SetStateAction<OutlineMaterialNodeItem[]>>;
  setOutlineMaterialFragmentId: (value: string) => void;
  setOutlineMaterialTitle: (value: string) => void;
  setOutlineMaterialContent: (value: string) => void;
  setOutlineMaterialUrl: (value: string) => void;
  setOutlineMaterialImageDataUrl: (value: string | null) => void;
  setOutlineMaterialScreenshotFileName: (value: string) => void;
  setHtmlPreview: (value: string) => void;
  setStatus: (value: ArticleStatus | "generating") => void;
  setSeriesId: (value: number | null) => void;
  setWechatTemplateId: (value: string | null) => void;
  setSnapshots: React.Dispatch<React.SetStateAction<SnapshotMeta[]>>;
  setWorkflow: React.Dispatch<React.SetStateAction<WorkflowState>>;
  lastSavedRef: MutableRefObject<LastSavedDraftState>;
  saveArticleDraft: () => Promise<boolean>;
  refreshRouter: () => void;
  setSnapshotNote: (value: string) => void;
  setLoadingDiffId: (value: number | null) => void;
  setDiffState: (value: DiffState) => void;
};

export function createArticleWorkspaceRuntimeActions({
  articleId,
  title,
  loadingOutlineMaterials,
  supplementalViewpointsDraft,
  outlineMaterialNodeId,
  outlineMaterialFragmentId,
  outlineMaterialUsageMode,
  outlineMaterialTitle,
  outlineMaterialContent,
  outlineMaterialUrl,
  outlineMaterialImageDataUrl,
  outlineMaterialScreenshotInputRef,
  snapshotNote,
  setLoadingOutlineMaterials,
  setSavingOutlineMaterials,
  setMessage,
  setOutlineMaterials,
  setSupplementalViewpointsDraft,
  setOutlineMaterialNodeId,
  setStageArtifacts,
  setNodes,
  setOutlineMaterialFragmentId,
  setOutlineMaterialTitle,
  setOutlineMaterialContent,
  setOutlineMaterialUrl,
  setOutlineMaterialImageDataUrl,
  setOutlineMaterialScreenshotFileName,
  setHtmlPreview,
  setStatus,
  setSeriesId,
  setWechatTemplateId,
  setSnapshots,
  setWorkflow,
  lastSavedRef,
  saveArticleDraft,
  refreshRouter,
  setSnapshotNote,
  setLoadingDiffId,
  setDiffState,
}: ArticleWorkspaceRuntimeActionsDeps) {
  async function loadOutlineMaterials(force = false) {
    if (!force && loadingOutlineMaterials) {
      return;
    }
    setLoadingOutlineMaterials(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/outline-materials`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材加载失败");
      }
      const nextNodes: OutlineMaterialNodeItem[] = Array.isArray(json.data?.nodes)
        ? json.data.nodes.map(normalizeOutlineMaterialNode)
        : [];
      const nextViewpoints = Array.from(
        { length: 3 },
        (_, index) => String(json.data?.supplementalViewpoints?.[index] || "").trim(),
      );
      setOutlineMaterials({
        supplementalViewpoints: nextViewpoints.filter(Boolean),
        nodes: nextNodes,
      });
      setSupplementalViewpointsDraft(nextViewpoints);
      setOutlineMaterialNodeId((current) => {
        if (current && nextNodes.some((node) => String(node.id) === current)) {
          return current;
        }
        return nextNodes[0]?.id ? String(nextNodes[0].id) : "";
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材加载失败");
    } finally {
      setLoadingOutlineMaterials(false);
    }
  }

  async function saveSupplementalViewpoints() {
    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/outline-materials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplementalViewpoints: supplementalViewpointsDraft
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 3),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补充观点保存失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      setOutlineMaterials((current) =>
        current
          ? {
              ...current,
              supplementalViewpoints: supplementalViewpointsDraft
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 3),
            }
          : current,
      );
      setMessage("补充观点已保存到大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补充观点保存失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  async function reloadArticleMeta() {
    const [articleResponse, nodesResponse] = await Promise.all([
      fetch(`/api/articles/${articleId}/runtime`),
      fetch(`/api/articles/${articleId}/nodes`),
    ]);
    if (!articleResponse.ok || !nodesResponse.ok) {
      return;
    }
    const articleJson = await articleResponse.json();
    const nodesJson = await nodesResponse.json();
    if (!articleJson.success || !nodesJson.success) {
      return;
    }
    setHtmlPreview(articleJson.data.htmlContent || "");
    setStatus(articleJson.data.status as ArticleStatus);
    setSeriesId(articleJson.data.seriesId ?? null);
    setWechatTemplateId(articleJson.data.wechatTemplateId ?? null);
    setSnapshots(articleJson.data.snapshots);
    if (articleJson.data.workflow) {
      setWorkflow(articleJson.data.workflow);
    }
    if (Array.isArray(articleJson.data.stageArtifacts)) {
      setStageArtifacts(articleJson.data.stageArtifacts);
    }
    const nextNodes = nodesJson.data.map(normalizeOutlineMaterialNode);
    setNodes(nextNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: nextNodes,
          }
        : current,
    );
    lastSavedRef.current = {
      title: articleJson.data.title,
      markdown: articleJson.data.markdownContent,
      status: articleJson.data.status as ArticleStatus,
      seriesId: articleJson.data.seriesId ?? null,
      wechatTemplateId: articleJson.data.wechatTemplateId ?? null,
    };
  }

  async function submitOutlineMaterial(action: SubmitOutlineMaterialAction) {
    const nodeId = Number(outlineMaterialNodeId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      setMessage("先选择一个大纲节点。");
      return;
    }
    if (action === "attachExisting" && !outlineMaterialFragmentId) {
      setMessage("先选择要挂载的素材。");
      return;
    }
    if (action === "createManual" && !outlineMaterialContent.trim()) {
      setMessage("手动素材内容不能为空。");
      return;
    }
    if (action === "createUrl" && !outlineMaterialUrl.trim()) {
      setMessage("链接素材不能为空。");
      return;
    }
    if (action === "createScreenshot" && !outlineMaterialImageDataUrl) {
      setMessage("先上传一张截图。");
      return;
    }

    setSavingOutlineMaterials(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/outline-materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "attachExisting"
            ? {
                action,
                nodeId,
                fragmentId: Number(outlineMaterialFragmentId),
                usageMode: outlineMaterialUsageMode,
              }
            : action === "createManual"
              ? {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  content: outlineMaterialContent.trim(),
                  usageMode: "rewrite",
                }
              : {
                  action,
                  nodeId,
                  title: outlineMaterialTitle.trim() || null,
                  ...(action === "createUrl"
                    ? {
                        url: outlineMaterialUrl.trim(),
                        usageMode: "rewrite",
                      }
                    : {
                        imageDataUrl: outlineMaterialImageDataUrl,
                        note: outlineMaterialContent.trim(),
                      }),
                },
        ),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "大纲素材更新失败");
      }
      const nextNodes = Array.isArray(json.data)
        ? json.data.map(normalizeOutlineMaterialNode)
        : [];
      setNodes(nextNodes);
      setOutlineMaterials((current) => ({
        supplementalViewpoints: current?.supplementalViewpoints ?? [],
        nodes: nextNodes,
      }));
      setOutlineMaterialFragmentId("");
      setOutlineMaterialTitle("");
      setOutlineMaterialContent("");
      setOutlineMaterialUrl("");
      setOutlineMaterialImageDataUrl(null);
      setOutlineMaterialScreenshotFileName("");
      if (outlineMaterialScreenshotInputRef.current) {
        outlineMaterialScreenshotInputRef.current.value = "";
      }
      setMessage(action === "attachExisting" ? "素材已挂到大纲节点。" : "素材已创建并挂到大纲节点。");
      await reloadArticleMeta();
      refreshRouter();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "大纲素材更新失败");
    } finally {
      setSavingOutlineMaterials(false);
    }
  }

  async function createSnapshot() {
    const note = snapshotNote.trim() || "手动快照";
    const saved = await saveArticleDraft();
    if (!saved) {
      return;
    }
    const response = await fetch(`/api/articles/${articleId}/snapshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    setSnapshotNote("");
    setMessage("已创建快照");
    await reloadArticleMeta();
  }

  async function restoreSnapshot(snapshotId: number) {
    const response = await fetch(`/api/articles/${articleId}/snapshot/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId }),
    });
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    await reloadArticleMeta();
    refreshRouter();
  }

  async function loadDiff(snapshotId: number) {
    setLoadingDiffId(snapshotId);
    const response = await fetch(`/api/articles/${articleId}/diff?snapshotId=${snapshotId}`);
    setLoadingDiffId(null);
    if (!response.ok) {
      setMessage(await parseResponseMessage(response));
      return;
    }
    const json = await response.json();
    if (json.success) {
      setDiffState({
        snapshotId: json.data.snapshot.id,
        snapshotNote: json.data.snapshot.snapshotNote,
        createdAt: json.data.snapshot.createdAt,
        summary: json.data.summary,
        lines: json.data.lines,
      });
    }
  }

  return {
    loadOutlineMaterials,
    saveSupplementalViewpoints,
    submitOutlineMaterial,
    reloadArticleMeta,
    createSnapshot,
    restoreSnapshot,
    loadDiff,
  };
}
