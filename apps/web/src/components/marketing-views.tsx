import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

type FeatureItem = {
  title: string;
  description: string;
  meta?: string;
};

type PricingPlan = {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  featured?: boolean;
};

export function MarketingHero() {
  return (
    <section className="relative overflow-hidden border border-stone-300/40 bg-[rgba(255,255,255,0.66)] px-6 py-12 shadow-ink md:px-10 md:py-16">
      <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top,rgba(167,48,50,0.12),transparent_60%)] md:block" />
      <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_420px]">
        <div>
          <div className="inline-flex items-center gap-2 border border-cinnabar/30 bg-cinnabar/5 px-4 py-2 text-xs uppercase tracking-[0.28em] text-cinnabar">
            <Sparkles size={14} />
            彻底反抗机器味的写作引擎
          </div>
          <h1 className="mt-6 max-w-4xl font-serifCn text-5xl font-semibold leading-tight text-ink md:text-7xl">
            告别机器腔调，把素材、结构与语感重新装回中文写作。
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-stone-700 md:text-lg">
            Huozi Writer 把素材采集、语言守卫规则、作战台、六步稿件页和微信草稿箱真实推送接到同一条生产线，服务公众号作者、研究写作者和内容团队。
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/support?type=business" className="bg-cinnabar px-6 py-3 text-sm font-medium text-white">
              申请试用资格
            </Link>
            <Link href="/pricing" className="border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-ink">
              查看写作资产能力
            </Link>
            <Link href="/manifesto" className="border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-ink">
              阅读独立开发者宣言
            </Link>
          </div>
        </div>
        <div className="border border-stone-300/50 bg-[#f4efe6] p-6">
          <div className="grid gap-4">
            <div className="border-l-4 border-stone-300 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">普通 AI</div>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                不可否认，在这个瞬息万变的时代，我们需要从更高颗粒度去理解底层逻辑。
              </p>
            </div>
            <div className="border-l-4 border-cinnabar bg-[#fffdfa] p-5 shadow-ink">
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">活字输出</div>
              <p className="mt-3 text-sm leading-7 text-stone-700">
                行业在降价，利润在出血。你还在用旧句式给现实抹粉。
              </p>
            </div>
            <div className="grid gap-3 border border-stone-300/50 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">v1 真实能力</div>
              <ul className="space-y-2 text-sm text-stone-700">
                <li>微信草稿箱真实推送</li>
                <li>运营后台发号，不开放自助注册</li>
                <li>Prompt 版本化管理</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EditorialFeatureGrid({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: FeatureItem[];
}) {
  return (
    <section className="mt-14">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Core System</div>
        <h2 className="mt-4 font-serifCn text-4xl font-semibold text-ink">{title}</h2>
        <p className="mt-4 text-base leading-8 text-stone-700">{description}</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.title} className="border border-stone-300/40 bg-white p-6 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{item.meta ?? "核心模块"}</div>
            <h3 className="mt-4 font-serifCn text-2xl font-semibold text-ink">{item.title}</h3>
            <p className="mt-4 text-sm leading-7 text-stone-700">{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PricingMatrix({ plans }: { plans: PricingPlan[] }) {
  return (
    <section className="mt-14">
      <div className="max-w-3xl">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Pricing</div>
        <h2 className="mt-4 font-serifCn text-4xl font-semibold text-ink">把基础排版体验留给所有人，把高阶能力做成阶梯。</h2>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={`border p-6 ${
              plan.featured
                ? "border-cinnabar bg-cinnabar text-white"
                : "border-stone-300/40 bg-white text-ink"
            }`}
          >
            <div className="text-xs uppercase tracking-[0.26em] opacity-70">{plan.tagline}</div>
            <h3 className="mt-4 font-serifCn text-3xl font-semibold">{plan.name}</h3>
            <div className="mt-4 text-3xl">{plan.price}</div>
            <ul className="mt-6 space-y-3 text-sm leading-7">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <Check size={16} className="mt-1 shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
