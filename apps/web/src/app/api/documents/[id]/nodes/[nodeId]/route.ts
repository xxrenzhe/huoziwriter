import { ensureUserSession } from "@/lib/auth";
import { deleteDocumentNode, updateDocumentNode } from "@/lib/document-outline";
import { fail, ok } from "@/lib/http";
import { getDocumentById } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const body = await request.json();
  await updateDocumentNode({
    documentId: document.id,
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
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  await deleteDocumentNode(document.id, Number(params.nodeId));
  return ok({ deleted: true });
}
