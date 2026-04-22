import { buildSuggestedEvidenceItems } from "@/lib/article-evidence";
import { recomputeAndPersistArticleOutcome } from "@/lib/article-outcome-runtime";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { getArticleNodes } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleEvidenceItems, replaceArticleEvidenceItems } from "@/lib/repositories";

function sanitizeString(value: unknown) {
  return String(value || "").trim();
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  const [evidenceItems, nodes, factCheckArtifact] = await Promise.all([
    getArticleEvidenceItems(article.id, session.userId),
    getArticleNodes(article.id),
    getArticleStageArtifact(article.id, session.userId, "factCheck"),
  ]);

  return ok(
    buildSuggestedEvidenceItems({
      evidenceItems,
      nodes,
      factCheckPayload: factCheckArtifact?.payload ?? null,
    }),
  );
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  try {
    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = Array.isArray(body.items)
      ? rawItems
          .map((item: unknown) => (item && typeof item === "object" ? item as Record<string, unknown> : null))
          .filter(Boolean)
          .map((item: Record<string, unknown>) => ({
            fragmentId: Number(item?.fragmentId || 0) || null,
            nodeId: Number(item?.nodeId || 0) || null,
            claim: sanitizeString(item?.claim) || null,
            title: sanitizeString(item?.title),
            excerpt: sanitizeString(item?.excerpt),
            sourceType: sanitizeString(item?.sourceType) || "manual",
            sourceUrl: sanitizeString(item?.sourceUrl) || null,
            screenshotPath: sanitizeString(item?.screenshotPath) || null,
            usageMode: sanitizeString(item?.usageMode) || null,
            rationale: sanitizeString(item?.rationale) || null,
            researchTag: sanitizeString(item?.researchTag) || null,
            hookTags: Array.isArray(item?.hookTags) ? item.hookTags.map((tag) => sanitizeString(tag)).filter(Boolean).slice(0, 4) : [],
            hookStrength: typeof item?.hookStrength === "number" && Number.isFinite(item.hookStrength) ? item.hookStrength : null,
            hookTaggedBy: sanitizeString(item?.hookTaggedBy) || null,
            hookTaggedAt: sanitizeString(item?.hookTaggedAt) || null,
            evidenceRole: sanitizeString(item?.evidenceRole) || "supportingEvidence",
          }))
          .filter((item: { title: string; excerpt: string }) => item.title && item.excerpt)
          .slice(0, 20)
      : [];

    const evidenceItems = await replaceArticleEvidenceItems({
      articleId: article.id,
      userId: session.userId,
      items,
    });
    await recomputeAndPersistArticleOutcome({
      articleId: article.id,
      userId: session.userId,
    });
    return ok(evidenceItems);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "证据包保存失败", 400);
  }
}
