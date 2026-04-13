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
          ["文稿总数", String(overview.documentCount), "当前库中已创建文稿数"],
          ["碎片资产", String(overview.fragmentCount), "当前沉淀进库的长期写作资产"],
          ["微信成功同步", String(overview.successSyncCount), "已写入草稿箱的发布次数"],
          ["已归因用户", String(overview.referredUserCount), "管理员创建账号时绑定推荐码的用户数"],
          ["预计月佣金", `￥${overview.estimatedMonthlyCommissionCny}`, "按当前有效订阅价格的 30% 估算"],
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
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">分销转化</div>
          <div className="mt-4 font-serifCn text-4xl text-stone-100">{overview.activePaidReferralCount}</div>
          <p className="mt-4 text-sm leading-7 text-stone-400">
            当前仍处于有效付费状态的归因用户数。v1 未接真实支付，因此这里展示的是可审计的内部经营口径。
          </p>
        </article>
        <article className="border border-stone-800 bg-[#171718] p-6">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">分销榜单</div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-stone-950 text-stone-500">
                <tr>
                  {["用户", "推荐码", "归因用户", "有效付费", "预计月佣金"].map((head) => (
                    <th key={head} className="px-4 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.affiliateLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-5 text-stone-500">
                      当前还没有任何推荐归因记录。
                    </td>
                  </tr>
                ) : (
                  overview.affiliateLeaderboard.map((item) => (
                    <tr key={item.userId} className="border-t border-stone-800">
                      <td className="px-4 py-4 text-stone-100">{item.displayName || item.username}</td>
                      <td className="px-4 py-4 font-mono text-xs text-stone-400">{item.referralCode}</td>
                      <td className="px-4 py-4 text-stone-400">{item.referredUserCount}</td>
                      <td className="px-4 py-4 text-stone-400">{item.activePaidReferralCount}</td>
                      <td className="px-4 py-4 text-stone-400">￥{item.estimatedMonthlyCommissionCny}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
