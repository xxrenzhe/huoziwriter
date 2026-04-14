import type { ReactNode } from "react";
import { AuthorPersonaManager } from "@/components/author-persona-client";
import { writerNav } from "@/config/navigation";
import { getAuthorPersonas, getAuthorPersonaLimitForUser } from "@/lib/author-personas";
import { requireWriterSession } from "@/lib/page-auth";
import { getUserPlanContext } from "@/lib/plan-access";
import { getDailyGenerationUsage } from "@/lib/usage";
import { getDocumentsByUser, getFragmentsByUser } from "@/lib/repositories";
import { getWritingStyleProfiles } from "@/lib/writing-style-profiles";
import { WriterShell } from "@/components/site-shells";

export default async function WriterLayout({ children }: { children: ReactNode }) {
  const { session } = await requireWriterSession();
  const [{ plan }, dailyGenerationUsage, documents, fragments, personas, personaLimit, writingStyleProfiles] = await Promise.all([
    getUserPlanContext(session.userId),
    getDailyGenerationUsage(session.userId),
    getDocumentsByUser(session.userId),
    getFragmentsByUser(session.userId),
    getAuthorPersonas(session.userId),
    getAuthorPersonaLimitForUser(session.userId),
    getWritingStyleProfiles(session.userId),
  ]);
  const draftCount = documents.filter((document) => document.status !== "published").length;
  const fragmentCount = fragments.length;
  const latestDocument = documents[0];
  const defaultPersona = personas.find((persona) => persona.isDefault) ?? personas[0] ?? null;

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
        {children}
      </WriterShell>
      <AuthorPersonaManager
        initialPersonas={personas}
        maxCount={personaLimit}
        currentPlanName={plan.name}
        canAnalyzeFromSources={plan.code !== "free"}
        availableWritingStyles={writingStyleProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
        mandatory
      />
    </>
  );
}
