import { ensureUserSession } from "@/lib/auth";
import { createArticleNode, getArticleNodes, reorderArticleNodes } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { getArticleById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  return ok(await getArticleNodes(article.id));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const body = await request.json();
  const node = await createArticleNode({
    articleId: article.id,
    title: body.title || "未命名节点",
    description: body.description || null,
  });
  return ok(node);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const body = await request.json();
  await reorderArticleNodes(article.id, body.nodeIds || []);
  return ok({ reordered: true });
}
