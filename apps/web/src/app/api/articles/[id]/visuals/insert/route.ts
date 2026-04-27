import { ensureUserSession } from "@/lib/auth";
import { insertArticleVisualAssetsIntoMarkdown } from "@/lib/article-image-inserter";
import { fail, ok } from "@/lib/http";
import { getArticleById } from "@/lib/repositories";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) return fail("未登录", 401);
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) return fail("稿件不存在", 404);

  const inserted = await insertArticleVisualAssetsIntoMarkdown({
    userId: session.userId,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
  });
  return ok(inserted);
}
