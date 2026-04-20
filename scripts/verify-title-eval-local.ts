import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

type RunRow = {
  id: number;
  status: string;
  score_summary_json: string | null;
  error_message: string | null;
};

type ResultRow = {
  judge_payload_json: string | null;
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseJson<T>(value: string | null | undefined): T {
  return value ? JSON.parse(value) as T : {} as T;
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "huoziwriter-title-eval-"));
const targetDbPath = path.join(tempDir, "huoziwriter.db");

process.env.DATABASE_PATH = targetDbPath;
delete process.env.DATABASE_URL;
process.env.WRITING_EVAL_LOCAL_MOCK = "1";

async function main() {
  const { closeDatabase } = await import("../apps/web/src/lib/db");
  const { ensureExtendedProductSchema } = await import("../apps/web/src/lib/schema-bootstrap");
  const { ensureBootstrapData } = await import("../apps/web/src/lib/repositories");
  const { createWritingEvalRun } = await import("../apps/web/src/lib/writing-eval");
  const { runPendingMigrations } = await import("./db-flow");
  let sqlite: Database.Database | null = null;

  try {
    await runPendingMigrations();
    await ensureExtendedProductSchema();
    await ensureBootstrapData();
    await closeDatabase();

    sqlite = new Database(targetDbPath);
    sqlite.pragma("journal_mode = WAL");

    const dataset = sqlite
      .prepare("SELECT id, code FROM writing_eval_datasets WHERE code = ? LIMIT 1")
      .get("starter_cn_autoresearch_v1") as { id: number; code: string } | undefined;
    ensure(dataset, "starter_cn_autoresearch_v1 数据集不存在");

    const promptVersion = sqlite
      .prepare("SELECT id, version FROM prompt_versions WHERE prompt_id = ? AND version = ? LIMIT 1")
      .get("title_optimizer", "v1.0.0") as { id: number; version: string } | undefined;
    ensure(promptVersion, "title_optimizer@v1.0.0 Prompt 版本不存在");

    const run = await createWritingEvalRun({
      datasetId: dataset.id,
      baseVersionType: "title_template",
      baseVersionRef: "title_optimizer@v1.0.0",
      candidateVersionType: "title_template",
      candidateVersionRef: "title_optimizer@v1.0.0",
      experimentMode: "title_only",
      triggerMode: "manual",
      decisionMode: "manual_review",
      summary: "本地离线标题专项验收",
    });
    await closeDatabase();

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const worker = spawnSync("python3", ["apps/worker-py/main.py", "--once"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          DATABASE_PATH: targetDbPath,
          WRITING_EVAL_LOCAL_MOCK: "1",
        },
        encoding: "utf-8",
      });
      if (worker.status !== 0) {
        throw new Error(worker.stderr.trim() || worker.stdout.trim() || "worker 执行失败");
      }

      const currentRun = sqlite
        .prepare("SELECT id, status, score_summary_json, error_message FROM writing_optimization_runs WHERE id = ? LIMIT 1")
        .get(run.id) as RunRow | undefined;
      ensure(currentRun, `run ${run.id} 不存在`);
      if (currentRun.status === "succeeded") {
        break;
      }
      if (currentRun.status === "failed") {
        throw new Error(currentRun.error_message || "writing eval run failed");
      }
    }

    const finalRun = sqlite
      .prepare("SELECT id, status, score_summary_json, error_message FROM writing_optimization_runs WHERE id = ? LIMIT 1")
      .get(run.id) as RunRow | undefined;
    ensure(finalRun, `run ${run.id} 不存在`);
    ensure(finalRun.status === "succeeded", `run 未完成，当前状态: ${finalRun.status}`);

    const scoreSummary = parseJson<Record<string, unknown>>(finalRun.score_summary_json);
    const requiredSummaryKeys = [
      "titleOpenRateScore",
      "titleElementsHitCount",
      "titleForbiddenHitsCount",
      "titleSpecificHitRate",
      "titleCuriosityGapHitRate",
      "titleReaderViewHitRate",
      "titleForbiddenHitRate",
    ];
    for (const key of requiredSummaryKeys) {
      ensure(key in scoreSummary, `score_summary_json 缺少 ${key}`);
    }

    const resultRow = sqlite
      .prepare("SELECT judge_payload_json FROM writing_optimization_results WHERE run_id = ? ORDER BY id ASC LIMIT 1")
      .get(run.id) as ResultRow | undefined;
    ensure(resultRow, "未生成 writing_optimization_results");
    const judgePayload = parseJson<Record<string, unknown>>(resultRow.judge_payload_json);
    const rawSignals = judgePayload.signals;
    const rawGeneratedTitleSignal = judgePayload.generatedTitleSignal;
    const signals = typeof rawSignals === "string" ? parseJson<Record<string, unknown>>(rawSignals) : rawSignals;
    const generatedTitleSignal = typeof rawGeneratedTitleSignal === "string"
      ? parseJson<Record<string, unknown>>(rawGeneratedTitleSignal)
      : rawGeneratedTitleSignal;
    ensure(signals && typeof signals === "object", "judge_payload_json.signals 缺失");
    ensure(generatedTitleSignal && typeof generatedTitleSignal === "object", "judge_payload_json.generatedTitleSignal 缺失");

    const output = {
      tempDbPath: targetDbPath,
      runId: run.id,
      runStatus: finalRun.status,
      casesProcessed: scoreSummary.casesProcessed,
      totalScore: scoreSummary.totalScore,
      titleOpenRateScore: scoreSummary.titleOpenRateScore,
      titleElementsHitCount: scoreSummary.titleElementsHitCount,
      titleForbiddenHitsCount: scoreSummary.titleForbiddenHitsCount,
      titleSpecificHitRate: scoreSummary.titleSpecificHitRate,
      titleCuriosityGapHitRate: scoreSummary.titleCuriosityGapHitRate,
      titleReaderViewHitRate: scoreSummary.titleReaderViewHitRate,
      titleForbiddenHitRate: scoreSummary.titleForbiddenHitRate,
      firstCaseGeneratedTitleSignal: generatedTitleSignal,
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    if (sqlite) {
      sqlite.close();
    }
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
