import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { startTopicFissionCandidateForUser } from "@/lib/topic-lead-start";
import { parseTopicFissionCandidate } from "../shared";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const topicId = Number(params.id);
    if (!Number.isFinite(topicId)) {
      throw new Error("原始选题不存在");
    }
    const body = await request.json().catch(() => ({}));
    const candidate = parseTopicFissionCandidate(body.candidate);
    const result = await startTopicFissionCandidateForUser({
      userId: session.userId,
      topicId,
      candidate,
      seriesId: Number.isFinite(Number(body.seriesId)) ? Number(body.seriesId) : null,
    });
    return ok(result);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "裂变起稿失败", 400);
  }
}
