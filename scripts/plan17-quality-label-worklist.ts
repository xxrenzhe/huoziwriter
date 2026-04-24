#!/usr/bin/env tsx

import { getWritingEvalCaseQualityLabels, getWritingEvalCases, getWritingEvalDatasets } from "../apps/web/src/lib/writing-eval";
import { isPlan17WritingEvalFocusKey, type WritingEvalPlan17FocusKey } from "../apps/web/src/lib/writing-eval-plan17";

type SupportedFocus = "all" | "strategy_strength" | "evidence_hook";

type WorklistItem = {
  caseId: number;
  datasetId: number;
  datasetCode: string;
  datasetName: string;
  focusKey: WritingEvalPlan17FocusKey;
  taskCode: string;
  taskType: string;
  topicTitle: string;
  sourceType: string;
  sourceRef: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  difficultyLevel: string;
  updatedAt: string;
  currentStatus: "missing" | "partial" | "complete";
  currentLabel: {
    strategyManualScore: number | null;
    evidenceExpectedTags: string[];
    evidenceDetectedTags: string[];
    notes: string | null;
    updatedAt: string | null;
  };
  importPayload: {
    caseId: number;
    strategyManualScore?: number | null;
    evidenceExpectedTags?: string[];
    evidenceDetectedTags?: string[];
    notes?: string;
  };
};

function parseArgs(argv: string[]) {
  const focusArg = argv.find((item) => item.startsWith("--focus="))?.split("=").slice(1).join("=") ?? "all";
  const limitArg = argv.find((item) => item.startsWith("--limit="))?.split("=").slice(1).join("=") ?? "50";
  const statusArg = argv.find((item) => item.startsWith("--status="))?.split("=").slice(1).join("=") ?? "open";
  const focus = ["all", "strategy_strength", "evidence_hook"].includes(focusArg) ? focusArg as SupportedFocus : "all";
  const limit = Number(limitArg);
  return {
    focus,
    json: argv.includes("--json"),
    limit: Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 50,
    includeComplete: statusArg === "all",
  };
}

function resolveFocuses(focus: SupportedFocus): WritingEvalPlan17FocusKey[] {
  if (focus === "all") return ["strategy_strength", "evidence_hook"];
  return [focus];
}

function compareUpdatedDesc(left: { updatedAt: string }, right: { updatedAt: string }) {
  return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
}

async function buildWorklist(focus: SupportedFocus, limit: number, includeComplete: boolean) {
  const datasets = await getWritingEvalDatasets();
  const targets = datasets.filter((dataset) =>
    isPlan17WritingEvalFocusKey(dataset.focus.key) && resolveFocuses(focus).includes(dataset.focus.key)
  );
  const rows: WorklistItem[] = [];

  for (const dataset of targets) {
    const [cases, labels] = await Promise.all([
      getWritingEvalCases(dataset.id),
      getWritingEvalCaseQualityLabels({ datasetId: dataset.id, limit: 1000 }),
    ]);
    const latestLabelByCaseId = new Map<number, (typeof labels)[number]>();
    for (const label of labels) {
      if (!latestLabelByCaseId.has(label.caseId)) {
        latestLabelByCaseId.set(label.caseId, label);
      }
    }

    for (const currentCase of cases) {
      const label = latestLabelByCaseId.get(currentCase.id);
      const expectedTags = label?.evidenceExpectedTags ?? [];
      const detectedTags = label?.evidenceDetectedTags ?? [];
      const hasStrategy = typeof label?.strategyManualScore === "number" && Number.isFinite(label.strategyManualScore);
      const hasExpected = expectedTags.length > 0;
      const hasDetected = detectedTags.length > 0;
      const currentStatus =
        dataset.focus.key === "strategy_strength"
          ? hasStrategy ? "complete" : "missing"
          : hasExpected && hasDetected
            ? "complete"
            : hasExpected || hasDetected
              ? "partial"
              : "missing";
      if (!includeComplete && currentStatus === "complete") {
        continue;
      }
      rows.push({
        caseId: currentCase.id,
        datasetId: dataset.id,
        datasetCode: dataset.code,
        datasetName: dataset.name,
        focusKey: dataset.focus.key,
        taskCode: currentCase.taskCode,
        taskType: currentCase.taskType,
        topicTitle: currentCase.topicTitle,
        sourceType: currentCase.sourceType,
        sourceRef: currentCase.sourceRef,
        sourceLabel: currentCase.sourceLabel,
        sourceUrl: currentCase.sourceUrl,
        difficultyLevel: currentCase.difficultyLevel,
        updatedAt: currentCase.updatedAt,
        currentStatus,
        currentLabel: {
          strategyManualScore: label?.strategyManualScore ?? null,
          evidenceExpectedTags: expectedTags,
          evidenceDetectedTags: detectedTags,
          notes: label?.notes ?? null,
          updatedAt: label?.updatedAt ?? null,
        },
        importPayload: dataset.focus.key === "strategy_strength"
          ? {
              caseId: currentCase.id,
              strategyManualScore: label?.strategyManualScore ?? null,
              notes: label?.notes ?? "",
            }
          : {
              caseId: currentCase.id,
              evidenceExpectedTags: expectedTags,
              evidenceDetectedTags: detectedTags,
              notes: label?.notes ?? "",
            },
      });
    }
  }

  const items = rows.sort(compareUpdatedDesc).slice(0, limit);
  const summary = {
    total: rows.length,
    missing: rows.filter((item) => item.currentStatus === "missing").length,
    partial: rows.filter((item) => item.currentStatus === "partial").length,
    complete: rows.filter((item) => item.currentStatus === "complete").length,
  };

  return { items, summary };
}

function printHumanReadable(output: {
  focus: SupportedFocus;
  includeComplete: boolean;
  summary: { total: number; missing: number; partial: number; complete: number };
  items: WorklistItem[];
}) {
  console.log("Plan17 quality label worklist");
  console.log("");
  console.log(`Focus: ${output.focus}`);
  console.log(`Status filter: ${output.includeComplete ? "all" : "open"}`);
  console.log(
    `Summary: total=${output.summary.total}, missing=${output.summary.missing}, `
      + `partial=${output.summary.partial}, complete=${output.summary.complete}`,
  );
  console.log("");
  for (const item of output.items) {
    console.log(
      `- case=${item.caseId} ${item.focusKey} ${item.currentStatus} `
        + `[${item.datasetCode}] ${item.topicTitle || item.taskCode}`,
    );
    console.log(
      `  task=${item.taskCode} source=${item.sourceType}:${item.sourceRef ?? "-"} `
        + `difficulty=${item.difficultyLevel} updatedAt=${item.updatedAt}`,
    );
    if (item.focusKey === "strategy_strength") {
      console.log(`  current.strategyManualScore=${item.currentLabel.strategyManualScore ?? "--"}`);
    } else {
      console.log(
        `  current.expected=[${item.currentLabel.evidenceExpectedTags.join(", ")}] `
          + `detected=[${item.currentLabel.evidenceDetectedTags.join(", ")}]`,
      );
    }
  }
  console.log("");
  console.log("Usage:");
  console.log("- pnpm plan17:quality-label-worklist --focus=strategy_strength --json > tmp/plan17-strategy-labels.json");
  console.log("- pnpm plan17:quality-label-import --file=tmp/plan17-strategy-labels.json --dry-run");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const worklist = await buildWorklist(options.focus, options.limit, options.includeComplete);
  const output = {
    focus: options.focus,
    includeComplete: options.includeComplete,
    summary: worklist.summary,
    items: worklist.items,
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
