import { cn, surfaceCardStyles } from "@huoziwriter/ui";
import { buildSuggestedEvidenceItems } from "@/lib/article-evidence";
import { getArticleOutcomeData, getCurrentSeriesPlaybook } from "@/lib/article-outcomes";
import { normalizeArticleStatus } from "@/lib/article-status-label";
import { getArticleStageArtifactsByDocumentIds } from "@/lib/article-stage-artifacts";
import { buildSuggestedStrategyCard } from "@/lib/article-strategy";
import { ArticleEditorClient } from "@/components/article-workspace-client";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { getArticleWritingContext } from "@/lib/article-writing-context";
import { getRelevantKnowledgeCardsForArticle } from "@/lib/knowledge";
import { getLanguageGuardRules } from "@/lib/language-guard";
import { getActiveTemplates } from "@/lib/layout-templates";
import { requireWriterSession } from "@/lib/page-auth";
import { getCoverImageQuotaStatus, getImageAssetStorageQuotaStatus, getUserPlanContext } from "@/lib/plan-access";
import { hasPersona } from "@/lib/personas";
import {
  getArticleEvidenceItems,
  getArticleImagePrompts,
  getArticleStrategyCard,
  getArticleSnapshots,
  getArticlesByUser,
  getFragmentsByUser,
  getLatestArticleCoverImage,
  getLatestArticleCoverImageCandidates,
  getWechatConnections,
  getWechatSyncLogs,
} from "@/lib/repositories";
import { getSeries } from "@/lib/series";

const missingArticleStateClassName = cn(
  surfaceCardStyles({ tone: "highlight", padding: "md" }),
  "text-sm leading-7 text-inkSoft",
);

