import { getDatabase } from "./db";
import { ensureExtendedProductSchema } from "./schema-bootstrap";

type DbAuditLogRow = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload_json: string | Record<string, unknown> | null;
  created_at: string;
};

export type AdminAuditLogItem = {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

function parsePayload(value: string | Record<string, unknown> | null) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value } satisfies Record<string, unknown>;
    }
  }
  return value;
}

export async function appendAuditLog(input: {
  userId?: number | null;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  payload?: unknown;
}) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO audit_logs (user_id, action, target_type, target_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.userId ?? null,
      input.action,
      input.targetType,
      input.targetId != null ? String(input.targetId) : null,
      input.payload ?? null,
      new Date().toISOString(),
    ],
  );
}

export async function getAdminAuditLogs(input: {
  query?: string;
  action?: string;
  targetType?: string;
  limit?: number;
} = {}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (input.action?.trim()) {
    conditions.push("a.action = ?");
    params.push(input.action.trim());
  }

  if (input.targetType?.trim()) {
    conditions.push("a.target_type = ?");
    params.push(input.targetType.trim());
  }

  if (input.query?.trim()) {
    const keyword = `%${input.query.trim()}%`;
    conditions.push("(a.action LIKE ? OR a.target_type LIKE ? OR a.target_id LIKE ? OR a.payload_json LIKE ? OR u.username LIKE ?)");
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(input.limit ?? 120), 1), 300);

  const rows = await db.query<DbAuditLogRow>(
    `SELECT
       a.id,
       a.user_id,
       u.username,
       a.action,
       a.target_type,
       a.target_id,
       a.payload_json,
       a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereClause}
     ORDER BY a.id DESC
     LIMIT ${limit}`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    payload: parsePayload(row.payload_json),
    createdAt: row.created_at,
  })) satisfies AdminAuditLogItem[];
}

export async function getWritingEvalRolloutAuditLogs(limit = 180) {
  const [rolloutAuditLogs, promptRolloutAuditLogs] = await Promise.all([
    getAdminAuditLogs({
      action: "writing_asset_rollout_auto_manage",
      targetType: "writing_asset_rollout",
      limit,
    }),
    getAdminAuditLogs({
      action: "prompt_rollout_auto_manage",
      targetType: "prompt_version",
      limit,
    }),
  ]);

  const combinedRolloutAuditLogs = [...promptRolloutAuditLogs, ...rolloutAuditLogs].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );

  return {
    rolloutAuditLogs,
    promptRolloutAuditLogs,
    combinedRolloutAuditLogs,
  };
}

export async function getAdminAuditFilterOptions() {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [actions, targetTypes] = await Promise.all([
    db.query<{ action: string }>("SELECT DISTINCT action FROM audit_logs ORDER BY action ASC"),
    db.query<{ target_type: string }>("SELECT DISTINCT target_type FROM audit_logs ORDER BY target_type ASC"),
  ]);

  return {
    actions: actions.map((item) => item.action),
    targetTypes: targetTypes.map((item) => item.target_type),
  };
}
