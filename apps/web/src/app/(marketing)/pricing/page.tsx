import Link from "next/link";
import { PricingMatrix } from "@/components/marketing-views";
import { canUseCoverImageReference, getCoverImageDailyLimit } from "@/lib/plan-access";
import { getPlans } from "@/lib/repositories";

function planFeatures(plan: {
  code: string;
  daily_generation_limit: number | null;
  fragment_limit: number | null;
  custom_banned_word_limit: number | null;
  max_wechat_connections: number | null;
  can_fork_genomes: number | boolean;
  can_publish_genomes: number | boolean;
  can_generate_cover_image: number | boolean;
  can_export_pdf: number | boolean;
}) {
  const features = [
    plan.fragment_limit == null ? "无限碎片容量" : `${plan.fragment_limit} 条碎片上限`,
    plan.daily_generation_limit == null ? "生成次数不限" : `每日 ${plan.daily_generation_limit} 次生成`,
    plan.custom_banned_word_limit == null ? "自定义死刑词不限" : `自定义死刑词 ${plan.custom_banned_word_limit} 个`,
    plan.max_wechat_connections == null
      ? "公众号连接不限"
      : plan.max_wechat_connections === 0
        ? "不支持公众号推送"
        : `${plan.max_wechat_connections} 个公众号连接`,
  ];

  if (plan.can_fork_genomes) {
    features.push("支持 Fork 排版基因");
  }
  if (plan.can_publish_genomes) {
    features.push("支持发布公开基因");
  }
  if (plan.can_generate_cover_image) {
    const coverImageLimit = getCoverImageDailyLimit(plan.code as "free" | "pro" | "ultra" | "team");
    features.push(coverImageLimit > 0 ? `封面图 ${coverImageLimit} 次/天` : "支持真实封面图生成");
    if (canUseCoverImageReference(plan.code as "free" | "pro" | "ultra" | "team")) {
      features.push("支持参考图垫图");
    }
  } else {
    features.push("仅提供文本配图建议");
  }
  if (plan.can_export_pdf) {
    features.push("支持 PDF 导出");
  }

  return features.slice(0, 6);
}

function planPrice(priceCny: number, code: string) {
  if (code === "team") {
    return priceCny > 0 ? `￥${priceCny}/月起` : "定制";
  }
  return priceCny > 0 ? `￥${priceCny}/月` : "￥0";
}

function planTagline(code: string) {
  if (code === "free") return "Free";
  if (code === "pro") return "Pro";
  if (code === "ultra") return "Ultra";
  if (code === "team") return "Team";
  return code.toUpperCase();
}

function planOrder(code: string) {
  if (code === "free") return 0;
  if (code === "pro") return 1;
  if (code === "ultra") return 2;
  if (code === "team") return 3;
  return 9;
}

export default async function PricingPage() {
  const plans = (await getPlans())
    .filter((plan) => Boolean(plan.is_public))
    .sort((left, right) => planOrder(left.code) - planOrder(right.code));

  return (
    <div className="space-y-10">
      <section className="max-w-4xl border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Pricing & Access</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">套餐决定次数、容量和高级功能，不决定底层模型。</h1>
        <p className="mt-4 text-base leading-8 text-stone-700">
          活字全站统一走后台场景模型路由。套餐差异只体现在生成次数、碎片容量、公众号连接额度、基因集市权限、封面图和 PDF 等高级能力，不按付费档位切换成不同模型。
        </p>
      </section>

      <PricingMatrix
        plans={plans.map((plan) => ({
          name: plan.name,
          price: planPrice(plan.price_cny, plan.code),
          tagline: planTagline(plan.code),
          features: planFeatures(plan),
          featured: plan.code === "pro",
        }))}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">统一模型原则</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>碎片提纯、截图理解和热点处理统一走 Gemini 3.0 场景路由。</p>
            <p>正文生成统一走 Claude 4.6 写作链路，死刑词复勘统一走 GPT-5.4。</p>
            <p>封面图统一走管理员维护的全局生图引擎，不要求用户单独配置密钥。</p>
            <p>因此升级套餐买到的是更高配额和更完整工作流，不是“换一套模型皮肤”。</p>
          </div>
        </article>
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">开通方式</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>当前版本不开放自助注册，所有账号都由管理员手动创建。</p>
            <p>如果你需要试用、升级或团队开通，请直接联系支持。</p>
            <p>后台可手动调整套餐、状态、到期时间和推荐归因关系。</p>
          </div>
          <div className="mt-5 space-y-3">
            <Link href="/support?type=billing" className="block border border-cinnabar bg-cinnabar px-4 py-3 text-sm text-white">
              联系支持开通
            </Link>
            <Link href="/manifesto" className="block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
              阅读产品宣言
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
