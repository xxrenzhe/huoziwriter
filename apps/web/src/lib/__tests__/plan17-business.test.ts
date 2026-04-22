import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlan17BusinessExportCsv,
  buildPlan17BusinessReportFromFacts,
  buildPlan17BusinessViewPayload,
  normalizePlan17BusinessExportScope,
  normalizePlan17BusinessView,
} from "../plan17-business";

function buildComprehensiveBusinessReport() {
  return buildPlan17BusinessReportFromFacts({
    generatedAt: "2026-04-20T00:00:00.000Z",
    now: "2026-04-20T00:00:00.000Z",
    reviewedOutcomes: [
      { userId: 1, articleId: 101, articleCreatedAt: "2026-02-10T00:00:00.000Z", hitStatus: "miss", topicSource: "radar", topicFissionMode: null },
      { userId: 1, articleId: 102, articleCreatedAt: "2026-02-12T00:00:00.000Z", hitStatus: "near_miss", topicSource: "radar", topicFissionMode: null },
      { userId: 1, articleId: 103, articleCreatedAt: "2026-02-15T00:00:00.000Z", hitStatus: "miss", topicSource: "radar", topicFissionMode: null },
      { userId: 1, articleId: 104, articleCreatedAt: "2026-03-03T00:00:00.000Z", hitStatus: "hit", topicSource: "topicFission", topicFissionMode: "regularity" },
      { userId: 1, articleId: 105, articleCreatedAt: "2026-03-08T00:00:00.000Z", hitStatus: "hit", topicSource: "topicFission", topicFissionMode: "regularity" },
      { userId: 1, articleId: 106, articleCreatedAt: "2026-03-15T00:00:00.000Z", hitStatus: "hit", topicSource: "topicFission", topicFissionMode: "contrast" },
    ],
    generatedItems: [
      { userId: 1, generatedArticleId: 104, batchId: "batch-1", backlogId: 901, generatedAt: "2026-03-01T00:00:00.000Z", updatedAt: "2026-03-01T00:00:00.000Z" },
      { userId: 1, generatedArticleId: 105, batchId: "batch-2", backlogId: 901, generatedAt: "2026-03-08T00:00:00.000Z", updatedAt: "2026-03-08T00:00:00.000Z" },
      { userId: 1, generatedArticleId: 106, batchId: "batch-3", backlogId: 901, generatedAt: "2026-03-15T00:00:00.000Z", updatedAt: "2026-03-15T00:00:00.000Z" },
    ],
    articles: [
      { articleId: 101, userId: 1, createdAt: "2026-02-10T00:00:00.000Z", seriesId: 11 },
      { articleId: 102, userId: 1, createdAt: "2026-02-12T00:00:00.000Z", seriesId: 11 },
      { articleId: 103, userId: 1, createdAt: "2026-02-15T00:00:00.000Z", seriesId: 11 },
      { articleId: 104, userId: 1, createdAt: "2026-03-03T00:00:00.000Z", seriesId: 11 },
      { articleId: 105, userId: 1, createdAt: "2026-03-08T00:00:00.000Z", seriesId: 11 },
      { articleId: 106, userId: 1, createdAt: "2026-03-15T00:00:00.000Z", seriesId: 11 },
    ],
    styleUsageEvents: [
      { userId: 1, profileId: 1001, articleId: 105, usageSource: "article.generate", sampleCount: 3, usedAt: "2026-04-10T00:00:00.000Z" },
      { userId: 2, profileId: 1002, articleId: 205, usageSource: "article.command.rewrite", sampleCount: 1, usedAt: "2026-04-12T00:00:00.000Z" },
    ],
  });
}

