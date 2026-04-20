import { applyFourPointReverseWriteback, buildFourPointAudit, hasStrategyLockInputsChanged, type FourPointAuditDimension } from "@/lib/article-strategy";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getArticleById, getArticleStrategyCard, upsertArticleStrategyCard } from "@/lib/repositories";
import { mergeStrategyCardPatch } from "../shared";

function normalizeDimension(value: unknown): FourPointAuditDimension | null {
  const normalized = String(value || "").trim();
  if (normalized === "cognitiveFlip" || normalized === "readerSnapshot" || normalized === "coreTension" || normalized === "impactVector") {
    return normalized;
  }
  return null;
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
    const body = await request.json();
    const dimension = normalizeDimension((body as Record<string, unknown>).dimension);
    const text = String((body as Record<string, unknown>).text || "").trim();
    if (!dimension) {
      return fail("缺少有效的四元维度。", 400);
    }
    if (!text) {
      return fail("反写内容不能为空。", 400);
    }

    const strategyCard = await getArticleStrategyCard(article.id, session.userId);
    if (!strategyCard) {
      return fail("策略卡不存在", 404);
    }

    const patch = applyFourPointReverseWriteback(strategyCard, {
      dimension,
      text,
    });
    const nextStrategyCard = mergeStrategyCardPatch(strategyCard, patch);
    const fourPointAudit = buildFourPointAudit(nextStrategyCard);
    const shouldClearLock = hasStrategyLockInputsChanged(strategyCard, nextStrategyCard);
    const saved = await upsertArticleStrategyCard({
      articleId: article.id,
      userId: session.userId,
      ...patch,
      fourPointAudit,
      strategyLockedAt: shouldClearLock ? null : strategyCard.strategyLockedAt,
      strategyOverride: shouldClearLock ? false : strategyCard.strategyOverride,
    });

    return ok({
      appliedFields: Object.keys(patch),
      strategyCard: saved,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "笔尖视角反写失败", 400);
  }
}
