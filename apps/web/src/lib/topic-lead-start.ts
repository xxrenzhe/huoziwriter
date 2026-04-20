import { buildFourPointAudit } from "./article-strategy";
import { generateArticleStageArtifact } from "./article-stage-artifacts";
import { setArticleWorkflowCurrentStage } from "./article-workflows";
import { attachFragmentToArticleNode, getArticleNodes, updateArticleNode } from "./article-outline";
import { distillCaptureInput } from "./distill";
import { getKnowledgeCards } from "./knowledge";
import { matchTopicToKnowledgeCards } from "./knowledge-match";
import { assertFragmentQuota, assertTopicSignalStartAllowed } from "./plan-access";
import { assertPersonaReady } from "./personas";
import { createArticle, createFragment, upsertArticleStrategyCard } from "./repositories";
import { buildFallbackStrategyCardAutoDraft, generateStrategyCardAutoDraft, type StrategyCardAutoDraft } from "./strategy-card-auto-draft";
import type { TopicFissionCandidate } from "./topic-fission";
import { adoptTopicLeadToArticle, createTopicLead } from "./topic-leads";
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

type TopicSeedStrategyCardInput = {
  archetype?: TopicFissionCandidate["suggestedArchetype"] | null;
  mainstreamBelief?: string | null;
  targetReader?: string | null;
  coreAssertion?: string | null;
  whyNow?: string | null;
};

