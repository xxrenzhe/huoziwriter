import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { bulkCreateTopicBacklogItems } from "@/lib/topic-backlogs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await bulkCreateTopicBacklogItems({
      userId: session.userId,
      backlogId: Number(params.id),
      items: body.items,
      text: body.text,
      defaultSourceType: body.defaultSourceType,
      defaultStatus: body.defaultStatus,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "批量导入选题失败", 400);
  }
}
