import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { getLanguageGuardSettingsData } from "../data";
import { LanguageGuardManager } from "../language-guard-manager";
import { SettingsSubpageShell } from "../shell";

const introCardClassName = surfaceCardStyles({ tone: "warm", padding: "md" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");

export default async function SettingsLanguageGuardPage() {
  const data = await getLanguageGuardSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, languageGuardRules } = data;
  const systemRules = languageGuardRules.filter((rule) => rule.scope === "system");
  const userRules = languageGuardRules.filter((rule) => rule.scope === "user");
  const patternRules = userRules.filter((rule) => rule.ruleKind === "pattern");
  const tokenRules = userRules.filter((rule) => rule.ruleKind === "token");

  return (
    <SettingsSubpageShell
      current="language-guard"
      eyebrow="Language Guard"
      title="你的死刑词库"
      description="这些词永不会出现在你的文章里。它们会在生成时被禁、审校时被删、编辑时被标红。"
      stats={[
        {
          label: "系统默认",
          value: String(systemRules.length),
          note: "默认禁词与句式规则",
        },
        {
          label: "我的规则",
          value: planContext.planSnapshot.languageGuardRuleLimit == null ? `${userRules.length} / 不限` : `${userRules.length} / ${planContext.planSnapshot.languageGuardRuleLimit}`,
          note: "自定义规则会以更高优先级命中",
        },
        {
          label: "模板规则",
          value: String(userRules.filter((rule) => rule.ruleKind === "pattern").length),
          note: "适合拦截固定机器腔句式",
        },
      ]}
    >
      <section id="language-guard" className="space-y-4 scroll-mt-8">
        <div className={introCardClassName}>
          <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">规则优先级</div>
          <div className="mt-3 font-serifCn text-3xl text-ink text-balance">先定义不能写什么，再让整条写作链路共享同一套边界。</div>
          <div className="mt-3 text-sm leading-7 text-inkSoft">
            这里不是单次审校补丁，而是统一约束生成、审校和编辑三个阶段的长期规则库。系统默认规则提供底线，自定义规则负责覆盖你最常见的机器腔词和句式模板。
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: "自定义禁词",
              value: String(tokenRules.length),
              note: tokenRules.length > 0 ? "适合拦截高频机器腔词、泛化词和口水连接词。" : "先补最常见的泛化禁词。",
            },
            {
              label: "句式模板",
              value: String(patternRules.length),
              note: patternRules.length > 0 ? "适合拦截固定句法和重复论证套路。" : "先录入 1 到 2 条固定机器腔句式。",
            },
            {
              label: "系统底线",
              value: String(systemRules.length),
              note: "系统默认规则不可删除，会作为所有写作链路的基础底线。",
            },
          ].map((item) => (
            <article key={item.label} className={summaryCardClassName}>
              <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
              <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
              <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
            </article>
          ))}
        </div>

        <LanguageGuardManager
          initialRules={languageGuardRules}
          limit={planContext.planSnapshot.languageGuardRuleLimit}
        />
      </section>
    </SettingsSubpageShell>
  );
}
