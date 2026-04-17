import { getDatabase } from "./db";

const DEFAULT_NODE_TITLES = ["痛点引入", "核心反转", "底层原因", "行动建议"];

function mapArticleNodeRecord(node: {
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
    articleId: node.document_id,
    parentNodeId: node.parent_node_id,
    title: node.title,
    description: node.description,
    sortOrder: node.sort_order,
    createdAt: node.created_at,
    updatedAt: node.updated_at,
  };
}

export async function getArticleNodes(articleId: number) {
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
  }>("SELECT * FROM document_nodes WHERE document_id = ? ORDER BY sort_order ASC, id ASC", [articleId]);

  const refs = await db.query<{
    document_node_id: number;
    fragment_id: number;
    usage_mode: string | null;
    user_id: number;
    title: string | null;
    distilled_content: string;
    source_type: string;
    source_url: string | null;
    screenshot_path: string | null;
  }>(
    `SELECT r.document_node_id, f.id as fragment_id, r.usage_mode, f.user_id, f.title, f.distilled_content, f.source_type, f.source_url, f.screenshot_path
     FROM document_fragment_refs r
     INNER JOIN fragments f ON f.id = r.fragment_id
     WHERE r.document_id = ?
     ORDER BY r.id ASC`,
    [articleId],
  );

  return nodes.map((node) => ({
    ...mapArticleNodeRecord(node),
    fragments: refs
      .filter((ref) => ref.document_node_id === node.id)
      .map((ref) => ({
        id: ref.fragment_id,
        userId: ref.user_id,
        title: ref.title,
        distilledContent: ref.distilled_content,
        sourceType: ref.source_type,
        sourceUrl: ref.source_url,
        screenshotPath: ref.screenshot_path,
        usageMode: String(ref.usage_mode || "rewrite"),
      })),
  }));
}

export async function ensureDefaultArticleNodes(articleId: number) {
  const db = getDatabase();
  const count = await db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM document_nodes WHERE document_id = ?", [articleId]);
  if ((count?.count ?? 0) > 0) {
    return;
  }

  for (const [index, title] of DEFAULT_NODE_TITLES.entries()) {
    await db.exec(
      `INSERT INTO document_nodes (document_id, parent_node_id, title, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [articleId, null, title, null, index + 1, new Date().toISOString(), new Date().toISOString()],
    );
  }
}

export const ensureDefaultDocumentNodes = ensureDefaultArticleNodes;

export async function createArticleNode(input: {
  articleId: number;
  title: string;
  description?: string | null;
}) {
  const db = getDatabase();
  const maxSort = await db.queryOne<{ max_sort: number | null }>(
    "SELECT MAX(sort_order) as max_sort FROM document_nodes WHERE document_id = ?",
    [input.articleId],
  );
  const result = await db.exec(
    `INSERT INTO document_nodes (document_id, parent_node_id, title, description, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.articleId,
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
  return inserted ? mapArticleNodeRecord(inserted) : undefined;
}

export async function updateArticleNode(input: {
  nodeId: number;
  articleId: number;
  title?: string;
  description?: string | null;
  sortOrder?: number;
}) {
  const db = getDatabase();
  const current = await db.queryOne<{ title: string; description: string | null; sort_order: number }>(
    "SELECT title, description, sort_order FROM document_nodes WHERE id = ? AND document_id = ?",
    [input.nodeId, input.articleId],
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
      input.articleId,
    ],
  );
}

export async function reorderArticleNodes(articleId: number, nodeIds: number[]) {
  for (const [index, nodeId] of nodeIds.entries()) {
    await updateArticleNode({ articleId, nodeId, sortOrder: index + 1 });
  }
}

export async function deleteArticleNode(articleId: number, nodeId: number) {
  const db = getDatabase();
  await db.exec("DELETE FROM document_fragment_refs WHERE document_id = ? AND document_node_id = ?", [articleId, nodeId]);
  await db.exec("DELETE FROM document_nodes WHERE document_id = ? AND id = ?", [articleId, nodeId]);
}

export async function attachFragmentToArticleNode(input: {
  articleId: number;
  nodeId: number;
  fragmentId: number;
  usageMode?: "rewrite" | "image";
}) {
  const db = getDatabase();
  await db.exec(
    `INSERT INTO document_fragment_refs (document_id, document_node_id, fragment_id, usage_mode, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(document_node_id, fragment_id) DO UPDATE SET usage_mode = excluded.usage_mode`,
    [input.articleId, input.nodeId, input.fragmentId, input.usageMode ?? "rewrite", new Date().toISOString()],
  );
}

export async function detachFragmentFromArticleNode(input: {
  articleId: number;
  nodeId: number;
  fragmentId: number;
}) {
  const db = getDatabase();
  await db.exec(
    "DELETE FROM document_fragment_refs WHERE document_id = ? AND document_node_id = ? AND fragment_id = ?",
    [input.articleId, input.nodeId, input.fragmentId],
  );
}

export async function syncArticleNodesFromOutline(input: {
  articleId: number;
  sections: Array<{
    heading: string;
    goal?: string | null;
    keyPoints?: string[];
    evidenceHints?: string[];
    transition?: string | null;
  }>;
}) {
  const normalizedSections = input.sections
    .map((section) => {
      const heading = String(section.heading || "").trim();
      if (!heading) {
        return null;
      }
      const descriptionParts = [
        String(section.goal || "").trim() ? `目标：${String(section.goal || "").trim()}` : null,
        Array.isArray(section.keyPoints) && section.keyPoints.length ? `关键点：${section.keyPoints.map((item) => String(item).trim()).filter(Boolean).join("；")}` : null,
        Array.isArray(section.evidenceHints) && section.evidenceHints.length ? `证据提示：${section.evidenceHints.map((item) => String(item).trim()).filter(Boolean).join("；")}` : null,
        String(section.transition || "").trim() ? `衔接：${String(section.transition || "").trim()}` : null,
      ].filter(Boolean);
      return {
        heading,
        description: descriptionParts.join("\n"),
      };
    })
    .filter(Boolean) as Array<{ heading: string; description: string }>;

  if (normalizedSections.length === 0) {
    throw new Error("大纲产物里没有可同步的章节");
  }

  const existingNodes = await getArticleNodes(input.articleId);
  const keepCount = Math.min(existingNodes.length, normalizedSections.length);

  for (let index = 0; index < keepCount; index += 1) {
    await updateArticleNode({
      articleId: input.articleId,
      nodeId: existingNodes[index].id,
      title: normalizedSections[index].heading,
      description: normalizedSections[index].description || null,
      sortOrder: index + 1,
    });
  }

  if (normalizedSections.length > existingNodes.length) {
    for (let index = existingNodes.length; index < normalizedSections.length; index += 1) {
      const created = await createArticleNode({
        articleId: input.articleId,
        title: normalizedSections[index].heading,
        description: normalizedSections[index].description || null,
      });
      if (created) {
        await updateArticleNode({
          articleId: input.articleId,
          nodeId: created.id,
          sortOrder: index + 1,
        });
      }
    }
  }

  if (existingNodes.length > normalizedSections.length) {
    for (let index = normalizedSections.length; index < existingNodes.length; index += 1) {
      await deleteArticleNode(input.articleId, existingNodes[index].id);
    }
  }

  return getArticleNodes(input.articleId);
}
