import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getPayloadRecordArray } from "@/lib/article-workspace-helpers";
import type { ArticleStatus } from "@/lib/domain";
import {
  GENERATABLE_STAGE_ACTIONS,
  getDefaultWorkspaceViewForStageCode,
} from "./authoring-phase";
import {
  parseResponseMessage,
  type StageArtifactItem,
  upsertStageArtifact,
} from "./article-workspace-client-data";
import type { WorkspaceView } from "./types";

type SaveArticleDraftOptions = {
  usageSource?: string | null;
  usageToken?: string | null;
};

type GenerateStageArtifactOptions = {
  articlePrototypeCode?: string | null;
  articlePrototypeLabel?: string | null;
  stateVariantCode?: string | null;
  stateVariantLabel?: string | null;
  creativeLensCode?: string | null;
  creativeLensLabel?: string | null;
  titleOptionsOnly?: boolean;
  openingOptionsOnly?: boolean;
};

type LastSavedDraftState = {
  title: string;
  markdown: string;
  status: ArticleStatus;
  seriesId: number | null;
  wechatTemplateId: string | null;
};

type ArticleWorkspaceDraftActionsDeps = {
  articleId: number;
  title: string;
  markdown: string;
  status: ArticleStatus | "generating";
  seriesId: number | null;
  seriesOptionsCount: number;
  wechatTemplateId: string | null;
  generateBlockedByResearch: boolean;
  generateBlockedMessage: string;
  deepWritingPrototypeOverride: string | null;
  deepWritingStateVariantOverride: string | null;
  deepWritingCreativeLensOverride: string | null;
  deepWritingArtifact: StageArtifactItem | null;
  workflowCurrentStageCode: string;
  lastSavedRef: MutableRefObject<LastSavedDraftState>;
  setSaveState: (value: string) => void;
  setMessage: (value: string) => void;
  setHtmlPreview: (value: string) => void;
  setTitle: (value: string) => void;
  setStatus: (value: ArticleStatus | "generating") => void;
  setSeriesId: (value: number | null) => void;
  setWechatTemplateId: (value: string | null) => void;
  setGenerating: (value: boolean) => void;
  setView: (value: WorkspaceView) => void;
  setMarkdown: (value: string) => void;
  setGeneratingStageArtifactCode: (value: string | null) => void;
  setStageArtifacts: Dispatch<SetStateAction<StageArtifactItem[]>>;
  updateWorkflow: (stageCode: string, action?: "set" | "complete" | "fail", silent?: boolean) => Promise<void>;
  reloadArticleMeta: () => Promise<void>;
};

