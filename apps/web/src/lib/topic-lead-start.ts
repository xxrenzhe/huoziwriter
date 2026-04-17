import { generateArticleStageArtifact } from "./article-stage-artifacts";
import { setArticleWorkflowCurrentStage } from "./article-workflows";
import { attachFragmentToArticleNode, getArticleNodes, updateArticleNode } from "./article-outline";
import { distillCaptureInput } from "./distill";
import { getKnowledgeCards } from "./knowledge";
import { matchTopicToKnowledgeCards } from "./knowledge-match";
import { assertFragmentQuota, assertTopicSignalStartAllowed } from "./plan-access";
import { assertPersonaReady } from "./personas";
import { createArticle, createFragment } from "./repositories";
import { getVisibleTopicRecommendationsForUser } from "./topic-recommendations";

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
  const knowledgeHintText = input.knowledgeHints?.length ? ` 优先参考这些背景卡：${input.knowledgeHints.join("；")}。` : "";

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

export async function startTopicLeadForUser(input: {
  userId: number;
  topicId: number;
  angleIndex?: number;
  chosenAngle?: string | null;
  seriesId?: number | null;
}) {
  await assertPersonaReady(input.userId);
  await assertTopicSignalStartAllowed(input.userId);
  await assertFragmentQuota(input.userId);

  const topics = await getVisibleTopicRecommendationsForUser(input.userId);
  const topic = topics.find((item) => item.id === input.topicId);
  if (!topic) {
    throw new Error("热点不存在");
  }
  const angleOptions = topic.angleOptions;
  const emotionLabels = topic.emotionLabels;
  const chosenAngle =
    String(input.chosenAngle || "").trim()
    || angleOptions[input.angleIndex ?? 0]
    || angleOptions[0]
    || `围绕“${topic.title}”写这条热点真正值得下笔的切口。`;
  const knowledgeCards = await getKnowledgeCards(input.userId);
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
  const matchedCardLookup = new Map(knowledgeCards.map((card) => [card.id, card] as const));

  const article = await createArticle(input.userId, topic.title, input.seriesId);
  await setArticleWorkflowCurrentStage({
    articleId: Number(article!.id),
    userId: input.userId,
    stageCode: "researchBrief",
  });
  const distilled = await distillCaptureInput({
    sourceType: "manual",
    title: topic.title,
    content: `${topic.title}\n${topic.summary || ""}\n${topic.recommendationReason}\n${chosenAngle}\n${topic.sourceUrl || ""}`,
  });
  const fragment = await createFragment({
    userId: input.userId,
    sourceType: "manual",
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
    sourceUrl: topic.sourceUrl,
  });

  const nodes = await getArticleNodes(article!.id);
  const nodeBlueprints = buildTopicNodeBlueprints({
    topicTitle: topic.title,
    sourceName: topic.sourceName,
    summary: topic.summary || "",
    chosenAngle,
    emotionLabels,
    knowledgeHints: matchedCards
      .map((matchedCard) => matchedCardLookup.get(matchedCard.id))
      .filter((card): card is NonNullable<typeof card> => Boolean(card))
      .map((card) => `${card.title}${card.latest_change_summary ? `：最近变化 ${card.latest_change_summary.slice(0, 60)}` : card.summary ? `：${card.summary.slice(0, 60)}` : ""}`),
  });

  for (const [index, blueprint] of nodeBlueprints.entries()) {
    const node = nodes[index];
    if (!node) {
      continue;
    }
    await updateArticleNode({
      articleId: article!.id,
      nodeId: node.id,
      title: blueprint.title,
      description: blueprint.description,
    });
  }

  if (fragment) {
    for (const node of nodes.slice(0, nodeBlueprints.length)) {
      await attachFragmentToArticleNode({
        articleId: article!.id,
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
    await attachFragmentToArticleNode({
      articleId: article!.id,
      nodeId: node.id,
      fragmentId: nextFragmentId,
    });
  }

  await generateArticleStageArtifact({
    articleId: article!.id,
    userId: input.userId,
    stageCode: "researchBrief",
  });

  return {
    articleId: article?.id,
    title: article?.title,
    chosenAngle,
    matchedPersonaName: topic.matchedPersonaName,
  };
}
