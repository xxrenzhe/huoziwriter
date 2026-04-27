import { ensureUserSession } from "@/lib/auth";
import { planArticleVisualBriefs } from "@/lib/article-visual-planner";
import { replaceArticleVisualBriefs } from "@/lib/article-visual-repository";
import { getDatabase } from "@/lib/db";
import { fail, ok } from "@/lib/http";
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
      status: item.status,
      insertAnchor: item.insert_anchor,
      altText: item.alt_text,
      caption: item.caption,
      visualBriefId: item.visual_brief_id,
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
  const planned = await planArticleVisualBriefs({
    userId: session.userId,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
    includeCover: true,
    includeInline: true,
  });
  const briefs = await replaceArticleVisualBriefs({
    userId: session.userId,
    articleId: article.id,
    briefs: planned,
  });
  const db = getDatabase();
  const now = new Date().toISOString();
  for (const brief of briefs.filter((item) => item.visualScope !== "cover" && item.articleNodeId)) {
    const existing = await db.queryOne<{ id: number }>(
      `SELECT id
       FROM article_image_prompts
       WHERE user_id = ? AND article_id = ? AND article_node_id = ? AND asset_type = ?`,
      [session.userId, article.id, brief.articleNodeId, brief.visualScope],
    );
    if (existing) {
      await db.exec(
        `UPDATE article_image_prompts
         SET title = ?, prompt = ?, visual_brief_id = ?, status = ?, insert_anchor = ?, alt_text = ?, caption = ?, updated_at = ?
         WHERE id = ?`,
        [
          brief.title,
          brief.promptText || "",
          brief.id ?? null,
          brief.status || "prompt_ready",
          brief.targetAnchor,
          brief.altText,
          brief.caption ?? null,
          now,
          existing.id,
        ],
      );
    } else {
      await db.exec(
        `INSERT INTO article_image_prompts (
          user_id, article_id, article_node_id, asset_type, title, prompt, visual_brief_id, status,
          insert_anchor, alt_text, caption, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.userId,
          article.id,
          brief.articleNodeId,
          brief.visualScope,
          brief.title,
          brief.promptText || "",
          brief.id ?? null,
          brief.status || "prompt_ready",
          brief.targetAnchor,
          brief.altText,
          brief.caption ?? null,
          now,
          now,
        ],
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
      status: item.status,
      insertAnchor: item.insert_anchor,
      altText: item.alt_text,
      caption: item.caption,
      visualBriefId: item.visual_brief_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  );
}
