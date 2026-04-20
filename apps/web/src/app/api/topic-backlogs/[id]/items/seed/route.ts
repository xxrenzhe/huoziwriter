import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { generateTopicBacklogItemsFromSeed } from "@/lib/topic-backlog-ideation";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await generateTopicBacklogItemsFromSeed({
      userId: session.userId,
      backlogId: Number(params.id),
      seedTheme: body.seedTheme,
      targetAudience: body.targetAudience,
      seedContext: body.seedContext,
      count: body.count,
      defaultStatus: body.defaultStatus,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "AI 批量生题失败", 400);
  }
}
