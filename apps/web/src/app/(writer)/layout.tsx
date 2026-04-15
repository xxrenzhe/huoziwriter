import type { ReactNode } from "react";
import Link from "next/link";
import { AuthorPersonaManager } from "@/components/author-persona-client";
import { FirstSuccessBannerControls } from "@/components/first-success-client";
import { writerNav } from "@/config/navigation";
import { getAuthorPersonaCatalog, getAuthorPersonas, getAuthorPersonaLimitForUser } from "@/lib/author-personas";
import { getFirstSuccessGuideState } from "@/lib/first-success-guide";
import { requireWriterSession } from "@/lib/page-auth";
import { getUserPlanContext } from "@/lib/plan-access";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getDocumentsByUser, getFragmentsByUser } from "@/lib/repositories";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";
import { WriterShell } from "@/components/site-shells";

export default async function WriterLayout({ children }: { children: ReactNode }) {
  const { session } = await requireWriterSession();
  const [{ plan }, dailyGenerationUsage, documents, fragments, personas, personaLimit, personaCatalog, writingStyleProfiles, guideState] = await Promise.all([
    getUserPlanContext(session.userId),
    getDailyGenerationUsage(session.userId),
    getDocumentsByUser(session.userId),
    getFragmentsByUser(session.userId),
    getAuthorPersonas(session.userId),
    getAuthorPersonaLimitForUser(session.userId),
    getAuthorPersonaCatalog(),
    getWritingStyleProfiles(session.userId),
    getFirstSuccessGuideState(session.userId),
  ]);
  const draftCount = documents.filter((document) => document.status !== "published").length;
  const publishedCount = documents.filter((document) => document.status === "published").length;
  const fragmentCount = fragments.length;
  const latestDocument = documents[0];
  const defaultPersona = personas.find((persona) => persona.isDefault) ?? personas[0] ?? null;
  const personaReady = personas.length > 0;
  const showFirstSuccessGuide = personas.length > 0 && publishedCount === 0 && !guideState.dismissedAt;

  const statusHeadline =
    fragmentCount > 0
      ? `碎片已备好，当前有 ${fragmentCount} 条可调用素材。`
      : "还没有碎片，先去采集中心装填第一批弹药。";
  const statusDetail = defaultPersona
    ? `当前默认人设：${defaultPersona.name}。${latestDocument
      ? `最近文稿《${latestDocument.title}》仍可继续推进。`
      : draftCount > 0
        ? `当前有 ${draftCount} 篇草稿待继续。`
        : "先新建一篇空白文稿，再挂载碎片和结构。"}`
    : "首次进入写作区前，需要先配置作者人设。";

  return (
    <>
      <WriterShell
        items={writerNav}
        currentPlanName={plan.name}
        currentUsage={dailyGenerationUsage}
        usageLimit={plan.daily_generation_limit ?? null}
        statusHeadline={statusHeadline}
        statusDetail={statusDetail}
      >
        {personaReady && showFirstSuccessGuide ? (
          <section className="mb-8 border border-stone-300/40 bg-[#fbf7ef] p-6 shadow-ink">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">First Success Path</div>
                <h2 className="mt-3 font-serifCn text-3xl text-ink">先完成第一篇可发布文章，再去追求更复杂的工作流。</h2>
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
                <Link href="/capture" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去采集
                </Link>
              </div>
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 2</div>
                <div className="mt-2 font-medium text-ink">选一个切口落笔</div>
                <div className="mt-2">优先从情绪罗盘或参考链接拆题进入，不要从空白页硬写。</div>
                <Link href="/radar" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去选题
                </Link>
              </div>
              <div className="border border-stone-300 bg-white px-4 py-4 text-sm leading-7 text-stone-700">
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500">步骤 3</div>
                <div className="mt-2 font-medium text-ink">先过大纲和核查</div>
                <div className="mt-2">首篇文章不追求花活，先确认标题、挂素材、处理高风险句子。</div>
                <Link href="/dashboard" className="mt-3 inline-block border border-stone-300 bg-[#faf7f0] px-3 py-2 text-xs text-stone-700">
                  去工作台
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
                <Link href="/first-success" className="inline-block border border-cinnabar bg-white px-4 py-3 text-sm text-cinnabar">
                  查看完整首篇成功路径
                </Link>
                <FirstSuccessBannerControls dismissed={false} />
              </div>
            </div>
          </section>
        ) : null}
        {personaReady ? (
          children
        ) : (
          <section className="border border-dashed border-stone-300/50 bg-[#fbf7ef] p-8 shadow-ink">
            <div className="text-xs uppercase tracking-[0.24em] text-cinnabar">Author Setup Required</div>
            <h2 className="mt-3 font-serifCn text-3xl text-ink">先配置你的写作身份，再进入系统。</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-700">
              当前写作区内容已被锁定。先完成 1 个默认作者人设，系统才会开放选题雷达、工作台、编辑器和一键发布链路。
            </p>
          </section>
        )}
      </WriterShell>
      <AuthorPersonaManager
        initialPersonas={personas}
        maxCount={personaLimit}
        currentPlanName={plan.name}
        canAnalyzeFromSources={plan.code !== "free"}
        availableWritingStyles={writingStyleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
        tagCatalog={personaCatalog}
        mandatory
      />
    </>
  );
}
