import { ensureUserSession } from "@/lib/auth";
import { attachFragmentToNode, detachFragmentFromNode } from "@/lib/document-outline";
import { fail, ok } from "@/lib/http";
import { getDocumentById } from "@/lib/repositories";

export async function POST(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const body = await request.json();
  await attachFragmentToNode({
    documentId: document.id,
    nodeId: Number(params.nodeId),
    fragmentId: Number(body.fragmentId),
  });
  return ok({ attached: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string; nodeId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }
  const fragmentId = Number(new URL(request.url).searchParams.get("fragmentId"));
  await detachFragmentFromNode({
    documentId: document.id,
    nodeId: Number(params.nodeId),
    fragmentId,
  });
  return ok({ detached: true });
}
