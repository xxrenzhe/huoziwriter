import type { Dispatch, SetStateAction } from "react";
import {
  buildFactCheckFetchIssuesStorageKey,
  buildHighlightedKnowledgeCard,
  markExternalFetchIssueRecovered,
  prependExternalFetchIssue,
  removeExternalFetchIssue,
  reorderKnowledgeCards,
  upsertKnowledgeCard,
  upsertStageArtifact,
  writeExternalFetchIssues,
  type ExternalFetchIssueRecord,
  type KnowledgeCardPanelItem,
  type StageArtifactItem,
} from "./article-workspace-client-data";

type HistoryReferenceSelectionItem = {
  referencedArticleId: number;
  title: string;
  relationReason: string | null;
  bridgeSentence: string | null;
  sortOrder?: number;
};

type HistoryReferenceSuggestionItem = HistoryReferenceSelectionItem & {
  score?: number;
  seriesLabel?: string | null;
  consistencyHint?: string | null;
};

type FactCheckEvidenceIssueState = {
  url: string;
  degradedReason: string;
  retryRecommended: boolean;
} | null;

type ArticleWorkspaceSupportActionsDeps = {
  articleId: number;
  articleTitle: string;
  title: string;
  canUseHistoryReferences: boolean;
  displayPlanName: string;
  loadingHistoryReferences: boolean;
  selectedHistoryReferences: HistoryReferenceSelectionItem[];
  factCheckEvidenceUrl: string;
  recentFactCheckEvidenceIssues: ExternalFetchIssueRecord[];
  setLoadingHistoryReferences: (value: boolean) => void;
  setHistoryReferenceSuggestions: Dispatch<SetStateAction<HistoryReferenceSuggestionItem[]>>;
  setSelectedHistoryReferences: Dispatch<SetStateAction<HistoryReferenceSelectionItem[]>>;
  setSavingHistoryReferences: (value: boolean) => void;
  setMessage: (value: string) => void;
  saveArticleDraft: (
    nextStatus?: string,
    nextMarkdown?: string,
    silent?: boolean,
    nextTitle?: string,
    options?: {
      usageSource?: string | null;
      usageToken?: string | null;
    },
  ) => Promise<boolean>;
  setAddingFactCheckEvidence: (value: boolean) => void;
  setFactCheckEvidenceUrl: (value: string) => void;
  setStageArtifacts: Dispatch<SetStateAction<StageArtifactItem[]>>;
  setKnowledgeCardItems: Dispatch<SetStateAction<KnowledgeCardPanelItem[]>>;
  setExpandedKnowledgeCardId: (value: number | null) => void;
  setHighlightedKnowledgeCardId: (value: number | null) => void;
  reloadArticleMeta: () => Promise<void>;
  setRecentFactCheckEvidenceIssues: Dispatch<SetStateAction<ExternalFetchIssueRecord[]>>;
  setFactCheckEvidenceIssue: (value: FactCheckEvidenceIssueState) => void;
  setDeepWritingOpeningPreviewLoadingKey: (value: string | null) => void;
  setDeepWritingOpeningPreviews: Dispatch<SetStateAction<Record<string, string>>>;
  setDeepWritingOpeningCheckLoading: (value: boolean) => void;
};

