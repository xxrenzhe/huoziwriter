import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { getLanguageGuardSettingsData } from "../data";
import { LanguageGuardManager } from "../language-guard-manager";
import { SettingsSubpageShell } from "../shell";

const introCardClassName = surfaceCardStyles({ tone: "warm", padding: "md" });
const summaryCardClassName = cn(surfaceCardStyles({ tone: "highlight", padding: "sm" }), "shadow-none");
const queueCardClassName = cn(surfaceCardStyles({ tone: "warning", padding: "md" }), "shadow-none");
const insightCardClassName = cn(surfaceCardStyles({ padding: "sm" }), "shadow-none");
const sectionCardClassName = surfaceCardStyles({ padding: "md" });
const chipClassName = cn(surfaceCardStyles({ padding: "sm" }), "px-3 py-1 text-xs text-inkSoft shadow-none");

export default async function SettingsLanguageGuardPage() {
  const data = await getLanguageGuardSettingsData();
  if (!data) {
    return null;
  }

  const { planContext, languageGuardRules, languageGuardInsights } = data;
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

        <section className={sectionCardClassName}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">近 30 天命中扫描</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">先处理最近反复出现的机器腔，再扩规则库。</div>
              <div className="mt-2 max-w-3xl text-sm leading-7 text-inkSoft">
                这里直接扫描近 30 天有正文的稿件，帮助你判断哪些禁词和句式已经反复出现，应该优先回到稿件里清理或继续补规则。
              </div>
            </div>
            <div className="text-sm text-inkMuted">
              {languageGuardInsights.scannedArticleCount > 0
                ? `已扫描 ${languageGuardInsights.scannedArticleCount} 篇近 30 天稿件`
                : "近 30 天还没有可扫描稿件"}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "扫描稿件",
                value: String(languageGuardInsights.scannedArticleCount),
                note: "近 30 天内有正文内容的稿件数。",
              },
              {
                label: "命中稿件",
                value: String(languageGuardInsights.articleHitCount),
                note: "至少命中 1 条语言守卫规则的稿件数。",
              },
              {
                label: "命中记录",
                value: String(languageGuardInsights.totalHitRecords),
                note: "按「规则 × 稿件」累计的命中记录数。",
              },
              {
                label: "最高频规则",
                value: String(languageGuardInsights.topRuleHitCount),
                note: languageGuardInsights.topRuleHitCount > 0 ? "最常出现的一条规则命中了这么多篇稿件。" : "还没有形成反复命中的规则热点。",
              },
            ].map((item) => (
              <article key={item.label} className={insightCardClassName}>
                <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.label}</div>
                <div className="mt-2 font-serifCn text-3xl text-ink text-balance">{item.value}</div>
                <div className="mt-2 text-sm leading-6 text-inkSoft">{item.note}</div>
              </article>
            ))}
          </div>
        </section>

        <section className={sectionCardClassName}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">待处理高频规则</div>
              <div className="mt-2 font-serifCn text-2xl text-ink text-balance">把最常命中的词和句式先收口成处理队列。</div>
            </div>
            <div className="text-sm text-inkMuted">
              {languageGuardInsights.topRules.length > 0 ? `当前展示前 ${languageGuardInsights.topRules.length} 条` : "当前没有高频命中"}
            </div>
          </div>
          {languageGuardInsights.topRules.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {languageGuardInsights.topRules.map((rule, index) => (
                <article key={rule.ruleId} className={queueCardClassName}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className={chipClassName}>优先级 {String(index + 1).padStart(2, "0")}</span>
                        <span className={chipClassName}>{rule.ruleKind === "pattern" ? "句式模板" : "禁词"}</span>
                        <span className={chipClassName}>命中 {rule.hitArticleCount} 篇</span>
                      </div>
                      <div className="mt-3 font-medium text-ink">{rule.patternText}</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        {rule.rewriteHint || "还没有替代建议，建议先补一条更具体的改写方向。"}
                      </div>
                    </div>
                    {rule.latestArticleId ? (
                      <Link
                        href={`/articles/${rule.latestArticleId}?view=audit`}
                        className={buttonStyles({ variant: "secondary", size: "sm" })}
                      >
                        打开最近稿件
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className={insightCardClassName}>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近命中片段</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        {rule.latestMatchedText || "最近一次命中未保留片段。"}
                      </div>
                    </div>
                    <div className={insightCardClassName}>
                      <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">最近命中稿件</div>
                      <div className="mt-2 text-sm leading-7 text-inkSoft">
                        {rule.latestArticleTitle || "暂无关联稿件"}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className={cn("mt-4", summaryCardClassName)}>
              <div className="text-sm leading-7 text-inkSoft">
                近 30 天扫描里还没有高频命中的语言守卫规则。可以继续补规则，或直接去稿件区检查最近正文的机器腔风险。
              </div>
            </div>
          )}
        </section>

        <LanguageGuardManager
          initialRules={languageGuardRules}
          limit={planContext.planSnapshot.languageGuardRuleLimit}
        />
      </section>
    </SettingsSubpageShell>
  );
}
