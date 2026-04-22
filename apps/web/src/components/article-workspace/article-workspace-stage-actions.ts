import {
  GENERATABLE_STAGE_ACTIONS,
} from "./authoring-phase";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  buildHighlightedKnowledgeCard,
  parseResponseMessage,
  reorderKnowledgeCards,
  upsertKnowledgeCard,
  upsertStageArtifact,
  type KnowledgeCardPanelItem,
  type OutlineMaterialNodeItem,
  type StageArtifactItem,
} from "./article-workspace-client-data";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import type { ArticleStatus } from "@/lib/domain";

type AudienceSelectionDraft = {
  selectedReaderLabel: string;
  selectedLanguageGuidance: string;
  selectedBackgroundAwareness: string;
  selectedReadabilityLevel: string;
  selectedCallToAction: string;
};

type OutlineSelectionDraft = {
  selectedTitle: string;
  selectedTitleStyle: string;
  selectedOpeningHook: string;
  selectedTargetEmotion: string;
  selectedEndingStrategy: string;
};

type FactCheckClaimDecision = {
  claim: string;
  action: string;
  note: string;
};

type StreamedStageApplyPayload = {
  id: number;
  markdownContent: string;
  htmlContent: string;
  status: string;
  title: string;
  command: string;
  stageCode: string;
  stageTitle: string;
  applyMode: "targeted" | "rewrite";
};

type ArticleWorkspaceStageActionsDeps = {
  articleId: number;
  title: string;
  seriesId: number | null;
  wechatTemplateId: string | null;
  currentStageArtifact: StageArtifactItem | null;
  audienceSelectionDraft: AudienceSelectionDraft;
  outlineSelectionDraft: OutlineSelectionDraft;
  factCheckSelectionDraft: { claimDecisions: FactCheckClaimDecision[] };
  setRefreshingKnowledgeId: (value: number | null) => void;
  setMessage: (value: string) => void;
  setKnowledgeCardItems: Dispatch<SetStateAction<KnowledgeCardPanelItem[]>>;
  setExpandedKnowledgeCardId: (value: number | null) => void;
  setHighlightedKnowledgeCardId: (value: number | null) => void;
  refreshKnowledgeCardAction: (
    cardId: number,
  ) => Promise<Partial<KnowledgeCardPanelItem> & { id: number; title: string }>;
  setGeneratingStageArtifactCode: (value: string | null) => void;
  setStageArtifacts: Dispatch<SetStateAction<StageArtifactItem[]>>;
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
  setApplyingStageArtifactCode: (value: string | null) => void;
  setTitle: (value: string) => void;
  setMarkdown: (value: string) => void;
  setHtmlPreview: (value: string) => void;
  setStatus: (value: ArticleStatus | "generating") => void;
  setView: (value: "workspace" | "edit" | "preview" | "audit") => void;
  lastSavedRef: MutableRefObject<{
    title: string;
    markdown: string;
    status: ArticleStatus;
    seriesId: number | null;
    wechatTemplateId: string | null;
  }>;
  setSaveState: (value: string) => void;
  updateWorkflow: (stageCode: string, action?: "set" | "complete" | "fail", silent?: boolean) => Promise<void>;
  reloadArticleMeta: () => Promise<void>;
  setSyncingOutlineArtifact: (value: boolean) => void;
  setNodes: Dispatch<SetStateAction<OutlineMaterialNodeItem[]>>;
  setSavingAudienceSelection: (value: boolean) => void;
};

