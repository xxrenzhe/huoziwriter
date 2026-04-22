import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeDatabase, getDatabase } from "../db";
import {
  autoFillWritingEvalDatasetImports,
  buildWritingEvalTopicCaseVariants,
  createWritingEvalCase,
  getPlan17QualityReport,
  getWritingEvalCaseQualityLabels,
  getWritingEvalCases,
  getWritingEvalDatasetImportRecommendations,
  getWritingEvalDatasets,
  getWritingEvalTopicImportOptions,
  importWritingEvalCaseFromTopicItem,
  queuePlan17TopicFissionBenchmarkRuns,
  upsertWritingEvalCaseQualityLabel,
} from "../writing-eval";
import { getPromptVersions } from "../repositories";
import { runPendingMigrations } from "../../../../../scripts/db-flow";

async function withTempDatabase<T>(name: string, run: () => Promise<T>) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `huoziwriter-plan17-quality-${name}-`));
  const tempDbPath = path.join(tempDir, "fresh.db");
  const previousDatabasePath = process.env.DATABASE_PATH;

  process.env.DATABASE_PATH = tempDbPath;
  await closeDatabase();

  try {
    await runPendingMigrations();
    return await run();
  } finally {
    await closeDatabase();
    if (previousDatabasePath == null) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDatabasePath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function getPlan17TopicDatasetId() {
  const datasets = await getWritingEvalDatasets();
  const dataset = datasets.find((item) => item.code === "plan17-topic-fission-v1");
  assert.ok(dataset);
  return dataset.id;
}

async function getDatasetIdByCode(code: string) {
  const datasets = await getWritingEvalDatasets();
  const dataset = datasets.find((item) => item.code === code);
  assert.ok(dataset);
  return dataset.id;
}

async function createRunResultPair(input: {
  datasetId: number;
  caseId: number;
  totalScore: number;
  runCode: string;
  baseVersionRef?: string;
  candidateVersionRef?: string;
  generatedMarkdown?: string;
  judgePayloadJson?: Record<string, unknown>;
  createdAt?: string;
}) {
  const db = getDatabase();
  const now = input.createdAt ?? "2026-04-21T00:00:00.000Z";
  const runInsert = await db.exec(
    `INSERT INTO writing_optimization_runs (
      run_code, dataset_id, base_version_type, base_version_ref, candidate_version_type, candidate_version_ref,
      experiment_mode, trigger_mode, decision_mode, resolution_status, status, score_summary_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.runCode,
      input.datasetId,
      "prompt_version",
      input.baseVersionRef ?? "baseline@test",
      "prompt_version",
      input.candidateVersionRef ?? "candidate@test",
      "full_article",
      "manual",
      "manual_review",
      "pending",
      "succeeded",
      JSON.stringify({}),
      now,
    ],
  );
  const runId = Number(runInsert.lastInsertRowid);
  const resultInsert = await db.exec(
    `INSERT INTO writing_optimization_results (
      run_id, case_id, generated_markdown, total_score, viral_score, quality_score, judge_payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      input.caseId,
      input.generatedMarkdown ?? `# Result ${input.caseId}`,
      input.totalScore,
      input.totalScore,
      input.totalScore,
      JSON.stringify(input.judgePayloadJson ?? {}),
      now,
    ],
  );
  return {
    runId,
    resultId: Number(resultInsert.lastInsertRowid),
  };
}

async function withWritingEvalProviderEnv<T>(run: () => Promise<T>) {
  const previousOpenAi = process.env.OPENAI_API_KEY;
  const previousAnthropic = process.env.ANTHROPIC_API_KEY;
  const previousGemini = process.env.GEMINI_API_KEY;
  const previousGoogle = process.env.GOOGLE_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GOOGLE_API_KEY = "test-google-key";
  try {
    return await run();
  } finally {
    if (previousOpenAi == null) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAi;
    if (previousAnthropic == null) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropic;
    if (previousGemini == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGemini;
    if (previousGoogle == null) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previousGoogle;
  }
}

async function recreateQualityLabelTableWithoutUniqueCaseConstraint() {
  const db = getDatabase();
  assert.equal(db.type, "sqlite");
  await db.exec("ALTER TABLE writing_eval_case_quality_labels RENAME TO writing_eval_case_quality_labels_backup");
  await db.exec(
    `CREATE TABLE writing_eval_case_quality_labels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      dataset_id INTEGER NOT NULL,
      focus_key TEXT NOT NULL,
      strategy_manual_score REAL,
      evidence_expected_tags_json TEXT NOT NULL DEFAULT '[]',
      evidence_detected_tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );
  await db.exec(
    `INSERT INTO writing_eval_case_quality_labels (
      id, case_id, dataset_id, focus_key, strategy_manual_score, evidence_expected_tags_json, evidence_detected_tags_json,
      notes, created_by, created_at, updated_at
    )
    SELECT id, case_id, dataset_id, focus_key, strategy_manual_score, evidence_expected_tags_json, evidence_detected_tags_json,
           notes, created_by, created_at, updated_at
    FROM writing_eval_case_quality_labels_backup`,
  );
  await db.exec("DROP TABLE writing_eval_case_quality_labels_backup");
  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_case_quality_labels_dataset_case ON writing_eval_case_quality_labels(dataset_id, case_id)",
  );
  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_writing_eval_case_quality_labels_focus_updated_at ON writing_eval_case_quality_labels(focus_key, updated_at DESC)",
  );
}

async function getActivePromptVersionRef(promptId: string) {
  const versions = await getPromptVersions();
  const active = versions.find((item) => item.prompt_id === promptId && Boolean(item.is_active));
  assert.ok(active, `missing active prompt for ${promptId}`);
  return `${active.prompt_id}@${active.version}`;
}

async function seedTopicSourceAndItems(count = 4) {
  const db = getDatabase();
  const now = "2026-04-20T08:00:00.000Z";
  await db.exec(
    `INSERT INTO topic_sources (name, homepage_url, source_type, priority, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["LatePost", "https://example.com", "news", 100, 1, now, now],
  );

  const topicIds: number[] = [];
  for (let index = 0; index < count; index += 1) {
    topicIds.push(await createTopicItem({
      title: `计划 ${index + 1} · 主题裂变样本 ${index + 1}`,
      summary: `摘要 ${index + 1}：重点看新增变量、角色关系和叙事转向，不要停留在热点复述。`,
      emotionLabels: [`情绪线索 ${index + 1}`, `次级情绪 ${index + 1}`],
      angleOptions: [
        `切角 ${index + 1}A：别急着复述新闻，先拆这次真正新增的判断。`,
        `切角 ${index + 1}B：沿着利益变化重写读者为什么现在要关心。`,
        `切角 ${index + 1}C：把这件事放回长期观察里，说明旧结论哪里已经不够用了。`,
      ],
      sourceUrl: `https://example.com/topic-${index + 1}`,
      publishedAt: `2026-04-${20 - index}T08:00:00.000Z`,
      createdAt: now,
    }));
  }
  return topicIds;
}

async function createTopicItem(input?: {
  title?: string;
  summary?: string | null;
  emotionLabels?: string[];
  angleOptions?: string[];
  sourceUrl?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
}) {
  const db = getDatabase();
  const createdAt = input?.createdAt ?? "2026-04-20T08:00:00.000Z";
  const result = await db.exec(
    `INSERT INTO topic_items (
      owner_user_id, source_name, title, summary, emotion_labels_json, angle_options_json, source_url, published_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      null,
      "LatePost",
      input?.title ?? "计划样本 · 默认主题",
      input?.summary ?? "默认摘要：重点看新增变量、角色关系和叙事转向，不要停留在热点复述。",
      JSON.stringify(input?.emotionLabels ?? ["情绪线索 A", "次级情绪 A"]),
      JSON.stringify(input?.angleOptions ?? [
        "切角 A：别急着复述新闻，先拆这次真正新增的判断。",
        "切角 B：沿着利益变化重写读者为什么现在要关心。",
        "切角 C：把这件事放回长期观察里，说明旧结论哪里已经不够用了。",
      ]),
      input?.sourceUrl ?? "https://example.com/topic-default",
      input?.publishedAt ?? "2026-04-20T08:00:00.000Z",
      createdAt,
    ],
  );
  return Number(result.lastInsertRowid);
}

test("plan17 writing eval presets are seeded and exposed in the quality report", async () => {
  await withTempDatabase("presets", async () => {
    const datasets = await getWritingEvalDatasets();
    const datasetCodes = new Set(datasets.map((item) => item.code));
    assert.equal(datasetCodes.has("plan17-topic-fission-v1"), true);
    assert.equal(datasetCodes.has("plan17-strategy-strength-v1"), true);
    assert.equal(datasetCodes.has("plan17-evidence-hook-v1"), true);
    assert.equal(datasetCodes.has("plan17-rhythm-consistency-v1"), true);
    assert.equal(datasetCodes.has("plan21-opening-optimizer-v1"), true);

    const report = await getPlan17QualityReport();
    const focusKeys = new Set<string>(report.focuses.map((item) => item.key));
    assert.equal(focusKeys.has("topic_fission"), true);
    assert.equal(focusKeys.has("strategy_strength"), true);
    assert.equal(focusKeys.has("evidence_hook"), true);
    assert.equal(focusKeys.has("rhythm_consistency"), true);
    assert.equal(focusKeys.has("opening_optimizer"), false);
    assert.equal(report.totalDatasetCount, 4);
  });
});

test("topic case variants split a topic item into deterministic high-value scenarios", () => {
  const variants = buildWritingEvalTopicCaseVariants({
    topic: {
      id: 1,
      owner_user_id: null,
      source_name: "LatePost",
      source_type: "news",
      source_priority: 100,
      title: "问界 M9 从突围到引领，全新一代车型或再度重塑豪华市场",
      summary: "建议优先关注其中涉及的数据变化、角色关系和叙事转向。",
      emotion_labels_json: JSON.stringify(["创作危机"]),
      angle_options_json: JSON.stringify([
        "创作危机不是背景音，它本身就是这条新闻最值得写的切口。",
        "别急着重复标题，先拆开背后的利益变化和叙事漏洞。",
        "如果把这件事放回长期观察里，真正变化的不是事件，而是判断这件事的坐标。",
      ]),
      source_url: "https://example.com/topic",
      published_at: "2026-04-20T00:00:00.000Z",
    },
  });

  assert.deepEqual(
    variants.map((item) => item.code),
    ["angle-primary", "angle-contrast", "emotion-primary", "judgement-shift"],
  );
});

test("topic item import keeps yielding the next unused variant taskCode in the same dataset", async () => {
  await withTempDatabase("import-variants", async () => {
    const [topicItemId] = await seedTopicSourceAndItems(1);
    const datasetId = await getPlan17TopicDatasetId();

    const initialPlan = await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: 4,
    });
    const initialRecommendation = initialPlan.recommendations.find((item) => item.sourceType === "topic_item" && item.sourceId === topicItemId);
    assert.ok(initialRecommendation);
    assert.equal(initialRecommendation.taskCode, `topic-item-${topicItemId}--angle-primary`);

    const first = await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    const second = await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    const third = await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    const fourth = await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });

    assert.deepEqual(
      [first.taskCode, second.taskCode, third.taskCode, fourth.taskCode],
      [
        `topic-item-${topicItemId}--angle-primary`,
        `topic-item-${topicItemId}--angle-contrast`,
        `topic-item-${topicItemId}--emotion-primary`,
        `topic-item-${topicItemId}--judgement-shift`,
      ],
    );

    const nextPlan = await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: 4,
    });
    assert.equal(
      nextPlan.recommendations.some(
        (item) => item.sourceType === "topic_item" && item.sourceId === topicItemId && !item.derivation,
      ),
      false,
    );
    assert.ok(nextPlan.recommendations.some((item) => item.derivation?.sourceCaseId != null));

    await assert.rejects(
      importWritingEvalCaseFromTopicItem({ datasetId, topicItemId }),
      /高价值变体已全部导入当前评测集/,
    );

    const cases = await getWritingEvalCases(datasetId);
    assert.equal(cases.length, 4);
    assert.ok(cases.every((item) => item.sourceRef === `topic_item:${topicItemId}`));
  });
});

test("topic import recommendations filter template-placeholder polluted items and direct import rejects them", async () => {
  await withTempDatabase("template-pollution", async () => {
    const cleanTopicId = await createTopicItem({
      title: "计划 1 · 并购窗口重开后，团队真正该重估的不是估值",
      summary: "摘要：重点看新增变量、角色关系和叙事转向，不要停留在热点复述。",
      angleOptions: [
        "切角 A：别急着复述交易新闻，先拆这次真正新增的判断。",
        "切角 B：沿着利益变化重写读者为什么现在要关心。",
      ],
      sourceUrl: "https://example.com/topic-clean",
    });
    const pollutedTopicId = await createTopicItem({
      title: "{{item.title}} 这条热点到底值不值得继续追",
      summary: "摘要：别漏掉 {{it.label}} 这类模板残留。",
      angleOptions: [
        "切角 A：不要直接复述 {{item.title}}，先拆新增判断。",
        "切角 B：沿着 {{it.label}} 重写读者为什么现在要关心。",
      ],
      sourceUrl: "https://example.com/topic-polluted",
      publishedAt: "2026-04-19T08:00:00.000Z",
    });
    const datasetId = await getPlan17TopicDatasetId();

    const topicOptions = await getWritingEvalTopicImportOptions(8, datasetId);
    assert.equal(topicOptions.some((item) => item.id === cleanTopicId), true);
    assert.equal(topicOptions.some((item) => item.id === pollutedTopicId), false);

    const plan = await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: 8,
    });
    assert.equal(
      plan.recommendations.some((item) => item.sourceType === "topic_item" && item.sourceId === pollutedTopicId),
      false,
    );

    await assert.rejects(
      importWritingEvalCaseFromTopicItem({ datasetId, topicItemId: pollutedTopicId }),
      /模板占位符/,
    );
  });
});

test("auto-fill can expand beyond four samples by reusing topic items with different variants", async () => {
  await withTempDatabase("autofill", async () => {
    const topicIds = await seedTopicSourceAndItems(4);
    const datasetId = await getPlan17TopicDatasetId();

    const plan = await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: 8,
    });
    const topicRecommendations = plan.recommendations.filter((item) => item.sourceType === "topic_item");
    assert.equal(topicRecommendations.length, 4);
    assert.equal(new Set(topicRecommendations.map((item) => item.sourceId)).size, 4);
    assert.ok(topicRecommendations.every((item) => item.taskCode.endsWith("--angle-primary")));

    const result = await autoFillWritingEvalDatasetImports({
      datasetId,
      maxImports: 6,
    });

    assert.equal(result.createdCases.length, 6);
    assert.equal(new Set(result.createdCases.map((item) => item.taskCode)).size, 6);
    assert.ok(new Set(result.createdCases.map((item) => item.sourceRef)).size < result.createdCases.length);
    assert.equal(
      result.importedItems.filter((item) => item.sourceType === "topic_item").length,
      6,
    );
    assert.ok(
      result.importedItems.some((item, index) =>
        result.importedItems.findIndex((candidate) => candidate.sourceType === item.sourceType && candidate.sourceId === item.sourceId) !== index,
      ),
    );

    const cases = await getWritingEvalCases(datasetId);
    assert.equal(cases.length, 6);
    const uniqueSourceRefs = new Set(cases.map((item) => item.sourceRef));
    assert.ok(uniqueSourceRefs.size >= 2);
    assert.ok(uniqueSourceRefs.size <= topicIds.length);
  });
});

test("auto-fill falls back to derived cases after canonical topic variants are exhausted", async () => {
  await withTempDatabase("autofill-derived-fallback", async () => {
    const [topicItemId] = await seedTopicSourceAndItems(1);
    const datasetId = await getPlan17TopicDatasetId();

    await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });

    const plan = await getWritingEvalDatasetImportRecommendations({
      datasetId,
      limit: 4,
    });
    assert.ok(plan.recommendations.length > 0);
    assert.ok(plan.recommendations.some((item) => item.derivation?.sourceCaseId != null));

    const result = await autoFillWritingEvalDatasetImports({
      datasetId,
      maxImports: 2,
    });

    assert.equal(result.createdCases.length, 2);
    assert.ok(result.createdCases.every((item) => item.taskCode.includes("--autofill-")));
    assert.ok(result.createdCases.some((item) => item.referenceGoodOutput));

    const cases = await getWritingEvalCases(datasetId);
    assert.equal(cases.length, 6);
    assert.ok(cases.some((item) => item.taskCode.includes("--autofill-")));
  });
});

test("queuePlan17TopicFissionBenchmarkRuns creates three scene runs and job queue entries", async () => {
  await withTempDatabase("topic-fission-benchmark-queue", async () => {
    await seedTopicSourceAndItems(6);

    const result = await withWritingEvalProviderEnv(() => queuePlan17TopicFissionBenchmarkRuns({
      autoFill: true,
      force: true,
    }));

    assert.equal(result.datasetCode, "plan17-topic-fission-v1");
    assert.equal(result.scenes.length, 3);
    assert.equal(result.createdRunCount, 3);
    assert.ok(result.scenes.every((item) => item.promptVersionRef.includes("@")));
    assert.ok(result.scenes.every((item) => item.selectedRunStatus === "queued"));

    const second = await withWritingEvalProviderEnv(() => queuePlan17TopicFissionBenchmarkRuns({
      autoFill: false,
      force: false,
    }));
    assert.equal(second.createdRunCount, 0);
    assert.equal(second.scenes.every((item) => item.selectedRunStatus === "queued"), true);

    const db = getDatabase();
    const queuedJobs = await db.query<{ job_type: string; count: number }>(
      `SELECT job_type, COUNT(*) AS count
       FROM job_queue
       WHERE status = ?
       GROUP BY job_type`,
      ["queued"],
    );
    assert.equal(queuedJobs.find((item) => item.job_type === "writingEvalRun")?.count, 3);
  });
});

test("queuePlan17TopicFissionBenchmarkRuns fails fast when scene providers are unavailable", async () => {
  await withTempDatabase("topic-fission-benchmark-preflight", async () => {
    await seedTopicSourceAndItems(6);
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousAnthropic = process.env.ANTHROPIC_API_KEY;
    const previousGemini = process.env.GEMINI_API_KEY;
    const previousGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    try {
      await assert.rejects(
        queuePlan17TopicFissionBenchmarkRuns({
          autoFill: false,
          force: true,
        }),
        /topicFission benchmark 无法执行/,
      );
    } finally {
      if (previousOpenAi == null) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousAnthropic == null) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousAnthropic;
      if (previousGemini == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousGemini;
      if (previousGoogle == null) delete process.env.GOOGLE_API_KEY;
      else process.env.GOOGLE_API_KEY = previousGoogle;
    }
  });
});

test("quality report normalizes topic fallback task types for evidence and rhythm buckets", async () => {
  await withTempDatabase("focus-remap", async () => {
    const [topicItemId] = await seedTopicSourceAndItems(1);
    const evidenceDatasetId = await getDatasetIdByCode("plan17-evidence-hook-v1");
    const rhythmDatasetId = await getDatasetIdByCode("plan17-rhythm-consistency-v1");

    await importWritingEvalCaseFromTopicItem({ datasetId: evidenceDatasetId, topicItemId });
    await importWritingEvalCaseFromTopicItem({ datasetId: rhythmDatasetId, topicItemId });

    const report = await getPlan17QualityReport();
    const evidenceFocus = report.focuses.find((item) => item.key === "evidence_hook");
    const rhythmFocus = report.focuses.find((item) => item.key === "rhythm_consistency");

    assert.equal(evidenceFocus?.taskTypeBreakdown[0]?.key, "evidence_hook_tagging");
    assert.equal(rhythmFocus?.taskTypeBreakdown[0]?.key, "rhythm_consistency");
  });
});

test("quality report includes manual strategy labels and evidence label precision/recall", async () => {
  await withTempDatabase("manual-labels", async () => {
    const topicIds = await seedTopicSourceAndItems(3);
    const strategyDatasetId = await getDatasetIdByCode("plan17-strategy-strength-v1");
    const evidenceDatasetId = await getDatasetIdByCode("plan17-evidence-hook-v1");

    for (let index = 0; index < 3; index += 1) {
      await createWritingEvalCase({
        datasetId: strategyDatasetId,
        taskCode: `strategy-strength-${index + 1}`,
        taskType: "strategy_strength_audit",
        topicTitle: `策略强度样本 ${index + 1}`,
        sourceType: "article",
        sourceRef: `article:${index + 1}`,
        sourceLabel: `Article ${index + 1}`,
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: {
            archetype: "opinion",
            fourPointAudit: {
              cognitiveFlip: { score: index + 1 },
              readerSnapshot: { score: index + 1 },
              coreTension: { score: index + 1 },
              impactVector: { score: index + 1 },
            },
          },
        },
        difficultyLevel: "medium",
      });
    }
    for (let index = 0; index < 2; index += 1) {
      await importWritingEvalCaseFromTopicItem({ datasetId: evidenceDatasetId, topicItemId: topicIds[index] });
    }

    const strategyCases = (await getWritingEvalCases(strategyDatasetId)).sort((left, right) => left.id - right.id);
    const evidenceCases = await getWritingEvalCases(evidenceDatasetId);

    await upsertWritingEvalCaseQualityLabel({ caseId: strategyCases[0].id, strategyManualScore: 1 });
    await upsertWritingEvalCaseQualityLabel({ caseId: strategyCases[1].id, strategyManualScore: 2 });
    await upsertWritingEvalCaseQualityLabel({ caseId: strategyCases[2].id, strategyManualScore: 3 });
    await upsertWritingEvalCaseQualityLabel({
      caseId: evidenceCases[0].id,
      evidenceExpectedTags: ["反常识", "情绪造句"],
      evidenceDetectedTags: ["反常识", "情绪造句", "具身细节"],
    });
    await upsertWritingEvalCaseQualityLabel({
      caseId: evidenceCases[1].id,
      evidenceExpectedTags: ["身份标签"],
      evidenceDetectedTags: [],
    });

    const report = await getPlan17QualityReport();
    const strategyFocus = report.focuses.find((item) => item.key === "strategy_strength");
    const evidenceFocus = report.focuses.find((item) => item.key === "evidence_hook");
    const labels = await getWritingEvalCaseQualityLabels({ datasetId: evidenceDatasetId });

    assert.equal(strategyFocus?.reporting.strategyManualScoreSampleCount, 3);
    assert.equal(strategyFocus?.reporting.strategyManualScoreSpearman, 1);
    assert.equal(evidenceFocus?.reporting.evidenceLabelSampleCount, 2);
    assert.equal(Number((evidenceFocus?.reporting.evidenceLabelPrecision ?? 0).toFixed(4)), 0.6667);
    assert.equal(Number((evidenceFocus?.reporting.evidenceLabelRecall ?? 0).toFixed(4)), 0.6667);
    assert.equal(labels[0]?.taskCode != null, true);
    assert.equal(labels[0]?.topicTitle != null, true);
  });
});

test("quality report only counts the latest manual label version for each case", async () => {
  await withTempDatabase("manual-labels-deduped", async () => {
    const topicIds = await seedTopicSourceAndItems(2);
    const strategyDatasetId = await getDatasetIdByCode("plan17-strategy-strength-v1");
    const evidenceDatasetId = await getDatasetIdByCode("plan17-evidence-hook-v1");

    for (let index = 0; index < 3; index += 1) {
      await createWritingEvalCase({
        datasetId: strategyDatasetId,
        taskCode: `strategy-strength-dedup-${index + 1}`,
        taskType: "strategy_strength_audit",
        topicTitle: `策略强度去重样本 ${index + 1}`,
        sourceType: "article",
        sourceRef: `article:${910 + index}`,
        sourceLabel: `Article ${index + 1}`,
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: {
            archetype: "opinion",
            fourPointAudit: {
              cognitiveFlip: { score: index + 1 },
              readerSnapshot: { score: index + 1 },
              coreTension: { score: index + 1 },
              impactVector: { score: index + 1 },
            },
          },
        },
        difficultyLevel: "medium",
      });
    }
    for (let index = 0; index < 2; index += 1) {
      await importWritingEvalCaseFromTopicItem({ datasetId: evidenceDatasetId, topicItemId: topicIds[index] });
    }

    await recreateQualityLabelTableWithoutUniqueCaseConstraint();

    const strategyCases = (await getWritingEvalCases(strategyDatasetId)).sort((left, right) => left.id - right.id);
    const evidenceCases = (await getWritingEvalCases(evidenceDatasetId)).sort((left, right) => left.id - right.id);
    const db = getDatabase();

    for (const row of [
      {
        caseId: strategyCases[0].id,
        datasetId: strategyDatasetId,
        focusKey: "strategy_strength",
        strategyManualScore: 3,
        expectedTags: [],
        detectedTags: [],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: strategyCases[0].id,
        datasetId: strategyDatasetId,
        focusKey: "strategy_strength",
        strategyManualScore: 1,
        expectedTags: [],
        detectedTags: [],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: strategyCases[1].id,
        datasetId: strategyDatasetId,
        focusKey: "strategy_strength",
        strategyManualScore: 2,
        expectedTags: [],
        detectedTags: [],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: strategyCases[2].id,
        datasetId: strategyDatasetId,
        focusKey: "strategy_strength",
        strategyManualScore: 1,
        expectedTags: [],
        detectedTags: [],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: strategyCases[2].id,
        datasetId: strategyDatasetId,
        focusKey: "strategy_strength",
        strategyManualScore: 3,
        expectedTags: [],
        detectedTags: [],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: evidenceCases[0].id,
        datasetId: evidenceDatasetId,
        focusKey: "evidence_hook",
        strategyManualScore: null,
        expectedTags: ["反常识"],
        detectedTags: ["反常识", "具身细节"],
        updatedAt: "2026-04-21T10:00:00.000Z",
      },
      {
        caseId: evidenceCases[0].id,
        datasetId: evidenceDatasetId,
        focusKey: "evidence_hook",
        strategyManualScore: null,
        expectedTags: ["身份标签"],
        detectedTags: ["身份标签"],
        updatedAt: "2026-04-21T10:10:00.000Z",
      },
      {
        caseId: evidenceCases[1].id,
        datasetId: evidenceDatasetId,
        focusKey: "evidence_hook",
        strategyManualScore: null,
        expectedTags: ["情绪造句"],
        detectedTags: [],
        updatedAt: "2026-04-21T10:05:00.000Z",
      },
    ]) {
      await db.exec(
        `INSERT INTO writing_eval_case_quality_labels (
          case_id, dataset_id, focus_key, strategy_manual_score, evidence_expected_tags_json, evidence_detected_tags_json,
          notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.caseId,
          row.datasetId,
          row.focusKey,
          row.strategyManualScore,
          JSON.stringify(row.expectedTags),
          JSON.stringify(row.detectedTags),
          null,
          null,
          row.updatedAt,
          row.updatedAt,
        ],
      );
    }

    const report = await getPlan17QualityReport();
    const strategyFocus = report.focuses.find((item) => item.key === "strategy_strength");
    const evidenceFocus = report.focuses.find((item) => item.key === "evidence_hook");

    assert.equal(strategyFocus?.reporting.strategyManualScoreSampleCount, 3);
    assert.equal(strategyFocus?.reporting.strategyManualScoreSpearman, 1);
    assert.equal(evidenceFocus?.reporting.evidenceLabelSampleCount, 2);
    assert.equal(Number((evidenceFocus?.reporting.evidenceLabelPrecision ?? 0).toFixed(4)), 1);
    assert.equal(Number((evidenceFocus?.reporting.evidenceLabelRecall ?? 0).toFixed(4)), 0.5);
  });
});

