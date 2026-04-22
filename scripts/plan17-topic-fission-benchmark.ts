#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveSqliteDatabasePath } from "@huoziwriter/db";

type BenchmarkOutput = {
  queued: Awaited<ReturnType<typeof import("../apps/web/src/lib/writing-eval").queuePlan17TopicFissionBenchmarkRuns>>;
  acceptance: {
    overallStatus: string;
    qualityStatus: string | null;
    topicFissionItem: {
      status: string;
      detail: string;
      metrics?: Record<string, unknown>;
    } | null;
  };
  quality: {
    sampleCount: number;
    runCount: number;
    topicFissionSceneBreakdown: Array<{
      sceneKey: string;
      promptId: string;
      label: string;
      activeVersion: string | null;
      evaluatedCaseCount: number;
      stableCaseCount: number;
      stableHitCaseCount: number;
      stableHitRate: number | null;
      runCount: number;
      latestRunAt: string | null;
    }>;
  } | null;
};

function parseArgs(argv: string[]) {
  return {
    json: argv.includes("--json"),
    force: argv.includes("--force"),
    autoFill: !argv.includes("--no-autofill"),
    queueOnly: argv.includes("--queue-only"),
    maxImportsPerDataset: (() => {
      const item = argv.find((entry) => entry.startsWith("--max-imports-per-dataset="));
      const value = item ? Number(item.split("=").slice(1).join("=")) : null;
      return value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
    })(),
  };
}

function printHumanReadable(output: BenchmarkOutput) {
  console.log("Plan17 topicFission benchmark summary");
  console.log("");
  console.log(`Dataset: ${output.queued.datasetCode} (${output.queued.datasetStatus})`);
  console.log(`Enabled cases: ${output.queued.enabledCaseCount}`);
  console.log(`Created runs: ${output.queued.createdRunCount}, reused succeeded runs: ${output.queued.reusedSucceededRunCount}`);
  for (const scene of output.queued.scenes) {
    console.log(
      `- ${scene.promptId}: ${scene.selectedRunStatus ?? "unknown"}`
      + ` (${scene.promptVersionRef}, run=${scene.selectedRunCode ?? scene.selectedRunId ?? "n/a"})`,
    );
  }
  console.log("");
  console.log(`Acceptance overall: ${output.acceptance.overallStatus}`);
  console.log(`Quality section: ${output.acceptance.qualityStatus ?? "n/a"}`);
  if (output.acceptance.topicFissionItem) {
    console.log(`topicFission: ${output.acceptance.topicFissionItem.status}`);
    console.log(output.acceptance.topicFissionItem.detail);
  }
  if (output.quality) {
    console.log("");
    console.log(`TopicFission samples=${output.quality.sampleCount}, runs=${output.quality.runCount}`);
    for (const scene of output.quality.topicFissionSceneBreakdown) {
      console.log(
        `- ${scene.sceneKey}: case=${scene.evaluatedCaseCount}, stable=${scene.stableCaseCount},`
        + ` hit=${scene.stableHitRate == null ? "--" : `${(scene.stableHitRate * 100).toFixed(1)}%`},`
        + ` runCount=${scene.runCount}`,
      );
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const writingEvalModule = await import("../apps/web/src/lib/writing-eval.ts");
  const acceptanceModule = await import("../apps/web/src/lib/plan17-acceptance.ts");
  const writingEval = ("default" in writingEvalModule ? writingEvalModule.default : writingEvalModule) as typeof import("../apps/web/src/lib/writing-eval");
  const acceptanceApi = ("default" in acceptanceModule ? acceptanceModule.default : acceptanceModule) as typeof import("../apps/web/src/lib/plan17-acceptance");

  const queued = await writingEval.queuePlan17TopicFissionBenchmarkRuns({
    force: options.force,
    autoFill: options.autoFill,
    maxImportsPerDataset: options.maxImportsPerDataset,
  });

  const pendingRunIds = queued.scenes
    .filter((scene) => scene.selectedRunId != null && scene.selectedRunStatus !== "succeeded")
    .map((scene) => Number(scene.selectedRunId));

  if (!options.queueOnly && pendingRunIds.length > 0) {
    const runnerPath = path.join(process.cwd(), "apps/worker-py/targeted_writing_eval_runner.py");
    const runnerEnv = {
      ...process.env,
      ...(process.env.DATABASE_URL ? {} : { DATABASE_PATH: resolveSqliteDatabasePath(process.cwd(), process.env.DATABASE_PATH) }),
    };
    const result = spawnSync(
      "python3",
      [runnerPath, ...pendingRunIds.flatMap((runId) => ["--run-id", String(runId)])],
      {
        cwd: process.cwd(),
        stdio: options.json ? "pipe" : "inherit",
        encoding: "utf-8",
        env: runnerEnv,
      },
    );
    if (result.status !== 0) {
      const stderr = result.stderr?.trim();
      const stdout = result.stdout?.trim();
      throw new Error(stderr || stdout || "topicFission benchmark targeted runner 执行失败");
    }
  }

  const qualityReport = await writingEval.getPlan17QualityReport();
  const topicFissionFocus = qualityReport.focuses.find((item) => item.key === "topic_fission") ?? null;
  const acceptance = await acceptanceApi.getPlan17AcceptanceReport();
  const qualitySection = acceptance.sections.find((item) => item.key === "quality") ?? null;
  const topicFissionItem = qualitySection?.items.find((item) => item.key === "topicFissionEval") ?? null;

  const output: BenchmarkOutput = {
    queued,
    acceptance: {
      overallStatus: acceptance.overallStatus,
      qualityStatus: qualitySection?.status ?? null,
      topicFissionItem: topicFissionItem
        ? {
            status: topicFissionItem.status,
            detail: topicFissionItem.detail,
            metrics: topicFissionItem.metrics,
          }
        : null,
    },
    quality: topicFissionFocus
      ? {
          sampleCount: topicFissionFocus.sampleCount,
          runCount: topicFissionFocus.runCount,
          topicFissionSceneBreakdown: topicFissionFocus.reporting.topicFissionSceneBreakdown,
        }
      : null,
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
