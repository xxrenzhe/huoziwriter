import { getAuthorOutcomeFeedbackLedger } from "./author-outcome-feedback-ledger";
import { buildArticleScorecard, type ArticleScorecard } from "./article-scorecard";
import { STRATEGY_ARCHETYPE_OPTIONS } from "./article-strategy";
import { getArticleStageArtifacts } from "./article-stage-artifacts";
import { getArticleWorkflow } from "./article-workflows";
import { getArticleNodes } from "./article-outline";
import {
  getArticleById,
  getArticleOutcomeBundle,
  getArticleOutcomeBundlesByUser,
  getArticlesByUser,
  getAuthorPlaybooks,
  type ArticleOutcome,
  type ArticleOutcomeBundle,
} from "./repositories";
import { getSeries } from "./series";
import { getActiveWritingEvalScoringProfile } from "./writing-eval";

export type ResolvedArticleOutcomeBundle = Omit<ArticleOutcomeBundle, "outcome"> & {
  outcome: ArticleOutcome;
};

export type ReviewSeriesPlaybookLabel = {
  label: string;
  hitCount: number;
  nearMissCount: number;
  articleCount: number;
  latestArticleTitle: string | null;
  updatedAt: string;
};

export type ReviewSeriesPlaybook = {
  seriesId: number;
  seriesName: string;
  personaName: string;
  articleCount: number;
  hitCount: number;
  nearMissCount: number;
  latestArticleTitle: string | null;
  updatedAt: string;
  topLabels: ReviewSeriesPlaybookLabel[];
};

export type ReviewAttributionPlaybookItem = {
  label: string;
  detail: string;
  hitCount: number;
  nearMissCount: number;
  articleCount: number;
  latestArticleTitle: string | null;
  updatedAt: string;
};

export type ReviewOutcomeAttributionViews = {
  archetypes: ReviewAttributionPlaybookItem[];
  strategyStrengths: ReviewAttributionPlaybookItem[];
  hookCombos: ReviewAttributionPlaybookItem[];
};

type ReviewSeriesAggregation = ReviewSeriesPlaybook & {
  articleIds: Set<number>;
  labels: Map<string, ReviewSeriesPlaybookLabel & { articleIds: Set<number> }>;
};

function comparePlaybookLabels(left: ReviewSeriesPlaybookLabel, right: ReviewSeriesPlaybookLabel) {
  if (right.hitCount !== left.hitCount) {
    return right.hitCount - left.hitCount;
  }
  if (right.nearMissCount !== left.nearMissCount) {
    return right.nearMissCount - left.nearMissCount;
  }
  if (right.articleCount !== left.articleCount) {
    return right.articleCount - left.articleCount;
  }
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.label.localeCompare(right.label, "zh-CN");
}

function compareSeriesPlaybooks(left: ReviewSeriesPlaybook, right: ReviewSeriesPlaybook) {
  if (right.hitCount !== left.hitCount) {
    return right.hitCount - left.hitCount;
  }
  if (right.nearMissCount !== left.nearMissCount) {
    return right.nearMissCount - left.nearMissCount;
  }
  if (right.articleCount !== left.articleCount) {
    return right.articleCount - left.articleCount;
  }
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.seriesName.localeCompare(right.seriesName, "zh-CN");
}

function compareAttributionPlaybooks(left: ReviewAttributionPlaybookItem, right: ReviewAttributionPlaybookItem) {
  if (right.hitCount !== left.hitCount) {
    return right.hitCount - left.hitCount;
  }
  if (right.nearMissCount !== left.nearMissCount) {
    return right.nearMissCount - left.nearMissCount;
  }
  if (right.articleCount !== left.articleCount) {
    return right.articleCount - left.articleCount;
  }
  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return left.label.localeCompare(right.label, "zh-CN");
}

function getAttributionRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getAttributionNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAttributionString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStrengthBucketLabel(score: number | null) {
  if (score == null) {
    return "四元强度待补";
  }
  if (score >= 4.5) return "四元 4.5+";
  if (score >= 4.0) return "四元 4.0-4.4";
  if (score >= 3.5) return "四元 3.5-3.9";
  if (score >= 3.0) return "四元 3.0-3.4";
  return "四元 <3.0";
}

