import { refreshAuthorOutcomeFeedbackLedger } from "@/lib/author-outcome-feedback-ledger";
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

function normalizeExpressionFeedback(value: unknown) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const unlikeMe = Boolean(record.unlikeMe);
  const normalized = {
    likeMe: unlikeMe ? false : Boolean(record.likeMe),
    unlikeMe,
    tooHard: Boolean(record.tooHard),
    tooSoft: Boolean(record.tooSoft),
    tooTutorial: Boolean(record.tooTutorial),
    tooCommentary: Boolean(record.tooCommentary),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
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
    expressionFeedback: body.expressionFeedback === undefined ? undefined : normalizeExpressionFeedback(body.expressionFeedback),
    reviewSummary: body.reviewSummary === undefined ? undefined : String(body.reviewSummary || "").trim() || null,
    nextAction: body.nextAction === undefined ? undefined : String(body.nextAction || "").trim() || null,
    playbookTags: Array.isArray(body.playbookTags)
      ? body.playbookTags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : undefined,
  });
  const feedbackLedger = await refreshAuthorOutcomeFeedbackLedger({
    userId: session.userId,
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
    feedbackLedger,
  });
}
