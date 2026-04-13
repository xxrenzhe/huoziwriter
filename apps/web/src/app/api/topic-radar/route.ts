import { ensureUserSession, findUserById } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { syncTopicRadar } from "@/lib/topic-radar";
import { getTopicItems } from "@/lib/repositories";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  await syncTopicRadar({ userId: session.userId, limitPerSource: 3 });
  const user = await findUserById(session.userId);
  const topics = await getTopicItems(session.userId);
  const masked = user?.plan_code === "free";
  return ok(
    topics.map((topic) => ({
      id: topic.id,
      sourceName: topic.source_name,
      title: topic.title,
      summary: masked ? null : topic.summary,
      emotionLabels: masked ? [] : parseJsonArray(topic.emotion_labels_json),
      angleOptions: masked ? [] : parseJsonArray(topic.angle_options_json),
      sourceUrl: topic.source_url,
      publishedAt: topic.published_at,
    })),
  );
}

function parseJsonArray(value: string | string[] | null) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}
