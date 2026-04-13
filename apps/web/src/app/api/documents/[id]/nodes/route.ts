import { ensureUserSession } from "@/lib/auth";
import { createDocumentNode, getDocumentNodes, reorderDocumentNodes } from "@/lib/document-outline";
import { fail, ok } from "@/lib/http";
import { getDocumentById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  return ok(await getDocumentNodes(document.id));
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const body = await request.json();
  const node = await createDocumentNode({
    documentId: document.id,
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
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const body = await request.json();
  await reorderDocumentNodes(document.id, body.nodeIds || []);
  return ok({ reordered: true });
}
