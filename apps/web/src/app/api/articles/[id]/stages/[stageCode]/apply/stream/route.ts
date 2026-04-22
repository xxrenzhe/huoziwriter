import { ensureUserSession } from "@/lib/auth";
import { applyArticleStageArtifact } from "@/lib/article-stage-apply";
import { isSupportedArticleArtifactStage } from "@/lib/article-stage-artifacts";
import { splitIntoChunks } from "@/lib/generation";
import { fail } from "@/lib/http";

export async function POST(_: Request, { params }: { params: { id: string; stageCode: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const stageCode = params.stageCode;
  if (!isSupportedArticleArtifactStage(stageCode)) {
    return fail("当前阶段暂不支持流式应用到正文", 400);
  }

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(`data: ${JSON.stringify({ status: "start" })}\n\n`);
      try {
        const result = await applyArticleStageArtifact({
          articleId: Number(params.id),
          userId: session.userId,
          role: session.role,
          stageCode,
        });
        for (const chunk of splitIntoChunks(result.markdownContent)) {
          controller.enqueue(`data: ${JSON.stringify({ status: "writing", delta: chunk })}\n\n`);
        }
        controller.enqueue(`data: ${JSON.stringify({ status: "done", data: result })}\n\n`);
      } catch (error) {
        controller.enqueue(
          `data: ${JSON.stringify({ status: "error", error: error instanceof Error ? error.message : "流式应用阶段产物失败" })}\n\n`,
        );
      } finally {
        controller.close();
      }
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
