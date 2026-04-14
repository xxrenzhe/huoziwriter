import { ensureUserSession } from "@/lib/auth";
import { getDocumentAuthoringStyleContext } from "@/lib/document-authoring-style-context";
import { getDatabase } from "@/lib/db";
import { getDocumentNodes } from "@/lib/document-outline";
import { fail, ok } from "@/lib/http";
import { buildNodeVisualSuggestion } from "@/lib/image-prompting";
import { getDocumentById, getDocumentImagePrompts } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const prompts = await getDocumentImagePrompts(session.userId, document.id);
  return ok(
    prompts.map((item) => ({
      id: item.id,
      documentNodeId: item.document_node_id,
      assetType: item.asset_type,
      title: item.title,
      prompt: item.prompt,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  );
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const nodes = await getDocumentNodes(document.id);
  const authoringContext = await getDocumentAuthoringStyleContext(session.userId);
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const node of nodes.filter((item) => item.title.trim())) {
    const prompt = buildNodeVisualSuggestion({
      documentTitle: document.title,
      nodeTitle: node.title,
      nodeDescription: node.description,
      fragments: node.fragments.map((fragment) => ({ distilledContent: fragment.distilledContent })),
      authoringContext,
    });
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM document_image_prompts
       WHERE user_id = ? AND document_id = ? AND document_node_id = ? AND asset_type = ?`,
      [session.userId, document.id, node.id, "inline"],
    );
    if (existing) {
      await db.exec(
        `UPDATE document_image_prompts
         SET title = ?, prompt = ?, updated_at = ?
         WHERE id = ?`,
        [node.title, prompt, now, existing.id],
      );
    } else {
      await db.exec(
        `INSERT INTO document_image_prompts (user_id, document_id, document_node_id, asset_type, title, prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [session.userId, document.id, node.id, "inline", node.title, prompt, now, now],
      );
    }
  }
  const prompts = await getDocumentImagePrompts(session.userId, document.id);
  return ok(
    prompts.map((item) => ({
      id: item.id,
      documentNodeId: item.document_node_id,
      assetType: item.asset_type,
      title: item.title,
      prompt: item.prompt,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  );
}
