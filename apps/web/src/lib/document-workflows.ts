import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

export type DocumentWorkflowStageCode =
  | "topicRadar"
  | "audienceAnalysis"
  | "outlinePlanning"
  | "deepWriting"
  | "factCheck"
  | "prosePolish"
  | "coverImage"
  | "layout"
  | "publish";

export type DocumentWorkflowStageStatus = "pending" | "current" | "completed" | "failed";

export type DocumentWorkflowStage = {
  code: DocumentWorkflowStageCode;
  title: string;
  status: DocumentWorkflowStageStatus;
};

export type PendingPublishIntent = {
  documentId: number;
  createdAt: string;
  templateId: string | null;
};

const WORKFLOW_STAGE_CATALOG: Array<{ code: DocumentWorkflowStageCode; title: string }> = [
  { code: "topicRadar", title: "选题雷达" },
  { code: "audienceAnalysis", title: "受众分析" },
  { code: "outlinePlanning", title: "大纲规划" },
  { code: "deepWriting", title: "深度写作" },
  { code: "factCheck", title: "事实核查" },
  { code: "prosePolish", title: "文笔润色" },
  { code: "coverImage", title: "配图生成" },
  { code: "layout", title: "一键排版" },
  { code: "publish", title: "一键发布" },
];

type WorkflowRow = {
  id: number;
  document_id: number;
  current_stage_code: string;
  stages_json: string | DocumentWorkflowStage[];
  pending_publish_intent_json: string | PendingPublishIntent | null;
  created_at: string;
  updated_at: string;
};

function buildStages(currentStageCode: DocumentWorkflowStageCode, options?: { completedLastStage?: boolean; failedStageCode?: DocumentWorkflowStageCode | null }) {
  const currentIndex = WORKFLOW_STAGE_CATALOG.findIndex((item) => item.code === currentStageCode);
  return WORKFLOW_STAGE_CATALOG.map((stage, index) => {
    if (options?.failedStageCode === stage.code) {
      return { ...stage, status: "failed" } satisfies DocumentWorkflowStage;
    }
    if (options?.completedLastStage && index === currentIndex) {
      return { ...stage, status: "completed" } satisfies DocumentWorkflowStage;
    }
    if (index < currentIndex) {
      return { ...stage, status: "completed" } satisfies DocumentWorkflowStage;
    }
    if (index === currentIndex) {
      return { ...stage, status: "current" } satisfies DocumentWorkflowStage;
    }
    return { ...stage, status: "pending" } satisfies DocumentWorkflowStage;
  });
}

function parseStages(value: string | DocumentWorkflowStage[] | null | undefined, fallbackStageCode: DocumentWorkflowStageCode) {
  if (!value) {
    return buildStages(fallbackStageCode);
  }
  if (Array.isArray(value)) {
    return value;
  }
  try {
    const parsed = JSON.parse(value) as DocumentWorkflowStage[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : buildStages(fallbackStageCode);
  } catch {
    return buildStages(fallbackStageCode);
  }
}

function parsePendingPublishIntent(value: string | PendingPublishIntent | null | undefined, documentId: number) {
  if (!value) {
    return null;
  }
  const parsed =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as PendingPublishIntent;
          } catch {
            return null;
          }
        })()
      : value;
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  return {
    documentId,
    createdAt: String(parsed.createdAt || new Date().toISOString()),
    templateId: parsed.templateId ? String(parsed.templateId) : null,
  } satisfies PendingPublishIntent;
}

async function ensureDocumentAccess(documentId: number, userId?: number) {
  const db = getDatabase();
  const row = await db.queryOne<{ id: number }>(
    userId == null ? "SELECT id FROM documents WHERE id = ?" : "SELECT id FROM documents WHERE id = ? AND user_id = ?",
    userId == null ? [documentId] : [documentId, userId],
  );
  if (!row) {
    throw new Error("文稿不存在");
  }
}

async function upsertWorkflow(documentId: number, currentStageCode: DocumentWorkflowStageCode, stages: DocumentWorkflowStage[]) {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: number }>(
    "SELECT id FROM document_workflows WHERE document_id = ?",
    [documentId],
  );
  if (!existing) {
    await db.exec(
      `INSERT INTO document_workflows (document_id, current_stage_code, stages_json, pending_publish_intent_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [documentId, currentStageCode, JSON.stringify(stages), null, now, now],
    );
    return;
  }
  await db.exec(
    `UPDATE document_workflows
     SET current_stage_code = ?, stages_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [currentStageCode, JSON.stringify(stages), now, documentId],
  );
}

