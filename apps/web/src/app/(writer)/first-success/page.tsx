import Link from "next/link";
import { CreateDocumentForm } from "@/components/dashboard-client";
import { FirstSuccessBannerControls, FirstSuccessGuideViewed, FirstSuccessStepToggle } from "@/components/first-success-client";
import { WriterOverview } from "@/components/writer-views";
import { getAuthorPersonas } from "@/lib/author-personas";
import { getFirstSuccessGuideState } from "@/lib/first-success-guide";
import { requireWriterSession } from "@/lib/page-auth";
import { getUserPlanContext } from "@/lib/plan-access";
import { getDocumentsByUser, getFragmentsByUser, getWechatConnections } from "@/lib/repositories";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";

function formatStepStatus(status: "done" | "current" | "pending") {
  if (status === "done") return "已完成";
  if (status === "current") return "当前建议";
  return "待补齐";
}

export default async function FirstSuccessPage() {
  const { session } = await requireWriterSession();
  const [{ plan, effectivePlanCode }, personas, styleProfiles, documents, fragments, connections, guideState] = await Promise.all([
    getUserPlanContext(session.userId),
    getAuthorPersonas(session.userId),
    getWritingStyleProfiles(session.userId),
    getDocumentsByUser(session.userId),
    getFragmentsByUser(session.userId),
    getWechatConnections(session.userId),
    getFirstSuccessGuideState(session.userId),
  ]);

  const publishedCount = documents.filter((document) => document.status === "published").length;
  const draftCount = documents.filter((document) => document.status !== "published").length;
  const hasPersona = personas.length > 0;
  const hasStyle = styleProfiles.length > 0 || personas.some((persona) => Boolean(persona.boundWritingStyleProfileName));
  const textFragments = fragments.filter((fragment) => fragment.source_type !== "screenshot").length;
  const evidenceFragments = fragments.filter((fragment) => fragment.source_type === "url" || fragment.source_type === "screenshot").length;
  const hasMinimalMaterials = textFragments >= 2;
  const canUseRadarStart = effectivePlanCode !== "free";
  const canPublishToWechat = (plan.max_wechat_connections ?? 0) > 0;
  const hasWechatConnection = connections.length > 0;
  const manuallyCompletedSteps = new Set(guideState.completedSteps);
  const guideConfig = guideState.guideConfig;
  const defaultPersonaTemplate = guideConfig.recommendedPersonaTemplate;
  const defaultStyleTemplate = guideConfig.recommendedStyleTemplate;
  const defaultStartType = guideConfig.defaultStartType;
  const stepDone = (stepId: number, actualDone: boolean) => actualDone || manuallyCompletedSteps.has(stepId);
  const nextStep =
    !stepDone(1, hasPersona) ? 1
    : !stepDone(2, hasStyle) ? 2
    : !stepDone(3, draftCount > 0) ? 3
    : !stepDone(4, hasMinimalMaterials) ? 4
    : !stepDone(5, publishedCount > 0) ? 5
    : 0;

  const steps = [
    {
      id: 1,
      title: "建立作者人设",
      done: stepDone(1, hasPersona),
      status: stepDone(1, hasPersona) ? "done" : nextStep === 1 ? "current" : "pending",
      minimum: "至少 1 个默认作者人设，身份标签和写作风格各选 1 项。",
      example: `系统默认：\`${defaultPersonaTemplate.identityTags[0]}\` + \`${defaultPersonaTemplate.writingStyleTags[0]}\`。`,
      skippable: "不可跳过",
      actionHref: "/settings",
      actionLabel: hasPersona ? "去查看人设" : "先建人设",
      note: hasPersona
        ? `当前默认人设：${personas.find((item) => item.isDefault)?.name || personas[0]?.name}`
        : `${defaultPersonaTemplate.reason} 推荐模板「${defaultPersonaTemplate.name}」会更容易把首篇写成结构化判断稿。`,
    },
    {
      id: 2,
      title: "选择风格约束",
      done: stepDone(2, hasStyle),
      status: stepDone(2, hasStyle) ? "done" : nextStep === 2 ? "current" : "pending",
      minimum: "最低标准是确认一种表达倾向；有风格资产更好，没有也能继续。",
      example: `系统默认：${defaultStyleTemplate.name}。${defaultStyleTemplate.structureChecklist.join("，")}。`,
      skippable: "可跳过",
      actionHref: "/settings",
      actionLabel: hasStyle ? "查看风格资产" : "去设置风格",
      note: hasStyle
        ? `当前已有 ${styleProfiles.length} 份写作风格资产或已绑定文风规则。`
        : `${defaultStyleTemplate.reason} ${effectivePlanCode === "free" ? "免费套餐可先沿用系统默认模板。" : "Pro / Ultra 也可在设置页提取并保存成正式风格资产。"}`,
    },
    {
      id: 3,
      title: "选起点开始写",
      done: stepDone(3, draftCount > 0),
      status: stepDone(3, draftCount > 0) ? "done" : nextStep === 3 ? "current" : "pending",
      minimum: "三选一即可：热点切角、参考链接拆题、空白文稿。",
      example: `系统默认起点：${defaultStartType.label}。如果你有现成参考文，也可以改走参考链接拆题。`,
      skippable: "不可跳过",
      actionHref: defaultStartType.actionHref,
      actionLabel: defaultStartType.type === "topic_radar" ? "按默认起点开始" : "按默认起点建稿",
      note: draftCount > 0
        ? `当前已有 ${draftCount} 篇草稿，可直接继续。`
        : defaultStartType.reason,
    },
    {
      id: 4,
      title: "补最小素材集",
      done: stepDone(4, hasMinimalMaterials),
      status: stepDone(4, hasMinimalMaterials) ? "done" : nextStep === 4 ? "current" : "pending",
      minimum: "至少 2 条文字素材；更稳妥的标准是再补 1 条链接或截图证据。",
      example: `系统推荐素材包：${guideConfig.minimalMaterialKit.map((item) => `${item.required ? "必备" : "建议"} ${item.label}`).join("；")}。`,
      skippable: "可低配跳过",
      actionHref: "/capture",
      actionLabel: "去补素材",
      note: `当前素材：文字 ${textFragments} 条，证据型素材 ${evidenceFragments} 条。系统建议优先补 ${guideConfig.minimalMaterialKit.map((item) => item.label).join("、")}。`,
    },
    {
      id: 5,
      title: "走完首篇发布",
      done: stepDone(5, publishedCount > 0),
      status: stepDone(5, publishedCount > 0) ? "done" : nextStep === 5 ? "current" : "pending",
      minimum: "至少完成大纲、深写、事实核查，再清掉发布总控台里的阻断项。",
      example: "示例：先生成大纲并确认标题，再挂素材、处理高风险句子，最后推到微信草稿箱或先导出 HTML。",
      skippable: canPublishToWechat ? "不可跳过" : "可用导出替代",
      actionHref: canPublishToWechat ? (hasWechatConnection ? "/dashboard" : "/settings") : "/dashboard",
      actionLabel: canPublishToWechat ? (hasWechatConnection ? "去继续发布" : "先配公众号") : "先完成首篇正文",
      note: publishedCount > 0
        ? `你已经发布过 ${publishedCount} 篇文章，这条路径目前主要用于复查。`
        : canPublishToWechat
          ? hasWechatConnection
            ? "当前已具备公众号发布能力，建议直接用发布前总控台清空阻断项。"
            : "当前套餐支持微信发布，但你还没有绑定公众号连接。"
          : "当前套餐不支持微信草稿箱推送，首篇可先以 HTML / Markdown 交付，流程依然有效。",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <FirstSuccessGuideViewed />
      <WriterOverview
        eyebrow="First Success"
        title="把首篇文章走通，先追求闭环，不追求花活。"
        description="这条路径只做一件事：用最少决策成本，帮你完成第一篇真正可交付的文章。每一步都标明最低标准、可否跳过，以及当前套餐下的替代路径。"
        metrics={[
          { label: "当前套餐", value: plan.name, note: canPublishToWechat ? "已开放公众号连接与草稿箱推送。" : "当前不开放草稿箱推送，但首篇路径仍可完整走通。" },
          { label: "草稿状态", value: `${draftCount} 篇`, note: draftCount > 0 ? "已有草稿可继续，不必从零开始。" : "还没有草稿时，优先从热点、参考链接或空白文稿三选一起稿。" },
          { label: "素材状态", value: `${fragments.length} 条`, note: hasMinimalMaterials ? "最小素材集已满足。继续补证据会让核查和发布更顺。" : "至少补 2 条文字素材，最好再补 1 条链接或截图证据。" },
        ]}
        cards={[
          { title: "先让路径可执行", description: "首篇不追求所有高级能力都用上，只要求每一步都知道最低标准。", meta: "Path" },
          { title: "先让判断可核对", description: "没有素材也能写，但没有可回链证据时，后面的事实核查和发布更容易卡住。", meta: "Evidence" },
          { title: "先让发布可恢复", description: "如果套餐支持微信推送，先走一次真实草稿箱发布；否则先完成可导出的可交付版本。", meta: "Delivery" },
        ]}
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.22em] text-cinnabar">Default Persona</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink">{defaultPersonaTemplate.name}</h2>
          <div className="mt-3 text-sm leading-7 text-stone-700">{defaultPersonaTemplate.summary}</div>
          <div className="mt-3 text-xs leading-6 text-stone-500">推荐理由：{defaultPersonaTemplate.reason}</div>
        </article>
        <article className="border border-stone-300/40 bg-white p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.22em] text-cinnabar">Default Style</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink">{defaultStyleTemplate.name}</h2>
          <div className="mt-3 text-sm leading-7 text-stone-700">{defaultStyleTemplate.summary}</div>
          <div className="mt-3 text-xs leading-6 text-stone-500">默认检查项：{defaultStyleTemplate.structureChecklist.join("；")}</div>
        </article>
        <article className="border border-stone-300/40 bg-[#fbf7ef] p-5 shadow-ink">
          <div className="text-xs uppercase tracking-[0.22em] text-cinnabar">Default Start</div>
          <h2 className="mt-3 font-serifCn text-2xl text-ink">{defaultStartType.label}</h2>
          <div className="mt-3 text-sm leading-7 text-stone-700">{defaultStartType.reason}</div>
          <Link href={defaultStartType.actionHref} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">
            去走默认起点
          </Link>
        </article>
      </section>

      <section className="border border-stone-300/40 bg-[#fbf7ef] p-6 shadow-ink">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Next Step</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">
              {nextStep === 0 ? "首篇闭环已走通" : `当前最值得先做的是步骤 ${nextStep}`}
            </h2>
            <div className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
              {nextStep === 0
                ? "你已经完成至少一篇正式发布。后续这页主要用于复查新账号路径，或给团队成员做标准化上手。"
                : steps.find((step) => step.id === nextStep)?.note}
            </div>
          </div>
          <div className="text-sm text-stone-500">
            已发布 {publishedCount} 篇 · 默认人设 {hasPersona ? "已配置" : "未配置"} · 风格资产 {styleProfiles.length} 份
          </div>
        </div>
        <div className="mt-4">
          <FirstSuccessBannerControls dismissed={Boolean(guideState.dismissedAt)} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {steps.map((step) => (
          <article key={step.id} className="border border-stone-300/40 bg-white p-5 shadow-ink">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.22em] text-stone-500">步骤 {step.id}</div>
              <div className={`text-xs ${
                step.status === "done" ? "text-emerald-700" : step.status === "current" ? "text-cinnabar" : "text-stone-500"
              }`}>
                {formatStepStatus(step.status)}
              </div>
            </div>
            <h2 className="mt-3 font-serifCn text-2xl text-ink">{step.title}</h2>
            <div className="mt-4 text-xs uppercase tracking-[0.16em] text-stone-500">最低可接受标准</div>
            <div className="mt-2 text-sm leading-7 text-stone-700">{step.minimum}</div>
            <div className="mt-4 text-xs uppercase tracking-[0.16em] text-stone-500">示例输入</div>
            <div className="mt-2 text-sm leading-7 text-stone-700">{step.example}</div>
            <div className="mt-4 text-xs uppercase tracking-[0.16em] text-stone-500">是否可跳过</div>
            <div className="mt-2 text-sm leading-7 text-stone-700">{step.skippable}</div>
            <div className="mt-4 border border-stone-300 bg-[#faf7f0] px-3 py-3 text-sm leading-7 text-stone-700">{step.note}</div>
            {step.id === 4 ? (
              <div className="mt-4 space-y-2 border border-dashed border-stone-300 px-3 py-3 text-sm leading-7 text-stone-700">
                {guideConfig.minimalMaterialKit.map((item) => (
                  <div key={item.label}>
                    {item.required ? "必备" : "建议"}：{item.label}。{item.description}
                  </div>
                ))}
              </div>
            ) : null}
            <Link href={step.actionHref} className="mt-4 inline-block border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700">
              {step.actionLabel}
            </Link>
            <div>
              <FirstSuccessStepToggle stepId={step.id} completed={step.done} />
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border border-stone-300/40 bg-white p-6 shadow-ink">
          <div className="text-xs uppercase tracking-[0.22em] text-cinnabar">Blank Start</div>
          <h2 className="mt-3 font-serifCn text-3xl text-ink">如果你不想从热点开始，就先建一篇空白文稿。</h2>
          <div className="mt-3 text-sm leading-7 text-stone-700">
            空白写作是兜底路径，不是禁区。前提只有两个：先给标题，先挂素材。等你把大纲和核查跑完，再决定是否真的推送到微信。
          </div>
          <div className="mt-5">
            <CreateDocumentForm />
          </div>
        </div>

        <aside className="border border-stone-300/40 bg-[#f4efe6] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-stone-500">替代路径</div>
          <div className="mt-4 space-y-3 text-sm leading-7 text-stone-700">
            <div>
              如果当前套餐不能一键落笔：
              先去工作台新建空白文稿，再去采集页补最小素材集。
            </div>
            <div>
              如果当前套餐不能推送到微信：
              先把编辑器里的发布总控台跑通，确认阻断项都清掉，再以 HTML / Markdown 作为首篇交付版本。
            </div>
            <div>
              如果你只有参考文没有素材：
              直接去情绪罗盘走“参考链接拆题”，先生成大纲骨架，再回头补证据。
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
