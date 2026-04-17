import type { ReactNode } from "react";
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
import { WorkspaceShell } from "@/components/site-shells";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { session } = await requireWriterSession();
  const [planContext, dailyGenerationUsage, articles, fragments, personas, personaCatalog, writingStyleProfiles] = await Promise.all([
    getUserPlanContext(session.userId),
    getDailyGenerationUsage(session.userId),
    getArticlesByUser(session.userId),
    getFragmentsByUser(session.userId),
    getPersonas(session.userId),
    getPersonaCatalog(),
    getWritingStyleProfiles(session.userId),
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
      <WorkspaceShell
        items={writerNav}
        currentPlanName={plan.name}
        currentUsage={dailyGenerationUsage}
        usageLimit={planSnapshot.dailyGenerationLimit}
        statusHeadline={statusHeadline}
        statusDetail={statusDetail}
      >
        {personaReady && showFirstSuccessGuide ? (
          <section className="mb-8 border border-stone-300/40 bg-[#fbf7ef] p-6 shadow-ink">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">起步引导</div>
                <h2 className="mt-3 font-serifCn text-3xl text-ink">先完成第一篇可发布文章，再扩展更复杂的打法。</h2>
                <div className="mt-3 max-w-3xl text-sm leading-7 text-stone-700">
                  当前默认人设是 {defaultPersona ? `「${defaultPersona.name}」` : "未配置"}。建议按最短路径完成一次真实发布：补最小素材集，选一个热点或参考链接，生成大纲并过核查，再进微信草稿箱。
                </div>
              </div>
              <div className="text-sm text-stone-500">
                已发布 {publishedCount} 篇 · 草稿 {draftCount} 篇 · 素材 {fragmentCount} 条
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 1</div>
                <div className="mt-2 font-medium text-ink">补最小素材集</div>
                <div className="mt-2">至少准备 2 条文字素材，最好再补 1 条截图或链接证据。</div>
                <Link href="/articles" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去稿件区
                </Link>
              </div>
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 2</div>
                <div className="mt-2 font-medium text-ink">选一个切口落笔</div>
                <div className="mt-2">优先从系统推荐机会或参考链接拆题进入，不要从空白页硬写。</div>
                <Link href="/dashboard" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去作战台
                </Link>
              </div>
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 3</div>
                <div className="mt-2 font-medium text-ink">先过大纲和核查</div>
                <div className="mt-2">首次发稿不追求花活，先确认标题、挂素材、处理高风险句子。</div>
                <Link href="/dashboard" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去作战台
                </Link>
              </div>
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 4</div>
                <div className="mt-2 font-medium text-ink">走一次真实发布</div>
                <div className="mt-2">进入编辑器后先看发布前总控台，把拦截项清空，再推送到草稿箱。</div>
                <Link href="/settings" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  管理公众号
                </Link>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/articles" className="inline-block border border-cinnabar bg-white px-4 py-3 text-sm text-cinnabar">
                  进入稿件区
                </Link>
                <Link href="/dashboard" className="inline-block border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700">
                  回到作战台
                </Link>
              </div>
            </div>
          </section>
        ) : null}
        {personaReady ? (
          children
        ) : (
          <section className="border border-dashed border-stone-300/50 bg-[#fbf7ef] p-8 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">先完成人设配置</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">先配置你的写作身份，再进入系统。</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
              当前写作区内容已被锁定。先完成 1 个默认作者人设，系统才会开放作战台、稿件区和一键发布链路。
            </p>
          </section>
        )}
      </WorkspaceShell>
      <PersonaManager
        initialPersonas={personas}
        maxCount={personaLimit}
        currentPlanName={plan.name}
        canAnalyzeFromSources={planSnapshot.canAnalyzePersonaFromSources}
        availableWritingStyles={writingStyleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
        tagCatalog={personaCatalog}
        mandatory
      />
    </>
  );
}
