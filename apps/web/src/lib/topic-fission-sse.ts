import { recordPlan17RuntimeObservation } from "./plan17-observability";
import { consumeImaFissionQuota } from "./plan-access";
import { generateTopicFission, type TopicFissionEngine, type TopicFissionMode } from "./topic-fission";
import { getVisibleTopicRecommendationsForUser } from "./topic-recommendations";

export function parseTopicFissionMode(value: unknown): TopicFissionMode {
  if (value === "contrast" || value === "cross-domain") {
    return value;
  }
  return "regularity";
}

export function parseTopicFissionEngine(value: unknown): TopicFissionEngine {
  return value === "ima" ? "ima" : "local";
}

export async function createTopicFissionSseResponse(input: {
  userId: number;
  topicId: number;
  mode: TopicFissionMode;
  engine: TopicFissionEngine;
}) {
  const routeStartedAt = Date.now();
  const topics = await getVisibleTopicRecommendationsForUser(input.userId);
  const topic = topics.find((item) => item.id === input.topicId);
  if (!topic) {
    throw new Error("选题不存在");
  }
  if (input.engine === "ima") {
    await consumeImaFissionQuota(input.userId);
  }

  const stream = new ReadableStream({
    start(controller) {
      const baseMeta = {
        topicId: input.topicId,
        engine: input.engine,
        mode: input.mode,
        route: "/api/topic-recommendations/[id]/fission",
      };
      const firstByteMs = Date.now() - routeStartedAt;
      controller.enqueue(`data: ${JSON.stringify({ status: "start", message: "裂变生成中…" })}\n\n`);
      void recordPlan17RuntimeObservation({
        metricKey: "topicFission.sse.firstByte",
        userId: input.userId,
        status: "completed",
        durationMs: firstByteMs,
        meta: baseMeta,
      }).catch(() => undefined);

      void (async () => {
        try {
          const result = await generateTopicFission({
            userId: input.userId,
            topic,
            mode: input.mode,
            engine: input.engine,
          });
          controller.enqueue(`data: ${JSON.stringify({ status: "done", result })}\n\n`);
          controller.close();
          await recordPlan17RuntimeObservation({
            metricKey: "topicFission.sse.total",
            userId: input.userId,
            status: "completed",
            durationMs: Date.now() - routeStartedAt,
            meta: baseMeta,
          }).catch(() => undefined);
        } catch (error) {
          const message = error instanceof Error ? error.message : "裂变生成失败";
          controller.enqueue(`data: ${JSON.stringify({ status: "error", error: message })}\n\n`);
          controller.close();
          await recordPlan17RuntimeObservation({
            metricKey: "topicFission.sse.total",
            userId: input.userId,
            status: "failed",
            durationMs: Date.now() - routeStartedAt,
            meta: {
              ...baseMeta,
              error: message.slice(0, 200),
            },
          }).catch(() => undefined);
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
