import { DocumentEditorClient } from "@/components/writer-client";
import { getDocumentAuthoringStyleContext } from "@/lib/document-authoring-style-context";
import { getDocumentStageArtifacts } from "@/lib/document-stage-artifacts";
import { getDocumentWorkflow } from "@/lib/document-workflows";
import { getDocumentNodes } from "@/lib/document-outline";
import { getRelevantKnowledgeCardsForDocument } from "@/lib/knowledge";
import { getLanguageGuardRules } from "@/lib/language-guard";
import { getActiveTemplates, getOwnedStyleGenomes } from "@/lib/marketplace";
import { requireWriterSession } from "@/lib/page-auth";
import { canUseCoverImageReference, canUseHistoryReferences, getCoverImageQuotaStatus, getSnapshotRetentionDays, getTemplateAccessLimit, getUserPlanContext } from "@/lib/plan-access";
import { getDocumentById, getDocumentImagePrompts, getDocumentSnapshots, getFragmentsByUser, getLatestCoverImage, getLatestCoverImageCandidates, getWechatConnections, getWechatSyncLogs } from "@/lib/repositories";

export default async function EditorPage({
  params,
}: {
  params: { documentId: string };
}) {
  const { session } = await requireWriterSession();
  const snapshotRetentionDays = await getSnapshotRetentionDays(session.userId);
  const [document, fragments, languageGuardRules, connections, snapshots, planContext, nodes, workflow, stageArtifacts, coverImage, coverImageCandidates, imagePrompts, styleGenomes, templates, syncLogs, coverImageQuota, authoringContext] = await Promise.all([
    getDocumentById(Number(params.documentId), session.userId),
    getFragmentsByUser(session.userId),
    getLanguageGuardRules(session.userId),
    getWechatConnections(session.userId),
    getDocumentSnapshots(Number(params.documentId), { retentionDays: snapshotRetentionDays }),
    getUserPlanContext(session.userId),
    getDocumentNodes(Number(params.documentId)),
    getDocumentWorkflow(Number(params.documentId), session.userId),
    getDocumentStageArtifacts(Number(params.documentId), session.userId),
    getLatestCoverImage(session.userId, Number(params.documentId)),
    getLatestCoverImageCandidates(session.userId, Number(params.documentId)),
    getDocumentImagePrompts(session.userId, Number(params.documentId)),
    getOwnedStyleGenomes(session.userId),
    getActiveTemplates(session.userId),
    getWechatSyncLogs(session.userId),
    getCoverImageQuotaStatus(session.userId),
    getDocumentAuthoringStyleContext(session.userId),
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
  const templateLimit = getTemplateAccessLimit(currentPlan.code as "free" | "pro" | "ultra");
  const accessibleTemplates = [
    ...templates.filter((template) => template.ownerUserId == null).slice(0, templateLimit),
    ...templates.filter((template) => template.ownerUserId === session.userId),
  ];

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
          title: fragment.title,
          distilledContent: fragment.distilledContent,
          sourceType: fragment.sourceType,
          sourceUrl: fragment.sourceUrl,
          screenshotPath: fragment.screenshotPath,
          usageMode: fragment.usageMode,
          shared: fragment.userId !== session.userId,
        })),
      }))}
      fragments={fragments.map((fragment) => ({
        id: fragment.id,
        title: fragment.title,
        distilledContent: fragment.distilled_content,
        sourceType: fragment.source_type,
        sourceUrl: fragment.source_url,
        screenshotPath: fragment.screenshot_path,
        shared: fragment.user_id !== session.userId,
      }))}
      languageGuardRules={languageGuardRules.map((rule) => ({
        id: rule.id,
        scope: rule.scope,
        source: rule.source,
        ruleKind: rule.ruleKind,
        matchMode: rule.matchMode,
        patternText: rule.patternText,
        rewriteHint: rule.rewriteHint,
        isEnabled: rule.isEnabled,
        createdAt: rule.createdAt,
      }))}
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
      templates={accessibleTemplates.map((template) => ({
        id: template.id,
        version: template.version,
        name: template.name,
        description: template.description,
        meta: template.meta,
        ownerUserId: template.ownerUserId,
        sourceUrl: template.sourceUrl,
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
      workflow={workflow}
      stageArtifacts={stageArtifacts}
      knowledgeCards={relevantKnowledgeCards}
      canUseStyleGenomes={Boolean(currentPlan?.can_fork_genomes)}
      canExportPdf={Boolean(currentPlan?.can_export_pdf)}
      canGenerateCoverImage={Boolean(currentPlan?.can_generate_cover_image)}
      canUseCoverImageReference={canUseCoverImageReference(currentPlan.code as "free" | "pro" | "ultra")}
      canUseHistoryReferences={canUseHistoryReferences(planContext.effectivePlanCode)}
      canPublishToWechat={(currentPlan.max_wechat_connections ?? 0) > 0}
      planName={currentPlan.name}
      authoringContext={authoringContext}
      coverImageQuota={coverImageQuota}
      initialCoverImageCandidates={coverImageCandidates.map((candidate) => ({
        id: candidate.id,
        variantLabel: candidate.variant_label,
        imageUrl: candidate.image_url,
        prompt: candidate.prompt,
        isSelected: Boolean(candidate.is_selected),
        createdAt: candidate.created_at,
      }))}
      initialImagePrompts={imagePrompts.map((item) => ({
        id: item.id,
        documentNodeId: item.document_node_id,
        assetType: item.asset_type,
        title: item.title,
        prompt: item.prompt,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }))}
      initialCoverImage={
        coverImage
          ? {
              imageUrl: coverImage.image_url,
              prompt: coverImage.prompt,
              createdAt: coverImage.created_at,
            }
          : null
      }
    />
  );
}
