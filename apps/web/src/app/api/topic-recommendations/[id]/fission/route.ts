import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { consumeImaFissionQuota } from "@/lib/plan-access";
import { generateTopicFission, type TopicFissionEngine, type TopicFissionMode } from "@/lib/topic-fission";
import { getVisibleTopicRecommendationsForUser } from "@/lib/topic-recommendations";

function parseFissionMode(value: unknown): TopicFissionMode {
  if (value === "contrast" || value === "cross-domain") {
    return value;
  }
  return "regularity";
}

function parseFissionEngine(value: unknown): TopicFissionEngine {
  return value === "ima" ? "ima" : "local";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const topicId = Number(params.id);
    if (!Number.isFinite(topicId)) {
      throw new Error("选题不存在");
    }
    const body = await request.json().catch(() => ({}));
    const mode = parseFissionMode(body.mode);
    const engine = parseFissionEngine(body.engine);
    const topics = await getVisibleTopicRecommendationsForUser(session.userId);
    const topic = topics.find((item) => item.id === topicId);
    if (!topic) {
      throw new Error("选题不存在");
    }
    if (engine === "ima") {
      await consumeImaFissionQuota(session.userId);
    }
    return ok(await generateTopicFission({ userId: session.userId, topic, mode, engine }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "裂变生成失败";
    return fail(message, /上限/.test(message) ? 429 : 400);
  }
}
