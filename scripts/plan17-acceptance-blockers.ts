#!/usr/bin/env tsx

import { getDatabase } from "../apps/web/src/lib/db";
import { getPlan17AcceptanceReport } from "../apps/web/src/lib/plan17-acceptance";
import { getPlan17BusinessReport } from "../apps/web/src/lib/plan17-business";
import { getPromptVersions } from "../apps/web/src/lib/repositories";
import { getPlan17QualityReport } from "../apps/web/src/lib/writing-eval";

type ProviderKey = "openai" | "anthropic" | "gemini";

type TopicFissionProviderBlocker = {
  promptId: string;
  activeVersion: string | null;
  primaryModel: string | null;
  fallbackModel: string | null;
  ready: boolean;
  requiredEnvKeys: string[];
};

function parseArgs(argv: string[]) {
  return {
    json: argv.includes("--json"),
  };
}

function inferProviderFromModel(model: string | null | undefined): ProviderKey | null {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("gpt") || normalized.startsWith("o")) return "openai";
  if (normalized.startsWith("claude")) return "anthropic";
  if (normalized.startsWith("gemini")) return "gemini";
  return null;
}

function getProviderEnvKeys(provider: ProviderKey) {
  if (provider === "openai") return ["OPENAI_API_KEY"];
  if (provider === "anthropic") return ["ANTHROPIC_API_KEY"];
  return ["GEMINI_API_KEY", "GOOGLE_API_KEY"];
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => String(process.env[key] || "").trim().length > 0);
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return `${value.toFixed(2)}%`;
}

function formatRatio(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(3);
}

async function getTopicFissionProviderBlockers(): Promise<TopicFissionProviderBlocker[]> {
  const promptVersions = await getPromptVersions();
  const scenePromptIds = ["topicFission.regularity", "topicFission.contrast", "topicFission.crossDomain"] as const;
  const activePromptVersions = scenePromptIds.map((promptId) => ({
    promptId,
    activeVersion: promptVersions.find((item) => item.prompt_id === promptId && Boolean(item.is_active))?.version ?? null,
  }));
  const db = getDatabase();
  const routes = await db.query<{ scene_code: string; primary_model: string | null; fallback_model: string | null }>(
    `SELECT scene_code, primary_model, fallback_model
     FROM ai_model_routes
     WHERE scene_code IN (${scenePromptIds.map(() => "?").join(", ")})`,
    [...scenePromptIds],
  );
  const routeByScene = new Map(routes.map((item) => [item.scene_code, item]));
  return activePromptVersions.map((scene) => {
    const route = routeByScene.get(scene.promptId);
    const requiredEnvKeys = Array.from(new Set(
      [route?.primary_model, route?.fallback_model]
        .map((model) => inferProviderFromModel(model))
        .filter((provider): provider is ProviderKey => provider != null)
        .flatMap((provider) => getProviderEnvKeys(provider)),
    ));
    return {
      promptId: scene.promptId,
      activeVersion: scene.activeVersion,
      primaryModel: route?.primary_model ?? null,
      fallbackModel: route?.fallback_model ?? null,
      ready: requiredEnvKeys.length > 0 && hasAnyEnv(requiredEnvKeys),
      requiredEnvKeys,
    };
  });
}

