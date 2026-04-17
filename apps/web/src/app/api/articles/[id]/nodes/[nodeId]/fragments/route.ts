import { ensureUserSession } from "@/lib/auth";
import { attachFragmentToArticleNode, detachFragmentFromArticleNode } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { getArticleById } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const body = await request.json();
  await attachFragmentToArticleNode({
    articleId: article.id,
    nodeId: Number(params.nodeId),
    fragmentId: Number(body.fragmentId),
    usageMode: body.usageMode === "image" ? "image" : "rewrite",
  });
  return ok({ attached: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }
  const fragmentId = Number(new URL(request.url).searchParams.get("fragmentId"));
  await detachFragmentFromArticleNode({
    articleId: article.id,
    nodeId: Number(params.nodeId),
    fragmentId,
  });
  return ok({ detached: true });
}
