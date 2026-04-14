import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { syncTopicRadar } from "@/lib/topic-radar";
import { getUserPlanContext } from "@/lib/plan-access";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await syncTopicRadar({ userId: session.userId, limitPerSource: 3 });
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
      publishedAt: topic.publishedAt,
      recommendationType: topic.recommendationType,
      recommendationReason: topic.recommendationReason,
      matchedPersonaName: topic.matchedPersonaName,
    })),
  );
}
