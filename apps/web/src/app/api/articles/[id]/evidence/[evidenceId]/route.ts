import { ensureUserSession } from "@/lib/auth";
import { recomputeAndPersistArticleOutcome } from "@/lib/article-outcome-runtime";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleEvidenceItems, replaceArticleEvidenceItems } from "@/lib/repositories";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildEvidenceSignature(input: {
  fragmentId?: number | null;
  nodeId?: number | null;
  claim?: string | null;
  title?: string | null;
  excerpt?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  screenshotPath?: string | null;
  usageMode?: string | null;
  rationale?: string | null;
  researchTag?: string | null;
  evidenceRole?: string | null;
}) {
  return JSON.stringify({
    fragmentId: Number(input.fragmentId || 0) || 0,
    nodeId: Number(input.nodeId || 0) || 0,
    claim: getString(input.claim),
    title: getString(input.title),
    excerpt: getString(input.excerpt),
    sourceType: getString(input.sourceType),
    sourceUrl: getString(input.sourceUrl),
    screenshotPath: getString(input.screenshotPath),
    usageMode: getString(input.usageMode),
    rationale: getString(input.rationale),
    researchTag: getString(input.researchTag),
    evidenceRole: getString(input.evidenceRole),
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string; evidenceId: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  try {
    const evidenceId = Number(params.evidenceId);
    if (!Number.isFinite(evidenceId) || evidenceId <= 0) {
      return fail("无效的证据 ID", 400);
    }

    const body = await request.json();
    const evidenceItems = await getArticleEvidenceItems(article.id, session.userId);
    const target = evidenceItems.find((item) => item.id === evidenceId);
    if (!target) {
      return fail("证据不存在", 404);
    }

    const nextItems = evidenceItems.map((item) =>
      item.id !== evidenceId
        ? item
        : {
            ...item,
            hookTags: Array.isArray((body as Record<string, unknown>).hookTags)
              ? ((body as Record<string, unknown>).hookTags as unknown[])
                  .map((tag) => getString(tag))
                  .filter(Boolean)
                  .slice(0, 4)
              : item.hookTags,
            hookStrength:
              typeof (body as Record<string, unknown>).hookStrength === "number" && Number.isFinite((body as Record<string, unknown>).hookStrength)
                ? Number((body as Record<string, unknown>).hookStrength)
                : item.hookStrength,
            hookTaggedBy: "author",
            hookTaggedAt: new Date().toISOString(),
          },
    );
    const updatedCandidate = nextItems.find((item) => item.id === evidenceId) ?? target;
    const updatedSignature = buildEvidenceSignature(updatedCandidate);

    const saved = await replaceArticleEvidenceItems({
      articleId: article.id,
      userId: session.userId,
      items: nextItems.map((item, index) => ({
        fragmentId: Number(item.fragmentId || 0) || null,
        nodeId: Number(item.nodeId || 0) || null,
        claim: getString(item.claim) || null,
        title: getString(item.title),
        excerpt: getString(item.excerpt),
        sourceType: getString(item.sourceType) || "manual",
        sourceUrl: getString(item.sourceUrl) || null,
        screenshotPath: getString(item.screenshotPath) || null,
        usageMode: getString(item.usageMode) || null,
        rationale: getString(item.rationale) || null,
        researchTag: getString(item.researchTag) || null,
        hookTags: Array.isArray(item.hookTags) ? item.hookTags : [],
        hookStrength: typeof item.hookStrength === "number" && Number.isFinite(item.hookStrength) ? item.hookStrength : null,
        hookTaggedBy: getString(item.hookTaggedBy) || null,
        hookTaggedAt: getString(item.hookTaggedAt) || null,
        evidenceRole: getString(item.evidenceRole) || "supportingEvidence",
        sortOrder: index + 1,
      })),
    });
    await recomputeAndPersistArticleOutcome({
      articleId: article.id,
      userId: session.userId,
    });

    const updated = saved.find((item) => buildEvidenceSignature(item) === updatedSignature) ?? null;
    return ok(updated);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "证据爆点标签更新失败", 400);
  }
}
