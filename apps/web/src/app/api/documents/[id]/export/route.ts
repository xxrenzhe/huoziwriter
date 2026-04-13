import { ensureUserSession, findUserById } from "@/lib/auth";
import { fail } from "@/lib/http";
import { assertPdfExportAllowed } from "@/lib/plan-access";
import { buildExportFilename, renderDocumentPdf } from "@/lib/pdf";
import { getDocumentById } from "@/lib/repositories";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const document = await getDocumentById(Number(params.id), session.userId);
  if (!document) {
    return fail("文稿不存在", 404);
  }

  const format = new URL(request.url).searchParams.get("format") || "markdown";
  if (format === "markdown") {
    return new Response(document.markdown_content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(document.title, "md")}"`,
      },
    });
  }

  if (format === "html") {
    return new Response(document.html_content || "", {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(document.title, "html")}"`,
      },
    });
  }

  if (format === "pdf") {
    try {
      await assertPdfExportAllowed(session.userId);
      const user = await findUserById(session.userId);
      const bytes = await renderDocumentPdf({
        title: document.title,
        markdownContent: document.markdown_content,
        updatedAt: document.updated_at,
        authorName: user?.display_name || user?.username || session.username,
        watermarkText: "Huozi Writer",
      });
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${buildExportFilename(document.title, "pdf")}"`,
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "PDF 导出失败", 400);
    }
  }

  return fail("不支持的导出格式", 400);
}
