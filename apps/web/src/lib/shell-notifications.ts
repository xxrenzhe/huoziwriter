import type { NotificationCenterItem } from "@/components/notification-center";
import { getDatabase } from "@/lib/db";

type CountRow = { count: number };

type WriterSyncRow = {
  article_id: number;
  title: string;
  failure_reason: string | null;
  updated_at: string;
};

type AdminJobRow = {
  job_type: string;
  last_error: string | null;
  updated_at: string;
};

function formatTimestampLabel(value: string | null | undefined, fallback = "最近更新") {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(parsed);
}

function trimMessage(value: string | null | undefined, fallback: string, limit = 96) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}…` : normalized;
}

export async function getWriterShellNotificationItems(userId: number) {
  const db = getDatabase();
  const nextDayIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [
    expiredConnections,
    expiringConnections,
    latestFailedSync,
    latestSuccessSync,
  ] = await Promise.all([
    db.queryOne<CountRow>(
      "SELECT COUNT(*) as count FROM wechat_connections WHERE user_id = ? AND status = ?",
      [userId, "expired"],
    ),
    db.queryOne<CountRow>(
      `SELECT COUNT(*) as count
       FROM wechat_connections
       WHERE user_id = ?
         AND status = ?
         AND access_token_expires_at IS NOT NULL
         AND access_token_expires_at <= ?`,
      [userId, "valid", nextDayIso],
    ),
    db.queryOne<WriterSyncRow>(
      `SELECT l.article_id, a.title, l.failure_reason, l.updated_at
       FROM wechat_sync_logs l
       INNER JOIN articles a ON a.id = l.article_id
       WHERE l.user_id = ? AND l.status <> ?
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT 1`,
      [userId, "success"],
    ),
    db.queryOne<WriterSyncRow>(
      `SELECT l.article_id, a.title, l.failure_reason, l.updated_at
       FROM wechat_sync_logs l
       INNER JOIN articles a ON a.id = l.article_id
       WHERE l.user_id = ? AND l.status = ?
       ORDER BY l.updated_at DESC, l.id DESC
       LIMIT 1`,
      [userId, "success"],
    ),
  ]);

  const items: NotificationCenterItem[] = [];
  const expiredCount = Number(expiredConnections?.count || 0);
  const expiringCount = Number(expiringConnections?.count || 0);

  if (expiredCount > 0 || expiringCount > 0) {
    const detailParts = [
      expiredCount > 0 ? `${expiredCount} 个公众号连接已过期` : null,
      expiringCount > 0 ? `${expiringCount} 个连接将在 24 小时内过期` : null,
    ].filter(Boolean);

    items.push({
      id: "writer-wechat-credential",
      title: "微信公众号连接需要处理",
      description: `${detailParts.join("，")}。先去发布设置页刷新 token，避免稿件在推送阶段被阻断。`,
      kind: "security",
      tone: "warning",
      unread: true,
      meta: "发布通道",
      badge: expiredCount > 0 ? "已过期" : "即将过期",
      href: "/settings/publish",
      timestampLabel: "需要尽快处理",
    });
  }

  if (latestFailedSync) {
    items.push({
      id: `writer-sync-failed:${latestFailedSync.article_id}`,
      title: `《${latestFailedSync.title}》推送失败`,
      description: trimMessage(latestFailedSync.failure_reason, "最近一次写入微信草稿箱失败，建议回到发布步骤查看失败原因并重试。"),
      kind: "article",
      tone: "warning",
      unread: true,
      meta: "微信发布",
      badge: "失败",
      href: `/articles/${latestFailedSync.article_id}?step=publish`,
      timestampLabel: formatTimestampLabel(latestFailedSync.updated_at),
    });
  }

  if (latestSuccessSync) {
    items.push({
      id: `writer-sync-success:${latestSuccessSync.article_id}`,
      title: `《${latestSuccessSync.title}》已写入草稿箱`,
      description: "最近一次微信草稿箱推送成功，适合继续做封面、摘要和结果回流检查。",
      kind: "article",
      tone: "success",
      meta: "微信发布",
      badge: "已同步",
      href: `/articles/${latestSuccessSync.article_id}?step=publish`,
      timestampLabel: formatTimestampLabel(latestSuccessSync.updated_at),
    });
  }

  return items;
}

export async function getAdminShellNotificationItems() {
  const db = getDatabase();
  const nowIso = new Date().toISOString();
  const nextDayIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const [
    failedJobs,
    latestFailedJob,
    expiredConnections,
    invalidConnections,
    expiringConnections,
    erroredSchedules,
    dueSchedules,
  ] = await Promise.all([
    db.queryOne<CountRow>("SELECT COUNT(*) as count FROM job_queue WHERE status = ?", ["failed"]),
    db.queryOne<AdminJobRow>(
      `SELECT job_type, last_error, updated_at
       FROM job_queue
       WHERE status = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
      ["failed"],
    ),
    db.queryOne<CountRow>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["expired"]),
    db.queryOne<CountRow>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["invalid"]),
    db.queryOne<CountRow>(
      `SELECT COUNT(*) as count
       FROM wechat_connections
       WHERE status = ?
         AND access_token_expires_at IS NOT NULL
         AND access_token_expires_at <= ?`,
      ["valid", nextDayIso],
    ),
    db.queryOne<CountRow>(
      `SELECT COUNT(*) as count
       FROM writing_eval_run_schedules
       WHERE is_enabled = ?
         AND last_error IS NOT NULL
         AND TRIM(last_error) <> ''`,
      [true],
    ),
    db.queryOne<CountRow>(
      `SELECT COUNT(*) as count
       FROM writing_eval_run_schedules
       WHERE is_enabled = ?
         AND next_run_at IS NOT NULL
         AND next_run_at <= ?`,
      [true, nowIso],
    ),
  ]);

  const items: NotificationCenterItem[] = [];
  const failedJobCount = Number(failedJobs?.count || 0);

  if (failedJobCount > 0) {
    items.push({
      id: "admin-job-queue-failed",
      title: `任务队列存在 ${failedJobCount} 条失败任务`,
      description: trimMessage(
        latestFailedJob?.last_error,
        latestFailedJob ? `最近失败任务：${latestFailedJob.job_type}。建议进入审计或总览页排查阻塞原因。` : "后台异步任务存在失败项，建议尽快排查。",
      ),
      kind: "system",
      tone: "warning",
      unread: true,
      meta: latestFailedJob?.job_type || "任务队列",
      badge: "失败任务",
      href: "/admin/audit",
      timestampLabel: formatTimestampLabel(latestFailedJob?.updated_at, "需要排查"),
    });
  }

  const expiredCount = Number(expiredConnections?.count || 0);
  const invalidCount = Number(invalidConnections?.count || 0);
  const expiringCount = Number(expiringConnections?.count || 0);
  if (expiredCount > 0 || invalidCount > 0 || expiringCount > 0) {
    const detailParts = [
      expiredCount > 0 ? `${expiredCount} 个已过期` : null,
      invalidCount > 0 ? `${invalidCount} 个待重新校验` : null,
      expiringCount > 0 ? `${expiringCount} 个将在 24 小时内过期` : null,
    ].filter(Boolean);
    items.push({
      id: "admin-wechat-credential-health",
      title: "微信发布凭证存在待处理项",
      description: `${detailParts.join("，")}。建议优先处理发布链路，避免真实推送失败。`,
      kind: "security",
      tone: "warning",
      unread: true,
      meta: "发布通道",
      badge: "凭证风险",
      href: "/admin",
      timestampLabel: "需要尽快处理",
    });
  }

  const erroredScheduleCount = Number(erroredSchedules?.count || 0);
  const dueScheduleCount = Number(dueSchedules?.count || 0);
  if (erroredScheduleCount > 0 || dueScheduleCount > 0) {
    const detailParts = [
      erroredScheduleCount > 0 ? `${erroredScheduleCount} 个 schedule 最近报错` : null,
      dueScheduleCount > 0 ? `${dueScheduleCount} 个 schedule 已到触发时间` : null,
    ].filter(Boolean);
    items.push({
      id: "admin-writing-eval-automation",
      title: "写作评测自动化需要关注",
      description: `${detailParts.join("，")}。建议进入调度页确认是否继续派发或需要人工介入。`,
      kind: "review",
      tone: erroredScheduleCount > 0 ? "warning" : "highlight",
      unread: true,
      meta: "评测自动化",
      badge: erroredScheduleCount > 0 ? "有阻塞" : "待派发",
      href: "/admin/writing-eval/schedules",
      timestampLabel: "自动化看板",
    });
  }

  return items;
}
