import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ReviewSeriesPlaybook } from "@/lib/article-outcomes";
import {
  buildFactCheckFetchIssuesStorageKey,
  parseResponsePayload,
  readExternalFetchIssues,
  readPendingPublishIntent,
  type ArticleFragmentItem,
  type ExternalFetchIssueRecord,
  type KnowledgeCardPanelItem,
  type OutlineMaterialNodeItem,
  type PendingPublishIntent,
  type StageArtifactItem,
} from "./article-workspace-client-data";
import {
  hydrateAudienceSelectionDraft,
  hydrateOutlineSelectionDraft,
  type AudienceSelectionDraft,
  type FactCheckSelectionDraft,
  type OutlineSelectionDraft,
} from "./stage-selection-drafts";
import type { WechatConnectionItem } from "./article-workspace-publish-actions";

type OutlineMaterialsState = {
  supplementalViewpoints: string[];
  nodes: OutlineMaterialNodeItem[];
};

type ArticleOutcomeInput = {
  targetPackage?: string | null;
  hitStatus?: "pending" | "hit" | "near_miss" | "miss";
  reviewSummary?: string | null;
  nextAction?: string | null;
  playbookTags?: string[];
} | null;

type OutcomeSnapshotInput = {
  readCount: number;
  shareCount: number;
  likeCount: number;
  notes: string | null;
} | null;

type ArticleOutcomeBundleInput = {
  outcome: ArticleOutcomeInput;
  snapshots: Array<Record<string, unknown>>;
  completedWindowCodes: Array<"24h" | "72h" | "7d">;
  missingWindowCodes: Array<"24h" | "72h" | "7d">;
  nextWindowCode: "24h" | "72h" | "7d" | null;
};

