import Link from "next/link";
import { requireWriterSession } from "@/lib/page-auth";
import { getAffiliateOverview, getDocumentsByUser, getPlans, getWechatSyncLogs } from "@/lib/repositories";

export default async function AffiliatePage() {
  const { session, user } = await requireWriterSession();
  const [documents, logs, plans, affiliate] = await Promise.all([
    getDocumentsByUser(session.userId),
    getWechatSyncLogs(session.userId),
    getPlans(),
    getAffiliateOverview(session.userId),
  ]);

  const publicPlans = plans.filter((plan) => Boolean(plan.is_public));
  const publishedDocuments = documents.filter((document) => document.status === "published").length;
  const successLogs = logs.filter((log) => log.status === "success").length;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">Affiliate Structure</div>
        <h1 className="mt-4 font-serifCn text-4xl text-ink">分销页现在使用真实归因关系出数，管理员建号时可直接绑定推荐码。</h1>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["推荐码", affiliate.referralCode, "创建用户时填写该码，系统会把推荐关系写入用户表。"],
            ["已归因用户", String(affiliate.referredUserCount), "所有被你推荐并由管理员手动绑定来源的用户。"],
            ["付费转化", String(affiliate.activePaidReferralCount), "当前仍在有效订阅中的已归因付费用户数。"],
            ["预计月佣金", `￥${affiliate.estimatedMonthlyCommissionCny}`, "按当前有效订阅价格的 30% 估算，不含真实结算。"],
            ["已发布文稿", String(publishedDocuments), "先看你是否真的在用产品产出内容。"],
            ["公众号成功推送", String(successLogs), "真实推送越多，越适合做创作者推荐案例。"],
          ].slice(0, 6).map(([label, value, note]) => (
            <article key={label} className="border border-stone-300/40 bg-[#faf7f0] p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
              <div className="mt-3 font-serifCn text-4xl text-ink">{value}</div>
              <p className="mt-3 text-sm leading-7 text-stone-700">{note}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="border border-stone-300/40 p-5">
            <div className="text-sm leading-7 text-stone-700">
              当前可对外推荐的公开套餐共 {publicPlans.length} 档。因为 v1 还没有接入真实支付与自动结算，所以这里展示的是“已归因用户 + 当前订阅状态 + 预计月佣金”，不生成假交易流水。
            </div>
          </div>
          <div className="border border-stone-300/40 bg-[#f8f3ea] p-5 text-sm leading-7 text-stone-700">
            <div>当前账号：{user.display_name || user.username}</div>
            <div>累计付费归因：{affiliate.paidReferralCount}</div>
            <div>公开套餐数：{publicPlans.length}</div>
          </div>
        </div>
        <div className="mt-6 border border-stone-300/40 bg-white">
          <div className="border-b border-stone-300/40 px-5 py-4 text-xs uppercase tracking-[0.24em] text-stone-500">归因明细</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f7f2e9] text-stone-500">
                <tr>
                  {["用户", "显示名", "套餐", "状态", "预计月佣金", "绑定时间"].map((head) => (
                    <th key={head} className="px-5 py-3 font-medium">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {affiliate.referrals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-stone-500">
                      还没有归因用户。把你的推荐码发给管理员，在创建账号时绑定即可。
                    </td>
                  </tr>
                ) : (
                  affiliate.referrals.map((item) => (
                    <tr key={item.id} className="border-t border-stone-200">
                      <td className="px-5 py-4 text-ink">{item.username}</td>
                      <td className="px-5 py-4 text-stone-600">{item.display_name || "-"}</td>
                      <td className="px-5 py-4 text-stone-600">{item.plan_name || item.plan_code}</td>
                      <td className="px-5 py-4 text-stone-600">{item.subscription_status}</td>
                      <td className="px-5 py-4 text-stone-600">
                        {item.plan_code !== "free" && item.subscription_status === "active" ? `￥${Math.round((item.price_cny ?? 0) * 0.3)}` : "￥0"}
                      </td>
                      <td className="px-5 py-4 text-stone-600">{new Date(item.created_at).toLocaleDateString("zh-CN")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
        <div className="text-xs uppercase tracking-[0.24em] text-stone-500">推荐动作</div>
        <div className="mt-4 space-y-3 text-sm text-stone-700">
          <div className="border border-stone-300 bg-white px-4 py-3">专属推荐码：{affiliate.referralCode}</div>
          <div className="border border-stone-300 bg-white px-4 py-3">归因方式：管理员创建用户时填写推荐码</div>
          <div className="border border-stone-300 bg-white px-4 py-3">结算口径：有效付费订阅价格的 30% 预计月佣金</div>
        </div>
        <div className="mt-5 space-y-3">
          <Link href="/pricing" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
            查看公开套餐页
          </Link>
          <Link href="/sync/logs" className="block border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white">
            查看你的发布记录
          </Link>
        </div>
      </aside>
    </section>
  );
}
