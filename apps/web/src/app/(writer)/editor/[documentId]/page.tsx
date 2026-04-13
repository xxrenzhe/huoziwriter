import { DocumentEditorClient } from "@/components/writer-client";
import { getUserAccessScope } from "@/lib/access-scope";
import { getDocumentNodes } from "@/lib/document-outline";
import { getRelevantKnowledgeCardsForDocument } from "@/lib/knowledge";
import { getActiveTemplates, getStyleGenomes } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import { getSnapshotRetentionDays } from "@/lib/plan-access";
import { getBannedWords, getDocumentById, getDocumentSnapshots, getFragmentsByUser, getLatestCoverImage, getPlans, getWechatConnections } from "@/lib/repositories";

export default async function EditorPage({
  params,
}: {
  params: { documentId: string };
}) {
  const { session, user } = await requireWriterSession();
  const snapshotRetentionDays = await getSnapshotRetentionDays(session.userId);
  const [document, fragments, bannedWords, connections, snapshots, plans, nodes, scope, coverImage, styleGenomes, templates] = await Promise.all([
    getDocumentById(Number(params.documentId), session.userId),
    getFragmentsByUser(session.userId),
    getBannedWords(session.userId),
    getWechatConnections(session.userId),
    getDocumentSnapshots(Number(params.documentId), { retentionDays: snapshotRetentionDays }),
    getPlans(),
    getDocumentNodes(Number(params.documentId)),
    getUserAccessScope(session.userId),
    getLatestCoverImage(session.userId, Number(params.documentId)),
    getStyleGenomes({ includePrivateForUserId: session.userId }),
    getActiveTemplates(),
  ]);

  if (!document) {
    return <div className="border border-stone-300/40 bg-white p-6">文稿不存在。</div>;
  }

  const relevantKnowledgeCards = await getRelevantKnowledgeCardsForDocument(session.userId, {
    documentTitle: document.title,
    markdownContent: document.markdown_content,
    nodeTitles: nodes.map((node) => node.title),
    attachedFragmentIds: nodes.flatMap((node) => node.fragments.map((fragment) => fragment.id)),
  });
  const currentPlan = plans.find((plan) => plan.code === user.plan_code);

  return (
    <DocumentEditorClient
      document={{
        id: document.id,
        title: document.title,
        markdownContent: document.markdown_content,
        status: document.status,
        htmlContent: document.html_content || "",
        styleGenomeId: document.style_genome_id,
        wechatTemplateId: document.wechat_template_id,
      }}
      nodes={nodes.map((node) => ({
        id: node.id,
        title: node.title,
        description: node.description,
        sortOrder: node.sortOrder,
        fragments: node.fragments.map((fragment) => ({
          id: fragment.id,
          distilledContent: fragment.distilledContent,
          shared: fragment.userId !== session.userId,
        })),
      }))}
      fragments={fragments.map((fragment) => ({
        id: fragment.id,
        title: fragment.title,
        distilledContent: fragment.distilled_content,
        shared: fragment.user_id !== session.userId,
      }))}
      bannedWords={bannedWords.map((item) => ({ id: item.id, word: item.word }))}
      connections={connections.map((connection) => ({ id: connection.id, accountName: connection.account_name }))}
      snapshots={snapshots.map((snapshot) => ({
        id: snapshot.id,
        snapshotNote: snapshot.snapshot_note,
        createdAt: snapshot.created_at,
      }))}
      styleGenomes={styleGenomes.map((genome) => ({
        id: genome.id,
        name: genome.name,
        isPublic: Boolean(genome.is_public),
        isOfficial: Boolean(genome.is_official),
      }))}
      templates={templates.map((template) => ({
        id: template.id,
        version: template.version,
        name: template.name,
      }))}
      knowledgeCards={relevantKnowledgeCards}
      canExportPdf={Boolean(currentPlan?.can_export_pdf)}
      canGenerateCoverImage={Boolean(currentPlan?.can_generate_cover_image)}
      initialCoverImage={
        coverImage
          ? {
              imageUrl: coverImage.image_url,
              prompt: coverImage.prompt,
              createdAt: coverImage.created_at,
            }
          : null
      }
      isTeamShared={scope.isTeamShared}
      sharedMemberCount={scope.userIds.length}
    />
  );
}
