import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { generateArticlesFromTopicBacklog } from "@/lib/topic-backlogs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateArticlesFromTopicBacklog({
      userId: session.userId,
      backlogId: Number(params.id),
      itemIds: Array.isArray(body.itemIds) ? body.itemIds : [],
      seriesId: body.seriesId,
      concurrency: body.concurrency,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量生成失败", 400);
  }
}