test("buildPlan17BusinessReportFromFacts computes author lift, matrix output, and style usage", () => {
  const report = buildComprehensiveBusinessReport();

  assert.equal(report.authorLiftVsBaseline.activatedAuthorCount, 2);
  assert.equal(report.authorLiftVsBaseline.comparableAuthorCount, 1);
  assert.equal(report.authorLiftVsBaseline.averageLiftPp, 100);
  assert.equal(report.authorLiftVsBaseline.baselineMedianHitRate, 0);
  assert.equal(report.authorLiftVsBaseline.currentMedianHitRate, 100);
  assert.equal(report.authorLiftDrilldown.length, 2);
  assert.equal(report.authorLiftDrilldown.find((item) => item.userId === 1)?.comparable, true);
  assert.equal(report.authorLiftDrilldown.find((item) => item.userId === 2)?.comparable, false);

  assert.equal(report.fissionVsRadar.fissionReviewedCount, 3);
  assert.equal(report.fissionVsRadar.radarReviewedCount, 3);
  assert.equal(report.fissionVsRadar.fissionHitRate, 100);
  assert.equal(report.fissionVsRadar.radarHitRate, 0);
  assert.equal(report.fissionVsRadarDrilldown.length, 6);
  assert.equal(report.fissionVsRadarDrilldown[0]?.topicSource, "topicFission");

  assert.equal(report.matrixWeeklyOutput.matrixAuthorCount, 1);
  assert.equal(report.matrixWeeklyOutput.comparableAuthorCount, 1);
  assert.equal(report.matrixWeeklyOutput.weeklyOutputMedianBefore, 0.5);
  assert.equal(report.matrixWeeklyOutput.weeklyOutputMedianAfter, 1);
  assert.equal(report.matrixWeeklyOutput.weeklyOutputGrowthPp, 100);
  assert.equal(report.matrixWeeklyOutput.hitRateMedianBefore, 0);
  assert.equal(report.matrixWeeklyOutput.hitRateMedianAfter, 100);
  assert.equal(report.matrixAuthorDrilldown.length, 1);
  assert.equal(report.matrixAuthorDrilldown[0]?.comparableOutput, true);

  assert.equal(report.styleHeatmapUsage.totalUsageEventCount, 2);
  assert.equal(report.styleHeatmapUsage.multiSampleUsageEventCount, 1);
  assert.equal(report.styleHeatmapUsage.recent30dProfileCount, 2);
  assert.equal(report.styleHeatmapUsage.recent30dMultiSampleUsageShare, 50);
  assert.equal(report.styleUsageDrilldown.length, 2);
  assert.equal(report.styleUsageDrilldown[0]?.isRecent30d, true);

  assert.equal(report.batchDrilldown.batchCount, 3);
  assert.equal(report.batchDrilldown.linkedArticleCount, 3);
  assert.equal(report.batchDrilldown.reviewedArticleCount, 3);
  assert.equal(report.batchDrilldown.pendingReviewArticleCount, 0);
  assert.equal(report.batchDrilldown.hitRate, 100);
  assert.equal(report.batchDrilldown.reviewCoverage, 100);

  const latestBatch = report.batchDrilldown.items[0];
  assert.equal(latestBatch?.batchId, "batch-3");
  assert.equal(latestBatch?.reviewedArticleCount, 1);
  assert.equal(latestBatch?.hitRate, 100);
  assert.deepEqual(latestBatch?.fissionModeBreakdown, [{ key: "contrast", reviewedCount: 1, hitCount: 1 }]);
});

