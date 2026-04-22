import type { Dispatch, SetStateAction } from "react";
import { getArticleEvidenceStats } from "@/lib/article-evidence";
import {
  buildEvidenceItemSignature,
  parseResponseMessage,
  type EvidenceItem,
} from "./article-workspace-client-data";
import type { WorkspacePublishPreviewState } from "./types";
import type { ImaEvidenceSelection } from "../ima-evidence-search-drawer";

type PersistEvidenceItemsOptions = {
  successMessage?: string;
  incompleteMessage?: string;
};

type ArticleWorkspaceEvidenceActionsDeps = {
  articleId: number;
  maxEvidenceItems: number;
  evidenceDraftItems: EvidenceItem[];
  evidenceHasUnsavedChanges: boolean;
  savedEvidenceReady: boolean;
  setEvidenceDraftItems: Dispatch<SetStateAction<EvidenceItem[]>>;
  setEvidenceItems: Dispatch<SetStateAction<EvidenceItem[]>>;
  setSavingEvidenceItems: (value: boolean) => void;
  setTaggingEvidenceItems: (value: boolean) => void;
  setMessage: (message: string) => void;
  setPublishPreview: Dispatch<SetStateAction<WorkspacePublishPreviewState | null>>;
  refreshRouter: () => void;
};

function renumberEvidenceItems(items: EvidenceItem[]) {
  return items.map((item, index) => ({
    ...item,
    sortOrder: index + 1,
  }));
}

function buildEvidenceSavePayload(nextItems: EvidenceItem[]) {
  return {
    items: nextItems.map((item) => ({
      fragmentId: item.fragmentId,
      nodeId: item.nodeId,
      claim: item.claim,
      title: item.title,
      excerpt: item.excerpt,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      screenshotPath: item.screenshotPath,
      usageMode: item.usageMode,
      rationale: item.rationale,
      researchTag: item.researchTag,
      hookTags: item.hookTags,
      hookStrength: item.hookStrength,
      hookTaggedBy: item.hookTaggedBy,
      hookTaggedAt: item.hookTaggedAt,
      evidenceRole: item.evidenceRole,
    })),
  };
}

