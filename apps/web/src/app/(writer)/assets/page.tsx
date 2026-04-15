import Link from "next/link";
import { WriterOverview } from "@/components/writer-views";
import { hasAuthorPersona } from "@/lib/author-personas";
import { requireWriterSession } from "@/lib/page-auth";
import { getImageAssetStorageQuotaStatus } from "@/lib/plan-access";
import { getAssetFilesByUser } from "@/lib/repositories";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "暂未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(value: number | null | undefined) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "未知";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

function formatAssetScope(value: string) {
  if (value === "candidate") return "候选图";
  return "已选封面";
}

export default async function AssetsPage() {
  const { session } = await requireWriterSession();
  if (!(await hasAuthorPersona(session.userId))) {
    return null;
  }

  const assets = await getAssetFilesByUser(session.userId);
  const storageQuota = await getImageAssetStorageQuotaStatus(session.userId);
  const readyCount = assets.filter((item) => item.status === "ready").length;
  const candidateCount = assets.filter((item) => item.asset_scope === "candidate").length;
  const coverCount = assets.filter((item) => item.asset_scope === "cover").length;
  const storageUsagePercent =
    storageQuota.limitBytes > 0 ? Math.min(100, Math.round((storageQuota.usedBytes / storageQuota.limitBytes) * 100)) : 0;

  return (
    <div className="space-y-8">
      <WriterOverview
        eyebrow="图片资产"
        title="封面候选、已选封面和对象存储键，应该被当成正式资产管理。"
        description="这里聚合每一次封面图生成留下的图片资产记录，方便你回看来源文稿、复用历史封面，或排查对象存储是否已经正确落盘。"
        metrics={[
          { label: "总资产数", value: String(assets.length), note: "候选图和最终选中图都会在这里留下记录。" },
          { label: "已就绪", value: String(readyCount), note: readyCount > 0 ? "这些图片已经有可访问链接。" : "当前还没有可访问的图片资产。" },
          { label: "候选 / 已选", value: `${candidateCount} / ${coverCount}`, note: "先生成候选，再把最终入选封面固化为正式资产。" },
          { label: "空间占用", value: `${formatBytes(storageQuota.usedBytes)} / ${formatBytes(storageQuota.limitBytes)}`, note: "按唯一对象键去重统计，避免候选图与已选封面重复计费。" },
        ]}
        cards={[
          { title: "先看是否可访问", description: "公共 URL、压缩图和缩略图是否齐全，决定了后续发布能否稳定取图。", meta: "Storage" },
          { title: "再看资产归属", description: "每张图片都应该知道它来自哪篇文稿、哪一轮生成。", meta: "Ownership" },
          { title: "最后再复用", description: "历史封面是可复用资产，不该只是生成瞬间的临时结果。", meta: "Reuse" },
        ]}
      />

      <section className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">资产清单</div>
            <div className="mt-3 font-serifCn text-3xl text-ink">当前共沉淀 {assets.length} 条图片资产记录。</div>
            <div className="mt-3 text-sm leading-7 text-stone-700">
              没有图片时，先到编辑器或工作台生成封面图；生成后候选图和最终选中图都会出现在这里。当前图片资产空间已用 {formatBytes(storageQuota.usedBytes)} / {formatBytes(storageQuota.limitBytes)}。
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
              返回工作台
            </Link>
            <Link href="/discover" className="border border-stone-300 bg-white px-4 py-3 text-sm text-ink">
              查看模板与排版基因
            </Link>
          </div>
        </div>

        <div className="mt-6 border border-stone-300/40 bg-[#fcfaf4] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-700">
            <span>图片资产空间</span>
            <span>{formatBytes(storageQuota.usedBytes)} / {formatBytes(storageQuota.limitBytes)}</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden border border-stone-200 bg-[#f4efe6]">
            <div className="h-full bg-cinnabar transition-all" style={{ width: `${storageUsagePercent}%` }} />
          </div>
          <div className="mt-3 text-xs leading-6 text-stone-500">
            当前剩余 {formatBytes(storageQuota.remainingBytes)}，唯一对象 {storageQuota.uniqueObjectCount} 个，ready 资产记录 {storageQuota.readyAssetRecordCount} 条。
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.length > 0 ? assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden border border-stone-300/40 bg-[#faf7f0]">
              <div className="aspect-[4/3] border-b border-stone-300/40 bg-[#f1ebdf]">
                {asset.public_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.public_url} alt={asset.document_title || `Asset ${asset.id}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-sm leading-7 text-stone-500">当前没有可访问图片链接。</div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
                  <span>{formatAssetScope(asset.asset_scope)}</span>
                  <span className="border border-stone-300 bg-white px-2 py-1">{asset.status}</span>
                  <span>{asset.storage_provider || "local"}</span>
                </div>
                <div className="mt-3 font-serifCn text-2xl text-ink">{asset.document_title || "未绑定文稿"}</div>
                <div className="mt-3 space-y-2 text-sm leading-7 text-stone-700">
                  <div>变体：{asset.variant_label || "默认"}</div>
                  <div>批次：{asset.batch_token || "无"}</div>
                  <div>体积：{formatBytes(asset.byte_length)}</div>
                  <div>MIME：{asset.mime_type || "未知"}</div>
                </div>
                <div className="mt-4 space-y-2 text-xs leading-6 text-stone-500">
                  <div>原图键：{asset.original_object_key || "未记录"}</div>
                  <div>压缩图键：{asset.compressed_object_key || "未记录"}</div>
                  <div>缩略图键：{asset.thumbnail_object_key || "未记录"}</div>
                  <div>更新时间：{formatDateTime(asset.updated_at)}</div>
                </div>
              </div>
            </article>
          )) : (
            <div className="col-span-full border border-dashed border-stone-300 bg-[#fffdfa] px-5 py-6 text-sm leading-7 text-stone-600">
              还没有任何图片资产。先去任意文稿生成一次封面图，这里就会开始积累候选图和已选封面。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
