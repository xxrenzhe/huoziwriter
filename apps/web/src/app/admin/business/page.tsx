import { requireAdminSession } from "@/lib/page-auth";
import { getAdminBusinessOverview } from "@/lib/repositories";

export default async function AdminBusinessPage() {
  await requireAdminSession();
  const overview = await getAdminBusinessOverview();

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["总用户数", String(overview.userCount), "后台手动发号的总量"],
          ["激活用户", String(overview.activeUserCount), "当前仍处于启用状态的账号数"],
          ["稿件总数", String(overview.articleCount), "当前库中已创建稿件数"],
          ["已发布稿件", String(overview.publishedArticleCount), "已经完成发布的稿件数"],
          ["碎片资产", String(overview.fragmentCount), "当前沉淀进库的长期写作资产"],
          ["微信成功同步", String(overview.successSyncCount), "已写入草稿箱的发布次数"],
          ["系列总数", String(overview.seriesCount), "已建立的长期作者系列数量"],
        ].map(([label, value, note]) => (
          <article key={label} className="border border-stone-800 bg-[#171718] p-5">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
            <div className="mt-3 font-serifCn text-4xl text-stone-100">{value}</div>
            <p className="mt-3 text-sm leading-7 text-stone-400">{note}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">内容主链路</div>
          <div className="mt-4 font-serifCn text-4xl text-stone-100">{overview.publishedArticleCount}</div>
          <p className="mt-4 text-sm leading-7 text-stone-400">
            当前已经真正走到发布阶段的稿件数。这里不再统计推荐归因，业务视角回到内容生产、资产沉淀与发布履约本身。
          </p>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">经营口径</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-stone-950 text-stone-500">
                <tr>
                  {["指标", "当前数值", "说明"].map((head) => (
                    <th key={head} className="px-4 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["启用率", `${overview.userCount > 0 ? Math.round((overview.activeUserCount / overview.userCount) * 100) : 0}%`, "启用用户 / 总用户"],
                  ["发布转化", `${overview.articleCount > 0 ? Math.round((overview.publishedArticleCount / overview.articleCount) * 100) : 0}%`, "已发布稿件 / 总稿件"],
                  ["系列密度", `${overview.userCount > 0 ? (overview.seriesCount / overview.userCount).toFixed(1) : "0.0"}`, "系列总数 / 总用户"],
                  ["同步履约", String(overview.successSyncCount), "已成功写入公众号草稿箱的次数"],
                ].map(([label, value, note]) => (
                  <tr key={label} className="border-t border-stone-800">
                    <td className="px-4 py-4 text-stone-100">{label}</td>
                    <td className="px-4 py-4 text-stone-400">{value}</td>
                    <td className="px-4 py-4 text-stone-400">{note}</td>
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
