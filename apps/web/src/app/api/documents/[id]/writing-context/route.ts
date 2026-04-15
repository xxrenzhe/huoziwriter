import { ensureUserSession } from "@/lib/auth";
import { getDocumentWritingContext } from "@/lib/document-writing-context";
import { fail, ok } from "@/lib/http";
import { getDocumentById } from "@/lib/repositories";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  try {
    const documentId = Number(params.id);
    const document = await getDocumentById(documentId, session.userId);
    if (!document) {
      return fail("文稿不存在", 404);
    }

    const context = await getDocumentWritingContext({
      userId: session.userId,
      documentId,
      title: document.title,
      markdownContent: document.markdown_content,
    });

    return ok(context);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作上下文加载失败", 400);
  }
}
