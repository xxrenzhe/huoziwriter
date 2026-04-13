import { ensureUserSession } from "@/lib/auth";
import { updateDocumentNode, attachFragmentToNode, getDocumentNodes } from "@/lib/document-outline";
import { getKnowledgeCards } from "@/lib/knowledge";
import { matchTopicToKnowledgeCards } from "@/lib/knowledge-match";
import { distillCaptureInput } from "@/lib/distill";
import { fail, ok } from "@/lib/http";
import { assertFragmentQuota, assertTopicRadarStartAllowed } from "@/lib/plan-access";
import { createDocument, createFragment, getTopicItems } from "@/lib/repositories";

function parseJsonArray(value: string | string[] | null) {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
}

function buildTopicNodeBlueprints(input: {
  topicTitle: string;
  sourceName: string;
  summary: string;
  chosenAngle: string;
  emotionLabels: string[];
  knowledgeHints?: string[];
}) {
  const leadEmotion = input.emotionLabels[0] || "结构变化";
  const summary = input.summary || `围绕“${input.topicTitle}”先拆事实，再拆叙事，再落回读者处境。`;
  const knowledgeHintText = input.knowledgeHints?.length ? ` 优先参考这些主题档案：${input.knowledgeHints.join("；")}。` : "";

  return [
    {
      title: "切口结论",
      description: `用一句话写明这篇文章为什么不重复新闻标题，而是从“${input.chosenAngle}”切入。`,
    },
    {
      title: "关键事实与利益变化",
      description: `把 ${input.sourceName} 这条热点里最关键的数据、角色关系和利益变化拆开写清。参考摘要：${summary}${knowledgeHintText}`,
    },
    {
      title: "旧判断为何失效",
      description: `围绕“${leadEmotion}”解释这件事为什么值得重写，原有判断、旧话术或行业共识哪里开始失灵。${knowledgeHintText}`,
    },
    {
      title: "落回读者处境",
      description: "最后一段不要收成口号，要落到创作者、团队或行业参与者现在该怎么判断、怎么行动。",
    },
  ];
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertTopicRadarStartAllowed(session.userId);
    await assertFragmentQuota(session.userId);
    const body = await request.json();
    const topics = await getTopicItems(session.userId);
    const topic = topics.find((item) => item.id === Number(body.topicId));
    if (!topic) {
      return fail("热点不存在", 404);
    }
    const angleOptions = parseJsonArray(topic.angle_options_json);
    const emotionLabels = parseJsonArray(topic.emotion_labels_json);
    const requestedAngleIndex = Number.isFinite(Number(body.angleIndex)) ? Number(body.angleIndex) : 0;
    const chosenAngle = angleOptions[requestedAngleIndex] || angleOptions[0] || `围绕“${topic.title}”写这条热点真正值得下笔的切口。`;
    const knowledgeCards = await getKnowledgeCards(session.userId);
    const matchedCards = matchTopicToKnowledgeCards(
      topic.title,
      knowledgeCards.map((card) => ({
        id: card.id,
        title: card.title,
        summary: card.summary,
        card_type: card.card_type,
        status: card.status,
        confidence_score: card.confidence_score,
      })),
      3,
    );
    const matchedCardLookup = new Map(knowledgeCards.map((card) => [card.id, card]));

    const document = await createDocument(session.userId, topic.title);
    const distilled = await distillCaptureInput({
      sourceType: "manual",
      title: topic.title,
      content: `${topic.title}\n${topic.summary || ""}\n${chosenAngle}\n${topic.source_url || ""}`,
    });
    const fragment = await createFragment({
      userId: session.userId,
      sourceType: "manual",
      title: distilled.title,
      rawContent: distilled.rawContent,
      distilledContent: distilled.distilledContent,
      sourceUrl: topic.source_url,
    });

    const nodes = await getDocumentNodes(document!.id);
    const nodeBlueprints = buildTopicNodeBlueprints({
      topicTitle: topic.title,
      sourceName: topic.source_name,
      summary: topic.summary || "",
      chosenAngle,
      emotionLabels,
      knowledgeHints: matchedCards
        .map((matchedCard) => matchedCardLookup.get(matchedCard.id))
        .filter((card): card is NonNullable<typeof card> => Boolean(card))
        .map((card) => `${card.title}${card.summary ? `：${card.summary.slice(0, 60)}` : ""}`),
    });

    for (const [index, blueprint] of nodeBlueprints.entries()) {
      const node = nodes[index];
      if (!node) {
        continue;
      }
      await updateDocumentNode({
        documentId: document!.id,
        nodeId: node.id,
        title: blueprint.title,
        description: blueprint.description,
      });
    }

    if (fragment) {
      for (const node of nodes.slice(0, nodeBlueprints.length)) {
        await attachFragmentToNode({
          documentId: document!.id,
          nodeId: node.id,
          fragmentId: Number(fragment.id),
        });
      }
    }
    const usedFragmentIds = new Set<number>(fragment ? [Number(fragment.id)] : []);
    for (const [index, matchedCard] of matchedCards.entries()) {
      const sourceCard = matchedCardLookup.get(matchedCard.id);
      const node = nodes[Math.min(index + 1, nodes.length - 1)];
      if (!sourceCard || !node) {
        continue;
      }
      const nextFragmentId = sourceCard.source_fragment_ids.find((fragmentId) => !usedFragmentIds.has(fragmentId));
      if (!nextFragmentId) {
        continue;
      }
      usedFragmentIds.add(nextFragmentId);
      await attachFragmentToNode({
        documentId: document!.id,
        nodeId: node.id,
        fragmentId: nextFragmentId,
      });
    }

    return ok({
      documentId: document?.id,
      title: document?.title,
      chosenAngle,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "一键落笔失败", 400);
  }
}
