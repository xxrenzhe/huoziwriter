import { assertAuthorPersonaReady } from "@/lib/author-personas";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getUserPlanContext } from "@/lib/plan-access";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertAuthorPersonaReady(session.userId);
    const [topics, planContext] = await Promise.all([
      getVisibleTopicRecommendationsForUser(session.userId),
      getUserPlanContext(session.userId),
    ]);
    const masked = planContext.effectivePlanCode === "free";
    return ok(
      topics.map((topic) => ({
        id: topic.id,
        sourceName: topic.sourceName,
        sourceType: topic.sourceType,
        sourcePriority: topic.sourcePriority,
        title: topic.title,
        summary: masked ? null : topic.summary,
        emotionLabels: masked ? [] : topic.emotionLabels,
        angleOptions: masked ? [] : topic.angleOptions,
        sourceUrl: topic.sourceUrl,
        relatedSourceNames: masked ? [] : topic.relatedSourceNames,
        relatedSourceUrls: masked ? [] : topic.relatedSourceUrls,
        publishedAt: topic.publishedAt,
        recommendationType: topic.recommendationType,
        recommendationReason: topic.recommendationReason,
        matchedPersonaName: topic.matchedPersonaName,
        freshnessScore: masked ? null : topic.freshnessScore,
        relevanceScore: masked ? null : topic.relevanceScore,
        priorityScore: masked ? null : topic.priorityScore,
      })),
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "选题雷达加载失败", 400);
  }
}