export function createArticleWorkspaceSupportActions({
  articleId,
  articleTitle,
  title,
  canUseHistoryReferences,
  displayPlanName,
  loadingHistoryReferences,
  selectedHistoryReferences,
  factCheckEvidenceUrl,
  recentFactCheckEvidenceIssues,
  setLoadingHistoryReferences,
  setHistoryReferenceSuggestions,
  setSelectedHistoryReferences,
  setSavingHistoryReferences,
  setMessage,
  saveArticleDraft,
  setAddingFactCheckEvidence,
  setFactCheckEvidenceUrl,
  setStageArtifacts,
  setKnowledgeCardItems,
  setExpandedKnowledgeCardId,
  setHighlightedKnowledgeCardId,
  reloadArticleMeta,
  setRecentFactCheckEvidenceIssues,
  setFactCheckEvidenceIssue,
  setDeepWritingOpeningPreviewLoadingKey,
  setDeepWritingOpeningPreviews,
  setDeepWritingOpeningCheckLoading,
}: ArticleWorkspaceSupportActionsDeps) {
  async function loadHistoryReferences(force = false) {
    if (!canUseHistoryReferences) {
      setMessage(`${displayPlanName}暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    if (!force && loadingHistoryReferences) {
      return;
    }
    setLoadingHistoryReferences(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/history-references/suggest`);
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章建议加载失败");
      }
      const suggestions = Array.isArray(json.data?.suggestions)
        ? (json.data.suggestions as HistoryReferenceSuggestionItem[])
        : [];
      const saved = Array.isArray(json.data?.saved)
        ? (json.data.saved as HistoryReferenceSelectionItem[])
        : [];
      setHistoryReferenceSuggestions(suggestions);
      setSelectedHistoryReferences(saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章建议加载失败");
    } finally {
      setLoadingHistoryReferences(false);
    }
  }

  function toggleHistoryReferenceSelection(item: HistoryReferenceSuggestionItem) {
    setSelectedHistoryReferences((current) => {
      const exists = current.some((reference) => reference.referencedArticleId === item.referencedArticleId);
      if (exists) {
        return current.filter((reference) => reference.referencedArticleId !== item.referencedArticleId);
      }
      if (current.length >= 2) {
        setMessage("历史文章自然引用最多保留 2 篇。");
        return current;
      }
      return [
        ...current,
        {
          referencedArticleId: item.referencedArticleId,
          title: item.title,
          relationReason: item.relationReason ?? null,
          bridgeSentence: item.bridgeSentence ?? null,
        },
      ];
    });
  }

  function updateHistoryReferenceField(
    referencedArticleId: number,
    field: "relationReason" | "bridgeSentence",
    value: string,
  ) {
    setSelectedHistoryReferences((current) =>
      current.map((item) =>
        item.referencedArticleId === referencedArticleId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

  async function saveHistoryReferenceSelection() {
    if (!canUseHistoryReferences) {
      setMessage(`${displayPlanName}暂不支持历史文章自然引用。升级到 Pro 或更高套餐后可启用。`);
      return;
    }
    setSavingHistoryReferences(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/history-references/selection`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          references: selectedHistoryReferences.slice(0, 2).map((item) => ({
            referencedArticleId: item.referencedArticleId,
            relationReason: item.relationReason?.trim() || null,
            bridgeSentence: item.bridgeSentence?.trim() || null,
          })),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "历史文章自然引用保存失败");
      }
      const saved = Array.isArray(json.data)
        ? (json.data as HistoryReferenceSelectionItem[])
        : [];
      setSelectedHistoryReferences(saved);
      setMessage(saved.length > 0 ? "历史文章自然引用已保存。" : "已清空历史文章自然引用。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "历史文章自然引用保存失败");
    } finally {
      setSavingHistoryReferences(false);
    }
  }

  async function addFactCheckEvidenceSource(urlOverride?: string) {
    const url = (urlOverride ?? factCheckEvidenceUrl).trim();
    if (!url) {
      setMessage("先输入要补证的文章链接。");
      return;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setAddingFactCheckEvidence(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/fact-check-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: `${title || articleTitle} 补证链接`,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "补证链接抓取失败");
      }
      setFactCheckEvidenceUrl("");
      if (json.data?.artifact) {
        setStageArtifacts((current) => upsertStageArtifact(current, json.data.artifact as StageArtifactItem));
      }
      const refreshedKnowledgeCards = Array.isArray(json.data?.knowledgeCards)
        ? (json.data.knowledgeCards as KnowledgeCardPanelItem[])
        : null;
      const refreshedKnowledgeCardId =
        typeof json.data?.compiledKnowledgeCard?.id === "number" ? json.data.compiledKnowledgeCard.id : null;
      const compiledKnowledgeCard = json.data?.compiledKnowledgeCard as
        | (Partial<KnowledgeCardPanelItem> & { id: number; title: string })
        | undefined;
      if (refreshedKnowledgeCards) {
        setKnowledgeCardItems((current) => {
          const cards =
            refreshedKnowledgeCardId && compiledKnowledgeCard
              ? upsertKnowledgeCard(
                  refreshedKnowledgeCards,
                  buildHighlightedKnowledgeCard(
                    compiledKnowledgeCard,
                    refreshedKnowledgeCards.find((card) => card.id === refreshedKnowledgeCardId) ??
                      current.find((card) => card.id === refreshedKnowledgeCardId) ??
                      null,
                  ),
                )
              : refreshedKnowledgeCards;
          return reorderKnowledgeCards(cards, refreshedKnowledgeCardId);
        });
      } else if (refreshedKnowledgeCardId && compiledKnowledgeCard) {
        setKnowledgeCardItems((current) =>
          reorderKnowledgeCards(
            upsertKnowledgeCard(
              current,
              buildHighlightedKnowledgeCard(
                compiledKnowledgeCard,
                current.find((card) => card.id === refreshedKnowledgeCardId) ?? null,
              ),
            ),
            refreshedKnowledgeCardId,
          ),
        );
      }
      if (refreshedKnowledgeCardId) {
        setExpandedKnowledgeCardId(refreshedKnowledgeCardId);
        setHighlightedKnowledgeCardId(refreshedKnowledgeCardId);
      }
      await reloadArticleMeta();
      if (json.data?.degradedReason) {
        const nextIssues = prependExternalFetchIssue(recentFactCheckEvidenceIssues, {
          articleId,
          context: "fact-check-evidence",
          title: `${title || articleTitle} 补证链接`,
          url,
          degradedReason: String(json.data.degradedReason),
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
        setRecentFactCheckEvidenceIssues(nextIssues);
        writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(articleId), nextIssues);
        setFactCheckEvidenceIssue({
          url,
          degradedReason: String(json.data.degradedReason),
          retryRecommended: Boolean(json.data?.retryRecommended),
        });
      } else {
        const recovered = markExternalFetchIssueRecovered(recentFactCheckEvidenceIssues, {
          context: "fact-check-evidence",
          url,
        });
        if (recovered.recovered) {
          setRecentFactCheckEvidenceIssues(recovered.issues);
          writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(articleId), recovered.issues);
        }
        setFactCheckEvidenceIssue(null);
      }
      setMessage(
        json.data?.degradedReason
          ? `补证链接已入稿并刷新相关背景卡，但抓取存在降级：${json.data.degradedReason}`
          : "补证链接已入稿，事实核查与相关背景卡已刷新。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "补证链接抓取失败");
    } finally {
      setAddingFactCheckEvidence(false);
    }
  }

  function dismissFactCheckEvidenceIssue(issueId: string) {
    const nextIssues = removeExternalFetchIssue(recentFactCheckEvidenceIssues, issueId);
    setRecentFactCheckEvidenceIssues(nextIssues);
    writeExternalFetchIssues(buildFactCheckFetchIssuesStorageKey(articleId), nextIssues);
  }

  async function requestDeepWritingOpeningPreview(options: {
    articlePrototypeCode?: string | null;
    stateVariantCode?: string | null;
  }) {
    const response = await fetch(`/api/articles/${articleId}/generate/opening-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articlePrototypeCode: options.articlePrototypeCode || undefined,
        stateVariantCode: options.stateVariantCode || undefined,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "候选开头预览生成失败");
    }
    return String(json.data?.previewMarkdown || "").trim();
  }

  async function loadDeepWritingOpeningPreview(options: {
    previewKey: string;
    articlePrototypeCode?: string | null;
    stateVariantCode?: string | null;
  }) {
    setDeepWritingOpeningPreviewLoadingKey(options.previewKey);
    try {
      const previewMarkdown = await requestDeepWritingOpeningPreview({
        articlePrototypeCode: options.articlePrototypeCode,
        stateVariantCode: options.stateVariantCode,
      });
      setDeepWritingOpeningPreviews((current) => ({
        ...current,
        [options.previewKey]: previewMarkdown,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "候选开头预览生成失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function sampleDeepWritingStateOpenings(input: {
    articlePrototypeCode?: string | null;
    states: Array<{ previewKey: string; stateVariantCode: string | null }>;
  }) {
    setDeepWritingOpeningPreviewLoadingKey("state-batch");
    try {
      const nextEntries: Array<[string, string]> = [];
      for (const item of input.states) {
        const previewMarkdown = await requestDeepWritingOpeningPreview({
          articlePrototypeCode: input.articlePrototypeCode,
          stateVariantCode: item.stateVariantCode,
        });
        nextEntries.push([item.previewKey, previewMarkdown]);
      }
      if (nextEntries.length > 0) {
        setDeepWritingOpeningPreviews((current) => ({
          ...current,
          ...Object.fromEntries(nextEntries),
        }));
        setMessage(`已生成 ${nextEntries.length} 个状态开头样稿，可直接横向比较。`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "多状态开头采样失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function sampleDeepWritingPrototypeOpenings(input: {
    stateVariantCode?: string | null;
    prototypes: Array<{ previewKey: string; articlePrototypeCode: string | null }>;
  }) {
    setDeepWritingOpeningPreviewLoadingKey("prototype-batch");
    try {
      const nextEntries: Array<[string, string]> = [];
      for (const item of input.prototypes) {
        const previewMarkdown = await requestDeepWritingOpeningPreview({
          articlePrototypeCode: item.articlePrototypeCode,
          stateVariantCode: input.stateVariantCode,
        });
        nextEntries.push([item.previewKey, previewMarkdown]);
      }
      if (nextEntries.length > 0) {
        setDeepWritingOpeningPreviews((current) => ({
          ...current,
          ...Object.fromEntries(nextEntries),
        }));
        setMessage(`已生成 ${nextEntries.length} 个原型开头样稿，可直接横向比较。`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "多原型开头采样失败");
    } finally {
      setDeepWritingOpeningPreviewLoadingKey(null);
    }
  }

  async function runDeepWritingOpeningCheck() {
    setDeepWritingOpeningCheckLoading(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, true);
      if (!saved) {
        return;
      }
      const response = await fetch(`/api/articles/${articleId}/opening-check`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "开头体检失败");
      }
      if (json.data?.artifact) {
        setStageArtifacts((current) => upsertStageArtifact(current, json.data.artifact as StageArtifactItem));
      }
      setMessage("开头体检已更新，可直接按建议改第一屏。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "开头体检失败");
    } finally {
      setDeepWritingOpeningCheckLoading(false);
    }
  }

  return {
    loadHistoryReferences,
    toggleHistoryReferenceSelection,
    updateHistoryReferenceField,
    saveHistoryReferenceSelection,
    addFactCheckEvidenceSource,
    dismissFactCheckEvidenceIssue,
    loadDeepWritingOpeningPreview,
    sampleDeepWritingStateOpenings,
    sampleDeepWritingPrototypeOpenings,
    runDeepWritingOpeningCheck,
  };
}
