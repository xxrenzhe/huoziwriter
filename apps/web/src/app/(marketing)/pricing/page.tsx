import Link from "next/link";
import { PricingMatrix } from "@/components/marketing-views";
import { isStandardPlanCode } from "@/lib/plan-entitlements";
import type { ResolvedPlanFeatureSnapshot } from "@/lib/plan-entitlements";
import { getPlanMarketingTagline, getPlanSortOrder } from "@/lib/plan-labels";
import { getResolvedPlans } from "@/lib/repositories";

function planFeatures(snapshot: ResolvedPlanFeatureSnapshot) {
  const features = [
    `${snapshot.personaLimit} 个作者人设`,
    `情绪罗盘 Top${snapshot.topicSignalVisibleLimit} 可见`,
    snapshot.customTopicSourceLimit > 0 ? `自定义信源 ${snapshot.customTopicSourceLimit} 个` : "只读系统默认信源",
    snapshot.writingStyleProfileLimit > 0 ? `写作风格资产 ${snapshot.writingStyleProfileLimit} 个` : "文风分析可用，不支持保存资产",
    `排版模板最多 ${snapshot.templateAccessLimit} 个`,
    snapshot.customTemplateLimit > 0 ? `私有模板资产 ${snapshot.customTemplateLimit} 个` : "不支持私有模板提取",
    `文风提取 ${snapshot.writingStyleAnalysisDailyLimit} 次/日`,
    snapshot.fragmentLimit == null ? "无限素材容量" : `${snapshot.fragmentLimit} 条素材上限`,
    snapshot.dailyGenerationLimit == null ? "生成次数不限" : `每日 ${snapshot.dailyGenerationLimit} 次生成`,
    snapshot.maxWechatConnections == null
      ? "公众号连接不限"
      : snapshot.maxWechatConnections === 0
        ? "不支持公众号推送"
        : `${snapshot.maxWechatConnections} 个公众号连接`,
  ];

  if (snapshot.canGenerateCoverImage) {
    features.push(snapshot.coverImageDailyLimit > 0 ? `封面图 ${snapshot.coverImageDailyLimit} 次/天` : "支持真实封面图生成");
    if (snapshot.canUseCoverImageReference) {
      features.push("支持参考图垫图");
    }
  } else {
    features.push("仅提供文本配图建议");
  }
  if (snapshot.canExportPdf) {
    features.push("支持 PDF 导出");
  }

  return features.slice(0, 8);
}

function planPrice(priceCny: number) {
  return priceCny > 0 ? `￥${priceCny}/月` : "￥0";
}

export default async function PricingPage() {
  const plans = (await getResolvedPlans())
    .filter((plan) => isStandardPlanCode(plan.code))
    .sort((left, right) => getPlanSortOrder(left.code) - getPlanSortOrder(right.code));

  return (
    <div className="space-y-10">
      <section className="max-w-4xl border border-stone-300/40 bg-white px-6 py-10 shadow-ink md:px-10">
        <div className="text-xs uppercase tracking-[0.3em] text-cinnabar">Pricing & Access</div>
        <h1 className="mt-4 font-serifCn text-4xl font-semibold text-ink md:text-5xl">套餐决定次数、容量和高级功能，不决定底层模型。</h1>
        <p className="mt-4 text-base leading-8 text-stone-700">
          活字只保留 `free / pro / ultra` 三档。套餐差异体现在作者人设数量、情绪罗盘可见位、自定义信源额度、文风资产、私有模板、封面图和发布能力，而不是按付费档位切换成不同模型。
        </p>
      </section>

      <PricingMatrix
        plans={plans.map((plan) => ({
          name: plan.name,
          price: planPrice(plan.priceCny ?? 0),
          tagline: getPlanMarketingTagline(plan.code),
          features: planFeatures(plan),
          featured: plan.code === "pro",
        }))}
      />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">统一模型原则</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>素材提纯、截图理解和热点处理统一走 Gemini 3.0 场景路由。</p>
            <p>正文生成统一走 Claude 4.6 写作链路，语言守卫复勘统一走 GPT-5.4。</p>
            <p>封面图统一走运营后台维护的全局生图引擎，不要求用户单独配置密钥。</p>
            <p>因此升级套餐买到的是更高配额和更完整链路，不是“换一套模型皮肤”。</p>
          </div>
        </article>
        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">开通方式</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <p>当前版本不开放自助注册，所有账号都由运营后台手动创建。</p>
            <p>如果你需要试用或升级，请直接联系支持。</p>
            <p>后台可手动调整套餐、状态、到期时间，以及必要的历史来源记录。</p>
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