test("quality report prefers article outcome strategy attribution over strategy card fallback", async () => {
  await withTempDatabase("strategy-attribution-priority", async () => {
    const datasetId = await getDatasetIdByCode("plan17-strategy-strength-v1");
    const db = getDatabase();
    const cases = await Promise.all(
      [1, 2, 3].map((manualScore, index) =>
        createWritingEvalCase({
          datasetId,
          taskCode: `strategy-attribution-${index + 1}`,
          taskType: "strategy_strength_audit",
          topicTitle: `策略归因优先样本 ${index + 1}`,
          sourceType: "article",
          sourceRef: `article:${1501 + index}`,
          sourceLabel: `Article ${1501 + index}`,
          inputPayload: {},
          expectedConstraints: {},
          viralTargets: {},
          stageArtifactPayloads: {
            strategyCard: {
              archetype: "opinion",
              fourPointAudit: {
                cognitiveFlip: { score: 4 - manualScore },
                readerSnapshot: { score: 4 - manualScore },
                coreTension: { score: 4 - manualScore },
                impactVector: { score: 4 - manualScore },
              },
            },
          },
          difficultyLevel: "medium",
        }),
      ),
    );

    for (const [index, articleId] of [1501, 1502, 1503].entries()) {
      await db.exec(
        `INSERT INTO article_outcomes (
          article_id, user_id, scorecard_json, attribution_json, hit_status, playbook_tags_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          articleId,
          1,
          JSON.stringify({}),
          JSON.stringify({
            strategy: { archetype: "opinion", fourPointAverageScore: 3 - index },
          }),
          "pending",
          JSON.stringify([]),
          "2026-04-21T02:00:00.000Z",
          "2026-04-21T02:00:00.000Z",
        ],
      );
    }

    await upsertWritingEvalCaseQualityLabel({ caseId: cases[0].id, strategyManualScore: 3 });
    await upsertWritingEvalCaseQualityLabel({ caseId: cases[1].id, strategyManualScore: 2 });
    await upsertWritingEvalCaseQualityLabel({ caseId: cases[2].id, strategyManualScore: 1 });

    const report = await getPlan17QualityReport();
    const strategyFocus = report.focuses.find((item) => item.key === "strategy_strength");

    assert.equal(strategyFocus?.reporting.strategyManualScoreSampleCount, 3);
    assert.equal(strategyFocus?.reporting.strategyManualScoreSpearman, 1);
  });
});

test("quality report computes true rhythm deviation correlation from result markdown", async () => {
  await withTempDatabase("rhythm-correlation", async () => {
    const datasetId = await getDatasetIdByCode("plan17-rhythm-consistency-v1");
    const cases = await Promise.all([
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-1",
        taskType: "rhythm_consistency",
        topicTitle: "节奏样本 1",
        sourceType: "article",
        sourceRef: "article:101",
        sourceLabel: "Article 101",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "judgementFirst",
            openingMove: "先下判断再补原因",
            sectionRhythm: "判断 -> 证据 -> 推演",
            evidenceMode: "案例和事实交替推进",
          },
        },
        difficultyLevel: "medium",
      }),
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-2",
        taskType: "rhythm_consistency",
        topicTitle: "节奏样本 2",
        sourceType: "article",
        sourceRef: "article:102",
        sourceLabel: "Article 102",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "judgementFirst",
            openingMove: "先下判断再补原因",
            sectionRhythm: "判断 -> 证据 -> 推演",
            evidenceMode: "案例和事实交替推进",
          },
        },
        difficultyLevel: "medium",
      }),
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-3",
        taskType: "rhythm_consistency",
        topicTitle: "节奏样本 3",
        sourceType: "article",
        sourceRef: "article:103",
        sourceLabel: "Article 103",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "judgementFirst",
            openingMove: "先下判断再补原因",
            sectionRhythm: "判断 -> 证据 -> 推演",
            evidenceMode: "案例和事实交替推进",
          },
        },
        difficultyLevel: "medium",
      }),
    ]);
    const db = getDatabase();
    const resultOne = await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 75,
      runCode: "rhythm-run-1",
      generatedMarkdown: "开门先给判断。\n\n第二段补充原因和证据。\n\n结尾收束回到判断。",
    });
    const resultTwo = await createRunResultPair({
      datasetId,
      caseId: cases[1].id,
      totalScore: 75,
      runCode: "rhythm-run-2",
      generatedMarkdown: "这件事有很多背景。\n\n我先继续铺资料。\n\n最后也没有明确收束。",
    });
    const resultThree = await createRunResultPair({
      datasetId,
      caseId: cases[2].id,
      totalScore: 75,
      runCode: "rhythm-run-3",
      generatedMarkdown: "先说判断。\n\n再补两个证据。\n\n最后提醒接下来怎么观察。",
    });

    for (const [articleId, rhythmScore] of [[101, 1], [102, 0.5], [103, 0]] as const) {
      await db.exec(
        `INSERT INTO article_outcomes (
          article_id, user_id, scorecard_json, attribution_json, hit_status, playbook_tags_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          articleId,
          1,
          JSON.stringify({}),
          JSON.stringify({
            strategy: { archetype: "opinion", fourPointAverageScore: 3 },
            rhythm: { score: rhythmScore },
          }),
          "pending",
          JSON.stringify([]),
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
        ],
      );
    }

    for (const [index, result] of [resultOne, resultTwo, resultThree].entries()) {
      await db.exec(
        `INSERT INTO writing_eval_online_feedback (
          run_id, result_id, case_id, source_type, source_label, read_completion_rate, payload_json, captured_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.runId,
          result.resultId,
          cases[index].id,
          "manual",
          `Feedback ${index + 1}`,
          [80, 50, 20][index],
          JSON.stringify({}),
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
        ],
      );
    }

    const report = await getPlan17QualityReport();
    const rhythmFocus = report.focuses.find((item) => item.key === "rhythm_consistency");

    assert.equal(rhythmFocus?.reporting.rhythmDeviationVsReadCompletionSampleCount, 3);
    assert.equal(Number((rhythmFocus?.reporting.rhythmDeviationVsReadCompletionCorrelation ?? 0).toFixed(4)), -1);
    assert.equal(rhythmFocus?.reporting.rhythmDeviationVsReadCompletionPValue, null);
  });
});

test("quality report recomputes rhythm deviation from runtime signals when attribution is missing", async () => {
  await withTempDatabase("rhythm-runtime-fallback", async () => {
    const datasetId = await getDatasetIdByCode("plan17-rhythm-consistency-v1");
    const cases = await Promise.all([
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-runtime-1",
        taskType: "rhythm_consistency",
        topicTitle: "节奏运行时回退样本 1",
        sourceType: "article",
        sourceRef: "article:1601",
        sourceLabel: "Article 1601",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "general",
            openingMove: "先别急着复述新闻，关键是把判断说透。",
            sectionRhythm: "判断 -> 变量 -> 代价 -> 收束",
            evidenceMode: "围绕变量和冲突层层推进",
          },
        },
        difficultyLevel: "medium",
      }),
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-runtime-2",
        taskType: "rhythm_consistency",
        topicTitle: "节奏运行时回退样本 2",
        sourceType: "article",
        sourceRef: "article:1602",
        sourceLabel: "Article 1602",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "general",
            openingMove: "问题是这件事不能只看热度。",
            sectionRhythm: "铺背景 -> 事实补充",
            evidenceMode: "资料先行",
          },
        },
        difficultyLevel: "medium",
      }),
      createWritingEvalCase({
        datasetId,
        taskCode: "rhythm-runtime-3",
        taskType: "rhythm_consistency",
        topicTitle: "节奏运行时回退样本 3",
        sourceType: "article",
        sourceRef: "article:1603",
        sourceLabel: "Article 1603",
        inputPayload: {},
        expectedConstraints: {},
        viralTargets: {},
        stageArtifactPayloads: {
          strategyCard: { archetype: "opinion" },
          deepWriting: {
            articlePrototype: "personal_narrative",
            openingMove: "今天聊聊这个新闻背景。",
            sectionRhythm: "资料罗列",
            evidenceMode: "信息平铺",
          },
        },
        difficultyLevel: "medium",
      }),
    ]);
    const db = getDatabase();
    const resultOne = await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 75,
      runCode: "rhythm-runtime-run-1",
      generatedMarkdown: "关键是别急着复述表层热度。\n\n中段把变量和代价层层拆开。\n\n所以我的判断是，这件事真正该看的不是热闹，而是代价。",
    });
    const resultTwo = await createRunResultPair({
      datasetId,
      caseId: cases[1].id,
      totalScore: 75,
      runCode: "rhythm-runtime-run-2",
      generatedMarkdown: "问题是这件事不能只看热度。\n\n我先补一些资料和背景。\n\n最后先停在这里。",
    });
    const resultThree = await createRunResultPair({
      datasetId,
      caseId: cases[2].id,
      totalScore: 75,
      runCode: "rhythm-runtime-run-3",
      generatedMarkdown: "今天聊聊这个事情的背景。\n\n接着继续铺一些资料。\n\n最后简单收个尾。",
    });

    for (const [index, result] of [resultOne, resultTwo, resultThree].entries()) {
      await db.exec(
        `INSERT INTO writing_eval_online_feedback (
          run_id, result_id, case_id, source_type, source_label, read_completion_rate, payload_json, captured_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.runId,
          result.resultId,
          cases[index].id,
          "manual",
          `Runtime Feedback ${index + 1}`,
          [90, 60, 20][index],
          JSON.stringify({}),
          "2026-04-21T02:30:00.000Z",
          "2026-04-21T02:30:00.000Z",
          "2026-04-21T02:30:00.000Z",
        ],
      );
    }

    const report = await getPlan17QualityReport();
    const rhythmFocus = report.focuses.find((item) => item.key === "rhythm_consistency");

    assert.equal(rhythmFocus?.reporting.rhythmDeviationVsReadCompletionSampleCount, 3);
    assert.ok((rhythmFocus?.reporting.rhythmDeviationVsReadCompletionCorrelation ?? 0) < 0);
  });
});

