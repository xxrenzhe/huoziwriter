import { buildSuggestedEvidenceItems } from "@/lib/article-evidence";
import { recomputeAndPersistArticleOutcome } from "@/lib/article-outcome-runtime";
import { ensureUserSession } from "@/lib/auth";
import { getArticleStageArtifact } from "@/lib/article-stage-artifacts";
import { getArticleNodes } from "@/lib/article-outline";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleEvidenceItems, replaceArticleEvidenceItems, type ArticleEvidenceItem } from "@/lib/repositories";

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildEvidenceItemSignature(item: Partial<ArticleEvidenceItem>) {
  return JSON.stringify({
    fragmentId: Number(item.fragmentId || 0) || 0,
    nodeId: Number(item.nodeId || 0) || 0,
    claim: getString(item.claim),
    title: getString(item.title),
    excerpt: getString(item.excerpt),
    sourceType: getString(item.sourceType),
    sourceUrl: getString(item.sourceUrl),
    screenshotPath: getString(item.screenshotPath),
    usageMode: getString(item.usageMode),
    rationale: getString(item.rationale),
    researchTag: getString(item.researchTag),
    evidenceRole: getString(item.evidenceRole),
  });
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
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
  const suggested = buildSuggestedEvidenceItems({
    nodes,
    factCheckPayload: factCheckArtifact?.payload ?? null,
  });
  const prioritizedItems = suggested.filter((item) => {
    const researchTag = String(item.researchTag || "").trim();
    const evidenceRole = String(item.evidenceRole || "").trim();
    return Boolean(researchTag) || evidenceRole === "counterEvidence";
  });
  const candidateItems = prioritizedItems.length > 0 ? prioritizedItems : suggested;
  if (candidateItems.length === 0) {
    return fail("当前还没有可写回证据包的研究导向建议。", 400);
  }

  const merged = [...evidenceItems];
  const existingKeys = new Set(evidenceItems.map(buildEvidenceItemSignature));
  let appendedCount = 0;
  for (const item of candidateItems) {
    const signature = buildEvidenceItemSignature(item);
    if (existingKeys.has(signature)) {
      continue;
    }
    existingKeys.add(signature);
    appendedCount += 1;
    merged.push({
      ...item,
      id: item.id > 0 ? item.id : 0,
      articleId: article.id,
      userId: session.userId,
      sortOrder: merged.length + 1,
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
    items: saved,
    appendedCount,
    counterEvidenceCount: candidateItems.filter((item) => String(item.evidenceRole || "").trim() === "counterEvidence").length,
  });
}