test("buildPlan17BusinessReportFromFacts keeps sparse business data truthful", () => {
  const report = buildPlan17BusinessReportFromFacts({
    generatedAt: "2026-04-20T00:00:00.000Z",
    now: "2026-04-20T00:00:00.000Z",
    reviewedOutcomes: [
      { userId: 8, articleId: 801, articleCreatedAt: "2026-04-18T00:00:00.000Z", hitStatus: "hit", topicSource: "topicFission", topicFissionMode: "crossDomain" },
    ],
    generatedItems: [],
    articles: [{ articleId: 801, userId: 8, createdAt: "2026-04-18T00:00:00.000Z", seriesId: null }],
    styleUsageEvents: [],
  });

  assert.equal(report.authorLiftVsBaseline.activatedAuthorCount, 1);
  assert.equal(report.authorLiftVsBaseline.comparableAuthorCount, 0);
  assert.equal(report.matrixWeeklyOutput.matrixAuthorCount, 0);
  assert.equal(report.styleHeatmapUsage.totalUsageEventCount, 0);
  assert.equal(report.fissionVsRadar.fissionReviewedCount, 1);
  assert.equal(report.fissionVsRadar.radarReviewedCount, 0);
  assert.equal(report.fissionVsRadarDrilldown.length, 1);
  assert.equal(report.batchDrilldown.batchCount, 0);
  assert.equal(report.batchDrilldown.linkedArticleCount, 0);
  assert.equal(report.batchDrilldown.reviewedArticleCount, 0);
  assert.equal(report.batchDrilldown.reviewCoverage, null);
});

test("buildPlan17BusinessReportFromFacts de-duplicates tokenized style usage and treats it as activation evidence", () => {
  const report = buildPlan17BusinessReportFromFacts({
    generatedAt: "2026-04-20T00:00:00.000Z",
    now: "2026-04-20T00:00:00.000Z",
    reviewedOutcomes: [],
    generatedItems: [],
    articles: [],
    styleUsageEvents: [
      {
        userId: 9,
        profileId: 3001,
        articleId: 9001,
        usageSource: "article.generate.stream",
        sampleCount: 4,
        usedAt: "2026-04-18T00:00:00.000Z",
        usageToken: "stream-token-1",
      },
      {
        userId: 9,
        profileId: 3001,
        articleId: 9001,
        usageSource: "article.generate.stream",
        sampleCount: 4,
        usedAt: "2026-04-18T00:05:00.000Z",
        usageToken: "stream-token-1",
      },
    ],
  });

  assert.equal(report.authorLiftVsBaseline.activatedAuthorCount, 1);
  assert.equal(report.styleHeatmapUsage.totalUsageEventCount, 1);
  assert.equal(report.styleHeatmapUsage.multiSampleUsageEventCount, 1);
  assert.equal(report.styleHeatmapUsage.recent30dUsageEventCount, 1);
  assert.equal(report.styleUsageDrilldown.length, 1);
});

