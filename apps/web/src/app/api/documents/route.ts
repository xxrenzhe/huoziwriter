import { assertAuthorPersonaReady } from "@/lib/author-personas";
import { createDocument, getDocumentsByUser } from "@/lib/repositories";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";

export async function GET() {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  const documents = await getDocumentsByUser(session.userId);
  return ok(
    documents.map((document) => ({
      id: document.id,
      title: document.title,
      markdownContent: document.markdown_content,
      htmlContent: document.html_content,
      status: document.status,
      updatedAt: document.updated_at,
      createdAt: document.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }
  try {
    await assertAuthorPersonaReady(session.userId);
    const body = await request.json();
    const document = await createDocument(session.userId, body.title || "未命名文稿");
    return ok({
      id: document?.id,
      title: document?.title,
      status: document?.status,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "创建文稿失败", 400);
  }
}
