import { Button, Input } from "@huoziwriter/ui";
import type { FormEvent } from "react";

type WechatConnectModalProps = {
  open: boolean;
  continuePublishAfterWechatConnect: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  wechatConnectAccountName: string;
  onChangeWechatConnectAccountName: (value: string) => void;
  wechatConnectOriginalId: string;
  onChangeWechatConnectOriginalId: (value: string) => void;
  wechatConnectAppId: string;
  onChangeWechatConnectAppId: (value: string) => void;
  wechatConnectAppSecret: string;
  onChangeWechatConnectAppSecret: (value: string) => void;
  wechatConnectIsDefault: boolean;
  onChangeWechatConnectIsDefault: (value: boolean) => void;
  wechatConnectMessage: string;
  wechatConnectSubmitting: boolean;
};

export function WechatConnectModal({
  open,
  continuePublishAfterWechatConnect,
  onClose,
  onSubmit,
  wechatConnectAccountName,
  onChangeWechatConnectAccountName,
  wechatConnectOriginalId,
  onChangeWechatConnectOriginalId,
  wechatConnectAppId,
  onChangeWechatConnectAppId,
  wechatConnectAppSecret,
  onChangeWechatConnectAppSecret,
  wechatConnectIsDefault,
  onChangeWechatConnectIsDefault,
  wechatConnectMessage,
  wechatConnectSubmitting,
}: WechatConnectModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-[560px] overflow-auto overscroll-contain border border-lineStrong bg-surfaceHighlight p-6 shadow-ink">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-inkMuted">公众号快速配置</div>
            <div className="mt-2 font-serifCn text-3xl text-ink text-balance">
              {continuePublishAfterWechatConnect ? "补录凭证后继续发布" : "新增公众号连接"}
            </div>
            <div className="mt-3 text-sm leading-7 text-inkSoft">
              这里直接录入公众号 `AppID / AppSecret`，系统会立即向微信校验并换取访问令牌。
            </div>
          </div>
          <Button onClick={onClose} variant="secondary" size="sm">
            关闭
          </Button>
        </div>
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <Input
            aria-label="公众号名称"
            value={wechatConnectAccountName}
            onChange={(event) => onChangeWechatConnectAccountName(event.target.value)}
            placeholder="公众号名称"
          />
          <Input
            aria-label="原始 ID"
            value={wechatConnectOriginalId}
            onChange={(event) => onChangeWechatConnectOriginalId(event.target.value)}
            placeholder="原始 ID"
          />
          <Input
            aria-label="公众号 AppID"
            value={wechatConnectAppId}
            onChange={(event) => onChangeWechatConnectAppId(event.target.value)}
            placeholder="公众号 AppID"
          />
          <Input
            aria-label="公众号 AppSecret"
            value={wechatConnectAppSecret}
            onChange={(event) => onChangeWechatConnectAppSecret(event.target.value)}
            placeholder="公众号 AppSecret"
            type="password"
          />
          <label className="flex items-center gap-3 border border-lineStrong bg-surface px-4 py-3 text-sm text-inkSoft">
            <input
              aria-label="设为默认公众号"
              type="checkbox"
              checked={wechatConnectIsDefault}
              onChange={(event) => onChangeWechatConnectIsDefault(event.target.checked)}
            />
            保存后设为默认公众号
          </label>
          {wechatConnectMessage ? (
            <div className="border border-dashed border-danger/30 bg-surface px-4 py-3 text-sm leading-7 text-danger">
              {wechatConnectMessage}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={onClose}
              disabled={wechatConnectSubmitting}
              variant="secondary"
            >
              先不配置
            </Button>
            <Button
              type="submit"
              disabled={wechatConnectSubmitting}
              variant="primary"
            >
              {wechatConnectSubmitting
                ? continuePublishAfterWechatConnect
                  ? "校验并续发中…"
                  : "校验中…"
                : continuePublishAfterWechatConnect
                  ? "保存并继续发布"
                  : "保存公众号连接"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
