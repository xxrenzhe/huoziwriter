import { ensureUserSession, findUserById } from "@/lib/auth";
import { fail } from "@/lib/http";
import { assertPdfExportAllowed } from "@/lib/plan-access";
import { buildExportFilename, renderDocumentPdf } from "@/lib/pdf";
import { getArticleById } from "@/lib/repositories";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const format = new URL(request.url).searchParams.get("format") || "markdown";
  if (format === "markdown") {
    return new Response(article.markdown_content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(article.title, "md")}"`,
      },
    });
  }

  if (format === "html") {
    return new Response(article.html_content || "", {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${buildExportFilename(article.title, "html")}"`,
      },
    });
  }

  if (format === "pdf") {
    try {
      await assertPdfExportAllowed(session.userId);
      const user = await findUserById(session.userId);
      const bytes = await renderDocumentPdf({
        title: article.title,
        markdownContent: article.markdown_content,
        updatedAt: article.updated_at,
        authorName: user?.display_name || user?.username || session.username,
        watermarkText: "Huozi Writer",
      });
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${buildExportFilename(article.title, "pdf")}"`,
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "PDF 导出失败", 400);
    }
  }

  return fail("不支持的导出格式", 400);
}