function buildOutcomeAttributionViews(input: {
  articles: Awaited<ReturnType<typeof getArticlesByUser>>;
  outcomeBundles: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>;
}) {
  const articleMap = new Map(input.articles.map((article) => [article.id, article] as const));
  const archetypes = new Map<string, ReviewAttributionPlaybookItem & { articleIds: Set<number> }>();
  const strategyStrengths = new Map<string, ReviewAttributionPlaybookItem & { articleIds: Set<number> }>();
  const hookCombos = new Map<string, ReviewAttributionPlaybookItem & { articleIds: Set<number> }>();

  function accumulate(
    bucket: Map<string, ReviewAttributionPlaybookItem & { articleIds: Set<number> }>,
    key: string,
    label: string,
    detail: string,
    articleId: number,
    articleTitle: string | null,
    hitStatus: "pending" | "hit" | "near_miss" | "miss",
    updatedAt: string,
  ) {
    const existing = bucket.get(key) ?? {
      label,
      detail,
      hitCount: 0,
      nearMissCount: 0,
      articleCount: 0,
      latestArticleTitle: null,
      updatedAt,
      articleIds: new Set<number>(),
    };
    if (!existing.articleIds.has(articleId)) {
      existing.articleIds.add(articleId);
      existing.articleCount += 1;
      if (hitStatus === "hit") {
        existing.hitCount += 1;
      } else if (hitStatus === "near_miss") {
        existing.nearMissCount += 1;
      }
    }
    if (!existing.latestArticleTitle || updatedAt > existing.updatedAt) {
      existing.latestArticleTitle = articleTitle;
      existing.updatedAt = updatedAt;
    }
    bucket.set(key, existing);
  }

  for (const bundle of input.outcomeBundles) {
    const outcome = bundle.outcome;
    if (!outcome || (outcome.hitStatus !== "hit" && outcome.hitStatus !== "near_miss")) {
      continue;
    }
    const attribution = getAttributionRecord(outcome.attribution);
    if (!attribution) {
      continue;
    }
    const article = articleMap.get(outcome.articleId);
    const strategy = getAttributionRecord(attribution.strategy);
    const evidence = getAttributionRecord(attribution.evidence);
    const archetypeKey = getAttributionString(strategy?.archetype);
    if (archetypeKey) {
      const archetypeLabel =
        STRATEGY_ARCHETYPE_OPTIONS.find((item) => item.key === archetypeKey)?.label
        ?? archetypeKey;
      accumulate(archetypes, archetypeKey, archetypeLabel, "高命中原型分布", outcome.articleId, article?.title ?? null, outcome.hitStatus, outcome.updatedAt);
    }
    const strengthBucketLabel = getStrengthBucketLabel(getAttributionNumber(strategy?.fourPointAverageScore));
    accumulate(strategyStrengths, strengthBucketLabel, strengthBucketLabel, "四元强度分布", outcome.articleId, article?.title ?? null, outcome.hitStatus, outcome.updatedAt);
    const hookComboLabel = getAttributionString(evidence?.primaryHookComboLabel);
    if (hookComboLabel) {
      accumulate(hookCombos, hookComboLabel, hookComboLabel, "高命中爆点标签组合", outcome.articleId, article?.title ?? null, outcome.hitStatus, outcome.updatedAt);
    }
  }

  const stripInternal = (bucket: Map<string, ReviewAttributionPlaybookItem & { articleIds: Set<number> }>) =>
    Array.from(bucket.values())
      .map(({ articleIds: _articleIds, ...item }) => item)
      .sort(compareAttributionPlaybooks);

  return {
    archetypes: stripInternal(archetypes),
    strategyStrengths: stripInternal(strategyStrengths),
    hookCombos: stripInternal(hookCombos),
  } satisfies ReviewOutcomeAttributionViews;
}

