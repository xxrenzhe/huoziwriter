import { DocumentEditorClient } from "@/components/writer-client";
import { getUserAccessScope } from "@/lib/access-scope";
import { getDocumentNodes } from "@/lib/document-outline";
import { getRelevantKnowledgeCardsForDocument } from "@/lib/knowledge";
import { getActiveTemplates, getOwnedStyleGenomes } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import { canUseCoverImageReference, getCoverImageQuotaStatus, getSnapshotRetentionDays, getUserPlanContext } from "@/lib/plan-access";
import { getBannedWords, getDocumentById, getDocumentSnapshots, getFragmentsByUser, getLatestCoverImage, getWechatConnections, getWechatSyncLogs } from "@/lib/repositories";

export default async function EditorPage({
  params,
}: {
  params: { documentId: string };
}) {
  const { session } = await requireWriterSession();
  const snapshotRetentionDays = await getSnapshotRetentionDays(session.userId);
  const [document, fragments, bannedWords, connections, snapshots, planContext, nodes, scope, coverImage, styleGenomes, templates, syncLogs, coverImageQuota] = await Promise.all([
    getDocumentById(Number(params.documentId), session.userId),
    getFragmentsByUser(session.userId),
    getBannedWords(session.userId),
    getWechatConnections(session.userId),
    getDocumentSnapshots(Number(params.documentId), { retentionDays: snapshotRetentionDays }),
    getUserPlanContext(session.userId),
    getDocumentNodes(Number(params.documentId)),
    getUserAccessScope(session.userId),
    getLatestCoverImage(session.userId, Number(params.documentId)),
    getOwnedStyleGenomes(session.userId),
    getActiveTemplates(),
    getWechatSyncLogs(session.userId),
    getCoverImageQuotaStatus(session.userId),
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
  const currentPlan = planContext.plan;

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
      connections={connections.map((connection) => ({
        id: connection.id,
        accountName: connection.account_name,
        status: connection.status,
        isDefault: Boolean(connection.is_default),
        accessTokenExpiresAt: connection.access_token_expires_at,
      }))}
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
        description: template.description,
        meta: template.meta,
        config: template.config,
      }))}
      recentSyncLogs={syncLogs
        .filter((log) => log.document_id === document.id)
        .slice(0, 3)
        .map((log) => ({
          id: log.id,
          connectionName: log.connection_name,
          mediaId: log.media_id,
          status: log.status,
          failureReason: log.failure_reason,
          retryCount: log.retry_count,
          createdAt: log.created_at,
          requestSummary: log.request_summary,
          responseSummary: log.response_summary,
        }))}
      knowledgeCards={relevantKnowledgeCards}
      canUseStyleGenomes={Boolean(currentPlan?.can_fork_genomes)}
      canExportPdf={Boolean(currentPlan?.can_export_pdf)}
      canGenerateCoverImage={Boolean(currentPlan?.can_generate_cover_image)}
      canUseCoverImageReference={canUseCoverImageReference(currentPlan.code as "free" | "pro" | "ultra" | "team")}
      canPublishToWechat={(currentPlan.max_wechat_connections ?? 0) > 0}
      planName={currentPlan.name}
      coverImageQuota={coverImageQuota}
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
