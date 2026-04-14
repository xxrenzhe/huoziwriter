import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { ensureUserSession } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getStyleExtractDailyLimit, getUserPlanContext, getWritingStyleProfileLimit } from "@/lib/plan-access";
import { extractWritingStyleFromUrl } from "@/lib/style-extractor";
import {
  getDailyStyleExtractUsage,
  getVisitorDailyStyleExtractUsage,
  incrementDailyStyleExtractUsage,
  incrementVisitorDailyStyleExtractUsage,
} from "@/lib/usage";

function resolveVisitorKey(request: NextRequest) {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!url) {
    return fail("文章链接不能为空", 400);
  }

  const session = await ensureUserSession(request);
  if (session) {
    try {
      const planContext = await getUserPlanContext(session.userId);
      const limit = getStyleExtractDailyLimit(planContext.effectivePlanCode);
      const used = await getDailyStyleExtractUsage(session.userId);
      if (used >= limit) {
        return fail(`当前套餐今日写作风格提取次数已达上限 ${limit} 次`, 400);
      }
      const analysis = await extractWritingStyleFromUrl(url);
      const nextUsed = await incrementDailyStyleExtractUsage(session.userId);
      return ok({
        ...analysis,
        quota: {
          used: nextUsed,
          limit,
          remaining: Math.max(limit - nextUsed, 0),
        },
        canSaveProfile: getWritingStyleProfileLimit(planContext.effectivePlanCode) > 0,
        viewerPlanCode: planContext.effectivePlanCode,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "写作风格提取失败", 400);
    }
  }

  try {
    const visitorKey = resolveVisitorKey(request);
    const used = await getVisitorDailyStyleExtractUsage(visitorKey);
    const limit = getStyleExtractDailyLimit(null);
    if (used >= limit) {
      return fail(`游客今日可免费提取 ${limit} 次，请明日再试或登录后继续。`, 400);
    }
    const analysis = await extractWritingStyleFromUrl(url);
    const nextUsed = await incrementVisitorDailyStyleExtractUsage(visitorKey);
    return ok({
      ...analysis,
      quota: {
        used: nextUsed,
        limit,
        remaining: Math.max(limit - nextUsed, 0),
      },
      canSaveProfile: false,
      viewerPlanCode: null,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "写作风格提取失败", 400);
  }
}
