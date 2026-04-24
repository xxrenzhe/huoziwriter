import { useEffect, type MutableRefObject } from "react";
import { ARTICLE_MAIN_STEPS } from "./article-workspace-client-data";

type UseArticleWorkspaceLocalEffectsInput = {
  articleId: number;
  requestedMainStepCode: string | null;
  requestedMainStepHandledRef: MutableRefObject<string | null>;
  currentArticleMainStepCode: string;
  updateWorkflow: (stageCode: string, mode?: string, silent?: boolean) => Promise<void>;
  resolveRequestedMainStepAccess: (stepCode: string) => { disabled: boolean; reason: string | null };
  setMessage: (value: string) => void;
  generating: boolean;
  title: string;
  markdown: string;
  seriesId: number | null;
  wechatTemplateId: string | null;
  lastSavedRef: MutableRefObject<{
    title: string;
    markdown: string;
    status: string;
    seriesId: number | null;
    wechatTemplateId: string | null;
  }>;
  articleAutosaveDebounceMs: number;
  saveArticleDraft: (titleOverride?: string, markdownOverride?: string, silent?: boolean) => Promise<unknown>;
  setSaveState: (value: string) => void;
  setPublishPreview: (value: null) => void;
  pathname: string | null;
  currentSearchParams: string;
  replaceRoute: (href: string) => void;
};

export function useArticleWorkspaceLocalEffects({
  articleId,
  requestedMainStepCode,
  requestedMainStepHandledRef,
  currentArticleMainStepCode,
  updateWorkflow,
  resolveRequestedMainStepAccess,
  setMessage,
  generating,
  title,
  markdown,
  seriesId,
  wechatTemplateId,
  lastSavedRef,
  articleAutosaveDebounceMs,
  saveArticleDraft,
  setSaveState,
  setPublishPreview,
  pathname,
  currentSearchParams,
  replaceRoute,
}: UseArticleWorkspaceLocalEffectsInput) {
  useEffect(() => {
    if (generating) {
      return;
    }
    if (
      title === lastSavedRef.current.title
      && markdown === lastSavedRef.current.markdown
      && seriesId === lastSavedRef.current.seriesId
      && wechatTemplateId === lastSavedRef.current.wechatTemplateId
    ) {
      return;
    }

    setSaveState("自动保存中…");
    const timer = window.setTimeout(() => {
      void saveArticleDraft(undefined, undefined, true);
    }, articleAutosaveDebounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    articleAutosaveDebounceMs,
    generating,
    lastSavedRef,
    markdown,
    saveArticleDraft,
    seriesId,
    setSaveState,
    title,
    wechatTemplateId,
  ]);

  useEffect(() => {
    setPublishPreview(null);
  }, [markdown, setPublishPreview, title, wechatTemplateId]);

  useEffect(() => {
    if (!requestedMainStepCode) {
      return;
    }
    const requestKey = `${articleId}:${requestedMainStepCode}`;
    if (requestedMainStepHandledRef.current === requestKey) {
      return;
    }
    const targetStep = ARTICLE_MAIN_STEPS.find((step) => step.code === requestedMainStepCode);
    if (!targetStep) {
      requestedMainStepHandledRef.current = requestKey;
      return;
    }
    if (currentArticleMainStepCode === requestedMainStepCode) {
      requestedMainStepHandledRef.current = requestKey;
      return;
    }
    requestedMainStepHandledRef.current = requestKey;
    const access = resolveRequestedMainStepAccess(requestedMainStepCode);
    if (access.disabled) {
      setMessage(access.reason || "当前步骤暂时不可进入。");
      return;
    }
    void updateWorkflow(targetStep.primaryStageCode, "set", true);
    setMessage(`已切换到「${targetStep.title}」步骤。`);
  }, [
    articleId,
    currentArticleMainStepCode,
    requestedMainStepCode,
    requestedMainStepHandledRef,
    resolveRequestedMainStepAccess,
    setMessage,
    updateWorkflow,
  ]);

  useEffect(() => {
    if (!pathname) {
      return;
    }
    const nextParams = new URLSearchParams(currentSearchParams);
    if (nextParams.get("step") === currentArticleMainStepCode) {
      return;
    }
    nextParams.set("step", currentArticleMainStepCode);
    const nextQuery = nextParams.toString();
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const currentHref = currentSearchParams ? `${pathname}?${currentSearchParams}` : pathname;
    if (nextHref !== currentHref) {
      replaceRoute(nextHref);
    }
  }, [currentArticleMainStepCode, currentSearchParams, pathname, replaceRoute]);
}