type UseArticleWorkspaceSyncEffectsInput = {
  articleId: number;
  articleSeriesId: number | null;
  currentSeriesPlaybook: ReviewSeriesPlaybook | null;
  seriesId: number | null;
  initialNodes: OutlineMaterialNodeItem[];
  initialFragments: ArticleFragmentItem[];
  initialConnections: WechatConnectionItem[];
  initialCoverImageCandidates: Array<{
    id: number;
    variantLabel: string;
    imageUrl: string;
    prompt: string;
    isSelected: boolean;
    createdAt: string;
  }>;
  initialImagePrompts: Array<{
    id: number;
    articleNodeId: number | null;
    assetType: string;
    title: string;
    prompt: string;
    createdAt: string;
    updatedAt: string;
  }>;
  initialStageArtifacts: StageArtifactItem[];
  initialOutcomeBundle: ArticleOutcomeBundleInput;
  initialWorkflowPendingPublishIntent: PendingPublishIntent | null | undefined;
  knowledgeCards: KnowledgeCardPanelItem[];
  currentArticleOutcome: ArticleOutcomeInput;
  currentOutcomeSnapshot: OutcomeSnapshotInput;
  currentStageCode: string | null | undefined;
  currentStageArtifactPayload: Record<string, unknown> | null | undefined;
  currentAudienceSelection: AudienceSelectionDraft;
  currentOutlineSelection: OutlineSelectionDraft;
  currentFactCheckSelection: FactCheckSelectionDraft;
  outlineMaterials: OutlineMaterialsState | null;
  loadingOutlineMaterials: boolean;
  canUseHistoryReferences: boolean;
  loadingHistoryReferences: boolean;
  historyReferenceSuggestionsLength: number;
  selectedHistoryReferencesLength: number;
  wechatConnections: WechatConnectionItem[];
  persistPendingPublishIntent: (intent: PendingPublishIntent, options?: { silent?: boolean }) => Promise<unknown>;
  loadOutlineMaterials: () => Promise<void>;
  loadHistoryReferences: () => Promise<void>;
  setKnowledgeCardItems: Dispatch<SetStateAction<KnowledgeCardPanelItem[]>>;
  setExpandedKnowledgeCardId: Dispatch<SetStateAction<number | null>>;
  setFragmentPool: Dispatch<SetStateAction<ArticleFragmentItem[]>>;
  setWechatConnections: Dispatch<SetStateAction<WechatConnectionItem[]>>;
  setCoverImageCandidates: Dispatch<
    SetStateAction<
      Array<{
        id: number;
        variantLabel: string;
        imageUrl: string;
        prompt: string;
        isSelected: boolean;
        createdAt: string;
      }>
    >
  >;
  setImagePrompts: Dispatch<
    SetStateAction<
      Array<{
        id: number;
        articleNodeId: number | null;
        assetType: string;
        title: string;
        prompt: string;
        createdAt: string;
        updatedAt: string;
      }>
    >
  >;
  setStageArtifacts: Dispatch<SetStateAction<StageArtifactItem[]>>;
  setArticleOutcomeBundle: (value: ArticleOutcomeBundleInput) => void;
  setSelectedOutcomeWindowCode: Dispatch<SetStateAction<"24h" | "72h" | "7d">>;
  setOutcomeTargetPackage: Dispatch<SetStateAction<string>>;
  setOutcomeHitStatus: Dispatch<SetStateAction<"pending" | "hit" | "near_miss" | "miss">>;
  setOutcomeReviewSummary: Dispatch<SetStateAction<string>>;
  setOutcomeNextAction: Dispatch<SetStateAction<string>>;
  setOutcomePlaybookTagsInput: Dispatch<SetStateAction<string>>;
  setSeriesPlaybook: Dispatch<SetStateAction<ReviewSeriesPlaybook | null>>;
  setLoadingSeriesPlaybook: Dispatch<SetStateAction<boolean>>;
  setOutcomeReadCount: Dispatch<SetStateAction<string>>;
  setOutcomeShareCount: Dispatch<SetStateAction<string>>;
  setOutcomeLikeCount: Dispatch<SetStateAction<string>>;
  setOutcomeNotes: Dispatch<SetStateAction<string>>;
  setNodes: Dispatch<SetStateAction<OutlineMaterialNodeItem[]>>;
  setOutlineMaterials: Dispatch<SetStateAction<OutlineMaterialsState | null>>;
  setOutlineMaterialNodeId: Dispatch<SetStateAction<string>>;
  setPendingPublishIntent: Dispatch<SetStateAction<PendingPublishIntent | null>>;
  setRecentFactCheckEvidenceIssues: Dispatch<SetStateAction<ExternalFetchIssueRecord[]>>;
  setAudienceSelectionDraft: Dispatch<SetStateAction<AudienceSelectionDraft>>;
  setOutlineSelectionDraft: Dispatch<SetStateAction<OutlineSelectionDraft>>;
  setFactCheckSelectionDraft: Dispatch<SetStateAction<FactCheckSelectionDraft>>;
  setSelectedConnectionId: Dispatch<SetStateAction<string>>;
};

