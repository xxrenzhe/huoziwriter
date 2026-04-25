#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";

import { searchResearchSources } from "../apps/web/src/lib/research-source-search";

type SearchCheck = {
  query: string;
  status: "passed" | "failed";
  resultCount: number;
  distinctDomainCount: number;
  recentResultCount: number;
  searchUrl: string | null;
  error: string | null;
  sampleResults: Array<{
    title: string;
    url: string;
    engine: string | null;
    publishedDate: string | null;
  }>;
};

type SearchReport = {
  generatedAt: string;
  endpointConfigured: boolean;
  endpointHost: string | null;
  minimums: {
    resultCount: number;
    distinctDomainCount: number;
    recentResultCount: number;
  };
  checks: SearchCheck[];
  status: "passed" | "failed";
};

function loadDotenv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

function readFlag(name: string) {
  return process.argv.includes(name);
}

function readOptionValues(name: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      values.push(String(process.argv[index + 1]));
    }
  }
  return values;
}

function readNumberOption(name: string, fallback: number) {
  const value = Number(readOptionValues(name).at(-1));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getEndpointHost(endpoint: string) {
  if (!endpoint) {
    return null;
  }
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid-url";
  }
}

function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parsePublishedDate(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function isRecent(value: string | null, recencyDays: number) {
  const parsed = parsePublishedDate(value);
  if (!parsed) {
    return false;
  }
  const cutoff = Date.now() - recencyDays * 24 * 60 * 60 * 1000;
  return parsed.getTime() >= cutoff;
}

function defaultQueries() {
  return [
    "AI 自动化 内容生产 公众号",
    "AI 搜索 事实核查 内容创作",
    "AI 文章 研究简报 事实核查 自动化",
  ];
}

async function runCheck(input: {
  query: string;
  minResults: number;
  minDomains: number;
  minRecent: number;
  recencyDays: number;
}): Promise<SearchCheck> {
  const result = await searchResearchSources({
    query: input.query,
    limit: Math.max(input.minResults, 12),
    strictJson: true,
  });
  const domains = new Set(
    result.results
      .map((item) => getDomain(item.url))
      .filter((domain): domain is string => Boolean(domain)),
  );
  const recentResultCount = result.results.filter((item) => isRecent(item.publishedDate, input.recencyDays)).length;
  const passed =
    !result.error
    && result.results.length >= input.minResults
    && domains.size >= input.minDomains
    && recentResultCount >= input.minRecent;

  return {
    query: input.query,
    status: passed ? "passed" : "failed",
    resultCount: result.results.length,
    distinctDomainCount: domains.size,
    recentResultCount,
    searchUrl: result.searchUrl,
    error: result.error,
    sampleResults: result.results.slice(0, 5).map((item) => ({
      title: item.title,
      url: item.url,
      engine: item.engine,
      publishedDate: item.publishedDate,
    })),
  };
}

function printHumanReadable(report: SearchReport) {
  console.log("Plan22 real search validation");
  console.log("");
  console.log(`Status: ${report.status}`);
  console.log(`Endpoint configured: ${report.endpointConfigured ? "yes" : "no"}`);
  console.log(`Endpoint host: ${report.endpointHost ?? "n/a"}`);
  console.log(
    `Minimums: results>=${report.minimums.resultCount}, domains>=${report.minimums.distinctDomainCount}, recent>=${report.minimums.recentResultCount}`,
  );
  console.log("");
  for (const check of report.checks) {
    console.log(`- ${check.query}: ${check.status}`);
    console.log(
      `  results=${check.resultCount}, domains=${check.distinctDomainCount}, recent=${check.recentResultCount}`,
    );
    if (check.error) {
      console.log(`  error=${check.error}`);
    }
    for (const sample of check.sampleResults.slice(0, 3)) {
      console.log(`  sample=${sample.title} | ${sample.url}`);
    }
  }
}

async function main() {
  loadDotenv();

  const queries = readOptionValues("--query");
  const selectedQueries = queries.length > 0 ? queries : defaultQueries();
  const minResults = readNumberOption("--min-results", 8);
  const minDomains = readNumberOption("--min-domains", 3);
  const minRecent = readNumberOption("--min-recent", 1);
  const recencyDays = readNumberOption("--recency-days", 30);
  const endpoint = String(process.env.RESEARCH_SOURCE_SEARCH_ENDPOINT || "").trim();

  const checks = await Promise.all(
    selectedQueries.map((query) =>
      runCheck({
        query,
        minResults,
        minDomains,
        minRecent,
        recencyDays,
      }),
    ),
  );
  const status = endpoint && checks.every((check) => check.status === "passed") ? "passed" : "failed";
  const report = {
    generatedAt: new Date().toISOString(),
    endpointConfigured: Boolean(endpoint),
    endpointHost: getEndpointHost(endpoint),
    minimums: {
      resultCount: minResults,
      distinctDomainCount: minDomains,
      recentResultCount: minRecent,
    },
    checks,
    status,
  } satisfies SearchReport;

  if (readFlag("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReadable(report);
  }

  if (status !== "passed") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