test("plan17 business route view contracts keep the expected summary and drilldown fields", () => {
  const report = buildComprehensiveBusinessReport();
  const batchView = buildPlan17BusinessViewPayload(report, "batch-drilldown") as {
    generatedAt: string;
    batchDrilldown: typeof report.batchDrilldown;
  };
  const authorLiftView = buildPlan17BusinessViewPayload(report, "author-lift") as {
    generatedAt: string;
    authorLiftVsBaseline: typeof report.authorLiftVsBaseline;
    authorLiftDrilldown: typeof report.authorLiftDrilldown;
  };
  const fissionView = buildPlan17BusinessViewPayload(report, "fission-vs-radar") as {
    generatedAt: string;
    fissionVsRadar: typeof report.fissionVsRadar;
    fissionVsRadarDrilldown: typeof report.fissionVsRadarDrilldown;
  };
  const matrixView = buildPlan17BusinessViewPayload(report, "matrix-output") as {
    generatedAt: string;
    matrixWeeklyOutput: typeof report.matrixWeeklyOutput;
    matrixAuthorDrilldown: typeof report.matrixAuthorDrilldown;
  };
  const styleUsageView = buildPlan17BusinessViewPayload(report, "style-usage") as {
    generatedAt: string;
    styleHeatmapUsage: typeof report.styleHeatmapUsage;
    styleUsageDrilldown: typeof report.styleUsageDrilldown;
  };
  const legacyStyleUsageView = buildPlan17BusinessViewPayload(report, "style-save-proxy");

  assert.deepEqual(Object.keys(batchView), ["generatedAt", "batchDrilldown"]);
  assert.deepEqual(Object.keys(batchView.batchDrilldown), [
    "batchCount",
    "linkedArticleCount",
    "reviewedArticleCount",
    "pendingReviewArticleCount",
    "hitArticleCount",
    "nearMissArticleCount",
    "missArticleCount",
    "reviewCoverage",
    "hitRate",
    "items",
  ]);
  assert.deepEqual(Object.keys(batchView.batchDrilldown.items[0] ?? {}), [
    "batchId",
    "userId",
    "backlogIds",
    "generatedItemCount",
    "linkedArticleCount",
    "reviewedArticleCount",
    "pendingReviewArticleCount",
    "hitArticleCount",
    "nearMissArticleCount",
    "missArticleCount",
    "reviewCoverage",
    "hitRate",
    "firstGeneratedAt",
    "lastGeneratedAt",
    "latestLinkedArticleCreatedAt",
    "fissionModeBreakdown",
  ]);

  assert.deepEqual(Object.keys(authorLiftView), ["generatedAt", "authorLiftVsBaseline", "authorLiftDrilldown"]);
  assert.deepEqual(Object.keys(authorLiftView.authorLiftVsBaseline), [
    "activatedAuthorCount",
    "comparableAuthorCount",
    "improvedAuthorCount",
    "nonDegradedAuthorCount",
    "averageLiftPp",
    "medianLiftPp",
    "baselineMedianHitRate",
    "currentMedianHitRate",
    "minimumReviewedCountPerWindow",
    "windowDays",
  ]);
  assert.deepEqual(Object.keys(authorLiftView.authorLiftDrilldown[0] ?? {}), [
    "userId",
    "activationAt",
    "baselineReviewedCount",
    "currentReviewedCount",
    "baselineHitRate",
    "currentHitRate",
    "liftPp",
    "comparable",
  ]);

  assert.deepEqual(Object.keys(fissionView), ["generatedAt", "fissionVsRadar", "fissionVsRadarDrilldown"]);
  assert.deepEqual(Object.keys(fissionView.fissionVsRadar), [
    "fissionReviewedCount",
    "fissionHitCount",
    "fissionHitRate",
    "radarReviewedCount",
    "radarHitCount",
    "radarHitRate",
    "hitRateDeltaPp",
    "fissionModeBreakdown",
  ]);
  assert.deepEqual(Object.keys(fissionView.fissionVsRadarDrilldown[0] ?? {}), [
    "userId",
    "articleId",
    "articleCreatedAt",
    "topicSource",
    "topicFissionMode",
    "hitStatus",
  ]);

  assert.deepEqual(Object.keys(matrixView), ["generatedAt", "matrixWeeklyOutput", "matrixAuthorDrilldown"]);
  assert.deepEqual(Object.keys(matrixView.matrixWeeklyOutput), [
    "matrixAuthorCount",
    "comparableAuthorCount",
    "qualityComparableAuthorCount",
    "nonDegradedQualityAuthorCount",
    "batchCount",
    "batchLinkedArticleCount",
    "weeklyOutputMedianBefore",
    "weeklyOutputMedianAfter",
    "weeklyOutputGrowthPp",
    "hitRateMedianBefore",
    "hitRateMedianAfter",
    "observedQualityDeltaPp",
    "windowWeeks",
  ]);
  assert.deepEqual(Object.keys(matrixView.matrixAuthorDrilldown[0] ?? {}), [
    "userId",
    "activationAt",
    "beforeArticleCount",
    "afterArticleCount",
    "beforeMedian",
    "afterMedian",
    "outputGrowthPp",
    "beforeHitRate",
    "afterHitRate",
    "qualityDeltaPp",
    "comparableOutput",
    "comparableQuality",
  ]);

  assert.equal(normalizePlan17BusinessView("style-save-proxy"), "style-usage");
  assert.equal(normalizePlan17BusinessView("style-usage"), "style-usage");
  assert.deepEqual(Object.keys(styleUsageView), ["generatedAt", "styleHeatmapUsage", "styleUsageDrilldown"]);
  assert.deepEqual(Object.keys(styleUsageView.styleHeatmapUsage), [
    "totalUsageEventCount",
    "multiSampleUsageEventCount",
    "multiSampleUsageShare",
    "recent30dUsageEventCount",
    "recent30dMultiSampleUsageEventCount",
    "recent30dMultiSampleUsageShare",
    "profileCount",
    "recent30dProfileCount",
    "authorCount",
    "recent30dAuthorCount",
  ]);
  assert.deepEqual(Object.keys(styleUsageView.styleUsageDrilldown[0] ?? {}), [
    "userId",
    "profileId",
    "articleId",
    "usageSource",
    "sampleCount",
    "isMultiSample",
    "isRecent30d",
    "usedAt",
  ]);
  assert.deepEqual(legacyStyleUsageView, styleUsageView);
});

