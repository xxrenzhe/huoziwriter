import { recomputeAndPersistArticleOutcome } from "@/lib/article-outcome-runtime";
import { ensureUserSession } from "@/lib/auth";
import { buildEvidenceItemsFromXEvidenceBoard, buildXEvidenceBoard } from "@/lib/x-evidence-board";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleEvidenceItems, replaceArticleEvidenceItems, type ArticleEvidenceItem } from "@/lib/repositories";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function buildEvidenceItemSignature(item: Partial<ArticleEvidenceItem>) {
  return JSON.stringify({
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getString(item.claim),
    title: getString(item.title),
    excerpt: getString(item.excerpt),
    sourceType: getString(item.sourceType),
    sourceUrl: getString(item.sourceUrl),
    evidenceRole: getString(item.evidenceRole),
  });
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

  const body = await request.json().catch(() => ({}));
  const title = getString((body as Record<string, unknown>).title);
  const summary = getString((body as Record<string, unknown>).summary) || null;
  const sourceUrl = getString((body as Record<string, unknown>).sourceUrl) || null;
  const sourceMeta = getRecord((body as Record<string, unknown>).sourceMeta);
  const nodeId = Number((body as Record<string, unknown>).nodeId || 0) || null;
  if (!title || !sourceUrl || !sourceMeta) {
    return fail("导入 X 证据需要 title、sourceUrl 和 sourceMeta", 400);
  }

  const board = await buildXEvidenceBoard({
    title,
    summary,
    sourceUrl,
    sourceMeta,
  });
  const candidateItems = buildEvidenceItemsFromXEvidenceBoard({
    board,
    sourceUrl,
    nodeId,
  });
  if (candidateItems.length === 0) {
    return fail("当前 X 话题还没有形成可导入的证据条目。", 400);
  }

  const existing = await getArticleEvidenceItems(article.id, session.userId);
  const merged = [...existing];
  const signatures = new Set(existing.map(buildEvidenceItemSignature));
  let appendedCount = 0;
  for (const item of candidateItems) {
    const signature = buildEvidenceItemSignature(item);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    appendedCount += 1;
    merged.push({
      ...item,
      id: 0,
      articleId: article.id,
      userId: session.userId,
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
      hookTags: Array.isArray(item.hookTags) ? item.hookTags.map((tag) => getString(tag)).filter(Boolean) : [],
      hookStrength: typeof item.hookStrength === "number" ? item.hookStrength : null,
      hookTaggedBy: getString(item.hookTaggedBy) || null,
      hookTaggedAt: getString(item.hookTaggedAt) || null,
      evidenceRole: getString(item.evidenceRole) || "supportingEvidence",
      sortOrder: merged.length + 1,
      createdAt: getString(item.createdAt) || "",
      updatedAt: getString(item.updatedAt) || "",
    });
  }
  const saved = await replaceArticleEvidenceItems({
    articleId: article.id,
    userId: session.userId,
    items: merged.map((item, index) => ({
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
      evidenceRole: getString(item.evidenceRole) || "supportingEvidence",
      sortOrder: index + 1,
    })),
  });

  await recomputeAndPersistArticleOutcome({
    articleId: article.id,
    userId: session.userId,
  });

  return ok({
    board,
    items: saved,
    appendedCount,
  });
}