test("quality report exposes rhythm correlation p-value when paired samples are sufficient", async () => {
  await withTempDatabase("rhythm-correlation-pvalue", async () => {
    const datasetId = await getDatasetIdByCode("plan17-rhythm-consistency-v1");
    const db = getDatabase();
    const cases = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createWritingEvalCase({
          datasetId,
          taskCode: `rhythm-pvalue-${index + 1}`,
          taskType: "rhythm_consistency",
          topicTitle: `节奏显著性样本 ${index + 1}`,
          sourceType: "article",
          sourceRef: `article:${1200 + index}`,
          sourceLabel: `Article ${1200 + index}`,
          inputPayload: {},
          expectedConstraints: {},
          viralTargets: {},
          stageArtifactPayloads: {
            strategyCard: { archetype: "opinion" },
            deepWriting: {
              articlePrototype: "judgementFirst",
              openingMove: "先下判断再补原因",
              sectionRhythm: "判断 -> 证据 -> 推演",
              evidenceMode: "案例和事实交替推进",
            },
          },
          difficultyLevel: "medium",
        }),
      ),
    );

    for (const [index, item] of cases.entries()) {
      const articleId = 1200 + index;
      const rhythmScore = Number((1 - index / 20).toFixed(4));
      const readCompletionRate = Number((100 - index * 4).toFixed(4));
      const result = await createRunResultPair({
        datasetId,
        caseId: item.id,
        totalScore: 75,
        runCode: `rhythm-pvalue-run-${index + 1}`,
        generatedMarkdown: "先说判断。\n\n再补两个证据。\n\n最后提醒接下来怎么观察。",
      });
      await db.exec(
        `INSERT INTO article_outcomes (
          article_id, user_id, scorecard_json, attribution_json, hit_status, playbook_tags_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          articleId,
          1,
          JSON.stringify({}),
          JSON.stringify({
            strategy: { archetype: "opinion", fourPointAverageScore: 3 },
            rhythm: { score: rhythmScore },
          }),
          "pending",
          JSON.stringify([]),
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
        ],
      );
      await db.exec(
        `INSERT INTO writing_eval_online_feedback (
          run_id, result_id, case_id, source_type, source_label, read_completion_rate, payload_json, captured_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.runId,
          result.resultId,
          item.id,
          "manual",
          `Feedback ${index + 1}`,
          readCompletionRate,
          JSON.stringify({}),
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
          "2026-04-21T01:00:00.000Z",
        ],
      );
    }

    const report = await getPlan17QualityReport();
    const rhythmFocus = report.focuses.find((item) => item.key === "rhythm_consistency");

    assert.equal(rhythmFocus?.reporting.rhythmDeviationVsReadCompletionSampleCount, 20);
    assert.ok((rhythmFocus?.reporting.rhythmDeviationVsReadCompletionCorrelation ?? 0) < 0);
    assert.ok((rhythmFocus?.reporting.rhythmDeviationVsReadCompletionPValue ?? 1) < 0.05);
  });
});