async function startDraftFromTopicSeedForUser(input: {
  userId: number;
  title: string;
  sourceName: string;
  summary: string;
  recommendationReason: string;
  chosenAngle: string;
  emotionLabels: string[];
  sourceUrl?: string | null;
  seriesId?: number | null;
  matchedPersonaName?: string | null;
  strategyCard?: TopicSeedStrategyCardInput | null;
  topicLeadId?: number | null;
}) {
  await assertPersonaReady(input.userId);
  await assertTopicSignalStartAllowed(input.userId);
  await assertFragmentQuota(input.userId);

  const knowledgeCards = await getKnowledgeCards(input.userId);
  const matchedCards = matchTopicToKnowledgeCards(
    input.title,
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

  const article = await createArticle(input.userId, input.title, input.seriesId);
  if (!article?.id) {
    throw new Error("创建稿件失败");
  }
  if (input.topicLeadId) {
    await adoptTopicLeadToArticle({
      userId: input.userId,
      topicLeadId: input.topicLeadId,
      articleId: Number(article.id),
    });
  }
  await setArticleWorkflowCurrentStage({
    articleId: Number(article.id),
    userId: input.userId,
    stageCode: "researchBrief",
  });
  const autoDraft: StrategyCardAutoDraft = await generateStrategyCardAutoDraft({
    title: input.title,
    summary: input.summary,
    sourceName: input.sourceName,
    chosenAngle: input.chosenAngle,
    recommendationReason: input.recommendationReason,
    sourceUrl: input.sourceUrl,
    readerSnapshotHint: input.summary,
    strategyCard: input.strategyCard ?? null,
  }).catch(() => ({} as StrategyCardAutoDraft));
  const fallbackDraft = buildFallbackStrategyCardAutoDraft({
    title: input.title,
    strategyCard: input.strategyCard ?? null,
  });
  const mergedStrategyCard = {
    ...fallbackDraft,
    ...autoDraft,
    archetype: input.strategyCard?.archetype ?? autoDraft.archetype ?? fallbackDraft.archetype,
    mainstreamBelief: input.strategyCard?.mainstreamBelief ?? autoDraft.mainstreamBelief ?? fallbackDraft.mainstreamBelief,
    targetReader: input.strategyCard?.targetReader ?? autoDraft.targetReader ?? fallbackDraft.targetReader,
    coreAssertion: input.strategyCard?.coreAssertion ?? autoDraft.coreAssertion ?? fallbackDraft.coreAssertion,
    whyNow: input.strategyCard?.whyNow ?? autoDraft.whyNow ?? fallbackDraft.whyNow,
  };
  if (Object.keys(mergedStrategyCard).length > 0) {
    await upsertArticleStrategyCard({
      articleId: Number(article.id),
      userId: input.userId,
      ...mergedStrategyCard,
      fourPointAudit: buildFourPointAudit(mergedStrategyCard),
    });
  }
  const distilled = await distillCaptureInput({
    sourceType: "manual",
    title: input.title,
    content: [
      input.title,
      input.summary || "",
      input.recommendationReason || "",
      input.chosenAngle,
      input.sourceUrl || "",
    ].filter(Boolean).join("\n"),
  });
  const fragment = await createFragment({
    userId: input.userId,
    sourceType: "manual",
    title: distilled.title,
    rawContent: distilled.rawContent,
    distilledContent: distilled.distilledContent,
    sourceUrl: input.sourceUrl,
  });

  const nodes = await getArticleNodes(article.id);
  const nodeBlueprints = buildTopicNodeBlueprints({
    topicTitle: input.title,
    sourceName: input.sourceName,
    summary: input.summary || "",
    chosenAngle: input.chosenAngle,
    emotionLabels: input.emotionLabels,
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
      articleId: article.id,
      nodeId: node.id,
      title: blueprint.title,
      description: blueprint.description,
    });
  }

  if (fragment) {
    for (const node of nodes.slice(0, nodeBlueprints.length)) {
      await attachFragmentToArticleNode({
        articleId: article.id,
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
      articleId: article.id,
      nodeId: node.id,
      fragmentId: nextFragmentId,
    });
  }

  await generateArticleStageArtifact({
    articleId: article.id,
    userId: input.userId,
    stageCode: "researchBrief",
  });

  return {
    articleId: article.id,
    title: article.title,
    chosenAngle: input.chosenAngle,
    matchedPersonaName: input.matchedPersonaName ?? null,
  };
}

export async function startTopicLeadForUser(input: {
  userId: number;
  topicId: number;
  angleIndex?: number;
  chosenAngle?: string | null;
  seriesId?: number | null;
}) {
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
  const topicLead = await createTopicLead({
    userId: input.userId,
    source: "radar",
    topic: topic.title,
    description: topic.summary || topic.recommendationReason,
  });
  return startDraftFromTopicSeedForUser({
    userId: input.userId,
    title: topic.title,
    sourceName: topic.sourceName,
    summary: topic.summary || "",
    recommendationReason: topic.recommendationReason,
    chosenAngle,
    emotionLabels,
    sourceUrl: topic.sourceUrl,
    seriesId: input.seriesId,
    matchedPersonaName: topic.matchedPersonaName,
    topicLeadId: topicLead?.id ?? null,
  });
}

export async function startTopicFissionCandidateForUser(input: {
  userId: number;
  topicId: number;
  candidate: TopicFissionCandidate;
  seriesId?: number | null;
}) {
  const topics = await getVisibleTopicRecommendationsForUser(input.userId);
  const topic = topics.find((item) => item.id === input.topicId);
  if (!topic) {
    throw new Error("原始选题不存在");
  }
  const topicLead = await createTopicLead({
    userId: input.userId,
    source: "topicFission",
    fissionMode: input.candidate.fissionMode,
    sourceTrackLabel: input.candidate.sourceTrackLabel,
    topic: input.candidate.title,
    targetAudience: input.candidate.targetReader,
    description: input.candidate.description,
    predictedFlipStrength: input.candidate.predictedFlipStrength,
    archetypeSuggestion: input.candidate.suggestedArchetype,
  });

  return startDraftFromTopicSeedForUser({
    userId: input.userId,
    title: input.candidate.title,
    sourceName: `${topic.sourceName} · ${input.candidate.modeLabel}`,
    summary: input.candidate.description,
    recommendationReason: `由《${topic.title}》执行${input.candidate.modeLabel}得到，原赛道：${input.candidate.sourceTrackLabel}${input.candidate.targetTrackLabel ? `，目标赛道：${input.candidate.targetTrackLabel}` : ""}。`,
    chosenAngle: input.candidate.suggestedAngle,
    emotionLabels: dedupeEmotionLabels(topic.emotionLabels, input.candidate.modeLabel),
    sourceUrl: topic.sourceUrl,
    seriesId: input.seriesId,
    matchedPersonaName: topic.matchedPersonaName,
    strategyCard: {
      archetype: input.candidate.suggestedArchetype,
      mainstreamBelief: input.candidate.suggestedMainstreamBelief,
      targetReader: input.candidate.targetReader,
      coreAssertion: input.candidate.suggestedCoreAssertion,
      whyNow: input.candidate.suggestedWhyNow,
    },
    topicLeadId: topicLead?.id ?? null,
  });
}

function dedupeEmotionLabels(emotions: string[], modeLabel: string) {
  return Array.from(new Set([modeLabel, ...emotions].map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 4);
}
