import { getDatabase } from "./db";
import { createArticle, getArticleById } from "./repositories";
import { PLAN22_STAGE_PROMPT_DEFINITIONS } from "./plan22-prompt-catalog";

export type ArticleAutomationInputMode = "brief" | "url" | "recommendedTopic";
export type ArticleAutomationLevel = "draftPreview" | "wechatDraft" | "strategyOnly";
export type ArticleAutomationRunStatus = "queued" | "running" | "blocked" | "failed" | "completed" | "cancelled";
export type ArticleAutomationStageStatus = "queued" | "running" | "retrying" | "blocked" | "failed" | "completed" | "skipped";

export type ArticleAutomationRun = {
  id: number;
  userId: number;
  articleId: number | null;
  inputMode: ArticleAutomationInputMode;
  inputText: string;
  sourceUrl: string | null;
  targetWechatConnectionId: number | null;
  targetSeriesId: number | null;
  automationLevel: ArticleAutomationLevel;
  status: ArticleAutomationRunStatus;
  currentStageCode: string;
  finalWechatMediaId: string | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArticleAutomationStageRun = {
  id: number;
  runId: number;
  articleId: number | null;
  stageCode: string;
  promptId: string;
  promptVersion: string;
  sceneCode: string;
  provider: string | null;
  model: string | null;
  status: ArticleAutomationStageStatus;
  inputJson: unknown;
  outputJson: unknown;
  qualityJson: unknown;
  searchTraceJson: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type AutomationRunRow = {
  id: number;
  user_id: number;
  article_id: number | null;
  input_mode: string;
  input_text: string;
  source_url: string | null;
  target_wechat_connection_id: number | null;
  target_series_id: number | null;
  automation_level: string;
  status: string;
  current_stage_code: string;
  final_wechat_media_id: string | null;
  blocked_reason: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationStageRunRow = {
  id: number;
  run_id: number;
  article_id: number | null;
  stage_code: string;
  prompt_id: string;
  prompt_version: string;
  scene_code: string;
  provider: string | null;
  model: string | null;
  status: string;
  input_json: unknown;
  output_json: unknown;
  quality_json: unknown;
  search_trace_json: unknown;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

const INPUT_MODES = new Set<ArticleAutomationInputMode>(["brief", "url", "recommendedTopic"]);
const AUTOMATION_LEVELS = new Set<ArticleAutomationLevel>(["draftPreview", "wechatDraft", "strategyOnly"]);
const PLAN22_STAGE_INDEX = new Map(PLAN22_STAGE_PROMPT_DEFINITIONS.map((definition, index) => [definition.stageCode, index] as const));

function normalizeInputMode(value: unknown): ArticleAutomationInputMode {
  const normalized = String(value || "brief").trim();
  return INPUT_MODES.has(normalized as ArticleAutomationInputMode) ? (normalized as ArticleAutomationInputMode) : "brief";
}

function normalizeAutomationLevel(value: unknown): ArticleAutomationLevel {
  const normalized = String(value || "draftPreview").trim();
  return AUTOMATION_LEVELS.has(normalized as ArticleAutomationLevel) ? (normalized as ArticleAutomationLevel) : "draftPreview";
}

function normalizeNullableId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseJsonValue(value: unknown) {
  if (value == null || value === "") return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  return value;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function mapRun(row: AutomationRunRow): ArticleAutomationRun {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    articleId: row.article_id == null ? null : Number(row.article_id),
    inputMode: normalizeInputMode(row.input_mode),
    inputText: row.input_text,
    sourceUrl: row.source_url,
    targetWechatConnectionId: row.target_wechat_connection_id == null ? null : Number(row.target_wechat_connection_id),
    targetSeriesId: row.target_series_id == null ? null : Number(row.target_series_id),
    automationLevel: normalizeAutomationLevel(row.automation_level),
    status: row.status as ArticleAutomationRunStatus,
    currentStageCode: row.current_stage_code,
    finalWechatMediaId: row.final_wechat_media_id,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStageRun(row: AutomationStageRunRow): ArticleAutomationStageRun {
  return {
    id: Number(row.id),
    runId: Number(row.run_id),
    articleId: row.article_id == null ? null : Number(row.article_id),
    stageCode: row.stage_code,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    sceneCode: row.scene_code,
    provider: row.provider,
    model: row.model,
    status: row.status as ArticleAutomationStageStatus,
    inputJson: parseJsonValue(row.input_json),
    outputJson: parseJsonValue(row.output_json),
    qualityJson: parseJsonValue(row.quality_json),
    searchTraceJson: parseJsonValue(row.search_trace_json),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function getActivePromptVersion(promptId: string) {
  const db = getDatabase();
  const row = await db.queryOne<{ version: string }>(
    `SELECT version
     FROM prompt_versions
     WHERE prompt_id = ? AND is_active = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [promptId, true],
  );
  return row?.version ?? "v1.0.0";
}

function buildAutomationArticleTitle(inputText: string) {
  const normalized = inputText.replace(/\s+/g, " ").trim();
  if (!normalized) return "AI 自动生成稿件";
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

export async function createArticleAutomationRun(input: {
  userId: number;
  inputMode?: unknown;
  inputText?: unknown;
  sourceUrl?: unknown;
  targetWechatConnectionId?: unknown;
  targetSeriesId?: unknown;
  automationLevel?: unknown;
}) {
  const db = getDatabase();
  const inputMode = normalizeInputMode(input.inputMode);
  const sourceUrl = String(input.sourceUrl || "").trim() || null;
  const inputText = String(input.inputText || sourceUrl || "").trim();
  const automationLevel = normalizeAutomationLevel(input.automationLevel);
  const targetSeriesId = normalizeNullableId(input.targetSeriesId);
  const targetWechatConnectionId = normalizeNullableId(input.targetWechatConnectionId);

  if (!inputText) {
    throw new Error("自动化生产线需要一句话主题、链接或推荐选题文本");
  }
  if (inputMode === "url" && !sourceUrl) {
    throw new Error("链接起稿需要 sourceUrl");
  }

  return await db.transaction(async () => {
    const article =
      automationLevel === "strategyOnly"
        ? null
        : await createArticle(input.userId, buildAutomationArticleTitle(inputText), targetSeriesId);
    const now = new Date().toISOString();
    const result = await db.exec(
      `INSERT INTO article_automation_runs (
        user_id, article_id, input_mode, input_text, source_url, target_wechat_connection_id,
        target_series_id, automation_level, status, current_stage_code, final_wechat_media_id,
        blocked_reason, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        article?.id ?? null,
        inputMode,
        inputText,
        sourceUrl,
        targetWechatConnectionId,
        targetSeriesId,
        automationLevel,
        "queued",
        PLAN22_STAGE_PROMPT_DEFINITIONS[0]?.stageCode ?? "topicAnalysis",
        null,
        null,
        now,
        now,
      ],
    );
    const runId = Number(result.lastInsertRowid);
    for (const definition of PLAN22_STAGE_PROMPT_DEFINITIONS) {
      const promptVersion = await getActivePromptVersion(definition.promptId);
      await db.exec(
        `INSERT INTO article_automation_stage_runs (
          run_id, article_id, stage_code, prompt_id, prompt_version, scene_code,
          provider, model, status, input_json, output_json, quality_json, search_trace_json,
          error_code, error_message, started_at, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          article?.id ?? null,
          definition.stageCode,
          definition.promptId,
          promptVersion,
          definition.sceneCode,
          null,
          null,
          "queued",
          stringifyJson({ requiredOutputFields: definition.requiredOutputFields }),
          stringifyJson({}),
          stringifyJson({}),
          stringifyJson({}),
          null,
          null,
          null,
          null,
          now,
          now,
        ],
      );
    }
    const run = await getArticleAutomationRunById(runId, input.userId);
    if (!run) {
      throw new Error("自动化运行创建失败");
    }
    return run;
  });
}

export async function getArticleAutomationRunById(runId: number, userId: number) {
  const db = getDatabase();
  const runRow = await db.queryOne<AutomationRunRow>(
    "SELECT * FROM article_automation_runs WHERE id = ? AND user_id = ?",
    [runId, userId],
  );
  if (!runRow) return null;
  const stageRows = await db.query<AutomationStageRunRow>(
    "SELECT * FROM article_automation_stage_runs WHERE run_id = ? ORDER BY id ASC",
    [runId],
  );
  const article = runRow.article_id ? await getArticleById(Number(runRow.article_id), userId) : null;
  return {
    run: mapRun(runRow),
    stages: stageRows.map(mapStageRun),
    article,
  };
}

export async function getArticleAutomationRunsByUser(userId: number, limit = 20) {
  const db = getDatabase();
  const rows = await db.query<AutomationRunRow>(
    `SELECT *
     FROM article_automation_runs
     WHERE user_id = ?
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    [userId, Math.max(1, Math.min(100, limit))],
  );
  return rows.map(mapRun);
}

export async function cancelArticleAutomationRun(runId: number, userId: number) {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE article_automation_runs
     SET status = ?, blocked_reason = NULL, updated_at = ?
     WHERE id = ? AND user_id = ? AND status IN (?, ?, ?)`,
    ["cancelled", now, runId, userId, "queued", "running", "blocked"],
  );
  return await getArticleAutomationRunById(runId, userId);
}

async function getAutomationRunRow(runId: number, userId: number) {
  const db = getDatabase();
  return await db.queryOne<AutomationRunRow>(
    "SELECT * FROM article_automation_runs WHERE id = ? AND user_id = ?",
    [runId, userId],
  );
}

async function getAutomationStageRunRow(runId: number, userId: number, stageCode: string) {
  const db = getDatabase();
  return await db.queryOne<AutomationStageRunRow>(
    `SELECT s.*
     FROM article_automation_stage_runs s
     INNER JOIN article_automation_runs r ON r.id = s.run_id
     WHERE s.run_id = ? AND r.user_id = ? AND s.stage_code = ?`,
    [runId, userId, stageCode],
  );
}

function getResetStagePayload(stageCode: string) {
  const definition = PLAN22_STAGE_PROMPT_DEFINITIONS.find((item) => item.stageCode === stageCode);
  if (!definition) {
    throw new Error(`未知的自动化阶段：${stageCode}`);
  }
  return {
    inputJson: { requiredOutputFields: definition.requiredOutputFields },
    outputJson: {},
    qualityJson: {},
    searchTraceJson: {},
  };
}

export async function updateArticleAutomationRun(input: {
  runId: number;
  userId: number;
  articleId?: number | null;
  status?: ArticleAutomationRunStatus;
  currentStageCode?: string;
  finalWechatMediaId?: string | null;
  blockedReason?: string | null;
}) {
  const current = await getAutomationRunRow(input.runId, input.userId);
  if (!current) {
    return null;
  }
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.exec(
    `UPDATE article_automation_runs
     SET article_id = ?, status = ?, current_stage_code = ?, final_wechat_media_id = ?, blocked_reason = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      input.articleId === undefined ? current.article_id : input.articleId,
      input.status ?? current.status,
      input.currentStageCode ?? current.current_stage_code,
      input.finalWechatMediaId === undefined ? current.final_wechat_media_id : input.finalWechatMediaId,
      input.blockedReason === undefined ? current.blocked_reason : input.blockedReason,
      now,
      input.runId,
      input.userId,
    ],
  );
  return await getArticleAutomationRunById(input.runId, input.userId);
}

export async function resetArticleAutomationRunFromStage(input: {
  runId: number;
  userId: number;
  stageCode: string;
}) {
  const startStageIndex = PLAN22_STAGE_INDEX.get(input.stageCode);
  if (startStageIndex === undefined) {
    throw new Error("自动化阶段不存在");
  }

  const current = await getAutomationRunRow(input.runId, input.userId);
  if (!current) {
    return null;
  }

  const now = new Date().toISOString();
  const db = getDatabase();
  await db.transaction(async () => {
    await db.exec(
      `UPDATE article_automation_runs
       SET status = ?, current_stage_code = ?, final_wechat_media_id = ?, blocked_reason = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      ["queued", input.stageCode, null, null, now, input.runId, input.userId],
    );

    for (const definition of PLAN22_STAGE_PROMPT_DEFINITIONS.slice(startStageIndex)) {
      const payload = getResetStagePayload(definition.stageCode);
      await db.exec(
        `UPDATE article_automation_stage_runs
         SET provider = ?, model = ?, status = ?, input_json = ?, output_json = ?, quality_json = ?, search_trace_json = ?,
             error_code = ?, error_message = ?, started_at = ?, completed_at = ?, updated_at = ?
         WHERE run_id = ? AND stage_code = ?`,
        [
          null,
          null,
          "queued",
          stringifyJson(payload.inputJson),
          stringifyJson(payload.outputJson),
          stringifyJson(payload.qualityJson),
          stringifyJson(payload.searchTraceJson),
          null,
          null,
          null,
          null,
          now,
          input.runId,
          definition.stageCode,
        ],
      );
    }
  });

  return await getArticleAutomationRunById(input.runId, input.userId);
}

export async function updateArticleAutomationStageRun(input: {
  runId: number;
  userId: number;
  stageCode: string;
  articleId?: number | null;
  provider?: string | null;
  model?: string | null;
  status?: ArticleAutomationStageStatus;
  inputJson?: unknown;
  outputJson?: unknown;
  qualityJson?: unknown;
  searchTraceJson?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}) {
  const current = await getAutomationStageRunRow(input.runId, input.userId, input.stageCode);
  if (!current) {
    return null;
  }
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE article_automation_stage_runs
     SET article_id = ?, provider = ?, model = ?, status = ?, input_json = ?, output_json = ?, quality_json = ?, search_trace_json = ?,
         error_code = ?, error_message = ?, started_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.articleId === undefined ? current.article_id : input.articleId,
      input.provider === undefined ? current.provider : input.provider,
      input.model === undefined ? current.model : input.model,
      input.status ?? current.status,
      input.inputJson === undefined ? stringifyJson(parseJsonValue(current.input_json)) : stringifyJson(input.inputJson),
      input.outputJson === undefined ? stringifyJson(parseJsonValue(current.output_json)) : stringifyJson(input.outputJson),
      input.qualityJson === undefined ? stringifyJson(parseJsonValue(current.quality_json)) : stringifyJson(input.qualityJson),
      input.searchTraceJson === undefined
        ? stringifyJson(parseJsonValue(current.search_trace_json))
        : stringifyJson(input.searchTraceJson),
      input.errorCode === undefined ? current.error_code : input.errorCode,
      input.errorMessage === undefined ? current.error_message : input.errorMessage,
      input.startedAt === undefined ? current.started_at : input.startedAt,
      input.completedAt === undefined ? current.completed_at : input.completedAt,
      now,
      current.id,
    ],
  );
  return await getArticleAutomationRunById(input.runId, input.userId);
}

export async function startArticleAutomationStageRun(input: {
  runId: number;
  userId: number;
  stageCode: string;
  inputJson?: unknown;
  articleId?: number | null;
}) {
  const now = new Date().toISOString();
  return await updateArticleAutomationStageRun({
    runId: input.runId,
    userId: input.userId,
    stageCode: input.stageCode,
    articleId: input.articleId,
    status: "running",
    inputJson: input.inputJson ?? {},
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: null,
  });
}

export async function completeArticleAutomationStageRun(input: {
  runId: number;
  userId: number;
  stageCode: string;
  articleId?: number | null;
  provider?: string | null;
  model?: string | null;
  outputJson?: unknown;
  qualityJson?: unknown;
  searchTraceJson?: unknown;
}) {
  return await updateArticleAutomationStageRun({
    runId: input.runId,
    userId: input.userId,
    stageCode: input.stageCode,
    articleId: input.articleId,
    provider: input.provider,
    model: input.model,
    status: "completed",
    outputJson: input.outputJson ?? {},
    qualityJson: input.qualityJson ?? {},
    searchTraceJson: input.searchTraceJson ?? {},
    errorCode: null,
    errorMessage: null,
    completedAt: new Date().toISOString(),
  });
}

export async function failArticleAutomationStageRun(input: {
  runId: number;
  userId: number;
  stageCode: string;
  status?: Extract<ArticleAutomationStageStatus, "blocked" | "failed">;
  articleId?: number | null;
  provider?: string | null;
  model?: string | null;
  outputJson?: unknown;
  qualityJson?: unknown;
  searchTraceJson?: unknown;
  errorCode?: string | null;
  errorMessage: string;
}) {
  return await updateArticleAutomationStageRun({
    runId: input.runId,
    userId: input.userId,
    stageCode: input.stageCode,
    articleId: input.articleId,
    provider: input.provider,
    model: input.model,
    status: input.status ?? "failed",
    outputJson: input.outputJson ?? {},
    qualityJson: input.qualityJson ?? {},
    searchTraceJson: input.searchTraceJson ?? {},
    errorCode: input.errorCode ?? "automation_stage_failed",
    errorMessage: input.errorMessage,
    completedAt: new Date().toISOString(),
  });
}

export async function skipArticleAutomationStageRun(input: {
  runId: number;
  userId: number;
  stageCode: string;
  articleId?: number | null;
  outputJson?: unknown;
  qualityJson?: unknown;
  reason?: string | null;
}) {
  return await updateArticleAutomationStageRun({
    runId: input.runId,
    userId: input.userId,
    stageCode: input.stageCode,
    articleId: input.articleId,
    status: "skipped",
    outputJson: input.outputJson ?? {},
    qualityJson: input.qualityJson ?? { reason: input.reason ?? null },
    errorCode: null,
    errorMessage: input.reason ?? null,
    completedAt: new Date().toISOString(),
  });
}

export async function bindArticleToAutomationRun(input: {
  runId: number;
  userId: number;
  articleId: number;
}) {
  const now = new Date().toISOString();
  const db = getDatabase();
  await db.transaction(async () => {
    await db.exec(
      `UPDATE article_automation_runs
       SET article_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [input.articleId, now, input.runId, input.userId],
    );
    await db.exec(
      `UPDATE article_automation_stage_runs
       SET article_id = ?, updated_at = ?
       WHERE run_id = ?`,
      [input.articleId, now, input.runId],
    );
  });
  return await getArticleAutomationRunById(input.runId, input.userId);
}