test("plan17 business export scope contracts keep the expected csv headers", () => {
  const report = buildComprehensiveBusinessReport();
  const csvByScope = {
    "batch-drilldown": buildPlan17BusinessExportCsv(report, "batch-drilldown"),
    "author-lift": buildPlan17BusinessExportCsv(report, "author-lift"),
    "fission-vs-radar": buildPlan17BusinessExportCsv(report, "fission-vs-radar"),
    "matrix-output": buildPlan17BusinessExportCsv(report, "matrix-output"),
    "style-usage": buildPlan17BusinessExportCsv(report, "style-usage"),
    "style-save-proxy": buildPlan17BusinessExportCsv(report, "style-save-proxy"),
  };

  assert.equal(
    csvByScope["batch-drilldown"].split("\n")[0],
    "batch_id,user_id,generated_item_count,linked_article_count,reviewed_article_count,pending_review_article_count,review_coverage_pct,hit_article_count,near_miss_article_count,miss_article_count,hit_rate_pct,backlog_ids,fission_modes,first_generated_at,last_generated_at,latest_linked_article_created_at",
  );
  assert.equal(
    csvByScope["author-lift"].split("\n")[0],
    "user_id,activation_at,baseline_reviewed_count,current_reviewed_count,baseline_hit_rate_pct,current_hit_rate_pct,lift_pp,comparable",
  );
  assert.equal(
    csvByScope["fission-vs-radar"].split("\n")[0],
    "user_id,article_id,article_created_at,topic_source,topic_fission_mode,hit_status",
  );
  assert.equal(
    csvByScope["matrix-output"].split("\n")[0],
    "user_id,activation_at,before_article_count,after_article_count,before_weekly_median,after_weekly_median,output_growth_pct,before_hit_rate_pct,after_hit_rate_pct,quality_delta_pp,comparable_output,comparable_quality",
  );
  assert.equal(
    csvByScope["style-usage"].split("\n")[0],
    "user_id,profile_id,article_id,usage_source,sample_count,is_multi_sample,is_recent_30d,used_at",
  );
  assert.equal(normalizePlan17BusinessExportScope("style-save-proxy"), "style-usage");
  assert.equal(normalizePlan17BusinessExportScope("style-usage"), "style-usage");
  assert.equal(csvByScope["style-save-proxy"], csvByScope["style-usage"]);

  assert.equal(csvByScope["batch-drilldown"].split("\n")[1]?.split(",").length, 16);
  assert.equal(csvByScope["author-lift"].split("\n")[1]?.split(",").length, 8);
  assert.equal(csvByScope["fission-vs-radar"].split("\n")[1]?.split(",").length, 6);
  assert.equal(csvByScope["matrix-output"].split("\n")[1]?.split(",").length, 12);
  assert.equal(csvByScope["style-usage"].split("\n")[1]?.split(",").length, 8);
});
