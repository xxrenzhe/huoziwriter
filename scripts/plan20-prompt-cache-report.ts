import fs from "node:fs";

import type { PromptCacheAcceptanceReport, PromptCacheArticleObservation } from "../apps/web/src/lib/ai-call-observations";
import { closeDatabase } from "../apps/web/src/lib/db";
import { getPromptCacheAcceptanceReport } from "../apps/web/src/lib/ai-call-observations";
import { ensureExtendedProductSchema } from "../apps/web/src/lib/schema-bootstrap";

type PromptCacheReportSnapshot = {
  generatedAt: string;
  report: PromptCacheAcceptanceReport;
};

type PromptCacheComparisonItem = {
  articleId: number;
  baselineTotalInputTokens: number;
  currentTotalInputTokens: number;
  reductionRatio: number | null;
  baselineSecondDeepWriteCacheReadTokens: number | null;
  currentSecondDeepWriteCacheReadTokens: number | null;
};

type PromptCacheBaselineComparison = {
  matchedArticleCount: number;
  articlesMeeting50PercentReduction: number;
  medianReductionRatio: number | null;
  bestReductionArticleId: number | null;
  bestReductionRatio: number | null;
  items: PromptCacheComparisonItem[];
};

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readOption(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function normalizeSnapshot(input: unknown): PromptCacheReportSnapshot | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const record = input as Record<string, unknown>;
  const generatedAt = typeof record.generatedAt === "string" && record.generatedAt.trim()
    ? record.generatedAt.trim()
    : new Date().toISOString();
  const report = (record.report ?? record) as PromptCacheAcceptanceReport | null;
  if (!report || typeof report !== "object") {
    return null;
  }
  return {
    generatedAt,
    report,
  };
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left == null || right == null) {
    return null;
  }
  return (left + right) / 2;
}

function compareWithBaseline(
  baselineItems: PromptCacheArticleObservation[],
  currentItems: PromptCacheArticleObservation[],
): PromptCacheBaselineComparison {
  const baselineMap = new Map<number, PromptCacheArticleObservation>(
    baselineItems.map((item) => [item.articleId, item]),
  );
  const items = currentItems
    .map((item) => {
      const baseline = baselineMap.get(item.articleId);
      if (!baseline) {
        return null;
      }
      const reductionRatio = baseline.totalInputTokens > 0
        ? (baseline.totalInputTokens - item.totalInputTokens) / baseline.totalInputTokens
        : null;
      return {
        articleId: item.articleId,
        baselineTotalInputTokens: baseline.totalInputTokens,
        currentTotalInputTokens: item.totalInputTokens,
        reductionRatio,
        baselineSecondDeepWriteCacheReadTokens: baseline.secondDeepWriteCacheReadTokens,
        currentSecondDeepWriteCacheReadTokens: item.secondDeepWriteCacheReadTokens,
      } satisfies PromptCacheComparisonItem;
    })
    .filter((item): item is PromptCacheComparisonItem => item != null)
    .sort((left, right) => {
      const leftRatio = left.reductionRatio ?? -Infinity;
      const rightRatio = right.reductionRatio ?? -Infinity;
      if (rightRatio !== leftRatio) {
        return rightRatio - leftRatio;
      }
      return left.articleId - right.articleId;
    });

  const reductionRatios = items
    .map((item) => item.reductionRatio)
    .filter((value): value is number => value != null);
  const bestItem = items[0] ?? null;

  return {
    matchedArticleCount: items.length,
    articlesMeeting50PercentReduction: items.filter((item) => (item.reductionRatio ?? -1) >= 0.5).length,
    medianReductionRatio: median(reductionRatios),
    bestReductionArticleId: bestItem?.articleId ?? null,
    bestReductionRatio: bestItem?.reductionRatio ?? null,
    items,
  };
}