export function createArticleWorkspaceStageActions({
  articleId,
  title,
  seriesId,
  wechatTemplateId,
  currentStageArtifact,
  audienceSelectionDraft,
  outlineSelectionDraft,
  factCheckSelectionDraft,
  setRefreshingKnowledgeId,
  setMessage,
  setKnowledgeCardItems,
  setExpandedKnowledgeCardId,
  setHighlightedKnowledgeCardId,
  refreshKnowledgeCardAction,
  setGeneratingStageArtifactCode,
  setStageArtifacts,
  saveArticleDraft,
  setApplyingStageArtifactCode,
  setTitle,
  setMarkdown,
  setHtmlPreview,
  setStatus,
  setView,
  lastSavedRef,
  setSaveState,
  updateWorkflow,
  reloadArticleMeta,
  setSyncingOutlineArtifact,
  setNodes,
  setSavingAudienceSelection,
}: ArticleWorkspaceStageActionsDeps) {
  async function applyStageArtifactByStream(stageCode: string, actionLabel: string) {
    setView("edit");
    setStatus("generating");
    setSaveState(`${actionLabel}流式应用中…`);
    const response = await fetch(`/api/articles/${articleId}/stages/${stageCode}/apply/stream`, {
      method: "POST",
    });
    if (!response.ok || !response.body) {
      throw new Error(await parseResponseMessage(response));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let finalPayload: StreamedStageApplyPayload | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event.split("\n").find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as {
          status: string;
          delta?: string;
          error?: string;
          data?: StreamedStageApplyPayload;
        };
        if (payload.status === "error") {
          throw new Error(payload.error || "应用阶段产物失败");
        }
        if (payload.status === "writing" && payload.delta) {
          assembled += payload.delta;
          setMarkdown(assembled);
        }
        if (payload.status === "done" && payload.data) {
          finalPayload = payload.data;
        }
      }
    }

    if (!finalPayload) {
      throw new Error("流式应用未返回最终结果");
    }

    return finalPayload;
  }

  async function refreshKnowledgeCard(cardId: number) {
    setRefreshingKnowledgeId(cardId);
    setMessage("");
    try {
      const detail = await refreshKnowledgeCardAction(cardId);
      setKnowledgeCardItems((current) =>
        reorderKnowledgeCards(
          upsertKnowledgeCard(
            current,
            buildHighlightedKnowledgeCard(detail, current.find((card) => card.id === cardId) ?? null),
          ),
          cardId,
        ),
      );
      setExpandedKnowledgeCardId(cardId);
      setHighlightedKnowledgeCardId(cardId);
      setMessage("背景卡已刷新");
    } catch {
      setMessage("背景卡刷新失败");
    } finally {
      setRefreshingKnowledgeId(null);
    }
  }

  async function prefetchStageArtifact(stageCode: string) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      return false;
    }
    setGeneratingStageArtifactCode(stageCode);
    try {
      const response = await fetch(`/api/articles/${articleId}/stages/${stageCode}`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        return false;
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      return true;
    } catch {
      return false;
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function applyStageArtifact(stageCode: string) {
    const action = GENERATABLE_STAGE_ACTIONS[stageCode];
    if (!action) {
      setMessage("当前步骤暂不支持把洞察卡应用到正文。");
      return;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setApplyingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const shouldStreamApply = ["deepWriting", "factCheck", "prosePolish"].includes(stageCode);
      const result = shouldStreamApply
        ? await applyStageArtifactByStream(stageCode, action.label)
        : await (async () => {
            const response = await fetch(`/api/articles/${articleId}/stages/${stageCode}/apply`, {
              method: "POST",
            });
            const json = await response.json();
            if (!response.ok || !json.success) {
              throw new Error(json.error || "应用阶段产物失败");
            }
            return json.data as StreamedStageApplyPayload;
          })();
      const appliedTitle = String(result.title || "").trim() || title;
      setTitle(appliedTitle);
      setMarkdown(result.markdownContent || "");
      setHtmlPreview(result.htmlContent || "");
      setStatus(normalizeArticleStatus(result.status));
      setView("edit");
      lastSavedRef.current = {
        title: appliedTitle,
        markdown: result.markdownContent || "",
        status: normalizeArticleStatus(result.status),
        seriesId,
        wechatTemplateId,
      };
      setSaveState("已应用到正文");
      if (stageCode === "factCheck") {
        await updateWorkflow("prosePolish", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入文笔润色。`);
      } else if (stageCode === "prosePolish") {
        await updateWorkflow("layout", "set", true);
        setMessage(`${action.label}已写回正文，已自动进入一键排版。`);
      } else {
        setMessage(`${action.label}已写回正文`);
      }
      await reloadArticleMeta();
    } catch (error) {
      setStatus(lastSavedRef.current.status);
      setMessage(error instanceof Error ? error.message : "应用阶段产物失败");
    } finally {
      setApplyingStageArtifactCode(null);
    }
  }

  async function syncOutlineArtifactToNodes() {
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return;
    }
    setSyncingOutlineArtifact(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/stages/outlinePlanning/sync-outline`, {
        method: "POST",
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "同步大纲树失败");
      }
      setNodes(json.data);
      await reloadArticleMeta();
      setMessage("大纲规划已同步到左侧大纲树");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步大纲树失败");
    } finally {
      setSyncingOutlineArtifact(false);
    }
  }

  async function saveAudienceSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "audienceAnalysis") {
      setMessage("当前没有可保存的受众确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/stages/audienceAnalysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedReaderLabel: audienceSelectionDraft.selectedReaderLabel || null,
              selectedLanguageGuidance: audienceSelectionDraft.selectedLanguageGuidance || null,
              selectedBackgroundAwareness: audienceSelectionDraft.selectedBackgroundAwareness || null,
              selectedReadabilityLevel: audienceSelectionDraft.selectedReadabilityLevel || null,
              selectedCallToAction: audienceSelectionDraft.selectedCallToAction.trim() || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存受众确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("outlinePlanning", "set", true);
      const prepared = await prefetchStageArtifact("outlinePlanning");
      setMessage(prepared ? "受众分析已确认，已自动进入大纲规划并生成首版大纲。" : "受众分析已确认，已自动进入大纲规划。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存受众确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function saveOutlineSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "outlinePlanning") {
      setMessage("当前没有可保存的大纲确认结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/stages/outlinePlanning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              selectedTitle: outlineSelectionDraft.selectedTitle || null,
              selectedTitleStyle: outlineSelectionDraft.selectedTitleStyle || null,
              selectedOpeningHook: outlineSelectionDraft.selectedOpeningHook || null,
              selectedTargetEmotion: outlineSelectionDraft.selectedTargetEmotion || null,
              selectedEndingStrategy: outlineSelectionDraft.selectedEndingStrategy || null,
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存大纲确认失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      const confirmedTitle = outlineSelectionDraft.selectedTitle.trim();
      if (confirmedTitle) {
        const saved = await saveArticleDraft(undefined, undefined, true, confirmedTitle);
        if (!saved) {
          throw new Error("大纲确认已保存，但同步稿件标题失败");
        }
      }
      await updateWorkflow("deepWriting", "set", true);
      const prepared = await prefetchStageArtifact("deepWriting");
      setMessage(prepared ? "大纲规划已确认，已自动进入深度写作并生成写作执行卡。" : "大纲规划已确认，已自动进入深度写作。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存大纲确认失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  async function saveFactCheckSelection() {
    if (!currentStageArtifact || currentStageArtifact.stageCode !== "factCheck") {
      setMessage("当前没有可保存的核查处置结果。");
      return;
    }
    setSavingAudienceSelection(true);
    setMessage("");
    try {
      const response = await fetch(`/api/articles/${articleId}/stages/factCheck`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payloadPatch: {
            selection: {
              claimDecisions: factCheckSelectionDraft.claimDecisions.map((item) => ({
                claim: item.claim,
                action: item.action,
                note: item.note.trim() || null,
              })),
            },
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "保存核查处置失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      await updateWorkflow("prosePolish", "set", true);
      const prepared = await prefetchStageArtifact("prosePolish");
      setMessage(prepared ? "事实核查处置已确认，已自动进入文笔润色并生成首版润色建议。" : "事实核查处置已确认，已自动进入文笔润色。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存核查处置失败");
    } finally {
      setSavingAudienceSelection(false);
    }
  }

  return {
    refreshKnowledgeCard,
    prefetchStageArtifact,
    applyStageArtifact,
    syncOutlineArtifactToNodes,
    saveAudienceSelection,
    saveOutlineSelection,
    saveFactCheckSelection,
  };
}
