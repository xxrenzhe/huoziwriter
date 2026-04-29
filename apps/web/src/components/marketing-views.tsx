import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import Image from "next/image";
import { Check, Sparkles } from "lucide-react";
import { MARKETING_PROJECT_SURFACE_ALT, MARKETING_PROJECT_SURFACE_PATH } from "@/lib/marketing-project-surface";

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

const sectionEyebrowClassName = "text-xs uppercase tracking-[0.3em] text-cinnabar";
const sectionTitleClassName = "mt-4 font-serifCn text-4xl font-semibold text-ink text-balance";
const sectionDescriptionClassName = "mt-4 text-base leading-8 text-inkSoft";
const cardEyebrowClassName = "text-xs uppercase tracking-[0.24em]";
const mutedCardEyebrowClassName = cn(cardEyebrowClassName, "text-inkMuted");
const accentCardEyebrowClassName = cn(cardEyebrowClassName, "text-cinnabar");
const heroSectionClassName = cn(
  "relative overflow-hidden border border-[rgba(88,65,64,0.14)] px-6 py-12 md:px-10 md:py-16",
);
const heroPrimaryActionClassName = buttonStyles({ variant: "primary", size: "lg" });
const heroSecondaryActionClassName = buttonStyles({ variant: "secondary", size: "lg" });
const featureCardClassName = cn(surfaceCardStyles(), "p-6");

function pricingCardClassName(featured = false) {
  return cn(
    surfaceCardStyles(),
    "p-6",
    featured ? "border-cinnabar bg-cinnabar text-white" : "border-lineStrong bg-surface text-ink",
  );
}

function pricingTaglineClassName(featured = false) {
  return cn("text-xs uppercase tracking-[0.26em]", featured ? "text-white" : "text-inkMuted");
}

export function MarketingHero() {
  return (
    <section className={heroSectionClassName}>
      <Image
        src={MARKETING_PROJECT_SURFACE_PATH}
        alt={MARKETING_PROJECT_SURFACE_ALT}
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,19,18,0.80)_0%,rgba(23,19,18,0.58)_40%,rgba(23,19,18,0.18)_74%,rgba(23,19,18,0.06)_100%)]" />
      <div className="relative flex min-h-[72vh] flex-col justify-between gap-12 lg:min-h-[680px]">
        <div className="max-w-4xl pt-4">
          <div className="inline-flex items-center gap-2 border border-white/18 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] text-white/88 backdrop-blur-sm">
            <Sparkles size={14} />
            彻底反抗机器味的写作引擎
          </div>
          <h1 className="mt-6 max-w-4xl font-serifCn text-5xl font-semibold leading-tight text-white md:text-7xl text-balance">
            告别机器腔调，把素材、结构与语感重新装回中文写作。
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-white/80 md:text-lg">
            Huozi Writer 把素材采集、语言守卫规则、作战台、六步稿件页和微信草稿箱真实推送接到同一条生产线，服务公众号作者、研究写作者和内容团队。
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/support?type=business" className={heroPrimaryActionClassName}>
              申请试用资格
            </Link>
            <Link href="/pricing" className={heroSecondaryActionClassName}>
              查看写作资产能力
            </Link>
            <Link href="/manifesto" className={heroSecondaryActionClassName}>
              阅读独立开发者宣言
            </Link>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="border border-white/14 bg-[rgba(20,17,16,0.48)] p-5 text-white backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.24em] text-white/60">普通 AI</div>
            <p className="mt-3 text-sm leading-7 text-white/74">
              不可否认，在这个瞬息万变的时代，我们需要从更高颗粒度去理解底层逻辑。
            </p>
          </div>
          <div className="border border-cinnabar/38 bg-[rgba(167,48,50,0.22)] p-5 text-white backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.24em] text-white/74">活字输出</div>
            <p className="mt-3 text-sm leading-7 text-white/92">
              行业在降价，利润在出血。你还在用旧句式给现实抹粉。
            </p>
          </div>
          <div className="border border-white/14 bg-[rgba(20,17,16,0.48)] p-5 text-white backdrop-blur-sm">
            <div className="text-xs uppercase tracking-[0.24em] text-white/60">核心能力</div>
            <ul className="mt-3 space-y-2 text-sm text-white/78">
              <li>微信草稿箱真实推送</li>
              <li>Prompt 版本化管理</li>
              <li>X 证据板与配图链路</li>
            </ul>
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
        <div className={sectionEyebrowClassName}>Core System</div>
        <h2 className={sectionTitleClassName}>{title}</h2>
        <p className={sectionDescriptionClassName}>{description}</p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <article key={item.title} className={featureCardClassName}>
            <div className={mutedCardEyebrowClassName}>{item.meta ?? "核心模块"}</div>
            <h3 className="mt-4 font-serifCn text-2xl font-semibold text-ink text-balance">{item.title}</h3>
            <p className="mt-4 text-sm leading-7 text-inkSoft">{item.description}</p>
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
        <div className={sectionEyebrowClassName}>Pricing</div>
        <h2 className={sectionTitleClassName}>把基础排版体验留给所有人，把高阶能力做成阶梯。</h2>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-4">
        {plans.map((plan) => (
          <article key={plan.name} className={pricingCardClassName(plan.featured)}>
            <div className={pricingTaglineClassName(plan.featured)}>
              {plan.tagline}
            </div>
            <h3 className="mt-4 font-serifCn text-3xl font-semibold text-balance">{plan.name}</h3>
            <div className="mt-4 text-3xl text-balance">{plan.price}</div>
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