async function main() {
  const jsonMode = readFlag("--json");
  const limitRaw = readOption("--limit");
  const baselineFile = readOption("--baseline-file");
  const writeBaselineFile = readOption("--write-baseline");
  const limit = limitRaw ? Number(limitRaw) : 12;

  await ensureExtendedProductSchema();
  const report = await getPromptCacheAcceptanceReport(Number.isFinite(limit) ? limit : 12);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    report,
  } satisfies PromptCacheReportSnapshot;

  if (writeBaselineFile) {
    fs.writeFileSync(writeBaselineFile, JSON.stringify(snapshot, null, 2));
  }

  const baselineSnapshot = baselineFile
    ? normalizeSnapshot(JSON.parse(fs.readFileSync(baselineFile, "utf8")))
    : null;
  const baselineComparison = baselineSnapshot
    ? compareWithBaseline(baselineSnapshot.report.articleCoverage.items, report.articleCoverage.items)
    : null;

  if (jsonMode) {
    console.log(JSON.stringify(
      baselineComparison
        ? {
            generatedAt: snapshot.generatedAt,
            report,
            baseline: {
              file: baselineFile,
              generatedAt: baselineSnapshot?.generatedAt ?? null,
              comparison: baselineComparison,
            },
          }
        : report,
      null,
      2,
    ));
    return;
  }

  const lines = [
    "# plan20 prompt cache article-linked report",
    "",
    `deepWriteRepeat.status: ${report.deepWriteRepeat.status}`,
    `threshold: ${report.deepWriteRepeat.threshold}`,
    `repeatedArticleCount: ${report.deepWriteRepeat.repeatedArticleCount}`,
    `passedArticleCount: ${report.deepWriteRepeat.passedArticleCount}`,
    `bestArticleId: ${report.deepWriteRepeat.bestArticleId ?? "n/a"}`,
    `bestCacheReadTokens: ${report.deepWriteRepeat.bestCacheReadTokens ?? "n/a"}`,
    "",
    `articleCount: ${report.articleCoverage.articleCount}`,
    `sixStepCandidateArticleCount: ${report.articleCoverage.sixStepCandidateArticleCount}`,
    writeBaselineFile ? `baselineWrittenTo: ${writeBaselineFile}` : null,
    "",
    "top article-linked observations:",
    ...report.articleCoverage.items.map((item) =>
      [
        `- article=${item.articleId}`,
        `calls=${item.callCount}`,
        `scenes=${item.sceneCoverage.join(",") || "n/a"}`,
        `cacheRead=${item.totalCacheReadTokens}`,
        `deepWrite2=${item.secondDeepWriteCacheReadTokens ?? "n/a"}`,
        `latest=${item.latestObservedAt || "n/a"}`,
      ].join(" | "),
    ),
    baselineComparison
      ? ""
      : null,
    baselineComparison
      ? `baselineComparedWith: ${baselineFile}`
      : null,
    baselineComparison
      ? `matchedArticleCount: ${baselineComparison.matchedArticleCount}`
      : null,
    baselineComparison
      ? `articlesMeeting50PercentReduction: ${baselineComparison.articlesMeeting50PercentReduction}`
      : null,
    baselineComparison
      ? `medianReductionRatio: ${baselineComparison.medianReductionRatio == null ? "n/a" : baselineComparison.medianReductionRatio.toFixed(4)}`
      : null,
    baselineComparison
      ? `bestReductionArticleId: ${baselineComparison.bestReductionArticleId ?? "n/a"}`
      : null,
    baselineComparison
      ? `bestReductionRatio: ${baselineComparison.bestReductionRatio == null ? "n/a" : baselineComparison.bestReductionRatio.toFixed(4)}`
      : null,
    ...(baselineComparison && baselineComparison.items.length > 0
      ? [
          "",
          "baseline comparison by article:",
          ...baselineComparison.items.map((item) =>
            [
              `- article=${item.articleId}`,
              `baselineTokens=${item.baselineTotalInputTokens}`,
              `currentTokens=${item.currentTotalInputTokens}`,
              `reduction=${item.reductionRatio == null ? "n/a" : item.reductionRatio.toFixed(4)}`,
              `baselineDeepWrite2=${item.baselineSecondDeepWriteCacheReadTokens ?? "n/a"}`,
              `currentDeepWrite2=${item.currentSecondDeepWriteCacheReadTokens ?? "n/a"}`,
            ].join(" | "),
          ),
        ]
      : baselineComparison
        ? [
            "",
            "baseline comparison by article:",
            "- no overlapping article_id between baseline and current report",
          ]
        : []),
    "",
    baselineComparison
      ? "note: 当前 baseline 对比只会比较同一 article_id 的前后报告；是否达到 ≥50% 仍取决于真实 provider 样本与可比链路。"
      : "note: 当前脚本只输出 article-linked 事实观测；可追加 `--write-baseline` / `--baseline-file` 记录并比较同一 article_id 的 token 降幅，最终验收仍需要真实 provider baseline 对照样本。",
  ].filter((line): line is string => Boolean(line));

  console.log(lines.join("\n"));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
