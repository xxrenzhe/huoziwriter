import { ensureUserSession } from "@/lib/auth";
import { getSavedDocumentHistoryReferences, suggestDocumentHistoryReferences } from "@/lib/document-history-references";
import { fail, ok } from "@/lib/http";
import { assertHistoryReferenceAllowed } from "@/lib/plan-access";
import { getDocumentById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
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
    const [suggestions, saved] = await Promise.all([
      suggestDocumentHistoryReferences({
        userId: session.userId,
        documentId: document.id,
        currentTitle: document.title,
        currentMarkdown: document.markdown_content,
      }),
      getSavedDocumentHistoryReferences(document.id),
    ]);
    return ok({
      suggestions,
      saved: saved.map((item) => ({
        referencedDocumentId: item.referenced_document_id,
        title: item.title,
        relationReason: item.relation_reason,
        bridgeSentence: item.bridge_sentence,
        sortOrder: item.sort_order,
      })),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "历史文章建议加载失败", 400);
  }
}
