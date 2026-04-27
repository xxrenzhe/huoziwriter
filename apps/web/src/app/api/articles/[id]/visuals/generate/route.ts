import { ensureUserSession } from "@/lib/auth";
import { generateArticleVisualAsset } from "@/lib/article-image-generator";
import { insertArticleVisualAssetsIntoMarkdown } from "@/lib/article-image-inserter";
import { fail, ok } from "@/lib/http";
import { planArticleVisualBriefs } from "@/lib/article-visual-planner";
import { listArticleVisualBriefs, replaceArticleVisualBriefs } from "@/lib/article-visual-repository";
import { getArticleById } from "@/lib/repositories";
import type { ArticleVisualScope } from "@/lib/article-visual-types";

function normalizeScope(value: unknown): ArticleVisualScope | "all" {
  if (value === "cover" || value === "inline" || value === "infographic" || value === "diagram") return value;
  return "all";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) return fail("未登录", 401);
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) return fail("稿件不存在", 404);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const scope = normalizeScope(body.scope);
  const insert = body.insert === true;
  let briefs = await listArticleVisualBriefs(session.userId, article.id);
  if (briefs.length === 0 || body.replan === true) {
    const planned = await planArticleVisualBriefs({
      userId: session.userId,
      articleId: article.id,
      title: article.title,
      markdown: article.markdown_content,
      includeCover: scope === "all" || scope === "cover",
      includeInline: scope === "all" || scope !== "cover",
      outputResolution: typeof body.outputResolution === "string" ? body.outputResolution : null,
    });
    briefs = await replaceArticleVisualBriefs({
      userId: session.userId,
      articleId: article.id,
      briefs: planned,
    });
  }

  const selected = briefs
    .filter((brief) => scope === "all" || brief.visualScope === scope || (scope === "inline" && (brief.visualScope === "infographic" || brief.visualScope === "diagram")))
    .filter((brief) => body.force === true || brief.status !== "generated" && brief.status !== "inserted");
  const results = [];
  const warnings: string[] = [];

  for (const brief of selected) {
    try {
      results.push(await generateArticleVisualAsset(brief));
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片生成失败";
      if (brief.visualScope === "cover") {
        return fail(message, 502);
      }
      warnings.push(`${brief.title}: ${message}`);
    }
  }

  const insertion = insert
    ? await insertArticleVisualAssetsIntoMarkdown({
        userId: session.userId,
        articleId: article.id,
        title: article.title,
        markdown: article.markdown_content,
      })
    : null;

  return ok({
    generated: results,
    warnings,
    inserted: insertion?.inserted || [],
  });
}
