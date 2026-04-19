import { access } from "node:fs/promises";
import path from "node:path";
import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { AdminImageAssetMaintenance } from "@/components/admin-image-assets-client";
import { AdminTopicSourcesClient } from "@/components/admin-client";
import { AdminOverview } from "@/components/admin-views";
import { getDatabase } from "@/lib/db";
import { getGlobalCoverImageEngine } from "@/lib/image-engine";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminBusinessOverview, getModelRoutes, getPromptVersions, getRecentSupportMessages, getResolvedPlans, getSupportMessageCount, getUsers } from "@/lib/repositories";
import { getAdminTopicSources } from "@/lib/topic-signals";

function parseJobPayload(value: string | null) {
  if (!value) {
    return {} as Record<string, unknown>;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

type CoverAssetManifest = {
  derivativeMode?: string;
  derivativeWarning?: string | null;
  sourceKind?: string;
  contentType?: string;
  byteLength?: number;
  original?: {
    objectKey?: string;
    publicUrl?: string;
    contentType?: string;
    byteLength?: number;
    width?: number | null;
    height?: number | null;
  } | null;
  compressed?: {
    objectKey?: string;
    publicUrl?: string;
    contentType?: string;
    byteLength?: number;
    width?: number | null;
    height?: number | null;
  } | null;
  thumbnail?: {
    objectKey?: string;
    publicUrl?: string;
    contentType?: string;
    byteLength?: number;
    width?: number | null;
    height?: number | null;
  } | null;
};

function parseCoverAssetManifest(value: string | null) {
  if (!value) {
    return null as CoverAssetManifest | null;
  }
  try {
    const parsed = JSON.parse(value) as CoverAssetManifest;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function resolveLocalObjectHealth(objectKey: string | null) {
  if (!objectKey) {
    return "missing-meta" as const;
  }
  try {
    await access(path.join(process.cwd(), "public", "generated-assets", objectKey));
    return "ready" as const;
  } catch {
    return "missing" as const;
  }
}

function formatBytes(byteLength: number | null | undefined) {
  if (typeof byteLength !== "number" || Number.isNaN(byteLength) || byteLength <= 0) {
    return "未记录体积";
  }
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }
  if (byteLength < 1024 * 1024) {
    return `${(byteLength / 1024).toFixed(byteLength < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(byteLength / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(width: number | null | undefined, height: number | null | undefined) {
  if (!width || !height) {
    return "未记录尺寸";
  }
  return `${width}×${height}`;
}

function formatCompressionDelta(originalBytes: number | null | undefined, compressedBytes: number | null | undefined) {
  if (
    typeof originalBytes !== "number" ||
    typeof compressedBytes !== "number" ||
    originalBytes <= 0 ||
    compressedBytes <= 0
  ) {
    return "未记录压缩率";
  }
  const delta = originalBytes - compressedBytes;
  const ratio = ((delta / originalBytes) * 100).toFixed(1);
  if (delta === 0) {
    return "0%";
  }
  return `${ratio}%`;
}

const adminSectionCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurface p-6 text-adminInk shadow-none");
const adminInsetCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted px-4 py-3 text-adminInk shadow-none");
const adminInsetCardBodyClassName = cn(adminInsetCardClassName, "text-sm text-adminInk");
const adminDetailCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceMuted px-4 py-4 text-sm text-adminInk shadow-none");
const adminEmptyStateCardClassName = cn(adminDetailCardClassName, "text-adminInkSoft");
const adminTerminalCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminBg p-4 font-mono text-xs leading-7 text-adminInk shadow-none");
const adminAssetMetaCardClassName = cn(surfaceCardStyles(), "border-adminLineStrong bg-adminSurfaceAlt px-3 py-3 text-xs leading-6 text-adminInkSoft shadow-none");
const adminSectionEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-cinnabar";
const adminSectionTitleClassName = "mt-4 font-serifCn text-3xl text-adminInk text-balance";
const adminSectionDescriptionClassName = "mt-3 text-sm leading-7 text-adminInkSoft";
const adminStatusBadgeClassName = cn(surfaceCardStyles(), "border border-adminLineStrong bg-adminSurfaceMuted px-2 py-1 text-adminInk shadow-none");
const adminSuccessBadgeClassName = cn(adminStatusBadgeClassName, "border-emerald-900 bg-emerald-950/30 text-emerald-300");
const adminWarningBadgeClassName = cn(adminStatusBadgeClassName, "border-warning/40 bg-surfaceWarm text-warning");
const adminDangerBadgeClassName = cn(adminStatusBadgeClassName, "border-danger/30 bg-surface text-danger");
const adminWarningNoticeClassName = cn(surfaceCardStyles(), "border-warning/40 bg-surfaceWarm px-3 py-3 text-xs leading-6 text-warning shadow-none");

function getImageAssetHealthBadgeClassName(health: "ready" | "remote" | "missing" | "missing-meta") {
  if (health === "ready") {
    return adminSuccessBadgeClassName;
  }
  if (health === "remote") {
    return adminWarningBadgeClassName;
  }
  return adminDangerBadgeClassName;
}

export default async function AdminOverviewPage() {
  await requireAdminSession();
  const [users, plans, prompts, routes, imageEngine, business, supportCount, supportMessages, adminTopicSources] = await Promise.all([
    getUsers(),
    getResolvedPlans(),
    getPromptVersions(),
    getModelRoutes(),
    getGlobalCoverImageEngine(),
    getAdminBusinessOverview(),
    getSupportMessageCount(),
    getRecentSupportMessages(5),
    getAdminTopicSources(),
  ]);
  const db = getDatabase();
  const [articles, fragments, syncSuccess, knowledgeCards, auditLogs, queueRows, failedJobs, expiredTokens, invalidTokens, expiringTokens, failedSyncs, recentAuditLogs, externalFetchJobs, topicFetchFailureJobs, recentTopicSyncRuns, coverImages, coverImageCandidates, imageAssetProviders, recentImageAssetRows] = await Promise.all([
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM articles"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM fragments"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_sync_logs WHERE status = ?", ["success"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM knowledge_cards"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM audit_logs"),
    db.query<{ status: string; count: number }>("SELECT status, COUNT(*) as count FROM job_queue GROUP BY status ORDER BY status ASC"),
    db.query<{ id: number; job_type: string; attempts: number; last_error: string | null; updated_at: string }>(
      `SELECT id, job_type, attempts, last_error, updated_at
       FROM job_queue
       WHERE status = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 6`,
      ["failed"],
    ),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["expired"]),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM wechat_connections WHERE status = ?", ["invalid"]),
    db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM wechat_connections
       WHERE status = ? AND access_token_expires_at IS NOT NULL AND access_token_expires_at <= ?`,
      ["valid", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()],
    ),
    db.query<{ id: number; failure_reason: string | null; created_at: string; title: string }>(
      `SELECT l.id, l.failure_reason, l.created_at, d.title
       FROM wechat_sync_logs l
       INNER JOIN articles d ON d.id = l.article_id
       WHERE l.status = ?
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 6`,
      ["failed"],
    ),
    db.query<{ id: number; action: string; target_type: string; created_at: string }>(
      `SELECT id, action, target_type, created_at
       FROM audit_logs
       ORDER BY id DESC
       LIMIT 6`,
    ),
    db.query<{ id: number; job_type: string; status: string; attempts: number; payload_json: string | null; last_error: string | null; updated_at: string }>(
      `SELECT id, job_type, status, attempts, payload_json, last_error, updated_at
       FROM job_queue
       WHERE job_type IN (?, ?)
       ORDER BY updated_at DESC, id DESC
       LIMIT 24`,
      ["capture", "topicFetch"],
    ),
    db.query<{ id: number; payload_json: string | null; last_error: string | null; updated_at: string }>(
      `SELECT id, payload_json, last_error, updated_at
       FROM job_queue
       WHERE job_type = ? AND status = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 60`,
      ["topicFetch", "failed"],
    ),
    db.query<{
      id: number;
      sync_window_start: string;
      sync_window_label: string;
      status: string;
      scheduled_source_count: number;
      enqueued_job_count: number;
      completed_source_count: number;
      failed_source_count: number;
      inserted_item_count: number;
      last_error: string | null;
      triggered_at: string;
      finished_at: string | null;
      updated_at: string;
    }>(
      `SELECT id, sync_window_start, sync_window_label, status, scheduled_source_count, enqueued_job_count,
              completed_source_count, failed_source_count, inserted_item_count, last_error, triggered_at, finished_at, updated_at
       FROM topic_sync_runs
       ORDER BY sync_window_start DESC, id DESC
       LIMIT 8`,
    ),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM cover_images"),
    db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM cover_image_candidates"),
    db.query<{ storage_provider: string | null; count: number }>(
      `SELECT storage_provider, COUNT(*) as count
       FROM (
         SELECT storage_provider FROM cover_images
         UNION ALL
         SELECT storage_provider FROM cover_image_candidates
       )
       GROUP BY storage_provider
       ORDER BY count DESC`,
    ),
    db.query<{
      asset_scope: string;
      id: number;
      article_id: number | null;
      variant_label: string | null;
      image_url: string;
      storage_provider: string | null;
      compressed_object_key: string | null;
      asset_manifest_json: string | null;
      created_at: string;
    }>(
      `SELECT *
       FROM (
         SELECT 'cover' as asset_scope, id, article_id AS article_id, NULL as variant_label, image_url, storage_provider, compressed_object_key, asset_manifest_json, created_at
         FROM cover_images
         UNION ALL
         SELECT 'candidate' as asset_scope, id, article_id AS article_id, variant_label, image_url, storage_provider, compressed_object_key, asset_manifest_json, created_at
         FROM cover_image_candidates
       )
       ORDER BY created_at DESC, id DESC
       LIMIT 8`,
    ),
  ]);

  const activeUsers = users.filter((user) => Boolean(user.is_active)).length;
  const activePromptVersions = prompts.filter((prompt) => Boolean(prompt.is_active)).length;
  const queueSummary = new Map(queueRows.map((row) => [row.status, row.count]));
  const parsedExternalFetchJobs = externalFetchJobs.map((job) => ({
    ...job,
    payload: parseJobPayload(job.payload_json),
  }));
  const degradedCaptureJobs = parsedExternalFetchJobs.filter(
    (job) => job.job_type === "capture" && typeof job.payload.degradedReason === "string" && job.payload.degradedReason.trim().length > 0,
  );
  const pendingRetryCaptureJobs = parsedExternalFetchJobs.filter(
    (job) =>
      job.job_type === "capture" &&
      ["queued", "running"].includes(job.status) &&
      (Boolean(job.payload.retryUrlFetch) || Boolean(job.payload.retryDistill)),
  );
  const failedTopicFetchJobs = parsedExternalFetchJobs.filter(
    (job) => job.job_type === "topicFetch" && job.status === "failed",
  );
  const recentExternalIncidents = parsedExternalFetchJobs.filter(
    (job) =>
      job.status === "failed" ||
      (job.job_type === "capture" && typeof job.payload.degradedReason === "string" && job.payload.degradedReason.trim().length > 0) ||
      (job.job_type === "capture" &&
        ["queued", "running"].includes(job.status) &&
        (Boolean(job.payload.retryUrlFetch) || Boolean(job.payload.retryDistill))),
  );
  const topicSourceFailureMap = new Map<
    number,
    {
      count: number;
      latestError: string | null;
      latestUpdatedAt: string | null;
    }
  >();
  for (const job of topicFetchFailureJobs) {
    const payload = parseJobPayload(job.payload_json);
    const sourceId = Number(payload.sourceId || 0);
    if (!sourceId) {
      continue;
    }
    const current = topicSourceFailureMap.get(sourceId) ?? {
      count: 0,
      latestError: null,
      latestUpdatedAt: null,
    };
    current.count += 1;
    if (!current.latestUpdatedAt || job.updated_at > current.latestUpdatedAt) {
      current.latestUpdatedAt = job.updated_at;
      current.latestError = job.last_error || null;
    }
    topicSourceFailureMap.set(sourceId, current);
  }
  const recentImageAssets = await Promise.all(
    recentImageAssetRows.map(async (asset) => {
      const manifest = parseCoverAssetManifest(asset.asset_manifest_json);
      const health =
        asset.storage_provider === "local"
          ? await resolveLocalObjectHealth(asset.compressed_object_key || manifest?.compressed?.objectKey || null)
          : asset.storage_provider
            ? ("remote" as const)
            : ("missing-meta" as const);
      return {
        ...asset,
        manifest,
        health,
      };
    }),
  );
  const imageAssetTotal = (coverImages?.count ?? 0) + (coverImageCandidates?.count ?? 0);
  const imageProviderSummary =
    imageAssetProviders.length > 0
      ? imageAssetProviders
          .map((item) => `${item.storage_provider || "unknown"} ${item.count}`)
          .join(" · ")
      : "暂无已存储图片资产";
  const readyRecentImageAssets = recentImageAssets.filter((asset) => asset.health === "ready").length;
  const recentSharpDerivatives = recentImageAssets.filter((asset) => asset.manifest?.derivativeMode === "sharp").length;
  const recentDerivativeFallbacks = recentImageAssets.filter((asset) => asset.manifest?.derivativeMode === "passthrough-fallback").length;

  return (
    <div className="space-y-8">
      <AdminOverview
        title="后台既要看经营指标，也要看写作主链路有没有真的跑起来。"
        description="当前后台已经接入用户管理、套餐结构、Prompt 版本、模型路由和微信草稿箱发布统计，默认管理账号固定为 huozi。"
        metrics={[
          { label: "激活用户", value: String(activeUsers), note: `总用户 ${users.length} 个，全部由后台手动创建。` },
          { label: "写作资产", value: String((articles?.count ?? 0) + (fragments?.count ?? 0)), note: `稿件 ${(articles?.count ?? 0)} 篇，碎片 ${(fragments?.count ?? 0)} 条。` },
          { label: "背景卡", value: String(knowledgeCards?.count ?? 0), note: "系统已沉淀的结构化背景卡数量。" },
          { label: "微信成功推送", value: String(syncSuccess?.count ?? 0), note: "这里统计真实写入公众号草稿箱成功的次数。" },
          { label: "审计事件", value: String(auditLogs?.count ?? 0), note: "配置变更、灰度切换、资产调整等关键动作都会写入审计日志。" },
          { label: "经营系列", value: String(business.seriesCount), note: `启用用户 ${business.activeUserCount} 个，已发布稿件 ${business.publishedArticleCount} 篇。` },
          { label: "生图引擎", value: imageEngine.hasApiKey ? "已配置" : "未配置", note: imageEngine.baseUrl ? `${imageEngine.model} · ${imageEngine.baseUrl}` : "封面图生成仍需运营后台补充 Base_URL 与 API Key。" },
          { label: "图片资产", value: String(imageAssetTotal), note: `已固化封面 ${(coverImages?.count ?? 0)} 张，候选 ${(coverImageCandidates?.count ?? 0)} 张。` },
          { label: "支持单", value: String(supportCount?.count ?? 0), note: "来自 /support 页的联系与问题提交。" },
          { label: "外采异常", value: String(recentExternalIncidents.length), note: `降级抓取 ${degradedCaptureJobs.length} 条，热点抓取失败 ${failedTopicFetchJobs.length} 条。` },
        ]}
        panels={[
          { title: "用户与权限", description: "默认管理账号固定为 huozi，普通用户不开放自助注册，所有账号都走后台发放。", meta: "Users" },
          { title: "背景卡治理", description: "冲突、过期、低置信度背景卡可以在后台统一重编译和调整状态。", meta: "Knowledge" },
          { title: "审计日志", description: "后台可以按动作、目标类型和操作人回看关键改动，避免把配置治理和业务动作混在口头描述里。", meta: "Audit" },
          { title: "Prompt 版本", description: `当前共 ${prompts.length} 条 Prompt 版本记录，正在生效的版本 ${activePromptVersions} 条。`, meta: "Prompts" },
          { title: "模型与路由", description: `当前维护 ${routes.length} 条模型路由，套餐结构已初始化 ${plans.length} 档。`, meta: "Admin" },
          { title: "经营面", description: `当前激活用户 ${business.activeUserCount} 个，已发布稿件 ${business.publishedArticleCount} 篇，系列总数 ${business.seriesCount} 个。`, meta: "Growth" },
          { title: "生图 AI 引擎", description: imageEngine.hasApiKey ? `当前默认模型 ${imageEngine.model}，最后更新于 ${imageEngine.updatedAt ? new Date(imageEngine.updatedAt).toLocaleString("zh-CN") : "未记录"}。` : "全局生图引擎尚未配置，封面图生成会失败。", meta: "Image" },
          { title: "图片资产存储", description: imageAssetTotal > 0 ? `当前共沉淀 ${imageAssetTotal} 条图片资产记录，提供方分布：${imageProviderSummary}。` : "当前还没有沉淀图片资产，封面图生成后会在这里呈现。", meta: "Storage" },
        ]}
      />
      <section className="grid gap-4 xl:grid-cols-3">
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Celery 任务队列</div>
          <h2 className={adminSectionTitleClassName}>后台任务运行态</h2>
          <div className="mt-6 grid gap-3 text-sm text-adminInkSoft">
            <div className={cn(adminInsetCardBodyClassName, "flex items-center justify-between")}>
              <span>Queued</span>
              <span>{queueSummary.get("queued") ?? 0}</span>
            </div>
            <div className={cn(adminInsetCardBodyClassName, "flex items-center justify-between")}>
              <span>Running</span>
              <span>{queueSummary.get("running") ?? 0}</span>
            </div>
            <div className={cn(adminInsetCardBodyClassName, "flex items-center justify-between")}>
              <span>Completed</span>
              <span>{queueSummary.get("completed") ?? 0}</span>
            </div>
            <div className={cn(adminInsetCardBodyClassName, "flex items-center justify-between text-cinnabar")}>
              <span>Failed</span>
              <span>{queueSummary.get("failed") ?? 0}</span>
            </div>
          </div>
        </article>
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Token 刷新引擎状态</div>
          <h2 className={adminSectionTitleClassName}>公众号连接健康度</h2>
          <div className="mt-6 space-y-3 text-sm text-adminInkSoft">
            <div className={adminInsetCardBodyClassName}>即将过期（24h 内）：{expiringTokens?.count ?? 0}</div>
            <div className={adminInsetCardBodyClassName}>已过期：{expiredTokens?.count ?? 0}</div>
            <div className={adminInsetCardBodyClassName}>凭证失效：{invalidTokens?.count ?? 0}</div>
            <div className={adminInsetCardBodyClassName}>
              当前异常总量：{(expiredTokens?.count ?? 0) + (invalidTokens?.count ?? 0)}
            </div>
          </div>
        </article>
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>System Pulse</div>
          <h2 className={adminSectionTitleClassName}>运行提醒</h2>
          <ul className="mt-6 space-y-3 text-sm leading-7 text-adminInkSoft">
            <li>失败任务 {failedJobs.length} 条，优先检查知识刷新与热点抓取。</li>
            <li>微信失败推送 {failedSyncs.length} 条，建议先排查 token 与草稿内容。</li>
            <li>最近审计动作 {recentAuditLogs.length} 条，可回看后台治理操作。</li>
          </ul>
        </article>
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>External Fetch</div>
          <h2 className={adminSectionTitleClassName}>外采稳定性</h2>
          <div className="mt-6 space-y-3 text-sm text-adminInkSoft">
            <div className={adminInsetCardBodyClassName}>抓取降级：{degradedCaptureJobs.length}</div>
            <div className={adminInsetCardBodyClassName}>待重试 URL 采集：{pendingRetryCaptureJobs.length}</div>
            <div className={adminInsetCardBodyClassName}>热点抓取失败：{failedTopicFetchJobs.length}</div>
          </div>
        </article>
        <article className={cn(adminSectionCardClassName, "xl:col-span-2")}>
          <div className={adminSectionEyebrowClassName}>Fetch Incidents</div>
          <h2 className={adminSectionTitleClassName}>最近外采异常</h2>
          <div className="mt-5 space-y-3">
            {recentExternalIncidents.length === 0 ? (
              <div className={adminEmptyStateCardClassName}>最近没有新的外采异常，热点抓取与链接采集都处于正常区间。</div>
            ) : (
              recentExternalIncidents.slice(0, 8).map((job) => {
                const degradedReason =
                  typeof job.payload.degradedReason === "string" && job.payload.degradedReason.trim()
                    ? job.payload.degradedReason.trim()
                    : null;
                const retryFlags = [
                  job.payload.retryUrlFetch ? "retryUrlFetch" : null,
                  job.payload.retryDistill ? "retryDistill" : null,
                ].filter(Boolean) as string[];
                const label =
                  job.job_type === "topicFetch"
                    ? `topicFetch · source #${String(job.payload.sourceId || "-")}`
                    : `capture · fragment #${String(job.payload.fragmentId || "-")}`;
                const title =
                  typeof job.payload.title === "string" && job.payload.title.trim()
                    ? job.payload.title.trim()
                    : typeof job.payload.url === "string" && job.payload.url.trim()
                      ? job.payload.url.trim()
                      : label;
                return (
                  <div key={job.id} className={adminDetailCardClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-adminInk">{title}</div>
                      <div className="text-xs text-adminInkSoft">{new Date(job.updated_at).toLocaleString("zh-CN")}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-adminInkSoft">
                      <span>{label}</span>
                      <span>{job.status}</span>
                      <span>attempts {job.attempts}</span>
                      {retryFlags.map((flag) => (
                        <span key={`${job.id}-${flag}`} className={adminWarningBadgeClassName}>
                          {flag}
                        </span>
                      ))}
                      {degradedReason ? (
                        <span className={adminDangerBadgeClassName}>degraded</span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-xs leading-6 text-adminInkSoft">
                      {job.last_error || degradedReason || "等待重试，无明确错误文案。"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Queue Errors</div>
          <h2 className={adminSectionTitleClassName}>最近失败任务</h2>
          <div className="mt-5 space-y-3">
            {failedJobs.length === 0 ? (
              <div className={adminEmptyStateCardClassName}>当前没有失败任务。</div>
            ) : (
              failedJobs.map((job) => (
                <div key={job.id} className={adminDetailCardClassName}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium text-adminInk">{job.job_type}</div>
                    <div className="text-xs text-adminInkSoft">{new Date(job.updated_at).toLocaleString("zh-CN")}</div>
                  </div>
                  <div className="mt-2 text-xs text-adminInkSoft">Job #{job.id} · attempts {job.attempts}</div>
                  <div className="mt-3 font-mono text-xs leading-6 text-cinnabar">{job.last_error || "未记录错误详情"}</div>
                </div>
              ))
            )}
          </div>
        </article>
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Terminal Logs</div>
          <h2 className={adminSectionTitleClassName}>最近异常与审计</h2>
          <div className={cn("mt-5", adminTerminalCardClassName)}>
            {failedSyncs.length === 0 && recentAuditLogs.length === 0 ? (
              <div>[system] no recent logs</div>
            ) : (
              <>
                {failedSyncs.map((log) => (
                  <div key={`sync-${log.id}`} className="text-cinnabar">
                    [WeChat Sync] {new Date(log.created_at).toLocaleString("zh-CN")} {log.title} :: {log.failure_reason || "未知错误"}
                  </div>
                ))}
                {recentAuditLogs.map((log) => (
                  <div key={`audit-${log.id}`}>
                    [Audit] {new Date(log.created_at).toLocaleString("zh-CN")} {log.action} :: {log.target_type}
                  </div>
                ))}
              </>
            )}
          </div>
        </article>
      </section>
      <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Image Assets</div>
          <h2 className={adminSectionTitleClassName}>图片资产与存储健康</h2>
          <div className="mt-6 space-y-3 text-sm text-adminInkSoft">
            <div className={adminInsetCardBodyClassName}>固化封面：{coverImages?.count ?? 0}</div>
            <div className={adminInsetCardBodyClassName}>候选图片：{coverImageCandidates?.count ?? 0}</div>
            <div className={adminInsetCardBodyClassName}>提供方分布：{imageProviderSummary}</div>
            <div className={adminInsetCardBodyClassName}>
              最近 8 条本地健康：{readyRecentImageAssets}/{recentImageAssets.filter((asset) => asset.storage_provider === "local").length || 0} ready
            </div>
            <div className={adminInsetCardBodyClassName}>
              最近衍生分布：sharp {recentSharpDerivatives} · fallback {recentDerivativeFallbacks}
            </div>
            <div className={adminInsetCardBodyClassName}>
              当前衍生模式：{recentImageAssets[0]?.manifest?.derivativeMode || "未记录"}
            </div>
          </div>
        </article>
        <article className={adminSectionCardClassName}>
          <div className={adminSectionEyebrowClassName}>Recent Image Assets</div>
          <h2 className={adminSectionTitleClassName}>最近图片资产记录</h2>
          <AdminImageAssetMaintenance />
          <div className="mt-5 space-y-3">
            {recentImageAssets.length === 0 ? (
              <div className={adminEmptyStateCardClassName}>当前还没有任何封面图或候选图片资产。</div>
            ) : (
              recentImageAssets.map((asset) => {
                const derivativeMode = asset.manifest?.derivativeMode || "unknown";
                const originalBytes = asset.manifest?.original?.byteLength ?? asset.manifest?.byteLength;
                const compressedBytes = asset.manifest?.compressed?.byteLength ?? null;
                const thumbnailBytes = asset.manifest?.thumbnail?.byteLength ?? null;
                const derivativeWarning = String(asset.manifest?.derivativeWarning || "").trim();
                const healthLabel =
                  asset.health === "ready"
                    ? "ready"
                    : asset.health === "remote"
                      ? "remote"
                      : asset.health === "missing-meta"
                        ? "missing-meta"
                        : "missing";
                return (
                  <div key={`${asset.asset_scope}-${asset.id}`} className={adminDetailCardClassName}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-medium text-adminInk">
                        {asset.asset_scope === "cover" ? "已选封面" : `候选图 · ${asset.variant_label || "未命名"}`}
                      </div>
                      <div className="text-xs text-adminInkSoft">{new Date(asset.created_at).toLocaleString("zh-CN")}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-adminInkSoft">
                      <span>doc #{asset.article_id ?? "draft"}</span>
                      <span>{asset.storage_provider || "unknown"}</span>
                      <span>{derivativeMode}</span>
                      <span>{formatBytes(originalBytes)}</span>
                      <span className={getImageAssetHealthBadgeClassName(asset.health)}>{healthLabel}</span>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className={adminAssetMetaCardClassName}>
                        <div className="uppercase tracking-[0.18em] text-adminInkSoft">Original</div>
                        <div className="mt-2 text-adminInkSoft">{formatDimensions(asset.manifest?.original?.width, asset.manifest?.original?.height)}</div>
                        <div>{formatBytes(originalBytes)}</div>
                        <div>{asset.manifest?.original?.contentType || asset.manifest?.contentType || "未记录格式"}</div>
                      </div>
                      <div className={adminAssetMetaCardClassName}>
                        <div className="uppercase tracking-[0.18em] text-adminInkSoft">Compressed</div>
                        <div className="mt-2 text-adminInkSoft">{formatDimensions(asset.manifest?.compressed?.width, asset.manifest?.compressed?.height)}</div>
                        <div>{formatBytes(compressedBytes)}</div>
                        <div>{asset.manifest?.compressed?.contentType || "未记录格式"}</div>
                      </div>
                      <div className={adminAssetMetaCardClassName}>
                        <div className="uppercase tracking-[0.18em] text-adminInkSoft">Thumbnail</div>
                        <div className="mt-2 text-adminInkSoft">{formatDimensions(asset.manifest?.thumbnail?.width, asset.manifest?.thumbnail?.height)}</div>
                        <div>{formatBytes(thumbnailBytes)}</div>
                        <div>{asset.manifest?.thumbnail?.contentType || "未记录格式"}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-adminInkSoft">
                      <span>压缩收益 {formatCompressionDelta(originalBytes, compressedBytes)}</span>
                      <span>source {asset.manifest?.sourceKind || "unknown"}</span>
                    </div>
                    <div className="mt-3 text-xs leading-6 text-adminInkSoft">
                      {asset.compressed_object_key || asset.manifest?.compressed?.objectKey || "未记录 compressed object key"}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-adminInkSoft">
                      {asset.image_url}
                    </div>
                    {derivativeWarning ? (
                      <div className={cn("mt-3", adminWarningNoticeClassName)}>
                        衍生降级：{derivativeWarning}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </article>
      </section>
      <section className={adminSectionCardClassName}>
        <div className={adminSectionEyebrowClassName}>Default Sources</div>
        <h2 className={adminSectionTitleClassName}>系统默认信息源</h2>
        <div className={adminSectionDescriptionClassName}>
          运营后台在这里维护全局默认信源，新增后会立即尝试同步一轮热点；普通作者只能在此基础上叠加自己的自定义源。
        </div>
        <div className="mt-5">
          <AdminTopicSourcesClient
            sources={adminTopicSources.map((source) => ({
              id: source.id,
              name: source.name,
              homepageUrl: source.homepage_url,
              sourceType: source.source_type ?? "news",
              priority: source.priority ?? 100,
              isActive: Boolean(source.is_active),
              lastFetchedAt: source.last_fetched_at,
              recentFailureCount: topicSourceFailureMap.get(source.id)?.count ?? 0,
              latestFailure: topicSourceFailureMap.get(source.id)?.latestError ?? null,
              createdAt: source.created_at,
              updatedAt: source.updated_at,
            }))}
            recentRuns={recentTopicSyncRuns.map((run) => ({
              id: run.id,
              syncWindowStart: run.sync_window_start,
              syncWindowLabel: run.sync_window_label,
              status: run.status,
              scheduledSourceCount: run.scheduled_source_count,
              enqueuedJobCount: run.enqueued_job_count,
              completedSourceCount: run.completed_source_count,
              failedSourceCount: run.failed_source_count,
              insertedItemCount: run.inserted_item_count,
              lastError: run.last_error,
              triggeredAt: run.triggered_at,
              finishedAt: run.finished_at,
            }))}
          />
        </div>
      </section>
      <section className={adminSectionCardClassName}>
        <div className={adminSectionEyebrowClassName}>Support Inbox</div>
        <h2 className={adminSectionTitleClassName}>最近支持消息</h2>
        <div className="mt-5 grid gap-3">
          {supportMessages.length === 0 ? (
            <div className={adminEmptyStateCardClassName}>当前还没有新的支持提交。</div>
          ) : (
            supportMessages.map((message) => (
              <div key={message.id} className={adminDetailCardClassName}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="font-medium text-adminInk">{message.name} · {message.email}</div>
                  <div className="text-xs text-adminInkSoft">{new Date(message.created_at).toLocaleString("zh-CN")}</div>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-cinnabar">{message.issue_type}</div>
                <div className="mt-3 text-sm leading-7 text-adminInkSoft">{message.description}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
