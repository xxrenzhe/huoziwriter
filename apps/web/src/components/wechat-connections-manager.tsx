"use client";

import { disableWechatConnectionAction, upsertWechatConnectionAction } from "@/app/(writer)/writer-actions";
import { formatPlanDisplayName } from "@/lib/plan-labels";
import { Button, Input } from "@huoziwriter/ui";
import { useRouter } from "next/navigation";
import { FormEvent, startTransition, useState } from "react";

function formatConnectionStatus(status: string | null | undefined) {
  if (status === "valid") return "可发布";
  if (status === "expired") return "待刷新";
  if (status === "invalid") return "凭证失效";
  if (status === "disabled") return "已停用";
  return status || "未知";
}

function refreshRouter(router: ReturnType<typeof useRouter>) {
  startTransition(() => {
    router.refresh();
  });
}

type WechatConnectionsManagerProps = {
  connections: Array<{
    id: number;
    accountName: string | null;
    originalId: string | null;
    status: string;
    isDefault: boolean;
    accessTokenExpiresAt: string | null;
    updatedAt: string;
  }>;
  canManage: boolean;
  planName: string;
};

export function WechatConnectionsManager({
  connections,
  canManage,
  planName,
}: WechatConnectionsManagerProps) {
  const router = useRouter();
  const displayPlanName = formatPlanDisplayName(planName);
  const [accountName, setAccountName] = useState("");
  const [originalId, setOriginalId] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [switchingDefaultId, setSwitchingDefaultId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const defaultConnection = connections.find((connection) => connection.isDefault) ?? null;

  function resetForm() {
    setAccountName("");
    setOriginalId("");
    setAppId("");
    setAppSecret("");
    setIsDefault(true);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持绑定微信公众号。升级到 Pro 或更高套餐后，才可新增连接并推送到微信草稿箱。`);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      await upsertWechatConnectionAction({
        connectionId: editingId,
        accountName,
        originalId,
        appId: appId || undefined,
        appSecret: appSecret || undefined,
        isDefault,
      });
    } catch (error) {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : "公众号连接失败");
      return;
    }
    setLoading(false);
    resetForm();
    setMessage(editingId ? "公众号连接已更新" : "公众号连接已创建");
    refreshRouter(router);
  }

  async function handleDelete(id: number) {
    if (!window.confirm("确定要删除吗？")) return;

    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持管理微信公众号连接。`);
      return;
    }
    try {
      await disableWechatConnectionAction(id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除公众号连接失败");
      return;
    }
    refreshRouter(router);
  }

  function handleEdit(connection: WechatConnectionsManagerProps["connections"][number]) {
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持编辑微信公众号连接。`);
      return;
    }
    setEditingId(connection.id);
    setAccountName(connection.accountName || "");
    setOriginalId(connection.originalId || "");
    setAppId("");
    setAppSecret("");
    setIsDefault(connection.isDefault);
    setMessage("如只修改名称、原始 ID 或默认状态，可直接保存；只有轮换密钥时才需要重新填写 AppID / AppSecret。");
  }

  async function handleSetDefault(connection: WechatConnectionsManagerProps["connections"][number]) {
    if (!canManage) {
      setMessage(`${displayPlanName}暂不支持切换默认公众号。`);
      return;
    }
    setSwitchingDefaultId(connection.id);
    setMessage("");
    try {
      await upsertWechatConnectionAction({
        connectionId: connection.id,
        accountName: connection.accountName ?? undefined,
        originalId: connection.originalId ?? undefined,
        isDefault: true,
      });
    } catch (error) {
      setSwitchingDefaultId(null);
      setMessage(error instanceof Error ? error.message : "切换默认公众号失败");
      return;
    }
    setSwitchingDefaultId(null);
    setMessage(`已将 ${connection.accountName || `连接 ${connection.id}`} 设为默认公众号`);
    refreshRouter(router);
  }

  return (
    <div className="space-y-6">
      {!canManage ? (
        <div className="border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          {displayPlanName}当前不开放微信公众号授权。你仍可继续写作、导出 Markdown，并在升级到 Pro 或更高套餐后解锁公众号连接和草稿箱推送。
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="border border-lineStrong/40 bg-paperStrong p-5">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">授权说明</div>
          <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
            <div>这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取访问令牌。</div>
            <div>编辑器发布区默认优先使用“默认连接”，也可以临时切换到其他已授权公众号。</div>
            <div>如果你只是改名称、原始 ID 或默认状态，不必重复填写密钥。</div>
          </div>
        </div>
        <div className="border border-lineStrong/40 bg-surface p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">当前默认连接</div>
          {defaultConnection ? (
            <div className="mt-3 space-y-2 text-sm leading-7 text-inkSoft">
              <div className="font-serifCn text-2xl text-ink text-balance">{defaultConnection.accountName || "未命名公众号"}</div>
              <div>原始 ID：{defaultConnection.originalId || "未填写"}</div>
              <div>状态：{formatConnectionStatus(defaultConnection.status)}</div>
              <div>{defaultConnection.accessTokenExpiresAt ? `访问令牌到期：${new Date(defaultConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录访问令牌到期时间"}</div>
            </div>
          ) : (
            <div className="mt-3 text-sm leading-7 text-inkMuted">当前还没有默认公众号。新增连接后可直接设为默认。</div>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="grid gap-3 border border-lineStrong/40 bg-surface p-5 shadow-ink">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">{editingId ? "编辑公众号连接" : "新增公众号连接"}</div>
          {editingId ? (
            <Button type="button" onClick={resetForm} variant="secondary" size="sm">
              取消编辑
            </Button>
          ) : null}
        </div>
        <Input aria-label="公众号名称" value={accountName} disabled={!canManage} onChange={(event) => setAccountName(event.target.value)} placeholder="公众号名称" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="原始 ID" value={originalId} disabled={!canManage} onChange={(event) => setOriginalId(event.target.value)} placeholder="原始 ID" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="公众号 AppID" value={appId} disabled={!canManage} onChange={(event) => setAppId(event.target.value)} placeholder="公众号 AppID" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <Input aria-label="input control" value={appSecret} disabled={!canManage} onChange={(event) => setAppSecret(event.target.value)} placeholder={editingId ? "公众号 AppSecret（仅轮换密钥时填写）" : "公众号 AppSecret"} type="password" className="disabled:bg-surfaceMuted disabled:text-inkMuted" />
        <label className="flex items-center gap-3 border border-lineStrong px-4 py-3 text-sm text-inkSoft">
          <input aria-label="input control" type="checkbox" checked={isDefault} disabled={!canManage} onChange={(event) => setIsDefault(event.target.checked)} />
          保存后设为默认公众号
        </label>
        <Button type="submit" disabled={loading || !canManage} variant="primary">
          {!canManage ? "当前套餐不可绑定公众号" : loading ? (editingId ? "更新中…" : "校验中…") : editingId ? "保存公众号连接" : "添加公众号连接"}
        </Button>
      </form>
      {message ? <div className="text-sm text-cinnabar">{message}</div> : null}
      <div className="space-y-3">
        {connections.map((connection) => (
          <div key={connection.id} className="flex flex-wrap items-center justify-between gap-3 border border-lineStrong/40 bg-surface p-4">
            <div>
              <div className="font-serifCn text-xl text-ink">{connection.accountName || "未命名公众号"}</div>
              <div className="mt-1 text-sm text-inkSoft">
                状态：{formatConnectionStatus(connection.status)}
                {connection.isDefault ? " · 默认连接" : ""}
                {connection.accessTokenExpiresAt ? ` · 访问令牌到期 ${new Date(connection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : ""}
              </div>
              <div className="mt-1 text-xs text-inkMuted">
                原始 ID：{connection.originalId || "未填写"} · 更新于 {new Date(connection.updatedAt).toLocaleString("zh-CN")}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!connection.isDefault ? (
                <Button
                  type="button"
                  onClick={() => handleSetDefault(connection)}
                  disabled={switchingDefaultId === connection.id || !canManage}
                  variant="secondary"
                  className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
                >
                  {switchingDefaultId === connection.id ? "切换中…" : "设为默认"}
                </Button>
              ) : null}
              <Button type="button" onClick={() => handleEdit(connection)} disabled={!canManage} variant="secondary">
                编辑
              </Button>
              <Button type="button" onClick={() => handleDelete(connection.id)} disabled={!canManage} variant="secondary">
                删除
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
