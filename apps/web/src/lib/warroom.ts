import { isPublishedArticleStatus } from "./article-status-label";
import { buildArticlePublicWorkflow, getArticleWorkflow } from "./article-workflows";
import { getUserPlanContext } from "./plan-access";
import { getArticleOutcomeBundlesByUser, getArticleStrategyCard, getArticlesByUser, getAuthorPlaybooks, getFragmentsByUser, getWechatSyncLogs } from "./repositories";
import { getSeries } from "./series";
import { getTopicBacklogs } from "./topic-backlogs";
import { getVisibleTopicRecommendationsForUser } from "./topic-recommendations";

const ACTIVE_SERIES_STATUSES = new Set(["active", "running"]);

function normalizeSeriesStatus(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function pickSuggestedSeriesId(
  topic: {
    matchedPersonaName: string | null;
  },
  series: Array<{ id: number; personaName: string; activeStatus: string }>,
) {
  const activeSeries = series.filter((item) => ACTIVE_SERIES_STATUSES.has(normalizeSeriesStatus(item.activeStatus)));
  const candidateSeries = activeSeries.length > 0 ? activeSeries : series;
  if (candidateSeries.length === 1) {
    return candidateSeries[0].id;
  }
  const matchedPersonaName = String(topic.matchedPersonaName || "").trim();
  if (matchedPersonaName) {
    const matchedSeries = candidateSeries.filter((item) => String(item.personaName || "").trim() === matchedPersonaName);
    if (matchedSeries.length === 1) {
      return matchedSeries[0].id;
    }
  }
  return candidateSeries[0]?.id ?? null;
}

function getDaysSince(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const diff = Date.now() - timestamp;
  if (diff <= 0) {
    return 0;
  }
  return Math.floor(diff / 86_400_000);
}

function buildDraftNextFocus(currentStepCode: string) {
  if (currentStepCode === "opportunity") return "先把题目推进到策略判断";
  if (currentStepCode === "strategy") return "缺研究与读者判断";
  if (currentStepCode === "evidence") return "缺素材、证据或核查";
  if (currentStepCode === "draft") return "缺正文推进与润色";
  if (currentStepCode === "publish") return "缺封面、排版或发布动作";
  return "继续补齐结果回流";
}

export async function getWarroomData(userId: number) {
  const [articles, fragments, outcomeBundles, playbooks, topics, planContext, series, topicBacklogs, syncLogs] = await Promise.all([
    getArticlesByUser(userId),
    getFragmentsByUser(userId),
    getArticleOutcomeBundlesByUser(userId),
    getAuthorPlaybooks(userId, 4),
    getVisibleTopicRecommendationsForUser(userId),
    getUserPlanContext(userId),
    getSeries(userId),
    getTopicBacklogs(userId),
    getWechatSyncLogs(userId),
  ]);
  const seriesMap = new Map(series.map((item) => [item.id, item] as const));
  const canStartRadar = planContext.planSnapshot.canStartTopicSignal;
  const drafts = articles.filter((article) => !isPublishedArticleStatus(article.status));
  const publishedArticles = articles.filter((article) => isPublishedArticleStatus(article.status));
  const outcomeBundleMap = new Map(outcomeBundles.map((bundle) => [bundle.outcome?.articleId, bundle] as const));
  const topicPool = topics.map((topic) => {
    const suggestedSeriesId = pickSuggestedSeriesId(
      { matchedPersonaName: topic.matchedPersonaName },
      series.map((item) => ({
        id: item.id,
        personaName: item.personaName,
        activeStatus: item.activeStatus,
      })),
    );
    return {
      id: topic.id,
      sourceName: topic.sourceName,
      sourceType: topic.sourceType,
      sourcePriority: topic.sourcePriority,
      title: topic.title,
      summary: topic.summary,
      emotionLabels: topic.emotionLabels,
      angleOptions: topic.angleOptions,
      sourceUrl: topic.sourceUrl,
      relatedSourceNames: topic.relatedSourceNames,
      relatedSourceUrls: topic.relatedSourceUrls,
      publishedAt: topic.publishedAt,
      recommendationType: topic.recommendationType,
      recommendationReason: topic.recommendationReason,
      matchedPersonaName: topic.matchedPersonaName,
      freshnessScore: topic.freshnessScore,
      relevanceScore: topic.relevanceScore,
      priorityScore: topic.priorityScore,
      suggestedSeriesId,
      suggestedSeriesName: suggestedSeriesId ? seriesMap.get(suggestedSeriesId)?.name ?? null : null,
    };
  });
  const pendingOutcomeArticles = publishedArticles
    .map((article) => {
      const bundle = outcomeBundleMap.get(article.id);
      const missingWindowCodes = bundle?.missingWindowCodes ?? ["24h", "72h", "7d"];
      const hitStatus = bundle?.outcome?.hitStatus ?? "pending";
      const daysSinceUpdate = getDaysSince(article.updated_at);
      const isOverdue = daysSinceUpdate >= 7 && (missingWindowCodes.includes("7d") || hitStatus === "pending");
      return {
        article: {
          id: article.id,
          title: article.title,
          status: article.status,
          updatedAt: article.updated_at,
          seriesId: article.series_id,
          seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
        },
        missingWindowCodes,
        completedWindowCodes: bundle?.completedWindowCodes ?? [],
        nextWindowCode: bundle?.nextWindowCode ?? null,
        hitStatus,
        targetPackage: bundle?.outcome?.targetPackage ?? null,
        reviewSummary: bundle?.outcome?.reviewSummary ?? null,
        nextAction: bundle?.outcome?.nextAction ?? null,
        playbookTags: bundle?.outcome?.playbookTags ?? [],
        daysSinceUpdate,
        isOverdue,
      };
    })
    .filter((item) => item.missingWindowCodes.length > 0 || item.hitStatus === "pending")
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) {
        return left.isOverdue ? -1 : 1;
      }
      if (left.daysSinceUpdate !== right.daysSinceUpdate) {
        return right.daysSinceUpdate - left.daysSinceUpdate;
      }
      return right.missingWindowCodes.length - left.missingWindowCodes.length;
    });
  const latestSyncLogByArticleId = new Map<number, Awaited<ReturnType<typeof getWechatSyncLogs>>[number]>();
  for (const log of syncLogs) {
    if (!latestSyncLogByArticleId.has(log.articleId)) {
      latestSyncLogByArticleId.set(log.articleId, log);
    }
  }
  const failedPublishArticles = articles
    .map((article) => {
      const latestSyncLog = latestSyncLogByArticleId.get(article.id);
      if (!latestSyncLog || latestSyncLog.status !== "failed") {
        return null;
      }
      return {
        articleId: article.id,
        articleTitle: article.title,
        seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
        updatedAt: article.updated_at,
        connectionName: latestSyncLog.connectionName,
        failureReason: latestSyncLog.failureReason,
        failureCode: latestSyncLog.failureCode,
        retryCount: latestSyncLog.retryCount,
        createdAt: latestSyncLog.createdAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => String(right?.createdAt || "").localeCompare(String(left?.createdAt || ""), "zh-CN")) as Array<{
      articleId: number;
      articleTitle: string;
      seriesName: string | null;
      updatedAt: string;
      connectionName: string | null;
      failureReason: string | null;
      failureCode: string | null;
      retryCount: number;
      createdAt: string;
    }>;
  const visibleDrafts = drafts.slice(0, 5);
  const [draftWorkflows, draftStrategyCards] = await Promise.all([
    Promise.all(
      visibleDrafts.map(async (article) => {
        const workflow = await getArticleWorkflow(article.id, userId);
        return buildArticlePublicWorkflow(workflow, { articleStatus: article.status });
      }),
    ),
    Promise.all(visibleDrafts.map((article) => getArticleStrategyCard(article.id, userId))),
  ]);
  const hitCount = outcomeBundles.filter((bundle) => bundle.outcome?.hitStatus === "hit").length;
  const nearMissCount = outcomeBundles.filter((bundle) => bundle.outcome?.hitStatus === "near_miss").length;
  const reviewedCount = outcomeBundles.filter(
    (bundle) => bundle.outcome && bundle.missingWindowCodes.length === 0 && bundle.outcome.hitStatus !== "pending",
  ).length;
  const overdueOutcomeCount = pendingOutcomeArticles.filter((item) => item.isOverdue).length;
  const failedPublishCount = failedPublishArticles.length;
  const visibleTopics = topicPool.slice(0, 3);
  const visiblePendingOutcomeArticles = pendingOutcomeArticles.slice(0, 3);
  const focus =
    failedPublishCount > 0
      ? {
          key: "publish",
          eyebrow: "先修发布",
          title: `${failedPublishCount} 篇稿件卡在发布失败`,
          detail: "发布失败意味着主链路停在最后一步。先修连接、素材或内容格式，再谈继续扩题或补复盘。",
          href: failedPublishArticles[0] ? `/articles/${failedPublishArticles[0].articleId}?step=publish` : "/settings/publish",
          actionLabel: "打开失败发布稿件",
        }
      : overdueOutcomeCount > 0
      ? {
          key: "outcome",
          eyebrow: "先补回流",
          title: `${overdueOutcomeCount} 篇结果已超期待补`,
          detail: "结果空窗拖得越久，打法沉淀越容易失真。先把 7d 快照与命中判定补齐，再决定要不要继续扩题。",
          href: visiblePendingOutcomeArticles[0] ? `/articles/${visiblePendingOutcomeArticles[0].article.id}` : "/reviews",
          actionLabel: "打开待回流稿件",
        }
      : pendingOutcomeArticles.length > 0
        ? {
            key: "outcome",
            eyebrow: "先补回流",
            title: `还有 ${pendingOutcomeArticles.length} 篇稿件等结果`,
            detail: "已发布稿件的下一步不是继续扩入口，而是把 24h / 72h / 7d 快照与复盘结论补完整。",
            href: visiblePendingOutcomeArticles[0] ? `/articles/${visiblePendingOutcomeArticles[0].article.id}` : "/reviews",
            actionLabel: "先去补结果",
          }
        : drafts.length > 0
          ? {
              key: "draft",
              eyebrow: "继续推进",
              title: `先把 ${drafts.length} 篇在推稿件清干净`,
              detail: "已经开头的稿件最接近产出，先清空在推，再决定是否开新题。",
              href: visibleDrafts[0] ? `/articles/${visibleDrafts[0].id}` : "/articles",
              actionLabel: "继续推进稿件",
            }
          : visibleTopics.length > 0
            ? {
                key: "topic",
                eyebrow: "现在开题",
                title: `今天最值得写的是《${visibleTopics[0].title}》`,
                detail: canStartRadar
                  ? "热点、系列匹配和结果回流已经帮你把优先级收窄到今天最值得开的几张卡。"
                  : "当前计划下先盯住系统给出的优先位，不必为了找题重新跳回别的页面。",
                href: "/articles",
                actionLabel: "从优先位起稿",
              }
            : playbooks.length > 0
              ? {
                  key: "playbook",
                  eyebrow: "先复用打法",
                  title: `先沿用「${playbooks[0].label}」这套已验证打法`,
                  detail: "当作战台暂时没有更强新题时，优先复用已经验证过的表达方式，会比盲目扩入口更稳。",
                  href: "/reviews",
                  actionLabel: "去看复盘与打法",
                }
              : {
                  key: "source",
                  eyebrow: "先补信源",
                  title: "作战台还没有足够信号",
                  detail: "先在设置里接入更贴近问题域的信源，或者手动建立第一篇稿件，让后续策略和回流开始累积。",
                  href: "/settings/sources",
                  actionLabel: "去补信源",
                };

  return {
    summary: {
      topicCount: topicPool.length,
      draftCount: drafts.length,
      pendingOutcomeCount: pendingOutcomeArticles.length,
      failedPublishCount,
      fragmentCount: fragments.length,
      canStartRadar,
      publishedCount: publishedArticles.length,
      hitCount,
      nearMissCount,
      reviewedCount,
      overdueOutcomeCount,
      playbookCount: playbooks.length,
      workspaceEmpty:
        topicPool.length === 0
        && drafts.length === 0
        && failedPublishArticles.length === 0
        && pendingOutcomeArticles.length === 0
        && playbooks.length === 0
        && fragments.length === 0,
      focus,
    },
    topics: visibleTopics,
    topicPool,
    drafts: visibleDrafts.map((article, index) => ({
      id: article.id,
      title: article.title,
      status: article.status,
      updatedAt: article.updated_at,
      seriesName: article.series_id ? seriesMap.get(article.series_id)?.name ?? null : null,
      targetPackage: draftStrategyCards[index]?.targetPackage ?? null,
      workflow: {
        currentStepCode: draftWorkflows[index]?.currentStepCode ?? "opportunity",
        currentStepTitle: draftWorkflows[index]?.steps.find((step) => step.code === draftWorkflows[index]?.currentStepCode)?.title ?? "机会",
        steps: draftWorkflows[index]?.steps ?? [],
        nextFocus: buildDraftNextFocus(draftWorkflows[index]?.currentStepCode ?? "opportunity"),
      },
    })),
    failedPublishArticles: failedPublishArticles.slice(0, 3),
    pendingOutcomeArticles: visiblePendingOutcomeArticles,
    playbooks,
    series: series.map((item) => ({
      id: item.id,
      name: item.name,
      personaName: item.personaName,
      activeStatus: item.activeStatus,
    })),
    topicBacklogs: topicBacklogs.map((item) => ({
      id: item.id,
      name: item.name,
      seriesId: item.seriesId,
      itemCount: item.itemCount,
    })),
  };
}

export type WarroomData = Awaited<ReturnType<typeof getWarroomData>>;