function printHumanReadable(output: {
  acceptance: Awaited<ReturnType<typeof getPlan17AcceptanceReport>>;
  quality: Awaited<ReturnType<typeof getPlan17QualityReport>>;
  business: Awaited<ReturnType<typeof getPlan17BusinessReport>>;
  providerBlockers: TopicFissionProviderBlocker[];
}) {
  console.log("Plan17 acceptance blocker report");
  console.log("");
  console.log(`Overall: ${output.acceptance.overallStatus}`);
  console.log(
    `Summary: passed=${output.acceptance.summary.passedCount}/${output.acceptance.summary.totalCount}, `
      + `partial=${output.acceptance.summary.partialCount}, blocked=${output.acceptance.summary.blockedCount}`,
  );
  console.log("");
  console.log("Quality blockers:");
  for (const focus of output.quality.focuses) {
    if (focus.observationGaps.length === 0) continue;
    console.log(`- ${focus.key}: samples=${focus.sampleCount}, runs=${focus.runCount}, linkedFeedback=${focus.linkedFeedbackCount}`);
    for (const gap of focus.observationGaps) {
      console.log(`  - ${gap.label}: ${gap.count}`);
    }
  }
  console.log("");
  console.log("Business blockers:");
  const observationGroups = [
    ["authorLift", "作者命中率抬升"],
    ["fissionVsRadar", "裂变 vs radar"],
    ["matrixOutput", "矩阵产能"],
    ["styleUsage", "3+ 样本风格画像使用"],
  ] as const;
  for (const [key, label] of observationGroups) {
    const gaps = output.business.observationGaps[key];
    if (gaps.length === 0) continue;
    console.log(`- ${label}:`);
    for (const gap of gaps) {
      console.log(`  - ${gap.label}: ${gap.count}`);
    }
  }
  console.log("");
  console.log("Acceptance top gaps:");
  for (const item of output.acceptance.topGaps) {
    console.log(`- ${item.section}/${item.key}: ${item.status} — ${item.detail}`);
  }
  console.log("");
  console.log("TopicFission provider readiness:");
  for (const item of output.providerBlockers) {
    const models = [item.primaryModel, item.fallbackModel].filter(Boolean).join(" | ") || "未配置 ai_model_routes";
    console.log(
      `- ${item.promptId}@${item.activeVersion ?? "n/a"}: ${item.ready ? "ready" : "blocked"} `
        + `(models=${models}; env=${item.requiredEnvKeys.join("/") || "n/a"})`,
    );
  }
  console.log("");
  console.log("Current thresholds:");
  const strategy = output.quality.focuses.find((item) => item.key === "strategy_strength");
  const evidence = output.quality.focuses.find((item) => item.key === "evidence_hook");
  const rhythm = output.quality.focuses.find((item) => item.key === "rhythm_consistency");
  const business = output.business;
  console.log(
    `- strategy Spearman: sample=${strategy?.reporting.strategyManualScoreSampleCount ?? 0}, `
      + `value=${formatRatio(strategy?.reporting.strategyManualScoreSpearman)}`,
  );
  console.log(
    `- evidence PR: sample=${evidence?.reporting.evidenceLabelSampleCount ?? 0}, `
      + `precision=${formatRatio(evidence?.reporting.evidenceLabelPrecision)}, `
      + `recall=${formatRatio(evidence?.reporting.evidenceLabelRecall)}`,
  );
  console.log(
    `- rhythm correlation: sample=${rhythm?.reporting.rhythmDeviationVsReadCompletionSampleCount ?? 0}, `
      + `corr=${formatRatio(rhythm?.reporting.rhythmDeviationVsReadCompletionCorrelation)}, `
      + `p=${formatRatio(rhythm?.reporting.rhythmDeviationVsReadCompletionPValue)}`,
  );
  console.log(
    `- author lift: comparableAuthors=${business.authorLiftVsBaseline.comparableAuthorCount}, `
      + `avgLift=${formatRatio(business.authorLiftVsBaseline.averageLiftPp)}`,
  );
  console.log(
    `- matrix output: comparableAuthors=${business.matrixWeeklyOutput.comparableAuthorCount}, `
      + `qualityComparable=${business.matrixWeeklyOutput.qualityComparableAuthorCount}, `
      + `growth=${formatPercent(business.matrixWeeklyOutput.weeklyOutputGrowthPp)}`,
  );
  console.log(
    `- style usage: recent30d=${business.styleHeatmapUsage.recent30dUsageEventCount}, `
      + `multiSampleShare=${formatPercent(business.styleHeatmapUsage.recent30dMultiSampleUsageShare)}`,
  );
  console.log("");
  console.log("Next commands:");
  console.log("- pnpm plan17:quality-label-worklist --focus=strategy_strength --json");
  console.log("- pnpm plan17:quality-label-worklist --focus=evidence_hook --json");
  console.log("- pnpm plan17:topic-fission-benchmark");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [acceptance, quality, business, providerBlockers] = await Promise.all([
    getPlan17AcceptanceReport(),
    getPlan17QualityReport(),
    getPlan17BusinessReport(),
    getTopicFissionProviderBlockers(),
  ]);

  const output = {
    acceptance,
    quality,
    business,
    providerBlockers,
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  printHumanReadable(output);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
