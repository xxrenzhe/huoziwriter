import { ensureUserSession } from "@/lib/auth";
import { deleteArticleNode, updateArticleNode } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { getArticleById } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const body = await request.json();
  await updateArticleNode({
    articleId: article.id,
    nodeId: Number(params.nodeId),
    title: body.title,
    description: body.description,
  });
  return ok({ updated: true });
}

export async function DELETE(_: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  await deleteArticleNode(article.id, Number(params.nodeId));
  return ok({ deleted: true });
}
