"use client";

import { Button, Input, cn, surfaceCardStyles } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { formatPlanDisplayName } from "@/lib/plan-labels";

type ImaConnectionItem = {
  id: number;
  label: string;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  knowledgeBases: Array<{
    id: number;
    connectionId: number;
    kbId: string;
    kbName: string;
    description: string | null;
    contentCount: number | null;
    isEnabled: boolean;
    isDefault: boolean;
    lastSyncedAt: string | null;
  }>;
};

function refreshRouter(router: ReturnType<typeof useRouter>) {
  router.refresh();
}

function formatStatus(status: string) {
  if (status === "valid") return "可用";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

function statusBadgeClassName(status: string) {
  if (status === "valid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "invalid") return "border-danger/30 bg-surface text-danger";
  if (status === "disabled") return "border-lineStrong bg-surface text-inkMuted";
  return "border-lineStrong bg-surface text-inkMuted";
}

export function ImaConnectionsManager({
  connections,
  canManage,
  planName,
}: {
  connections: ImaConnectionItem[];
  canManage: boolean;
  planName: string;
}) {
  const router = useRouter();
  const displayPlanName = formatPlanDisplayName(planName);
  const [label, setLabel] = useState("");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [updatingKbId, setUpdatingKbId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持绑定 IMA 知识库。`);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/ima-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, clientId, apiKey }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "IMA 连接创建失败");
      }
      if (json.data?.status === "invalid") {
        setMessage(json.data?.error || "IMA 凭证校验失败，已保存为失效状态。");
      } else {
        setMessage("IMA 连接已创建，并已同步知识库列表。");
      }
      setLabel("");
      setClientId("");
      setApiKey("");
      setShowCreateModal(false);
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "IMA 连接创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshKnowledgeBases(connectionId: number) {
    setRefreshingId(connectionId);
    setMessage("");
    try {
      const response = await fetch(`/api/settings/ima-connections/${connectionId}/refresh-kbs`, {
        method: "POST",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "知识库刷新失败");
      }
      setMessage("知识库列表已刷新。");
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "知识库刷新失败");
    } finally {
      setRefreshingId(null);
    }
  }

  async function updateKnowledgeBase(connectionId: number, kbRowId: number, payload: { isEnabled?: boolean; isDefault?: boolean }) {
    setUpdatingKbId(kbRowId);
    setMessage("");
    try {
      const response = await fetch(`/api/settings/ima-connections/${connectionId}/kbs/${kbRowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "知识库更新失败");
      }
      setMessage(payload.isDefault ? "默认知识库已切换。" : "知识库状态已更新。");
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "知识库更新失败");
    } finally {
      setUpdatingKbId(null);
    }
  }

  async function handleDelete(connectionId: number) {
    if (!window.confirm("确定删除这个 IMA 连接吗？")) return;
    setDeletingId(connectionId);
    setMessage("");
    try {
      const response = await fetch(`/api/settings/ima-connections/${connectionId}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.error || "IMA 连接删除失败");
      }
      setMessage("IMA 连接已删除。");
      refreshRouter(router);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "IMA 连接删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {!canManage ? (
        <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          {displayPlanName}当前不开放 IMA 知识库绑定。升级到 Pro 或更高套餐后，才可配置个人智库信源。
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="border border-lineStrong/40 bg-paperStrong p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">接入说明</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
            <div>先到 `https://ima.qq.com/agent-interface` 获取 Client ID 和 API Key，再在这里录入。</div>
            <div>系统只保存加密后的凭证；前端只会看到标签、状态和知识库列表，不回传明文。</div>
            <div>默认知识库会被 Warroom 裂变和证据检索优先使用。</div>
          </div>
        </div>
        <div className="border border-lineStrong/40 bg-surface p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前概览</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
            <div>已绑定连接：{connections.length}</div>
            <div>可用连接：{connections.filter((item) => item.status === "valid").length}</div>
            <div>启用知识库：{connections.flatMap((item) => item.knowledgeBases).filter((item) => item.isEnabled).length}</div>
            <div>默认知识库：{connections.flatMap((item) => item.knowledgeBases).find((item) => item.isDefault)?.kbName || "未设置"}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-lineStrong/40 bg-surface p-5 shadow-ink">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">新增 IMA 连接</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">
            通过弹层录入标签、Client ID 和 API Key；校验失败也会保留失效连接，便于后续刷新或删除。
          </div>
        </div>
        <Button type="button" disabled={!canManage} variant="primary" onClick={() => setShowCreateModal(true)}>
          {canManage ? "添加 IMA 连接" : "当前套餐不可绑定 IMA"}
        </Button>
      </div>

      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}

      <div className="space-y-4">
        {connections.map((connection) => (
          <div key={connection.id} className="space-y-4 border border-lineStrong/40 bg-surface p-5 shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-serifCn text-2xl text-ink text-balance">{connection.label}</div>
                  <span className={cn("border px-2 py-1 text-[11px] uppercase tracking-[0.16em]", statusBadgeClassName(connection.status))}>
                    {formatStatus(connection.status)}
                  </span>
                </div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  {connection.lastVerifiedAt ? `最近校验 ${new Date(connection.lastVerifiedAt).toLocaleString("zh-CN")}` : "尚未完成可用校验"}
                </div>
                {connection.lastError ? (
                  <div className="mt-1 text-xs leading-6 text-cinnabar">{connection.lastError}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void refreshKnowledgeBases(connection.id)}
                  disabled={refreshingId === connection.id}
                  variant="secondary"
                >
                  {refreshingId === connection.id ? "刷新中…" : "刷新 KB"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleDelete(connection.id)}
                  disabled={deletingId === connection.id}
                  variant="secondary"
                >
                  {deletingId === connection.id ? "删除中…" : "删除"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {connection.knowledgeBases.map((kb) => (
                <div key={kb.id} className={cn(surfaceCardStyles({ padding: "sm" }), "border-lineStrong bg-surfaceHighlight shadow-none")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{kb.kbName}</div>
                      <div className="mt-1 text-sm leading-6 text-inkSoft">
                        {kb.description || "暂无描述"}
                      </div>
                      <div className="mt-1 text-xs text-inkMuted">
                        KB ID：{kb.kbId}
                        {kb.contentCount != null ? ` · 规模 ${kb.contentCount}` : ""}
                        {kb.isDefault ? " · 默认库" : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 border border-lineStrong px-3 py-2 text-xs text-inkSoft">
                        <input
                          type="checkbox"
                          checked={kb.isEnabled}
                          onChange={(event) => void updateKnowledgeBase(kb.connectionId, kb.id, { isEnabled: event.target.checked })}
                          disabled={updatingKbId === kb.id}
                        />
                        启用
                      </label>
                      {!kb.isDefault ? (
                        <Button
                          type="button"
                          onClick={() => void updateKnowledgeBase(kb.connectionId, kb.id, { isDefault: true })}
                          disabled={!kb.isEnabled || updatingKbId === kb.id}
                          variant="secondary"
                        >
                          设为默认
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
              {connection.knowledgeBases.length === 0 ? (
                <div className="border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
                  这个连接还没有同步到任何知识库，先点击“刷新 KB”。
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
          <div role="dialog" aria-modal="true" className="w-full max-w-[560px] border border-lineStrong bg-paper p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">IMA Connection</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">添加 IMA 连接</div>
                <div className="mt-2 text-sm leading-7 text-inkSoft">
                  保存后会立即校验凭证并同步知识库列表；如果 IMA 返回失败，也会保留失效态供你后续刷新或删除。
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={() => !loading && setShowCreateModal(false)}>
                关闭
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 grid gap-3">
              <Input aria-label="IMA 标签" value={label} disabled={!canManage || loading} onChange={(event) => setLabel(event.target.value)} placeholder="例如：我的 IMA" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
              <Input aria-label="IMA Client ID" value={clientId} disabled={!canManage || loading} onChange={(event) => setClientId(event.target.value)} placeholder="Client ID" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
              <Input aria-label="IMA API Key" value={apiKey} disabled={!canManage || loading} onChange={(event) => setApiKey(event.target.value)} placeholder="API Key" type="password" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={loading} onClick={() => setShowCreateModal(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={loading || !canManage} variant="primary">
                  {!canManage ? "当前套餐不可绑定 IMA" : loading ? "校验中…" : "保存并校验"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
