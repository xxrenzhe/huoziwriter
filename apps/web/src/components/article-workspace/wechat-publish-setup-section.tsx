import { Button, Select } from "@huoziwriter/ui";
import { formatConnectionStatus, formatTemplateAssetOwner, formatTemplateConfigSummary, formatTemplateSourceSummary } from "@/lib/article-workspace-formatters";

type TemplateLike = {
  id: string;
  version: string;
  name: string;
  description: string | null;
  meta: string | null;
  ownerUserId: number | null;
  sourceUrl: string | null;
  config?: Record<string, unknown>;
};

type WechatConnectionLike = {
  id: number;
  accountName: string | null;
  status: string;
  isDefault: boolean;
  accessTokenExpiresAt: string | null;
};

type PendingPublishIntentLike = {
  createdAt: string;
  templateId: string | null;
  reason: "missing_connection" | "auth_failed";
} | null;

type WechatPublishSetupSectionProps = {
  wechatTemplateId: string | null;
  onChangeWechatTemplateId: (value: string | null) => void;
  templates: TemplateLike[];
  selectedTemplate: TemplateLike | null;
  selectedConnectionId: string;
  onChangeSelectedConnectionId: (value: string) => void;
  wechatConnections: WechatConnectionLike[];
  selectedConnection: WechatConnectionLike | null;
  onOpenWechatConnectModal: () => void | Promise<void>;
  pendingPublishIntent: PendingPublishIntentLike;
  onResumePendingPublishIntent: () => void | Promise<void>;
  onClearPendingPublishIntent: () => void | Promise<void>;
  publishing: boolean;
};

export function WechatPublishSetupSection({
  wechatTemplateId,
  onChangeWechatTemplateId,
  templates,
  selectedTemplate,
  selectedConnectionId,
  onChangeSelectedConnectionId,
  wechatConnections,
  selectedConnection,
  onOpenWechatConnectModal,
  pendingPublishIntent,
  onResumePendingPublishIntent,
  onClearPendingPublishIntent,
  publishing,
}: WechatPublishSetupSectionProps) {
  return (
    <>
      <div className="mt-3 border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
        当前发布动作会把 Markdown 先渲染为微信兼容 HTML，再按所选模板推入公众号草稿箱。
      </div>
      <Select aria-label="微信模板" value={wechatTemplateId ?? ""} onChange={(event) => onChangeWechatTemplateId(event.target.value || null)} className="mt-3">
        <option value="">选择微信模板（默认）</option>
        {templates.map((template) => (
          <option key={`${template.id}-${template.version}`} value={template.id}>
            [{template.ownerUserId == null ? "官方" : "私有"}] {template.name} · {template.version}
          </option>
        ))}
      </Select>
      <Select aria-label="公众号连接" value={selectedConnectionId} onChange={(event) => onChangeSelectedConnectionId(event.target.value)} className="mt-3">
        <option value="">选择公众号连接</option>
        {wechatConnections.map((connection) => (
          <option key={connection.id} value={connection.id}>{connection.accountName || `连接 ${connection.id}`}{connection.isDefault ? " · 默认" : ""}</option>
        ))}
      </Select>
      <Button onClick={() => void onOpenWechatConnectModal()} variant="secondary" fullWidth className="mt-3">
        新增公众号连接
      </Button>
      {selectedTemplate ? (
        <div className="mt-3 border border-lineStrong bg-surface px-4 py-4">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">
            {selectedTemplate.meta || "模板"} · {selectedTemplate.version} · {formatTemplateAssetOwner(selectedTemplate)}
          </div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedTemplate.name}</div>
          <div className="mt-2 text-sm leading-7 text-inkSoft">{selectedTemplate.description || "当前模板未填写说明，但会参与微信 HTML 渲染。"}</div>
          <div className="mt-2 text-xs leading-6 text-inkMuted">来源：{formatTemplateSourceSummary(selectedTemplate)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {formatTemplateConfigSummary(selectedTemplate).map((item) => (
              <span key={`${selectedTemplate.id}-${item}`} className="border border-lineStrong bg-paperStrong px-3 py-1 text-xs text-inkSoft">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          当前未显式指定模板，将使用默认微信渲染样式。
        </div>
      )}
      {selectedConnection ? (
        <div className="mt-3 border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
          <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">目标公众号</div>
          <div className="mt-2 font-serifCn text-2xl text-ink text-balance">{selectedConnection.accountName || `连接 ${selectedConnection.id}`}</div>
          <div className="mt-2">
            状态：{formatConnectionStatus(selectedConnection.status)}
            {selectedConnection.isDefault ? " · 默认连接" : ""}
          </div>
          <div className="text-inkMuted">
            {selectedConnection.accessTokenExpiresAt ? `访问令牌到期：${new Date(selectedConnection.accessTokenExpiresAt).toLocaleString("zh-CN")}` : "尚未记录访问令牌到期时间"}
          </div>
        </div>
      ) : (
        <div className="mt-3 border border-dashed border-danger/30 bg-surface px-4 py-4 text-sm leading-7 text-danger">
          当前还没有可用公众号连接。可直接在这里补录公众号 AppID / AppSecret，完成后会继续当前发布流程。
        </div>
      )}
      {pendingPublishIntent ? (
        <div className="mt-3 border border-warning/40 bg-surfaceWarning px-4 py-4 text-sm leading-7 text-warning">
          <div className="text-xs uppercase tracking-[0.18em] text-warning">待恢复发布意图</div>
          <div className="mt-2">
            上一次发布在 {new Date(pendingPublishIntent.createdAt).toLocaleString("zh-CN")}
            {pendingPublishIntent.reason === "missing_connection"
              ? " 因尚未配置公众号连接而中断。"
              : " 因公众号凭证不可用而中断。"}
            {pendingPublishIntent.templateId ? " 这次恢复时会继续沿用当前编辑器里的模板和正文状态。" : " 恢复后会直接沿用当前编辑器里的正文状态继续发布。"}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => void onResumePendingPublishIntent()}
              disabled={publishing}
              variant="secondary"
              size="sm"
              className="border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
            >
              {publishing ? "恢复中…" : "恢复继续发布"}
            </Button>
            <Button onClick={() => void onClearPendingPublishIntent()} variant="secondary" size="sm">
              清除待发布状态
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