export function createArticleWorkspaceDraftActions({
  articleId,
  title,
  markdown,
  status,
  seriesId,
  seriesOptionsCount,
  wechatTemplateId,
  generateBlockedByResearch,
  generateBlockedMessage,
  deepWritingPrototypeOverride,
  deepWritingStateVariantOverride,
  deepWritingCreativeLensOverride,
  deepWritingArtifact,
  workflowCurrentStageCode,
  lastSavedRef,
  setSaveState,
  setMessage,
  setHtmlPreview,
  setTitle,
  setStatus,
  setSeriesId,
  setWechatTemplateId,
  setGenerating,
  setView,
  setMarkdown,
  setGeneratingStageArtifactCode,
  setStageArtifacts,
  updateWorkflow,
  reloadArticleMeta,
}: ArticleWorkspaceDraftActionsDeps) {
  async function saveArticleDraft(
    nextStatus?: string,
    nextMarkdown?: string,
    silent = false,
    nextTitle?: string,
    options?: SaveArticleDraftOptions,
  ) {
    if (!seriesId) {
      setSaveState("待选择系列");
      if (!silent) {
        setMessage(
          seriesOptionsCount > 0
            ? "每篇稿件都必须绑定系列，请先选择一个系列。"
            : "请先去设置创建至少 1 个系列，再继续写稿。",
        );
      }
      return false;
    }
    const resolvedTitle = nextTitle ?? title;
    const response = await fetch(`/api/articles/${articleId}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resolvedTitle,
        markdownContent: nextMarkdown ?? markdown,
        status: nextStatus || status,
        seriesId,
        wechatTemplateId,
        usageSource: options?.usageSource ?? null,
        usageToken: options?.usageToken ?? null,
      }),
    });

    if (!response.ok) {
      const errorMessage = await parseResponseMessage(response);
      setSaveState("保存失败");
      setMessage(errorMessage);
      return false;
    }

    const json = await response.json();
    if (json.success) {
      const savedStatus = json.data.status as ArticleStatus;
      setHtmlPreview(json.data.htmlContent || "");
      setTitle(resolvedTitle);
      setStatus(savedStatus);
      setSeriesId(json.data.seriesId ?? null);
      setWechatTemplateId(json.data.wechatTemplateId ?? null);
      lastSavedRef.current = {
        title: resolvedTitle,
        markdown: nextMarkdown ?? markdown,
        status: savedStatus,
        seriesId: json.data.seriesId ?? null,
        wechatTemplateId: json.data.wechatTemplateId ?? null,
      };
      setSaveState(silent ? "已自动保存" : "已保存");
      if (!silent) {
        setMessage("");
      }
      return true;
    }

    setSaveState("保存失败");
    return false;
  }

  async function generateStageArtifact(
    stageCode: string,
    options?: GenerateStageArtifactOptions,
  ) {
    if (!GENERATABLE_STAGE_ACTIONS[stageCode]) {
      setMessage("当前步骤暂不支持生成结构化洞察卡。");
      return false;
    }
    const saved = await saveArticleDraft(undefined, undefined, true);
    if (!saved) {
      return false;
    }
    setGeneratingStageArtifactCode(stageCode);
    setMessage("");
    try {
      const requestBody =
        options?.articlePrototypeCode ||
        options?.stateVariantCode ||
        options?.creativeLensCode ||
        options?.titleOptionsOnly ||
        options?.openingOptionsOnly
          ? {
              ...(options?.articlePrototypeCode ? { articlePrototypeCode: options.articlePrototypeCode } : {}),
              ...(options?.stateVariantCode ? { stateVariantCode: options.stateVariantCode } : {}),
              ...(options?.creativeLensCode ? { creativeLensCode: options.creativeLensCode } : {}),
              ...(options?.titleOptionsOnly ? { titleOptionsOnly: true } : {}),
              ...(options?.openingOptionsOnly ? { openingOptionsOnly: true } : {}),
            }
          : null;
      const response = await fetch(`/api/articles/${articleId}/stages/${stageCode}`, {
        method: "POST",
        headers: requestBody ? { "Content-Type": "application/json" } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "阶段产物生成失败");
      }
      setStageArtifacts((current) => upsertStageArtifact(current, json.data));
      if (workflowCurrentStageCode === stageCode) {
        await updateWorkflow(stageCode, "complete", true);
      }
      setMessage(
        stageCode === "outlinePlanning" && options?.titleOptionsOnly
          ? "标题候选已重新优化，当前只刷新标题体检结果，不会改动大纲结构。"
          : stageCode === "outlinePlanning" && options?.openingOptionsOnly
            ? "开头候选已重新优化，当前只刷新开头三选一，不会改动大纲结构。"
          : stageCode === "deepWriting" && (options?.articlePrototypeCode || options?.stateVariantCode || options?.creativeLensCode)
            ? `${GENERATABLE_STAGE_ACTIONS[stageCode].label}已完成，当前按「${[
                options.articlePrototypeLabel || options.articlePrototypeCode || "",
                options.stateVariantLabel || options.stateVariantCode || "",
                options.creativeLensLabel || options.creativeLensCode || "",
              ].filter(Boolean).join(" / ")}」生成。`
            : `${GENERATABLE_STAGE_ACTIONS[stageCode].label}已完成`,
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "阶段产物生成失败");
      return false;
    } finally {
      setGeneratingStageArtifactCode(null);
    }
  }

  async function generate() {
    if (generateBlockedByResearch) {
      setMessage(generateBlockedMessage || "研究层信源覆盖仍不足，请先补研究简报。");
      return;
    }
    const requestedPrototypeCode = String(deepWritingPrototypeOverride || "").trim() || null;
    const requestedStateVariantCode = String(deepWritingStateVariantOverride || "").trim() || null;
    const requestedCreativeLensCode = String(deepWritingCreativeLensOverride || "").trim() || null;
    const currentPrototypeCode = String(deepWritingArtifact?.payload?.articlePrototype || "").trim() || null;
    const currentStateVariantCode = String(deepWritingArtifact?.payload?.stateVariantCode || "").trim() || null;
    const currentCreativeLensCode = String(deepWritingArtifact?.payload?.creativeLensCode || "").trim() || null;
    const pendingPrototypeOverride = Boolean(requestedPrototypeCode && requestedPrototypeCode !== currentPrototypeCode);
    const pendingStateVariantOverride = Boolean(requestedStateVariantCode && requestedStateVariantCode !== currentStateVariantCode);
    const pendingCreativeLensOverride = Boolean(requestedCreativeLensCode && requestedCreativeLensCode !== currentCreativeLensCode);
    if (pendingPrototypeOverride || pendingStateVariantOverride || pendingCreativeLensOverride) {
      const prototypeLabel =
        pendingPrototypeOverride
          ? String(
              getPayloadRecordArray(deepWritingArtifact?.payload, "prototypeOptions").find(
                (item) => String(item.code || "").trim() === requestedPrototypeCode,
              )?.label || requestedPrototypeCode,
            ).trim()
          : null;
      const stateVariantLabel =
        pendingStateVariantOverride
          ? String(
              getPayloadRecordArray(deepWritingArtifact?.payload, "stateOptions").find(
                (item) => String(item.code || "").trim() === requestedStateVariantCode,
              )?.label || requestedStateVariantCode,
            ).trim()
          : null;
      const creativeLensLabel =
        pendingCreativeLensOverride
          ? String(
              getPayloadRecordArray(deepWritingArtifact?.payload, "creativeLensOptions").find(
                (item) => String(item.code || "").trim() === requestedCreativeLensCode,
              )?.label || requestedCreativeLensCode,
            ).trim()
          : null;
      setMessage("检测到当前已切换文章原型、写作状态或创意镜头，但执行卡还没刷新。系统先重生写作执行卡，再开始正文生成。");
      const refreshed = await generateStageArtifact("deepWriting", {
        articlePrototypeCode: pendingPrototypeOverride ? requestedPrototypeCode : null,
        articlePrototypeLabel: prototypeLabel,
        stateVariantCode: pendingStateVariantOverride ? requestedStateVariantCode : null,
        stateVariantLabel,
        creativeLensCode: pendingCreativeLensOverride ? requestedCreativeLensCode : null,
        creativeLensLabel,
      });
      if (!refreshed) {
        return;
      }
    }
    await updateWorkflow("deepWriting", "set");
    setGenerating(true);
    setMessage("");
    setStatus("generating");
    setSaveState("流式生成中…");
    setView("edit");

    const response = await fetch(`/api/articles/${articleId}/generate/stream`);
    if (!response.ok || !response.body) {
      setGenerating(false);
      setStatus(lastSavedRef.current.status);
      setMessage(await parseResponseMessage(response));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assembled = "";
    let usageToken = "";
    setMarkdown("");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((item) => item.startsWith("data:"));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5).trim()) as {
          status: string;
          delta?: string;
          usageToken?: string | null;
        };
        if (typeof payload.usageToken === "string" && payload.usageToken.trim()) {
          usageToken = payload.usageToken.trim();
        }
        if (payload.status === "writing" && payload.delta) {
          assembled += payload.delta;
          setMarkdown(assembled);
        }
      }
    }

    const saved = await saveArticleDraft("ready", assembled, false, undefined, {
      usageSource: "article.generate.stream",
      usageToken,
    });
    setGenerating(false);
    if (saved) {
      await updateWorkflow("factCheck", "set");
      setMessage("生成完成");
      await reloadArticleMeta();
      if (workflowCurrentStageCode === "deepWriting") {
        setView(getDefaultWorkspaceViewForStageCode("factCheck"));
      }
    }
  }

  return {
    saveArticleDraft,
    generate,
    generateStageArtifact,
  };
}
