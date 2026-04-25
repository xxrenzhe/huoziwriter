import { ensureUserSession } from "@/lib/auth";
import { getArticleAutomationRunById } from "@/lib/article-automation-runs";

const encoder = new TextEncoder();

function toEventChunk(payload: unknown, event?: string) {
  const prefix = event ? `event: ${event}\n` : "";
  return encoder.encode(`${prefix}data: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return new Response("未登录", { status: 401 });
  }

  const runId = Number(params.id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return new Response("自动化运行 ID 无效", { status: 400 });
  }

  const initial = await getArticleAutomationRunById(runId, session.userId);
  if (!initial) {
    return new Response("自动化运行不存在", { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let reading = false;
      let lastSnapshot = "";
      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const close = () => {
        if (closed) return;
        closed = true;
        if (pollTimer) clearInterval(pollTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        controller.close();
      };

      const publishSnapshot = async () => {
        if (closed || reading) return;
        reading = true;
        try {
          const detail = await getArticleAutomationRunById(runId, session.userId);
          if (!detail) {
            controller.enqueue(toEventChunk({ type: "error", error: "自动化运行不存在" }, "error"));
            close();
            return;
          }
          const serialized = JSON.stringify(detail);
          if (serialized !== lastSnapshot) {
            lastSnapshot = serialized;
            controller.enqueue(toEventChunk({ type: "snapshot", data: detail }));
          }
        } catch (error) {
          controller.enqueue(
            toEventChunk(
              {
                type: "error",
                error: error instanceof Error ? error.message : "自动化运行事件流读取失败",
              },
              "error",
            ),
          );
          close();
        } finally {
          reading = false;
        }
      };

      void publishSnapshot();

      pollTimer = setInterval(() => {
        void publishSnapshot();
      }, 1500);

      heartbeatTimer = setInterval(() => {
        if (!closed) {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        }
      }, 15000);

      request.signal.addEventListener("abort", close);
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