export async function ensureDocumentWorkflow(documentId: number, initialStageCode: DocumentWorkflowStageCode = "topicRadar") {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const existing = await db.queryOne<WorkflowRow>(
    "SELECT * FROM document_workflows WHERE document_id = ?",
    [documentId],
  );
  if (existing) {
    return {
      documentId: existing.document_id,
      currentStageCode: existing.current_stage_code as DocumentWorkflowStageCode,
      stages: parseStages(existing.stages_json, existing.current_stage_code as DocumentWorkflowStageCode),
      pendingPublishIntent: parsePendingPublishIntent(existing.pending_publish_intent_json, existing.document_id),
      updatedAt: existing.updated_at,
    };
  }

  const stages = buildStages(initialStageCode);
  await upsertWorkflow(documentId, initialStageCode, stages);
  const created = await db.queryOne<WorkflowRow>(
    "SELECT * FROM document_workflows WHERE document_id = ?",
    [documentId],
  );
  return {
    documentId,
    currentStageCode: initialStageCode,
    stages,
    pendingPublishIntent: null,
    updatedAt: created?.updated_at ?? new Date().toISOString(),
  };
}

export async function getDocumentWorkflow(documentId: number, userId?: number) {
  await ensureDocumentAccess(documentId, userId);
  const workflow = await ensureDocumentWorkflow(documentId);
  return workflow;
}

export async function setDocumentWorkflowCurrentStage(input: {
  documentId: number;
  userId: number;
  stageCode: DocumentWorkflowStageCode;
}) {
  await ensureDocumentAccess(input.documentId, input.userId);
  const stages = buildStages(input.stageCode);
  await upsertWorkflow(input.documentId, input.stageCode, stages);
  return getDocumentWorkflow(input.documentId, input.userId);
}

export async function completeDocumentWorkflowStage(input: {
  documentId: number;
  userId: number;
  stageCode: DocumentWorkflowStageCode;
}) {
  await ensureDocumentAccess(input.documentId, input.userId);
  const currentIndex = WORKFLOW_STAGE_CATALOG.findIndex((item) => item.code === input.stageCode);
  const next = WORKFLOW_STAGE_CATALOG[currentIndex + 1];
  if (!next) {
    const stages = buildStages(input.stageCode, { completedLastStage: true });
    await upsertWorkflow(input.documentId, input.stageCode, stages.map((stage) => (
      stage.code === input.stageCode ? { ...stage, status: "completed" } : stage
    )));
    return getDocumentWorkflow(input.documentId, input.userId);
  }
  const stages = buildStages(next.code);
  await upsertWorkflow(input.documentId, next.code, stages);
  return getDocumentWorkflow(input.documentId, input.userId);
}

export async function failDocumentWorkflowStage(input: {
  documentId: number;
  userId: number;
  stageCode: DocumentWorkflowStageCode;
}) {
  await ensureDocumentAccess(input.documentId, input.userId);
  const stages = buildStages(input.stageCode, { failedStageCode: input.stageCode });
  await upsertWorkflow(input.documentId, input.stageCode, stages);
  return getDocumentWorkflow(input.documentId, input.userId);
}

export async function setDocumentWorkflowPendingPublishIntent(input: {
  documentId: number;
  userId: number;
  intent: { createdAt?: string | null; templateId?: string | null };
}) {
  await ensureDocumentAccess(input.documentId, input.userId);
  await ensureDocumentWorkflow(input.documentId);
  const db = getDatabase();
  const nextIntent = {
    documentId: input.documentId,
    createdAt: String(input.intent.createdAt || new Date().toISOString()),
    templateId: input.intent.templateId ? String(input.intent.templateId) : null,
  } satisfies PendingPublishIntent;
  await db.exec(
    `UPDATE document_workflows
     SET pending_publish_intent_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [nextIntent, new Date().toISOString(), input.documentId],
  );
  return getDocumentWorkflow(input.documentId, input.userId);
}

export async function clearDocumentWorkflowPendingPublishIntent(input: {
  documentId: number;
  userId: number;
}) {
  await ensureDocumentAccess(input.documentId, input.userId);
  await ensureDocumentWorkflow(input.documentId);
  const db = getDatabase();
  await db.exec(
    `UPDATE document_workflows
     SET pending_publish_intent_json = ?, updated_at = ?
     WHERE document_id = ?`,
    [null, new Date().toISOString(), input.documentId],
  );
  return getDocumentWorkflow(input.documentId, input.userId);
}
