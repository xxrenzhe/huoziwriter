import { getDatabase } from "./db";

const DEFAULT_NODE_TITLES = ["痛点引入", "核心反转", "底层原因", "行动建议"];

function mapNodeRecord(node: {
  id: number;
  document_id: number;
  parent_node_id: number | null;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: node.id,
    documentId: node.document_id,
    parentNodeId: node.parent_node_id,
    title: node.title,
    description: node.description,
    sortOrder: node.sort_order,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  };
}

export async function getDocumentNodes(documentId: number) {
  const db = getDatabase();
  const nodes = await db.query<{
    id: number;
    document_id: number;
    parent_node_id: number | null;
    title: string;
    description: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM document_nodes WHERE document_id = ? ORDER BY sort_order ASC, id ASC", [documentId]);

  const refs = await db.query<{
    document_node_id: number;
    fragment_id: number;
    user_id: number;
    distilled_content: string;
  }>(
    `SELECT r.document_node_id, f.id as fragment_id, f.user_id, f.distilled_content
     FROM document_fragment_refs r
     INNER JOIN fragments f ON f.id = r.fragment_id
     WHERE r.document_id = ?
     ORDER BY r.id ASC`,
    [documentId],
  );

  return nodes.map((node) => ({
    ...mapNodeRecord(node),
    fragments: refs
      .filter((ref) => ref.document_node_id === node.id)
      .map((ref) => ({ id: ref.fragment_id, userId: ref.user_id, distilledContent: ref.distilled_content })),
  }));
}

export async function ensureDefaultDocumentNodes(documentId: number) {
  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM document_nodes WHERE document_id = ?", [documentId]);
  if ((count?.count ?? 0) > 0) {
    return;
  }

  for (const [index, title] of DEFAULT_NODE_TITLES.entries()) {
    await db.exec(
      `INSERT INTO document_nodes (document_id, parent_node_id, title, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [documentId, null, title, null, index + 1, new Date().toISOString(), new Date().toISOString()],
    );
  }
}

export async function createDocumentNode(input: {
  documentId: number;
  title: string;
  description?: string | null;
}) {
  const db = getDatabase();
  const maxSort = await db.queryOne<{ max_sort: number | null }>(
    "SELECT MAX(sort_order) as max_sort FROM document_nodes WHERE document_id = ?",
    [input.documentId],
  );
  const result = await db.exec(
    `INSERT INTO document_nodes (document_id, parent_node_id, title, description, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.documentId,
      null,
      input.title,
      input.description ?? null,
      (maxSort?.max_sort ?? 0) + 1,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  const inserted = await db.queryOne<{
    id: number;
    document_id: number;
    parent_node_id: number | null;
    title: string;
    description: string | null;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM document_nodes WHERE id = ?", [result.lastInsertRowid!]);
  return inserted ? mapNodeRecord(inserted) : undefined;
}

export async function updateDocumentNode(input: {
  nodeId: number;
  documentId: number;
  title?: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const db = getDatabase();
  const current = await db.queryOne<{ title: string; description: string | null; sort_order: number }>(
    "SELECT title, description, sort_order FROM document_nodes WHERE id = ? AND document_id = ?",
    [input.nodeId, input.documentId],
  );
  if (!current) {
    throw new Error("节点不存在");
  }
  await db.exec(
    `UPDATE document_nodes
     SET title = ?, description = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND document_id = ?`,
    [
      input.title ?? current.title,
      input.description ?? current.description,
      input.sortOrder ?? current.sort_order,
      new Date().toISOString(),
      input.nodeId,
      input.documentId,
    ],
  );
}

export async function reorderDocumentNodes(documentId: number, nodeIds: number[]) {
  for (const [index, nodeId] of nodeIds.entries()) {
    await updateDocumentNode({ documentId, nodeId, sortOrder: index + 1 });
  }
}

export async function deleteDocumentNode(documentId: number, nodeId: number) {
  const db = getDatabase();
  await db.exec("DELETE FROM document_fragment_refs WHERE document_id = ? AND document_node_id = ?", [documentId, nodeId]);
  await db.exec("DELETE FROM document_nodes WHERE document_id = ? AND id = ?", [documentId, nodeId]);
}

export async function attachFragmentToNode(input: {
  documentId: number;
  nodeId: number;
  fragmentId: number;
}) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO document_fragment_refs (document_id, document_node_id, fragment_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [input.documentId, input.nodeId, input.fragmentId, new Date().toISOString()],
  );
}

export async function detachFragmentFromNode(input: {
  documentId: number;
  nodeId: number;
  fragmentId: number;
}) {
  const db = getDatabase();
  await db.exec(
    "DELETE FROM document_fragment_refs WHERE document_id = ? AND document_node_id = ? AND fragment_id = ?",
    [input.documentId, input.nodeId, input.fragmentId],
  );
}
