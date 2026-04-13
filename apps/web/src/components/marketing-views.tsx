import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Sparkles } from "lucide-react";

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
            告别机器腔调，把碎片、结构与语感重新装回中文写作。
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-8 text-stone-700 md:text-lg">
            Huozi Writer 把碎片采集、死刑词库、四栏工作台、排版基因和微信草稿箱真实推送接到同一条生产线，服务公众号作者、研究写作者和内容团队。
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/support?type=business" className="bg-cinnabar px-6 py-3 text-sm font-medium text-white">
              获取内测资格
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
                <li>管理员发号，不开放自助注册</li>
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

export function CreatorProfile({
  creator,
}: {
  creator: {
    username: string;
    displayName: string | null;
    referralCode: string;
    joinedAt: string;
    publishedDocumentCount: number;
    successSyncCount: number;
    publicGenomeCount: number;
    publicGenomeForkCount: number;
    referredUserCount: number;
    activePaidReferralCount: number;
    estimatedMonthlyCommissionCny: number;
    publicGenomes: Array<{
      id: number;
      name: string;
      description: string | null;
      meta: string | null;
      published_at: string | null;
      created_at: string;
    }>;
  };
}) {
  const displayName = creator.displayName || creator.username;
  return (
    <section className="grid gap-8 border border-stone-300/40 bg-white p-6 shadow-ink md:grid-cols-[320px_minmax(0,1fr)] md:p-8">
      <div className="space-y-4">
        <div className="border border-stone-300/40 bg-[#f3ede1] p-6">
          <div className="text-xs uppercase tracking-[0.26em] text-stone-500">Creator Genome</div>
          <h2 className="mt-4 font-serifCn text-4xl font-semibold text-ink">{displayName}</h2>
          <p className="mt-4 text-sm leading-7 text-stone-700">
            这不是展示空洞人设，而是公开该创作者在 HuoziWriter 内已经沉淀下来的真实写作资产、发布行为和可复用风格。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["公开基因", String(creator.publicGenomeCount)],
            ["被 Fork 次数", String(creator.publicGenomeForkCount)],
            ["已发布文稿", String(creator.publishedDocumentCount)],
            ["微信成功推送", String(creator.successSyncCount)],
          ].map(([label, value]) => (
            <div key={label} className="border border-stone-300/40 bg-white p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{label}</div>
              <div className="mt-3 font-serifCn text-3xl text-ink">{value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        <div className="border border-stone-300/40 bg-[#fffdfa] p-6">
          <div className="text-xs uppercase tracking-[0.26em] text-cinnabar">公开排版基因</div>
          <p className="mt-3 text-sm leading-7 text-stone-700">
            这里展示该创作者已经公开的排版基因。它们来自真实的集市数据，不是营销文案占位。
          </p>
          <div className="mt-5 space-y-3">
            {creator.publicGenomes.length === 0 ? (
              <div className="border border-stone-300/40 bg-white p-4 text-sm leading-7 text-stone-600">
                当前还没有公开排版基因。
              </div>
            ) : (
              creator.publicGenomes.slice(0, 4).map((genome) => (
                <div key={genome.id} className="border border-stone-300/40 bg-white p-4">
                  <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{genome.meta || "排版基因"}</div>
                  <div className="mt-2 font-serifCn text-2xl text-ink">{genome.name}</div>
                  <p className="mt-2 text-sm leading-7 text-stone-700">{genome.description || "暂无说明"}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-stone-300/40 bg-white p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">创作者经营面</div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
              <p>推荐码：{creator.referralCode}</p>
              <p>累计归因用户：{creator.referredUserCount}</p>
              <p>有效付费转化：{creator.activePaidReferralCount}</p>
              <p>预计月佣金：￥{creator.estimatedMonthlyCommissionCny}</p>
              <p>入驻时间：{new Date(creator.joinedAt).toLocaleDateString("zh-CN")}</p>
            </div>
          </div>
          <div className="border border-stone-300/40 bg-white p-6">
            <div className="text-xs uppercase tracking-[0.24em] text-stone-500">操作</div>
            <div className="mt-4 space-y-3 text-sm">
              <Link href="/discover" className="flex items-center justify-between border border-stone-300 px-4 py-3">
                去集市查看全部公开基因
                <ChevronRight size={16} />
              </Link>
              <Link href={`/r/${creator.referralCode}`} className="flex items-center justify-between border border-stone-300 px-4 py-3">
                通过邀请申请试写
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DiagnosticWorkbench() {
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-stone-500">输入草稿</div>
        <div className="mt-4 min-h-[280px] border border-dashed border-stone-300 p-5 text-sm leading-8 text-stone-600">
          不可否认，在这个瞬息万变的时代，企业需要通过更高颗粒度的协同去赋能增长……
        </div>
        <button className="mt-4 bg-stone-900 px-5 py-3 text-sm text-white">开始扫描</button>
      </div>
      <div className="border border-cinnabar/30 bg-[#fffaf8] p-6 shadow-ink">
        <div className="text-xs uppercase tracking-[0.28em] text-cinnabar">扫描结果</div>
        <div className="mt-4 font-serifCn text-5xl text-cinnabar">85%</div>
        <p className="mt-3 text-sm leading-7 text-stone-700">AI 味浓度偏高，重灾区集中在抽象总括、空洞转折与“赋能类”套话。</p>
        <ul className="mt-6 space-y-3 text-sm text-stone-700">
          <li>命中死刑词：不可否认 / 颗粒度 / 瞬息万变</li>
          <li>句式问题：3 处“总而言之”式收尾</li>
          <li>建议动作：改用具体场景，删掉抽象概括</li>
        </ul>
        <Link href="/support?type=business" className="mt-6 inline-flex items-center gap-2 bg-cinnabar px-5 py-3 text-sm text-white">
          申请活字引擎试用
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

export function EditorialArticle({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ title: string; body: string }>;
}) {
  return (
    <article className="mx-auto max-w-3xl border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-12">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">HuoZi Notes</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">{title}</h1>
      </div>
      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="font-serifCn text-2xl font-semibold text-ink">{section.title}</h2>
            <p className="mt-4 text-base leading-9 text-stone-700">{section.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