test("quality report exposes topicFission scene breakdown and stable hit rate by active prompt version", async () => {
  await withTempDatabase("topic-scenes", async () => {
    const topicIds = await seedTopicSourceAndItems(24);
    const datasetId = await getPlan17TopicDatasetId();
    for (const topicItemId of topicIds) {
      await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    }

    const cases = await getWritingEvalCases(datasetId);
    assert.equal(cases.length, 24);

    const regularityRef = await getActivePromptVersionRef("topicFission.regularity");
    const contrastRef = await getActivePromptVersionRef("topicFission.contrast");
    const crossDomainRef = await getActivePromptVersionRef("topicFission.crossDomain");

    for (const [index, item] of cases.entries()) {
      await createRunResultPair({
        datasetId,
        caseId: item.id,
        totalScore: index < 18 ? 82 : 61,
        runCode: `regularity-run-${index + 1}`,
        baseVersionRef: regularityRef,
        candidateVersionRef: regularityRef,
      });
      await createRunResultPair({
        datasetId,
        caseId: item.id,
        totalScore: index < 16 ? 78 : 58,
        runCode: `contrast-run-${index + 1}`,
        baseVersionRef: contrastRef,
        candidateVersionRef: contrastRef,
      });
      await createRunResultPair({
        datasetId,
        caseId: item.id,
        totalScore: index < 17 ? 80 : 55,
        runCode: `cross-run-${index + 1}`,
        baseVersionRef: crossDomainRef,
        candidateVersionRef: crossDomainRef,
      });
    }

    const report = await getPlan17QualityReport();
    const topicFocus = report.focuses.find((item) => item.key === "topic_fission");
    assert.ok(topicFocus);
    assert.equal(topicFocus.reporting.topicFissionSceneBreakdown.length, 3);

    const regularity = topicFocus.reporting.topicFissionSceneBreakdown.find((item) => item.sceneKey === "regularity");
    const contrast = topicFocus.reporting.topicFissionSceneBreakdown.find((item) => item.sceneKey === "contrast");
    const crossDomain = topicFocus.reporting.topicFissionSceneBreakdown.find((item) => item.sceneKey === "crossDomain");

    assert.equal(regularity?.evaluatedCaseCount, 24);
    assert.equal(regularity?.stableCaseCount, 24);
    assert.equal(Number((regularity?.stableHitRate ?? 0).toFixed(4)), 0.75);
    assert.equal(contrast?.evaluatedCaseCount, 24);
    assert.equal(Number((contrast?.stableHitRate ?? 0).toFixed(4)), 0.6667);
    assert.equal(crossDomain?.evaluatedCaseCount, 24);
    assert.equal(Number((crossDomain?.stableHitRate ?? 0).toFixed(4)), 0.7083);
  });
});

