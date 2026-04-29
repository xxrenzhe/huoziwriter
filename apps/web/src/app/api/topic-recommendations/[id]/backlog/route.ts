import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createTopicBacklogItem, getTopicBacklogById } from "@/lib/topic-backlogs";
import { createTopicLead } from "@/lib/topic-leads";
import { getVisibleTopicRecommendationsForUser, type RankedTopicRecommendation } from "@/lib/topic-recommendations";

function isHotspotRecommendation(topic: RankedTopicRecommendation) {
  const sourceType = topic.sourceType.toLowerCase();
  const sourceKind = String(topic.sourceMeta?.sourceKind || "").toLowerCase();
  return sourceType.includes("hotspot") || sourceKind.includes("hotspot") || Boolean(topic.sourceMeta?.hotspotScore);
}

function buildBacklogSourceMeta(topic: RankedTopicRecommendation) {
  return {
    ...(topic.sourceMeta ?? {}),
    recommendation: {
      sourceName: topic.sourceName,
      sourceType: topic.sourceType,
      sourceUrl: topic.sourceUrl,
      relatedSourceNames: topic.relatedSourceNames,
      relatedSourceUrls: topic.relatedSourceUrls,
      recommendationType: topic.recommendationType,
      recommendationReason: topic.recommendationReason,
      matchedPersonaId: topic.matchedPersonaId,
      matchedPersonaName: topic.matchedPersonaName,
      freshnessScore: topic.freshnessScore,
      relevanceScore: topic.relevanceScore,
      priorityScore: topic.priorityScore,
    },
  };
}

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

    const topics = await getVisibleTopicRecommendationsForUser(session.userId);
    const topic = topics.find((item) => item.id === topicId);
    if (!topic) {
      throw new Error("原始选题不存在");
    }

    const topicLead = await createTopicLead({
      userId: session.userId,
      source: "radar",
      topic: topic.title,
      description: topic.summary || topic.recommendationReason,
    });

    const item = await createTopicBacklogItem({
      userId: session.userId,
      backlogId,
      topicLeadId: topicLead?.id ?? null,
      sourceType: isHotspotRecommendation(topic) ? "hotspot" : "from-radar",
      theme: topic.title,
      readerSnapshotHint: topic.summary || topic.recommendationReason,
      sourceMeta: buildBacklogSourceMeta(topic),
      status: body.status === "draft" ? "draft" : "ready",
    });

    return ok({
      item,
      backlog: await getTopicBacklogById(session.userId, backlogId),
      topicId,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "原题入库失败", 400);
  }
}
