import { ensureUserSession } from "@/lib/auth";
import { replaceDocumentHistoryReferences } from "@/lib/document-history-references";
import { fail, ok } from "@/lib/http";
import { assertHistoryReferenceAllowed } from "@/lib/plan-access";
import { getDocumentById } from "@/lib/repositories";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertHistoryReferenceAllowed(session.userId);
    const document = await getDocumentById(Number(params.id), session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }
    const body = await request.json();
    const references = Array.isArray(body.references)
      ? body.references as Array<{
          referencedDocumentId?: unknown;
          relationReason?: unknown;
          bridgeSentence?: unknown;
        }>
      : [];
    const saved = await replaceDocumentHistoryReferences({
      userId: session.userId,
      documentId: document.id,
      references: references.map((item) => ({
        referencedDocumentId: Number(item.referencedDocumentId),
        relationReason: item.relationReason ? String(item.relationReason) : null,
        bridgeSentence: item.bridgeSentence ? String(item.bridgeSentence) : null,
      })),
    });
    return ok(saved.map((item) => ({
      referencedDocumentId: item.referenced_document_id,
      title: item.title,
      relationReason: item.relation_reason,
      bridgeSentence: item.bridge_sentence,
      sortOrder: item.sort_order,
    })));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "历史文章自然引用保存失败", 400);
  }
}
