import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { startTopicLeadForUser } from "@/lib/topic-lead-start";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    const body = await request.json().catch(() => ({}));
    const result = await startTopicLeadForUser({
      userId: session.userId,
      topicId: Number(params.id),
      angleIndex: Number.isFinite(Number(body.angleIndex)) ? Number(body.angleIndex) : 0,
      chosenAngle: String(body.chosenAngle || "").trim() || null,
      seriesId: Number.isFinite(Number(body.seriesId)) ? Number(body.seriesId) : null,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "一键落笔失败", 400);
  }
}