export async function ArticleDetailPage({
  articleId: rawArticleId,
}: {
  articleId: string;
}) {
  const { session } = await requireWriterSession();
  if (!(await hasPersona(session.userId))) {
    return null;
  }

  const articleId = Number(rawArticleId);
  const [articleOutcomeData, recentArticles, fragments, languageGuardRules, connections, planContext, coverImage, coverImageCandidates, imagePrompts, templates, syncLogs, strategyCard, evidenceItems, coverImageQuota, imageAssetQuota, authoringContext, series] = await Promise.all([
    getArticleOutcomeData(articleId, session.userId),
    getArticlesByUser(session.userId),
    getFragmentsByUser(session.userId),
    getLanguageGuardRules(session.userId),
    getWechatConnections(session.userId),
    getUserPlanContext(session.userId),
    getLatestArticleCoverImage(session.userId, articleId),
    getLatestArticleCoverImageCandidates(session.userId, articleId),
    getArticleImagePrompts(session.userId, articleId),
    getActiveTemplates(session.userId),
    getWechatSyncLogs(session.userId),
    getArticleStrategyCard(articleId, session.userId),
    getArticleEvidenceItems(articleId, session.userId),
    getCoverImageQuotaStatus(session.userId),
    getImageAssetStorageQuotaStatus(session.userId),
    getArticleAuthoringStyleContext(session.userId, articleId),
    getSeries(session.userId),
  ]);

  if (!articleOutcomeData) {
    return (
      <div className={missingArticleStateClassName}>
        稿件不存在。
      </div>
    );
  }
  const { article, nodes, workflow, stageArtifacts, outcomeBundle: initialOutcomeBundle } = articleOutcomeData;
  const snapshots = await getArticleSnapshots(articleId, { retentionDays: planContext.planSnapshot.snapshotRetentionDays });

  const [relevantKnowledgeCards, writingContext, currentSeriesPlaybook] = await Promise.all([
    getRelevantKnowledgeCardsForArticle(session.userId, {
      articleTitle: article.title,
      markdownContent: article.markdown_content,
      nodeTitles: nodes.map((node) => node.title),
      attachedFragmentIds: nodes.flatMap((node) => node.fragments.map((fragment) => fragment.id)),
    }),
    getArticleWritingContext({
      userId: session.userId,
      articleId: article.id,
      title: article.title,
      markdownContent: article.markdown_content,
    }),
    getCurrentSeriesPlaybook(session.userId, article.series_id),
  ]);
  const currentPlan = planContext.plan;
  const planSnapshot = planContext.planSnapshot;
  const templateLimit = planSnapshot.templateAccessLimit;
  const accessibleTemplates = [
    ...templates.filter((template) => template.ownerUserId == null).slice(0, templateLimit),
    ...templates.filter((template) => template.ownerUserId === session.userId),
  ];
  const initialStrategyCard = buildSuggestedStrategyCard({
    strategyCard,
    stageArtifacts,
    seriesInsight: writingContext.seriesInsight,
    outcomeBundle: initialOutcomeBundle,
  });
  const initialEvidenceItems = buildSuggestedEvidenceItems({
    evidenceItems,
    nodes,
    factCheckPayload: stageArtifacts.find((item) => item.stageCode === "factCheck")?.payload ?? null,
  });
  const recentArticleItems = recentArticles
    .filter((item) => item.id !== article.id)
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: item.title,
      markdownContent: item.markdown_content,
      updatedAt: item.updated_at,
    }));
  const recentDeepWritingStates = recentArticleItems.length
    ? await getArticleStageArtifactsByDocumentIds({
        userId: session.userId,
        articleIds: recentArticleItems.map((item) => item.id),
        stageCode: "deepWriting",
      })
    : [];

  return (
    <ArticleEditorClient
      article={{
        id: article.id,
        title: article.title,
        markdownContent: article.markdown_content,
        status: normalizeArticleStatus(article.status),
        htmlContent: article.html_content || "",
        seriesId: article.series_id,
        wechatTemplateId: article.wechat_template_id,
      }}
      seriesOptions={series.map((item) => ({
        id: item.id,
        name: item.name,
        personaName: item.personaName,
        thesis: item.thesis,
        targetAudience: item.targetAudience,
        activeStatus: item.activeStatus,
      }))}
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
        .filter((log) => log.articleId === article.id)
        .slice(0, 3)
        .map((log) => ({
          id: log.id,
          articleId: log.articleId,
          connectionName: log.connectionName,
          mediaId: log.mediaId,
          status: log.status,
          failureReason: log.failureReason,
          failureCode: log.failureCode,
          retryCount: log.retryCount,
          articleVersionHash: log.articleVersionHash,
          templateId: log.templateId,
          idempotencyKey: log.idempotencyKey,
          createdAt: log.createdAt,
          requestSummary: log.requestSummary,
          responseSummary: log.responseSummary,
        }))}
      initialOutcomeBundle={initialOutcomeBundle}
      recentArticles={recentArticleItems}
      recentDeepWritingStates={recentDeepWritingStates.map((item) => ({
        id: item.articleId,
        title: item.title,
        updatedAt: item.updatedAt,
        payload: item.artifact.payload,
      }))}
      initialStrategyCard={initialStrategyCard}
      initialEvidenceItems={initialEvidenceItems}
      workflow={workflow}
      stageArtifacts={stageArtifacts}
      knowledgeCards={relevantKnowledgeCards}
      canExportPdf={planSnapshot.canExportPdf}
      canGenerateCoverImage={planSnapshot.canGenerateCoverImage}
      canUseCoverImageReference={planSnapshot.canUseCoverImageReference}
      canUseHistoryReferences={planSnapshot.canUseHistoryReferences}
      canPublishToWechat={planSnapshot.canPublishToWechat}
      planName={currentPlan.name}
      authoringContext={authoringContext}
      seriesInsight={writingContext.seriesInsight ?? null}
      currentSeriesPlaybook={currentSeriesPlaybook}
      coverImageQuota={coverImageQuota}
      imageAssetQuota={imageAssetQuota}
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
        articleNodeId: item.article_node_id,
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
