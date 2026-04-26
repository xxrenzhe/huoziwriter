import { requireAdminSession } from "@/lib/page-auth";
import { getPlans } from "@/lib/repositories";

export default async function AdminFinancePage() {
  await requireAdminSession();
  const plans = await getPlans();
  return (
    <section className="grid gap-4 lg:grid-cols-4">
      {plans.map((plan) => (
        <article
          key={plan.code}
          className={`border p-6 ${plan.code === "pro" ? "border-cinnabar bg-cinnabar text-white" : "border-stone-800 bg-[#171718] text-stone-100"}`}
        >
          <div className="text-xs uppercase tracking-[0.24em] opacity-70">Plan</div>
          <h1 className="mt-4 font-serifCn text-3xl">{plan.name}</h1>
          <div className="mt-4 text-3xl">￥{plan.price_cny}</div>
          <p className="mt-4 text-sm leading-7 opacity-80">
            每日生成：{plan.daily_generation_limit ?? "不限"}<br />
            碎片上限：{plan.fragment_limit ?? "不限"}<br />
            公众号连接：{plan.max_wechat_connections ?? "不限"}
          </p>
        </article>
      ))}
    </section>
  );
}