test("quality report ignores old prompt-version scene runs after active version changes", async () => {
  await withTempDatabase("topic-scenes-old-version", async () => {
    const topicIds = await seedTopicSourceAndItems(2);
    const datasetId = await getPlan17TopicDatasetId();
    for (const topicItemId of topicIds) {
      await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    }

    const cases = await getWritingEvalCases(datasetId);
    const regularityRef = await getActivePromptVersionRef("topicFission.regularity");
    const oldRegularityRef = "topicFission.regularity@legacy";

    await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 61,
      runCode: "regularity-active-1",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 95,
      runCode: "regularity-legacy-1",
      baseVersionRef: oldRegularityRef,
      candidateVersionRef: oldRegularityRef,
      createdAt: "2026-04-21T00:05:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[1].id,
      totalScore: 82,
      runCode: "regularity-active-2",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      createdAt: "2026-04-21T00:01:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[1].id,
      totalScore: 93,
      runCode: "regularity-legacy-2",
      baseVersionRef: oldRegularityRef,
      candidateVersionRef: oldRegularityRef,
      createdAt: "2026-04-21T00:06:00.000Z",
    });

    const report = await getPlan17QualityReport();
    const topicFocus = report.focuses.find((item) => item.key === "topic_fission");
    const regularity = topicFocus?.reporting.topicFissionSceneBreakdown.find((item) => item.sceneKey === "regularity");

    assert.equal(regularity?.evaluatedCaseCount, 2);
    assert.equal(regularity?.stableCaseCount, 2);
    assert.equal(regularity?.stableHitCaseCount, 1);
    assert.equal(Number((regularity?.stableHitRate ?? 0).toFixed(4)), 0.5);
  });
});

