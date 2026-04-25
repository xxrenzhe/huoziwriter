import type { ReactNode } from "react";
import { buttonStyles, cn, surfaceCardStyles } from "@huoziwriter/ui";
import Link from "next/link";
import { PersonaManager } from "@/components/persona-client";
import { writerNav } from "@/config/navigation";
import { isPublishedArticleStatus } from "@/lib/article-status-label";
import { requireWriterSession } from "@/lib/page-auth";
import { getUserPlanContext } from "@/lib/plan-access";
import { getPersonaCatalog, getPersonas } from "@/lib/personas";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getArticlesByUser, getFragmentsByUser } from "@/lib/repositories";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";
import { getWriterShellNotificationItems } from "@/lib/shell-notifications";
import { WriterShell } from "@/components/writer-shell";
import { WriterRouteForbiddenState } from "@/components/writer-route-state";

const firstSuccessGuideClassName = cn(surfaceCardStyles({ tone: "warm", padding: "lg" }), "border-lineStrong shadow-none md:p-6");
const firstSuccessStepClassName = cn(surfaceCardStyles({ padding: "sm" }), "border-lineStrong text-sm leading-7 text-inkSoft shadow-none");
const firstSuccessStepActionClassName = cn("mt-3", buttonStyles({ variant: "secondary", size: "sm" }), "min-h-0 px-3 py-2 text-xs");
const firstSuccessPrimaryActionClassName = cn(
  buttonStyles({ variant: "secondary" }),
  "border-cinnabar bg-surface text-cinnabar hover:border-cinnabar hover:bg-cinnabarSoft hover:text-cinnabar",
);
const firstSuccessSteps = [
  {
    step: "步骤 1",
    title: "补最小素材集",
    detail: "至少准备 2 条文字素材，最好再补 1 条截图或链接证据。",
    href: "/articles",
    actionLabel: "去稿件区",
  },
  {
    step: "步骤 2",
    title: "选一个切口落笔",
    detail: "优先从系统推荐机会或参考链接拆题进入，不要从空白页硬写。",
    href: "/warroom",
    actionLabel: "去作战台",
  },
  {
    step: "步骤 3",
    title: "先过大纲和核查",
    detail: "首次发稿不追求花活，先确认标题、挂素材、处理高风险句子。",
    href: "/warroom",
    actionLabel: "去作战台",
  },
  {
    step: "步骤 4",
    title: "走一次真实发布",
    detail: "进入编辑器后先看发布前总控台，把拦截项清空，再推送到草稿箱。",
    href: "/settings",
    actionLabel: "管理公众号",
  },
] as const;

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session, user } = await requireWriterSession();
  const [planContext, dailyGenerationUsage, articles, fragments, personas, personaCatalog, writingStyleProfiles, notificationItems] = await Promise.all([
    getUserPlanContext(session.userId),
    getDailyGenerationUsage(session.userId),
    getArticlesByUser(session.userId),
    getFragmentsByUser(session.userId),
    getPersonas(session.userId),
    getPersonaCatalog(),
    getWritingStyleProfiles(session.userId),
    getWriterShellNotificationItems(session.userId),
  ]);
  const { plan, planSnapshot } = planContext;
  const personaLimit = planSnapshot.personaLimit;
  const draftCount = articles.filter((article) => !isPublishedArticleStatus(article.status)).length;
  const publishedCount = articles.filter((article) => isPublishedArticleStatus(article.status)).length;
  const fragmentCount = fragments.length;
  const latestArticle = articles[0];
  const defaultPersona = personas.find((persona) => persona.isDefault) ?? personas[0] ?? null;
  const personaReady = personas.length > 0;
  const showFirstSuccessGuide = personas.length > 0 && publishedCount === 0;
  const statusHeadline =
    latestArticle
      ? `当前最需要推进的是《${latestArticle.title}》。`
      : draftCount > 0
        ? `当前有 ${draftCount} 篇稿件待继续推进。`
        : "今天还没有起稿，先从一个明确选题开始。";
  const statusDetail = defaultPersona
    ? `当前默认人设：${defaultPersona.name}。已发布 ${publishedCount} 篇，待推进 ${draftCount} 篇，素材库存 ${fragmentCount} 条。`
    : "首次进入写作区前，需要先配置作者人设。";

  return (
    <>
      <WriterShell
        items={writerNav}
        currentPlanName={plan.name}
        accountLabel={user.display_name?.trim() || session.username}
        currentUsage={dailyGenerationUsage}
        usageLimit={planSnapshot.dailyGenerationLimit}
        statusHeadline={statusHeadline}
        statusDetail={statusDetail}
        notificationItems={notificationItems}
      >
        {personaReady && showFirstSuccessGuide ? (
          <section className={cn("mb-8", firstSuccessGuideClassName)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">起步引导</div>
                <h2 className="mt-3 font-serifCn text-3xl text-ink text-balance">先完成第一篇可发布文章，再扩展更复杂的打法。</h2>
                <div className="mt-3 max-w-3xl text-sm leading-7 text-inkSoft">
                  当前默认人设是 {defaultPersona ? `「${defaultPersona.name}」` : "未配置"}。建议按最短路径完成一次真实发布：补最小素材集，选一个热点或参考链接，生成大纲并过核查，再进微信草稿箱。
                </div>
              </div>
              <div className="text-sm text-inkMuted">
                已发布 {publishedCount} 篇 · 草稿 {draftCount} 篇 · 素材 {fragmentCount} 条
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {firstSuccessSteps.map((item) => (
                <div key={item.step} className={firstSuccessStepClassName}>
                  <div className="text-xs uppercase tracking-[0.18em] text-inkMuted">{item.step}</div>
                  <div className="mt-2 font-medium text-ink">{item.title}</div>
                  <div className="mt-2">{item.detail}</div>
                  <Link href={item.href} className={firstSuccessStepActionClassName}>
                    {item.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/articles" className={firstSuccessPrimaryActionClassName}>
                  进入稿件区
                </Link>
                <Link href="/warroom" className={buttonStyles({ variant: "secondary" })}>
                  回到作战台
                </Link>
              </div>
            </div>
          </section>
        ) : null}
        {personaReady ? (
          children
        ) : (
          <WriterRouteForbiddenState
            eyebrow="先完成人设配置"
            title="先配置你的写作身份，再进入系统。"
            detail="当前写作区内容已被锁定。先完成 1 个默认作者人设，系统才会开放作战台、稿件区和一键发布链路。"
          />
        )}
      </WriterShell>
      {!personaReady ? (
        <PersonaManager
          initialPersonas={personas}
          maxCount={personaLimit}
          currentPlanName={plan.name}
          canAnalyzeFromSources={planSnapshot.canAnalyzePersonaFromSources}
          availableWritingStyles={writingStyleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          tagCatalog={personaCatalog}
          mandatory
        />
      ) : null}
    </>
  );
}
