import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createTopicBacklogItem, getTopicBacklogById } from "@/lib/topic-backlogs";
import { createTopicLead } from "@/lib/topic-leads";
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
    const backlogId = Number(body.backlogId);
    if (!Number.isFinite(backlogId) || backlogId <= 0) {
      throw new Error("先选择一个选题库");
    }
    const candidate = parseTopicFissionCandidate(body.candidate);
    const topicLead = await createTopicLead({
      userId: session.userId,
      source: "topicFission",
      fissionMode: candidate.fissionMode,
      sourceTrackLabel: candidate.sourceTrackLabel,
      topic: candidate.title,
      targetAudience: candidate.targetReader,
      description: candidate.description,
      predictedFlipStrength: candidate.predictedFlipStrength,
      archetypeSuggestion: candidate.suggestedArchetype,
    });
    const item = await createTopicBacklogItem({
      userId: session.userId,
      backlogId,
      topicLeadId: topicLead?.id ?? null,
      sourceType: "from-fission",
      fissionMode: candidate.fissionMode,
      theme: candidate.title,
      archetype: candidate.suggestedArchetype,
      targetAudience: candidate.targetReader,
      readerSnapshotHint: candidate.description,
      strategyDraft: {
        coreAssertion: candidate.suggestedCoreAssertion,
        whyNow: candidate.suggestedWhyNow,
        mainstreamBelief: candidate.suggestedMainstreamBelief,
        targetReader: candidate.targetReader,
      },
      status: body.status === "draft" ? "draft" : "ready",
    });
    return ok({
      item,
      backlog: await getTopicBacklogById(session.userId, backlogId),
      topicId,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "裂变候选入库失败", 400);
  }
}
