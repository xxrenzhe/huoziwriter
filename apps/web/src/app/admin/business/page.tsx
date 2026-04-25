import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { requireAdminSession } from "@/lib/page-auth";
import { getAdminBusinessOverview } from "@/lib/repositories";

const adminPanelClassName = cn(
  surfaceCardStyles(),
  "border-adminLineStrong bg-adminSurface text-adminInk shadow-none",
);
const adminMetricCardClassName = cn(adminPanelClassName, "bg-adminSurfaceAlt p-5");
const adminSectionCardClassName = cn(adminPanelClassName, "p-6");
const adminMetricEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminInkMuted";
const adminHeroEyebrowClassName = "text-xs uppercase tracking-[0.24em] text-adminAccent";
const adminMetricValueClassName = "mt-3 font-serifCn text-4xl text-adminInk text-balance";
const adminSectionTitleClassName = "mt-4 font-serifCn text-4xl text-adminInk text-balance";
const adminDescriptionClassName = "mt-4 text-sm leading-7 text-adminInkSoft";
const adminTableCellClassName = "px-4 py-4";
const adminBusinessTableShellClassName = "hidden overflow-x-auto md:block";
const adminBusinessMobileListClassName = "mt-4 grid gap-3 md:hidden";
const adminBusinessMobileCardClassName = cn(surfaceCardStyles({ padding: "md" }), "border-adminLineStrong bg-adminSurfaceMuted text-adminInk shadow-none");

export default async function AdminBusinessPage() {
  await requireAdminSession();
  const overview = await getAdminBusinessOverview();
  const businessMetrics = [
    ["总用户数", String(overview.userCount), "已开通账号总量"],
    ["激活用户", String(overview.activeUserCount), "当前仍处于启用状态的账号数"],
    ["稿件总数", String(overview.articleCount), "当前库中已创建稿件数"],
    ["已发布稿件", String(overview.publishedArticleCount), "已经完成发布的稿件数"],
    ["碎片资产", String(overview.fragmentCount), "当前沉淀进库的长期写作资产"],
    ["微信成功同步", String(overview.successSyncCount), "已写入草稿箱的发布次数"],
    ["系列总数", String(overview.seriesCount), "已建立的长期作者系列数量"],
  ] as const;
  const businessRatios = [
    ["启用率", `${overview.userCount > 0 ? Math.round((overview.activeUserCount / overview.userCount) * 100) : 0}%`, "启用用户 / 总用户"],
    ["发布转化", `${overview.articleCount > 0 ? Math.round((overview.publishedArticleCount / overview.articleCount) * 100) : 0}%`, "已发布稿件 / 总稿件"],
    ["系列密度", `${overview.userCount > 0 ? (overview.seriesCount / overview.userCount).toFixed(1) : "0.0"}`, "系列总数 / 总用户"],
    ["同步履约", String(overview.successSyncCount), "已成功写入公众号草稿箱的次数"],
  ] as const;

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
        {businessMetrics.map(([label, value, note]) => (
          <article key={label} className={adminMetricCardClassName}>
            <div className={adminMetricEyebrowClassName}>{label}</div>
            <div className={adminMetricValueClassName}>{value}</div>
            <p className={adminDescriptionClassName}>{note}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className={cn(adminSectionCardClassName, "bg-adminBg")}>
          <div className={adminHeroEyebrowClassName}>内容主链路</div>
          <div className={adminSectionTitleClassName}>{overview.publishedArticleCount}</div>
          <p className={adminDescriptionClassName}>
            当前已经真正走到发布阶段的稿件数。这里不再统计推荐归因，业务视角回到内容生产、资产沉淀与发布履约本身。
          </p>
        </article>
        <article className={adminSectionCardClassName}>
          <div className={adminMetricEyebrowClassName}>经营口径</div>
          <div className={adminBusinessMobileListClassName}>
            {businessRatios.map(([label, value, note]) => (
              <article key={label} className={adminBusinessMobileCardClassName}>
                <div className={adminMetricEyebrowClassName}>{label}</div>
                <div className="mt-3 font-serifCn text-3xl text-adminInk text-balance">{value}</div>
                <p className="mt-3 text-sm leading-7 text-adminInkSoft">{note}</p>
              </article>
            ))}
          </div>
          <div className={adminBusinessTableShellClassName}>
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-adminBg text-adminInkMuted">
                <tr>
                  {["指标", "当前数值", "说明"].map((head) => (
                    <th key={head} className="px-4 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {businessRatios.map(([label, value, note]) => (
                  <tr key={label} className="border-t border-adminLineStrong">
                    <td className={cn(adminTableCellClassName, "text-adminInk")}>{label}</td>
                    <td className={cn(adminTableCellClassName, "text-adminInkSoft")}>{value}</td>
                    <td className={cn(adminTableCellClassName, "text-adminInkSoft")}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
