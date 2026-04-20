import { getDatabase } from "./db";
import { assertTopicSourceManageAllowed } from "./plan-access";
import { decryptSecret, encryptSecret } from "./security";
import { ensureExtendedProductSchema } from "./schema-bootstrap";
import {
  ImaApiError,
  type ImaCreds,
  type ImaKnowledgeBaseSummary,
  listKnowledgeBases,
} from "./ima-client";

type ImaConnectionRow = {
  id: number;
  user_id: number;
  label: string;
  client_id_encrypted: string;
  api_key_encrypted: string;
  status: string;
  last_verified_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

type ImaKnowledgeBaseRow = {
  id: number;
  user_id: number;
  connection_id: number;
  kb_id: string;
  kb_name: string;
  description: string | null;
  content_count: number | null;
  is_enabled: number | boolean;
  is_default: number | boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ImaKnowledgeBaseRecord = {
  id: number;
  connectionId: number;
  kbId: string;
  kbName: string;
  description: string | null;
  contentCount: number | null;
  isEnabled: boolean;
  isDefault: boolean;
  lastSyncedAt: string | null;
};

export type ImaConnectionRecord = {
  id: number;
  label: string;
  status: string;
  lastVerifiedAt: string | null;
  lastError: string | null;
  knowledgeBases: ImaKnowledgeBaseRecord[];
};

function nowIso() {
  return new Date().toISOString();
}

function mapKnowledgeBaseRow(row: ImaKnowledgeBaseRow): ImaKnowledgeBaseRecord {
  return {
    id: row.id,
    connectionId: row.connection_id,
    kbId: row.kb_id,
    kbName: row.kb_name,
    description: row.description,
    contentCount: typeof row.content_count === "number" ? row.content_count : null,
    isEnabled: Boolean(row.is_enabled),
    isDefault: Boolean(row.is_default),
    lastSyncedAt: row.last_synced_at,
  };
}

function decryptConnectionCreds(row: Pick<ImaConnectionRow, "client_id_encrypted" | "api_key_encrypted">): ImaCreds {
  const clientId = decryptSecret(row.client_id_encrypted);
  const apiKey = decryptSecret(row.api_key_encrypted);
  if (!clientId || !apiKey) {
    throw new Error("IMA 凭证解密失败，请重新绑定");
  }
  return {
    clientId,
    apiKey,
  };
}

async function getConnectionRow(id: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  return await db.queryOne<ImaConnectionRow>(
    `SELECT id, user_id, label, client_id_encrypted, api_key_encrypted, status, last_verified_at, last_error, created_at, updated_at
     FROM ima_connections
     WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
}

async function setConnectionStatus(input: {
  connectionId: number;
  userId: number;
  status: string;
  lastError?: string | null;
  verified?: boolean;
}) {
  const db = getDatabase();
  const now = nowIso();
  await db.exec(
    `UPDATE ima_connections
     SET status = ?, last_error = ?, last_verified_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [input.status, input.lastError ?? null, input.verified ? now : null, now, input.connectionId, input.userId],
  );
}

async function ensureSingleDefaultKb(userId: number, kbRowId: number) {
  const db = getDatabase();
  const now = nowIso();
  await db.exec("UPDATE ima_knowledge_bases SET is_default = ?, updated_at = ? WHERE user_id = ?", [false, now, userId]);
  await db.exec(
    "UPDATE ima_knowledge_bases SET is_default = ?, is_enabled = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    [true, true, now, kbRowId, userId],
  );
}

async function upsertKnowledgeBases(input: {
  userId: number;
  connectionId: number;
  knowledgeBases: ImaKnowledgeBaseSummary[];
}) {
  const db = getDatabase();
  const now = nowIso();
  const incomingIds = new Set<string>();

  for (const kb of input.knowledgeBases) {
    incomingIds.add(kb.kbId);
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM ima_knowledge_bases
       WHERE user_id = ? AND connection_id = ? AND kb_id = ?`,
      [input.userId, input.connectionId, kb.kbId],
    );
    if (existing) {
      await db.exec(
        `UPDATE ima_knowledge_bases
         SET kb_name = ?, description = ?, content_count = ?, last_synced_at = ?, updated_at = ?
         WHERE id = ?`,
        [kb.kbName, kb.description, kb.contentCount, now, now, existing.id],
      );
      continue;
    }
    await db.exec(
      `INSERT INTO ima_knowledge_bases (
        user_id, connection_id, kb_id, kb_name, description, content_count, is_enabled, is_default, last_synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.userId, input.connectionId, kb.kbId, kb.kbName, kb.description, kb.contentCount, true, false, now, now, now],
    );
  }

  const rows = await db.query<ImaKnowledgeBaseRow>(
    `SELECT id, user_id, connection_id, kb_id, kb_name, description, content_count, is_enabled, is_default, last_synced_at, created_at, updated_at
     FROM ima_knowledge_bases
     WHERE user_id = ? AND connection_id = ?
     ORDER BY updated_at DESC, id DESC`,
    [input.userId, input.connectionId],
  );

  for (const row of rows) {
    if (!incomingIds.has(row.kb_id)) {
      await db.exec(
        `UPDATE ima_knowledge_bases
         SET is_enabled = ?, is_default = ?, updated_at = ?
         WHERE id = ?`,
        [false, false, now, row.id],
      );
    }
  }

  const enabledRows = rows.filter((row) => incomingIds.has(row.kb_id));
  const hasEnabledDefault = enabledRows.some((row) => Boolean(row.is_enabled) && Boolean(row.is_default));
  if (!hasEnabledDefault && enabledRows[0]) {
    await ensureSingleDefaultKb(input.userId, enabledRows[0].id);
  }
}

export async function listImaConnections(userId: number): Promise<ImaConnectionRecord[]> {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const [connections, knowledgeBases] = await Promise.all([
    db.query<ImaConnectionRow>(
      `SELECT id, user_id, label, client_id_encrypted, api_key_encrypted, status, last_verified_at, last_error, created_at, updated_at
       FROM ima_connections
       WHERE user_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [userId],
    ),
    db.query<ImaKnowledgeBaseRow>(
      `SELECT id, user_id, connection_id, kb_id, kb_name, description, content_count, is_enabled, is_default, last_synced_at, created_at, updated_at
       FROM ima_knowledge_bases
       WHERE user_id = ?
       ORDER BY is_default DESC, is_enabled DESC, updated_at DESC, id DESC`,
      [userId],
    ),
  ]);

  const knowledgeBaseMap = new Map<number, ImaKnowledgeBaseRecord[]>();
  for (const row of knowledgeBases) {
    const current = knowledgeBaseMap.get(row.connection_id) ?? [];
    current.push(mapKnowledgeBaseRow(row));
    knowledgeBaseMap.set(row.connection_id, current);
  }

  return connections.map((connection) => ({
    id: connection.id,
    label: connection.label,
    status: connection.status,
    lastVerifiedAt: connection.last_verified_at,
    lastError: connection.last_error,
    knowledgeBases: knowledgeBaseMap.get(connection.id) ?? [],
  }));
}

export async function createImaConnection(input: {
  userId: number;
  label: string;
  clientId: string;
  apiKey: string;
}) {
  await assertTopicSourceManageAllowed(input.userId);
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const now = nowIso();
  const result = await db.exec(
    `INSERT INTO ima_connections (
      user_id, label, client_id_encrypted, api_key_encrypted, status, last_verified_at, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.label.trim(),
      encryptSecret(input.clientId.trim()),
      encryptSecret(input.apiKey.trim()),
      "valid",
      now,
      null,
      now,
      now,
    ],
  );
  const connectionId = Number(result.lastInsertRowid);
  if (!Number.isFinite(connectionId) || connectionId <= 0) {
    throw new Error("IMA 连接创建失败");
  }

  try {
    const knowledgeBases = await listKnowledgeBases({
      clientId: input.clientId.trim(),
      apiKey: input.apiKey.trim(),
    });
    await upsertKnowledgeBases({
      userId: input.userId,
      connectionId,
      knowledgeBases,
    });
    await setConnectionStatus({
      connectionId,
      userId: input.userId,
      status: "valid",
      lastError: null,
      verified: true,
    });
    return {
      connectionId,
      status: "valid" as const,
      knowledgeBases: (await listImaConnections(input.userId)).find((item) => item.id === connectionId)?.knowledgeBases ?? [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMA 凭证校验失败";
    await setConnectionStatus({
      connectionId,
      userId: input.userId,
      status: "invalid",
      lastError: message,
      verified: false,
    });
    return {
      connectionId,
      status: "invalid" as const,
      error: message,
      knowledgeBases: [] as ImaKnowledgeBaseRecord[],
    };
  }
}

export async function deleteImaConnection(id: number, userId: number) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  await db.transaction(async () => {
    await db.exec("DELETE FROM ima_knowledge_bases WHERE connection_id = ? AND user_id = ?", [id, userId]);
    await db.exec("DELETE FROM ima_connections WHERE id = ? AND user_id = ?", [id, userId]);
  });
}

export async function refreshKnowledgeBases(connectionId: number, userId: number) {
  const connection = await getConnectionRow(connectionId, userId);
  if (!connection) {
    throw new Error("IMA 连接不存在");
  }

  try {
    const knowledgeBases = await listKnowledgeBases(decryptConnectionCreds(connection));
    await upsertKnowledgeBases({
      userId,
      connectionId,
      knowledgeBases,
    });
    await setConnectionStatus({
      connectionId,
      userId,
      status: "valid",
      lastError: null,
      verified: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "IMA 知识库刷新失败";
    await setConnectionStatus({
      connectionId,
      userId,
      status: "invalid",
      lastError: message,
      verified: false,
    });
    throw error instanceof Error ? error : new Error(message);
  }

  return (await listImaConnections(userId)).find((item) => item.id === connectionId)?.knowledgeBases ?? [];
}

export async function updateImaKnowledgeBase(input: {
  userId: number;
  connectionId?: number;
  kbRowId: number;
  isEnabled?: boolean;
  isDefault?: boolean;
}) {
  await ensureExtendedProductSchema();
  const db = getDatabase();
  const row = await db.queryOne<ImaKnowledgeBaseRow>(
    `SELECT id, user_id, connection_id, kb_id, kb_name, description, content_count, is_enabled, is_default, last_synced_at, created_at, updated_at
     FROM ima_knowledge_bases
     WHERE id = ? AND user_id = ?`,
    [input.kbRowId, input.userId],
  );
  if (!row) {
    throw new Error("知识库不存在");
  }
  if (Number.isFinite(input.connectionId) && Number(input.connectionId) > 0 && row.connection_id !== input.connectionId) {
    throw new Error("知识库与当前连接不匹配");
  }

  const now = nowIso();
  if (typeof input.isEnabled === "boolean") {
    await db.exec(
      `UPDATE ima_knowledge_bases
       SET is_enabled = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [input.isEnabled, now, input.kbRowId, input.userId],
    );
    if (!input.isEnabled && row.is_default) {
      await db.exec("UPDATE ima_knowledge_bases SET is_default = ?, updated_at = ? WHERE id = ?", [false, now, input.kbRowId]);
      const fallback = await db.queryOne<{ id: number }>(
        `SELECT id
         FROM ima_knowledge_bases
         WHERE user_id = ? AND id != ? AND is_enabled = ?
         ORDER BY updated_at DESC, id DESC
         LIMIT 1`,
        [input.userId, input.kbRowId, true],
      );
      if (fallback?.id) {
        await ensureSingleDefaultKb(input.userId, fallback.id);
      }
    }
  }

  if (input.isDefault) {
    await ensureSingleDefaultKb(input.userId, input.kbRowId);
  }
}

export async function markImaConnectionInvalid(input: {
  userId: number;
  connectionId: number;
  error: string;
}) {
  await setConnectionStatus({
    connectionId: input.connectionId,
    userId: input.userId,
    status: "invalid",
    lastError: input.error,
    verified: false,
  });
}

export async function getActiveImaContext(userId: number, options?: { preferredKbId?: string | null }) {
  const connections = await listImaConnections(userId);
  const preferredKbId = String(options?.preferredKbId || "").trim();
  const validConnections = connections.filter((item) => item.status === "valid");
  if (validConnections.length === 0) {
    throw new Error("还没有可用的 IMA 连接，请先去设置完成绑定");
  }

  const connection = validConnections.find((item) =>
    item.knowledgeBases.some((kb) => kb.isEnabled && kb.kbId === preferredKbId),
  ) ?? validConnections.find((item) => item.knowledgeBases.some((kb) => kb.isEnabled && kb.isDefault))
    ?? validConnections.find((item) => item.knowledgeBases.some((kb) => kb.isEnabled));
  if (!connection) {
    throw new Error("当前没有启用中的 IMA 知识库，请先去设置启用至少一个知识库");
  }

  const kb = connection.knowledgeBases.find((item) => item.isEnabled && item.kbId === preferredKbId)
    ?? connection.knowledgeBases.find((item) => item.isEnabled && item.isDefault)
    ?? connection.knowledgeBases.find((item) => item.isEnabled);
  if (!kb) {
    throw new Error("当前没有启用中的 IMA 知识库，请先去设置启用至少一个知识库");
  }

  const row = await getConnectionRow(connection.id, userId);
  if (!row) {
    throw new Error("IMA 连接不存在");
  }

  return {
    connectionId: row.id,
    creds: decryptConnectionCreds(row),
    kbId: kb.kbId,
    kbName: kb.kbName,
  };
}

export function normalizeImaError(error: unknown) {
  if (error instanceof ImaApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "IMA 调用失败";
}