export function createArticleWorkspaceEvidenceActions({
  articleId,
  maxEvidenceItems,
  evidenceDraftItems,
  evidenceHasUnsavedChanges,
  savedEvidenceReady,
  setEvidenceDraftItems,
  setEvidenceItems,
  setSavingEvidenceItems,
  setTaggingEvidenceItems,
  setMessage,
  setPublishPreview,
  refreshRouter,
}: ArticleWorkspaceEvidenceActionsDeps) {
  function toggleEvidenceDraftItem(item: EvidenceItem) {
    const signature = buildEvidenceItemSignature(item);
    setEvidenceDraftItems((current) => {
      const exists = current.some((entry) => buildEvidenceItemSignature(entry) === signature);
      if (exists) {
        return renumberEvidenceItems(
          current.filter((entry) => buildEvidenceItemSignature(entry) !== signature),
        );
      }
      return [
        ...current,
        {
          ...item,
          id: item.id > 0 ? item.id : 0,
          sortOrder: current.length + 1,
        },
      ];
    });
  }

  function appendImaEvidenceItems(items: ImaEvidenceSelection[]) {
    let importedCount = 0;
    let skippedByLimit = 0;
    setEvidenceDraftItems((current) => {
      const knownSignatures = new Set(current.map(buildEvidenceItemSignature));
      const nextItems = [...current];
      const timestamp = new Date().toISOString();
      for (const item of items) {
        if (nextItems.length >= maxEvidenceItems) {
          skippedByLimit += 1;
          continue;
        }
        const draftItem: EvidenceItem = {
          id: 0,
          articleId,
          userId: 0,
          fragmentId: null,
          nodeId: null,
          claim: null,
          title: String(item.title || "").trim(),
          excerpt: String(item.excerpt || "").trim(),
          sourceType: "ima_kb",
          sourceUrl: item.sourceUrl ? String(item.sourceUrl).trim() : null,
          screenshotPath: null,
          usageMode: "reference",
          rationale: "IMA 知识库同赛道爆款",
          researchTag: null,
          hookTags: [],
          hookStrength: null,
          hookTaggedBy: null,
          hookTaggedAt: null,
          evidenceRole: "supportingEvidence",
          sortOrder: nextItems.length + 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        if (!draftItem.title || !draftItem.excerpt) {
          continue;
        }
        const signature = buildEvidenceItemSignature(draftItem);
        if (knownSignatures.has(signature)) {
          continue;
        }
        knownSignatures.add(signature);
        nextItems.push({
          ...draftItem,
          sortOrder: nextItems.length + 1,
        });
        importedCount += 1;
      }
      return nextItems;
    });
    if (importedCount > 0 && skippedByLimit > 0) {
      setMessage(`已从 IMA 导入 ${importedCount} 条证据草稿；证据包最多保留 ${maxEvidenceItems} 条，其余 ${skippedByLimit} 条未加入。`);
      return;
    }
    if (importedCount > 0) {
      setMessage(`已从 IMA 导入 ${importedCount} 条证据草稿。`);
      return;
    }
    setMessage(skippedByLimit > 0 ? `证据包最多保留 ${maxEvidenceItems} 条，请先清理后再继续导入。` : "选中的 IMA 结果已存在于当前证据草稿中。");
  }

  function updateEvidenceDraftItem(
    signature: string,
    updater: (item: EvidenceItem) => EvidenceItem,
  ) {
    setEvidenceDraftItems((current) =>
      current.map((item) =>
        buildEvidenceItemSignature(item) === signature
          ? updater(item)
          : item,
      ),
    );
  }

  function toggleEvidenceDraftHookTag(signature: string, tag: string) {
    updateEvidenceDraftItem(signature, (item) => {
      const currentTags = Array.isArray(item.hookTags) ? item.hookTags : [];
      const nextTags = currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag].slice(0, 4);
      return {
        ...item,
        hookTags: nextTags,
        hookTaggedBy: "author",
        hookTaggedAt: new Date().toISOString(),
      };
    });
  }

  function updateEvidenceDraftHookStrength(signature: string, value: string) {
    updateEvidenceDraftItem(signature, (item) => ({
      ...item,
      hookStrength: value.trim() ? Math.max(0, Math.min(5, Number(value) || 0)) : null,
      hookTaggedBy: "author",
      hookTaggedAt: new Date().toISOString(),
    }));
  }

  async function persistEvidenceItems(
    nextItems: EvidenceItem[],
    options?: PersistEvidenceItemsOptions,
  ) {
    setSavingEvidenceItems(true);
    setMessage("");
    try {
      const cappedItems = nextItems.slice(0, maxEvidenceItems);
      const truncatedCount = Math.max(nextItems.length - cappedItems.length, 0);
      const response = await fetch(`/api/articles/${articleId}/evidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildEvidenceSavePayload(cappedItems)),
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "证据包保存失败");
      }
      const savedItems = Array.isArray(json.data) ? (json.data as EvidenceItem[]) : [];
      setEvidenceItems(savedItems);
      setEvidenceDraftItems(savedItems);
      setPublishPreview(null);
      const nextStats = getArticleEvidenceStats(savedItems);
      const baseMessage = nextStats.ready
        ? options?.successMessage || "证据包已保存。"
        : options?.incompleteMessage || "证据包已保存，但还没达到发布标准。";
      setMessage(
        truncatedCount > 0
          ? `${baseMessage} 当前证据包最多保存 ${maxEvidenceItems} 条，已自动忽略末尾 ${truncatedCount} 条。`
          : baseMessage,
      );
      refreshRouter();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "证据包保存失败");
    } finally {
      setSavingEvidenceItems(false);
    }
  }

  async function applyResearchSuggestedEvidence() {
    setSavingEvidenceItems(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/evidence/apply-research`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "研究导向证据写回失败");
      }
      const savedItems = Array.isArray(json.data?.items) ? (json.data.items as EvidenceItem[]) : [];
      setEvidenceItems(savedItems);
      setEvidenceDraftItems(savedItems);
      setPublishPreview(null);
      const nextStats = getArticleEvidenceStats(savedItems);
      const appendedCount = Number(json.data?.appendedCount || 0);
      const counterEvidenceCount = Number(json.data?.counterEvidenceCount || 0);
      setMessage(
        nextStats.ready
          ? appendedCount > 0
            ? counterEvidenceCount > 0
              ? `已把 ${appendedCount} 条研究导向证据写回证据包，其中含 ${counterEvidenceCount} 条反证/反例。`
              : `已把 ${appendedCount} 条研究导向证据写回证据包。`
            : "已把当前研究导向证据写回证据包。"
          : appendedCount > 0
            ? counterEvidenceCount > 0
              ? `研究导向证据已写回证据包，其中含 ${counterEvidenceCount} 条反证/反例，但当前仍未达到发布标准。`
              : "研究导向证据已写回证据包，但当前仍未达到发布标准。"
            : "当前研究导向证据已写回证据包，但还没达到发布标准。",
      );
      refreshRouter();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "研究导向证据写回失败");
    } finally {
      setSavingEvidenceItems(false);
    }
  }

  async function autoTagEvidenceItems() {
    setTaggingEvidenceItems(true);
    setMessage("");
    try {
      if (evidenceDraftItems.length === 0) {
        throw new Error("当前还没有证据可标注。");
      }
      if (evidenceHasUnsavedChanges || !savedEvidenceReady) {
        await persistEvidenceItems(evidenceDraftItems, {
          successMessage: "证据包已保存，开始自动标注爆点。",
          incompleteMessage: "证据包已保存，开始自动标注爆点。",
        });
      }

      const response = await fetch(`/api/articles/${articleId}/evidence/tag`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseResponseMessage(response));
      }
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || "证据爆点自动标注失败");
      }
      const savedItems = Array.isArray(json.data?.items) ? (json.data.items as EvidenceItem[]) : [];
      const taggedCount = Number(json.data?.taggedCount || 0);
      setEvidenceItems(savedItems);
      setEvidenceDraftItems(savedItems);
      setPublishPreview(null);
      setMessage(taggedCount > 0 ? `已自动标注 ${taggedCount} 条证据的爆点标签。` : "已完成证据爆点自动标注。");
      refreshRouter();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "证据爆点自动标注失败");
    } finally {
      setTaggingEvidenceItems(false);
    }
  }

  return {
    toggleEvidenceDraftItem,
    appendImaEvidenceItems,
    updateEvidenceDraftItem,
    toggleEvidenceDraftHookTag,
    updateEvidenceDraftHookStrength,
    persistEvidenceItems,
    applyResearchSuggestedEvidence,
    autoTagEvidenceItems,
  };
}
