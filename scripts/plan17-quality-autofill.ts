#!/usr/bin/env tsx
type Plan17QualityFocusSummary = {
  key: string;
  sampleCount: number;
  datasetCount: number;
  linkedFeedbackCount?: number | null;
};

function parseArgs(argv: string[]) {
  const force = !argv.includes("--no-force");
  const json = argv.includes("--json");
  const maxImportsArg = argv.find((item) => item.startsWith("--max-imports-per-dataset="));
  const maxImportsPerDataset = maxImportsArg ? Number(maxImportsArg.split("=").slice(1).join("=")) : undefined;
  return {
    force,
    json,
    maxImportsPerDataset:
      Number.isInteger(maxImportsPerDataset) && Number(maxImportsPerDataset) > 0 ? Number(maxImportsPerDataset) : undefined,
  };
}

function summarizeFocuses(
  focuses: Array<{ key: string; sampleCount: number; datasetCount: number; linkedFeedbackCount?: number | null }>,
): Plan17QualityFocusSummary[] {
  return focuses.map((item) => ({
    key: item.key,
    sampleCount: Number(item.sampleCount || 0),
    datasetCount: Number(item.datasetCount || 0),
    linkedFeedbackCount: item.linkedFeedbackCount ?? null,
  }));
}

function formatDelta(before: Plan17QualityFocusSummary[], after: Plan17QualityFocusSummary[]) {
  return after.map((item) => {
    const previous = before.find((candidate) => candidate.key === item.key);
    const sampleDelta = item.sampleCount - Number(previous?.sampleCount || 0);
    const linkedFeedbackDelta = Number(item.linkedFeedbackCount || 0) - Number(previous?.linkedFeedbackCount || 0);
    return {
      key: item.key,
      sampleCount: item.sampleCount,
      sampleDelta,
      linkedFeedbackCount: item.linkedFeedbackCount ?? null,
      linkedFeedbackDelta,
    };
  });
}

function printHumanReadable(output: {
  before: Plan17QualityFocusSummary[];
  after: Plan17QualityFocusSummary[];
  delta: Array<{
    key: string;
    sampleCount: number;
    sampleDelta: number;
    linkedFeedbackCount: number | null;
    linkedFeedbackDelta: number;
  }>;
  autoFill: {
    scannedCount: number;
    appliedCount: number;
    createdCaseCount: number;
    skippedCount: number;
    items: Array<{
      datasetCode: string;
      importedCount: number;
      targetSummary: string[];
    }>;
    skipped: Array<{
      datasetCode: string;
      reason: string;
      targetSummary?: string[];
    }>;
  };
}) {
  console.log("Plan17 quality auto-fill summary");
  console.log("");
  console.log("Before:");
  for (const item of output.before) {
    console.log(`- ${item.key}: samples=${item.sampleCount}, datasets=${item.datasetCount}, linkedFeedback=${item.linkedFeedbackCount ?? 0}`);
  }
  console.log("");
  console.log("Auto-fill:");
  console.log(`- scanned=${output.autoFill.scannedCount}, applied=${output.autoFill.appliedCount}, createdCases=${output.autoFill.createdCaseCount}, skipped=${output.autoFill.skippedCount}`);
  for (const item of output.autoFill.items) {
    console.log(`- imported ${item.importedCount} into ${item.datasetCode}`);
    for (const summary of item.targetSummary) {
      console.log(`  - ${summary}`);
    }
  }
  for (const item of output.autoFill.skipped) {
    console.log(`- skipped ${item.datasetCode}: ${item.reason}`);
    for (const summary of item.targetSummary ?? []) {
      console.log(`  - ${summary}`);
    }
  }
  console.log("");
  console.log("After:");
  for (const item of output.after) {
    console.log(`- ${item.key}: samples=${item.sampleCount}, datasets=${item.datasetCount}, linkedFeedback=${item.linkedFeedbackCount ?? 0}`);
  }
  console.log("");
  console.log("Delta:");
  for (const item of output.delta) {
    console.log(`- ${item.key}: sampleDelta=${item.sampleDelta}, linkedFeedbackDelta=${item.linkedFeedbackDelta}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const writingEvalModule = await import("../apps/web/src/lib/writing-eval.ts");
  const writingEval = ("default" in writingEvalModule ? writingEvalModule.default : writingEvalModule) as typeof import("../apps/web/src/lib/writing-eval");

  const beforeReport = await writingEval.getPlan17QualityReport();
  const autoFillResult = await writingEval.autoFillPlan17QualityDatasets({
    force: options.force,
    maxImportsPerDataset: options.maxImportsPerDataset,
  });
  const afterReport = await writingEval.getPlan17QualityReport();

  const output = {
    before: summarizeFocuses(beforeReport.focuses),
    after: summarizeFocuses(afterReport.focuses),
    delta: formatDelta(summarizeFocuses(beforeReport.focuses), summarizeFocuses(afterReport.focuses)),
    autoFill: {
      scannedCount: autoFillResult.scannedCount,
      appliedCount: autoFillResult.appliedCount,
      createdCaseCount: autoFillResult.createdCaseCount,
      skippedCount: autoFillResult.skippedCount,
      items: autoFillResult.items.map((item) => ({
        datasetCode: item.datasetCode,
        importedCount: item.importedCount,
        targetSummary: item.targetSummary,
      })),
      skipped: autoFillResult.skipped.map((item) => ({
        datasetCode: item.datasetCode,
        reason: item.reason,
        targetSummary: item.targetSummary,
      })),
    },
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