export function useArticleWorkspaceSyncEffects({
  articleId,
  articleSeriesId,
  currentSeriesPlaybook,
  seriesId,
  initialNodes,
  initialFragments,
  initialConnections,
  initialCoverImageCandidates,
  initialImagePrompts,
  initialStageArtifacts,
  initialOutcomeBundle,
  initialWorkflowPendingPublishIntent,
  knowledgeCards,
  currentArticleOutcome,
  currentOutcomeSnapshot,
  currentStageCode,
  currentStageArtifactPayload,
  currentAudienceSelection,
  currentOutlineSelection,
  currentFactCheckSelection,
  outlineMaterials,
  loadingOutlineMaterials,
  canUseHistoryReferences,
  loadingHistoryReferences,
  historyReferenceSuggestionsLength,
  selectedHistoryReferencesLength,
  wechatConnections,
  persistPendingPublishIntent,
  loadOutlineMaterials,
  loadHistoryReferences,
  setKnowledgeCardItems,
  setExpandedKnowledgeCardId,
  setFragmentPool,
  setWechatConnections,
  setCoverImageCandidates,
  setImagePrompts,
  setStageArtifacts,
  setArticleOutcomeBundle,
  setSelectedOutcomeWindowCode,
  setOutcomeTargetPackage,
  setOutcomeHitStatus,
  setOutcomeReviewSummary,
  setOutcomeNextAction,
  setOutcomePlaybookTagsInput,
  setSeriesPlaybook,
  setLoadingSeriesPlaybook,
  setOutcomeReadCount,
  setOutcomeShareCount,
  setOutcomeLikeCount,
  setOutcomeNotes,
  setNodes,
  setOutlineMaterials,
  setOutlineMaterialNodeId,
  setPendingPublishIntent,
  setRecentFactCheckEvidenceIssues,
  setAudienceSelectionDraft,
  setOutlineSelectionDraft,
  setFactCheckSelectionDraft,
  setSelectedConnectionId,
}: UseArticleWorkspaceSyncEffectsInput) {
  useEffect(() => {
    setKnowledgeCardItems(knowledgeCards);
    setExpandedKnowledgeCardId((current) => current ?? knowledgeCards[0]?.id ?? null);
  }, [knowledgeCards, setExpandedKnowledgeCardId, setKnowledgeCardItems]);

  useEffect(() => {
    setFragmentPool(initialFragments);
  }, [initialFragments, setFragmentPool]);

  useEffect(() => {
    setWechatConnections(initialConnections);
  }, [initialConnections, setWechatConnections]);

  useEffect(() => {
    setCoverImageCandidates(initialCoverImageCandidates);
  }, [initialCoverImageCandidates, setCoverImageCandidates]);

  useEffect(() => {
    setImagePrompts(initialImagePrompts);
  }, [initialImagePrompts, setImagePrompts]);

  useEffect(() => {
    setStageArtifacts(initialStageArtifacts);
  }, [initialStageArtifacts, setStageArtifacts]);

  useEffect(() => {
    setArticleOutcomeBundle(initialOutcomeBundle);
  }, [initialOutcomeBundle, setArticleOutcomeBundle]);

  useEffect(() => {
    setSelectedOutcomeWindowCode(initialOutcomeBundle.nextWindowCode ?? "24h");
  }, [initialOutcomeBundle, setSelectedOutcomeWindowCode]);

  useEffect(() => {
    setOutcomeTargetPackage(currentArticleOutcome?.targetPackage ?? "");
    setOutcomeHitStatus(currentArticleOutcome?.hitStatus ?? "pending");
    setOutcomeReviewSummary(currentArticleOutcome?.reviewSummary ?? "");
    setOutcomeNextAction(currentArticleOutcome?.nextAction ?? "");
    setOutcomePlaybookTagsInput(currentArticleOutcome?.playbookTags?.join("，") ?? "");
  }, [
    currentArticleOutcome,
    setOutcomeHitStatus,
    setOutcomeNextAction,
    setOutcomePlaybookTagsInput,
    setOutcomeReviewSummary,
    setOutcomeTargetPackage,
  ]);

  useEffect(() => {
    setSeriesPlaybook(currentSeriesPlaybook);
  }, [currentSeriesPlaybook, setSeriesPlaybook]);

  useEffect(() => {
    if (!seriesId) {
      setSeriesPlaybook(null);
      setLoadingSeriesPlaybook(false);
      return;
    }
    if (seriesId === articleSeriesId) {
      setSeriesPlaybook(currentSeriesPlaybook);
      setLoadingSeriesPlaybook(false);
      return;
    }

    let cancelled = false;
    setLoadingSeriesPlaybook(true);
    void (async () => {
      try {
        const response = await fetch(`/api/playbooks?seriesId=${seriesId}`, { cache: "no-store" });
        const payload = await parseResponsePayload(response);
        if (cancelled) {
          return;
        }
        setLoadingSeriesPlaybook(false);
        if (!response.ok) {
          setSeriesPlaybook(null);
          return;
        }
        setSeriesPlaybook((payload.data ?? null) as ReviewSeriesPlaybook | null);
      } catch {
        if (cancelled) {
          return;
        }
        setLoadingSeriesPlaybook(false);
        setSeriesPlaybook(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    articleSeriesId,
    currentSeriesPlaybook,
    seriesId,
    setLoadingSeriesPlaybook,
    setSeriesPlaybook,
  ]);

  useEffect(() => {
    setOutcomeReadCount(String(currentOutcomeSnapshot?.readCount ?? 0));
    setOutcomeShareCount(String(currentOutcomeSnapshot?.shareCount ?? 0));
    setOutcomeLikeCount(String(currentOutcomeSnapshot?.likeCount ?? 0));
    setOutcomeNotes(currentOutcomeSnapshot?.notes ?? "");
  }, [
    currentOutcomeSnapshot,
    setOutcomeLikeCount,
    setOutcomeNotes,
    setOutcomeReadCount,
    setOutcomeShareCount,
  ]);

  useEffect(() => {
    setNodes(initialNodes);
    setOutlineMaterials((current) =>
      current
        ? {
            ...current,
            nodes: initialNodes,
          }
        : current,
    );
    setOutlineMaterialNodeId((current) => {
      if (current && initialNodes.some((node) => String(node.id) === current)) {
        return current;
      }
      return initialNodes[0]?.id ? String(initialNodes[0].id) : "";
    });
  }, [initialNodes, setNodes, setOutlineMaterialNodeId, setOutlineMaterials]);

  useEffect(() => {
    const fallbackIntent = readPendingPublishIntent(articleId);
    const nextIntent = initialWorkflowPendingPublishIntent ?? fallbackIntent;
    setPendingPublishIntent(nextIntent);
    if (!initialWorkflowPendingPublishIntent && fallbackIntent) {
      void persistPendingPublishIntent(fallbackIntent, { silent: true });
    }
  }, [
    articleId,
    initialWorkflowPendingPublishIntent,
    persistPendingPublishIntent,
    setPendingPublishIntent,
  ]);

  useEffect(() => {
    setRecentFactCheckEvidenceIssues(
      readExternalFetchIssues(
        buildFactCheckFetchIssuesStorageKey(articleId),
        "fact-check-evidence",
        articleId,
      ),
    );
  }, [articleId, setRecentFactCheckEvidenceIssues]);

  useEffect(() => {
    if (currentStageCode !== "audienceAnalysis") {
      return;
    }
    setAudienceSelectionDraft(
      hydrateAudienceSelectionDraft(currentStageArtifactPayload, currentAudienceSelection),
    );
  }, [
    currentAudienceSelection,
    currentStageArtifactPayload,
    currentStageCode,
    setAudienceSelectionDraft,
  ]);

  useEffect(() => {
    if (currentStageCode !== "outlinePlanning") {
      return;
    }
    setOutlineSelectionDraft(
      hydrateOutlineSelectionDraft(currentStageArtifactPayload, currentOutlineSelection),
    );
  }, [
    currentOutlineSelection,
    currentStageArtifactPayload,
    currentStageCode,
    setOutlineSelectionDraft,
  ]);

  useEffect(() => {
    if (currentStageCode !== "factCheck") {
      return;
    }
    setFactCheckSelectionDraft(currentFactCheckSelection);
  }, [currentFactCheckSelection, currentStageCode, setFactCheckSelectionDraft]);

  useEffect(() => {
    if (currentStageCode !== "outlinePlanning" || outlineMaterials || loadingOutlineMaterials) {
      return;
    }
    void loadOutlineMaterials();
  }, [
    currentStageCode,
    loadOutlineMaterials,
    loadingOutlineMaterials,
    outlineMaterials,
  ]);

  useEffect(() => {
    if (!canUseHistoryReferences || currentStageCode !== "deepWriting" || loadingHistoryReferences) {
      return;
    }
    if (historyReferenceSuggestionsLength > 0 || selectedHistoryReferencesLength > 0) {
      return;
    }
    void loadHistoryReferences();
  }, [
    canUseHistoryReferences,
    currentStageCode,
    historyReferenceSuggestionsLength,
    loadHistoryReferences,
    loadingHistoryReferences,
    selectedHistoryReferencesLength,
  ]);

  useEffect(() => {
    setSelectedConnectionId((current) => {
      if (current && wechatConnections.some((connection) => String(connection.id) === current)) {
        return current;
      }
      const preferred = wechatConnections.find((connection) => connection.isDefault) ?? wechatConnections[0];
      return preferred?.id ? String(preferred.id) : "";
    });
  }, [setSelectedConnectionId, wechatConnections]);
}
