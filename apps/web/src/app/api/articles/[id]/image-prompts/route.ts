import { ensureUserSession } from "@/lib/auth";
import { getArticleAuthoringStyleContext } from "@/lib/article-authoring-style-context";
import { getDatabase } from "@/lib/db";
import { getArticleNodes } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { buildNodeVisualSuggestion } from "@/lib/image-prompting";
import { getArticleById, getArticleImagePrompts } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const prompts = await getArticleImagePrompts(session.userId, article.id);
  return ok(
    prompts.map((item) => ({
      id: item.id,
      articleNodeId: item.article_node_id,
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
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const nodes = await getArticleNodes(article.id);
  const authoringContext = await getArticleAuthoringStyleContext(session.userId, article.id);
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const node of nodes.filter((item) => item.title.trim())) {
    const prompt = buildNodeVisualSuggestion({
      articleTitle: article.title,
      nodeTitle: node.title,
      nodeDescription: node.description,
      fragments: node.fragments.map((fragment) => ({ distilledContent: fragment.distilledContent })),
      authoringContext,
    });
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM document_image_prompts
       WHERE user_id = ? AND document_id = ? AND document_node_id = ? AND asset_type = ?`,
      [session.userId, article.id, node.id, "inline"],
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
        [session.userId, article.id, node.id, "inline", node.title, prompt, now, now],
      );
    }
  }
  const prompts = await getArticleImagePrompts(session.userId, article.id);
  return ok(
    prompts.map((item) => ({
      id: item.id,
      articleNodeId: item.article_node_id,
      assetType: item.asset_type,
      title: item.title,
      prompt: item.prompt,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  );
}
