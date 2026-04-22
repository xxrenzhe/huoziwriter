import { Button } from "@huoziwriter/ui";
import Link from "next/link";
import { formatPublishFailureCode } from "@/lib/article-workspace-formatters";

type RecentSyncLogLike = {
  connectionName: string | null;
  createdAt: string;
  status: string;
  mediaId: string | null;
  failureReason: string | null;
  failureCode: string | null;
  retryCount: number;
  articleVersionHash: string | null;
  templateId: string | null;
  requestSummary: string | Record<string, unknown> | null;
  responseSummary: string | Record<string, unknown> | null;
} | null;

type WechatPublishSyncSectionProps = {
  latestSyncLog: RecentSyncLogLike;
  onRetryLatestPublish: () => void | Promise<void>;
  retryingPublish: boolean;
  canRetryPublish: boolean;
};

function stringifySummary(value: string | Record<string, unknown> | null) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function WechatPublishSyncSection({
  latestSyncLog,
  onRetryLatestPublish,
  retryingPublish,
  canRetryPublish,
}: WechatPublishSyncSectionProps) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">当前稿件最近同步</div>
      {latestSyncLog ? (
        <div className="mt-3 space-y-3">
          <div className="border border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkSoft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{latestSyncLog.connectionName || "未命名公众号"}</div>
                <div className="text-inkMuted">{new Date(latestSyncLog.createdAt).toLocaleString("zh-CN")}</div>
              </div>
              <div className={latestSyncLog.status === "success" ? "text-emerald-600" : "text-cinnabar"}>
                {latestSyncLog.status === "success" ? "推送成功" : "推送失败"}
              </div>
            </div>
            <div className="mt-3">
              {latestSyncLog.status === "success"
                ? latestSyncLog.mediaId
                  ? `草稿媒体 ID：${latestSyncLog.mediaId}`
                  : "微信已返回成功，但未回填媒体 ID。"
                : latestSyncLog.failureReason || "未记录失败原因"}
            </div>
            {latestSyncLog.failureCode ? (
              <div className="mt-2 text-xs text-inkMuted">失败分类：{formatPublishFailureCode(latestSyncLog.failureCode)}</div>
            ) : null}
            {latestSyncLog.retryCount > 0 ? <div className="mt-2 text-xs text-inkMuted">重试次数：{latestSyncLog.retryCount}</div> : null}
            {latestSyncLog.articleVersionHash ? <div className="mt-2 text-xs text-inkMuted">版本哈希：{latestSyncLog.articleVersionHash.slice(0, 12)}</div> : null}
            {latestSyncLog.templateId ? <div className="mt-1 text-xs text-inkMuted">模板：{latestSyncLog.templateId}</div> : null}
            {latestSyncLog.status === "failed" ? (
              <Button
                type="button"
                onClick={() => void onRetryLatestPublish()}
                disabled={retryingPublish || !canRetryPublish}
                variant="secondary"
                size="sm"
                className="mt-3 border-cinnabar text-cinnabar hover:border-cinnabar hover:bg-surface hover:text-cinnabar"
              >
                {retryingPublish ? "重试中…" : "直接重试这次发布"}
              </Button>
            ) : null}
          </div>
          {(latestSyncLog.requestSummary || latestSyncLog.responseSummary) ? (
            <div className="space-y-2">
              {latestSyncLog.requestSummary ? (
                <div className="border border-lineStrong bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
                  <div className="uppercase tracking-[0.18em] text-inkMuted">请求摘要</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.requestSummary)}</pre>
                </div>
              ) : null}
              {latestSyncLog.responseSummary ? (
                <div className="border border-lineStrong bg-surface px-3 py-3 text-xs leading-6 text-inkMuted">
                  <div className="uppercase tracking-[0.18em] text-inkMuted">响应摘要</div>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{stringifySummary(latestSyncLog.responseSummary)}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
          <Link href="/settings/publish" className="block border border-lineStrong bg-surface px-4 py-3 text-center text-sm text-inkSoft">
            去设置查看发布连接与同步记录
          </Link>
        </div>
      ) : (
        <div className="mt-3 border border-dashed border-lineStrong bg-surface px-4 py-4 text-sm leading-7 text-inkMuted">
          这篇稿件还没有同步记录。首次推送成功后，这里会显示最近一次请求与响应摘要。
        </div>
      )}
    </div>
  );
}
