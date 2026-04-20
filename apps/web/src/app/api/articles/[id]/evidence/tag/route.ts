import { tagEvidenceItemHooks } from "@/lib/article-evidence";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleEvidenceItems, replaceArticleEvidenceItems } from "@/lib/repositories";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await ensureUserSession();
  if (!session) {
    return fail("未登录", 401);
  }

  const article = await getArticleById(Number(params.id), session.userId);
  if (!article) {
    return fail("稿件不存在", 404);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const selectedIds = new Set(
      Array.isArray((body as Record<string, unknown>).evidenceIds)
        ? ((body as Record<string, unknown>).evidenceIds as unknown[]).map((item) => Number(item || 0)).filter((item) => item > 0)
        : [],
    );

    const evidenceItems = await getArticleEvidenceItems(article.id, session.userId);
    if (evidenceItems.length === 0) {
      return fail("当前还没有可标注的证据。", 400);
    }

    let taggedCount = 0;
    const nextItems = evidenceItems.map((item) => {
      if (selectedIds.size > 0 && !selectedIds.has(item.id)) {
        return item;
      }
      taggedCount += 1;
      return tagEvidenceItemHooks(item, "ai");
    });

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

    return ok({
      items: saved,
      taggedCount,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "证据爆点标注失败", 400);
  }
}
