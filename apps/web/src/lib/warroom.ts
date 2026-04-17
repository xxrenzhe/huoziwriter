import { isPublishedArticleStatus } from "./article-status-label";
import { getUserPlanContext } from "./plan-access";
import { getArticleOutcomeBundlesByUser, getArticlesByUser, getAuthorPlaybooks, getFragmentsByUser } from "./repositories";
import { getSeries } from "./series";
import { getVisibleTopicRecommendationsForUser } from "./topic-recommendations";

export async function getWarroomData(userId: number) {
  const [articles, fragments, outcomeBundles, playbooks, topics, planContext, series] = await Promise.all([
    getArticlesByUser(userId),
    getFragmentsByUser(userId),
    getArticleOutcomeBundlesByUser(userId),
    getAuthorPlaybooks(userId, 4),
    getVisibleTopicRecommendationsForUser(userId),
    getUserPlanContext(userId),
    getSeries(userId),
  ]);
  const seriesMap = new Map(series.map((item) => [item.id, item] as const));
  const canStartRadar = planContext.effectivePlanCode !== "free";
  const drafts = articles.filter((article) => !isPublishedArticleStatus(article.status));
  const publishedArticles = articles.filter((article) => isPublishedArticleStatus(article.status));
  const outcomeBundleMap = new Map(outcomeBundles.map((bundle) => [bundle.outcome?.articleId, bundle] as const));
  const topicPool = topics.map((topic) => ({
    id: topic.id,
    sourceName: topic.sourceName,
    sourceType: topic.sourceType,
    sourcePriority: topic.sourcePriority,
    title: topic.title,
    summary: topic.summary,
    emotionLabels: topic.emotionLabels,
    angleOptions: topic.angleOptions,
    sourceUrl: topic.sourceUrl,
    relatedSourceNames: topic.relatedSourceNames,
    relatedSourceUrls: topic.relatedSourceUrls,
    publishedAt: topic.publishedAt,
    recommendationType: topic.recommendationType,
    recommendationReason: topic.recommendationReason,
    matchedPersonaName: topic.matchedPersonaName,
    freshnessScore: topic.freshnessScore,
    relevanceScore: topic.relevanceScore,
    priorityScore: topic.priorityScore,
  }));
  const pendingOutcomeArticles = publishedArticles
    .map((article) => {
      const bundle = outcomeBundleMap.get(article.id);
      const missingWindowCodes = bundle?.missingWindowCodes ?? ["24h", "72h", "7d"];
      const hitStatus = bundle?.outcome?.hitStatus ?? "pending";
      return {
        article: {
          id: article.id,
          title: article.title,
          status: article.status,
          updatedAt: article.updated_at,
          seriesId: article.series_id,
          seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
        },
        missingWindowCodes,
        hitStatus,
      };
    })
    .filter((item) => item.missingWindowCodes.length > 0 || item.hitStatus === "pending");

  return {
    summary: {
      topicCount: Math.min(topicPool.length, 3),
      draftCount: drafts.length,
      pendingOutcomeCount: pendingOutcomeArticles.length,
      fragmentCount: fragments.length,
      canStartRadar,
    },
    topics: topicPool.slice(0, 3),
    topicPool,
    drafts: drafts.slice(0, 5).map((article) => ({
      id: article.id,
      title: article.title,
      status: article.status,
      updatedAt: article.updated_at,
      seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
    })),
    pendingOutcomeArticles: pendingOutcomeArticles.slice(0, 3),
    playbooks,
    series: series.map((item) => ({
      id: item.id,
      name: item.name,
      personaName: item.personaName,
      activeStatus: item.activeStatus,
    })),
  };
}
