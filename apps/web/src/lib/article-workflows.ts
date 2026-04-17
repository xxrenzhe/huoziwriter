import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type ArticleWorkflowStageCode =
  | "topicRadar"
  | "researchBrief"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "deepWriting"
  | "factCheck"
  | "prosePolish"
  | "coverImage"
  | "layout"
  | "publish";

export type ArticleWorkflowStageStatus = "pending" | "current" | "completed" | "failed";

export type ArticleWorkflowStage = {
  code: ArticleWorkflowStageCode;
  title: string;
  status: ArticleWorkflowStageStatus;
};

export type ArticlePendingPublishIntent = {
  articleId: number;
  createdAt: string;
  templateId: string | null;
  reason: "missing_connection" | "auth_failed";
};

export type ArticleWorkflow = {
  articleId: number;
  currentStageCode: ArticleWorkflowStageCode;
  stages: ArticleWorkflowStage[];
  pendingPublishIntent: ArticlePendingPublishIntent | null;
  updatedAt: string;
};

const WORKFLOW_STAGE_CATALOG: Array<{ code: ArticleWorkflowStageCode; title: string }> = [
  { code: "topicRadar", title: "选题雷达" },
  { code: "researchBrief", title: "研究简报" },
  { code: "audienceAnalysis", title: "受众分析" },
  { code: "outlinePlanning", title: "大纲规划" },
  { code: "deepWriting", title: "深度写作" },
  { code: "factCheck", title: "事实核查" },
  { code: "prosePolish", title: "文笔润色" },
  { code: "coverImage", title: "配图生成" },
  { code: "layout", title: "一键排版" },
  { code: "publish", title: "一键发布" },
];

function areStagesEqual(left: ArticleWorkflowStage[], right: ArticleWorkflowStage[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((stage, index) => {
    const other = right[index];
    return stage.code === other?.code && stage.title === other?.title && stage.status === other?.status;
  });
}

type WorkflowRow = {
  id: number;
  article_id: number;
  current_stage_code: string;
  stages_json: string | ArticleWorkflowStage[];
  pending_publish_intent_json: string | ArticlePendingPublishIntent | null;
  created_at: string;
  updated_at: string;
};

function buildStages(currentStageCode: ArticleWorkflowStageCode, options?: { completedLastStage?: boolean; failedStageCode?: ArticleWorkflowStageCode | null }) {
  const currentIndex = WORKFLOW_STAGE_CATALOG.findIndex((item) => item.code === currentStageCode);
  return WORKFLOW_STAGE_CATALOG.map((stage, index) => {
    if (options?.failedStageCode === stage.code) {
      return { ...stage, status: "failed" } satisfies ArticleWorkflowStage;
    }
    if (options?.completedLastStage && index === currentIndex) {
      return { ...stage, status: "completed" } satisfies ArticleWorkflowStage;
    }
    if (index < currentIndex) {
      return { ...stage, status: "completed" } satisfies ArticleWorkflowStage;
    }
    if (index === currentIndex) {
      return { ...stage, status: "current" } satisfies ArticleWorkflowStage;
    }
    return { ...stage, status: "pending" } satisfies ArticleWorkflowStage;
  });
}

function normalizeStages(stages: ArticleWorkflowStage[], fallbackStageCode: ArticleWorkflowStageCode) {
  const failedStage = stages.find((stage) => stage.status === "failed")?.code ?? null;
  const hasCurrentStage = stages.some((stage) => stage.status === "current");
  const currentStageWasCompleted = stages.find((stage) => stage.code === fallbackStageCode)?.status === "completed";
  return buildStages(fallbackStageCode, {
    failedStageCode: failedStage,
    completedLastStage: !hasCurrentStage && currentStageWasCompleted,
  });
}

function parseStages(value: string | ArticleWorkflowStage[] | null | undefined, fallbackStageCode: ArticleWorkflowStageCode) {
  if (!value) {
    return buildStages(fallbackStageCode);
  }
  if (Array.isArray(value)) {
    return normalizeStages(value, fallbackStageCode);
  }
  try {
    const parsed = JSON.parse(value) as ArticleWorkflowStage[];
    return Array.isArray(parsed) && parsed.length > 0 ? normalizeStages(parsed, fallbackStageCode) : buildStages(fallbackStageCode);
  } catch {
    return buildStages(fallbackStageCode);
  }
}

function parsePendingPublishIntent(value: string | ArticlePendingPublishIntent | null | undefined, articleId: number) {
  if (!value) {
    return null;
  }
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as ArticlePendingPublishIntent;
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return {
    articleId,
    createdAt: String(parsed.createdAt || new Date().toISOString()),
    templateId: parsed.templateId ? String(parsed.templateId) : null,
    reason: String(parsed.reason || "") === "missing_connection" ? "missing_connection" : "auth_failed",
  } satisfies ArticlePendingPublishIntent;
}

async function ensureArticleAccess(articleId: number, userId?: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ id: number }>(
    userId == null ? "SELECT id FROM documents WHERE id = ?" : "SELECT id FROM documents WHERE id = ? AND user_id = ?",
    userId == null ? [articleId] : [articleId, userId],
  );
  if (!row) {
    throw new Error("稿件不存在");
  }
}

