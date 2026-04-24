#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";

import { upsertWritingEvalCaseQualityLabel } from "../apps/web/src/lib/writing-eval";

type ImportItem = {
  caseId: number;
  strategyManualScore?: number | null;
  evidenceExpectedTags?: string[];
  evidenceDetectedTags?: string[];
  notes?: string | null;
};

function parseArgs(argv: string[]) {
  const file = argv.find((item) => item.startsWith("--file="))?.split("=").slice(1).join("=") ?? "";
  if (!file) {
    throw new Error("缺少 --file=/path/to/file.json");
  }
  return {
    file,
    json: argv.includes("--json"),
    dryRun: argv.includes("--dry-run"),
  };
}

function normalizeImportItems(payload: unknown) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items)
      ? (payload as { items: unknown[] }).items
      : null;
  if (!rows) {
    throw new Error("导入文件必须是 JSON 数组，或 { items: [...] }");
  }
  return rows.map((item, index) => {
    const row = item as Record<string, unknown>;
    const caseId = Number(row.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      throw new Error(`第 ${index + 1} 行 caseId 非法`);
    }
    return {
      caseId,
      strategyManualScore:
        row.strategyManualScore == null || row.strategyManualScore === ""
          ? null
          : Number(row.strategyManualScore),
      evidenceExpectedTags: Array.isArray(row.evidenceExpectedTags)
        ? row.evidenceExpectedTags.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      evidenceDetectedTags: Array.isArray(row.evidenceDetectedTags)
        ? row.evidenceDetectedTags.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [],
      notes: row.notes == null ? null : String(row.notes),
    } satisfies ImportItem;
  });
}

function shouldApply(item: ImportItem) {
  return (
    (typeof item.strategyManualScore === "number" && Number.isFinite(item.strategyManualScore))
    || item.evidenceExpectedTags.length > 0
    || item.evidenceDetectedTags.length > 0
    || String(item.notes || "").trim().length > 0
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await readFile(options.file, "utf8");
  const items = normalizeImportItems(JSON.parse(raw));
  const actionable = items.filter(shouldApply);
  const skipped = items.length - actionable.length;

  if (options.dryRun) {
    const output = {
      file: options.file,
      total: items.length,
      actionable: actionable.length,
      skipped,
      items: actionable,
    };
    if (options.json) {
      console.log(JSON.stringify(output, null, 2));
      return;
    }
    console.log("Plan17 quality label import dry-run");
    console.log("");
    console.log(`file=${options.file}`);
    console.log(`total=${items.length}, actionable=${actionable.length}, skipped=${skipped}`);
    return;
  }

  const updated: Array<{ caseId: number; labelId: number; focusKey: string }> = [];
  for (const item of actionable) {
    const result = await upsertWritingEvalCaseQualityLabel({
      caseId: item.caseId,
      strategyManualScore: item.strategyManualScore ?? null,
      evidenceExpectedTags: item.evidenceExpectedTags,
      evidenceDetectedTags: item.evidenceDetectedTags,
      notes: item.notes ?? null,
    });
    updated.push({
      caseId: result.caseId,
      labelId: result.id,
      focusKey: result.focusKey,
    });
  }

  const output = {
    file: options.file,
    total: items.length,
    updatedCount: updated.length,
    skipped,
    updated,
  };
  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }
  console.log("Plan17 quality label import summary");
  console.log("");
  console.log(`file=${options.file}`);
  console.log(`updated=${updated.length}, skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
