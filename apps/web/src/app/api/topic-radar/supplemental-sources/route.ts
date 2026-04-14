import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { assertTopicRadarStartAllowed } from "@/lib/plan-access";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";
import { generateTopicSourceScout } from "@/lib/topic-source-scout";

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    await assertTopicRadarStartAllowed(session.userId);
    const body = await request.json().catch(() => ({}));
    const topicId = Number(body.topicId);
    if (!Number.isFinite(topicId)) {
      return fail("选题参数无效", 400);
    }

    const topics = await getVisibleTopicRecommendationsForUser(session.userId);
    const topic = topics.find((item) => item.id === topicId);
    if (!topic) {
      return fail("选题不存在或当前套餐不可见", 404);
    }

    const plan = await generateTopicSourceScout({
      title: topic.title,
      recommendationReason: topic.recommendationReason,
      matchedPersonaName: topic.matchedPersonaName,
      sourceName: topic.sourceName,
      sourceType: topic.sourceType,
      sourceUrl: topic.sourceUrl,
    });

    return ok(plan);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "补充信源生成失败", 400);
  }
}