async function upsertWorkflow(articleId: number, currentStageCode: ArticleWorkflowStageCode, stages: ArticleWorkflowStage[]) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM document_workflows WHERE document_id = ?",
    [articleId],
  );
  if (!existing) {
    await db.exec(
      `INSERT INTO document_workflows (document_id, current_stage_code, stages_json, pending_publish_intent_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [articleId, currentStageCode, JSON.stringify(stages), null, now, now],
    );
    return;
  }
  await db.exec(
    `UPDATE document_workflows
     SET current_stage_code = ?, stages_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [currentStageCode, JSON.stringify(stages), now, articleId],
  );
}

export async function ensureArticleWorkflow(articleId: number, initialStageCode: ArticleWorkflowStageCode = "topicRadar") {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const existing = await db.queryOne<WorkflowRow>(
    `SELECT id, document_id AS article_id, current_stage_code, stages_json, pending_publish_intent_json, created_at, updated_at
     FROM document_workflows
     WHERE document_id = ?`,
    [articleId],
  );
  if (existing) {
    const normalizedStages = parseStages(existing.stages_json, existing.current_stage_code as ArticleWorkflowStageCode);
    const parsedStages = Array.isArray(existing.stages_json)
      ? existing.stages_json
      : (() => {
          try {
            const parsed = JSON.parse(String(existing.stages_json || "null")) as ArticleWorkflowStage[] | null;
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })();
    if (!parsedStages || !areStagesEqual(parsedStages, normalizedStages)) {
      await upsertWorkflow(articleId, existing.current_stage_code as ArticleWorkflowStageCode, normalizedStages);
    }
    return {
      articleId: existing.article_id,
      currentStageCode: existing.current_stage_code as ArticleWorkflowStageCode,
      stages: normalizedStages,
      pendingPublishIntent: parsePendingPublishIntent(existing.pending_publish_intent_json, existing.article_id),
      updatedAt: existing.updated_at,
    };
  }

  const stages = buildStages(initialStageCode);
  await upsertWorkflow(articleId, initialStageCode, stages);
  const created = await db.queryOne<WorkflowRow>(
    `SELECT id, document_id AS article_id, current_stage_code, stages_json, pending_publish_intent_json, created_at, updated_at
     FROM document_workflows
     WHERE document_id = ?`,
    [articleId],
  );
  return {
    articleId,
    currentStageCode: initialStageCode,
    stages,
    pendingPublishIntent: null,
    updatedAt: created?.updated_at ?? new Date().toISOString(),
  };
}

export async function getArticleWorkflow(articleId: number, userId?: number) {
  await ensureArticleAccess(articleId, userId);
  const workflow = await ensureArticleWorkflow(articleId);
  return workflow;
}

export async function setArticleWorkflowCurrentStage(input: {
  articleId: number;
  userId: number;
  stageCode: ArticleWorkflowStageCode;
}) {
  await ensureArticleAccess(input.articleId, input.userId);
  const stages = buildStages(input.stageCode);
  await upsertWorkflow(input.articleId, input.stageCode, stages);
  return getArticleWorkflow(input.articleId, input.userId);
}

export async function completeArticleWorkflowStage(input: {
  articleId: number;
  userId: number;
  stageCode: ArticleWorkflowStageCode;
}) {
  await ensureArticleAccess(input.articleId, input.userId);
  const currentIndex = WORKFLOW_STAGE_CATALOG.findIndex((item) => item.code === input.stageCode);
  const next = WORKFLOW_STAGE_CATALOG[currentIndex + 1];
  if (!next) {
    const stages = buildStages(input.stageCode, { completedLastStage: true });
    await upsertWorkflow(input.articleId, input.stageCode, stages.map((stage) => (
      stage.code === input.stageCode ? { ...stage, status: "completed" } : stage
    )));
    return getArticleWorkflow(input.articleId, input.userId);
  }
  const stages = buildStages(next.code);
  await upsertWorkflow(input.articleId, next.code, stages);
  return getArticleWorkflow(input.articleId, input.userId);
}

export async function failArticleWorkflowStage(input: {
  articleId: number;
  userId: number;
  stageCode: ArticleWorkflowStageCode;
}) {
  await ensureArticleAccess(input.articleId, input.userId);
  const stages = buildStages(input.stageCode, { failedStageCode: input.stageCode });
  await upsertWorkflow(input.articleId, input.stageCode, stages);
  return getArticleWorkflow(input.articleId, input.userId);
}

export async function setArticleWorkflowPendingPublishIntent(input: {
  articleId: number;
  userId: number;
  intent: { createdAt?: string | null; templateId?: string | null; reason?: string | null };
}) {
  await ensureArticleAccess(input.articleId, input.userId);
  await ensureArticleWorkflow(input.articleId);
  const db = getDatabase();
  const nextIntent = {
    articleId: input.articleId,
    createdAt: String(input.intent.createdAt || new Date().toISOString()),
    templateId: input.intent.templateId ? String(input.intent.templateId) : null,
    reason: String(input.intent.reason || "") === "missing_connection" ? "missing_connection" : "auth_failed",
  } satisfies ArticlePendingPublishIntent;
  await db.exec(
    `UPDATE document_workflows
     SET pending_publish_intent_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [nextIntent, new Date().toISOString(), input.articleId],
  );
  return getArticleWorkflow(input.articleId, input.userId);
}

export async function clearArticleWorkflowPendingPublishIntent(input: {
  articleId: number;
  userId: number;
}) {
  await ensureArticleAccess(input.articleId, input.userId);
  await ensureArticleWorkflow(input.articleId);
  const db = getDatabase();
  await db.exec(
    `UPDATE document_workflows
     SET pending_publish_intent_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [null, new Date().toISOString(), input.articleId],
  );
  return getArticleWorkflow(input.articleId, input.userId);
}