function buildReviewSeriesPlaybooks(input: {
  articles: Awaited<ReturnType<typeof getArticlesByUser>>;
  outcomeBundles: Awaited<ReturnType<typeof getArticleOutcomeBundlesByUser>>;
  series: Awaited<ReturnType<typeof getSeries>>;
}) {
  const publishedArticles = input.articles.filter((article) => article.status === "published");
  const outcomeBundleMap = new Map(input.outcomeBundles.map((bundle) => [bundle.outcome?.articleId, bundle] as const));
  const seriesMap = new Map(input.series.map((item) => [item.id, item] as const));
  const reviewBackedArticles = publishedArticles
    .map((article) => ({ article, bundle: outcomeBundleMap.get(article.id) }))
    .filter((item) => {
      if (!item.bundle?.outcome || !item.article.series_id) {
        return false;
      }
      return item.bundle.completedWindowCodes.length > 0 || item.bundle.outcome.hitStatus !== "pending";
    });
  const aggregatedSeries = new Map<number, ReviewSeriesAggregation>();

  for (const { article, bundle } of reviewBackedArticles) {
    const seriesId = article.series_id;
    if (!seriesId || !bundle?.outcome) {
      continue;
    }
    const seriesItem = seriesMap.get(seriesId);
    if (!seriesItem) {
      continue;
    }

    const existingSeries = aggregatedSeries.get(seriesId) ?? {
      seriesId,
      seriesName: seriesItem.name,
      personaName: seriesItem.personaName,
      articleCount: 0,
      hitCount: 0,
      nearMissCount: 0,
      latestArticleTitle: null,
      updatedAt: bundle.outcome.updatedAt,
      topLabels: [],
      articleIds: new Set<number>(),
      labels: new Map<string, ReviewSeriesPlaybookLabel & { articleIds: Set<number> }>(),
    };

    if (!existingSeries.articleIds.has(article.id)) {
      existingSeries.articleIds.add(article.id);
      existingSeries.articleCount += 1;
      if (bundle.outcome.hitStatus === "hit") {
        existingSeries.hitCount += 1;
      } else if (bundle.outcome.hitStatus === "near_miss") {
        existingSeries.nearMissCount += 1;
      }
    }

    if (!existingSeries.latestArticleTitle || bundle.outcome.updatedAt > existingSeries.updatedAt) {
      existingSeries.latestArticleTitle = article.title;
      existingSeries.updatedAt = bundle.outcome.updatedAt;
    }

    const labels = bundle.outcome.playbookTags.length > 0
      ? bundle.outcome.playbookTags
      : bundle.outcome.targetPackage
        ? [`目标包：${bundle.outcome.targetPackage}`]
        : [];

    for (const label of labels) {
      const existingLabel = existingSeries.labels.get(label) ?? {
        label,
        hitCount: 0,
        nearMissCount: 0,
        articleCount: 0,
        latestArticleTitle: null,
        updatedAt: bundle.outcome.updatedAt,
        articleIds: new Set<number>(),
      };
      if (!existingLabel.articleIds.has(article.id)) {
        existingLabel.articleIds.add(article.id);
        existingLabel.articleCount += 1;
        if (bundle.outcome.hitStatus === "hit") {
          existingLabel.hitCount += 1;
        } else if (bundle.outcome.hitStatus === "near_miss") {
          existingLabel.nearMissCount += 1;
        }
      }
      if (!existingLabel.latestArticleTitle || bundle.outcome.updatedAt > existingLabel.updatedAt) {
        existingLabel.latestArticleTitle = article.title;
        existingLabel.updatedAt = bundle.outcome.updatedAt;
      }
      existingSeries.labels.set(label, existingLabel);
    }

    aggregatedSeries.set(seriesId, existingSeries);
  }

  return Array.from(aggregatedSeries.values())
    .map(({ articleIds: _articleIds, labels, ...item }) => ({
      ...item,
      topLabels: Array.from(labels.values())
        .map(({ articleIds: _labelArticleIds, ...labelItem }) => labelItem)
        .sort(comparePlaybookLabels),
    }))
    .sort(compareSeriesPlaybooks);
}