test("quality report excludes failed latest scene results from stable counts and exposes failedCaseCount", async () => {
  await withTempDatabase("topic-scenes-failed-latest", async () => {
    const topicIds = await seedTopicSourceAndItems(3);
    const datasetId = await getPlan17TopicDatasetId();
    for (const topicItemId of topicIds) {
      await importWritingEvalCaseFromTopicItem({ datasetId, topicItemId });
    }

    const cases = await getWritingEvalCases(datasetId);
    const regularityRef = await getActivePromptVersionRef("topicFission.regularity");

    await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 83,
      runCode: "regularity-success-1",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      createdAt: "2026-04-21T00:00:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[0].id,
      totalScore: 0,
      runCode: "regularity-failed-1",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      judgePayloadJson: { status: "failed", error: "missing ANTHROPIC_API_KEY" },
      createdAt: "2026-04-21T00:05:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[1].id,
      totalScore: 79,
      runCode: "regularity-success-2",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      createdAt: "2026-04-21T00:03:00.000Z",
    });
    await createRunResultPair({
      datasetId,
      caseId: cases[2].id,
      totalScore: 61,
      runCode: "regularity-success-3",
      baseVersionRef: regularityRef,
      candidateVersionRef: regularityRef,
      createdAt: "2026-04-21T00:04:00.000Z",
    });

    const report = await getPlan17QualityReport();
    const topicFocus = report.focuses.find((item) => item.key === "topic_fission");
    const regularity = topicFocus?.reporting.topicFissionSceneBreakdown.find((item) => item.sceneKey === "regularity");

    assert.equal(regularity?.evaluatedCaseCount, 3);
    assert.equal(regularity?.failedCaseCount, 1);
    assert.equal(regularity?.stableCaseCount, 2);
    assert.equal(regularity?.stableHitCaseCount, 1);
    assert.equal(Number((regularity?.stableHitRate ?? 0).toFixed(4)), 0.5);
  });
});
