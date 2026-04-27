import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { planArticleVisualBriefs } from "@/lib/article-visual-planner";
import { listArticleVisualAssets, listArticleVisualBriefs, replaceArticleVisualBriefs } from "@/lib/article-visual-repository";
import { getArticleById } from "@/lib/repositories";

function briefToResponse(item: Awaited<ReturnType<typeof listArticleVisualBriefs>>[number]) {
  return {
    id: item.id,
    articleNodeId: item.articleNodeId,
    visualScope: item.visualScope,
    targetAnchor: item.targetAnchor,
    baoyuSkill: item.baoyuSkill,
    visualType: item.visualType,
    layoutCode: item.layoutCode,
    styleCode: item.styleCode,
    paletteCode: item.paletteCode,
    renderingCode: item.renderingCode,
    textLevel: item.textLevel,
    moodCode: item.moodCode,
    fontCode: item.fontCode,
    aspectRatio: item.aspectRatio,
    outputResolution: item.outputResolution,
    title: item.title,
    purpose: item.purpose,
    altText: item.altText,
    caption: item.caption,
    labels: item.labels,
    sourceFacts: item.sourceFacts,
    prompt: item.promptText,
    negativePrompt: item.negativePrompt,
    promptHash: item.promptHash,
    promptManifest: item.promptManifest,
    status: item.status,
    errorMessage: item.errorMessage,
    generatedAssetFileId: item.generatedAssetFileId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) return fail("未登录", 401);
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) return fail("稿件不存在", 404);

  const [briefs, assets] = await Promise.all([
    listArticleVisualBriefs(session.userId, article.id),
    listArticleVisualAssets(session.userId, article.id),
  ]);
  return ok({
    briefs: briefs.map(briefToResponse),
    assets,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) return fail("未登录", 401);
  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) return fail("稿件不存在", 404);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const briefs = await planArticleVisualBriefs({
    userId: session.userId,
    articleId: article.id,
    title: article.title,
    markdown: article.markdown_content,
    includeCover: body.includeCover !== false,
    includeInline: body.includeInline !== false,
    outputResolution: typeof body.outputResolution === "string" ? body.outputResolution : null,
  });
  const saved = await replaceArticleVisualBriefs({
    userId: session.userId,
    articleId: article.id,
    briefs,
  });
  return ok({
    briefs: saved.map(briefToResponse),
  });
}
