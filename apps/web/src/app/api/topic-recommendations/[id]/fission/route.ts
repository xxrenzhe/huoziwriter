import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createTopicFissionJsonResult, createTopicFissionSseResponse, parseTopicFissionEngine, parseTopicFissionMode } from "@/lib/topic-fission-sse";

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
    const input = {
      userId: session.userId,
      topicId,
      mode: parseTopicFissionMode(body.mode),
      engine: parseTopicFissionEngine(body.engine),
    };
    if (body.stream === true) {
      return await createTopicFissionSseResponse(input);
    }
    const result = await createTopicFissionJsonResult(input);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "裂变生成失败";
    return fail(message, /上限/.test(message) ? 429 : 400);
  }
}
