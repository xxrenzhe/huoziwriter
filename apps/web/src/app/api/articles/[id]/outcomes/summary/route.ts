import { resolveArticleOutcomeBundle } from "@/lib/article-outcomes";
import { computeArticleOutcomeRefresh } from "@/lib/article-outcome-runtime";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  getArticleById,
  getArticleOutcomeBundle,
  upsertArticleOutcome,
} from "@/lib/repositories";

function normalizeHitStatus(value: unknown): "pending" | "hit" | "near_miss" | "miss" {
  if (value === "hit" || value === "near_miss" || value === "miss") {
    return value;
  }
  return "pending";
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

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const computed = await computeArticleOutcomeRefresh({
    articleId: article.id,
    userId: session.userId,
  });
  if (!computed) {
    return fail("稿件不存在", 404);
  }

  await upsertArticleOutcome({
    articleId: article.id,
    userId: session.userId,
    targetPackage:
      body.targetPackage === undefined
        ? (computed.strategyCard ? (computed.strategyCard.targetPackage ?? null) : undefined)
        : String(body.targetPackage || "").trim() || null,
    scorecard: computed.scorecard,
    attribution: computed.attribution,
    hitStatus: body.hitStatus === undefined ? undefined : normalizeHitStatus(body.hitStatus),
    reviewSummary: body.reviewSummary === undefined ? undefined : String(body.reviewSummary || "").trim() || null,
    nextAction: body.nextAction === undefined ? undefined : String(body.nextAction || "").trim() || null,
    playbookTags: Array.isArray(body.playbookTags)
      ? body.playbookTags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : undefined,
  });

  const bundle = resolveArticleOutcomeBundle({
    articleId: article.id,
    userId: session.userId,
    bundle: await getArticleOutcomeBundle(article.id, session.userId),
    scorecard: computed.scorecard,
  });
  return ok({
    outcome: bundle.outcome,
    snapshots: bundle.snapshots,
    completedWindowCodes: bundle.completedWindowCodes,
    missingWindowCodes: bundle.missingWindowCodes,
    nextWindowCode: bundle.nextWindowCode,
  });
}
