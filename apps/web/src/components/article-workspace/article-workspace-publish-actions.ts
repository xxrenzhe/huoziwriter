import type { Dispatch, FormEvent, SetStateAction } from "react";
import { PENDING_PUBLISH_INTENT_STORAGE_KEY, parseResponsePayload, type PendingPublishIntent } from "./article-workspace-client-data";
import type { WorkspacePublishPreviewState, WorkspaceView } from "./types";

export type RecentSyncLogItem = {
  id: number;
  articleId?: number;
  connectionName: string | null;
  mediaId: string | null;
  status: string;
  failureReason: string | null;
  failureCode: string | null;
  retryCount: number;
  articleVersionHash: string | null;
  templateId: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  requestSummary: string | Record<string, unknown> | null;
  responseSummary: string | Record<string, unknown> | null;
};

export type WechatConnectionItem = {
  id: number;
  accountName: string | null;
  originalId?: string | null;
  status: string;
  isDefault: boolean;
  accessTokenExpiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

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

type WechatConnectionDraftInput = {
  accountName: string;
  originalId: string;
  appId: string;
  appSecret: string;
  isDefault: boolean;
};

type ArticleWorkspacePublishActionsDeps = {
  articleId: number;
  title: string;
  markdown: string;
  wechatTemplateId: string | null;
  selectedConnectionId: string;
  wechatConnections: WechatConnectionItem[];
  selectedConnection: WechatConnectionItem | null;
  canShowWechatControls: boolean;
  displayPlanName: string;
  pendingPublishIntent: PendingPublishIntent | null;
  wechatConnectSubmitting: boolean;
  continuePublishAfterWechatConnect: boolean;
  wechatConnectAccountName: string;
  wechatConnectOriginalId: string;
  wechatConnectAppId: string;
  wechatConnectAppSecret: string;
  wechatConnectIsDefault: boolean;
  setLoadingPublishPreview: (value: boolean) => void;
  setMessage: (message: string) => void;
  setPublishPreview: Dispatch<SetStateAction<WorkspacePublishPreviewState | null>>;
  setHtmlPreview: (value: string) => void;
  setView: Dispatch<SetStateAction<WorkspaceView>>;
  setRefreshingPublishPreview: (value: boolean) => void;
  setShowWechatConnectModal: (value: boolean) => void;
  setContinuePublishAfterWechatConnect: (value: boolean) => void;
  setWechatConnectAccountName: (value: string) => void;
  setWechatConnectOriginalId: (value: string) => void;
  setWechatConnectAppId: (value: string) => void;
  setWechatConnectAppSecret: (value: string) => void;
  setWechatConnectIsDefault: (value: boolean) => void;
  setWechatConnectMessage: (value: string) => void;
  setPendingPublishIntent: Dispatch<SetStateAction<PendingPublishIntent | null>>;
  setWechatConnections: Dispatch<SetStateAction<WechatConnectionItem[]>>;
  setSyncLogs: Dispatch<SetStateAction<RecentSyncLogItem[]>>;
  setPublishing: (value: boolean) => void;
  setStatus: (value: string) => void;
  setRetryingPublish: (value: boolean) => void;
  setSelectedConnectionId: (value: string) => void;
  setWechatConnectSubmitting: (value: boolean) => void;
  saveArticleDraft: SaveArticleDraft;
  reloadArticleMeta: () => Promise<void>;
  refreshRouter: () => void;
  listWechatConnections: () => Promise<WechatConnectionItem[]>;
  listWechatSyncLogs: (articleId: number) => Promise<RecentSyncLogItem[]>;
  upsertWechatConnection: (input: WechatConnectionDraftInput) => Promise<unknown>;
};

export function createArticleWorkspacePublishActions({
  articleId,
  title,
  markdown,
  wechatTemplateId,
  selectedConnectionId,
  wechatConnections,
  selectedConnection,
  canShowWechatControls,
  displayPlanName,
  pendingPublishIntent,
  wechatConnectSubmitting,
  continuePublishAfterWechatConnect,
  wechatConnectAccountName,
  wechatConnectOriginalId,
  wechatConnectAppId,
  wechatConnectAppSecret,
  wechatConnectIsDefault,
  setLoadingPublishPreview,
  setMessage,
  setPublishPreview,
  setHtmlPreview,
  setView,
  setRefreshingPublishPreview,
  setShowWechatConnectModal,
  setContinuePublishAfterWechatConnect,
  setWechatConnectAccountName,
  setWechatConnectOriginalId,
  setWechatConnectAppId,
  setWechatConnectAppSecret,
  setWechatConnectIsDefault,
  setWechatConnectMessage,
  setPendingPublishIntent,
  setWechatConnections,
  setSyncLogs,
  setPublishing,
  setStatus,
  setRetryingPublish,
  setSelectedConnectionId,
  setWechatConnectSubmitting,
  saveArticleDraft,
  reloadArticleMeta,
  refreshRouter,
  listWechatConnections,
  listWechatSyncLogs,
  upsertWechatConnection,
}: ArticleWorkspacePublishActionsDeps) {
  function resetWechatConnectDraft() {
    setWechatConnectAccountName("");
    setWechatConnectOriginalId("");
    setWechatConnectAppId("");
    setWechatConnectAppSecret("");
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
  }

  function closeWechatConnectModal() {
    if (wechatConnectSubmitting) {
      return;
    }
    setShowWechatConnectModal(false);
    setContinuePublishAfterWechatConnect(false);
    resetWechatConnectDraft();
  }

  async function requestPublishPreview(options?: { silent?: boolean; setLoading?: boolean }) {
    if (options?.setLoading ?? true) {
      setLoadingPublishPreview(true);
    }
    if (!options?.silent) {
      setMessage("");
    }
    try {
      const response = await fetch(`/api/articles/${articleId}/publish-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          markdownContent: markdown,
          templateId: wechatTemplateId,
          wechatConnectionId: selectedConnectionId ? Number(selectedConnectionId) : null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "发布前预览生成失败");
      }
      return json.data as WorkspacePublishPreviewState;
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "发布前预览生成失败");
      }
      return null;
    } finally {
      if (options?.setLoading ?? true) {
        setLoadingPublishPreview(false);
      }
    }
  }

  async function loadPublishPreview() {
    const nextPreview = await requestPublishPreview();
    if (!nextPreview) {
      return;
    }
    setPublishPreview(nextPreview);
    setView("preview");
    setMessage(
      !nextPreview.publishGuard.canPublish
        ? `发布前检查未通过：${nextPreview.publishGuard.blockers[0] || "请先处理拦截项。"}`
        : nextPreview.isConsistentWithSavedHtml
          ? "发布前最终预览已更新，当前保存版与微信最终渲染一致。"
          : "发布前最终预览已更新。检测到保存版与最终发布效果存在差异，请先刷新。",
    );
  }

  async function refreshPublishPreviewRender() {
    setRefreshingPublishPreview(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (!nextPreview) {
        throw new Error("刷新最终发布效果失败");
      }
      setPublishPreview(nextPreview);
      setHtmlPreview(nextPreview.finalHtml || "");
      setView("preview");
      setMessage("已刷新为最终发布效果，当前 HTML 预览与微信发布渲染一致。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新最终发布效果失败");
    } finally {
      setRefreshingPublishPreview(false);
    }
  }

  async function persistPendingPublishIntent(
    intentOverride?: PendingPublishIntent,
    options?: { silent?: boolean },
  ) {
    const nextIntent = intentOverride ?? {
      articleId,
      createdAt: new Date().toISOString(),
      templateId: wechatTemplateId,
      reason: "missing_connection",
    } satisfies PendingPublishIntent;
    setPendingPublishIntent(nextIntent);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(nextIntent));
    }
    try {
      const response = await fetch(`/api/articles/${articleId}/publish-intent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextIntent),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "待恢复发布意图保存失败");
      }
      const serverIntent = json.data?.pendingPublishIntent as PendingPublishIntent | null | undefined;
      if (serverIntent) {
        setPendingPublishIntent(serverIntent);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(PENDING_PUBLISH_INTENT_STORAGE_KEY, JSON.stringify(serverIntent));
        }
      }
    } catch (error) {
      if (!options?.silent) {
        setMessage(error instanceof Error ? error.message : "待恢复发布意图保存失败");
      }
    }
    return nextIntent;
  }

  async function clearPendingPublishIntent() {
    setPendingPublishIntent(null);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_PUBLISH_INTENT_STORAGE_KEY);
    }
    try {
      await fetch(`/api/articles/${articleId}/publish-intent`, {
        method: "DELETE",
      });
    } catch {}
  }

  async function openWechatConnectModal(
    continuePublish = false,
    reason: PendingPublishIntent["reason"] = "missing_connection",
  ) {
    if (!canShowWechatControls) {
      setMessage(`${displayPlanName}暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (continuePublish) {
      await persistPendingPublishIntent(
        {
          articleId,
          createdAt: new Date().toISOString(),
          templateId: wechatTemplateId,
          reason,
        },
        { silent: true },
      );
    }
    setContinuePublishAfterWechatConnect(continuePublish);
    setWechatConnectIsDefault(wechatConnections.length === 0);
    setWechatConnectMessage("");
    setShowWechatConnectModal(true);
  }

  async function reloadWechatConnections() {
    const nextConnections = await listWechatConnections();
    setWechatConnections(nextConnections);
    return nextConnections;
  }

  async function reloadSyncLogs() {
    const nextLogs = await listWechatSyncLogs(articleId);
    setSyncLogs(nextLogs.slice(0, 3));
    return nextLogs;
  }

  async function continuePublishWithConnection(connectionId: number) {
    setPublishing(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return false;
      }
      const response = await fetch(`/api/articles/${articleId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wechatConnectionId: connectionId,
          templateId: wechatTemplateId,
        }),
      });
      if (!response.ok) {
        const payload = await parseResponsePayload(response);
        if (payload.data && typeof payload.data === "object" && "publishGuard" in payload.data) {
          const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
          if (nextPreview) {
            setPublishPreview(nextPreview);
            setView("preview");
          }
        }
        const errorCode = payload.data && typeof payload.data.code === "string" ? payload.data.code : "";
        if (errorCode === "auth_failed") {
          await persistPendingPublishIntent({
            articleId,
            createdAt: new Date().toISOString(),
            templateId: wechatTemplateId,
            reason: "auth_failed",
          }, { silent: true });
          setContinuePublishAfterWechatConnect(true);
          setWechatConnectAccountName(selectedConnection?.accountName || "");
          setWechatConnectOriginalId(selectedConnection?.originalId || "");
          setWechatConnectAppId("");
          setWechatConnectAppSecret("");
          setWechatConnectIsDefault(Boolean(selectedConnection?.isDefault) || wechatConnections.length === 0);
          setWechatConnectMessage("当前公众号凭证不可用。补录公众号 AppID / AppSecret 后，系统会自动继续本次发布。");
          setShowWechatConnectModal(true);
          setMessage("公众号凭证不可用，已保留待发布状态。补录凭证后会自动恢复发布。");
          return false;
        }
        throw new Error(payload.message);
      }
      const json = await response.json().catch(() => null);
      await clearPendingPublishIntent();
      setStatus("published");
      setView("preview");
      await reloadArticleMeta();
      await reloadSyncLogs();
      refreshRouter();
      setMessage(
        json?.success && json?.data?.mediaId
          ? `已推送到微信草稿箱，媒体 ID：${json.data.mediaId}。当前页已刷新为发布后的稿件状态。`
          : "已推送到微信草稿箱，当前页已刷新为发布后的稿件状态。",
      );
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "推送微信草稿箱失败");
      return false;
    } finally {
      setPublishing(false);
    }
  }

  async function publish() {
    if (!canShowWechatControls) {
      setMessage(`${displayPlanName}暂不支持微信草稿箱推送。升级到 Pro 或更高套餐后再发布。`);
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true, "missing_connection");
      setMessage("当前还没有可用公众号连接，已保留待发布状态。补录公众号 AppID / AppSecret 后会自动恢复发布。");
      return;
    }
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function resumePendingPublishIntent() {
    if (!pendingPublishIntent) {
      setMessage("当前没有待恢复的发布意图。");
      return;
    }
    if (!selectedConnectionId || wechatConnections.length === 0) {
      await openWechatConnectModal(true, pendingPublishIntent.reason);
      return;
    }
    setMessage("正在恢复上次中断的发布流程。");
    await continuePublishWithConnection(Number(selectedConnectionId));
  }

  async function retryLatestPublish() {
    if (!selectedConnectionId) {
      setMessage("请先选择一个公众号连接再重试。");
      return;
    }
    setRetryingPublish(true);
    setMessage("");
    try {
      const saved = await saveArticleDraft(undefined, undefined, false);
      if (!saved) {
        return;
      }
      const response = await fetch(`/api/articles/${articleId}/publish/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wechatConnectionId: Number(selectedConnectionId),
          templateId: wechatTemplateId,
        }),
      });
      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
        if (nextPreview) {
          setPublishPreview(nextPreview);
          setView("preview");
        }
        throw new Error(payload.message);
      }
      await clearPendingPublishIntent();
      await reloadArticleMeta();
      await reloadSyncLogs();
      const nextPreview = await requestPublishPreview({ silent: true, setLoading: false });
      if (nextPreview) {
        setPublishPreview(nextPreview);
      }
      setStatus("published");
      setView("preview");
      setMessage("已按最近失败上下文重新推送到微信草稿箱。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布重试失败");
    } finally {
      setRetryingPublish(false);
    }
  }

  async function submitWechatConnectionFromEditor(event: FormEvent) {
    event.preventDefault();
    setWechatConnectSubmitting(true);
    setWechatConnectMessage("");
    try {
      await upsertWechatConnection({
        accountName: wechatConnectAccountName,
        originalId: wechatConnectOriginalId,
        appId: wechatConnectAppId,
        appSecret: wechatConnectAppSecret,
        isDefault: wechatConnectIsDefault,
      });
      const nextConnections = await reloadWechatConnections();
      const preferredConnection =
        nextConnections.find((connection) => connection.isDefault)
        ?? nextConnections.find((connection) => connection.accountName === wechatConnectAccountName.trim())
        ?? nextConnections[0];
      if (!preferredConnection) {
        throw new Error("公众号连接已创建，但未能获取到连接信息");
      }
      setSelectedConnectionId(String(preferredConnection.id));
      setShowWechatConnectModal(false);
      resetWechatConnectDraft();
      if (continuePublishAfterWechatConnect) {
        setContinuePublishAfterWechatConnect(false);
        setMessage("公众号已连接，继续推送到微信草稿箱。");
        await continuePublishWithConnection(preferredConnection.id);
        return;
      }
      setMessage("公众号连接已创建，可直接继续发布。");
    } catch (error) {
      setWechatConnectMessage(error instanceof Error ? error.message : "公众号连接失败");
    } finally {
      setWechatConnectSubmitting(false);
    }
  }

  return {
    publish,
    requestPublishPreview,
    loadPublishPreview,
    refreshPublishPreviewRender,
    resetWechatConnectDraft,
    closeWechatConnectModal,
    persistPendingPublishIntent,
    clearPendingPublishIntent,
    openWechatConnectModal,
    resumePendingPublishIntent,
    reloadWechatConnections,
    reloadSyncLogs,
    continuePublishWithConnection,
    retryLatestPublish,
    submitWechatConnectionFromEditor,
  };
}