export function resolveArticleOutcomeBundle(input: {
  articleId: number;
  userId: number;
  bundle: ArticleOutcomeBundle;
  scorecard: ArticleScorecard;
}) {
  return {
    ...input.bundle,
    outcome:
      input.bundle.outcome
        ? {
            ...input.bundle.outcome,
            scorecard:
              Object.keys(input.bundle.outcome.scorecard || {}).length > 0
                ? input.bundle.outcome.scorecard
                : input.scorecard,
          }
        : {
            id: 0,
            articleId: input.articleId,
            userId: input.userId,
            targetPackage: null,
            scorecard: input.scorecard,
            attribution: null,
            hitStatus: "pending" as const,
            expressionFeedback: null,
            reviewSummary: null,
            nextAction: null,
            playbookTags: [],
            createdAt: input.scorecard.generatedAt,
            updatedAt: input.scorecard.generatedAt,
          },
  } satisfies ResolvedArticleOutcomeBundle;
}

export async function getArticleOutcomeData(articleId: number, userId: number) {
  const article = await getArticleById(articleId, userId);
  if (!article) {
    return null;
  }

  const [bundle, workflow, stageArtifacts, nodes, activeScoringProfile] = await Promise.all([
    getArticleOutcomeBundle(article.id, userId),
    getArticleWorkflow(article.id, userId),
    getArticleStageArtifacts(article.id, userId),
    getArticleNodes(article.id),
    getActiveWritingEvalScoringProfile(),
  ]);
  const scorecard = buildArticleScorecard({
    title: article.title,
    markdownContent: article.markdown_content,
    status: article.status,
    activeScoringProfile: activeScoringProfile
      ? {
          code: activeScoringProfile.code,
          name: activeScoringProfile.name,
        }
      : null,
    workflow,
    stageArtifacts,
    nodes,
  });

  return {
    article,
    workflow,
    stageArtifacts,
    nodes,
    scorecard,
    outcomeBundle: resolveArticleOutcomeBundle({
      articleId: article.id,
      userId,
      bundle,
      scorecard,
    }),
  };
}

export async function getCurrentSeriesPlaybook(userId: number, seriesId: number | null) {
  if (!seriesId) {
    return null;
  }
  const [articles, outcomeBundles, series] = await Promise.all([
    getArticlesByUser(userId),
    getArticleOutcomeBundlesByUser(userId),
    getSeries(userId),
  ]);
  return buildReviewSeriesPlaybooks({
    articles,
    outcomeBundles,
    series,
  }).find((item) => item.seriesId === seriesId) ?? null;
}

export async function getReviewData(userId: number) {
  const [articles, outcomeBundles, playbooks, series, authorOutcomeFeedbackLedger] = await Promise.all([
    getArticlesByUser(userId),
    getArticleOutcomeBundlesByUser(userId),
    getAuthorPlaybooks(userId),
    getSeries(userId),
    getAuthorOutcomeFeedbackLedger({ userId, refreshIfMissing: true }),
  ]);
  const publishedArticles = articles.filter((article) => article.status === "published");
  const outcomeBundleMap = new Map(outcomeBundles.map((bundle) => [bundle.outcome?.articleId, bundle] as const));
  const outcomeArticles = publishedArticles
    .flatMap((article) => {
      const bundle = outcomeBundleMap.get(article.id);
      return bundle?.outcome ? [{ article, bundle }] : [];
    })
    .sort((left, right) => right.bundle.outcome.updatedAt.localeCompare(left.bundle.outcome.updatedAt));
  const hitCandidates = publishedArticles
    .map((article) => ({ article, bundle: outcomeBundleMap.get(article.id) }))
    .filter((item) => item.bundle?.outcome?.hitStatus === "hit");
  const nearMisses = publishedArticles
    .map((article) => ({ article, bundle: outcomeBundleMap.get(article.id) }))
    .filter((item) => item.bundle?.outcome?.hitStatus === "near_miss");
  const seriesPlaybooks = buildReviewSeriesPlaybooks({
    articles,
    outcomeBundles,
    series,
  });
  const attributionViews = buildOutcomeAttributionViews({
    articles,
    outcomeBundles,
  });

  return {
    publishedArticles,
    outcomeArticles,
    hitCandidates,
    nearMisses,
    seriesPlaybooks,
    playbooks,
    attributionViews,
    effectiveWritingProfile: authorOutcomeFeedbackLedger?.effectiveWritingProfile ?? null,
  };
}
